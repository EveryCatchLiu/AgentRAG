# Retrieval & Reranker Settings Module

## Summary
Add a "Retrieval" tab to the Settings page with configurable retrieval method (hybrid/vector/keyword) and an optional Reranker API integration supporting both Cohere native and OpenAI-compatible formats.

## Components

### Frontend: Settings.tsx
- New "Retrieval" tab alongside "LLM" and "Embedding"
- Retrieval Method: radio group (Hybrid / Vector only / Keyword only)
- Enable Reranker: toggle switch
- When enabled, show Reranker config:
  - Reranker Type: dropdown (Cohere / OpenAI compatible)
  - API Key, Base URL, Model fields
- Save button with same saving/saved pattern

### Backend: settings.py
- New `RetrievalSettings` Pydantic model
- New `PUT /api/settings/retrieval` endpoint
- `GET /api/settings` unchanged (returns full row)

### Backend: chunks.py
- `search_chunks` reads `retrieval_method` to choose search path:
  - "hybrid": vector + keyword + RRF (current behavior)
  - "vector": vector-only, skip keyword/RRF
  - "keyword": keyword-only, skip vector/RRF
- `_llm_rerank` replaced by `_rerank` that:
  - Checks `enable_reranker`
  - Cohere type: calls `POST /v2/rerank` with `{model, query, documents, top_n}`
  - OpenAI type: uses existing Chat Completions prompt-based scoring
  - Falls back to raw similarity scores on error

### Database
New columns on `user_settings`:
- `retrieval_method` text (default: "hybrid")
- `enable_reranker` boolean (default: false)
- `reranker_type` text (default: "cohere")
- `reranker_api_key` text
- `reranker_base_url` text
- `reranker_model` text
