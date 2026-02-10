-- 验证管理员用户是否正确创建
SELECT 
    'auth.users' as table_name,
    id::text,
    email,
    encrypted_password IS NOT NULL as has_password,
    email_confirmed_at IS NOT NULL as email_confirmed,
    role,
    aud,
    is_sso_user,
    is_anonymous,
    created_at::text,
    updated_at::text
FROM auth.users 
WHERE email = 'admin@casmara.com'

UNION ALL

SELECT 
    'public.profiles' as table_name,
    id::text,
    email,
    NULL::boolean as has_password,
    NULL::boolean as email_confirmed,
    role,
    NULL::text as aud,
    NULL::boolean as is_sso_user,
    NULL::boolean as is_anonymous,
    created_at::text,
    updated_at::text
FROM public.profiles 
WHERE email = 'admin@casmara.com';