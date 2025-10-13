-- 修复管理员用户密码问题

-- 直接更新现有用户的密码，使用正确的哈希方式
UPDATE auth.users 
SET 
  encrypted_password = '$2a$10$' || encode(digest('admin123' || id::text, 'sha256'), 'hex'),
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  role = 'authenticated',
  aud = 'authenticated',
  updated_at = now()
WHERE email = 'admin@casmara.com';

-- 如果用户不存在，创建新用户
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@casmara.com') THEN
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
      '$2a$10$' || encode(digest('admin123' || gen_random_uuid()::text, 'sha256'), 'hex'),
      now(),
      now(),
      now(),
      'authenticated',
      'authenticated',
      '{"full_name": "Administrador del Sistema"}'
    );
  END IF;
END $$;

-- 创建或更新对应的profile记录
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

-- 验证创建结果
SELECT 
  u.id,
  u.email,
  u.email_confirmed_at,
  u.role,
  p.name,
  p.role as profile_role
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email = 'admin@casmara.com';