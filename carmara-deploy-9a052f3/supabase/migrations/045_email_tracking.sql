-- Crear tabla para rastrear aperturas de emails
CREATE TABLE IF NOT EXISTS email_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES scheduled_messages(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    tracking_token VARCHAR(32) UNIQUE NOT NULL,
    opened_at TIMESTAMPTZ,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_email_tracking_message_id ON email_tracking(message_id);
CREATE INDEX IF NOT EXISTS idx_email_tracking_customer_id ON email_tracking(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_tracking_token ON email_tracking(tracking_token);
CREATE INDEX IF NOT EXISTS idx_email_tracking_opened_at ON email_tracking(opened_at);

-- RLS policies
ALTER TABLE email_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view email tracking for their messages" ON email_tracking
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM scheduled_messages sm 
            WHERE sm.id = email_tracking.message_id 
            AND sm.created_by = auth.uid()
        )
    );

CREATE POLICY "System can insert email tracking" ON email_tracking
    FOR INSERT WITH CHECK (true);

CREATE POLICY "System can update email tracking" ON email_tracking
    FOR UPDATE USING (true);
