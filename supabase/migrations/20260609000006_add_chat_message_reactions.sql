CREATE TABLE chat_message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, reaction)
);

CREATE INDEX idx_chat_message_reactions_message_id ON chat_message_reactions(message_id);

ALTER TABLE chat_message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reactions for accessible messages" ON chat_message_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chats c
      WHERE c.id = chat_message_reactions.message_id
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

CREATE POLICY "Users can add own reactions to accessible messages" ON chat_message_reactions
  FOR INSERT WITH CHECK (
    user_id = current_user_id()
    AND EXISTS (
      SELECT 1 FROM chats c
      WHERE c.id = chat_message_reactions.message_id
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

CREATE POLICY "Users can remove own reactions" ON chat_message_reactions
  FOR DELETE USING (user_id = current_user_id());

CREATE POLICY "Service role can manage all reactions" ON chat_message_reactions
  FOR ALL USING (auth.role() = 'service_role');
