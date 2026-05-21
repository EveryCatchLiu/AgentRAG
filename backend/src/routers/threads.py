import json
import re
import threading
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.config import settings
from src.openai_client import create_llm_client
from src.supabase_client import supabase
from src.routers.chunks import search_chunks
from src.tools import TOOLS, execute_tool

router = APIRouter(prefix="/api/threads", tags=["threads"])

# Patterns for queries that likely need web search
WEB_SEARCH_PATTERNS = [
    r"天气", r"气温", r"下雨", r"刮风", r"温度", r"雾霾",
    r"新闻", r"最新", r"今天", r"明天", r"昨天", r"最近",
    r"股价", r"股票", r"汇率", r"比特币", r"加密",
    r"地震", r"台风", r"比赛", r"比分", r"赛事",
    r"疫情", r"政策", r"法规",
]
WEB_SEARCH_PATTERN = re.compile("|".join(WEB_SEARCH_PATTERNS), re.IGNORECASE)

NON_ANSWER_PATTERNS = [
    r"无法.*(?:回答|提供|获取|访问)",
    r"没有.*(?:联网|搜索|网络|信息)",
    r"(?:抱歉|对不起|sorry).*(?:无法|不能|没办法)",
    r"I (?:can'?t|cannot|don'?t).*(?:access|search|browse|internet|web)",
    r"(?:不知道|不清楚|不了解).*(?:天气|新闻|今天)",
]
NON_ANSWER_PATTERN = re.compile("|".join(NON_ANSWER_PATTERNS), re.IGNORECASE)


def _needs_web_search(query: str) -> bool:
    """Check if a query likely needs external/web information."""
    return bool(WEB_SEARCH_PATTERN.search(query))


def _is_non_answer(text: str) -> bool:
    """Check if the model's response is a refusal/non-answer."""
    return bool(NON_ANSWER_PATTERN.search(text))


def _execute_delegation(args: dict, call_id: str, llm_client, model: str) -> dict:
    """Execute delegate_to_subagent and return a structured tool call record with nested children."""
    from src.routers.chunks import get_full_document_text
    from src.agent import SubAgentExecutor

    task = args.get("task", "")
    file_ids = args.get("file_ids", [])

    if not file_ids:
        return {
            "id": call_id, "name": "delegate_to_subagent",
            "arguments": json.dumps(args, ensure_ascii=False),
            "result": "Error: No file IDs provided.", "status": "error",
        }

    full_text, file_meta = get_full_document_text(file_ids)
    if not full_text.strip():
        return {
            "id": call_id, "name": "delegate_to_subagent",
            "arguments": json.dumps(args, ensure_ascii=False),
            "result": f"Error: Documents not found for {file_ids}", "status": "error",
        }

    executor = SubAgentExecutor(
        llm_client=llm_client, model=model,
        task=task, full_text=full_text, file_metadata=file_meta,
    )
    result = executor.run()

    children = []
    for child in result.tool_calls:
        children.append({
            "id": child.id,
            "name": child.name,
            "arguments": child.arguments,
            "result": child.result,
            "status": child.status,
        })

    return {
        "id": call_id,
        "name": "delegate_to_subagent",
        "arguments": json.dumps(args, ensure_ascii=False),
        "result": result.answer[:2000],
        "status": "done",
        "children": children,
        "reasoning": result.reasoning if result.reasoning else None,
        "fileIds": file_ids,
        "task": task[:200],
    }


def _generate_thread_title(user_message: str, assistant_reply: str, thread_id: str, llm_client, model: str):
    """Generate a concise thread title from the first exchange and update the DB."""
    prompt = f"""Short title (3-8 words) for this conversation. Return ONLY the title:

User: {user_message[:300]}
Assistant: {assistant_reply[:300]}

Title:"""

    try:
        resp = llm_client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=500,
            temperature=0.3,
        )
        msg = resp.choices[0].message
        title = (msg.content or "").strip()

        # If thinking model consumed tokens in reasoning, try to extract from reasoning
        if not title:
            reasoning = getattr(msg, "reasoning_content", None) or ""
            # Look for a clear title-like line at the end of reasoning
            lines = reasoning.strip().split("\n")
            for line in reversed(lines):
                line = line.strip().strip('"').strip("'")
                if line and len(line) >= 3 and len(line) <= 80:
                    title = line
                    break

        title = title.strip('"').strip("'").strip()
        if len(title) > 80:
            title = title[:77] + "..."
        if title:
            supabase.table("threads").update({"title": title}).eq("id", thread_id).execute()
    except Exception:
        pass  # Title generation is best-effort, don't block on failure


SYSTEM_PROMPT = """你是一个智能助手。请遵循以下规则：

1. 首先检查【文档片段】中是否有相关信息。如果有，基于文档内容回答。
2. 当文档片段无法回答用户问题时（例如询问天气、新闻、实时信息等），使用 search_web 工具搜索网络。
3. 搜索后，**必须直接给出文字回答**，不要再调用工具。基于搜索结果用自己的话总结回答用户。
4. 当用户询问知识库统计信息时，使用 query_database 工具。
5. 不要编造信息。

文档片段：
{context}
"""


class CreateThreadRequest(BaseModel):
    title: str | None = None


class SendMessageRequest(BaseModel):
    content: str
    filter_file_ids: list[str] | None = None
    filter_topics: list[str] | None = None
    filter_doc_types: list[str] | None = None


@router.get("")
async def list_threads(user_id: str):
    """Get all threads for a user."""
    result = (
        supabase.table("threads")
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return result.data


@router.post("")
async def create_thread(request: CreateThreadRequest, user_id: str):
    """Create a new thread."""
    result = (
        supabase.table("threads")
        .insert({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "title": request.title or "New Thread",
        })
        .execute()
    )
    return result.data[0]


@router.get("/{thread_id}")
async def get_thread(thread_id: str, user_id: str):
    """Get a single thread by ID."""
    result = (
        supabase.table("threads")
        .select("*")
        .eq("id", thread_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Thread not found")
    return result.data[0]


@router.delete("/{thread_id}")
async def delete_thread(thread_id: str, user_id: str):
    """Delete a thread and its messages."""
    result = (
        supabase.table("threads")
        .select("*")
        .eq("id", thread_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Thread not found")

    supabase.table("messages").delete().eq("thread_id", thread_id).execute()
    supabase.table("threads").delete().eq("id", thread_id).eq("user_id", user_id).execute()
    return {"ok": True}


@router.get("/{thread_id}/messages")
async def get_messages(thread_id: str, user_id: str):
    """Get all messages for a thread."""
    thread_result = (
        supabase.table("threads")
        .select("id")
        .eq("id", thread_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not thread_result.data:
        raise HTTPException(status_code=404, detail="Thread not found")

    result = (
        supabase.table("messages")
        .select("role, content")
        .eq("thread_id", thread_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data


def _maybe_generate_title(thread_id: str, user_msg: str, assistant_reply: str, llm_client, model: str):
    """Generate a thread title from the first exchange, in a background thread."""
    # Only generate if thread has default title
    try:
        thread = supabase.table("threads").select("title").eq("id", thread_id).execute()
        current_title = (thread.data[0].get("title") or "") if thread.data else ""
        if current_title != "New Thread":
            return
    except Exception:
        return

    def _run():
        _generate_thread_title(user_msg, assistant_reply, thread_id, llm_client, model)

    threading.Thread(target=_run, daemon=True).start()


@router.post("/{thread_id}/messages")
async def send_message(thread_id: str, request: SendMessageRequest, user_id: str):
    """Send a message, retrieve relevant chunks, and stream the LLM response via SSE."""
    thread_result = (
        supabase.table("threads")
        .select("id")
        .eq("id", thread_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not thread_result.data:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Save user message to DB
    supabase.table("messages").insert({
        "id": str(uuid.uuid4()),
        "thread_id": thread_id,
        "role": "user",
        "content": request.content,
    }).execute()

    # Get user settings
    settings_result = (
        supabase.table("user_settings")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    user_settings = settings_result.data[0] if settings_result.data else {}

    # Retrieve relevant chunks
    chunks = search_chunks(
        request.content,
        top_k=5,
        user_settings=user_settings,
        filter_file_ids=request.filter_file_ids,
        filter_topics=request.filter_topics,
        filter_doc_types=request.filter_doc_types,
    )

    # Build context from chunks
    if chunks:
        context_parts = []
        for i, chunk in enumerate(chunks, 1):
            context_parts.append(
                f"[片段 {i} - 来自: {chunk.get('filename', '未知')}]\n{chunk['content']}"
            )
        context = "\n\n".join(context_parts)
    else:
        context = "（没有找到相关文档内容）"

    # Build system prompt
    user_system_prompt = user_settings.get("llm_system_prompt") or SYSTEM_PROMPT
    system_prompt = user_system_prompt.format(context=context) if "{context}" in user_system_prompt else user_system_prompt

    # Get conversation history
    history_result = (
        supabase.table("messages")
        .select("role, content")
        .eq("thread_id", thread_id)
        .order("created_at", desc=False)
        .execute()
    )
    messages = [
        {"role": "system", "content": system_prompt},
        *[{"role": m["role"], "content": m["content"]} for m in history_result.data
          if m["role"] in ("user", "assistant", "tool")],
    ]

    # Create LLM client with user settings
    llm_client = create_llm_client(
        api_key=user_settings.get("llm_api_key", ""),
        base_url=user_settings.get("llm_base_url", ""),
    )
    model = user_settings.get("llm_model") or settings.model

    # Tool-calling loop with error handling and fallback
    tool_calls_made = []
    main_reasoning = []
    final_answer = None
    tools_supported = True
    max_tool_rounds = 2

    for _ in range(max_tool_rounds):
        try:
            tool_response = llm_client.chat.completions.create(
                model=model,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
            )
        except Exception as e:
            # Model likely doesn't support tools — fall back to non-tool mode
            error_msg = str(e)
            if "tools" in error_msg.lower() or "tool_choice" in error_msg.lower() or "400" in error_msg:
                tools_supported = False
                break
            # Other errors: re-raise to be caught by event_stream handler
            raise

        tool_msg = tool_response.choices[0].message
        # Collect reasoning if present (DeepSeek thinking models)
        reasoning = getattr(tool_msg, "reasoning_content", None)
        if reasoning:
            main_reasoning.append(reasoning)

        if not tool_msg.tool_calls:
            content = tool_msg.content or ""
            # Check if model gave a non-answer for a query that needs web search
            if _needs_web_search(request.content) and _is_non_answer(content) and not tool_calls_made:
                # Auto-trigger web search as fallback
                search_result = execute_tool("search_web", {"query": request.content})
                tool_calls_made.append({
                    "name": "search_web",
                    "arguments": json.dumps({"query": request.content}, ensure_ascii=False),
                    "result": search_result[:2000],
                })
                messages.append({
                    "role": "user",
                    "content": f"以下是从网络搜索获取的信息：\n\n{search_result[:2000]}\n\n请基于这些信息回答用户的问题：{request.content}",
                })
                continue  # Loop again so model can use the search results
            final_answer = content
            break

        # Execute each tool call — append assistant msg first, then tool results
        tool_call_dicts = []
        tool_results = []
        for tc in tool_msg.tool_calls:
            try:
                args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                args = {}

            # Handle delegation specially to capture nested tool calls
            if tc.function.name == "delegate_to_subagent":
                tc_record = _execute_delegation(args, tc.id, llm_client, model)
            else:
                result = execute_tool(tc.function.name, args)
                tc_record = {
                    "id": tc.id,
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                    "result": result[:2000],
                    "status": "done",
                }
                tool_results.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result[:2000],
                })

            tool_calls_made.append(tc_record)
            tool_call_dicts.append({
                "id": tc.id,
                "type": "function",
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                },
            })
        messages.append({
            "role": "assistant",
            "content": tool_msg.content or "",
            "tool_calls": tool_call_dicts,
            **({"reasoning_content": tool_msg.reasoning_content} if getattr(tool_msg, "reasoning_content", None) else {}),
        })
        for tr in tool_results:
            messages.append(tr)

    # If tools aren't supported by the model, auto-run web search for queries that need it
    if not tools_supported and final_answer is None:
        if _needs_web_search(request.content):
            search_result = execute_tool("search_web", {"query": request.content})
            tool_calls_made.append({
                "name": "search_web",
                "arguments": json.dumps({"query": request.content}, ensure_ascii=False),
                "result": search_result[:2000],
            })
            # Inject search results into messages for the streaming call
            messages.append({
                "role": "user",
                "content": f"以下是从网络搜索获取的信息：\n\n{search_result[:2000]}\n\n请基于这些信息回答用户的问题：{request.content}",
            })

    # After tool loop: force a clean text answer if tools were used
    if tool_calls_made and final_answer is None:
        messages.append({
            "role": "user",
            "content": "请基于以上搜索结果，用中文直接回答用户的问题。不要再次搜索，直接给出答案。"
        })
        try:
            final_response = llm_client.chat.completions.create(
                model=model, messages=messages,
            )
            final_answer = final_response.choices[0].message.content or ""
        except Exception:
            pass

    # Strip XML tool_call wrappers from answer if model output them as text
    def _clean_answer(text: str) -> str:
        """Remove XML-format tool calls that thinking models sometimes output as text."""
        text = re.sub(r'</?tool_calls>', '', text)
        text = re.sub(r'<invoke\s+name="[^"]*"\s*>', '', text)
        text = re.sub(r'</invoke>', '', text)
        text = re.sub(r'<parameter[^>]*>', '', text)
        text = re.sub(r'</parameter>', '', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text.strip()

    # Clean final answer if needed
    if final_answer is not None:
        final_answer = _clean_answer(final_answer)

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            # Emit reasoning if collected (for thinking models)
            if main_reasoning:
                yield f"event: reasoning\ndata: {json.dumps(main_reasoning, ensure_ascii=False)}\n\n"

            # Emit tool calls if any were made (with nested children for delegation)
            if tool_calls_made:
                yield f"event: tool_calls\ndata: {json.dumps(tool_calls_made, ensure_ascii=False)}\n\n"

            # Emit sources/chunks as first SSE event
            if chunks:
                sources_payload = []
                for chunk in chunks:
                    sources_payload.append({
                        "content": chunk["content"],
                        "similarity": round(chunk.get("similarity", 0), 4),
                        "filename": chunk.get("filename", ""),
                        "chunk_index": chunk.get("chunk_index", 0),
                        "file_id": chunk.get("file_id", ""),
                    })
                yield f"event: sources\ndata: {json.dumps(sources_payload, ensure_ascii=False)}\n\n"

            # Use cached answer from tool loop if available, otherwise stream from LLM
            if final_answer is not None:
                # Stream the pre-computed answer to simulate SSE
                full_content = final_answer
                chunk_size = 4
                for i in range(0, len(full_content), chunk_size):
                    yield f"data: {full_content[i:i+chunk_size]}\n\n"
                # Save to DB
                supabase.table("messages").insert({
                    "id": str(uuid.uuid4()),
                    "thread_id": thread_id,
                    "role": "assistant",
                    "content": full_content,
                }).execute()
                _maybe_generate_title(thread_id, request.content, full_content, llm_client, model)
                yield "event: done\ndata: end\n\n"
                return

            # No cached answer — stream from LLM (no tools or tools not supported)
            try:
                stream = llm_client.chat.completions.create(
                    model=model,
                    messages=messages,
                    stream=True,
                )
                full_content = ""
                for chunk in stream:
                    choice = chunk.choices[0]
                    delta = choice.delta
                    if delta.content:
                        full_content += delta.content
                        yield f"data: {delta.content}\n\n"

                # Save assistant response to DB
                if full_content:
                    supabase.table("messages").insert({
                        "id": str(uuid.uuid4()),
                        "thread_id": thread_id,
                        "role": "assistant",
                        "content": full_content,
                    }).execute()
                    _maybe_generate_title(thread_id, request.content, full_content, llm_client, model)

                yield "event: done\ndata: end\n\n"
            except Exception as stream_err:
                yield f"event: error\ndata: {json.dumps({'message': f'LLM streaming failed: {stream_err}'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'message': f'Request failed: {e}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
