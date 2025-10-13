-- 简单的管理员用户创建
-- 使用最基本的方法

-- 首先确保有一个简单的管理员用户
INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    role,
    aud
) 
SELECT 
    '11111111-1111-1111-1111-111111111111'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid,
    'admin@casmara.com',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- bcrypt hash of 'admin123'
    now(),
    now(),
    now(),
    'authenticated',
    'authenticated'
WHERE NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'admin@casmara.com'
);

-- 创建对应的profile
INSERT INTO public.profiles (
    id,
    name,
    email,
    full_name,
    role,
    created_at,
    updated_at
) 
SELECT 
    '11111111-1111-1111-1111-111111111111'::uuid,
    'Administrador',
    'admin@casmara.com',
    'Administrador del Sistema',
    'administrador',
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = '11111111-1111-1111-1111-111111111111'::uuid
);

-- 验证结果
SELECT 'Usuario creado correctamente' as status, email, role 
FROM auth.users 
WHERE email = 'admin@casmara.com';