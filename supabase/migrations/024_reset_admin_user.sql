-- 完全重置管理员用户

-- 使用Supabase推荐的方式创建用户
DO $$
DECLARE
    new_user_id uuid;
    old_user_id uuid;
BEGIN
    -- 获取旧用户ID
    SELECT id INTO old_user_id FROM public.profiles WHERE email = 'admin@casmara.com' LIMIT 1;
    
    -- 生成新的UUID
    new_user_id := gen_random_uuid();
    
    -- 先创建新用户，使用临时邮箱避免冲突
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        recovery_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_user_id,
        'authenticated',
        'authenticated',
        'temp_admin_' || new_user_id || '@casmara.com',
        crypt('admin123', gen_salt('bf')),
        NOW(),
        NULL,
        NULL,
        '{"provider": "email", "providers": ["email"]}',
        '{}',
        NOW(),
        NOW(),
        '',
        '',
        '',
        ''
    );
    
    -- 插入到profiles表
    INSERT INTO public.profiles (
        id,
        name,
        email,
        role,
        full_name,
        created_at,
        updated_at
    ) VALUES (
        new_user_id,
        'Administrador Casmara',
        'temp_admin_' || new_user_id || '@casmara.com',
        'administrador',
        'Administrador Casmara',
        NOW(),
        NOW()
    );
    
    -- 如果存在旧用户，更新customers表引用，然后删除旧用户
    IF old_user_id IS NOT NULL THEN
        UPDATE public.customers 
        SET created_by = new_user_id 
        WHERE created_by = old_user_id;
        
        DELETE FROM public.profiles WHERE id = old_user_id;
        DELETE FROM auth.users WHERE id = old_user_id;
    END IF;
    
    -- 最后更新新用户的邮箱为正确的邮箱
    UPDATE auth.users 
    SET email = 'admin@casmara.com'
    WHERE id = new_user_id;
    
    UPDATE public.profiles 
    SET email = 'admin@casmara.com'
    WHERE id = new_user_id;
    
END $$;