-- Add user preference fields to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS font_size text DEFAULT 'medium' CHECK (font_size IN ('small', 'medium', 'large'));

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS email_notifications boolean DEFAULT true;

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS app_notifications boolean DEFAULT true;

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS weekly_summary boolean DEFAULT true;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email_notifications ON users(email_notifications) WHERE email_notifications = true;
CREATE INDEX IF NOT EXISTS idx_users_weekly_summary ON users(weekly_summary) WHERE weekly_summary = true; 