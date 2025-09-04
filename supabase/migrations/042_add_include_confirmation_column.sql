-- Add include_confirmation column to scheduled_messages table
ALTER TABLE public.scheduled_messages 
ADD COLUMN IF NOT EXISTS include_confirmation BOOLEAN DEFAULT FALSE;

-- Update existing records to have confirmation disabled by default
UPDATE public.scheduled_messages 
SET include_confirmation = FALSE 
WHERE include_confirmation IS NULL;
