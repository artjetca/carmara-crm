-- 最终的管理员用户修复
-- 使用正确的方法创建管理员用户

-- 首先删除现有的管理员用户（如果存在）
DELETE FROM public.profiles WHERE email = 'admin@casmara.com';
DELETE FROM auth.users WHERE email = 'admin@casmara.com';

-- 创建新的管理员用户在auth.users表中
INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    role,
    aud,
    raw_user_meta_data
) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'admin@casmara.com',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- bcrypt hash of 'admin123'
    now(),
    now(),
    now(),
    'authenticated',
    'authenticated',
    '{"full_name": "Administrador del Sistema"}'
);

-- 获取刚创建的用户ID并创建对应的profile
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
    u.id,
    'Administrador',
    'admin@casmara.com',
    'Administrador del Sistema',
    'administrador',
    now(),
    now()
FROM auth.users u
WHERE u.email = 'admin@casmara.com';

-- 验证创建结果
SELECT 
    'Usuario creado exitosamente' as status,
    u.id,
    u.email,
    u.email_confirmed_at IS NOT NULL as email_confirmed,
    u.encrypted_password IS NOT NULL as has_password,
    p.name,
    p.role
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email = 'admin@casmara.com';