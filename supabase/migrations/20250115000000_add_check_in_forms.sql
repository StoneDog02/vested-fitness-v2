-- Create check_in_forms table to store form templates
CREATE TABLE check_in_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create check_in_form_questions table to store individual questions
CREATE TABLE check_in_form_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES check_in_forms(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('text', 'textarea', 'number', 'select', 'radio', 'checkbox')),
  is_required BOOLEAN DEFAULT false,
  options JSONB, -- For select, radio, checkbox questions
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create check_in_form_instances table to track when forms are sent to clients
CREATE TABLE check_in_form_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES check_in_forms(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'completed', 'expired')),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Create check_in_form_responses table to store client responses
CREATE TABLE check_in_form_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES check_in_form_instances(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES check_in_form_questions(id) ON DELETE CASCADE,
  response_text TEXT,
  response_number NUMERIC,
  response_options JSONB, -- For checkbox responses
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);



-- Add indexes for better performance
CREATE INDEX idx_check_in_forms_coach_id ON check_in_forms(coach_id);
CREATE INDEX idx_check_in_form_questions_form_id ON check_in_form_questions(form_id);
CREATE INDEX idx_check_in_form_instances_client_id ON check_in_form_instances(client_id);
CREATE INDEX idx_check_in_form_instances_status ON check_in_form_instances(status);
CREATE INDEX idx_check_in_form_responses_instance_id ON check_in_form_responses(instance_id);

-- Add RLS policies
ALTER TABLE check_in_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_in_form_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_in_form_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_in_form_responses ENABLE ROW LEVEL SECURITY;

-- Coaches can manage their own forms
CREATE POLICY "Coaches can manage their own forms" ON check_in_forms
  FOR ALL USING (coach_id = auth.uid()::text);

-- Coaches can view questions for their forms
CREATE POLICY "Coaches can view questions for their forms" ON check_in_form_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM check_in_forms 
      WHERE check_in_forms.id = check_in_form_questions.form_id 
      AND check_in_forms.coach_id = auth.uid()::text
    )
  );

-- Coaches can manage questions for their forms
CREATE POLICY "Coaches can manage questions for their forms" ON check_in_form_questions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM check_in_forms 
      WHERE check_in_forms.id = check_in_form_questions.form_id 
      AND check_in_forms.coach_id = auth.uid()::text
    )
  );

-- Coaches can view instances they sent
CREATE POLICY "Coaches can view instances they sent" ON check_in_form_instances
  FOR SELECT USING (coach_id = auth.uid()::text);

-- Coaches can manage instances they sent
CREATE POLICY "Coaches can manage instances they sent" ON check_in_form_instances
  FOR ALL USING (coach_id = auth.uid()::text);

-- Clients can view instances sent to them
CREATE POLICY "Clients can view instances sent to them" ON check_in_form_instances
  FOR SELECT USING (client_id = auth.uid()::text);

-- Clients can update instances sent to them (for completion)
CREATE POLICY "Clients can update instances sent to them" ON check_in_form_instances
  FOR UPDATE USING (client_id = auth.uid()::text);

-- Clients can view responses for their instances
CREATE POLICY "Clients can view responses for their instances" ON check_in_form_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM check_in_form_instances 
      WHERE check_in_form_instances.id = check_in_form_responses.instance_id 
      AND check_in_form_instances.client_id = auth.uid()::text
    )
  );

-- Clients can insert responses for their instances
CREATE POLICY "Clients can insert responses for their instances" ON check_in_form_responses
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM check_in_form_instances 
      WHERE check_in_form_instances.id = check_in_form_responses.instance_id 
      AND check_in_form_instances.client_id = auth.uid()::text
    )
  );

-- Coaches can view responses for instances they sent
CREATE POLICY "Coaches can view responses for instances they sent" ON check_in_form_responses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM check_in_form_instances 
      WHERE check_in_form_instances.id = check_in_form_responses.instance_id 
      AND check_in_form_instances.coach_id = auth.uid()::text
    )
  ); 