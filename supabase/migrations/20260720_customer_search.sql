-- Server-side accent and phone insensitive customer search.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.casmara_search_normalize(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(lower(public.unaccent(coalesce(value, ''))), '[^a-z0-9]+', '', 'g');
$$;

CREATE INDEX IF NOT EXISTS customers_search_name_trgm_idx ON public.customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_search_city_province_idx ON public.customers (province, city);
CREATE INDEX IF NOT EXISTS customers_search_phone_idx ON public.customers (phone);

CREATE OR REPLACE FUNCTION public.search_customers(
  search_query TEXT,
  search_province TEXT DEFAULT NULL,
  search_city TEXT DEFAULT NULL,
  search_has_coordinates BOOLEAN DEFAULT NULL,
  result_limit INTEGER DEFAULT 30,
  result_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID, name TEXT, company TEXT, phone TEXT, whatsapp TEXT, address TEXT,
  postal_code TEXT, city TEXT, province TEXT, latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION, customer_number TEXT, notes TEXT,
  last_visit_at TIMESTAMPTZ, next_visit_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT c.id, c.name, c.company, c.phone, NULL::TEXT,
    c.address, c.postal_code, c.city, c.province, c.latitude, c.longitude,
    coalesce(c.num, c.numero, c.customer_number), c.notes,
    last_visit.completed_at, next_visit.scheduled_at
  FROM public.customers c
  LEFT JOIN LATERAL (
    SELECT v.completed_at FROM public.visits v
    WHERE v.customer_id = c.id AND v.completed_at IS NOT NULL
    ORDER BY v.completed_at DESC LIMIT 1
  ) last_visit ON TRUE
  LEFT JOIN LATERAL (
    SELECT coalesce(v.scheduled_at, v.scheduled_date) AS scheduled_at FROM public.visits v
    WHERE v.customer_id = c.id
      AND coalesce(v.scheduled_at, v.scheduled_date) >= now()
      AND v.status = 'programada'
    ORDER BY coalesce(v.scheduled_at, v.scheduled_date) ASC LIMIT 1
  ) next_visit ON TRUE
  WHERE public.casmara_search_normalize(concat_ws(' ', c.name, c.company, c.phone, c.address, c.city, c.province, c.postal_code, c.num, c.numero, c.notes))
      LIKE '%' || public.casmara_search_normalize(search_query) || '%'
    AND (search_province IS NULL OR c.province = search_province)
    AND (search_city IS NULL OR c.city = search_city)
    AND (search_has_coordinates IS NULL OR (c.latitude IS NOT NULL AND c.longitude IS NOT NULL) = search_has_coordinates)
  ORDER BY c.name
  LIMIT least(greatest(result_limit, 1), 30)
  OFFSET greatest(result_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.search_customers(TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER) TO service_role;
NOTIFY pgrst, 'reload schema';
