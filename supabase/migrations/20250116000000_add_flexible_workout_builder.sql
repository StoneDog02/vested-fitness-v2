-- Add flexible workout builder fields to workout_plans table
ALTER TABLE workout_plans
ADD COLUMN builder_mode TEXT DEFAULT 'week' CHECK (builder_mode IN ('week', 'day')),
ADD COLUMN workout_days_per_week INTEGER DEFAULT 7 CHECK (workout_days_per_week >= 1 AND workout_days_per_week <= 7);

-- Add comment to explain the new fields
COMMENT ON COLUMN workout_plans.builder_mode IS 'Determines if this is a fixed schedule plan (specific days) or flexible schedule plan (flexible workout selection)';
COMMENT ON COLUMN workout_plans.workout_days_per_week IS 'Number of workout days per week for day-based plans (rest days = 7 - workout_days_per_week)'; 