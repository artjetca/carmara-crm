-- 修复管理员用户登录凭据

-- 更新现有管理员用户的密码和确认状态
UPDATE auth.users 
SET 
  encrypted_password = crypt('admin123', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  role = 'authenticated',
  aud = 'authenticated',
  updated_at = now()
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
  aud
)
SELECT 
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'admin@casmara.com',
  crypt('admin123', gen_salt('bf')),
  now(),
  now(),
  now(),
  'authenticated',
  'authenticated'
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
  );

-- 更新现有profile（如果存在）
UPDATE public.profiles 
SET 
  name = 'Administrador',
  email = 'admin@casmara.com',
  full_name = 'Administrador del Sistema',
  role = 'administrador',
  updated_at = now()
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'admin@casmara.com'
);

-- 验证创建结果
SELECT 
  u.id,
  u.email,
  u.email_confirmed_at,
  u.confirmed_at,
  p.name,
  p.role
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email = 'admin@casmara.com';