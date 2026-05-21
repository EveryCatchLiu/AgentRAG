-- 008: Add ON DELETE CASCADE to chunks.file_id foreign key

-- Clean up orphan chunks first
DELETE FROM chunks WHERE file_id NOT IN (SELECT id FROM files);

-- Drop existing FK if any (to replace with CASCADE version)
-- Note: the constraint name may vary; attempt the common name
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'chunks_file_id_fkey' AND table_name = 'chunks'
    ) THEN
        ALTER TABLE chunks DROP CONSTRAINT chunks_file_id_fkey;
    END IF;
END $$;

-- Add FK with CASCADE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'chunks_file_id_fkey' AND table_name = 'chunks'
    ) THEN
        ALTER TABLE chunks
        ADD CONSTRAINT chunks_file_id_fkey
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;
    END IF;
END $$;
