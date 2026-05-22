# Multimodal Embedding + Chat Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch to qwen3-vl-embedding (2560-dim multimodal vectors), move LLM to Alibaba Bailian platform with auto-routing (text→DeepSeek-v4-flash, multimodal→qwen3-vl), add chat media upload, and display retrieved media in frontend with lightbox.

**Architecture:** Replace OpenAI-compatible embedding with direct DashScope multimodal API calls. Extend chunks table with media columns. Add media upload to chat input and auto-route LLM calls based on presence of image/video content. Frontend gains media preview, thumbnail sources, and a lightbox component.

**Tech Stack:** Python/FastAPI backend, urllib for DashScope API, React/TypeScript/Vite frontend, Supabase pgvector (2560-dim), Tailwind CSS

---

## File Structure Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/.env` | Modify | New API base URL, model names |
| `backend/src/config.py` | Modify | New settings fields |
| `backend/src/openai_client.py` | Modify | Multimodal embed func, model router |
| `backend/src/routers/chunks.py` | Modify | Multimodal chunk processing, extended search results |
| `backend/src/routers/threads.py` | Modify | Multimodal chat messages, model routing in agent loop |
| `backend/src/routers/settings.py` | Modify | New multimodal_model setting |
| `frontend/src/lib/store.ts` | Modify | Extended Message/Source types |
| `frontend/src/pages/Chat.tsx` | Modify | Media upload input, media in messages |
| `frontend/src/components/SourceCard.tsx` | Modify | Media thumbnail + lightbox trigger |
| `frontend/src/components/MediaLightbox.tsx` | Create | Fullscreen image/video viewer |
| `frontend/src/components/MediaPreview.tsx` | Create | Thumbnail preview in chat input area |
| `backend/migrations/001_multimodal_embedding.sql` | Create | DB schema migration |

---

### Task 1: Config & Environment Foundation

**Files:**
- Modify: `backend/.env`
- Modify: `backend/src/config.py`

- [ ] **Step 1: Update .env with new defaults**

Edit `backend/.env`:

```
# Supabase
SUPABASE_URL=https://REDACTED.supabase.co
SUPABASE_SERVICE_ROLE_KEY=REDACTED_SUPABASE_JWT

# LLM (via Alibaba Bailian platform)
OPENAI_API_KEY=REDACTED_DEEPSEEK_KEY
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
MODEL=deepseek-v4-flash
MULTIMODAL_MODEL=qwen3-vl

# Embedding (DashScope multimodal)
EMBEDDING_API_KEY=REDACTED_DASHSCOPE_KEY
EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_MODEL=qwen3-vl-embedding

# Mistral OCR
MISTRAL_API_KEY=REDACTED_MISTRAL_KEY

# LangSmith
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=LANGSMITH_KEY_REMOVED
LANGCHAIN_PROJECT=agentrag-module1
```

- [ ] **Step 2: Update config.py with new settings**

Edit `backend/src/config.py`:

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    openai_api_key: str = ""
    openai_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    model: str = "deepseek-v4-flash"
    multimodal_model: str = "qwen3-vl"
    embedding_api_key: str = ""
    embedding_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    embedding_model: str = "qwen3-vl-embedding"
    enable_embedding_fusion: bool = True
    mistral_api_key: str = ""
    tavily_api_key: str = "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"
    langchain_tracing_v2: str = "true"
    langchain_api_key: str = ""
    langchain_project: str = "agentrag-module1"

    model_config = {"env_prefix": "", "env_file": ".env"}


settings = Settings()
```

- [ ] **Step 3: Verify config loads correctly**

```bash
cd backend && conda activate AgentRAG && python -c "from src.config import settings; print(settings.model); print(settings.multimodal_model); print(settings.embedding_model); print(settings.openai_base_url)"
```

Expected output:
```
deepseek-v4-flash
qwen3-vl
qwen3-vl-embedding
https://dashscope.aliyuncs.com/compatible-mode/v1
```

- [ ] **Step 4: Commit**

```bash
git add backend/.env backend/src/config.py
git commit -m "feat: switch to Bailian platform, add multimodal embedding and model config"
```

---

### Task 2: Multimodal Embedding API Function

**Files:**
- Modify: `backend/src/openai_client.py`

- [ ] **Step 1: Add get_multimodal_embedding function**

Edit `backend/src/openai_client.py` — add after the imports, before `create_llm_client`:

```python
import json
import urllib.request
import urllib.error


MULTIMODAL_EMBEDDING_URL = (
    "https://dashscope.aliyuncs.com/api/v1/services/embeddings"
    "/multimodal-embedding/multimodal-embedding"
)


def get_multimodal_embedding(
    contents: list[dict],
    api_key: str = "",
    enable_fusion: bool = True,
) -> list[float]:
    """Generate multimodal embedding via DashScope API.

    contents: list of dicts like {"text": "..."}, {"image": "data:image/...;base64,..."},
              or {"video": "https://..."}
    enable_fusion: if True, all inputs fused into a single vector

    Returns a single embedding vector (list of floats).
    """
    key = api_key or settings.embedding_api_key
    if not key:
        raise ValueError("Embedding API key is required")

    # Downsample large base64 images (>5MB)
    processed = []
    for item in contents:
        if "image" in item:
            img = item["image"]
            if img.startswith("data:") and len(img) > 5 * 1024 * 1024:
                img = _downsample_base64_image(img)
            processed.append({"image": img})
        else:
            processed.append(item)

    body = json.dumps({
        "model": settings.embedding_model,
        "input": {"contents": processed},
        "parameters": {"enable_fusion": enable_fusion},
    }).encode("utf-8")

    req = urllib.request.Request(
        MULTIMODAL_EMBEDDING_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
    )

    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode())
            embeddings = data.get("output", {}).get("embeddings", [])
            if embeddings:
                return embeddings[0].get("embedding", [])
            return []
        except urllib.error.HTTPError as e:
            body_text = e.read().decode() if e.fp else ""
            if attempt == 0:
                import time
                time.sleep(5)
                continue
            raise RuntimeError(
                f"Multimodal embedding API error {e.code}: {body_text}"
            ) from e
    return []


def _downsample_base64_image(data_uri: str, max_size: int = 2048) -> str:
    """Resize a base64 image to max_size on longest side using PIL."""
    import base64
    import io
    try:
        from PIL import Image
    except ImportError:
        return data_uri

    header, b64data = data_uri.split(",", 1)
    img_bytes = base64.b64decode(b64data)
    img = Image.open(io.BytesIO(img_bytes))
    w, h = img.size
    if max(w, h) > max_size:
        ratio = max_size / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
    buf = io.BytesIO()
    fmt = img.format or "JPEG"
    img.save(buf, format=fmt, quality=85)
    return f"{header},{base64.b64encode(buf.getvalue()).decode()}"
```

- [ ] **Step 2: Verify import works**

```bash
cd backend && conda activate AgentRAG && python -c "from src.openai_client import get_multimodal_embedding; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/src/openai_client.py
git commit -m "feat: add multimodal embedding function via DashScope API"
```

---

### Task 3: Update Chunk Processing for Multimodal Embedding

**Files:**
- Modify: `backend/src/routers/chunks.py`

- [ ] **Step 1: Rewrite get_embedding to use multimodal API**

Replace the existing `get_embedding` function in `backend/src/routers/chunks.py` (lines 71-90):

```python
def get_embedding(text: str, user_settings: dict = None) -> list[float]:
    """Generate multimodal embedding. Wraps text in a contents array for the multimodal API."""
    api_key = ""
    if user_settings and user_settings.get("embedding_api_key"):
        api_key = user_settings["embedding_api_key"]
    return get_multimodal_embedding(
        contents=[{"text": text}],
        api_key=api_key,
        enable_fusion=True,
    )
```

Update the import at top of `backend/src/routers/chunks.py` (line 9):
Change:
```python
from src.openai_client import create_embedding_client
```
To:
```python
from src.openai_client import get_multimodal_embedding
```

- [ ] **Step 2: Add media support to process_file**

In `process_file()` (around line 323), update the chunk insertion to include `media_type` and `media_url`:

```python
for i, chunk_text in enumerate(chunks):
    try:
        # Build multimodal contents: text + any media references
        contents = [{"text": chunk_text}]

        # For image files, include the image in the embedding
        media_type = None
        media_url = None
        ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        if ext in ("png", "jpg", "jpeg", "tiff", "tif", "bmp", "webp"):
            media_type = "image"
            # Store the file's public URL in Supabase Storage
            media_url = supabase.storage.from_("documents").get_public_url(storage_path)
            # Include image as base64 in embedding contents
            try:
                img_b64 = base64.b64encode(file_content).decode("utf-8")
                mime = f"image/{'jpeg' if ext in ('jpg', 'jpeg') else ext}"
                contents.append({"image": f"data:{mime};base64,{img_b64}"})
            except Exception:
                pass

        embedding = get_multimodal_embedding(contents, api_key="")
        supabase.table("chunks").insert({
            "id": str(uuid.uuid4()),
            "file_id": file_id,
            "content": chunk_text,
            "embedding": embedding,
            "chunk_index": i,
            "media_type": media_type,
            "media_url": media_url,
        }).execute()
    except Exception as e:
        print(f"Error processing chunk {i}: {e}")
        continue
```

Add `import base64` at the top of the file.

- [ ] **Step 3: Extend search_chunks to return media fields**

In `search_chunks()`, in the fallback section (around line 590), update the select to include media fields:

```python
result = supabase.table("chunks").select(
    "content, chunk_index, file_id, media_type, media_url, files!inner(filename)"
).limit(50).execute()
```

In the scored fallback loop, include `media_type` and `media_url`:
```python
scored.append({
    "content": chunk["content"],
    "similarity": score / len(keywords),
    "filename": chunk["files"]["filename"],
    "chunk_index": chunk["chunk_index"],
    "file_id": chunk["file_id"],
    "media_type": chunk.get("media_type"),
    "media_url": chunk.get("media_url"),
})
```

Also update the `sources_payload` in `threads.py` to include `media_type` and `media_url` (this will be done in Task 6).

- [ ] **Step 4: Verify chunk module loads**

```bash
cd backend && conda activate AgentRAG && python -c "from src.routers.chunks import get_embedding, process_file, search_chunks; print('OK')"
```

Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add backend/src/routers/chunks.py
git commit -m "feat: switch chunk embedding to multimodal API, add media columns"
```

---

### Task 4: Supabase Database Migration

**Files:**
- Create: `backend/migrations/001_multimodal_embedding.sql`

- [ ] **Step 1: Write migration SQL**

Create `backend/migrations/001_multimodal_embedding.sql`:

```sql
-- Drop existing HNSW index (must drop before altering column type)
DROP INDEX IF EXISTS chunks_embedding_idx;

-- Add media columns
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS media_url text;

-- Alter embedding dimension from 1024 → 2560
-- Note: This will fail if there are existing rows with different dimension vectors.
-- Safe approach: recreate the column
ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(2560);

-- Recreate HNSW index for 2560-dim vectors
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

-- Mark existing files for re-processing (old embedding dims are incompatible)
UPDATE files SET status = 'outdated' WHERE status = 'done';
```

- [ ] **Step 2: Run migration in Supabase SQL Editor**

Open Supabase dashboard → SQL Editor → paste and run the migration SQL.

Verify with:
```sql
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'chunks' AND column_name IN ('embedding', 'media_type', 'media_url');
```

Expected: `embedding` → `USER-DEFINED` / `vector`, `media_type` → `text`, `media_url` → `text`

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/001_multimodal_embedding.sql
git commit -m "feat: add DB migration for 2560-dim vectors and media columns"
```

---

### Task 5: Model Routing Logic

**Files:**
- Modify: `backend/src/openai_client.py`

- [ ] **Step 1: Add resolve_model function**

Add to `backend/src/openai_client.py`:

```python
def resolve_model(messages: list[dict], user_settings: dict = None) -> str:
    """Determine which model to use based on message content.

    If any message contains image or video → multimodal_model (qwen3-vl).
    Otherwise → default model (deepseek-v4-flash).
    """
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, list):
            # Multimodal content array: check for image_url or video_url parts
            for part in content:
                if isinstance(part, dict) and (
                    part.get("type") in ("image_url", "video_url")
                    or "image_url" in part
                    or "video_url" in part
                ):
                    mm = (user_settings or {}).get("llm_multimodal_model")
                    return mm or settings.multimodal_model
        elif isinstance(content, str):
            # Check for base64 images or video refs embedded in text
            if "data:image/" in content or "data:video/" in content:
                mm = (user_settings or {}).get("llm_multimodal_model")
                return mm or settings.multimodal_model

    return (user_settings or {}).get("llm_model") or settings.model
```

- [ ] **Step 2: Verify function**

```bash
cd backend && conda activate AgentRAG && python -c "
from src.openai_client import resolve_model
# Text-only → deepseek-v4-flash
print(resolve_model([{'role': 'user', 'content': 'hello'}]))
# Multimodal → qwen3-vl
print(resolve_model([{'role': 'user', 'content': [{'type': 'text', 'text': 'hello'}, {'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,abc'}}]}]))
"
```

Expected:
```
deepseek-v4-flash
qwen3-vl
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/openai_client.py
git commit -m "feat: add model routing based on multimodal content detection"
```

---

### Task 6: Update Chat API for Multimodal Messages

**Files:**
- Modify: `backend/src/routers/threads.py`

- [ ] **Step 1: Update SendMessageRequest model**

Replace the `SendMessageRequest` class (around line 256):

```python
class MediaAttachment(BaseModel):
    type: str  # "image" or "video"
    data: str  # base64 encoded (without data URI prefix for images; URL for videos)


class SendMessageRequest(BaseModel):
    content: str
    media: list[MediaAttachment] | None = None
    filter_file_ids: list[str] | None = None
    filter_topics: list[str] | None = None
    filter_doc_types: list[str] | None = None
```

- [ ] **Step 2: Build multimodal LLM messages in send_message**

In `send_message()` (around line 437), update the LLM messages array construction to support multimodal content. Replace the message-building section:

```python
# Build the user message content (text or multimodal)
user_content: str | list[dict] = request.content
if request.media:
    parts = [{"type": "text", "text": request.content}]
    for m in request.media:
        if m.type == "image":
            parts.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{m.data}"},
            })
        elif m.type == "video":
            # For video in chat, use a frame as image preview since DeepSeek
            # doesn't support video; qwen3-vl may accept video URL
            parts.append({
                "type": "video_url",
                "video_url": {"url": m.data},
            })
    user_content = parts

# Save user message (store text + media metadata)
supabase.table("messages").insert({
    "id": str(uuid.uuid4()),
    "thread_id": thread_id,
    "role": "user",
    "content": request.content,
}).execute()
```

- [ ] **Step 3: Use resolve_model in agent loop**

In `run_agent_loop()` — before each LLM call, resolve the model. Add near line 480:

```python
# Resolve model based on whether current messages have media
current_model = resolve_model(messages, user_settings)

tool_response = llm_client.chat.completions.create(
    model=current_model,
    messages=messages,
    tools=TOOLS,
    tool_choice="auto",
)
```

Do the same for the synthesis call and the streaming final answer call.

- [ ] **Step 4: Add multimodal embedding for search query**

In `send_message()`, update the chunk search to use multimodal embedding when media is present (around line 395):

```python
# Retrieve relevant chunks with multimodal embedding
if request.media:
    contents = [{"text": request.content}]
    for m in request.media:
        if m.type == "image":
            contents.append({"image": f"data:image/jpeg;base64,{m.data}"})
        elif m.type == "video":
            contents.append({"video": m.data})
    query_embedding = get_multimodal_embedding(contents, api_key="")
else:
    query_embedding = get_embedding(request.content, user_settings)
```

Note: For `search_chunks`, we need to pass the pre-computed embedding. Update `search_chunks` signature to accept an optional `query_embedding` parameter.

- [ ] **Step 5: Update search_chunks to accept pre-computed embedding**

In `backend/src/routers/chunks.py`, update the `search_chunks` function signature:

```python
def search_chunks(
    query: str,
    top_k: int = 5,
    user_settings: dict = None,
    filter_file_ids: list[str] | None = None,
    filter_topics: list[str] | None = None,
    filter_doc_types: list[str] | None = None,
    query_embedding: list[float] | None = None,
) -> list[dict]:
```

And in the vector search section, use `query_embedding` if provided:
```python
if retrieval_method in ("hybrid", "vector"):
    embedding = query_embedding or get_embedding(query, user_settings)
    ...
```

- [ ] **Step 6: Update sources SSE to include media**

In `send_message()`, update the sources payload (around line 653):

```python
sources_payload.append({
    "content": chunk["content"],
    "similarity": round(chunk.get("similarity", 0), 4),
    "filename": chunk.get("filename", ""),
    "chunk_index": chunk.get("chunk_index", 0),
    "file_id": chunk.get("file_id", ""),
    "media_type": chunk.get("media_type"),
    "media_url": chunk.get("media_url"),
})
```

- [ ] **Step 7: Verify the router loads**

```bash
cd backend && conda activate AgentRAG && python -c "from src.routers.threads import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 8: Commit**

```bash
git add backend/src/routers/threads.py backend/src/routers/chunks.py
git commit -m "feat: add multimodal chat messages, media-aware search, model routing in agent loop"
```

---

### Task 7: Update Settings API

**Files:**
- Modify: `backend/src/routers/settings.py`

- [ ] **Step 1: Add multimodal_model to LLMSettings**

In `backend/src/routers/settings.py`, update the `LLMSettings` class:

```python
class LLMSettings(BaseModel):
    llm_api_key: str
    llm_base_url: str = ""
    llm_model: str = ""
    llm_multimodal_model: str = ""
    llm_title_model: str = ""
    llm_system_prompt: str = ""
```

Update `EmbeddingSettings.embedding_model` default:
```python
class EmbeddingSettings(BaseModel):
    embedding_api_key: str
    embedding_base_url: str = ""
    embedding_model: str = "qwen3-vl-embedding"
    chunk_size: int = 1000
    chunk_overlap: int = 200
```

- [ ] **Step 2: Verify**

```bash
cd backend && conda activate AgentRAG && python -c "from src.routers.settings import LLMSettings; print(LLMSettings.model_fields['llm_multimodal_model'].default)"
```

Expected: `""`

- [ ] **Step 3: Commit**

```bash
git add backend/src/routers/settings.py
git commit -m "feat: add multimodal model field to settings API"
```

---

### Task 8: Update Frontend Store Types

**Files:**
- Modify: `frontend/src/lib/store.ts`

- [ ] **Step 1: Extend Message and Source types**

In `frontend/src/lib/store.ts`:

```typescript
export interface MediaAttachment {
  type: "image" | "video"
  data: string  // base64 for images, URL for videos
  previewUrl?: string  // object URL for local preview
}

export interface Source {
  content: string
  similarity: number
  filename: string
  chunk_index: number
  file_id: string
  media_type?: string | null
  media_url?: string | null
}

// ... keep existing interfaces ...

export interface Message {
  role: "user" | "assistant"
  content: string
  media?: MediaAttachment[]
  sources?: Source[]
  toolCalls?: ToolCall[]
  reasoning?: string[]
  decomposition?: Decomposition
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors related to store.ts

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/store.ts
git commit -m "feat: extend frontend types for media attachments and multimodal sources"
```

---

### Task 9: Create MediaLightbox Component

**Files:**
- Create: `frontend/src/components/MediaLightbox.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/components/MediaLightbox.tsx`:

```tsx
import { useEffect, useCallback } from "react"
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react"
import { useState } from "react"

interface MediaItem {
  url: string
  type: "image" | "video"
  filename?: string
}

interface MediaLightboxProps {
  items: MediaItem[]
  currentIndex: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}

export default function MediaLightbox({
  items,
  currentIndex,
  onClose,
  onPrev,
  onNext,
}: MediaLightboxProps) {
  const [zoomed, setZoomed] = useState(false)
  const current = items[currentIndex]

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowLeft") onPrev()
      if (e.key === "ArrowRight") onNext()
    },
    [onClose, onPrev, onNext]
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = ""
    }
  }, [handleKeyDown])

  if (!current) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Counter */}
      <div className="absolute top-4 left-4 text-sm text-white/70">
        {currentIndex + 1} / {items.length}
      </div>

      {/* Filename */}
      {current.filename && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-sm text-white/80 truncate max-w-[60%]">
          {current.filename}
        </div>
      )}

      {/* Prev button */}
      {items.length > 1 && (
        <button
          onClick={onPrev}
          className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
      )}

      {/* Content */}
      <div className="flex items-center justify-center max-w-[90vw] max-h-[90vh]">
        {current.type === "image" ? (
          <img
            src={current.url}
            alt={current.filename || ""}
            className={`object-contain rounded-lg transition-transform duration-200 ${
              zoomed ? "scale-150 cursor-zoom-out" : "cursor-zoom-in"
            }`}
            style={{ maxWidth: "90vw", maxHeight: "90vh" }}
            onClick={() => setZoomed(!zoomed)}
          />
        ) : (
          <video
            src={current.url}
            controls
            autoPlay
            className="max-w-[90vw] max-h-[90vh] rounded-lg"
          />
        )}
      </div>

      {/* Next button */}
      {items.length > 1 && (
        <button
          onClick={onNext}
          className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      )}

      {/* Zoom toggle for images */}
      {current.type === "image" && (
        <button
          onClick={() => setZoomed(!zoomed)}
          className="absolute bottom-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
        >
          {zoomed ? <ZoomOut className="h-5 w-5" /> : <ZoomIn className="h-5 w-5" />}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/MediaLightbox.tsx
git commit -m "feat: add MediaLightbox component for fullscreen image/video viewing"
```

---

### Task 10: Update SourceCard for Media Display

**Files:**
- Modify: `frontend/src/components/SourceCard.tsx`

- [ ] **Step 1: Add media thumbnail and lightbox trigger**

Rewrite `frontend/src/components/SourceCard.tsx`:

```tsx
import { useState } from "react"
import { ChevronDown, ChevronUp, FileText, Image, Video } from "lucide-react"
import type { Source } from "../lib/store"
import MediaLightbox from "./MediaLightbox"

interface SourceCardProps {
  source: Source
  onMediaClick?: (url: string, type: "image" | "video") => void
}

function SourceCard({ source, onMediaClick }: SourceCardProps) {
  const [expanded, setExpanded] = useState(false)
  const similarityPercent = Math.round(source.similarity * 100)
  const hasMedia = source.media_url && source.media_type

  return (
    <div className="mt-1 rounded-lg border border-[#f0e0c8] bg-[#fefcf9] text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#fdf8f2]"
      >
        {hasMedia ? (
          source.media_type === "video" ? (
            <Video className="h-3 w-3 shrink-0 text-[#b8a48e]" />
          ) : (
            <Image className="h-3 w-3 shrink-0 text-[#b8a48e]" />
          )
        ) : (
          <FileText className="h-3 w-3 shrink-0 text-[#b8a48e]" />
        )}
        <span className="truncate font-medium text-[#8b5e3c]">{source.filename}</span>
        <span className="shrink-0 text-[#d4905e] font-medium">
          {similarityPercent}% match
        </span>
        {expanded ? (
          <ChevronUp className="ml-auto h-3 w-3 shrink-0 text-[#b8a48e]" />
        ) : (
          <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-[#b8a48e]" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-[#f0e0c8] px-3 py-2 text-[#9e8b78]">
          {/* Media thumbnail */}
          {hasMedia && (
            <div className="mb-2">
              {source.media_type === "image" ? (
                <img
                  src={source.media_url!}
                  alt={source.filename}
                  className="w-full max-h-48 object-cover rounded-md cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => onMediaClick?.(source.media_url!, "image")}
                />
              ) : source.media_type === "video" ? (
                <div
                  className="relative w-full max-h-48 bg-black rounded-md cursor-pointer overflow-hidden"
                  onClick={() => onMediaClick?.(source.media_url!, "video")}
                >
                  <video
                    src={source.media_url!}
                    className="w-full max-h-48 object-cover opacity-70"
                    muted
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-full bg-white/80 p-2">
                      <svg className="h-5 w-5 text-[#8b5e3c]" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="8,5 19,12 8,19" />
                      </svg>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
          <p className="whitespace-pre-wrap text-xs leading-relaxed">
            {source.content}
          </p>
        </div>
      )}
    </div>
  )
}

export default function SourceList({ sources }: { sources: Source[] }) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  if (!sources || sources.length === 0) return null

  const mediaSources = sources
    .filter((s) => s.media_url && s.media_type)
    .map((s) => ({
      url: s.media_url!,
      type: s.media_type as "image" | "video",
      filename: s.filename,
    }))

  const handleMediaClick = (url: string, type: "image" | "video") => {
    const idx = mediaSources.findIndex((m) => m.url === url)
    setLightboxIndex(idx >= 0 ? idx : 0)
    setLightboxOpen(true)
  }

  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs font-medium text-[#b8a48e]">
        Sources ({sources.length})
      </p>
      {sources.map((s, i) => (
        <SourceCard key={i} source={s} onMediaClick={handleMediaClick} />
      ))}

      {lightboxOpen && mediaSources.length > 0 && (
        <MediaLightbox
          items={mediaSources}
          currentIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          onPrev={() =>
            setLightboxIndex((prev) =>
              prev === 0 ? mediaSources.length - 1 : prev - 1
            )
          }
          onNext={() =>
            setLightboxIndex((prev) =>
              prev === mediaSources.length - 1 ? 0 : prev + 1
            )
          }
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SourceCard.tsx
git commit -m "feat: add media thumbnails and lightbox to source cards"
```

---

### Task 11: Update Chat Page for Media Upload

**Files:**
- Modify: `frontend/src/pages/Chat.tsx`

- [ ] **Step 1: Add media upload state and UI**

In `frontend/src/pages/Chat.tsx`, add imports and state:

Add imports at top:
```tsx
import { Image, X } from "lucide-react"
import type { MediaAttachment } from "../lib/store"
```

Add state after the existing `input` state:
```tsx
const [mediaAttachments, setMediaAttachments] = useState<MediaAttachment[]>([])
const fileInputRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 2: Add file upload handler and media removal**

Add handlers after `handleNewThread`:

```tsx
const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files
  if (!files) return

  Array.from(files).forEach((file) => {
    const isVideo = file.type.startsWith("video/")
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1]
      setMediaAttachments((prev) => [
        ...prev,
        {
          type: isVideo ? "video" : "image",
          data: base64,
          previewUrl: URL.createObjectURL(file),
        },
      ])
    }
    reader.readAsDataURL(file)
  })
  // Reset so the same file can be re-selected
  e.target.value = ""
}

const removeMedia = (index: number) => {
  setMediaAttachments((prev) => {
    const updated = [...prev]
    if (updated[index].previewUrl) {
      URL.revokeObjectURL(updated[index].previewUrl!)
    }
    updated.splice(index, 1)
    return updated
  })
}
```

- [ ] **Step 3: Update handleSend to include media**

Modify `handleSend` — update the `addMessage` call for the user message:

```tsx
const userMessage: Message = {
  role: "user",
  content: input.trim(),
  media: mediaAttachments.length > 0 ? [...mediaAttachments] : undefined,
}
addMessage(userMessage)
setMediaAttachments([])  // Clear media after send
```

Update the fetch body to include media:
```tsx
body: JSON.stringify({
  content: userMessage.content,
  media: userMessage.media?.map((m) => ({ type: m.type, data: m.data })),
  filter_file_ids: filterFileIds.length > 0 ? filterFileIds : undefined,
  filter_topics: filterTopics.length > 0 ? filterTopics : undefined,
}),
```

- [ ] **Step 4: Add media upload UI below input**

Update the input area JSX, replacing the existing input section (around line 390). Insert after the `placeholder="Type a message..."` line and before the Send button:

```tsx
{/* Media previews */}
{mediaAttachments.length > 0 && (
  <div className="mx-auto flex max-w-4xl gap-2 px-4 mb-2 flex-wrap">
    {mediaAttachments.map((m, i) => (
      <div key={i} className="relative group">
        {m.type === "image" ? (
          <img
            src={m.previewUrl}
            alt="Preview"
            className="h-16 w-16 object-cover rounded-lg border border-[#e8e0d5]"
          />
        ) : (
          <video
            src={m.previewUrl}
            className="h-16 w-16 object-cover rounded-lg border border-[#e8e0d5]"
            muted
          />
        )}
        <button
          onClick={() => removeMedia(i)}
          className="absolute -top-1.5 -right-1.5 rounded-full bg-[#d4704a] p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    ))}
  </div>
)}
```

And add the upload button next to the text input:

After the text input, before the Send button:
```tsx
<input
  ref={fileInputRef}
  type="file"
  accept="image/*,video/*"
  multiple
  className="hidden"
  onChange={handleMediaSelect}
/>
<button
  onClick={() => fileInputRef.current?.click()}
  disabled={streaming}
  className="rounded-2xl border border-[#e8e0d5] bg-white px-3 py-2.5 text-[#9e8b78] hover:bg-[#fefaf5] hover:text-[#8b5e3c] disabled:opacity-50 transition-colors"
  title="Attach image or video"
>
  <Image className="h-5 w-5" />
</button>
```

- [ ] **Step 5: Render user media in message bubbles**

In the message rendering loop, after the message bubble for user messages, add media display:

In the user message bubble section (around line 346), after `MarkdownMessage` or the `span` for user content, add:

```tsx
{/* User-uploaded media in messages */}
{msg.media && msg.media.length > 0 && (
  <div className="mt-2 flex gap-2 flex-wrap">
    {msg.media.map((m, i) => (
      <div key={i}>
        {m.type === "image" ? (
          <img
            src={m.previewUrl || `data:image/jpeg;base64,${m.data}`}
            alt="Attached"
            className="max-h-48 max-w-[300px] object-cover rounded-lg border border-[#f0d8b8]"
          />
        ) : (
          <video
            src={m.previewUrl || m.data}
            controls
            className="max-h-48 max-w-[300px] rounded-lg border border-[#f0d8b8]"
          />
        )}
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Chat.tsx
git commit -m "feat: add image/video upload to chat input with preview and send"
```

---

### Task 12: Integration Test & Verify

**Files:**
- No new files — manual verification

- [ ] **Step 1: Start backend and verify health**

```bash
cd backend && conda activate AgentRAG && uvicorn src.main:app --reload --port 8000 &
sleep 3
curl http://localhost:8000/api/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 2: Start frontend**

```bash
cd frontend && npm run dev &
```

Open `http://localhost:5173` in browser.

- [ ] **Step 3: Verify text-only chat still works**

Send a text message in chat. Verify:
- Response streams correctly
- Sources display in the UI
- No errors in console

- [ ] **Step 4: Verify image upload in chat**

Click the image attach button, select an image. Verify:
- Preview thumbnail appears
- Send message — image displays in chat bubble
- Backend routes to multimodal model (check terminal for model name)

- [ ] **Step 5: Verify media sources display**

Upload an image file via Import page. After processing:
- Send a query related to that image
- Sources card should show image thumbnail
- Click thumbnail → lightbox opens

- [ ] **Step 6: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final integration fixes for multimodal upgrade"
```

---

## Self-Review

**1. Spec coverage:**
- [x] Embedding model switch → Tasks 1, 2, 3
- [x] Multimodal embedding → Tasks 2, 3
- [x] LLM via Bailian → Task 1
- [x] Model auto-routing → Task 5, Task 6 step 3
- [x] Chat media upload → Task 11
- [x] Media display in results → Tasks 9, 10
- [x] Supabase migration → Task 4
- [x] Settings API update → Task 7
- [x] Frontend types → Task 8

**2. Placeholder scan:** No TBD, TODO, or vague steps.

**3. Type consistency:**
- `MediaAttachment` defined consistently in store.ts → Chat.tsx → threads.py
- `Source.media_type`/`media_url` consistent across store.ts, SourceCard.tsx, chunks.py, threads.py
- `get_multimodal_embedding` signature consistent across openai_client.py → chunks.py → threads.py
- `resolve_model` takes `messages: list[dict], user_settings: dict` consistently