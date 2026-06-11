ALTER TABLE chats ADD COLUMN group_id uuid REFERENCES chat_groups(id) ON DELETE CASCADE;

ALTER TABLE chats ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE chats ADD CONSTRAINT chats_dm_or_group_check CHECK (
  (group_id IS NULL AND client_id IS NOT NULL) OR
  (group_id IS NOT NULL)
);

CREATE INDEX idx_chats_group_id ON chats(group_id);
CREATE INDEX idx_chats_coach_client ON chats(coach_id, client_id) WHERE group_id IS NULL;
CREATE INDEX idx_chats_group_timestamp ON chats(group_id, timestamp DESC) WHERE group_id IS NOT NULL;
