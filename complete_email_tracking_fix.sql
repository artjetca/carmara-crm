-- Complete Email Tracking Fix - Ensure API Access
-- This script ensures tables are created AND accessible via REST API

-- First, drop existing tables and policies to start fresh
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

-- Create indexes for performance
CREATE INDEX idx_email_tracking_message_id ON public.email_tracking(message_id);
CREATE INDEX idx_email_tracking_customer_id ON public.email_tracking(customer_id);
CREATE INDEX idx_appointment_responses_message_id ON public.appointment_responses(message_id);
CREATE INDEX idx_appointment_responses_customer_id ON public.appointment_responses(customer_id);
CREATE INDEX idx_appointment_responses_token ON public.appointment_responses(response_token);

-- Enable RLS
ALTER TABLE public.email_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_responses ENABLE ROW LEVEL SECURITY;

-- Create comprehensive RLS policies
CREATE POLICY "Enable read access for all users" ON public.email_tracking FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.email_tracking FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.email_tracking FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.email_tracking FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON public.appointment_responses FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.appointment_responses FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.appointment_responses FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.appointment_responses FOR DELETE USING (true);

-- Grant extensive permissions to ensure API access
GRANT ALL PRIVILEGES ON public.email_tracking TO anon;
GRANT ALL PRIVILEGES ON public.email_tracking TO authenticated;
GRANT ALL PRIVILEGES ON public.email_tracking TO service_role;

GRANT ALL PRIVILEGES ON public.appointment_responses TO anon;
GRANT ALL PRIVILEGES ON public.appointment_responses TO authenticated;
GRANT ALL PRIVILEGES ON public.appointment_responses TO service_role;

-- Grant usage on sequences if they exist
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Force PostgREST to reload the schema
NOTIFY pgrst, 'reload schema';

-- Insert test data to verify tables work
INSERT INTO public.email_tracking (message_id, customer_id, ip_address, user_agent) 
VALUES (gen_random_uuid(), gen_random_uuid(), '192.168.1.1', 'Test User Agent');

INSERT INTO public.appointment_responses (message_id, customer_id, response_token, response_type) 
VALUES (gen_random_uuid(), gen_random_uuid(), 'test-token-123', 'accepted');

-- Verify table structure and data
SELECT 'email_tracking table created' as status, count(*) as records FROM public.email_tracking;
SELECT 'appointment_responses table created' as status, count(*) as records FROM public.appointment_responses;

-- Check if tables are visible in information_schema
SELECT table_name, table_schema, table_type 
FROM information_schema.tables 
WHERE table_name IN ('email_tracking', 'appointment_responses') 
AND table_schema = 'public';

-- Check table permissions
SELECT grantee, table_name, privilege_type 
FROM information_schema.table_privileges 
WHERE table_name IN ('email_tracking', 'appointment_responses')
AND table_schema = 'public'
ORDER BY table_name, grantee;
