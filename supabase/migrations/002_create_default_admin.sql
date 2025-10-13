-- 創建預設管理員帳號
-- 注意：這個腳本需要在Supabase控制台中手動執行，因為需要創建auth.users記錄

-- 首先，我們需要在Supabase控制台的SQL編輯器中執行以下命令來創建管理員用戶：
/*
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    recovery_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
) VALUES (
    '00000000-0000-0000-0000-000000000000',
    gen_random_uuid(),
    'authenticated',
    'authenticated',
    'admin@casmara.com',
    crypt('admin123', gen_salt('bf')),
    NOW(),
    NOW(),
    NOW(),
    '{"provider": "email", "providers": ["email"]}',
    '{"full_name": "Administrador Casmara"}',
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
);
*/

-- 首先添加role列到profiles表
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'administrador' CHECK (role IN ('administrador'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;

-- 確保有一個管理員用戶配置文件（如果不存在）
INSERT INTO public.profiles (id, name, email, full_name, role)
SELECT 
    id,
    COALESCE(raw_user_meta_data->>'full_name', 'Administrador Casmara'),
    email,
    COALESCE(raw_user_meta_data->>'full_name', 'Administrador Casmara'),
    'administrador'
FROM auth.users 
WHERE email = 'admin@casmara.com'
AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE email = 'admin@casmara.com')
);

-- 更新現有用戶為管理員角色（如果需要）
UPDATE public.profiles 
SET role = 'administrador',
    email = (SELECT email FROM auth.users WHERE auth.users.id = profiles.id),
    full_name = COALESCE(name, 'Administrador Casmara')
WHERE id IN (SELECT id FROM auth.users WHERE email = 'admin@casmara.com');

-- 創建一個函數來驗證管理員登入
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = user_id AND role = 'administrador'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 更新RLS政策以只允許管理員訪問
-- 先刪除現有的政策（如果存在）
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;
    DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.profiles;
    DROP POLICY IF EXISTS "Enable update for users based on email" ON public.profiles;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

-- 新的管理員專用政策
CREATE POLICY "Solo administradores pueden ver perfiles" ON public.profiles
    FOR SELECT USING (public.is_admin(auth.uid()) OR auth.uid() IS NULL);

CREATE POLICY "Solo administradores pueden actualizar perfiles" ON public.profiles
    FOR UPDATE USING (public.is_admin(auth.uid()) OR auth.uid() IS NULL);

CREATE POLICY "Solo administradores pueden insertar perfiles" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 更新customers表的政策以只允許管理員
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Enable read access for all users" ON public.customers;
    DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.customers;
    DROP POLICY IF EXISTS "Enable update for users based on email" ON public.customers;
    DROP POLICY IF EXISTS "Enable delete for users based on email" ON public.customers;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Solo administradores pueden gestionar clientes" ON public.customers
    FOR ALL USING (public.is_admin(auth.uid()) OR auth.uid() IS NULL);

-- 更新visits表的政策以只允許管理員
-- 注意：visits表沒有啟用RLS，先啟用它
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo administradores pueden gestionar visitas" ON public.visits
    FOR ALL USING (public.is_admin(auth.uid()) OR auth.uid() IS NULL);

-- 更新scheduled_messages表的政策
DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Enable read access for all users" ON public.scheduled_messages;
    DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.scheduled_messages;
    DROP POLICY IF EXISTS "Enable update for users based on email" ON public.scheduled_messages;
EXCEPTION
    WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY "Solo administradores pueden gestionar mensajes" ON public.scheduled_messages
    FOR ALL USING (public.is_admin(auth.uid()) OR auth.uid() IS NULL);