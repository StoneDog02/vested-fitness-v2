CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM users WHERE auth_id = auth.uid()::text LIMIT 1;
$$;

DROP POLICY IF EXISTS "Coach or client can insert chat messages" ON chats;
DROP POLICY IF EXISTS "Coach or client can view their chat messages" ON chats;
DROP POLICY IF EXISTS "Sender can delete their own messages" ON chats;
DROP POLICY IF EXISTS "Sender can update their own messages" ON chats;

CREATE POLICY "Users can view accessible chat messages" ON chats
  FOR SELECT USING (
    (group_id IS NULL AND (coach_id = current_user_id() OR client_id = current_user_id()))
    OR
    (group_id IS NOT NULL AND (
      coach_id = current_user_id()
      OR EXISTS (
        SELECT 1 FROM chat_group_members cgm
        WHERE cgm.group_id = chats.group_id AND cgm.client_id = current_user_id()
      )
    ))
  );

CREATE POLICY "Users can insert accessible chat messages" ON chats
  FOR INSERT WITH CHECK (
    (group_id IS NULL AND (coach_id = current_user_id() OR client_id = current_user_id()))
    OR
    (group_id IS NOT NULL AND (
      coach_id = current_user_id()
      OR EXISTS (
        SELECT 1 FROM chat_group_members cgm
        WHERE cgm.group_id = chats.group_id AND cgm.client_id = current_user_id()
      )
    ))
  );

CREATE POLICY "Users can update own chat messages" ON chats
  FOR UPDATE USING (
    ((coach_id = current_user_id()) AND sender = 'coach')
    OR ((client_id = current_user_id()) AND sender = 'client')
  );

CREATE POLICY "Users can delete own chat messages" ON chats
  FOR DELETE USING (
    ((coach_id = current_user_id()) AND sender = 'coach')
    OR ((client_id = current_user_id()) AND sender = 'client')
  );

CREATE POLICY "Service role can manage all chats" ON chats
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Coaches can manage their own groups" ON chat_groups
  FOR ALL USING (coach_id = current_user_id());

CREATE POLICY "Clients can view groups they belong to" ON chat_groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_group_members cgm
      WHERE cgm.group_id = chat_groups.id AND cgm.client_id = current_user_id()
    )
  );

CREATE POLICY "Service role can manage all groups" ON chat_groups
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Coaches can manage members of their groups" ON chat_group_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM chat_groups cg
      WHERE cg.id = chat_group_members.group_id AND cg.coach_id = current_user_id()
    )
  );

CREATE POLICY "Clients can view their group memberships" ON chat_group_members
  FOR SELECT USING (client_id = current_user_id());

CREATE POLICY "Service role can manage all group members" ON chat_group_members
  FOR ALL USING (auth.role() = 'service_role');
