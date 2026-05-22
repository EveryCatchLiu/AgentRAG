import base64
import csv
import io
import json
import re
import uuid
from typing import List

from src.config import settings
from src.openai_client import get_multimodal_embedding
from src.supabase_client import supabase, storage_bucket

IMAGE_EXTENSIONS = frozenset({"png", "jpg", "jpeg", "tiff", "tif", "bmp", "webp"})


def get_full_document_text(file_ids: list[str]) -> tuple[str, dict, dict]:
    """Load all chunks for given file_ids, ordered by chunk_index.
    Returns (concatenated_full_text, file_metadata_dict keyed by file_id, media_map keyed by file_id).
    """
    all_chunks = []
    file_meta = {}
    media_map: dict[str, dict] = {}  # file_id -> {"type": str, "url": str}

    for fid in file_ids:
        result = (
            supabase.table("chunks")
            .select("content, chunk_index, media_type, media_url, files!inner(filename, metadata)")
            .eq("file_id", fid)
            .order("chunk_index")
            .execute()
        )
        if result.data:
            file_info = result.data[0].get("files", {}) if result.data else {}
            file_meta[fid] = {
                "filename": file_info.get("filename", "unknown"),
                "metadata": file_info.get("metadata", {}),
            }
            # Collect media info from first chunk that has it
            for chunk in result.data:
                mt = chunk.get("media_type")
                mu = chunk.get("media_url")
                if mt and mu and fid not in media_map:
                    media_map[fid] = {"type": mt, "url": mu}
            all_chunks.extend(result.data)

    all_chunks.sort(key=lambda c: (c.get("file_id", ""), c.get("chunk_index", 0)))
    full_text = "\n\n".join(c["content"] for c in all_chunks)
    return full_text, file_meta, media_map


def split_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
    """Split text into chunks with overlap. Handles both English and Chinese text."""
    # Use both \n\n and \n as paragraph separators
    paragraphs = [p.strip() for p in text.replace('\r\n', '\n').split('\n') if p.strip()]
    if not paragraphs:
        paragraphs = [text]

    chunks = []
    current_chunk = ""

    for para in paragraphs:
        if len(current_chunk) + len(para) + 1 <= chunk_size:
            current_chunk = (current_chunk + "\n" + para).strip() if current_chunk else para
        else:
            if current_chunk:
                chunks.append(current_chunk)
                # Character-based overlap for CJK compatibility
                overlap_start = max(0, len(current_chunk) - overlap)
                current_chunk = current_chunk[overlap_start:] + "\n" + para
            else:
                # Single paragraph larger than chunk_size, split by character count
                chunks.append(para[:chunk_size])
                current_chunk = para[max(0, chunk_size - overlap):]

    if current_chunk:
        chunks.append(current_chunk)

    return [c.strip() for c in chunks if c.strip()]


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


def _decode_text(content: bytes) -> str:
    """Decode bytes to string, trying multiple encodings."""
    for encoding in ["utf-8", "gbk", "gb2312", "gb18030", "big5", "latin-1"]:
        try:
            return content.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            continue
    return content.decode("utf-8", errors="replace")


def _strip_markdown(text: str) -> str:
    """Remove common Markdown syntax to produce clean text for embedding."""
    # Remove images
    text = re.sub(r'!\[.*?\]\(.*?\)', '', text)
    # Remove links, keep text
    text = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', text)
    # Remove code blocks (keep content inside)
    text = re.sub(r'```[\s\S]*?```', lambda m: m.group(0).strip('`').strip(), text)
    # Remove inline code
    text = re.sub(r'`([^`]+)`', r'\1', text)
    # Remove heading markers
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # Remove bold/italic
    text = re.sub(r'\*{1,3}([^*]+)\*{1,3}', r'\1', text)
    # Remove horizontal rules
    text = re.sub(r'^[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)
    # Remove blockquote markers
    text = re.sub(r'^>\s+', '', text, flags=re.MULTILINE)
    # Remove list markers
    text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)
    # Collapse multiple blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _parse_csv(text: str, delimiter: str = ",") -> str:
    """Parse CSV/TSV text and convert to readable row-per-line format."""
    try:
        reader = csv.reader(io.StringIO(text), delimiter=delimiter)
        rows = list(reader)
        if not rows:
            return text
        header = rows[0]
        lines = [f"Columns: {', '.join(header)}"]
        for row in rows[1:]:
            parts = []
            for i, cell in enumerate(row):
                label = header[i] if i < len(header) else f"col{i}"
                parts.append(f"{label}={cell}" if cell else f"{label}=-")
            lines.append(" | ".join(parts))
        return "\n".join(lines)
    except Exception:
        return text


def extract_text(content: bytes, filename: str, user_settings: dict = None) -> str:
    """Extract text from various file formats. Supports Mistral OCR for images and image-based PDFs."""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    # Image formats — always use Mistral OCR
    if ext in IMAGE_EXTENSIONS:
        try:
            from src.openai_client import ocr_with_mistral
            api_key = (user_settings or {}).get("mistral_api_key", "")
            return ocr_with_mistral(content, filename, api_key=api_key)
        except Exception as e:
            print(f"Mistral OCR failed for image {filename}: {e}")
            return ""

    if ext == "pdf":
        # Try pymupdf first (best for text-based PDFs with CJK support)
        text = ""
        try:
            import fitz
            with fitz.open(stream=content, filetype="pdf") as doc:
                text = "\n\n".join(page.get_text() for page in doc)
        except Exception:
            pass

        # If pymupdf extracted very little text, likely an image-based PDF — use OCR
        if len(text.strip()) < 100:
            try:
                from src.openai_client import ocr_with_mistral
                api_key = (user_settings or {}).get("mistral_api_key", "")
                ocr_text = ocr_with_mistral(content, filename, api_key=api_key)
                if ocr_text.strip():
                    return ocr_text
            except Exception as e:
                print(f"Mistral OCR failed for PDF {filename}: {e}")

        if not text.strip():
            try:
                import pdfplumber
                with pdfplumber.open(io.BytesIO(content)) as pdf:
                    text = "\n\n".join(
                        page.extract_text() or ""
                        for page in pdf.pages
                    )
            except Exception:
                pass

        return text

    elif ext == "docx":
        from docx import Document
        doc = Document(io.BytesIO(content))
        return "\n\n".join(p.text for p in doc.paragraphs if p.text)

    elif ext in ("html", "htm"):
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(content, "html.parser")
        return soup.get_text(separator="\n\n")

    elif ext == "md":
        text = _decode_text(content)
        return _strip_markdown(text)

    elif ext in ("csv", "tsv"):
        text = _decode_text(content)
        return _parse_csv(text, delimiter="," if ext == "csv" else "\t")

    else:
        return _decode_text(content)


METADATA_SYSTEM_PROMPT = """You are a document metadata extraction assistant. Analyze the provided text and extract structured metadata.
Output a JSON object with the following structure:
{
  "title": "concise document title or empty string",
  "author": "author name or empty string",
  "topics": ["topic1", "topic2", ...] (3-8 keywords),
  "document_type": "one of: report, article, manual, legal, academic_paper, presentation, email, meeting_notes, specification, tutorial, blog_post, other, unknown",
  "language": "ISO 639-1 code (zh, en, ja, etc.) or unknown",
  "summary": "2-4 sentence summary"
}

Important: Extract metadata in the SAME LANGUAGE as the document. If the document is in Chinese, output title, topics, and summary in Chinese.
Be precise and concise. If you cannot determine a field, use empty string or empty array.
Topics should be 3-8 keywords or short phrases in the document's language."""

METADATA_USER_PROMPT = """Filename: {filename}

Document text (beginning):
{text_start}

Document text (ending):
{text_end}

Output ONLY a JSON object with the document metadata. No other text."""


def extract_metadata(text: str, filename: str, user_settings: dict = None) -> dict:
    """Use LLM with structured output to extract metadata from document text."""
    from src.openai_client import create_llm_client
    from src.models import DocumentMetadata

    llm_client = create_llm_client(
        api_key=user_settings.get("llm_api_key", "") if user_settings else "",
        base_url=user_settings.get("llm_base_url", "") if user_settings else "",
    )
    model = (user_settings.get("llm_model") if user_settings else None) or settings.model

    max_start = 8000
    max_end = 2000
    text_start = text[:max_start]
    text_end = ""
    if len(text) > max_start + max_end:
        text_end = text[-max_end:]

    try:
        completion = llm_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": METADATA_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": METADATA_USER_PROMPT.format(
                        filename=filename,
                        text_start=text_start,
                        text_end=text_end,
                    ),
                },
            ],
            response_format={"type": "json_object"},
        )
        raw = completion.choices[0].message.content
        return json.loads(raw)
    except Exception as e:
        print(f"Metadata extraction failed for {filename}: {e}")
        return {
            "title": "", "author": "", "topics": [],
            "document_type": "unknown", "language": "unknown", "summary": "",
        }


def process_file(file_id: str, storage_path: str, user_settings: dict = None):
    """Download file, chunk it, generate embeddings, and store."""
    filename = storage_path.rsplit("/", 1)[-1]
    supabase.table("files").update({"status": "processing"}).eq("id", file_id).execute()

    try:
        file_content = storage_bucket.download(storage_path)
        if isinstance(file_content, bytes):
            text = extract_text(file_content, filename, user_settings=user_settings)
        else:
            text = str(file_content)

        if not text or not text.strip():
            supabase.table("files").update({
                "status": "error",
            }).eq("id", file_id).execute()
            print(f"Error processing file {file_id}: No extractable text found in {filename}. If this is a PDF, it may be scanned/image-based and require OCR.")
            return

        # Extract metadata via LLM before chunking
        metadata = extract_metadata(text, filename, user_settings)
        try:
            supabase.table("files").update({"metadata": metadata}).eq("id", file_id).execute()
        except Exception as e:
            print(f"Failed to store metadata for file {file_id}: {e}")

        chunk_size = 1000
        chunk_overlap = 200
        if user_settings:
            chunk_size = user_settings.get("chunk_size") or chunk_size
            chunk_overlap = user_settings.get("chunk_overlap") or chunk_overlap

        chunks = split_text(text, chunk_size=chunk_size, overlap=chunk_overlap)

        # Hoist image encoding: encode once, reuse across all chunks
        ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
        img_b64 = None
        mime_type = None
        emb_api_key = (user_settings or {}).get("embedding_api_key", "")
        if ext in IMAGE_EXTENSIONS and isinstance(file_content, bytes):
            try:
                img_b64 = base64.b64encode(file_content).decode("utf-8")
                mime_type = f"image/{'jpeg' if ext in ('jpg', 'jpeg') else ext}"
            except Exception:
                pass

        for i, chunk_text in enumerate(chunks):
            try:
                contents = [{"text": chunk_text}]
                media_type = None
                media_url = None
                if img_b64:
                    media_type = "image"
                    media_url = supabase.storage.from_("documents").get_public_url(storage_path)
                    contents.append({"image": f"data:{mime_type};base64,{img_b64}"})

                embedding = get_multimodal_embedding(contents, api_key=emb_api_key)
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

        supabase.table("files").update({
            "status": "done",
            "total_chunks": len(chunks),
        }).eq("id", file_id).execute()

    except Exception as e:
        supabase.table("files").update({"status": "error"}).eq("id", file_id).execute()
        print(f"Error processing file {file_id}: {e}")


def _diversify_chunks(chunks: List[dict], top_k: int, max_per_file: int = 2) -> List[dict]:
    """Ensure no single file dominates results. Take up to max_per_file chunks per file."""
    seen: dict[str, int] = {}
    diversified = []
    for chunk in chunks:
        fid = chunk.get("file_id", "")
        count = seen.get(fid, 0)
        if count < max_per_file:
            diversified.append(chunk)
            seen[fid] = count + 1
        if len(diversified) >= top_k:
            break
    return diversified


def _keyword_search(
    query: str,
    match_count: int = 20,
    filter_file_ids: List[str] | None = None,
    filter_topics: List[str] | None = None,
    filter_doc_types: List[str] | None = None,
) -> List[dict]:
    """Keyword search via pg_trgm similarity (works for all languages)."""
    try:
        result = supabase.rpc(
            "match_chunks_keyword",
            {
                "query_text": query,
                "match_count": match_count,
                "filter_file_ids": filter_file_ids,
                "filter_topics": filter_topics,
                "filter_doc_types": filter_doc_types,
            },
        ).execute()
        if result.data:
            return result.data
    except Exception:
        pass
    return []


def _rrf_fusion(
    vector_results: List[dict],
    keyword_results: List[dict],
    k: int = 60,
) -> List[dict]:
    """Reciprocal Rank Fusion: combine vector and keyword rankings."""
    chunk_map: dict[str, dict] = {}
    chunk_rrf: dict[str, float] = {}

    for rank, chunk in enumerate(vector_results):
        key = f"{chunk.get('file_id', '')}:{chunk.get('chunk_index', rank)}"
        chunk_map[key] = chunk
        chunk_rrf[key] = chunk_rrf.get(key, 0) + 1.0 / (k + rank + 1)

    for rank, chunk in enumerate(keyword_results):
        key = f"{chunk.get('file_id', '')}:{chunk.get('chunk_index', rank)}"
        if key not in chunk_map:
            chunk_map[key] = chunk
        chunk_rrf[key] = chunk_rrf.get(key, 0) + 1.0 / (k + rank + 1)

    # Sort by RRF score descending
    fused = [(chunk_map[key], chunk_rrf[key]) for key in chunk_rrf]
    fused.sort(key=lambda x: x[1], reverse=True)

    # Update similarity with RRF score for downstream display
    result = []
    for chunk, rrf_score in fused:
        chunk = dict(chunk)
        chunk["rrf_score"] = round(rrf_score, 4)
        # Keep original vector similarity if available, otherwise use RRF
        if "similarity" not in chunk or chunk["similarity"] == 0:
            chunk["similarity"] = round(rrf_score, 4)
        result.append(chunk)
    return result


RERANK_PROMPT = """You are a relevance scoring assistant. Rate how relevant each document chunk is to the user's query on a scale of 0-10.

User query: {query}

Document chunks:
{chunks_text}

For each chunk, output only a JSON array of scores like: [score1, score2, ...]"""


def _rerank_cohere(query: str, chunks: List[dict], api_key: str, base_url: str, model: str) -> List[dict]:
    """Use Cohere's native Rerank API to re-rank chunks."""
    import urllib.request

    url = (base_url or "https://api.cohere.com/v2").rstrip("/") + "/rerank"
    documents = [chunk["content"][:1000] for chunk in chunks]

    body = json.dumps({
        "model": model or "rerank-v3.5",
        "query": query,
        "documents": documents,
        "top_n": len(chunks),
    }).encode("utf-8")

    req = urllib.request.Request(url, data=body, headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())

    results = data.get("results", [])
    for r in results:
        idx = r.get("index", 0)
        score = r.get("relevance_score", 0)
        chunks[idx]["similarity"] = round(score, 4)
        chunks[idx]["rerank_score"] = round(score * 10, 1)

    chunks.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
    return chunks


def _rerank_openai(query: str, chunks: List[dict], api_key: str, base_url: str, model: str) -> List[dict]:
    """Use OpenAI-compatible Chat Completions to re-rank chunks (prompt-based scoring)."""
    from src.openai_client import OpenAI

    chunks_text_parts = []
    for i, chunk in enumerate(chunks):
        preview = chunk["content"][:500]
        chunks_text_parts.append(f"[{i}] {preview}")
    chunks_text = "\n\n".join(chunks_text_parts)

    client = OpenAI(api_key=api_key, base_url=base_url)

    completion = client.chat.completions.create(
        model=model or "gpt-4o-mini",
        messages=[{
            "role": "user",
            "content": RERANK_PROMPT.format(query=query, chunks_text=chunks_text),
        }],
        max_tokens=200,
    )
    raw = completion.choices[0].message.content.strip()
    scores = json.loads(raw)
    if isinstance(scores, list) and len(scores) == len(chunks):
        for i, score in enumerate(scores):
            chunks[i]["similarity"] = round(float(score) / 10.0, 4)
            chunks[i]["rerank_score"] = round(float(score), 1)
        chunks.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)

    return chunks


def _rerank(query: str, chunks: List[dict], user_settings: dict) -> List[dict]:
    """Re-rank chunks using the configured reranker. Falls back to raw scores on error."""
    if not user_settings or not user_settings.get("enable_reranker"):
        return chunks

    reranker_type = user_settings.get("reranker_type", "cohere")
    api_key = user_settings.get("reranker_api_key", "")
    model = user_settings.get("reranker_model", "")

    if not api_key:
        print("Re-rank skipped: no reranker API key configured")
        return chunks

    try:
        if reranker_type == "cohere":
            base_url = user_settings.get("reranker_base_url", "")
            return _rerank_cohere(query, chunks, api_key, base_url, model)
        else:
            base_url = user_settings.get("reranker_base_url", "")
            return _rerank_openai(query, chunks, api_key, base_url, model)
    except Exception as e:
        print(f"Re-rank failed, using pre-rerank scores: {e}")
        return chunks


def search_chunks(
    query: str,
    top_k: int = 5,
    user_settings: dict = None,
    filter_file_ids: List[str] | None = None,
    filter_topics: List[str] | None = None,
    filter_doc_types: List[str] | None = None,
    query_embedding: list[float] | None = None,
) -> List[dict]:
    """Hybrid search: vector + keyword → RRF fusion → diversity → rerank.

    Retrieval method is controlled by user_settings.retrieval_method:
    - "hybrid": vector + keyword + RRF fusion (default)
    - "vector": vector-only semantic search
    - "keyword": keyword-only text search
    """
    retrieval_method = (user_settings or {}).get("retrieval_method", "hybrid")
    fetch_count = max(top_k * 4, 20)

    # 1. Vector search
    vector_results = []
    if retrieval_method in ("hybrid", "vector"):
        embedding = query_embedding or get_embedding(query, user_settings)
        try:
            result = supabase.rpc(
                "match_chunks",
                {
                    "query_embedding": embedding,
                    "match_threshold": 0.3,
                    "match_count": fetch_count,
                    "filter_file_ids": filter_file_ids,
                    "filter_topics": filter_topics,
                    "filter_doc_types": filter_doc_types,
                },
            ).execute()
            if result.data:
                vector_results = result.data
        except Exception:
            pass

    # 2. Keyword search
    keyword_results = []
    if retrieval_method in ("hybrid", "keyword"):
        keyword_results = _keyword_search(
            query, match_count=fetch_count,
            filter_file_ids=filter_file_ids,
            filter_topics=filter_topics,
            filter_doc_types=filter_doc_types,
        )

    # 3. Combine results
    if retrieval_method == "hybrid" and (vector_results or keyword_results):
        fused = _rrf_fusion(vector_results, keyword_results)
    elif retrieval_method == "vector" and vector_results:
        fused = vector_results
    elif retrieval_method == "keyword" and keyword_results:
        fused = keyword_results
    else:
        fused = []

    if fused:
        # 4. Diversify
        diversified = _diversify_chunks(fused, top_k * 3, max_per_file=3)
        # 5. Rerank (reads enable_reranker from user_settings)
        reranked = _rerank(query, diversified, user_settings)
        return reranked[:top_k]

    # Absolute fallback: keyword matching
    keywords = query.lower().split()
    result = supabase.table("chunks").select(
        "content, chunk_index, file_id, media_type, media_url, files!inner(filename)"
    ).limit(50).execute()

    scored = []
    for chunk in result.data:
        content_lower = chunk["content"].lower()
        score = sum(1 for kw in keywords if kw in content_lower)
        if score > 0:
            scored.append({
                "content": chunk["content"],
                "similarity": score / len(keywords),
                "filename": chunk["files"]["filename"],
                "chunk_index": chunk["chunk_index"],
                "file_id": chunk["file_id"],
                "media_type": chunk.get("media_type"),
                "media_url": chunk.get("media_url"),
            })

    scored.sort(key=lambda x: x["similarity"], reverse=True)
    return scored[:top_k]
