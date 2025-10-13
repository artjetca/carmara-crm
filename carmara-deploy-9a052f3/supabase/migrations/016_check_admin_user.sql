-- 检查管理员用户状态
SELECT 
    'auth.users' as table_name,
    u.id::text,
    u.email,
    (u.encrypted_password IS NOT NULL)::text as has_password,
    (u.email_confirmed_at IS NOT NULL)::text as email_confirmed,
    u.role,
    u.aud,
    u.is_sso_user::text,
    u.is_anonymous::text,
    (u.deleted_at IS NULL)::text as is_active,
    u.created_at::text,
    u.updated_at::text
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
    'N/A' as is_sso_user,
    'N/A' as is_anonymous,
    'N/A' as is_active,
    p.created_at::text,
    p.updated_at::text
FROM public.profiles p
WHERE p.email = 'admin@casmara.com';