-- 添加新的 customer_number 欄位取代 num 欄位
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_number TEXT;

-- 刷新 PostgREST schema cache
NOTIFY pgrst, 'reload schema';
