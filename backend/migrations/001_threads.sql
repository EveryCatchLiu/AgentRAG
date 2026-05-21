-- 第 1 步：创建表
CREATE TABLE threads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title text NOT NULL DEFAULT 'New Thread',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 第 2 步
CREATE TABLE messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 第 3 步
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;

-- 第 4 步
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 第 5 步
CREATE POLICY "Users can view own threads" ON threads FOR SELECT USING (auth.uid() = user_id);

-- 第 6 步
CREATE POLICY "Users can insert own threads" ON threads FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 第 7 步
CREATE POLICY "Users can update own threads" ON threads FOR UPDATE USING (auth.uid() = user_id);

-- 第 8 步
CREATE POLICY "Users can delete own threads" ON threads FOR DELETE USING (auth.uid() = user_id);

-- 第 9 步
CREATE POLICY "Users can view own messages" ON messages FOR SELECT USING (EXISTS (SELECT 1 FROM threads WHERE threads.id = messages.thread_id AND threads.user_id = auth.uid()));

-- 第 10 步
CREATE POLICY "Users can insert own messages" ON messages FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM threads WHERE threads.id = messages.thread_id AND threads.user_id = auth.uid()));

-- 第 11 步
CREATE POLICY "Users can update own messages" ON messages FOR UPDATE USING (EXISTS (SELECT 1 FROM threads WHERE threads.id = messages.thread_id AND threads.user_id = auth.uid()));

-- 第 12 步
CREATE POLICY "Users can delete own messages" ON messages FOR DELETE USING (EXISTS (SELECT 1 FROM threads WHERE threads.id = messages.thread_id AND threads.user_id = auth.uid()));

-- 第 13 步
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 第 14 步
CREATE TRIGGER update_threads_updated_at BEFORE UPDATE ON threads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
