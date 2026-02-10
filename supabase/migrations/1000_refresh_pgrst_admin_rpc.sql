-- Admin RPC to manually refresh PostgREST schema cache
-- Creates SECURITY DEFINER function and grants execute to authenticated (adjust as needed)

begin;
  create or replace function public.refresh_pgrst_schema()
  returns void
  language sql
  security definer
  set search_path = public
  as $$
    NOTIFY pgrst, 'reload schema';
  $$;

  revoke all on function public.refresh_pgrst_schema() from public;
  grant execute on function public.refresh_pgrst_schema() to authenticated;
commit;
