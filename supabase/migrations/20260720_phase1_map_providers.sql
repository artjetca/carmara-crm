-- Phase 1 map providers: durable, server-side geocoding state.
-- This migration is additive. Existing customers and visits are untouched.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS normalized_address TEXT,
  ADD COLUMN IF NOT EXISTS geocoding_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS geocoding_provider TEXT,
  ADD COLUMN IF NOT EXISTS geocoding_confidence DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geocoding_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS geocoding_error TEXT;

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_geocoding_status_check;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_geocoding_status_check
  CHECK (geocoding_status IN ('pending', 'processing', 'success', 'low_confidence', 'failed', 'manual_review', 'manual'));

CREATE INDEX IF NOT EXISTS customers_geocoding_status_idx
  ON public.customers (geocoding_status);

CREATE TABLE IF NOT EXISTS public.map_service_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS map_service_usage_created_at_idx
  ON public.map_service_usage (created_at DESC);

CREATE OR REPLACE FUNCTION public.reset_customer_geocoding_on_address_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(NEW.address, NEW.city, NEW.province, NEW.postal_code, NEW.country)
     IS DISTINCT FROM ROW(OLD.address, OLD.city, OLD.province, OLD.postal_code, OLD.country) THEN
    NEW.latitude := NULL;
    NEW.longitude := NULL;
    NEW.coordinates := NULL;
    NEW.normalized_address := NULL;
    NEW.geocoding_status := 'pending';
    NEW.geocoding_provider := NULL;
    NEW.geocoding_confidence := NULL;
    NEW.geocoding_attempts := 0;
    NEW.geocoded_at := NULL;
    NEW.geocoding_error := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_reset_geocoding_on_address_change ON public.customers;
CREATE TRIGGER customers_reset_geocoding_on_address_change
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.reset_customer_geocoding_on_address_change();

NOTIFY pgrst, 'reload schema';
