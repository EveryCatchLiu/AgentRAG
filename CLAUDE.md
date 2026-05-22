# AgentRAG

## Environment

- **Backend**: Use conda environment `AgentRAG`
  ```bash
  conda activate AgentRAG
  cd backend && uvicorn src.main:app --reload --port 8000
  ```
- **Frontend**: Node.js with npm
  ```bash
  cd frontend && npm run dev
  ```

## Project Structure

- `backend/` — FastAPI backend (Python)
- `frontend/` — Vite + React + Tailwind CSS frontend (TypeScript)
