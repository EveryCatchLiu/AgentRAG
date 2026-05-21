from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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


@app.get("/api/health")
async def health():
    return {"status": "ok"}
