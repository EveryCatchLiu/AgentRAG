-- 007: Drop old match_chunks function to fix overload resolution
DROP FUNCTION IF EXISTS match_chunks(vector, float, int);

-- Re-run 006 to ensure correct version exists
CREATE OR REPLACE FUNCTION match_chunks(
    query_embedding vector(1536),
    match_threshold float,
    match_count int,
    filter_file_ids uuid[] DEFAULT NULL,
    filter_topics text[] DEFAULT NULL,
    filter_doc_types text[] DEFAULT NULL
)
RETURNS TABLE (
    content text,
    similarity float,
    filename text,
    chunk_index int,
    file_id uuid
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        chunks.content,
        1 - (chunks.embedding <=> query_embedding) AS similarity,
        files.filename,
        chunks.chunk_index,
        files.id AS file_id
    FROM chunks
    JOIN files ON files.id = chunks.file_id
    WHERE 1 - (chunks.embedding <=> query_embedding) > match_threshold
      AND (filter_file_ids IS NULL OR files.id = ANY(filter_file_ids))
      AND (filter_topics IS NULL OR files.metadata->'topics' ?| filter_topics)
      AND (filter_doc_types IS NULL OR files.metadata->>'document_type' = ANY(filter_doc_types))
    ORDER BY chunks.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
