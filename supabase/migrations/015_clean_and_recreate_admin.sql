-- 清理并重新创建管理员用户
-- 解决所有外键约束和数据不一致问题

DO $$
DECLARE
    existing_admin_id uuid;
BEGIN
    -- 1. 检查是否存在admin用户
    SELECT id INTO existing_admin_id 
    FROM auth.users 
    WHERE email = 'admin@casmara.com' 
    LIMIT 1;
    
    IF existing_admin_id IS NOT NULL THEN
        -- 如果用户存在，更新密码和确认状态
        UPDATE auth.users 
        SET 
            encrypted_password = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- bcrypt hash of 'admin123'
            email_confirmed_at = now(),
            updated_at = now(),
            role = 'authenticated',
            aud = 'authenticated',
            raw_user_meta_data = '{"full_name": "Administrador del Sistema"}',
            is_sso_user = false,
            is_anonymous = false
        WHERE id = existing_admin_id;
        
        -- 更新或创建对应的profile
        INSERT INTO public.profiles (
            id,
            name,
            email,
            full_name,
            role,
            created_at,
            updated_at
        ) VALUES (
            existing_admin_id,
            'Administrador',
            'admin@casmara.com',
            'Administrador del Sistema',
            'administrador',
            now(),
            now()
        )
        ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            updated_at = EXCLUDED.updated_at;
            
        RAISE NOTICE 'Admin user updated successfully with ID: %', existing_admin_id;
    ELSE
        -- 如果用户不存在，创建新用户
        existing_admin_id := gen_random_uuid();
        
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
            raw_user_meta_data,
            is_sso_user,
            is_anonymous
        ) VALUES (
            existing_admin_id,
            '00000000-0000-0000-0000-000000000000',
            'admin@casmara.com',
            '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- bcrypt hash of 'admin123'
            now(),
            now(),
            now(),
            'authenticated',
            'authenticated',
            '{"full_name": "Administrador del Sistema"}',
            false,
            false
        );
        
        INSERT INTO public.profiles (
            id,
            name,
            email,
            full_name,
            role,
            created_at,
            updated_at
        ) VALUES (
            existing_admin_id,
            'Administrador',
            'admin@casmara.com',
            'Administrador del Sistema',
            'administrador',
            now(),
            now()
        );
        
        RAISE NOTICE 'Admin user created successfully with ID: %', existing_admin_id;
    END IF;
    
    -- 确保所有customers都有valid的created_by
    UPDATE customers SET created_by = existing_admin_id WHERE created_by IS NULL;
END $$;

-- 验证创建结果
SELECT 
    'Verification' as status,
    u.id,
    u.email,
    u.email_confirmed_at IS NOT NULL as email_confirmed,
    u.encrypted_password IS NOT NULL as has_password,
    p.name,
    p.role
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email = 'admin@casmara.com';