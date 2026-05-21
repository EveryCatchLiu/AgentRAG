import os

from openai import OpenAI
from mistralai.client.sdk import Mistral
from src.config import settings

os.environ.setdefault("LANGCHAIN_TRACING_V2", settings.langchain_tracing_v2)
if settings.langchain_api_key:
    os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project


def create_llm_client(
    api_key: str,
    base_url: str = "",
) -> OpenAI:
    """Create an OpenAI-compatible client with optional LangSmith wrapping."""
    client = OpenAI(
        api_key=api_key or settings.openai_api_key,
        base_url=base_url or settings.openai_base_url,
    )
    try:
        from langsmith import wrappers
        return wrappers.wrap_openai(client)
    except Exception:
        return client


def create_embedding_client(
    api_key: str,
    base_url: str = "",
) -> OpenAI:
    """Create a separate client for embeddings."""
    return OpenAI(
        api_key=api_key or settings.embedding_api_key,
        base_url=base_url or settings.embedding_base_url,
    )


# Default clients (from env vars)
client = create_llm_client(
    api_key=settings.openai_api_key,
    base_url=settings.openai_base_url,
)


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
