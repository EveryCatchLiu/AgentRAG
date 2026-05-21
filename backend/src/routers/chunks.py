import csv
import io
import json
import re
import uuid
from typing import List

from src.config import settings
from src.openai_client import create_embedding_client
from src.supabase_client import supabase, storage_bucket


def get_full_document_text(file_ids: list[str]) -> tuple[str, dict]:
    """Load all chunks for given file_ids, ordered by chunk_index.
    Returns (concatenated_full_text, file_metadata_dict keyed by file_id).
    """
    all_chunks = []
    file_meta = {}

    for fid in file_ids:
        result = (
            supabase.table("chunks")
            .select("content, chunk_index, files!inner(filename, metadata)")
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
            all_chunks.extend(result.data)

    all_chunks.sort(key=lambda c: (c.get("file_id", ""), c.get("chunk_index", 0)))
    full_text = "\n\n".join(c["content"] for c in all_chunks)
    return full_text, file_meta


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


def get_embedding(text: str, user_settings: dict = None) -> List[float]:
    """Generate embedding using configurable embedding provider."""
    if user_settings and user_settings.get("embedding_api_key"):
        emb_client = create_embedding_client(
            api_key=user_settings["embedding_api_key"],
            base_url=user_settings.get("embedding_base_url", ""),
        )
        emb_model = user_settings.get("embedding_model") or "text-embedding-v3"
    else:
        emb_client = create_embedding_client(
            api_key=settings.embedding_api_key,
            base_url=settings.embedding_base_url,
        )
        emb_model = settings.embedding_model or "text-embedding-v3"

    response = emb_client.embeddings.create(
        model=emb_model,
        input=text,
    )
    return response.data[0].embedding


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


def extract_text(content: bytes, filename: str) -> str:
    """Extract text from various file formats."""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    if ext == "pdf":
        # Try pymupdf first (much better CJK support), fall back to pdfplumber
        text = ""
        try:
            import fitz
            with fitz.open(stream=content, filetype="pdf") as doc:
                text = "\n\n".join(page.get_text() for page in doc)
        except Exception:
            pass

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
            text = extract_text(file_content, filename)
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

        for i, chunk_text in enumerate(chunks):
            try:
                embedding = get_embedding(chunk_text, user_settings)
                supabase.table("chunks").insert({
                    "id": str(uuid.uuid4()),
                    "file_id": file_id,
                    "content": chunk_text,
                    "embedding": embedding,
                    "chunk_index": i,
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


def _llm_rerank(query: str, chunks: List[dict], user_settings: dict = None, top_k: int = 5) -> List[dict]:
    """Use LLM as a cross-encoder to re-rank chunks by relevance to the query."""
    if len(chunks) <= top_k:
        return chunks

    from src.openai_client import create_llm_client
    from src.config import settings

    # Build chunks text for the prompt
    chunks_text_parts = []
    for i, chunk in enumerate(chunks):
        preview = chunk["content"][:500]
        chunks_text_parts.append(f"[{i}] {preview}")
    chunks_text = "\n\n".join(chunks_text_parts)

    llm_client = create_llm_client(
        api_key=user_settings.get("llm_api_key", "") if user_settings else "",
        base_url=user_settings.get("llm_base_url", "") if user_settings else "",
    )
    model = (user_settings.get("llm_model") if user_settings else None) or settings.model

    try:
        completion = llm_client.chat.completions.create(
            model=model,
            messages=[{
                "role": "user",
                "content": RERANK_PROMPT.format(query=query, chunks_text=chunks_text),
            }],
            max_tokens=200,
        )
        raw = completion.choices[0].message.content.strip()
        # Parse the JSON array
        scores = json.loads(raw)
        if isinstance(scores, list) and len(scores) == len(chunks):
            for i, score in enumerate(scores):
                chunks[i]["similarity"] = round(float(score) / 10.0, 4)
                chunks[i]["rerank_score"] = round(float(score), 1)
            chunks.sort(key=lambda x: x.get("rerank_score", 0), reverse=True)
    except Exception as e:
        print(f"Re-rank failed, using RRF scores: {e}")

    return chunks[:top_k]


def search_chunks(
    query: str,
    top_k: int = 5,
    user_settings: dict = None,
    filter_file_ids: List[str] | None = None,
    filter_topics: List[str] | None = None,
    filter_doc_types: List[str] | None = None,
) -> List[dict]:
    """Hybrid search: vector + keyword → RRF fusion → diversity → LLM rerank."""
    fetch_count = max(top_k * 4, 20)

    # 1. Vector search
    vector_results = []
    embedding = get_embedding(query, user_settings)
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
    keyword_results = _keyword_search(
        query, match_count=fetch_count,
        filter_file_ids=filter_file_ids,
        filter_topics=filter_topics,
        filter_doc_types=filter_doc_types,
    )

    # 3. RRF fusion
    if vector_results or keyword_results:
        fused = _rrf_fusion(vector_results, keyword_results)
        # 4. Diversify
        diversified = _diversify_chunks(fused, top_k * 3, max_per_file=3)
        # 5. LLM re-rank
        return _llm_rerank(query, diversified, user_settings, top_k)

    # Absolute fallback: keyword matching
    keywords = query.lower().split()
    result = supabase.table("chunks").select(
        "content, chunk_index, file_id, files!inner(filename)"
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
            })

    scored.sort(key=lambda x: x["similarity"], reverse=True)
    return scored[:top_k]
