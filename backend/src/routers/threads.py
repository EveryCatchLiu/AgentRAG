import asyncio
import json
import queue
import re
import threading
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.config import settings
from src.openai_client import create_llm_client, create_bailian_client, resolve_model, get_multimodal_embedding
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


def _parse_xml_tool_calls(content: str) -> list[dict]:
    """Parse XML-format tool calls that thinking models (DeepSeek) sometimes output as text.

    Parses: <invoke name="tool_name"><parameter name="p" string="true">value</parameter></invoke>
    Returns: [{"name": str, "arguments": dict}, ...]
    """
    results = []
    # Match <invoke name="TOOL_NAME">...<parameter .../>...</invoke>
    invoke_pattern = re.compile(
        r'<invoke\s+name="([^"]+)"\s*>(.*?)</invoke>', re.DOTALL
    )
    param_pattern = re.compile(
        r'<parameter\s+name="([^"]+)"[^>]*>(.*?)</parameter>', re.DOTALL
    )
    for match in invoke_pattern.finditer(content):
        tool_name = match.group(1)
        params_block = match.group(2)
        arguments = {}
        for pm in param_pattern.finditer(params_block):
            pname = pm.group(1)
            pvalue = pm.group(2).strip()
            # Parse JSON arrays like ["id1", "id2"]
            if pvalue.startswith("["):
                try:
                    pvalue = json.loads(pvalue)
                except json.JSONDecodeError:
                    pass
            arguments[pname] = pvalue
        results.append({"name": tool_name, "arguments": arguments})
    return results


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

    full_text, file_meta, media_map = get_full_document_text(file_ids)
    if not full_text.strip():
        return {
            "id": call_id, "name": "delegate_to_subagent",
            "arguments": json.dumps(args, ensure_ascii=False),
            "result": f"Error: Documents not found for {file_ids}", "status": "error",
        }

    # Collect chunk images
    chunk_images = []
    for _fid, media in media_map.items():
        if media.get("type") == "image" and media.get("url"):
            chunk_images.append(media["url"])

    # Auto-switch to Bailian client if document has images
    if chunk_images:
        from src.openai_client import create_bailian_client
        _client = create_bailian_client()
        _model = settings.multimodal_model
    else:
        _client = llm_client
        _model = model

    executor = SubAgentExecutor(
        llm_client=_client, model=_model,
        task=task, full_text=full_text, file_metadata=file_meta,
        chunk_images=chunk_images,
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


def _execute_decomposition(args: dict, call_id: str, llm_client, model: str, user_settings: dict, event_queue) -> dict:
    """Execute decompose_and_execute with real-time SSE event emission."""
    from src.routers.chunks import get_full_document_text
    from src.orchestrator import TaskOrchestrator

    question = args.get("question", "")
    file_ids = args.get("file_ids", [])

    if not file_ids:
        return {
            "id": call_id, "name": "decompose_and_execute",
            "arguments": json.dumps(args, ensure_ascii=False),
            "result": "Error: No file IDs provided.", "status": "error",
        }

    full_text, file_meta, media_map = get_full_document_text(file_ids)
    if not full_text.strip():
        return {
            "id": call_id, "name": "decompose_and_execute",
            "arguments": json.dumps(args, ensure_ascii=False),
            "result": f"Error: Documents not found for {file_ids}", "status": "error",
        }

    # Auto-switch to Bailian if document has images
    has_images = any(
        m.get("type") == "image" and m.get("url")
        for m in media_map.values()
    )
    if has_images:
        from src.openai_client import create_bailian_client
        _client = create_bailian_client()
        _model = settings.multimodal_model
    else:
        _client = llm_client
        _model = model

    orchestrator = TaskOrchestrator(
        llm_client=_client,
        model=_model,
        user_settings=user_settings,
        event_queue=event_queue,
    )

    context_summary = (
        f"{len(file_meta)} document(s): "
        + ", ".join(meta.get("filename", "unknown") for meta in file_meta.values())
    )

    # Phase 1: Decompose
    decomposition = orchestrator.decompose(question, context_summary)

    # Emit decomposition event
    event_queue.put_nowait(("decomposition", {
        "analysis": decomposition["analysis"],
        "subtasks": decomposition["subtasks"],
    }))

    # Phase 2: Execute DAG (emits subtask_start/subtask_done internally via _emit)
    results = orchestrator.execute_dag(decomposition["subtasks"], full_text, file_meta)

    # Phase 3: Synthesize — push synthesis text to queue for streaming
    synthesis = orchestrator.synthesize(question, results)
    event_queue.put_nowait(("synthesis", synthesis))

    return {
        "id": call_id,
        "name": "decompose_and_execute",
        "arguments": json.dumps(args, ensure_ascii=False),
        "result": synthesis[:2000],
        "status": "done",
        "subtasks": decomposition["subtasks"],
        "analysis": decomposition["analysis"],
        "subtaskResults": {k: v[:500] for k, v in results.items()},
    }


def _download_chunk_image(url: str) -> str | None:
    """Download an image from Supabase Storage and return as base64 data URI."""
    import base64
    from src.supabase_client import storage_bucket
    try:
        path = url.split("/storage/v1/object/public/documents/")[-1]
        img_bytes = storage_bucket.download(path)
        mime = "image/jpeg"
        if img_bytes[:4] == b'\x89PNG':
            mime = "image/png"
        elif img_bytes[:4] == b'RIFF' and img_bytes[8:12] == b'WEBP':
            mime = "image/webp"
        elif img_bytes[:2] in (b'\xff\xd8',):
            mime = "image/jpeg"
        b64 = base64.b64encode(img_bytes).decode()
        return f"data:{mime};base64,{b64}"
    except Exception:
        return None


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
2. 对于简单的文档分析任务（总结、查找、对比），使用 delegate_to_subagent 工具派一个子 Agent 去分析完整文档。
3. **对于复杂的、多方面的提问**（例如"分析A和B的差异，同时调查C的最新进展"），使用 decompose_and_execute 工具。这个工具会自动把问题拆成子任务、并行执行、然后汇总结果。
4. 当文档片段无法回答用户问题时（例如询问天气、新闻、实时信息等），使用 search_web 工具搜索网络。
5. 搜索或工具执行后，**必须直接给出文字回答**，不要再调用工具。基于搜索结果和自己的知识用自己的话总结回答用户。
6. 当用户询问知识库统计信息时，使用 query_database 工具。
7. 不要编造信息。如果确实无法回答，诚实说明。

文档片段：
{context}
"""


class CreateThreadRequest(BaseModel):
    title: str | None = None


class MediaAttachment(BaseModel):
    type: str  # "image" or "video"
    data: str  # full data URI for images (data:image/...;base64,...), URL for videos


class SendMessageRequest(BaseModel):
    content: str
    media: list[MediaAttachment] | None = None
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
    if request.media:
        contents = [{"text": request.content}]
        for m in request.media:
            if m.type == "image":
                contents.append({"image": m.data})
            elif m.type == "video":
                contents.append({"video": m.data})
        query_embedding = get_multimodal_embedding(contents, api_key="")
        chunks = search_chunks(
            request.content, top_k=5, user_settings=user_settings,
            filter_file_ids=request.filter_file_ids,
            filter_topics=request.filter_topics,
            filter_doc_types=request.filter_doc_types,
            query_embedding=query_embedding,
        )
    else:
        chunks = search_chunks(
            request.content, top_k=5, user_settings=user_settings,
            filter_file_ids=request.filter_file_ids,
            filter_topics=request.filter_topics,
            filter_doc_types=request.filter_doc_types,
        )

    # Build context from chunks
    # Also collect images from chunks to pass to multimodal model
    chunk_images = []
    if chunks:
        context_parts = []
        # Collect unique file references for tool usage
        seen_files = {}
        for chunk in chunks:
            fid = chunk.get("file_id", "")
            fname = chunk.get("filename", "未知")
            if fid and fid not in seen_files:
                seen_files[fid] = fname
            # Collect image URLs from retrieved chunks
            if chunk.get("media_type") == "image" and chunk.get("media_url"):
                chunk_images.append(chunk["media_url"])
        print(f"[DEBUG] chunks={len(chunks)} chunk_images={len(chunk_images)} seen_files={seen_files}", flush=True)
        file_list = "\n".join(f"  - {name} (file_id: {fid})" for fid, name in seen_files.items())

        for i, chunk in enumerate(chunks, 1):
            context_parts.append(
                f"[片段 {i} - 来自: {chunk.get('filename', '未知')} (file_id: {chunk.get('file_id', '')})]\n{chunk['content']}"
            )
        context = "\n\n".join(context_parts)
        context += f"\n\n可用的文件及其 file_id：\n{file_list}"
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
    # Build the current user message content (text or multimodal for LLM)
    user_content: str | list[dict] = request.content
    # Collect all images: user-uploaded + retrieved from chunks
    all_images: list[str] = []
    if request.media:
        parts = [{"type": "text", "text": request.content}]
        for m in request.media:
            if m.type == "image":
                parts.append({
                    "type": "image_url",
                    "image_url": {"url": m.data},
                })
                all_images.append(m.data)
            elif m.type == "video":
                parts.append({
                    "type": "video_url",
                    "video_url": {"url": m.data},
                })
        user_content = parts
    elif chunk_images:
        # Retrieved images from vector DB — download and pass as base64 to the model
        print(f"[DEBUG] Injecting {len(chunk_images)} chunk images into user content", flush=True)
        parts = [{"type": "text", "text": request.content}]
        for img_url in chunk_images:
            print(f"[DEBUG] Downloading chunk image: {img_url[:80]}...", flush=True)
            try:
                img_data = _download_chunk_image(img_url)
                if img_data:
                    print(f"[DEBUG] Chunk image downloaded OK, adding to content", flush=True)
                    parts.append({
                        "type": "image_url",
                        "image_url": {"url": img_data},
                    })
                else:
                    print(f"[DEBUG] Chunk image download returned None", flush=True)
            except Exception as e:
                print(f"[DEBUG] Chunk image download exception: {e}", flush=True)
                pass
        user_content = parts
    # else: user_content stays as plain text string

    history_msgs = [
        {"role": m["role"], "content": m["content"]}
        for m in history_result.data
        if m["role"] in ("user", "assistant")
    ]

    messages = [{"role": "system", "content": system_prompt}]
    # Replace the last user message with multimodal content if we have images
    if history_msgs:
        if isinstance(user_content, list):
            history_msgs[-1]["content"] = user_content  # multimodal array
    messages += history_msgs

    # Create LLM clients for both platforms
    llm_client = create_llm_client(
        api_key=user_settings.get("llm_api_key", ""),
        base_url=user_settings.get("llm_base_url", ""),
    )
    bailian_llm_client = create_bailian_client(
        api_key=user_settings.get("bailian_api_key", ""),
        base_url=user_settings.get("bailian_base_url", ""),
    )
    model = user_settings.get("llm_model") or settings.model

    # Create thread-safe event queue for real-time SSE streaming
    event_queue: queue.Queue = queue.Queue()

    # Agent loop state
    tool_calls_made = []
    main_reasoning = []
    final_answer = None
    max_tool_rounds = 2

    def _push(event_type: str, data):
        """Push an event to the queue."""
        event_queue.put((event_type, data))

    def _clean_answer(text: str) -> str:
        """Remove XML-format tool calls that thinking models sometimes output as text."""
        text = re.sub(r'</?tool_calls>', '', text)
        text = re.sub(r'<invoke\s+name="[^"]*"\s*>', '', text)
        text = re.sub(r'</invoke>', '', text)
        text = re.sub(r'<parameter[^>]*>', '', text)
        text = re.sub(r'</parameter>', '', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text.strip()

    def run_agent_loop():
        """Run the full agent loop in a background thread, pushing events to queue in real-time."""
        nonlocal final_answer, tool_calls_made, main_reasoning

        # Tool-calling loop
        tools_supported = True
        current_model, platform = resolve_model(messages, user_settings)
        active_client = bailian_llm_client if platform == "bailian" else llm_client
        print(f"[DEBUG] model={current_model} platform={platform} user_content is list={isinstance(user_content, list)} num_images={len([p for p in (user_content if isinstance(user_content,list) else []) if p.get('type')=='image_url'])}", flush=True)

        for _ in range(max_tool_rounds):
            try:
                tool_response = active_client.chat.completions.create(
                    model=current_model,
                    messages=messages,
                    tools=TOOLS,
                    tool_choice="auto",
                )
            except Exception as e:
                error_msg = str(e)
                if "tools" in error_msg.lower() or "tool_choice" in error_msg.lower() or "400" in error_msg:
                    tools_supported = False
                    break
                _push("error", {"message": f"LLM call failed: {e}"})
                return

            tool_msg = tool_response.choices[0].message
            # Push reasoning in real-time
            reasoning = getattr(tool_msg, "reasoning_content", None)
            if reasoning:
                main_reasoning.append(reasoning)
                _push("reasoning", [reasoning])

            if not tool_msg.tool_calls:
                content = tool_msg.content or ""

                # DeepSeek thinking models: XML tool calls in content
                xml_tool_calls = _parse_xml_tool_calls(content)
                if xml_tool_calls:
                    tool_call_dicts = []
                    tool_results = []
                    for xc in xml_tool_calls:
                        import uuid as _uuid
                        call_id = f"call_{_uuid.uuid4().hex[:12]}"
                        args = xc["arguments"]
                        name = xc["name"]
                        args_json = json.dumps(args, ensure_ascii=False)

                        if name == "decompose_and_execute":
                            tc_record = _execute_decomposition(args, call_id, active_client, current_model, user_settings, event_queue)
                            tool_results.append({"role": "tool", "tool_call_id": call_id, "content": tc_record["result"][:2000]})
                        elif name == "delegate_to_subagent":
                            tc_record = _execute_delegation(args, call_id, active_client, current_model)
                            tool_results.append({"role": "tool", "tool_call_id": call_id, "content": tc_record["result"][:2000]})
                        else:
                            result = execute_tool(name, args, user_settings)
                            tc_record = {"id": call_id, "name": name, "arguments": args_json, "result": result[:2000], "status": "done"}
                            tool_results.append({"role": "tool", "tool_call_id": call_id, "content": result[:2000]})

                        tool_calls_made.append(tc_record)
                        tool_call_dicts.append({"id": call_id, "type": "function", "function": {"name": name, "arguments": args_json}})

                    # Push tool_calls in real-time
                    _push("tool_calls", tool_calls_made)

                    messages.append({"role": "assistant", "content": "", "tool_calls": tool_call_dicts})
                    for tr in tool_results:
                        messages.append(tr)
                    continue

                # Check for web search fallback
                if _needs_web_search(request.content) and _is_non_answer(content) and not tool_calls_made:
                    search_result = execute_tool("search_web", {"query": request.content}, user_settings)
                    tc = {"name": "search_web", "arguments": json.dumps({"query": request.content}, ensure_ascii=False), "result": search_result[:2000]}
                    tool_calls_made.append(tc)
                    _push("tool_calls", tool_calls_made)
                    messages.append({"role": "user", "content": f"以下是从网络搜索获取的信息：\n\n{search_result[:2000]}\n\n请基于这些信息回答用户的问题：{request.content}"})
                    continue

                final_answer = content
                break

            # Execute native tool_calls
            tool_call_dicts = []
            tool_results = []
            for tc in tool_msg.tool_calls:
                try:
                    args = json.loads(tc.function.arguments)
                except json.JSONDecodeError:
                    args = {}

                if tc.function.name == "decompose_and_execute":
                    tc_record = _execute_decomposition(args, tc.id, active_client, current_model, user_settings, event_queue)
                    tool_results.append({"role": "tool", "tool_call_id": tc.id, "content": tc_record["result"][:2000]})
                elif tc.function.name == "delegate_to_subagent":
                    tc_record = _execute_delegation(args, tc.id, active_client, current_model)
                    tool_results.append({"role": "tool", "tool_call_id": tc.id, "content": tc_record["result"][:2000]})
                else:
                    result = execute_tool(tc.function.name, args, user_settings)
                    tc_record = {"id": tc.id, "name": tc.function.name, "arguments": tc.function.arguments, "result": result[:2000], "status": "done"}
                    tool_results.append({"role": "tool", "tool_call_id": tc.id, "content": result[:2000]})

                tool_calls_made.append(tc_record)
                tool_call_dicts.append({"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}})

            # Push tool_calls in real-time
            _push("tool_calls", tool_calls_made)

            messages.append({
                "role": "assistant", "content": tool_msg.content or "", "tool_calls": tool_call_dicts,
                **({"reasoning_content": tool_msg.reasoning_content} if getattr(tool_msg, "reasoning_content", None) else {}),
            })
            for tr in tool_results:
                messages.append(tr)

        # If tools not supported, web search fallback
        if not tools_supported and final_answer is None:
            if _needs_web_search(request.content):
                search_result = execute_tool("search_web", {"query": request.content})
                tc = {"name": "search_web", "arguments": json.dumps({"query": request.content}, ensure_ascii=False), "result": search_result[:2000]}
                tool_calls_made.append(tc)
                _push("tool_calls", tool_calls_made)
                messages.append({"role": "user", "content": f"以下是从网络搜索获取的信息：\n\n{search_result[:2000]}\n\n请基于这些信息回答用户的问题：{request.content}"})

        # Force clean text answer if tools were used
        if tool_calls_made and final_answer is None:
            messages.append({"role": "user", "content": "请基于以上搜索结果，用中文直接回答用户的问题。不要再次搜索，直接给出答案。"})
            try:
                # Stream the final answer — push chunks to queue in real-time
                current_model, platform = resolve_model(messages, user_settings)
                active_client = bailian_llm_client if platform == "bailian" else llm_client
                stream = active_client.chat.completions.create(model=current_model, messages=messages, stream=True)
                full_text = ""
                for chunk in stream:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        full_text += delta.content
                        _push("data", delta.content)
                final_answer = _clean_answer(full_text) if full_text else full_text
            except Exception as e:
                _push("error", {"message": f"Streaming failed: {e}"})

        if final_answer is not None:
            final_answer = _clean_answer(final_answer)

        _push("_done", None)

    # Collect chunk image storage paths for frontend display
    retrieved_image_paths = []
    for img_url in chunk_images:
        path = img_url.split("/storage/v1/object/public/documents/")[-1] if "/storage/v1/object/public/documents/" in img_url else ""
        if path:
            retrieved_image_paths.append(path)

    # Start agent loop in background thread
    agent_thread = threading.Thread(target=run_agent_loop, daemon=True)
    agent_thread.start()

    async def event_stream() -> AsyncGenerator[str, None]:
        """Continuously read from event queue and yield SSE events in real-time."""
        synthesis_text = None
        try:
            while True:
                try:
                    event_type, event_data = event_queue.get(timeout=0.05)
                except queue.Empty:
                    await asyncio.sleep(0.05)
                    continue

                if event_type == "_done":
                    break
                elif event_type == "data":
                    synthesis_text = (synthesis_text or "") + event_data
                    yield f"data: {event_data}\n\n"
                elif event_type == "synthesis":
                    # Legacy synthesis event from orchestrator (full text)
                    synthesis_text = event_data
                    for i in range(0, len(event_data), 4):
                        yield f"data: {event_data[i:i+4]}\n\n"
                elif event_type == "error":
                    yield f"event: error\ndata: {json.dumps(event_data, ensure_ascii=False)}\n\n"
                elif event_type == "tool_calls":
                    yield f"event: tool_calls\ndata: {json.dumps(event_data, ensure_ascii=False)}\n\n"
                elif event_type == "reasoning":
                    yield f"event: reasoning\ndata: {json.dumps(event_data, ensure_ascii=False)}\n\n"
                else:
                    yield f"event: {event_type}\ndata: {json.dumps(event_data, ensure_ascii=False)}\n\n"

            # Emit retrieved image paths for frontend display
            if retrieved_image_paths:
                yield f"event: retrieved_images\ndata: {json.dumps(retrieved_image_paths, ensure_ascii=False)}\n\n"

            # Emit sources after tool events
            if chunks:
                sources_payload = []
                for chunk in chunks:
                    sources_payload.append({
                        "content": chunk["content"],
                        "similarity": round(chunk.get("similarity", 0), 4),
                        "filename": chunk.get("filename", ""),
                        "chunk_index": chunk.get("chunk_index", 0),
                        "file_id": chunk.get("file_id", ""),
                        "media_type": chunk.get("media_type"),
                        "media_url": chunk.get("media_url"),
                    })
                yield f"event: sources\ndata: {json.dumps(sources_payload, ensure_ascii=False)}\n\n"

            # Save assistant response to DB
            if final_answer:
                supabase.table("messages").insert({
                    "id": str(uuid.uuid4()),
                    "thread_id": thread_id,
                    "role": "assistant",
                    "content": final_answer,
                }).execute()
                _maybe_generate_title(thread_id, request.content, final_answer, llm_client, model)
            elif synthesis_text:
                supabase.table("messages").insert({
                    "id": str(uuid.uuid4()),
                    "thread_id": thread_id,
                    "role": "assistant",
                    "content": synthesis_text,
                }).execute()
                _maybe_generate_title(thread_id, request.content, synthesis_text, llm_client, model)

            yield "event: done\ndata: end\n\n"
        except Exception as e:
            yield f"event: error\ndata: {json.dumps({'message': f'Stream failed: {e}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
