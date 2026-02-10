-- 创建新的管理员用户，使用唯一邮箱避免冲突

DO $$
DECLARE
    admin_id UUID := gen_random_uuid();
    old_admin_id UUID;
BEGIN
    -- 获取旧管理员ID
    SELECT id INTO old_admin_id FROM public.profiles WHERE email = 'admin@casmara.com' LIMIT 1;
    
    -- 临时禁用外键约束检查
    SET session_replication_role = replica;
    
    -- 删除旧的管理员记录
    DELETE FROM public.profiles WHERE email = 'admin@casmara.com';
    DELETE FROM auth.users WHERE email = 'admin@casmara.com';
    
    -- 重新启用外键约束检查
    SET session_replication_role = DEFAULT;
    
    -- 创建新的管理员用户
    INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at,
        aud,
        role
    ) VALUES (
        admin_id,
        '00000000-0000-0000-0000-000000000000',
        'admin@casmara.com',
        crypt('admin123', gen_salt('bf')),
        NOW(),
        NOW(),
        NOW(),
        'authenticated',
        'authenticated'
    );
    
    -- 插入到profiles表
    INSERT INTO public.profiles (
        id,
        name,
        full_name,
        email,
        role,
        created_at,
        updated_at
    ) VALUES (
        admin_id,
        'Administrador Casmara',
        'Administrador Casmara',
        'admin@casmara.com',
        'administrador',
        NOW(),
        NOW()
    );
    
    -- 更新customers表中的引用到新管理员
    IF old_admin_id IS NOT NULL THEN
        UPDATE public.customers 
        SET created_by = admin_id 
        WHERE created_by = old_admin_id;
    END IF;
    
    RAISE NOTICE '管理员用户创建成功，ID: %', admin_id;
END $$;