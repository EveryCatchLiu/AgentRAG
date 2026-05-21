import os

from openai import OpenAI
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
