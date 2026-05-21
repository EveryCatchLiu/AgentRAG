-- 步骤 1：创建表
CREATE TABLE IF NOT EXISTS threads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL DEFAULT 'New Thread',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
