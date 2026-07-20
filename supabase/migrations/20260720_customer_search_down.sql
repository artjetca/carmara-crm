DROP FUNCTION IF EXISTS public.search_customers(TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER);
DROP INDEX IF EXISTS public.customers_search_name_trgm_idx;
DROP INDEX IF EXISTS public.customers_search_city_province_idx;
DROP INDEX IF EXISTS public.customers_search_phone_idx;
DROP FUNCTION IF EXISTS public.casmara_search_normalize(TEXT);
