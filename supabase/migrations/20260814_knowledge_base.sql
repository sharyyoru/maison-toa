-- Knowledge Base System for AI Prompts
-- Stores topics (conversations), messages, and file attachments

CREATE TABLE IF NOT EXISTS knowledge_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Topic',
  description TEXT,
  icon TEXT DEFAULT 'sparkles',
  color TEXT DEFAULT 'sky',
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  message_count INTEGER NOT NULL DEFAULT 0,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_topics_user_id_idx ON knowledge_topics(user_id);
CREATE INDEX IF NOT EXISTS knowledge_topics_user_updated_idx ON knowledge_topics(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_topics_user_pinned_idx ON knowledge_topics(user_id, is_pinned, updated_at DESC);

DO $$ BEGIN
  CREATE TYPE knowledge_message_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS knowledge_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES knowledge_topics(id) ON DELETE CASCADE,
  role knowledge_message_role NOT NULL,
  content TEXT NOT NULL,
  has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
  model_used TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_messages_topic_id_idx ON knowledge_messages(topic_id);
CREATE INDEX IF NOT EXISTS knowledge_messages_topic_created_idx ON knowledge_messages(topic_id, created_at);

CREATE TABLE IF NOT EXISTS knowledge_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES knowledge_messages(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES knowledge_topics(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  extracted_text TEXT,
  is_processed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_attachments_message_id_idx ON knowledge_attachments(message_id);
CREATE INDEX IF NOT EXISTS knowledge_attachments_topic_id_idx ON knowledge_attachments(topic_id);

CREATE OR REPLACE FUNCTION update_knowledge_topic_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE knowledge_topics
    SET 
      message_count = message_count + 1,
      last_message_at = NEW.created_at,
      updated_at = NOW()
    WHERE id = NEW.topic_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE knowledge_topics
    SET 
      message_count = GREATEST(0, message_count - 1),
      updated_at = NOW()
    WHERE id = OLD.topic_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS knowledge_messages_stats_trigger ON knowledge_messages;
CREATE TRIGGER knowledge_messages_stats_trigger
AFTER INSERT OR DELETE ON knowledge_messages
FOR EACH ROW EXECUTE FUNCTION update_knowledge_topic_stats();

CREATE OR REPLACE FUNCTION update_knowledge_topic_attachment_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE knowledge_topics
    SET attachment_count = attachment_count + 1, updated_at = NOW()
    WHERE id = NEW.topic_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE knowledge_topics
    SET attachment_count = GREATEST(0, attachment_count - 1), updated_at = NOW()
    WHERE id = OLD.topic_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS knowledge_attachments_count_trigger ON knowledge_attachments;
CREATE TRIGGER knowledge_attachments_count_trigger
AFTER INSERT OR DELETE ON knowledge_attachments
FOR EACH ROW EXECUTE FUNCTION update_knowledge_topic_attachment_count();

-- Storage bucket for knowledge base attachments (best effort via SQL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-files', 'knowledge-files', false)
ON CONFLICT (id) DO NOTHING;
