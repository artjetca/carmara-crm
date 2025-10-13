-- 完全重新创建管理员用户

-- 首先更新所有引用该用户的记录，将created_by设置为NULL或新的用户ID
-- 这样可以避免外键约束问题

-- 获取当前管理员用户ID
DO $$
DECLARE
    admin_user_id UUID;
    new_admin_id UUID;
BEGIN
    -- 获取现有管理员用户ID
    SELECT id INTO admin_user_id FROM auth.users WHERE email = 'admin@casmara.com';
    
    IF admin_user_id IS NOT NULL THEN
        -- 生成新的UUID
        new_admin_id := gen_random_uuid();
        
        -- 更新customers表中的created_by引用
        UPDATE customers SET created_by = new_admin_id WHERE created_by = admin_user_id;
        
        -- 删除现有的用户和profile
        DELETE FROM public.profiles WHERE id = admin_user_id;
        DELETE FROM auth.users WHERE id = admin_user_id;
        
        -- 创建新的管理员用户
        INSERT INTO auth.users (
            id,
            instance_id,
            email,
            encrypted_password,
            email_confirmed_at,
            created_at,
            updated_at,
            role,
            aud,
            raw_user_meta_data
        ) VALUES (
            new_admin_id,
            '00000000-0000-0000-0000-000000000000',
            'admin@casmara.com',
            crypt('admin123', gen_salt('bf')),
            now(),
            now(),
            now(),
            'authenticated',
            'authenticated',
            '{"full_name": "Administrador del Sistema"}'
        );
        
        -- 创建对应的profile
        INSERT INTO public.profiles (
            id,
            name,
            email,
            full_name,
            role,
            created_at,
            updated_at
        ) VALUES (
            new_admin_id,
            'Administrador',
            'admin@casmara.com',
            'Administrador del Sistema',
            'administrador',
            now(),
            now()
        );
        
        RAISE NOTICE '管理员用户已重新创建，新ID: %', new_admin_id;
    ELSE
        RAISE NOTICE '未找到现有管理员用户';
    END IF;
END $$;

-- 验证创建结果
SELECT 
    u.id,
    u.email,
    u.email_confirmed_at IS NOT NULL as email_confirmed,
    u.encrypted_password IS NOT NULL as has_password,
    u.role,
    p.name,
    p.role as profile_role
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email = 'admin@casmara.com';