-- 验证管理员用户登录信息
SELECT 
  id,
  email,
  encrypted_password IS NOT NULL as has_password,
  email_confirmed_at IS NOT NULL as email_confirmed,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
FROM auth.users 
WHERE email = 'admin@casmara.com';

-- 检查profiles表中的对应记录
SELECT 
  p.id,
  p.name,
  p.email,
  p.created_at,
  p.updated_at
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
WHERE u.email = 'admin@casmara.com';

-- 如果用户存在但密码有问题，重新设置密码
UPDATE auth.users 
SET 
  encrypted_password = crypt('admin123', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  updated_at = now()
WHERE email = 'admin@casmara.com';

-- 确保用户的元数据正确
UPDATE auth.users 
SET 
  raw_app_meta_data = '{"provider": "email", "providers": ["email"]}',
  raw_user_meta_data = '{"name": "Administrator"}',
  aud = 'authenticated',
  role = 'authenticated'
WHERE email = 'admin@casmara.com';

-- 最终验证
SELECT 
  'Admin user verification:' as status,
  email,
  encrypted_password IS NOT NULL as has_password,
  email_confirmed_at IS NOT NULL as email_confirmed,
  raw_app_meta_data,
  raw_user_meta_data
FROM auth.users 
WHERE email = 'admin@casmara.com';