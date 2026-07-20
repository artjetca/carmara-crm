-- Rollback for 20260720_phase1_map_providers.sql.
-- It removes only metadata introduced by Phase 1. It never deletes customers or visits.

DROP TRIGGER IF EXISTS customers_reset_geocoding_on_address_change ON public.customers;
DROP FUNCTION IF EXISTS public.reset_customer_geocoding_on_address_change();
DROP TABLE IF EXISTS public.map_service_usage;
DROP INDEX IF EXISTS public.customers_geocoding_status_idx;
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_geocoding_status_check;
ALTER TABLE public.customers
  DROP COLUMN IF EXISTS normalized_address,
  DROP COLUMN IF EXISTS geocoding_status,
  DROP COLUMN IF EXISTS geocoding_provider,
  DROP COLUMN IF EXISTS geocoding_confidence,
  DROP COLUMN IF EXISTS geocoding_attempts,
  DROP COLUMN IF EXISTS geocoded_at,
  DROP COLUMN IF EXISTS geocoding_error;

NOTIFY pgrst, 'reload schema';
