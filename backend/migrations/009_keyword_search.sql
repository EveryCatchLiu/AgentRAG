-- 009: Keyword search via substring matching for hybrid retrieval

-- Drop old pg_trgm-based version
DROP FUNCTION IF EXISTS match_chunks_keyword(text, int, uuid[], text[], text[]);

-- Keyword search RPC using substring matching (works for all languages including Chinese)
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
    keyword_score float
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
            / greatest(length(query_text), 1)::float AS keyword_score
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
