-- 添加company字段到customers表
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS company TEXT;

-- 更新现有记录的company字段为空字符串（如果需要）
UPDATE public.customers SET company = '' WHERE company IS NULL;