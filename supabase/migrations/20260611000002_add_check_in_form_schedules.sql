-- Recurring check-in form schedules
CREATE TABLE check_in_form_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES check_in_forms(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  day_of_week SMALLINT CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
  day_of_month SMALLINT CHECK (day_of_month IS NULL OR (day_of_month >= 1 AND day_of_month <= 28)),
  time_of_day TIME NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Denver',
  expires_in_days INTEGER NOT NULL DEFAULT 7,
  title TEXT NOT NULL,
  description TEXT,
  questions_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_sent_at TIMESTAMP WITH TIME ZONE,
  next_send_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_check_in_form_schedules_active_next_send
  ON check_in_form_schedules (is_active, next_send_at)
  WHERE is_active = true;

CREATE UNIQUE INDEX idx_check_in_form_schedules_active_client_form
  ON check_in_form_schedules (client_id, form_id)
  WHERE is_active = true;

CREATE INDEX idx_check_in_form_schedules_client_id ON check_in_form_schedules(client_id);
CREATE INDEX idx_check_in_form_schedules_coach_id ON check_in_form_schedules(coach_id);

ALTER TABLE check_in_form_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view their form schedules" ON check_in_form_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = check_in_form_schedules.coach_id
      AND u.auth_id = auth.uid()::text
    )
  );

CREATE POLICY "Coaches can manage their form schedules" ON check_in_form_schedules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = check_in_form_schedules.coach_id
      AND u.auth_id = auth.uid()::text
    )
  );
