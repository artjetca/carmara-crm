-- Create a function to insert customers with all fields including num and postal_code
CREATE OR REPLACE FUNCTION insert_customer_complete(
  p_name TEXT,
  p_company TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_postal_code TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_contrato TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL,
  p_num TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  new_id UUID;
BEGIN
  new_id := gen_random_uuid();
  
  INSERT INTO public.customers (
    id,
    name,
    company,
    phone,
    email,
    address,
    postal_code,
    city,
    contrato,
    notes,
    created_by,
    num,
    created_at,
    updated_at
  ) VALUES (
    new_id,
    p_name,
    p_company,
    p_phone,
    p_email,
    p_address,
    p_postal_code,
    p_city,
    p_contrato,
    p_notes,
    p_created_by,
    p_num,
    NOW(),
    NOW()
  );
  
  RETURN new_id;
END;
$$;
