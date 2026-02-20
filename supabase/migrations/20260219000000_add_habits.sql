-- habit_presets: system (coach_id NULL) or coach-created presets
CREATE TABLE habit_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  preset_type TEXT NOT NULL CHECK (preset_type IN ('steps', 'water', 'sleep', 'meditation', 'custom')),
  target_default NUMERIC,
  target_unit TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_habit_presets_coach_id ON habit_presets(coach_id);
CREATE INDEX idx_habit_presets_coach_type ON habit_presets(coach_id, preset_type);

-- client_habits: assignments of presets to a client (with optional overrides)
CREATE TABLE client_habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_preset_id UUID NOT NULL REFERENCES habit_presets(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  custom_name TEXT,
  custom_description TEXT,
  target_value NUMERIC,
  target_unit TEXT,
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'flexible')),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (client_id, habit_preset_id)
);

CREATE INDEX idx_client_habits_client_id ON client_habits(client_id);
CREATE INDEX idx_client_habits_coach_id ON client_habits(coach_id);
CREATE INDEX idx_client_habits_habit_preset_id ON client_habits(habit_preset_id);

-- habit_completions: client completion records per day
CREATE TABLE habit_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_habit_id UUID NOT NULL REFERENCES client_habits(id) ON DELETE CASCADE,
  completed_at DATE NOT NULL,
  value NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (client_habit_id, completed_at)
);

CREATE INDEX idx_habit_completions_client_habit_id ON habit_completions(client_habit_id);
CREATE INDEX idx_habit_completions_completed_at ON habit_completions(client_habit_id, completed_at);

-- habit_notes: coach and client notes (general or tied to a habit)
CREATE TABLE habit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_habit_id UUID REFERENCES client_habits(id) ON DELETE SET NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('coach', 'client')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_habit_notes_client_id ON habit_notes(client_id);
CREATE INDEX idx_habit_notes_coach_id ON habit_notes(coach_id);
CREATE INDEX idx_habit_notes_client_habit_id ON habit_notes(client_habit_id);
CREATE INDEX idx_habit_notes_created_at ON habit_notes(created_at DESC);

-- RLS
ALTER TABLE habit_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_notes ENABLE ROW LEVEL SECURITY;

-- habit_presets: system presets visible to all; coaches manage their own (auth.uid() is UUID)
CREATE POLICY "Anyone can read habit presets" ON habit_presets FOR SELECT USING (true);
CREATE POLICY "Coaches can insert own presets" ON habit_presets FOR INSERT WITH CHECK (coach_id = auth.uid());
CREATE POLICY "Coaches can update own presets" ON habit_presets FOR UPDATE USING (coach_id = auth.uid());
CREATE POLICY "Coaches can delete own presets" ON habit_presets FOR DELETE USING (coach_id = auth.uid());

-- client_habits: coach manages assignments for their clients; client can read own
CREATE POLICY "Coach can manage client_habits for their clients" ON client_habits FOR ALL USING (
  coach_id = auth.uid() OR client_id = auth.uid()
);
CREATE POLICY "Coach can insert client_habits for their clients" ON client_habits FOR INSERT WITH CHECK (
  coach_id = auth.uid() AND EXISTS (SELECT 1 FROM users u WHERE u.id = client_id AND u.coach_id = auth.uid())
);

-- habit_completions: coach reads for their clients; client manages own
CREATE POLICY "Coach or client can read habit_completions" ON habit_completions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM client_habits ch
    WHERE ch.id = habit_completions.client_habit_id
    AND (ch.coach_id = auth.uid() OR ch.client_id = auth.uid())
  )
);
CREATE POLICY "Client can insert own habit_completions" ON habit_completions FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM client_habits ch
    WHERE ch.id = habit_completions.client_habit_id AND ch.client_id = auth.uid()
  )
);
CREATE POLICY "Client can update own habit_completions" ON habit_completions FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM client_habits ch
    WHERE ch.id = habit_completions.client_habit_id AND ch.client_id = auth.uid()
  )
);
CREATE POLICY "Client can delete own habit_completions" ON habit_completions FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM client_habits ch
    WHERE ch.id = habit_completions.client_habit_id AND ch.client_id = auth.uid()
  )
);

-- habit_notes: coach and client read/write as specified
CREATE POLICY "Coach or client can read habit_notes" ON habit_notes FOR SELECT USING (
  coach_id = auth.uid() OR client_id = auth.uid()
);
CREATE POLICY "Coach can insert habit_notes for their clients" ON habit_notes FOR INSERT WITH CHECK (
  coach_id = auth.uid() AND (author_role = 'coach')
);
CREATE POLICY "Client can insert own habit_notes" ON habit_notes FOR INSERT WITH CHECK (
  client_id = auth.uid() AND author_role = 'client'
);

-- Seed 4 system presets (coach_id NULL, no default goal - coach enters in Customize modal)
INSERT INTO habit_presets (id, coach_id, name, description, preset_type, target_default, target_unit, created_at) VALUES
  (gen_random_uuid(), NULL, 'Daily Steps', 'Hit your daily step goal for consistent movement.', 'steps', NULL, NULL, NOW()),
  (gen_random_uuid(), NULL, 'Water Intake', 'Stay hydrated with a daily water goal.', 'water', NULL, NULL, NOW()),
  (gen_random_uuid(), NULL, 'Sleep', 'Get consistent, quality sleep each night.', 'sleep', NULL, NULL, NOW()),
  (gen_random_uuid(), NULL, 'Meditation', 'Daily mindfulness or meditation practice.', 'meditation', NULL, NULL, NOW());
