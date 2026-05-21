-- 005: Add metadata JSONB column to files table

ALTER TABLE files ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_files_metadata_gin
    ON files USING GIN (metadata jsonb_path_ops);
