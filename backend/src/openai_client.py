import os

from openai import OpenAI
from mistralai.client.sdk import Mistral
from src.config import settings
import json
import time
import urllib.request
import urllib.error

os.environ.setdefault("LANGCHAIN_TRACING_V2", settings.langchain_tracing_v2)
if settings.langchain_api_key:
    os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project


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
        except (urllib.error.HTTPError, urllib.error.URLError) as e:
            if attempt == 0:
                time.sleep(5)
                continue
            body_text = ""
            if isinstance(e, urllib.error.HTTPError) and e.fp:
                body_text = e.read().decode()
            raise RuntimeError(
                f"Multimodal embedding API error: {e}"
            ) from e


def _downsample_base64_image(data_uri: str, max_size: int = 2048) -> str:
    """Resize a base64 image to max_size on longest side using PIL."""
    import base64
    import io
    try:
        from PIL import Image
    except ModuleNotFoundError:
        return data_uri

    header, b64data = data_uri.split(",", 1)
    img_bytes = base64.b64decode(b64data)
    try:
        img = Image.open(io.BytesIO(img_bytes))
    except Exception:
        return data_uri
    w, h = img.size
    if max(w, h) > max_size:
        ratio = max_size / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
    buf = io.BytesIO()
    fmt = img.format or "JPEG"
    img.save(buf, format=fmt, quality=85)
    return f"{header},{base64.b64encode(buf.getvalue()).decode()}"


def create_llm_client(
    api_key: str,
    base_url: str = "",
) -> OpenAI:
    """Create an OpenAI-compatible client (DeepSeek official)."""
    client = OpenAI(
        api_key=api_key or settings.openai_api_key,
        base_url=base_url or settings.openai_base_url,
    )
    try:
        from langsmith import wrappers
        return wrappers.wrap_openai(client)
    except Exception:
        return client


def create_bailian_client(
    api_key: str = "",
    base_url: str = "",
) -> OpenAI:
    """Create an OpenAI-compatible client for Alibaba Bailian platform."""
    return OpenAI(
        api_key=api_key or settings.bailian_api_key,
        base_url=base_url or settings.bailian_base_url,
    )


# Default clients
deepseek_client = create_llm_client(
    api_key=settings.openai_api_key,
    base_url=settings.openai_base_url,
)

bailian_client = create_bailian_client()


def create_mistral_client(api_key: str = "") -> Mistral:
    """Create a Mistral client for OCR."""
    return Mistral(api_key=api_key or settings.mistral_api_key)


def ocr_with_mistral(
    file_content: bytes,
    filename: str,
    api_key: str = "",
) -> str:
    """Extract text from an image or PDF using Mistral OCR.

    Supports: PNG, JPG, JPEG, TIFF, BMP, WebP, and PDF.
    Returns markdown-formatted text from the document.
    """
    import base64
    from mistralai.client.models.documenturlchunk import DocumentURLChunk

    mistral = create_mistral_client(api_key)

    content_b64 = base64.standard_b64encode(file_content).decode("utf-8")

    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    mime_map = {
        "pdf": "application/pdf",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "tiff": "image/tiff",
        "tif": "image/tiff",
        "bmp": "image/bmp",
        "webp": "image/webp",
    }
    mime = mime_map.get(ext, "application/octet-stream")
    data_url = f"data:{mime};base64,{content_b64}"

    ocr_response = mistral.ocr.process(
        model="mistral-ocr-latest",
        document=DocumentURLChunk(
            document_url=data_url,
            document_name=filename,
        ),
        include_image_base64=False,
    )

    # Extract markdown text from all pages
    pages = ocr_response.pages
    texts = []
    for page in pages:
        markdown = page.markdown or ""
        texts.append(markdown)

    return "\n\n".join(texts)


def resolve_model(messages: list[dict], user_settings: dict = None) -> tuple[str, str]:
    """Determine which model and platform to use based on message content.

    Returns: (model_name, platform) where platform is "deepseek" or "bailian"

    If any message contains image or video → bailian multimodal_model (qwen3-vl).
    Otherwise → deepseek official model (deepseek-v4-flash).
    """
    from src.config import settings

    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and (
                    part.get("type") in ("image_url", "video_url")
                    or "image_url" in part
                    or "video_url" in part
                ):
                    mm = (user_settings or {}).get("llm_multimodal_model")
                    return (mm or settings.multimodal_model, "bailian")
        elif isinstance(content, str):
            if "data:image/" in content or "data:video/" in content:
                mm = (user_settings or {}).get("llm_multimodal_model")
                return (mm or settings.multimodal_model, "bailian")

    return ((user_settings or {}).get("llm_model") or settings.model, "deepseek")
