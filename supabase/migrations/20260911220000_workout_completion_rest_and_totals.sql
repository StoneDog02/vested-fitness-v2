-- Distinguish explicit rest days from workout saves, and store the
-- denominator needed to show real completion percentages.
-- Live schema already has completed_groups as text[] and nullable workout_day_id.
ALTER TABLE workout_completions
  ADD COLUMN IF NOT EXISTS is_rest BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS total_groups INTEGER;

COMMENT ON COLUMN workout_completions.is_rest IS
  'True only when the client explicitly submitted a Rest Day. Empty completed_groups with is_rest=false is a 0% workout.';
COMMENT ON COLUMN workout_completions.total_groups IS
  'Number of exercise groups in the submitted workout; used as the completion % denominator.';

-- Preserve historical Rest labels: empty completed_groups used to mean rest.
UPDATE workout_completions
SET is_rest = true
WHERE is_rest = false
  AND (completed_groups IS NULL OR completed_groups = '{}'::text[]);
