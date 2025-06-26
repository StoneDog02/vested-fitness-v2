-- Clean up any existing duplicates first
-- (This will keep the first occurrence and remove duplicates)
DELETE FROM meal_completions 
WHERE id NOT IN (
    SELECT MIN(id) 
    FROM meal_completions 
    GROUP BY user_id, meal_id, completed_at
);

-- Add unique constraint to prevent duplicate meal completions
-- This ensures a user cannot complete the same meal multiple times on the same day
ALTER TABLE meal_completions 
ADD CONSTRAINT unique_user_meal_date 
UNIQUE (user_id, meal_id, completed_at);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_meal_completions_user_date 
ON meal_completions (user_id, completed_at); 