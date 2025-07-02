-- Add is_active field to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Create index for better performance on active status queries
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active) WHERE is_active = true;

-- Update any existing users to be active by default
UPDATE public.users SET is_active = true WHERE is_active IS NULL; 