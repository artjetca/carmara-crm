-- 添加 province 欄位到 customers 表
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS province TEXT;

-- 刷新 PostgREST schema cache
NOTIFY pgrst, 'reload schema';
