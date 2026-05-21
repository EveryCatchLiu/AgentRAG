# AgentRAG

An intelligent document assistant — upload files, ask questions, get answers grounded in your knowledge base. Built with a multi-tool agent that can search the web, query databases, and spawn sub-agents for deep document analysis.

## Features

- **Chat Interface** — Threaded conversations with streaming responses, Markdown rendering, and source attribution
- **File Import** — Upload PDF, DOCX, HTML, Markdown, CSV/TSV, and images (PNG/JPG/TIFF). Mistral OCR handles scanned PDFs and images automatically
- **Hybrid Search** — Vector (pgvector) + keyword retrieval with RRF fusion and LLM reranking for the most relevant results
- **Multi-Tool Agent** — The LLM autonomously chooses between web search (DuckDuckGo + weather API), database queries (NL → SQL), and document analysis
- **Sub-Agent Delegation** — Spawns isolated sub-agents with full document context for deep analysis, summarization, and cross-document comparison
- **Auto Thread Titles** — Conversations are automatically summarized into concise thread titles
- **Warm, Modern UI** — Anthropic-inspired light theme with animated welcome screen, Markdown rendering, and expandable tool call cards

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, TypeScript, Tailwind CSS, Vite |
| Backend | Python, FastAPI |
| Database | Supabase (Postgres + pgvector + Auth + Storage) |
| LLM | OpenAI-compatible API (DeepSeek, OpenAI, OpenRouter, Ollama, etc.) |
| Embeddings | DashScope (Alibaba Cloud) or any OpenAI-compatible endpoint |
| OCR | Mistral OCR (for images and scanned PDFs) |
| Observability | LangSmith |

## Prerequisites

- **Python 3.11+** with `pip`
- **Node.js 18+** with `npm`
- **Supabase** account (free tier works) with a project set up
- **LLM API key** — any OpenAI-compatible provider (DeepSeek, OpenAI, OpenRouter, Ollama, etc.)
- **Embedding API key** — DashScope (default) or any OpenAI-compatible embedding endpoint
- **Mistral API key** (optional) — only needed for OCR on images and scanned PDFs

## Setup

### 1. Clone and install dependencies

```bash
git clone git@github.com:EveryCatchLiu/AgentRAG.git
cd AgentRAG

# Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
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
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.deepseek.com
MODEL=deepseek-chat

# Embedding
EMBEDDING_API_KEY=your-dashscope-key
EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_MODEL=text-embedding-v3

# Mistral OCR (optional — for image/scanned PDF support)
MISTRAL_API_KEY=your-mistral-key

# LangSmith (optional — for tracing)
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
1. `001_create_tables.sql` — Core schema (files, chunks, threads, messages, user_settings)
2. `002_match_chunks.sql` — Vector search function
3. `003_add_chunk_settings.sql` — Chunk size/overlap settings
4. `004_content_hash_dedup.sql` — Deduplication support
5. `005_file_metadata.sql` — File metadata columns
6. `006_match_chunks_metadata_filter.sql` — Metadata filtering in search
7. `007_fix_match_chunks_overload.sql` — Fix function overload
8. `008_cascade_delete_chunks.sql` — Cascade deletes
9. `009_keyword_search.sql` — Keyword search RPC
10. `010_subagent_support.sql` — Metadata column for messages

Also enable Row-Level Security (RLS) on all tables and set up policies so users can only see their own data.

### 4. Start the application

```bash
# Terminal 1 — Backend
cd backend
source venv/bin/activate
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
                    ├── search_web (DuckDuckGo + weather API)
                    ├── query_database (NL → SQL)
                    └── delegate_to_subagent (isolated doc analysis)
                              ↓
                    SSE Streaming → Frontend renders Markdown
```

### File Processing Pipeline

```
Upload → Extract text → Chunk → Embed → Store in pgvector
  │          │
  │          ├── PDF: PyMuPDF (text) / Mistral OCR (scanned)
  │          ├── DOCX: python-docx
  │          ├── Images (PNG/JPG/TIFF): Mistral OCR
  │          └── HTML/MD/CSV/TSV: parsers
  │
  └── LLM extracts metadata (title, author, topics, summary) → stored in files.metadata
```

## Model Configuration Notes

- **DeepSeek models** (`deepseek-chat`, `deepseek-reasoner`) are thinking models that generate `reasoning_content`. The backend preserves this in message history. Use at least `max_tokens=500` for any generation task — smaller values may produce empty output as tokens get consumed by reasoning.

- **Any OpenAI-compatible endpoint** works — set `OPENAI_BASE_URL` and `MODEL` in `backend/.env`. Tested with DeepSeek, OpenAI, and OpenRouter.

- **Embeddings** default to DashScope's `text-embedding-v3` (1024-dim). If switching providers, update the `match_chunks` Postgres function to match the new embedding dimension.

- **Mistral OCR** uses `mistral-ocr-latest` model. Images are base64-encoded and sent via the Mistral SDK. PDFs are first tried with PyMuPDF; if the extracted text is < 100 characters, Mistral OCR is used as fallback.

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
| `POST` | `/api/files/upload?user_id=` | Upload file |
| `GET` | `/api/files?user_id=` | List files |
| `DELETE` | `/api/files/:id?user_id=` | Delete file |
| `GET` | `/api/files/metadata/filters?user_id=` | Get filter options |

## SSE Events

The chat endpoint streams Server-Sent Events:

| Event | Description |
|-------|-------------|
| `reasoning` | Thinking model's reasoning trace |
| `tool_calls` | Tool calls executed (with results) |
| `sources` | Retrieved document chunks |
| `data` | Streaming text content |
| `done` | Response complete |
| `error` | Error message |

## Project Structure

```
AgentRAG/
├── backend/
│   ├── migrations/       # SQL migration files
│   ├── src/
│   │   ├── routers/      # FastAPI route handlers
│   │   ├── agent.py      # Sub-agent executor
│   │   ├── config.py     # Environment configuration
│   │   ├── main.py       # FastAPI app entry
│   │   ├── models.py     # Pydantic models
│   │   ├── openai_client.py  # LLM + Mistral clients
│   │   ├── supabase_client.py  # Supabase client
│   │   └── tools.py      # Tool definitions & executors
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── contexts/     # Auth context
│   │   ├── lib/          # Store, Supabase client
│   │   └── pages/        # Chat, Import, Login, Settings
│   └── package.json
└── README.md
```
