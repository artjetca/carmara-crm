-- Create RPC function to update customer fields after insert, bypassing API schema cache issues
create or replace function public.update_customer_fields(
  p_id uuid,
  p_num text default null,
  p_postal_code text default null
)
returns void
language plpgsql
as $$
begin
  update public.customers
     set num = coalesce(p_num, num),
         postal_code = coalesce(p_postal_code, postal_code),
         updated_at = now()
   where id = p_id;
end;
$$;

-- Grant execute to standard roles used by Supabase
grant execute on function public.update_customer_fields(uuid, text, text) to authenticated;
grant execute on function public.update_customer_fields(uuid, text, text) to anon;
