-- Fix missing include_confirmation column in scheduled_messages table

-- Add the missing column
ALTER TABLE public.scheduled_messages 
ADD COLUMN IF NOT EXISTS include_confirmation BOOLEAN DEFAULT FALSE;

-- Update existing records
UPDATE public.scheduled_messages 
SET include_confirmation = FALSE 
WHERE include_confirmation IS NULL;

-- Verify the column exists
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'scheduled_messages' 
AND column_name = 'include_confirmation';
