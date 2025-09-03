-- Create routes table for persistent route storage
CREATE TABLE IF NOT EXISTS public.routes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    route_date DATE,
    route_time TIME,
    customers JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_distance DECIMAL(10,2) DEFAULT 0,
    total_duration INTEGER DEFAULT 0, -- in minutes
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    completed_visits JSONB DEFAULT '[]'::jsonb
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

-- Create policy to allow users to manage their own routes
CREATE POLICY "Users can manage their own routes" ON public.routes
    FOR ALL USING (auth.uid() = created_by);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_routes_updated_at BEFORE UPDATE ON public.routes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create index for performance
CREATE INDEX IF NOT EXISTS routes_created_by_idx ON public.routes(created_by);
CREATE INDEX IF NOT EXISTS routes_route_date_idx ON public.routes(route_date);
CREATE INDEX IF NOT EXISTS routes_completed_idx ON public.routes(completed);
