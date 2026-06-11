-- Allow poll message type
ALTER TABLE chats DROP CONSTRAINT IF EXISTS chats_message_type_check;
ALTER TABLE chats ADD CONSTRAINT chats_message_type_check CHECK (
  message_type IN ('text', 'image', 'gif', 'poll')
);

CREATE TABLE chat_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE REFERENCES chats(id) ON DELETE CASCADE,
  question text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chat_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES chat_polls(id) ON DELETE CASCADE,
  label text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_poll_options_poll_id ON chat_poll_options(poll_id);

CREATE TABLE chat_poll_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES chat_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES chat_poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, user_id)
);

CREATE INDEX idx_chat_poll_votes_poll_id ON chat_poll_votes(poll_id);
CREATE INDEX idx_chat_poll_votes_option_id ON chat_poll_votes(option_id);

ALTER TABLE chat_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_poll_votes ENABLE ROW LEVEL SECURITY;

-- Poll access follows parent message access
CREATE POLICY "Users can view polls for accessible messages" ON chat_polls
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chats c
      WHERE c.id = chat_polls.message_id
      AND (
        (c.group_id IS NULL AND (c.coach_id = current_user_id() OR c.client_id = current_user_id()))
        OR
        (c.group_id IS NOT NULL AND (
          c.coach_id = current_user_id()
          OR EXISTS (
            SELECT 1 FROM chat_group_members cgm
            WHERE cgm.group_id = c.group_id AND cgm.client_id = current_user_id()
          )
        ))
      )
    )
  );

CREATE POLICY "Users can view poll options for accessible polls" ON chat_poll_options
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_polls p
      JOIN chats c ON c.id = p.message_id
      WHERE p.id = chat_poll_options.poll_id
      AND (
        (c.group_id IS NULL AND (c.coach_id = current_user_id() OR c.client_id = current_user_id()))
        OR
        (c.group_id IS NOT NULL AND (
          c.coach_id = current_user_id()
          OR EXISTS (
            SELECT 1 FROM chat_group_members cgm
            WHERE cgm.group_id = c.group_id AND cgm.client_id = current_user_id()
          )
        ))
      )
    )
  );

CREATE POLICY "Users can view poll votes for accessible polls" ON chat_poll_votes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_polls p
      JOIN chats c ON c.id = p.message_id
      WHERE p.id = chat_poll_votes.poll_id
      AND (
        (c.group_id IS NULL AND (c.coach_id = current_user_id() OR c.client_id = current_user_id()))
        OR
        (c.group_id IS NOT NULL AND (
          c.coach_id = current_user_id()
          OR EXISTS (
            SELECT 1 FROM chat_group_members cgm
            WHERE cgm.group_id = c.group_id AND cgm.client_id = current_user_id()
          )
        ))
      )
    )
  );

CREATE POLICY "Users can vote on accessible polls" ON chat_poll_votes
  FOR INSERT WITH CHECK (
    user_id = current_user_id()
    AND EXISTS (
      SELECT 1 FROM chat_polls p
      JOIN chats c ON c.id = p.message_id
      WHERE p.id = chat_poll_votes.poll_id
      AND (
        (c.group_id IS NULL AND (c.coach_id = current_user_id() OR c.client_id = current_user_id()))
        OR
        (c.group_id IS NOT NULL AND (
          c.coach_id = current_user_id()
          OR EXISTS (
            SELECT 1 FROM chat_group_members cgm
            WHERE cgm.group_id = c.group_id AND cgm.client_id = current_user_id()
          )
        ))
      )
    )
  );

CREATE POLICY "Users can update own poll votes" ON chat_poll_votes
  FOR UPDATE USING (user_id = current_user_id());

CREATE POLICY "Users can delete own poll votes" ON chat_poll_votes
  FOR DELETE USING (user_id = current_user_id());

CREATE POLICY "Service role manages chat_polls" ON chat_polls
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages chat_poll_options" ON chat_poll_options
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role manages chat_poll_votes" ON chat_poll_votes
  FOR ALL USING (auth.role() = 'service_role');

ALTER PUBLICATION supabase_realtime ADD TABLE chat_poll_votes;
