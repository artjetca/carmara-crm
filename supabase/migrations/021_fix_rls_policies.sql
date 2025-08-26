-- 修复RLS策略的无限递归问题

-- 删除所有现有的RLS策略
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- 暂时禁用RLS以避免递归问题
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- 创建简单的RLS策略，避免递归
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 允许认证用户查看自己的profile
CREATE POLICY "authenticated_users_select_own" ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

-- 允许认证用户更新自己的profile
CREATE POLICY "authenticated_users_update_own" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id);

-- 允许anon用户查看profiles（用于登录验证）
CREATE POLICY "anon_users_select" ON public.profiles
    FOR SELECT TO anon
    USING (true);