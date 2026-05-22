# AgentRAG

An intelligent document assistant — upload files, ask questions, get answers grounded in your knowledge base. Built with a multi-tool agent that can search the web, query databases, decompose complex tasks into parallel sub-agent executions, and stream everything in real time.

## Features

- **Chat Interface** — Threaded conversations with real-time streaming responses, Markdown rendering, LaTeX math support, and source attribution
- **File Import** — Upload PDF, DOCX, HTML, Markdown, CSV/TSV, and images (PNG/JPG/TIFF). Mistral OCR handles scanned PDFs and images automatically
- **Hybrid Search** — Vector (pgvector) + keyword retrieval with RRF fusion and LLM/Cohere reranking for the most relevant results. Supports hybrid, vector-only, and keyword-only retrieval modes
- **Multi-Tool Agent** — The LLM autonomously chooses between web search (Tavily), database queries, sub-agent delegation, and task decomposition
- **Task Decomposition** — For complex questions, the agent decomposes into subtasks, executes them via parallel sub-agents with dependency-aware DAG scheduling, and synthesizes results — all streamed in real time
- **Sub-Agent Delegation** — Spawns isolated sub-agents with full tool access (document search, web search, database queries) for deep analysis and cross-document comparison
- **Configurable Reranker** — Supports Cohere native Rerank API and OpenAI-compatible reranker endpoints. Enable/disable and configure in Settings
- **Thinking Model Support** — Real-time streaming of model reasoning traces (DeepSeek thinking models), XML tool call parsing, and progressive UI updates
- **Collapsible Filters** — File and topic filters with expand/collapse toggle for more chat space
- **Auto Thread Titles** — Conversations are automatically summarized into concise thread titles
- **Warm, Modern UI** — Anthropic-inspired light theme with streamed reasoning panels, task decomposition cards, subtask progress indicators, and expandable tool call cards

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Tailwind CSS, Vite |
| Backend | Python, FastAPI |
| Database | Supabase (Postgres + pgvector + Auth + Storage) |
| LLM | OpenAI-compatible API (DeepSeek, OpenAI, OpenRouter, Ollama, etc.) |
| Embeddings | DashScope (Alibaba Cloud) or any OpenAI-compatible endpoint |
| Reranker | Cohere Rerank API or OpenAI-compatible reranker |
| Web Search | Tavily Search API |
| OCR | Mistral OCR (for images and scanned PDFs) |
| Observability | LangSmith |

## Prerequisites

- **Python 3.11+** with conda (recommended) or pip
- **Node.js 18+** with `npm`
- **Supabase** account (free tier works) with a project set up
- **LLM API key** — DeepSeek (default), OpenAI, OpenRouter, or any OpenAI-compatible provider
- **Embedding API key** — DashScope (default) or any OpenAI-compatible embedding endpoint
- **Tavily API key** (optional) — for web search (a default shared key is pre-configured)
- **Cohere API key** (optional) — for reranking
- **Mistral API key** (optional) — for OCR on images and scanned PDFs

## Setup

### 1. Clone and install dependencies

```bash
git clone git@github.com:EveryCatchLiu/AgentRAG.git
cd AgentRAG

# Backend (conda)
conda create -n AgentRAG python=3.11
conda activate AgentRAG
cd backend
pip install -e .
cd ..

# Frontend
cd frontend
npm install
cd ..
```

### 2. Configure environment

Copy the example env files and fill in your credentials:

**`backend/.env`:**
```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# LLM (OpenAI-compatible)
OPENAI_API_KEY=your-deepseek-key
OPENAI_BASE_URL=https://api.deepseek.com
MODEL=deepseek-v4-flash

# Embedding
EMBEDDING_API_KEY=your-dashscope-key
EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_MODEL=text-embedding-v3

# Web Search (Tavily) — optional, defaults to pre-configured shared key
TAVILY_API_KEY=tvly-...

# Mistral OCR (optional)
MISTRAL_API_KEY=your-mistral-key

# LangSmith (optional)
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your-langsmith-key
LANGCHAIN_PROJECT=agentrag
```

**`frontend/.env`:**
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Set up Supabase

Run the migration SQL files in `backend/migrations/` in your Supabase SQL Editor, in numerical order:

1. `001_create_tables.sql` — Core schema
2. `002_match_chunks.sql` — Vector search function
3. `003_add_chunk_settings.sql` — Chunk size/overlap settings
4. `004_content_hash_dedup.sql` — Deduplication
5. `005_file_metadata.sql` — File metadata columns
6. `006_match_chunks_metadata_filter.sql` — Metadata filtering
7. `007_fix_match_chunks_overload.sql` — Function overload fix
8. `008_cascade_delete_chunks.sql` — Cascade deletes
9. `009_keyword_search.sql` — Keyword search RPC
10. `010_subagent_support.sql` — Message metadata

Also run these DDL statements to add new feature columns:

```sql
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS retrieval_method TEXT DEFAULT 'hybrid';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS enable_reranker BOOLEAN DEFAULT false;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS reranker_type TEXT DEFAULT 'cohere';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS reranker_api_key TEXT DEFAULT '';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS reranker_base_url TEXT DEFAULT '';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS reranker_model TEXT DEFAULT '';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS tavily_api_key TEXT DEFAULT '';
```

Enable Row-Level Security (RLS) on all tables and set up policies so users can only see their own data.

### 4. Start the application

```bash
# Terminal 1 — Backend
conda activate AgentRAG
cd backend
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Open **http://localhost:5173** in your browser.

## Architecture

```
User → React Frontend → FastAPI Backend → Supabase (DB + Auth + Storage)
                              ↓
                    OpenAI-compatible LLM API
                    (DeepSeek / OpenAI / OpenRouter / Ollama)
                              ↓
                    Tool Execution:
                    ├── search_web (Tavily Search API)
                    ├── query_database (NL → SQL)
                    ├── delegate_to_subagent (isolated doc + web analysis)
                    └── decompose_and_execute (DAG-based parallel sub-agents)
                              ↓
                    Real-time SSE Streaming → Frontend renders progressively
```

### Agent Loop

```
User Message → Retrieve Chunks (hybrid/vector/keyword) → Agent Loop
  ├── LLM decides: answer directly? call tools?
  ├── Tool calls executed (web search, DB query, sub-agent, decomposition)
  ├── Decomposition: LLM breaks question → DAG → parallel sub-agents → synthesize
  └── Final answer streamed via SSE in real-time
```

### Task Decomposition Flow

```
Complex Question
  → LLM decomposes into subtasks with dependency DAG
  → TaskOrchestrator executes: independent tasks in parallel (max 5), dependent tasks in sequence
  → Sub-agents run with full tool access (document search + web search + database)
  → Results synthesized by LLM into a comprehensive answer
  → All progress streamed in real-time: decomposition plan → subtask cards → final answer
```

## SSE Events

The chat endpoint streams Server-Sent Events in real-time:

| Event | Description |
|-------|-------------|
| `reasoning` | Thinking model's reasoning trace (streamed live) |
| `decomposition` | Task decomposition plan with subtask list |
| `subtask_start` | A subtask has started executing |
| `subtask_done` | A subtask has completed (with result preview) |
| `subtask_error` | A subtask failed (with error message) |
| `tool_calls` | Tool calls executed (with results and nested children) |
| `sources` | Retrieved document chunks used for the answer |
| `data` | Streaming text content (character-level) |
| `done` | Response complete |
| `error` | Error message |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/threads?user_id=` | List threads |
| `POST` | `/api/threads?user_id=` | Create thread |
| `DELETE` | `/api/threads/:id?user_id=` | Delete thread |
| `GET` | `/api/threads/:id/messages?user_id=` | Get messages |
| `POST` | `/api/threads/:id/messages?user_id=` | Send message (SSE stream) |
| `GET` | `/api/settings?user_id=` | Get user settings |
| `PUT` | `/api/settings/llm?user_id=` | Update LLM settings |
| `PUT` | `/api/settings/embedding?user_id=` | Update embedding settings |
| `PUT` | `/api/settings/retrieval?user_id=` | Update retrieval & reranker settings |
| `PUT` | `/api/settings/tools?user_id=` | Update tools settings (Tavily API key) |
| `POST` | `/api/files/upload?user_id=` | Upload file |
| `GET` | `/api/files?user_id=` | List files |
| `DELETE` | `/api/files/:id?user_id=` | Delete file |
| `GET` | `/api/files/metadata/filters?user_id=` | Get filter options |

## Settings

All settings are configurable per-user via the Settings page (no need to restart):

| Tab | Settings |
|-----|----------|
| **LLM** | API Key, Base URL, Model, Title Model, System Prompt |
| **Embedding** | API Key, Base URL, Model, Chunk Size, Chunk Overlap |
| **Retrieval** | Retrieval Method (hybrid/vector/keyword), Enable Reranker, Reranker Type (Cohere/OpenAI), API Key, Base URL, Model |
| **Tools** | Tavily Search API Key |

## Project Structure

```
AgentRAG/
├── backend/
│   ├── migrations/          # SQL migration files
│   ├── src/
│   │   ├── routers/         # FastAPI route handlers
│   │   │   ├── chunks.py    # Text chunking, embedding, hybrid search, reranking
│   │   │   ├── files.py     # File upload, processing pipeline, metadata extraction
│   │   │   ├── settings.py  # User settings CRUD
│   │   │   └── threads.py   # Chat, agent loop, SSE streaming, task decomposition
│   │   ├── agent.py         # Sub-agent executor (document + web + DB tools)
│   │   ├── config.py        # Environment configuration
│   │   ├── main.py          # FastAPI app entry
│   │   ├── models.py        # Pydantic models
│   │   ├── openai_client.py # LLM, embedding, and Mistral clients
│   │   ├── orchestrator.py  # Task decomposition, DAG scheduling, parallel execution
│   │   ├── supabase_client.py  # Supabase client
│   │   └── tools.py         # Tool definitions & executors (web search, DB, sub-agents)
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   │   ├── DecompositionCard.tsx  # Task decomposition plan visualization
│   │   │   ├── FilterBar.tsx          # Collapsible file/topic filter bar
│   │   │   ├── MarkdownMessage.tsx    # Markdown + LaTeX rendering
│   │   │   ├── ReasoningPanel.tsx     # Thinking model reasoning display
│   │   │   ├── SourceCard.tsx         # Retrieved chunk source display
│   │   │   ├── SubtaskCard.tsx        # Individual subtask status card
│   │   │   ├── ToolCallCard.tsx       # Expandable tool call card
│   │   │   └── WelcomeScreen.tsx      # Animated welcome screen
│   │   ├── contexts/        # Auth context
│   │   ├── lib/             # Zustand store, Supabase client
│   │   └── pages/           # Chat, Import, Login, Settings
│   └── package.json
├── CLAUDE.md                # Claude Code project instructions
└── README.md
```

## Model Configuration Notes

- **DeepSeek V4 Flash** (`deepseek-v4-flash`) is the default — fast responses without thinking overhead. Use `deepseek-v4-pro` for thinking mode with reasoning traces.
- **Any OpenAI-compatible endpoint** works — set `OPENAI_BASE_URL` and `MODEL` in `backend/.env` or via Settings UI.
- **Embeddings** default to DashScope's `text-embedding-v3` (1024-dim). If switching providers, update the `match_chunks` Postgres function to match the new embedding dimension.
- **Mistral OCR** uses `mistral-ocr-latest` model. PDFs are first tried with PyMuPDF; if the extracted text is < 100 characters, Mistral OCR is used as fallback.
- **Tavily Search** replaces DuckDuckGo for web search with more accurate, AI-optimized results. A default shared API key is pre-configured.
- **Cohere Rerank** (`rerank-v3.5`) provides dedicated cross-encoder reranking, significantly improving retrieval precision over LLM-based scoring.
