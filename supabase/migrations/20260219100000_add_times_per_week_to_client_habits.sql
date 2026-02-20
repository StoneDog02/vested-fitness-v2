-- Add times_per_week for cadence "Times per week"
ALTER TABLE client_habits ADD COLUMN IF NOT EXISTS times_per_week INTEGER NULL;

-- Allow frequency 'times_per_week'
ALTER TABLE client_habits DROP CONSTRAINT IF EXISTS client_habits_frequency_check;
ALTER TABLE client_habits ADD CONSTRAINT client_habits_frequency_check
  CHECK (frequency IN ('daily', 'weekly', 'flexible', 'times_per_week'));
