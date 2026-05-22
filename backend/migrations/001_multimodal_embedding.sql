-- Drop existing HNSW index (must drop before altering column type)
DROP INDEX IF EXISTS chunks_embedding_idx;

-- Add media columns
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS media_url text;

-- Alter embedding dimension from 1024 → 2560
ALTER TABLE chunks ALTER COLUMN embedding TYPE vector(2560);

-- Recreate HNSW index for 2560-dim vectors
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

-- Mark existing files for re-processing (old embedding dims are incompatible)
UPDATE files SET status = 'outdated' WHERE status = 'done';