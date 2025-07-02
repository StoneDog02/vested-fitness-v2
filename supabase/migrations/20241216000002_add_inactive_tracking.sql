-- Add inactive_since field to track when users become inactive
ALTER TABLE users ADD COLUMN inactive_since TIMESTAMP WITH TIME ZONE;

-- Set inactive_since for existing inactive users to their updated_at timestamp
UPDATE users 
SET inactive_since = updated_at 
WHERE status = 'inactive' AND inactive_since IS NULL; 