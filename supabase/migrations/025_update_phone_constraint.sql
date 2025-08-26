-- 更新customers表的phone字段约束
-- 允许以6、7、8或9开头的9位数字，或者为NULL

-- 首先删除现有的约束（如果存在）
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_phone_check;

-- 添加新的约束，允许西班牙手机号码格式
-- 西班牙手机号码通常以6、7、8或9开头，总共9位数字
ALTER TABLE public.customers ADD CONSTRAINT customers_phone_check 
  CHECK (phone ~ '^[6789][0-9]{8}$' OR phone IS NULL);

-- 同样更新mobile_phone字段的约束（如果存在）
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_mobile_phone_check;
ALTER TABLE public.customers ADD CONSTRAINT customers_mobile_phone_check 
  CHECK (mobile_phone ~ '^[6789][0-9]{8}$' OR mobile_phone IS NULL);