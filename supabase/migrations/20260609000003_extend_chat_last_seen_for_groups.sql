ALTER TABLE chat_last_seen ADD COLUMN group_id uuid REFERENCES chat_groups(id) ON DELETE CASCADE;

ALTER TABLE chat_last_seen ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE chat_last_seen DROP CONSTRAINT IF EXISTS chat_last_seen_user_id_coach_id_client_id_key;

CREATE UNIQUE INDEX chat_last_seen_dm_unique ON chat_last_seen (user_id, coach_id, client_id) WHERE group_id IS NULL;

CREATE UNIQUE INDEX chat_last_seen_group_unique ON chat_last_seen (user_id, group_id) WHERE group_id IS NOT NULL;

ALTER TABLE chat_last_seen ADD CONSTRAINT chat_last_seen_dm_or_group_check CHECK (
  (group_id IS NULL AND client_id IS NOT NULL) OR
  (group_id IS NOT NULL)
);

CREATE INDEX idx_chat_last_seen_group_id ON chat_last_seen(group_id) WHERE group_id IS NOT NULL;
