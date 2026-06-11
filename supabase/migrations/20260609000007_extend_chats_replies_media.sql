ALTER TABLE chats ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES chats(id) ON DELETE SET NULL;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text';
ALTER TABLE chats ADD COLUMN IF NOT EXISTS attachment_url text;
ALTER TABLE chats ADD COLUMN IF NOT EXISTS attachment_metadata jsonb;

ALTER TABLE chats ADD CONSTRAINT chats_message_type_check CHECK (
  message_type IN ('text', 'image', 'gif')
);

CREATE INDEX idx_chats_reply_to_id ON chats(reply_to_id) WHERE reply_to_id IS NOT NULL;
