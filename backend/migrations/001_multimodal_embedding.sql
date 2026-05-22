-- Drop existing index
DROP INDEX IF EXISTS chunks_embedding_idx;

-- Clear old incompatible chunks
DELETE FROM chunks;

-- Add media columns
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS media_url text;

-- Set embedding to 1024-dim (max for HNSW index)
ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(1024);

-- Recreate HNSW index
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

-- Mark files for re-processing
UPDATE files SET status = 'outdated' WHERE status = 'done';