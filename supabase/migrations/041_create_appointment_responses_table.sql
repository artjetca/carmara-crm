-- Create appointment responses table to track customer confirmations
CREATE TABLE IF NOT EXISTS appointment_responses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    message_id UUID REFERENCES scheduled_messages(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    response_token VARCHAR(255) UNIQUE NOT NULL,
    response_type VARCHAR(50) CHECK (response_type IN ('confirm', 'reschedule')) NOT NULL,
    responded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    customer_ip VARCHAR(45),
    customer_user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_appointment_responses_message_id ON appointment_responses(message_id);
CREATE INDEX idx_appointment_responses_customer_id ON appointment_responses(customer_id);
CREATE INDEX idx_appointment_responses_token ON appointment_responses(response_token);
CREATE INDEX idx_appointment_responses_type ON appointment_responses(response_type);

-- Enable RLS
ALTER TABLE appointment_responses ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view appointment responses for their customers" ON appointment_responses
    FOR ALL USING (
        customer_id IN (
            SELECT id FROM customers 
            WHERE created_by = auth.uid()
        )
    );

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_appointment_responses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_appointment_responses_updated_at
    BEFORE UPDATE ON appointment_responses
    FOR EACH ROW
    EXECUTE FUNCTION update_appointment_responses_updated_at();
