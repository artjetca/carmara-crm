-- 创建默认管理员用户
-- 这个脚本会在auth.users表中创建admin@casmara.com用户

-- 首先检查用户是否已存在，如果不存在则创建
DO $$
DECLARE
    admin_user_id UUID;
BEGIN
    -- 检查admin用户是否已存在
    SELECT id INTO admin_user_id 
    FROM auth.users 
    WHERE email = 'admin@casmara.com';
    
    -- 如果用户不存在，创建新用户
    IF admin_user_id IS NULL THEN
        -- 生成新的UUID
        admin_user_id := gen_random_uuid();
        
        -- 在auth.users表中插入管理员用户
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
            admin_user_id,
            'authenticated',
            'authenticated',
            'admin@casmara.com',
            crypt('admin123', gen_salt('bf')),
            NOW(),
            NOW(),
            NOW(),
            '{"provider": "email", "providers": ["email"]}',
            '{"full_name": "Administrador Casmara"}',
            NOW(),
            NOW(),
            '',
            '',
            '',
            ''
        );
        
        RAISE NOTICE 'Admin user created with ID: %', admin_user_id;
    ELSE
        RAISE NOTICE 'Admin user already exists with ID: %', admin_user_id;
    END IF;
    
    -- 确保在profiles表中有对应的记录
    INSERT INTO public.profiles (id, name, email, full_name, role)
    VALUES (
        admin_user_id,
        'Administrador Casmara',
        'admin@casmara.com',
        'Administrador Casmara',
        'administrador'
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role;
        
    RAISE NOTICE 'Admin profile created/updated for user ID: %', admin_user_id;
END $$;

-- 验证创建结果
SELECT 
    u.id,
    u.email,
    u.created_at as user_created_at,
    p.name,
    p.full_name,
    p.role,
    p.created_at as profile_created_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email = 'admin@casmara.com';