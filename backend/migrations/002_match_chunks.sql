-- Chunk matching RPC function
CREATE OR REPLACE FUNCTION match_chunks(
    query_embedding vector(1536),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    content text,
    similarity float,
    filename text,
    chunk_index int
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        chunks.content,
        1 - (chunks.embedding <=> query_embedding) AS similarity,
        files.filename,
        chunks.chunk_index
    FROM chunks
    JOIN files ON files.id = chunks.file_id
    WHERE 1 - (chunks.embedding <=> query_embedding) > match_threshold
    ORDER BY chunks.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
