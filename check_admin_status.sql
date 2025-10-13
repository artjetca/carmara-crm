-- 检查管理员用户状态
SELECT 
    'auth.users' as table_name,
    u.id,
    u.email,
    u.encrypted_password IS NOT NULL as has_password,
    u.email_confirmed_at IS NOT NULL as email_confirmed,
    u.role,
    u.aud,
    u.created_at,
    u.updated_at
FROM auth.users u
WHERE u.email = 'admin@casmara.com'

UNION ALL

SELECT 
    'public.profiles' as table_name,
    p.id::text,
    p.email,
    'N/A' as has_password,
    'N/A' as email_confirmed,
    p.role,
    'N/A' as aud,
    p.created_at::text,
    p.updated_at::text
FROM public.profiles p
WHERE p.email = 'admin@casmara.com';

-- 检查是否有孤立的记录
SELECT 
    'Orphaned profiles' as issue_type,
    p.id,
    p.email
FROM public.profiles p
LEFT JOIN auth.users u ON p.id = u.id
WHERE u.id IS NULL;

-- 检查是否有没有profile的用户
SELECT 
    'Users without profiles' as issue_type,
    u.id,
    u.email
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL AND u.email = 'admin@casmara.com';