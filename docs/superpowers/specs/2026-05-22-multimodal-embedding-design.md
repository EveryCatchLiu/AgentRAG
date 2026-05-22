# Multimodal Embedding + Chat Upgrade

**Date**: 2026-05-22
**Status**: Approved

## Goals

1. Switch embedding model from `text-embedding-v3` to `qwen3-vl-embedding` on Alibaba Bailian (DashScope)
2. Support multimodal embedding (text, image, video) with fused vectors in Supabase
3. Move LLM API from `api.deepseek.com` to Alibaba Bailian platform (still default to DeepSeek-v4-flash)
4. Support user uploading images/videos in chat; auto-route multimodal tasks to qwen3-vl model
5. Display retrieved media (images/videos) in frontend chat with lightbox support

## Architecture

```
                    ┌──────────────────────────────┐
                    │     Alibaba Bailian API       │
                    │  ┌─────────────────────────┐  │
                    │  │ LLM: deepseek-v4-flash   │  │  ← text-only
                    │  │ LLM: qwen3-vl (fallback) │  │  ← multimodal
                    │  │ Embed: qwen3-vl-embedding│  │  ← multimodal
                    │  └─────────────────────────┘  │
                    └──────────────────────────────┘
                           ▲              ▲
                           │              │
              ┌────────────┴──┐  ┌────────┴─────────┐
              │  Chat (SSE)   │  │  File Processing  │
              │  text+media   │  │  text+media chunks│
              └───────────────┘  └───────────────────┘
```

### Pipeline: File → Embed → Store
```
file → extract text + media (images/video frames)
     → split into chunks (chunk = text + optional media refs)
     → embed via DashScope multimodal API (fused vector, 2560-dim)
     → store in Supabase chunks with media_type/media_url
```

### Pipeline: Chat → Retrieve → Answer
```
user msg (text + optional images/video)
     → multimodal embed query
     → hybrid search in Supabase (vector 2560 + keyword)
     → retrieved chunks include media_url/media_type
     → if multimodal task → route to qwen3-vl
     → if text-only → route to deepseek-v4-flash
     → stream answer + sources (with media thumbnails)
```

## Changes

### 1. config.py — New defaults
- `openai_base_url`: `"https://api.deepseek.com"` → `"https://dashscope.aliyuncs.com/compatible-mode/v1"`
- `model`: `"deepseek-v4-flash"` (unchanged — still DeepSeek via Bailian)
- `embedding_model`: `"text-embedding-v3"` → `"qwen3-vl-embedding"`
- New: `multimodal_model: str = "qwen3-vl"` — fallback for multimodal tasks
- New: `enable_embedding_fusion: bool = True`

### 2. .env
- `OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`
- `MODEL=deepseek-v4-flash`
- `EMBEDDING_MODEL=qwen3-vl-embedding`
- New: `MULTIMODAL_MODEL=qwen3-vl`

### 3. openai_client.py — Multimodal embedding + model routing
- New `get_multimodal_embedding(contents, enable_fusion)` — calls DashScope multimodal endpoint
  - Endpoint: `POST https://dashscope.aliyuncs.com/api/v1/services/embeddings/multimodal-embedding/multimodal-embedding`
  - Uses `urllib` directly (no extra dependency)
  - Supports `{"text": "..."}`, `{"image": "data:image/...;base64,..."}`, `{"video": "https://..."}`
- New `resolve_model(messages, user_settings)` — detects if any message has image/video content → returns `multimodal_model` else `model`

### 4. chunks.py — Multimodal chunk processing
- `get_embedding()` → `get_multimodal_embedding_from_contents(contents)` — calls new multimodal API
- `process_file()` updated:
  - Image files: extract OCR text (existing) + store media reference alongside text chunk → fused embedding
  - Video files: extract keyframes via ffmpeg, upload to Supabase Storage with public URL, store media refs
  - New `media_type` and `media_url` fields on each chunk row
- `search_chunks()` — returns `media_type` and `media_url` in results for frontend display

### 5. Supabase Migration
- `chunks` table:
  - `ALTER COLUMN embedding TYPE vector(2560)`
  - Add columns: `media_type text`, `media_url text`
  - Drop/recreate HNSW index for new dimension
- Existing chunks: mark all files as `status = 'outdated'`

### 6. threads.py — Multimodal chat messages
- `SendMessageRequest` expands: add `media` field (list of `{type: "image"|"video", data: base64_string}`)
- `send_message()`:
  - Detect multimodal input → use `multimodal_model` for LLM calls
  - Build multimodal message content for LLM API (Bailian OpenAI-compatible format supports `image_url` / `video_url` in vision models)
  - For search: embed query text + uploaded media via fused multimodal embedding
  - Return `media_type`/`media_url` in sources SSE event

### 7. settings.py (router)
- `LLMSettings`: add `llm_multimodal_model` field
- `EmbeddingSettings.embedding_model` default → `"qwen3-vl-embedding"`

### 8. Frontend — Chat.tsx + store.ts
- Chat input: add image/video upload button (clip icon), preview thumbnails before send
- `Message` type: add `media?: {type: string, data: string, previewUrl?: string}[]`
- `Source` type: add `media_type?: string`, `media_url?: string`
- `SourceCard` component: if source has `media_url`, render thumbnail (image) or video player; click → lightbox/modal for full-size view
- New `MediaLightbox` component: fullscreen overlay with zoom, prev/next navigation

### 9. WelcomeScreen.tsx — Update default hints
- Add multimodal example prompts mentioning image/video analysis

## Model Routing Logic

```
def resolve_model(messages, user_settings):
    for msg in messages:
        if msg has image_content or video_content:
            return user_settings.get("llm_multimodal_model") or settings.multimodal_model  # qwen3-vl
    return user_settings.get("llm_model") or settings.model  # deepseek-v4-flash
```

This runs BEFORE each LLM call — tool-calling rounds and final answer may use different models if context changes.

## Error Handling
- Embedding API: retry once (5s backoff), image >5MB → downsample, video URL not public → warn + text-only fallback
- LLM API: if multimodal model fails, retry with text-only content on deepseek-v4-flash
- Frontend: file upload size limit 50MB for video, 10MB for images; show progress bar during upload
- Missing API key → clear error in SSE stream

## Supabase Migration Plan
1. Drop vector index on `chunks.embedding`
2. `ALTER TABLE chunks ADD COLUMN IF NOT EXISTS media_type text`
3. `ALTER TABLE chunks ADD COLUMN IF NOT EXISTS media_url text`
4. `ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(2560)`
5. Recreate HNSW index with new dimension
6. `UPDATE files SET status = 'outdated'` (old embeddings are incompatible)