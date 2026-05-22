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
        completed: set[str] = set()
        start_time = time.time()
        tavily_key = self.user_settings.get("tavily_api_key", "") or settings.tavily_api_key

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
