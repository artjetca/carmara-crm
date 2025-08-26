-- 简单修复管理员用户密码

-- 使用标准的bcrypt哈希更新密码
-- bcrypt哈希 'admin123' 的结果
UPDATE auth.users 
SET 
  encrypted_password = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
  email_confirmed_at = COALESCE(email_confirmed_at, now()),
  role = 'authenticated',
  aud = 'authenticated',
  updated_at = now()
WHERE email = 'admin@casmara.com';

-- 验证更新结果
SELECT 
  id,
  email,
  email_confirmed_at IS NOT NULL as email_confirmed,
  encrypted_password IS NOT NULL as has_password,
  role,
  aud
FROM auth.users 
WHERE email = 'admin@casmara.com';