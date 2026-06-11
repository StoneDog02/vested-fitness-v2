-- Add snapshot columns to instances for per-send customization
ALTER TABLE check_in_form_instances
  ADD COLUMN title TEXT,
  ADD COLUMN description TEXT;

-- Instance-scoped questions (snapshot at send time)
CREATE TABLE check_in_form_instance_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES check_in_form_instances(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('text', 'textarea', 'number', 'select', 'radio', 'checkbox')),
  is_required BOOLEAN DEFAULT false,
  options JSONB,
  order_index INTEGER NOT NULL,
  source_question_id UUID REFERENCES check_in_form_questions(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_check_in_form_instance_questions_instance_id
  ON check_in_form_instance_questions(instance_id);

-- Link responses to instance questions for new submissions
ALTER TABLE check_in_form_responses
  ADD COLUMN instance_question_id UUID REFERENCES check_in_form_instance_questions(id) ON DELETE CASCADE;

-- Make question_id nullable for new snapshot-based responses
ALTER TABLE check_in_form_responses
  ALTER COLUMN question_id DROP NOT NULL;

-- RLS for instance questions
ALTER TABLE check_in_form_instance_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view instance questions they sent" ON check_in_form_instance_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM check_in_form_instances i
      JOIN users u ON u.id = i.coach_id
      WHERE i.id = check_in_form_instance_questions.instance_id
      AND u.auth_id = auth.uid()::text
    )
  );

CREATE POLICY "Coaches can manage instance questions they sent" ON check_in_form_instance_questions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM check_in_form_instances i
      JOIN users u ON u.id = i.coach_id
      WHERE i.id = check_in_form_instance_questions.instance_id
      AND u.auth_id = auth.uid()::text
    )
  );

CREATE POLICY "Clients can view instance questions for their instances" ON check_in_form_instance_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM check_in_form_instances i
      JOIN users u ON u.id = i.client_id
      WHERE i.id = check_in_form_instance_questions.instance_id
      AND u.auth_id = auth.uid()::text
    )
  );
