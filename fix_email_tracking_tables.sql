-- Fix Email Tracking Tables - Complete Setup
-- Drop existing tables if they exist (to ensure clean creation)
DROP TABLE IF EXISTS public.email_tracking CASCADE;
DROP TABLE IF EXISTS public.appointment_responses CASCADE;

-- Create email_tracking table
CREATE TABLE public.email_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create appointment_responses table  
CREATE TABLE public.appointment_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    response_token TEXT UNIQUE NOT NULL,
    response_type TEXT CHECK (response_type IN ('accepted', 'declined')),
    responded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_email_tracking_message_id ON public.email_tracking(message_id);
CREATE INDEX idx_email_tracking_customer_id ON public.email_tracking(customer_id);
CREATE INDEX idx_appointment_responses_message_id ON public.appointment_responses(message_id);
CREATE INDEX idx_appointment_responses_customer_id ON public.appointment_responses(customer_id);
CREATE INDEX idx_appointment_responses_token ON public.appointment_responses(response_token);

-- Enable RLS (Row Level Security)
ALTER TABLE public.email_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_responses ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for email_tracking (allow all operations for authenticated users)
CREATE POLICY "Allow all operations for authenticated users on email_tracking"
ON public.email_tracking
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Create RLS policies for appointment_responses (allow all operations for authenticated users)
CREATE POLICY "Allow all operations for authenticated users on appointment_responses"
ON public.appointment_responses
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Also allow anonymous access for the tracking endpoints
CREATE POLICY "Allow anonymous tracking insert on email_tracking"
ON public.email_tracking
FOR INSERT
TO anon
WITH CHECK (true);

CREATE POLICY "Allow anonymous response insert on appointment_responses"
ON public.appointment_responses
FOR INSERT
TO anon
WITH CHECK (true);

-- Grant necessary permissions
GRANT ALL ON public.email_tracking TO authenticated;
GRANT ALL ON public.appointment_responses TO authenticated;
GRANT INSERT ON public.email_tracking TO anon;
GRANT INSERT ON public.appointment_responses TO anon;

-- Verify table creation
SELECT 'email_tracking created' as status;
SELECT 'appointment_responses created' as status;
