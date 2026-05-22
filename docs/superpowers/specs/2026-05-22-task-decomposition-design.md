# Task Decomposition & Parallel Sub-Agent Execution

## Summary
When a user asks a complex question, the main agent decomposes it into subtasks, dispatches them to sub-agents with mixed-mode parallelism (respecting dependencies), then synthesizes results into a final answer. The entire process streams in real-time to the chat UI.

## Architecture

### Flow
1. **Phase 1: Decomposition** — Main agent analyzes the question, streams decomposition analysis text, outputs subtask list with dependencies (DAG)
2. **Phase 2: Execution** — TaskOrchestrator schedules subtasks respecting the DAG: independent tasks run in parallel (max 5), dependent tasks run sequentially. Total timeout 120s.
3. **Phase 3: Synthesis** — Main agent collects all sub-agent results, streams final synthesized answer

### Backend

**New: `backend/src/orchestrator.py`**
- `TaskOrchestrator` class: decompose → execute_dag → synthesize
- Manages thread pool for parallel sub-agent execution
- Enforces max 5 parallel, 120s total timeout

**Modified: `backend/src/agent.py`**
- `SubAgentExecutor` gains full toolset: search_document, search_web, query_database
- Accepts Tavily API key for web search

**Modified: `backend/src/routers/threads.py`**
- New SSE events: `decomposition`, `subtask_start`, `subtask_done`
- Orchestrator integration in the agent loop
- `delegate_to_subagent` tool definition updated

### Frontend

**New: `frontend/src/components/DecompositionCard.tsx`**
- Renders decomposition analysis text + subtask list
- Shows real-time subtask status updates

**New: `frontend/src/components/SubtaskCard.tsx`**
- Individual subtask card with status: pending → running → done/error
- Expandable to see intermediate results

**Modified: `frontend/src/pages/Chat.tsx`**
- Listen for new SSE events: `decomposition`, `subtask_start`, `subtask_done`
- Render DecompositionCard and SubtaskCard components

### Constraints
- Max 5 parallel sub-agents
- Total timeout 120 seconds
- Sub-agents have same tools as main agent
