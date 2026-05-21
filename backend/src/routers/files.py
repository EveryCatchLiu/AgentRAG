import hashlib
import threading
from uuid import uuid4

from fastapi import APIRouter, HTTPException, UploadFile, File

from src.supabase_client import supabase, storage_bucket
from src.routers.chunks import process_file

router = APIRouter(prefix="/api/files", tags=["files"])


def _get_user_settings(user_id: str) -> dict | None:
    """Fetch user settings, returning None if unavailable."""
    try:
        result = (
            supabase.table("user_settings")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception:
        return None


@router.post("/upload")
async def upload_file(file: UploadFile = File(...), user_id: str = ""):
    """Upload a file to Supabase Storage and start processing, with dedup."""
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    content_hash = hashlib.sha256(content).hexdigest()

    # Check for existing file by same user + filename
    existing = (
        supabase.table("files")
        .select("*")
        .eq("user_id", user_id)
        .eq("filename", file.filename)
        .execute()
    )

    if existing.data:
        existing_file = existing.data[0]
        # Case A: Exact duplicate — same content hash
        if existing_file.get("content_hash") == content_hash:
            return {**existing_file, "skipped": True}

        # Case B: Incremental update — same name, different content
        file_id_str = existing_file["id"]
        # Delete old chunks
        supabase.table("chunks").delete().eq("file_id", file_id_str).execute()
        # Remove old storage object
        try:
            storage_bucket.remove([existing_file["storage_path"]])
        except Exception:
            pass

        # Upload new content to storage
        ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else ""
        safe_name = f"{file_id_str}.{ext}" if ext else file_id_str
        storage_path = f"{user_id}/{file_id_str}/{safe_name}"
        storage_bucket.upload(storage_path, content)

        # Update the file row
        update_data = {
            "storage_path": storage_path,
            "status": "pending",
            "total_chunks": 0,
        }
        try:
            update_data["content_hash"] = content_hash
            supabase.table("files").update(update_data).eq("id", file_id_str).execute()
        except Exception:
            update_data.pop("content_hash", None)
            supabase.table("files").update(update_data).eq("id", file_id_str).execute()

        user_settings = _get_user_settings(user_id)
        t = threading.Thread(target=process_file, args=(file_id_str, storage_path, user_settings))
        t.daemon = True
        t.start()

        updated = (
            supabase.table("files")
            .select("*")
            .eq("id", file_id_str)
            .execute()
        )
        return {**updated.data[0], "updated": True}

    # Case C: Cross-filename duplicate — same content under different name
    try:
        cross_check = (
            supabase.table("files")
            .select("*")
            .eq("user_id", user_id)
            .eq("content_hash", content_hash)
            .execute()
        )
        if cross_check.data:
            return {**cross_check.data[0], "skipped": True}
    except Exception:
        pass  # content_hash column may not exist yet

    # Case D: New file
    file_id = str(uuid4())
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else ""
    safe_name = f"{file_id}.{ext}" if ext else file_id
    storage_path = f"{user_id}/{file_id}/{safe_name}"

    storage_bucket.upload(storage_path, content)

    file_data = {
        "id": file_id,
        "user_id": user_id,
        "filename": file.filename,
        "storage_path": storage_path,
        "status": "pending",
    }
    try:
        file_data["content_hash"] = content_hash
        result = supabase.table("files").insert(file_data).execute()
    except Exception:
        file_data.pop("content_hash", None)
        result = supabase.table("files").insert(file_data).execute()

    user_settings = _get_user_settings(user_id)
    t = threading.Thread(target=process_file, args=(file_id, storage_path, user_settings))
    t.daemon = True
    t.start()

    return result.data[0]


@router.get("")
async def list_files(user_id: str = ""):
    """List all files for a user."""
    result = (
        supabase.table("files")
        .select("id, filename, status, total_chunks, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/metadata/filters")
async def get_metadata_filters(user_id: str = "", file_ids: str = ""):
    """Return distinct metadata values for the filter UI.
    When file_ids is provided, only return topics from those files."""
    # Parse selected file IDs
    selected_ids = [fid.strip() for fid in file_ids.split(",") if fid.strip()] if file_ids else []

    try:
        query = (
            supabase.table("files")
            .select("id, filename, metadata")
            .eq("user_id", user_id)
            .eq("status", "done")
        )
        if selected_ids:
            query = query.in_("id", selected_ids)
        result = query.execute()
    except Exception:
        result = (
            supabase.table("files")
            .select("id, filename")
            .eq("user_id", user_id)
            .eq("status", "done")
            .execute()
        )

    files_list = []
    all_topics: set[str] = set()
    all_doc_types: set[str] = set()

    for row in result.data:
        files_list.append({"id": row["id"], "filename": row["filename"]})
        meta = row.get("metadata") or {}
        if isinstance(meta, dict):
            topics = meta.get("topics", [])
            if isinstance(topics, list):
                all_topics.update(t for t in topics if isinstance(t, str))
            doc_type = meta.get("document_type", "")
            if doc_type and doc_type != "unknown":
                all_doc_types.add(str(doc_type))

    return {
        "files": files_list,
        "topics": sorted(all_topics),
        "document_types": sorted(all_doc_types),
    }


@router.get("/{file_id}")
async def get_file(file_id: str, user_id: str = ""):
    """Get a single file with full metadata, including storage size."""
    result = (
        supabase.table("files")
        .select("*")
        .eq("id", file_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="File not found")

    file_data = dict(result.data[0])

    try:
        storage_path = file_data.get("storage_path", "")
        if storage_path:
            info = storage_bucket.info(storage_path)
            if hasattr(info, 'get'):
                file_data["size_bytes"] = info.get("size", 0)
            elif hasattr(info, 'size'):
                file_data["size_bytes"] = info.size
            else:
                file_data["size_bytes"] = 0
    except Exception:
        file_data["size_bytes"] = 0

    return file_data


@router.delete("/{file_id}")
async def delete_file(file_id: str, user_id: str = ""):
    """Delete a file and its chunks."""
    file_result = (
        supabase.table("files")
        .select("storage_path")
        .eq("id", file_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not file_result.data:
        raise HTTPException(status_code=404, detail="File not found")

    storage_bucket.remove(file_result.data[0]["storage_path"])
    supabase.table("chunks").delete().eq("file_id", file_id).execute()
    supabase.table("files").delete().eq("id", file_id).eq("user_id", user_id).execute()

    return {"ok": True}
