-- Remove redundant is_active column from users table
-- We already have a status column that serves the same purpose more flexibly

ALTER TABLE users DROP COLUMN IF EXISTS is_active; 