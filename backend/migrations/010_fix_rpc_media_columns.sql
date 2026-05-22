-- 010: Update match_chunks RPCs to return media columns + fix vector dimension

-- Drop old versions
DROP FUNCTION IF EXISTS match_chunks(vector, float, int);
DROP FUNCTION IF EXISTS match_chunks(vector, float, int, uuid[], text[], text[]);
DROP FUNCTION IF EXISTS match_chunks_keyword(text, int, uuid[], text[], text[]);

-- Vector search RPC (now 1024-dim)
CREATE OR REPLACE FUNCTION match_chunks(
    query_embedding vector(1024),
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
    file_id uuid,
    media_type text,
    media_url text
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
        files.id AS file_id,
        chunks.media_type,
        chunks.media_url
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

-- Keyword search RPC
CREATE OR REPLACE FUNCTION match_chunks_keyword(
    query_text text,
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
    file_id uuid,
    keyword_score float,
    media_type text,
    media_url text
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        chunks.content,
        0::float AS similarity,
        files.filename,
        chunks.chunk_index,
        files.id AS file_id,
        (length(chunks.content) - length(replace(lower(chunks.content), lower(query_text), '')))::float
            / greatest(length(query_text), 1)::float AS keyword_score,
        chunks.media_type,
        chunks.media_url
    FROM chunks
    JOIN files ON files.id = chunks.file_id
    WHERE lower(chunks.content) LIKE '%' || lower(query_text) || '%'
      AND (filter_file_ids IS NULL OR files.id = ANY(filter_file_ids))
      AND (filter_topics IS NULL OR files.metadata->'topics' ?| filter_topics)
      AND (filter_doc_types IS NULL OR files.metadata->>'document_type' = ANY(filter_doc_types))
    ORDER BY keyword_score DESC
    LIMIT match_count;
END;
$$;
