-- 更新管理员密码而不删除用户
-- 避免外键约束问题

-- 更新现有管理员用户的密码
UPDATE auth.users 
SET 
    encrypted_password = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- bcrypt hash of 'admin123'
    email_confirmed_at = now(),
    updated_at = now(),
    role = 'authenticated',
    aud = 'authenticated'
WHERE email = 'admin@casmara.com';

-- 如果用户不存在，则创建新用户
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
)
SELECT 
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'admin@casmara.com',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    now(),
    now(),
    now(),
    'authenticated',
    'authenticated',
    '{"full_name": "Administrador del Sistema"}'
WHERE NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'admin@casmara.com'
);

-- 更新或创建对应的profile
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
WHERE u.email = 'admin@casmara.com'
AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    updated_at = EXCLUDED.updated_at;

-- 验证结果
SELECT 
    'Usuario actualizado exitosamente' as status,
    u.id,
    u.email,
    u.email_confirmed_at IS NOT NULL as email_confirmed,
    u.encrypted_password IS NOT NULL as has_password,
    p.name,
    p.role
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email = 'admin@casmara.com';