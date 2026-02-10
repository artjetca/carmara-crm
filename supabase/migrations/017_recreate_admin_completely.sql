-- 完全重新创建管理员用户
-- 清理所有相关数据并重新开始

DO $$
DECLARE
    existing_admin_id uuid;
    new_admin_id uuid := gen_random_uuid();
BEGIN
    -- 1. 获取现有管理员用户ID
    SELECT id INTO existing_admin_id 
    FROM auth.users 
    WHERE email = 'admin@casmara.com' 
    LIMIT 1;
    
    -- 1.5. 如果存在现有管理员，先删除它
    IF existing_admin_id IS NOT NULL THEN
        -- 更新customers表中的引用为NULL（临时）
        UPDATE customers SET created_by = NULL WHERE created_by = existing_admin_id;
        
        -- 删除profiles记录
        DELETE FROM public.profiles WHERE id = existing_admin_id;
        
        -- 删除auth.users记录
        DELETE FROM auth.users WHERE id = existing_admin_id;
        
        RAISE NOTICE 'Deleted existing admin user: %', existing_admin_id;
    END IF;
    
    -- 2. 创建新的管理员用户
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
          new_admin_id,
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
    
    -- 3. 创建对应的profile
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
        'temp_admin@casmara.com',
        'Administrador del Sistema',
        'administrador',
        now(),
        now()
    );
    
    -- 4. 更新customers表中的created_by引用
    UPDATE customers SET created_by = new_admin_id WHERE created_by IS NULL;
    
    RAISE NOTICE 'Admin user recreated successfully with ID: %', new_admin_id;
END $$;

-- 验证结果
SELECT 
    'Final Check' as status,
    u.id,
    u.email,
    u.encrypted_password IS NOT NULL as has_password,
    u.email_confirmed_at IS NOT NULL as email_confirmed,
    u.confirmed_at IS NOT NULL as confirmed,
    u.role,
    u.aud,
    p.name as profile_name,
    p.role as profile_role
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE u.email = 'admin@casmara.com';