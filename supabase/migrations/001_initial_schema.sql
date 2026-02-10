-- Crear tabla de perfiles de usuario
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'vendedor' CHECK (role IN ('vendedor', 'supervisor', 'administrador')),
    phone TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla de clientes
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT DEFAULT 'Cádiz' CHECK (city IN ('Cádiz', 'Huelva')),
    postal_code TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    notes TEXT,
    created_by UUID REFERENCES public.user_profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla de visitas
CREATE TABLE IF NOT EXISTS public.visits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.user_profiles(id),
    scheduled_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'programada' CHECK (status IN ('programada', 'completada', 'cancelada', 'reprogramada')),
    notes TEXT,
    visit_type TEXT DEFAULT 'comercial' CHECK (visit_type IN ('comercial', 'seguimiento', 'entrega', 'soporte')),
    duration_minutes INTEGER DEFAULT 60,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Crear tabla de comunicaciones
CREATE TABLE IF NOT EXISTS public.communications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.user_profiles(id),
    type TEXT NOT NULL CHECK (type IN ('sms', 'email', 'llamada')),
    subject TEXT,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'enviado' CHECK (status IN ('borrador', 'enviado', 'entregado', 'fallido')),
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;

-- Políticas de seguridad para user_profiles
CREATE POLICY "Los usuarios pueden ver su propio perfil" ON public.user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Los usuarios pueden actualizar su propio perfil" ON public.user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Permitir inserción de perfil en registro" ON public.user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Políticas de seguridad para customers
CREATE POLICY "Los usuarios pueden ver todos los clientes" ON public.customers
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Los usuarios pueden crear clientes" ON public.customers
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Los usuarios pueden actualizar clientes" ON public.customers
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Los usuarios pueden eliminar clientes" ON public.customers
    FOR DELETE USING (auth.role() = 'authenticated');

-- Políticas de seguridad para visits
CREATE POLICY "Los usuarios pueden ver todas las visitas" ON public.visits
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Los usuarios pueden crear visitas" ON public.visits
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Los usuarios pueden actualizar visitas" ON public.visits
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Los usuarios pueden eliminar visitas" ON public.visits
    FOR DELETE USING (auth.role() = 'authenticated');

-- Políticas de seguridad para communications
CREATE POLICY "Los usuarios pueden ver todas las comunicaciones" ON public.communications
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Los usuarios pueden crear comunicaciones" ON public.communications
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Los usuarios pueden actualizar comunicaciones" ON public.communications
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Los usuarios pueden eliminar comunicaciones" ON public.communications
    FOR DELETE USING (auth.role() = 'authenticated');

-- Conceder permisos a los roles
GRANT ALL PRIVILEGES ON public.user_profiles TO authenticated;
GRANT ALL PRIVILEGES ON public.customers TO authenticated;
GRANT ALL PRIVILEGES ON public.visits TO authenticated;
GRANT ALL PRIVILEGES ON public.communications TO authenticated;

GRANT SELECT ON public.user_profiles TO anon;
GRANT SELECT ON public.customers TO anon;
GRANT SELECT ON public.visits TO anon;
GRANT SELECT ON public.communications TO anon;

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para actualizar updated_at
CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_visits_updated_at BEFORE UPDATE ON public.visits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para crear perfil de usuario automáticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para crear perfil automáticamente al registrarse
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();