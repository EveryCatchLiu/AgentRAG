from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.supabase_client import supabase

router = APIRouter(prefix="/api/settings", tags=["settings"])


class LLMSettings(BaseModel):
    llm_api_key: str
    llm_base_url: str = ""
    llm_model: str = ""
    llm_title_model: str = ""
    llm_system_prompt: str = ""


class EmbeddingSettings(BaseModel):
    embedding_api_key: str
    embedding_base_url: str = ""
    embedding_model: str = "text-embedding-v3"
    chunk_size: int = 1000
    chunk_overlap: int = 200


@router.get("")
async def get_settings(user_id: str):
    """Get user settings."""
    result = (
        supabase.table("user_settings")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    if result.data:
        return result.data[0]
    return {"user_id": user_id}


@router.put("/llm")
async def update_llm_settings(settings: LLMSettings, user_id: str):
    """Update LLM settings."""
    # Upsert
    result = supabase.table("user_settings").upsert(
        {"user_id": user_id, **settings.model_dump()},
        on_conflict="user_id",
    ).execute()
    return result.data[0] if result.data else {}


@router.put("/embedding")
async def update_embedding_settings(settings: EmbeddingSettings, user_id: str):
    """Update embedding settings."""
    result = supabase.table("user_settings").upsert(
        {"user_id": user_id, **settings.model_dump()},
        on_conflict="user_id",
    ).execute()
    return result.data[0] if result.data else {}
