-- 移除其他用戶角色，只保留administrador

-- 更新所有現有用戶為administrador角色
UPDATE public.profiles 
SET role = 'administrador'
WHERE role IN ('vendedor', 'supervisor');

-- 由於我們使用的是profiles表而不是user_profiles表，我們需要確保profiles表有role列
-- 如果profiles表沒有role列，我們需要添加它
DO $$ 
BEGIN
    -- 檢查role列是否存在，如果不存在則添加
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'role' AND table_schema = 'public') THEN
        ALTER TABLE public.profiles ADD COLUMN role TEXT DEFAULT 'administrador';
    END IF;
END $$;

-- 添加約束，只允許administrador角色
DO $$ 
BEGIN
    -- 刪除舊的約束（如果存在）
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    
    -- 添加新的約束，只允許administrador
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
        CHECK (role = 'administrador');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 確保所有現有記錄都符合新約束
UPDATE public.profiles SET role = 'administrador' WHERE role IS NULL OR role != 'administrador';

-- 更新預設值
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'administrador';

-- 更新is_admin函數，簡化邏輯（因為現在所有用戶都是管理員）
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    -- 由於現在只有administrador角色，所有認證用戶都是管理員
    RETURN user_id IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 更新handle_new_user函數，確保新用戶默認為administrador
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email, role)
    VALUES (
        NEW.id, 
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Administrador'), 
        NEW.email,
        'administrador'
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        role = 'administrador';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;