-- Add updated_at column to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());

-- Update existing rows to have updated_at value
UPDATE public.users 
SET updated_at = created_at 
WHERE updated_at IS NULL; 