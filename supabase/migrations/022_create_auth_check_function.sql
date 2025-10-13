-- 创建函数来检查auth.users表
CREATE OR REPLACE FUNCTION public.check_auth_user(user_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result json;
BEGIN
    SELECT json_build_object(
        'id', id,
        'email', email,
        'encrypted_password', encrypted_password,
        'email_confirmed_at', email_confirmed_at,
        'created_at', created_at,
        'updated_at', updated_at,
        'last_sign_in_at', last_sign_in_at
    )
    INTO result
    FROM auth.users
    WHERE email = user_email;
    
    RETURN result;
END;
$$;

-- 授予执行权限
GRANT EXECUTE ON FUNCTION public.check_auth_user(text) TO authenticated, anon;