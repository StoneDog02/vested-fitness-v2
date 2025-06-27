-- Add Performance Indexes for Dashboard Optimization
-- This migration adds strategic indexes for all common query patterns

-- Users table indexes (already has auth_id and email)
-- Add composite index for coach-client relationships
CREATE INDEX IF NOT EXISTS idx_users_coach_id_role ON users(coach_id, role) WHERE coach_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Workout Plans indexes
CREATE INDEX IF NOT EXISTS idx_workout_plans_user_id_active ON workout_plans(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_workout_plans_user_id ON workout_plans(user_id);

-- Workout Days indexes
CREATE INDEX IF NOT EXISTS idx_workout_days_plan_id ON workout_days(workout_plan_id);
CREATE INDEX IF NOT EXISTS idx_workout_days_plan_id_day ON workout_days(workout_plan_id, day_of_week);

-- Workout Exercises indexes
CREATE INDEX IF NOT EXISTS idx_workout_exercises_day_id ON workout_exercises(workout_day_id);

-- Workout Completions indexes
CREATE INDEX IF NOT EXISTS idx_workout_completions_user_date ON workout_completions(user_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_workout_completions_user_id ON workout_completions(user_id);

-- Meal Plans indexes
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_id_active ON meal_plans(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_id ON meal_plans(user_id);

-- Meals indexes
CREATE INDEX IF NOT EXISTS idx_meals_plan_id ON meals(meal_plan_id);
CREATE INDEX IF NOT EXISTS idx_meals_plan_id_sequence ON meals(meal_plan_id, sequence_order);

-- Foods indexes (for meal-food relationships)
CREATE INDEX IF NOT EXISTS idx_foods_meal_id ON foods(meal_id) WHERE meal_id IS NOT NULL;

-- Meal Completions indexes (already has user_date index)
CREATE INDEX IF NOT EXISTS idx_meal_completions_user_id ON meal_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_completions_meal_id ON meal_completions(meal_id);

-- Supplements indexes
CREATE INDEX IF NOT EXISTS idx_supplements_user_id ON supplements(user_id);

-- Supplement Completions indexes
CREATE INDEX IF NOT EXISTS idx_supplement_completions_user_date ON supplement_completions(user_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_supplement_completions_user_id ON supplement_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_supplement_completions_supplement_id ON supplement_completions(supplement_id);

-- Weight Logs indexes
CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date ON weight_logs(user_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_weight_logs_user_id ON weight_logs(user_id);

-- Coach Updates indexes (already has coach_id, client_id, created_at)
-- Add composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_coach_updates_client_created ON coach_updates(client_id, created_at DESC);

-- Check Ins indexes (if this table exists)
CREATE INDEX IF NOT EXISTS idx_check_ins_client_id ON check_ins(client_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_coach_id ON check_ins(coach_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_created_at ON check_ins(created_at);

-- Add bulk query optimization indexes for IN clauses
-- These help with the bulk queries we're using
CREATE INDEX IF NOT EXISTS idx_workout_plans_user_ids ON workout_plans(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_ids ON meal_plans(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplements_user_ids ON supplements(user_id) WHERE user_id IS NOT NULL;

-- Compliance calculation indexes
CREATE INDEX IF NOT EXISTS idx_workout_completions_date_range ON workout_completions(user_id, completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meal_completions_date_range ON meal_completions(user_id, completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supplement_completions_date_range ON supplement_completions(user_id, completed_at) WHERE completed_at IS NOT NULL; 