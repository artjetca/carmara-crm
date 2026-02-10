-- 检查管理员用户是否存在
SELECT 
  id,
  email,
  email_confirmed_at,
  created_at,
  updated_at
FROM auth.users 
WHERE email = 'admin@casmara.com';

-- 如果用户不存在，创建管理员用户
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  aud,
  role
)
SELECT 
  gen_random_uuid(),
  'admin@casmara.com',
  crypt('admin123', gen_salt('bf')),
  now(),
  now(),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{"name": "Administrator"}',
  'authenticated',
  'authenticated'
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'admin@casmara.com'
);

-- 确保profiles表中有对应的记录
INSERT INTO public.profiles (id, name, email, created_at, updated_at)
SELECT 
  u.id,
  'Administrator',
  'admin@casmara.com',
  now(),
  now()
FROM auth.users u
WHERE u.email = 'admin@casmara.com'
AND NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE id = u.id
);

-- 更新现有的profiles记录
UPDATE public.profiles 
SET 
  name = 'Administrator',
  email = 'admin@casmara.com',
  updated_at = now()
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'admin@casmara.com'
);