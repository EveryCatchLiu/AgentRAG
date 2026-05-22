# Task Decomposition & Parallel Sub-Agent Execution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the main agent to decompose complex questions into subtasks, execute them via parallel sub-agents (respecting a dependency DAG), and synthesize results — all streamed in real-time to the chat UI.

**Architecture:** The main agent calls a new `decompose_and_execute` tool that kicks off a 3-phase pipeline: (1) LLM decomposes the question into subtasks with dependencies, (2) TaskOrchestrator runs subtasks via sub-agents (parallel for independent, sequential for dependent, max 5 concurrent, 120s timeout), (3) results are fed back to the main agent for streaming synthesis. An `asyncio.Queue` bridges synchronous orchestration with async SSE streaming.

**Tech Stack:** Python/FastAPI backend, React/TypeScript frontend, Zustand state management, SSE for streaming

---

### File Structure

| Action | File | Purpose |
|--------|------|---------|
| Create | `backend/src/orchestrator.py` | TaskOrchestrator: decompose → execute DAG → collect results |
| Modify | `backend/src/agent.py` | SubAgentExecutor gains full toolset (search_web, query_database, search_document) |
| Modify | `backend/src/tools.py` | Add `decompose_and_execute` tool definition + executor |
| Modify | `backend/src/routers/threads.py` | Integrate orchestrator into agent loop, add SSE queue-based streaming |
| Modify | `frontend/src/lib/store.ts` | Add `Subtask`, `Decomposition` types |
| Create | `frontend/src/components/DecompositionCard.tsx` | Card showing decomposition analysis + subtask list with real-time status |
| Create | `frontend/src/components/SubtaskCard.tsx` | Individual subtask display with status indicator |
| Modify | `frontend/src/pages/Chat.tsx` | Handle `decomposition`, `subtask_start`, `subtask_done` SSE events |

---

### Task 1: Upgrade SubAgentExecutor with full toolset

**Files:**
- Modify: `backend/src/agent.py`

The SubAgentExecutor currently only has `search_document`. Give it the same tools as the main agent so sub-agents can search the web and query the database in addition to document search.

- [ ] **Step 1: Update SUBAGENT_TOOLS to include all tools**

Replace the existing `SUBAGENT_TOOLS` list (lines 11-29) in `backend/src/agent.py`:

```python
SUBAGENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_document",
            "description": "Search within loaded documents for specific passages matching a query. Use to find relevant sections, key facts, or specific mentions in the document text.",
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
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": "Search the web for current information. Use when the document text doesn't contain relevant information, or for recent events, news, or real-time data.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query.",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_database",
            "description": "Query the knowledge base database for metadata and statistics about files, chunks, topics, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The question to answer from the database, in natural language.",
                    },
                },
                "required": ["question"],
            },
        },
    },
]
```

- [ ] **Step 2: Update SUBAGENT_SYSTEM_PROMPT to describe new tools**

Replace `SUBAGENT_SYSTEM_PROMPT` (lines 31-48):

```python
SUBAGENT_SYSTEM_PROMPT = """You are a focused analysis sub-agent. You have been given the FULL TEXT of one or more documents, and access to web search and database tools.

Your task: {task}

Rules:
1. Analyze the full document text provided below thoroughly.
2. Use search_document if you need to find specific passages or verify details in the documents.
3. Use search_web to search the internet for current information, facts, or context not in the documents.
4. Use query_database to check statistics about the knowledge base (file counts, topics, etc.).
5. Be thorough, precise, and well-structured in your analysis.
6. Answer in the same language as the user's task description.
7. Return your complete analysis as the final answer.

Document metadata:
{file_metadata}

FULL DOCUMENT TEXT:
---
{full_text}
---"""
```

- [ ] **Step 3: Add tool execution dispatch in SubAgentExecutor.run()**

In the `run()` method (around line 207-209), update the tool dispatch to handle the new tools:

Replace:
```python
                if tool_name == "search_document":
                    result = execute_search_document(args.get("query", ""), self.full_text)
                else:
                    result = f"Unknown sub-agent tool: {tool_name}"
```

With:
```python
                if tool_name == "search_document":
                    result = execute_search_document(args.get("query", ""), self.full_text)
                elif tool_name == "search_web":
                    from src.tools import execute_search_web
                    result = execute_search_web(args.get("query", ""), api_key=self.tavily_api_key)
                elif tool_name == "query_database":
                    from src.tools import execute_query_database
                    result = execute_query_database(args.get("question", ""))
                else:
                    result = f"Unknown sub-agent tool: {tool_name}"
```

- [ ] **Step 4: Add tavily_api_key parameter to SubAgentExecutor.__init__**

Add `tavily_api_key: str = ""` to the `__init__` parameters (line 118-125) and store as `self.tavily_api_key`.

```python
    def __init__(
        self,
        llm_client,
        model: str,
        task: str,
        full_text: str,
        file_metadata: dict,
        tavily_api_key: str = "",
    ):
        self.llm_client = llm_client
        self.model = model
        self.task = task
        self.full_text = full_text
        self.file_metadata = file_metadata
        self.tavily_api_key = tavily_api_key
        self.tool_calls: list[ToolCallRecord] = []
        self.reasoning: list[str] = []
        self.max_rounds = 2
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent.py
git commit -m "feat: upgrade SubAgentExecutor with full toolset (web search + database query)"
```

---

### Task 2: Create TaskOrchestrator

**Files:**
- Create: `backend/src/orchestrator.py`

- [ ] **Step 1: Create `backend/src/orchestrator.py`**

```python
"""Task decomposition and parallel sub-agent orchestration."""

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from src.config import settings
from src.models import ToolCallRecord


DECOMPOSE_SYSTEM_PROMPT = """You are a task decomposition assistant. Given a complex user question, break it down into smaller, independent subtasks that can be answered by sub-agents. Each sub-agent has access to:
- The user's document knowledge base (search_document)
- Web search (search_web)
- Database queries (query_database)

Output a JSON object with the following structure:
{
  "analysis": "A brief analysis of the question and your decomposition strategy (in the user's language)",
  "subtasks": [
    {
      "id": "1",
      "description": "Clear, specific task description. Include what to look for and how to answer.",
      "depends_on": []  // IDs of subtasks that must complete before this one
    }
  ]
}

Rules:
- Each subtask should be self-contained and answerable by a single sub-agent
- Minimize dependencies — only add depends_on when truly necessary (e.g., subtask B needs data from subtask A's result)
- 2-5 subtasks max
- Use the same language as the user's question
- Output ONLY the JSON object, no other text."""


DECOMPOSE_USER_PROMPT = """User question: {question}

Document context available: {context_summary}

Break this down into subtasks. Output ONLY the JSON object."""


SYNTHESIS_PROMPT = """You are a synthesis assistant. Given a user's original question and the answers from multiple sub-agents, synthesize a comprehensive final answer.

Original question: {question}

Sub-agent results:
{subagent_results}

Rules:
1. Synthesize all sub-agent results into one coherent answer
2. Address the original question completely
3. Be well-structured and thorough
4. Answer in the same language as the original question
5. Cite which sub-agent provided which information where relevant"""


class TaskOrchestrator:
    """Decomposes complex questions, executes subtasks via parallel sub-agents, and synthesizes results."""

    def __init__(
        self,
        llm_client,
        model: str,
        user_settings: dict = None,
        event_queue: Any = None,
    ):
        self.llm_client = llm_client
        self.model = model
        self.user_settings = user_settings or {}
        self.event_queue = event_queue  # asyncio.Queue for SSE events
        self.max_parallel = 5
        self.total_timeout = 120

    def _emit(self, event: str, data: Any):
        """Push an SSE event to the queue if available."""
        if self.event_queue:
            try:
                self.event_queue.put_nowait((event, data))
            except Exception:
                pass

    def decompose(self, question: str, context_summary: str = "") -> dict:
        """Ask the LLM to decompose a complex question into subtasks.

        Returns: {"analysis": str, "subtasks": [{"id": str, "description": str, "depends_on": list}]}
        """
        messages = [
            {"role": "system", "content": DECOMPOSE_SYSTEM_PROMPT},
            {"role": "user", "content": DECOMPOSE_USER_PROMPT.format(
                question=question,
                context_summary=context_summary or "No documents are loaded.",
            )},
        ]

        try:
            completion = self.llm_client.chat.completions.create(
                model=self.model,
                messages=messages,
                response_format={"type": "json_object"},
                max_tokens=2000,
            )
            raw = completion.choices[0].message.content.strip()
            result = json.loads(raw)
        except Exception as e:
            # Fallback: return a single subtask
            return {
                "analysis": f"Unable to decompose: {e}. Treating as a single task.",
                "subtasks": [{"id": "1", "description": question, "depends_on": []}],
            }

        # Validate structure
        if "subtasks" not in result:
            result["subtasks"] = [{"id": "1", "description": question, "depends_on": []}]
        if "analysis" not in result:
            result["analysis"] = f"Breaking down into {len(result['subtasks'])} subtasks."

        return result

    def execute_dag(self, subtasks: list[dict], full_text: str, file_metadata: dict) -> dict[str, str]:
        """Execute subtasks respecting dependency DAG.

        Returns: {task_id: answer_string}
        """
        from src.agent import SubAgentExecutor

        results: dict[str, str] = {}
        task_map: dict[str, dict] = {s["id"]: s for s in subtasks}
        completed: set[str] = set()
        start_time = time.time()
        tavily_key = self.user_settings.get("tavily_api_key", "") or settings.tavily_api_key

        # Emit decomposition
        self._emit("decomposition", {
            "analysis": "",
            "subtasks": subtasks,
        })

        while len(completed) < len(subtasks):
            if time.time() - start_time > self.total_timeout:
                for s in subtasks:
                    if s["id"] not in completed:
                        results[s["id"]] = f"[Timeout] Subtask '{s['description']}' timed out."
                        self._emit("subtask_error", {"task_id": s["id"], "error": "Timeout"})
                break

            # Find tasks ready to execute (all dependencies completed)
            ready = []
            for s in subtasks:
                sid = s["id"]
                if sid in completed:
                    continue
                deps = s.get("depends_on", [])
                if all(d in completed for d in deps):
                    ready.append(s)

            if not ready:
                # Shouldn't happen unless there's a cycle, but handle gracefully
                for s in subtasks:
                    if s["id"] not in completed:
                        results[s["id"]] = f"[Error] Circular dependency detected."
                break

            # Execute ready tasks in parallel (up to max_parallel)
            batch = ready[:self.max_parallel]

            # Inject prior results into dependent task descriptions
            for s in batch:
                deps = s.get("depends_on", [])
                if deps:
                    prior = "\n".join(f"[Subtask {d} result]: {results.get(d, 'N/A')}" for d in deps)
                    s["description"] = f"{s['description']}\n\nContext from prior subtasks:\n{prior}"

            with ThreadPoolExecutor(max_workers=len(batch)) as executor:
                futures = {}
                for s in batch:
                    self._emit("subtask_start", {"task_id": s["id"], "description": s["description"]})
                    future = executor.submit(
                        self._run_single_subtask,
                        s["id"], s["description"], full_text, file_metadata, tavily_key,
                    )
                    futures[future] = s["id"]

                for future in as_completed(futures, timeout=self.total_timeout):
                    sid = futures[future]
                    try:
                        answer = future.result(timeout=120)
                        results[sid] = answer
                        self._emit("subtask_done", {"task_id": sid, "answer": answer[:500]})
                    except Exception as e:
                        results[sid] = f"[Error] Subtask failed: {e}"
                        self._emit("subtask_error", {"task_id": sid, "error": str(e)})
                    completed.add(sid)

        return results

    def _run_single_subtask(
        self, task_id: str, description: str, full_text: str, file_metadata: dict, tavily_key: str,
    ) -> str:
        """Run a single subtask via SubAgentExecutor."""
        from src.agent import SubAgentExecutor

        executor = SubAgentExecutor(
            llm_client=self.llm_client,
            model=self.model,
            task=description,
            full_text=full_text,
            file_metadata=file_metadata,
            tavily_api_key=tavily_key,
        )
        result = executor.run()
        return result.answer

    def synthesize(self, question: str, subagent_results: dict[str, str]) -> str:
        """Ask the main LLM to synthesize sub-agent results into a final answer."""
        results_text = "\n\n---\n\n".join(
            f"Subtask {tid}:\n{answer}" for tid, answer in subagent_results.items()
        )

        messages = [
            {"role": "system", "content": SYNTHESIS_PROMPT.format(
                question=question,
                subagent_results=results_text,
            )},
            {"role": "user", "content": f"Please synthesize a comprehensive answer to: {question}"},
        ]

        completion = self.llm_client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=4000,
        )
        return completion.choices[0].message.content or ""
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/orchestrator.py
git commit -m "feat: add TaskOrchestrator for decomposition + DAG-based parallel execution"
```

---

### Task 3: Add decompose_and_execute tool

**Files:**
- Modify: `backend/src/tools.py`

- [ ] **Step 1: Add tool definition to TOOLS list**

Insert a new tool after the `delegate_to_subagent` definition (after line 69):

```python
    {
        "type": "function",
        "function": {
            "name": "decompose_and_execute",
            "description": "For complex questions: decompose into subtasks, execute them via parallel sub-agents, and synthesize results. Use this for multi-faceted questions that require independent analysis of different aspects. Each sub-agent has document search, web search, and database access.",
            "parameters": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "The original complex user question to decompose and solve.",
                    },
                    "file_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "UUIDs of the files for sub-agents to analyze.",
                    },
                },
                "required": ["question", "file_ids"],
            },
        },
    },
```

- [ ] **Step 2: Add executor function**

Add after `execute_delegate_to_subagent`:

```python
def execute_decompose_and_execute(question: str, file_ids: list[str]) -> str:
    """Decompose a complex question, execute sub-agents in parallel, and synthesize results."""
    from src.routers.chunks import get_full_document_text
    from src.openai_client import create_llm_client
    from src.orchestrator import TaskOrchestrator

    if not file_ids:
        return "Error: No file IDs provided."

    full_text, file_meta = get_full_document_text(file_ids)

    llm_client = create_llm_client(api_key="", base_url="")
    model = settings.model

    orchestrator = TaskOrchestrator(
        llm_client=llm_client,
        model=model,
        user_settings=None,  # Will be injected by execute_tool
        event_queue=None,    # Will be set when called from SSE context
    )

    # Context summary for decomposition
    context_summary = (
        f"{len(file_meta)} document(s) loaded: "
        + ", ".join(meta.get("filename", "unknown") for meta in file_meta.values())
    )

    decomposition = orchestrator.decompose(question, context_summary)
    results = orchestrator.execute_dag(decomposition["subtasks"], full_text, file_meta)

    return json.dumps({
        "analysis": decomposition["analysis"],
        "subtask_results": results,
    }, ensure_ascii=False)
```

- [ ] **Step 3: Register in TOOL_EXECUTORS**

Add to the `TOOL_EXECUTORS` dict:

```python
TOOL_EXECUTORS = {
    "search_web": execute_search_web,
    "query_database": execute_query_database,
    "delegate_to_subagent": execute_delegate_to_subagent,
    "decompose_and_execute": execute_decompose_and_execute,
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/tools.py
git commit -m "feat: add decompose_and_execute tool for multi-subtask orchestration"
```

---

### Task 4: Integrate orchestrator with SSE streaming in threads.py

**Files:**
- Modify: `backend/src/routers/threads.py`

This is the critical integration point. The `decompose_and_execute` tool execution needs to emit real-time SSE events during the DAG execution phase, which requires an `asyncio.Queue` to bridge sync orchestration with async SSE streaming.

- [ ] **Step 1: Add `asyncio` import**

At the top of the file, add to imports:

```python
import asyncio
```

- [ ] **Step 2: Create SSE-emitting wrapper for decompose_and_execute**

Add a new function `_execute_decomposition` that replaces the simple tool call for `decompose_and_execute`:

```python
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

    full_text, file_meta = get_full_document_text(file_ids)
    if not full_text.strip():
        return {
            "id": call_id, "name": "decompose_and_execute",
            "arguments": json.dumps(args, ensure_ascii=False),
            "result": f"Error: Documents not found for {file_ids}", "status": "error",
        }

    orchestrator = TaskOrchestrator(
        llm_client=llm_client,
        model=model,
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

    # Phase 2: Execute DAG (emits subtask_start/subtask_done internally)
    results = orchestrator.execute_dag(decomposition["subtasks"], full_text, file_meta)

    # Phase 3: Stream synthesis
    synthesis = orchestrator.synthesize(question, results)

    # Push final answer to queue for streaming
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
```

- [ ] **Step 3: Update tool dispatch in agent loop to use queue for decompose_and_execute**

In `send_message`, before the agent loop, create the event queue:

```python
    # Create event queue for streaming orchestration events
    event_queue: asyncio.Queue = asyncio.Queue()
```

Then in the tool execution section (around line 399-403), update:

```python
            # Handle decomposition specially for SSE streaming
            if tc.function.name == "decompose_and_execute":
                tc_record = _execute_decomposition(args, tc.id, llm_client, model, user_settings, event_queue)
            elif tc.function.name == "delegate_to_subagent":
                tc_record = _execute_delegation(args, tc.id, llm_client, model)
            else:
                result = execute_tool(tc.function.name, args, user_settings)
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
```

- [ ] **Step 4: Update event_stream to yield from the event queue**

In the `event_stream` async generator, add queue draining before tool_calls emission and handle new events:

```python
    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            # Emit reasoning if collected
            if main_reasoning:
                yield f"event: reasoning\ndata: {json.dumps(main_reasoning, ensure_ascii=False)}\n\n"

            # Drain orchestration events from queue (decomposition, subtask_start, subtask_done, synthesis)
            while not event_queue.empty():
                event_type, event_data = event_queue.get_nowait()
                if event_type == "synthesis":
                    # Stream the synthesis text as regular data events
                    synthesis_text = event_data
                    # Use chunked streaming
                    chunk_size = 4
                    for i in range(0, len(synthesis_text), chunk_size):
                        yield f"data: {synthesis_text[i:i+chunk_size]}\n\n"
                else:
                    yield f"event: {event_type}\ndata: {json.dumps(event_data, ensure_ascii=False)}\n\n"

            # Emit tool calls if any were made
            if tool_calls_made:
                yield f"event: tool_calls\ndata: {json.dumps(tool_calls_made, ensure_ascii=False)}\n\n"

            # Emit sources/chunks
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

            # Use cached answer from tool loop if available
            if final_answer is not None:
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

            # ... rest of streaming logic unchanged ...
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/routers/threads.py
git commit -m "feat: integrate orchestrator with SSE streaming for real-time task decomposition"
```

---

### Task 5: Add frontend types

**Files:**
- Modify: `frontend/src/lib/store.ts`

- [ ] **Step 1: Add Decomposition and Subtask types**

Add after the `ToolCall` interface:

```typescript
export interface Subtask {
  id: string
  description: string
  depends_on: string[]
  status: "pending" | "running" | "done" | "error"
  answer?: string
  error?: string
}

export interface Decomposition {
  analysis: string
  subtasks: Subtask[]
}
```

- [ ] **Step 2: Add decomposition to Message interface**

Update the `Message` interface to include decomposition:

```typescript
export interface Message {
  role: "user" | "assistant"
  content: string
  sources?: Source[]
  toolCalls?: ToolCall[]
  reasoning?: string[]
  decomposition?: Decomposition
}
```

- [ ] **Step 3: Add setters to ChatStore**

Add to the `ChatStore` interface and implementation:

```typescript
  setDecompositionAt: (index: number, decomposition: Decomposition) => void
  updateSubtaskStatus: (index: number, taskId: string, status: Subtask["status"], answer?: string, error?: string) => void
```

Implementation:

```typescript
  setDecompositionAt: (index: number, decomposition: Decomposition) => {
    const store = get()
    const updated = [...store.messages]
    updated[index] = { ...updated[index], decomposition }
    set({ messages: updated })
  },

  updateSubtaskStatus: (index: number, taskId: string, status: Subtask["status"], answer?: string, error?: string) => {
    const store = get()
    const updated = [...store.messages]
    const msg = updated[index]
    if (msg.decomposition) {
      const subtasks = msg.decomposition.subtasks.map(s =>
        s.id === taskId ? { ...s, status, ...(answer ? { answer } : {}), ...(error ? { error } : {}) } : s
      )
      updated[index] = { ...msg, decomposition: { ...msg.decomposition, subtasks } }
      set({ messages: updated })
    }
  },
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/store.ts
git commit -m "feat: add Decomposition and Subtask types to frontend store"
```

---

### Task 6: Create SubtaskCard component

**Files:**
- Create: `frontend/src/components/SubtaskCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Loader2, Check, X, ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"
import type { Subtask } from "../lib/store"

interface SubtaskCardProps {
  subtask: Subtask
}

export default function SubtaskCard({ subtask }: SubtaskCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-[#f0e0c8] bg-[#fefcf9] text-xs overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 hover:bg-[#fdf8f2] text-left"
      >
        <span className="flex items-center gap-1.5 text-[#8b7355]">
          {subtask.status === "pending" && <span className="h-2 w-2 rounded-full bg-[#d4c8b8]" />}
          {subtask.status === "running" && <Loader2 className="h-3 w-3 animate-spin text-[#e8954c]" />}
          {subtask.status === "done" && <Check className="h-3 w-3 text-green-500" />}
          {subtask.status === "error" && <X className="h-3 w-3 text-red-500" />}
          <span className={`font-medium ${subtask.status === "done" ? "text-[#5c4a3a]" : "text-[#8b7355]"}`}>
            {subtask.description.length > 80
              ? subtask.description.slice(0, 80) + "..."
              : subtask.description}
          </span>
        </span>
        <span className="ml-auto">
          {expanded ? <ChevronUp className="h-3 w-3 text-[#9e8b78]" /> : <ChevronDown className="h-3 w-3 text-[#9e8b78]" />}
        </span>
      </button>

      {expanded && (subtask.answer || subtask.error) && (
        <div className="border-t border-[#f0e0c8] px-3 py-2">
          {subtask.error ? (
            <p className="text-red-500">{subtask.error}</p>
          ) : (
            <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed max-h-60 overflow-y-auto">
              {subtask.answer}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/SubtaskCard.tsx
git commit -m "feat: add SubtaskCard component"
```

---

### Task 7: Create DecompositionCard component

**Files:**
- Create: `frontend/src/components/DecompositionCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import MarkdownMessage from "./MarkdownMessage"
import SubtaskCard from "./SubtaskCard"
import type { Decomposition } from "../lib/store"

interface DecompositionCardProps {
  decomposition: Decomposition
}

export default function DecompositionCard({ decomposition }: DecompositionCardProps) {
  return (
    <div className="rounded-xl border border-[#f0e0c8] bg-[#fefcf9] overflow-hidden">
      {/* Analysis header */}
      <div className="px-4 py-3 border-b border-[#f0e0c8]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-[#e8954c] uppercase tracking-wide">
            Task Decomposition
          </span>
        </div>
        <MarkdownMessage content={decomposition.analysis} />
      </div>

      {/* Subtask list */}
      <div className="px-4 py-3 space-y-2">
        <span className="text-[11px] font-medium text-[#9e8b78] uppercase tracking-wide">
          Subtasks ({decomposition.subtasks.filter(s => s.status === "done").length}/{decomposition.subtasks.length})
        </span>
        {decomposition.subtasks.map((subtask) => (
          <SubtaskCard key={subtask.id} subtask={subtask} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/DecompositionCard.tsx
git commit -m "feat: add DecompositionCard component"
```

---

### Task 8: Update Chat.tsx for new SSE events

**Files:**
- Modify: `frontend/src/pages/Chat.tsx`

- [ ] **Step 1: Import new components**

Add imports:

```tsx
import DecompositionCard from "../components/DecompositionCard"
import type { Decomposition, Subtask } from "../lib/store"
```

- [ ] **Step 2: Add helper functions for decomposition state**

Add after the existing setter functions:

```tsx
  const setDecompositionAt = (index: number, decomposition: Decomposition) => {
    const store = useChatStore.getState()
    const updated = [...store.messages]
    updated[index] = { ...updated[index], decomposition }
    store.setMessages(updated)
  }

  const updateSubtaskAt = (index: number, taskId: string, status: Subtask["status"], answer?: string, error?: string) => {
    const store = useChatStore.getState()
    const updated = [...store.messages]
    const msg = updated[index]
    if (msg.decomposition) {
      const subtasks = msg.decomposition.subtasks.map(s =>
        s.id === taskId ? { ...s, status, ...(answer ? { answer } : {}), ...(error ? { error } : {}) } : s
      )
      updated[index] = { ...msg, decomposition: { ...msg.decomposition, subtasks } }
      store.setMessages(updated)
    }
  }
```

- [ ] **Step 3: Update SSE event handling for new events**

In the SSE parsing loop, add handlers after the `reasoning` handler:

```tsx
            } else if (currentEvent === "decomposition") {
              const data_obj = JSON.parse(data)
              // Initialize subtasks with pending status
              const decomposition: Decomposition = {
                analysis: data_obj.analysis || "",
                subtasks: (data_obj.subtasks || []).map((s: Record<string, unknown>) => ({
                  id: s.id as string,
                  description: s.description as string,
                  depends_on: (s.depends_on as string[]) || [],
                  status: "pending" as const,
                })),
              }
              setDecompositionAt(assistantIndex, decomposition)
            } else if (currentEvent === "subtask_start") {
              const data_obj = JSON.parse(data)
              updateSubtaskAt(assistantIndex, data_obj.task_id, "running")
            } else if (currentEvent === "subtask_done") {
              const data_obj = JSON.parse(data)
              updateSubtaskAt(assistantIndex, data_obj.task_id, "done", data_obj.answer)
            } else if (currentEvent === "subtask_error") {
              const data_obj = JSON.parse(data)
              updateSubtaskAt(assistantIndex, data_obj.task_id, "error", undefined, data_obj.error)
```

- [ ] **Step 4: Render DecompositionCard in message list**

In the message rendering loop, add DecompositionCard rendering before tool calls. After the `Loader2` spinner and before tool calls:

```tsx
                      {msg.role === "assistant" && msg.decomposition && (
                        <div className="mt-3">
                          <DecompositionCard decomposition={msg.decomposition} />
                        </div>
                      )}
                      {msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0 && (
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Chat.tsx
git commit -m "feat: handle decomposition SSE events and render DecompositionCard in chat"
```

---

### Task 9: Thread title model support for decompose flow

**Files:**
- Modify: `backend/src/routers/threads.py`

- [ ] **Step 1: Use title model for decomposition**

When `_execute_decomposition` is called, use the user's title model if configured:

```python
    title_model = user_settings.get("llm_title_model") or model
    orchestrator = TaskOrchestrator(
        llm_client=create_llm_client(
            api_key=user_settings.get("llm_api_key", ""),
            base_url=user_settings.get("llm_base_url", ""),
        ),
        model=title_model,  # Use cheaper model for decomposition
        user_settings=user_settings,
        event_queue=event_queue,
    )
```

Actually, let's keep it simple and use the main model. Skip this task.

---

### Task 9: Final integration test

- [ ] **Step 1: Verify backend starts cleanly**

```bash
conda run -n AgentRAG python -c "from src.orchestrator import TaskOrchestrator; print('OK')"
```

- [ ] **Step 2: Verify frontend builds**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final integration fixes for task decomposition"
```
