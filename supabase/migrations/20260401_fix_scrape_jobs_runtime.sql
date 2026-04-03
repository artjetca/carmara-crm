begin;

create extension if not exists "uuid-ossp";

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
grant execute on function public.refresh_pgrst_schema() to service_role;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.scrape_jobs (
  id uuid primary key default uuid_generate_v4(),
  province text,
  city text,
  keyword text,
  limit_count integer not null default 20,
  status text not null default 'pending',
  total_found integer not null default 0,
  total_imported integer not null default 0,
  total_failed integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  request_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

alter table public.scrape_jobs
  add column if not exists province text,
  add column if not exists city text,
  add column if not exists keyword text,
  add column if not exists limit_count integer not null default 20,
  add column if not exists total_found integer not null default 0,
  add column if not exists total_imported integer not null default 0,
  add column if not exists total_failed integer not null default 0,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists error_message text,
  add column if not exists request_payload jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references auth.users(id);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scrape_jobs'
      and column_name = 'keywords'
  ) then
    execute '
      update public.scrape_jobs
      set keyword = coalesce(keyword, keywords)
      where keyword is null
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scrape_jobs'
      and column_name = 'found_count'
  ) then
    execute '
      update public.scrape_jobs
      set total_found = coalesce(total_found, found_count)
      where total_found is null or total_found = 0
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scrape_jobs'
      and column_name = 'imported_count'
  ) then
    execute '
      update public.scrape_jobs
      set total_imported = coalesce(total_imported, imported_count)
      where total_imported is null or total_imported = 0
    ';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'scrape_jobs'
      and column_name = 'failed_count'
  ) then
    execute '
      update public.scrape_jobs
      set total_failed = coalesce(total_failed, failed_count)
      where total_failed is null or total_failed = 0
    ';
  end if;
end $$;

alter table if exists public.scrape_jobs
  drop constraint if exists scrape_jobs_status_check;

alter table public.scrape_jobs
  add constraint scrape_jobs_status_check
  check (status in ('pending', 'running', 'completed', 'failed'));

create table if not exists public.scrape_job_items (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.scrape_jobs(id) on delete cascade,
  business_name text not null,
  phone text,
  address text,
  city text,
  province text,
  website text,
  instagram text,
  category text,
  rating double precision,
  reviews_count integer,
  source text,
  status text not null default 'captured',
  lead_score integer default 0,
  place_id text,
  hash_dedupe text,
  lat double precision,
  lng double precision,
  geocode_status text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists scrape_jobs_updated_at on public.scrape_jobs;
create trigger scrape_jobs_updated_at
before update on public.scrape_jobs
for each row execute procedure public.set_updated_at();

drop trigger if exists scrape_job_items_updated_at on public.scrape_job_items;
create trigger scrape_job_items_updated_at
before update on public.scrape_job_items
for each row execute procedure public.set_updated_at();

create index if not exists scrape_jobs_status_idx on public.scrape_jobs(status);
create index if not exists scrape_jobs_created_at_idx on public.scrape_jobs(created_at desc);
create index if not exists scrape_job_items_job_id_idx on public.scrape_job_items(job_id);

alter table public.scrape_jobs enable row level security;
alter table public.scrape_job_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'scrape_jobs'
      and policyname = 'Allow full access to scrape_jobs'
  ) then
    execute 'create policy "Allow full access to scrape_jobs" on public.scrape_jobs for all using (true) with check (true)';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'scrape_job_items'
      and policyname = 'Allow full access to scrape_job_items'
  ) then
    execute 'create policy "Allow full access to scrape_job_items" on public.scrape_job_items for all using (true) with check (true)';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
