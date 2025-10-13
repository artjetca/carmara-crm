-- 添加新的 numero 欄位
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS numero TEXT;

-- 刷新 PostgREST schema cache
NOTIFY pgrst, 'reload schema';
