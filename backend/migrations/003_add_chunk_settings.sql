-- Add chunk settings to user_settings table
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS chunk_size int DEFAULT 1000;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS chunk_overlap int DEFAULT 200;

-- Remove embedding_dimensions if it exists (not needed with DashScope v3)
ALTER TABLE user_settings DROP COLUMN IF EXISTS embedding_dimensions;
