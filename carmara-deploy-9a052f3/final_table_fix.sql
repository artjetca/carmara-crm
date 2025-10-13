-- Final Table Fix - Disable RLS and Force Simple Access
-- This is a last resort to fix PostgREST schema cache issues

-- Drop everything completely
DROP TABLE IF EXISTS public.email_tracking CASCADE;
DROP TABLE IF EXISTS public.appointment_responses CASCADE;

-- Create tables WITHOUT RLS initially
CREATE TABLE public.email_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.appointment_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    response_token TEXT UNIQUE NOT NULL,
    response_type TEXT CHECK (response_type IN ('accepted', 'declined')),
    responded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Grant permissions to all roles WITHOUT RLS
GRANT ALL PRIVILEGES ON public.email_tracking TO anon;
GRANT ALL PRIVILEGES ON public.email_tracking TO authenticated;
GRANT ALL PRIVILEGES ON public.email_tracking TO service_role;
GRANT ALL PRIVILEGES ON public.email_tracking TO postgres;

GRANT ALL PRIVILEGES ON public.appointment_responses TO anon;
GRANT ALL PRIVILEGES ON public.appointment_responses TO authenticated;
GRANT ALL PRIVILEGES ON public.appointment_responses TO service_role;
GRANT ALL PRIVILEGES ON public.appointment_responses TO postgres;

-- Insert test data
INSERT INTO public.email_tracking (message_id, customer_id, ip_address, user_agent) 
VALUES (gen_random_uuid(), gen_random_uuid(), '192.168.1.1', 'Test User Agent');

INSERT INTO public.appointment_responses (message_id, customer_id, response_token, response_type) 
VALUES (gen_random_uuid(), gen_random_uuid(), 'test-token-456', 'accepted');

-- Force PostgREST reload multiple times
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
SELECT pg_notify('pgrst', 'reload schema');

-- Verify tables exist and have data
SELECT 'email_tracking created' as status, count(*) as records FROM public.email_tracking;
SELECT 'appointment_responses created' as status, count(*) as records FROM public.appointment_responses;

-- Show table structure
\d public.email_tracking;
\d public.appointment_responses;
