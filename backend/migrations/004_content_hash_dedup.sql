-- 004: Content hash for dedup + RLS policies for files/chunks

-- 1. Add content_hash column to files
ALTER TABLE files ADD COLUMN IF NOT EXISTS content_hash text;

-- 2. Indexes for fast dedup lookups
CREATE INDEX IF NOT EXISTS idx_files_user_content_hash
    ON files(user_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_files_user_filename
    ON files(user_id, filename);

-- 3. Enable RLS on files
ALTER TABLE files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own files" ON files;
CREATE POLICY "Users can view own files"
    ON files FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own files" ON files;
CREATE POLICY "Users can insert own files"
    ON files FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own files" ON files;
CREATE POLICY "Users can update own files"
    ON files FOR UPDATE
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own files" ON files;
CREATE POLICY "Users can delete own files"
    ON files FOR DELETE
    USING (auth.uid() = user_id);

-- 4. Enable RLS on chunks
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own chunks" ON chunks;
CREATE POLICY "Users can view own chunks"
    ON chunks FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM files
            WHERE files.id = chunks.file_id
              AND files.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert own chunks" ON chunks;
CREATE POLICY "Users can insert own chunks"
    ON chunks FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM files
            WHERE files.id = chunks.file_id
              AND files.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete own chunks" ON chunks;
CREATE POLICY "Users can delete own chunks"
    ON chunks FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM files
            WHERE files.id = chunks.file_id
              AND files.user_id = auth.uid()
        )
    );
