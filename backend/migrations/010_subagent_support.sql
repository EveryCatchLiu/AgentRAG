-- 010: Sub-agent support - metadata column for tool calls and reasoning traces

ALTER TABLE messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_messages_metadata ON messages USING GIN (metadata);
