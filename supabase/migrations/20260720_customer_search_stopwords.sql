-- Make city search tolerate common Spanish connector words so
-- "jerez frontera" matches "Jerez de la Frontera".
CREATE OR REPLACE FUNCTION public.casmara_search_normalize(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(
    regexp_replace(lower(public.unaccent(coalesce(value, ''))), '\m(de|del|la|las|el|los)\M', '', 'g'),
    '[^a-z0-9]+', '', 'g'
  );
$$;

NOTIFY pgrst, 'reload schema';
