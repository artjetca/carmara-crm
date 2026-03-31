-- ============================================================
-- CASMARA CRM – Prospects / Leads table
-- Provinces: Cádiz and Huelva only
-- ============================================================

create table if not exists public.prospects (
  id              uuid primary key default gen_random_uuid(),
  business_name   text not null,
  contact_name    text,
  phone           text,
  address         text,
  city            text,
  province        text check (province in ('Cádiz','Huelva')),
  postal_code     text,
  country         text default 'España',
  category        text,   -- estética, clínica estética, peluquería, spa, centro de belleza …
  source          text,   -- Google Maps | directorio | manual
  website         text,
  notes           text,
  lat             double precision,
  lng             double precision,
  geocode_status  text default 'pending'
                  check (geocode_status in ('valid','approximate','invalid','pending')),

  -- Dedup flags
  duplicate_with_existing_client boolean default false,
  duplicate_prospect_id          uuid references public.prospects(id) on delete set null,
  unsupported_province           boolean default false,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users(id)
);

-- Index for common filter patterns
create index if not exists prospects_province_idx    on public.prospects(province);
create index if not exists prospects_city_idx        on public.prospects(city);
create index if not exists prospects_geo_status_idx  on public.prospects(geocode_status);
create index if not exists prospects_created_by_idx  on public.prospects(created_by);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists prospects_updated_at on public.prospects;
create trigger prospects_updated_at
  before update on public.prospects
  for each row execute procedure public.set_updated_at();

-- RLS (Row-Level Security) – every auth user can CRUD their own prospects
alter table public.prospects enable row level security;

create policy "Users can view their own prospects"
  on public.prospects for select
  using ( auth.uid() = created_by );

create policy "Users can insert their own prospects"
  on public.prospects for insert
  with check ( auth.uid() = created_by );

create policy "Users can update their own prospects"
  on public.prospects for update
  using ( auth.uid() = created_by );

create policy "Users can delete their own prospects"
  on public.prospects for delete
  using ( auth.uid() = created_by );
