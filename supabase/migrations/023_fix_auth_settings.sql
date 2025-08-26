-- 修复认证设置问题

-- 确保用户邮箱已确认
UPDATE auth.users 
SET 
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    confirmation_token = NULL,
    confirmation_sent_at = NULL
WHERE email = 'admin@casmara.com';

-- 确保用户状态正确
UPDATE auth.users 
SET 
    aud = 'authenticated',
    role = 'authenticated'
WHERE email = 'admin@casmara.com';

-- 创建函数来测试登录
CREATE OR REPLACE FUNCTION public.test_admin_login()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_record record;
    result json;
BEGIN
    SELECT * INTO user_record
    FROM auth.users
    WHERE email = 'admin@casmara.com';
    
    IF user_record.id IS NULL THEN
        RETURN json_build_object('error', 'User not found');
    END IF;
    
    RETURN json_build_object(
        'user_exists', true,
        'email_confirmed', user_record.email_confirmed_at IS NOT NULL,
        'aud', user_record.aud,
        'role', user_record.role,
        'created_at', user_record.created_at,
        'last_sign_in_at', user_record.last_sign_in_at
    );
END;
$$;

-- 授予执行权限
GRANT EXECUTE ON FUNCTION public.test_admin_login() TO authenticated, anon;