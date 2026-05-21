"""Sub-agent executor for isolated document analysis tasks."""

import json
import re

from src.config import settings
from src.models import SubAgentResult, ToolCallRecord


# Sub-agent tools: only document search within loaded text
SUBAGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_document",
            "description": "Search within the loaded document for specific passages matching a query. Use to find relevant sections, key facts, or specific mentions in the document text.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search terms or question to find in the document.",
                    },
                },
                "required": ["query"],
            },
        },
    },
]

SUBAGENT_SYSTEM_PROMPT = """You are a focused analysis sub-agent. You have been given the FULL TEXT of one or more documents.

Your task: {task}

Rules:
1. Analyze the full document text provided below thoroughly.
2. Use search_document if you need to find specific passages or verify details.
3. Be thorough, precise, and well-structured in your analysis.
4. Answer in the same language as the user's task description.
5. Return your complete analysis as the final answer.

Document metadata:
{file_metadata}

FULL DOCUMENT TEXT:
---
{full_text}
---"""


def execute_search_document(query: str, full_text: str) -> str:
    """Search within loaded document text using substring and ngram overlap matching."""
    if not full_text or not query:
        return "No matches found (empty document or query)."

    paragraphs = [p.strip() for p in full_text.split("\n\n") if p.strip()]

    # Score paragraphs by: exact match > substring match > ngram overlap
    query_lower = query.lower()
    scored = []
    for i, para in enumerate(paragraphs):
        para_lower = para.lower()
        score = 0.0

        # Exact match bonus
        exact_count = para_lower.count(query_lower)
        score += exact_count * 10.0

        # Substring match
        if query_lower in para_lower:
            score += 5.0

        # Individual word/character overlap
        query_chars = set(query_lower.replace(" ", ""))
        para_chars = set(para_lower.replace(" ", ""))
        if query_chars:
            overlap = len(query_chars & para_chars) / len(query_chars)
            score += overlap * 2.0

        if score > 0:
            scored.append((i, score, para[:500]))

    scored.sort(key=lambda x: x[1], reverse=True)

    if not scored:
        # Fall back to broader search: try individual terms
        terms = [t for t in re.split(r'[\s,，。；;、]+', query) if len(t) >= 2]
        for para in paragraphs:
            para_lower = para.lower()
            if any(t.lower() in para_lower for t in terms[:5]):
                return (
                    f"Found relevant passage:\n\n{para[:800]}"
                    + ("..." if len(para) > 800 else "")
                )
        return f"No matches found for: {query}"

    results = []
    for idx, score, preview in scored[:3]:
        para = paragraphs[idx]
        results.append(f"[Match score: {score:.1f}]\n{para[:800]}" + ("..." if len(para) > 800 else ""))
    return "\n\n---\n\n".join(results)


def _truncate_text(text: str, max_chars: int = 60000) -> str:
    """Truncate text to roughly max_chars characters, preserving paragraph boundaries."""
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    last_break = max(truncated.rfind("\n\n"), truncated.rfind("\n"), truncated.rfind("。"))
    if last_break > max_chars // 2:
        truncated = truncated[:last_break]
    return truncated + "\n\n[... Document truncated due to length ...]"


class SubAgentExecutor:
    """Runs an isolated sub-agent session for full-document analysis."""

    def __init__(
        self,
        llm_client,
        model: str,
        task: str,
        full_text: str,
        file_metadata: dict,
    ):
        self.llm_client = llm_client
        self.model = model
        self.task = task
        self.full_text = full_text
        self.file_metadata = file_metadata
        self.tool_calls: list[ToolCallRecord] = []
        self.reasoning: list[str] = []
        self.max_rounds = 2

    def run(self) -> SubAgentResult:
        """Execute the sub-agent and return structured results."""
        full_text_truncated = _truncate_text(self.full_text)

        # Build file metadata summary
        meta_parts = []
        for fid, meta in self.file_metadata.items():
            name = meta.get("filename", fid[:8])
            doc_meta = meta.get("metadata", {})
            if isinstance(doc_meta, dict):
                title = doc_meta.get("title", "")
                doc_type = doc_meta.get("document_type", "")
                lang = doc_meta.get("language", "")
                extra = f", title={title}" if title else ""
                extra += f", type={doc_type}" if doc_type else ""
                extra += f", lang={lang}" if lang else ""
                meta_parts.append(f"  - {name}{extra}")
            else:
                meta_parts.append(f"  - {name}")
        file_metadata_str = "\n".join(meta_parts) if meta_parts else "No metadata available"

        system_prompt = SUBAGENT_SYSTEM_PROMPT.format(
            task=self.task,
            file_metadata=file_metadata_str,
            full_text=full_text_truncated,
        )

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": self.task},
        ]

        final_answer = None

        for _ in range(self.max_rounds):
            try:
                response = self.llm_client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    tools=SUBAGENT_TOOLS,
                    tool_choice="auto",
                )
            except Exception as e:
                return SubAgentResult(
                    answer=f"Sub-agent LLM call failed: {e}",
                    tool_calls=self.tool_calls,
                    reasoning=self.reasoning,
                )

            msg = response.choices[0].message

            # Collect reasoning if present (DeepSeek thinking models)
            reasoning = getattr(msg, "reasoning_content", None)
            if reasoning:
                self.reasoning.append(reasoning)

            if not msg.tool_calls:
                final_answer = msg.content or ""
                break

            # Execute tool calls
            tc_dicts = []
            for tc in msg.tool_calls:
                tool_id = tc.id
                tool_name = tc.function.name
                tool_args = tc.function.arguments

                try:
                    args = json.loads(tool_args)
                except json.JSONDecodeError:
                    args = {}

                if tool_name == "search_document":
                    result = execute_search_document(args.get("query", ""), self.full_text)
                else:
                    result = f"Unknown sub-agent tool: {tool_name}"

                self.tool_calls.append(ToolCallRecord(
                    id=tool_id,
                    name=tool_name,
                    arguments=tool_args,
                    result=result[:2000],
                    status="done",
                ))

                tc_dicts.append({
                    "id": tool_id,
                    "type": "function",
                    "function": {"name": tool_name, "arguments": tool_args},
                })

                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_id,
                    "content": result[:2000],
                })

            msg_dict = {
                "role": "assistant",
                "content": msg.content or "",
                "tool_calls": tc_dicts,
            }
            if reasoning:
                msg_dict["reasoning_content"] = reasoning
            messages.append(msg_dict)

        if final_answer is None:
            # Force answer without tools
            messages.append({
                "role": "user",
                "content": "Please provide your complete analysis now based on the document text above."
            })
            try:
                last_resp = self.llm_client.chat.completions.create(
                    model=self.model, messages=messages,
                )
                final_answer = last_resp.choices[0].message.content or "Sub-agent produced no answer."
                reasoning = getattr(last_resp.choices[0].message, "reasoning_content", None)
                if reasoning:
                    self.reasoning.append(reasoning)
            except Exception as e:
                final_answer = f"Sub-agent failed to produce answer: {e}"

        return SubAgentResult(
            answer=final_answer,
            tool_calls=self.tool_calls,
            reasoning=self.reasoning,
        )
