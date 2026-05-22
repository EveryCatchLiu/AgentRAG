from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import base64

from src.routers import threads
from src.routers import files
from src.routers import settings

app = FastAPI(title="AgentRAG", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(threads.router)
app.include_router(files.router)
app.include_router(settings.router)


@app.get("/api/images/proxy")
async def proxy_image(path: str):
    """Proxy Supabase storage images for frontend display."""
    from src.supabase_client import storage_bucket
    try:
        img_bytes = storage_bucket.download(path)
        mime = "image/jpeg"
        if img_bytes[:4] == b'\x89PNG':
            mime = "image/png"
        elif img_bytes[:4] == b'RIFF' and img_bytes[8:12] == b'WEBP':
            mime = "image/webp"
        return Response(content=img_bytes, media_type=mime)
    except Exception:
        return Response(status_code=404)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
