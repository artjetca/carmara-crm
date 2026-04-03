alter table public.prospects
  add column if not exists instagram text,
  add column if not exists rating double precision,
  add column if not exists reviews_count integer,
  add column if not exists status text,
  add column if not exists interest text,
  add column if not exists lead_score integer default 0,
  add column if not exists place_id text,
  add column if not exists hash_dedupe text;

create index if not exists prospects_place_id_idx on public.prospects(place_id);
create index if not exists prospects_hash_dedupe_idx on public.prospects(hash_dedupe);
create index if not exists prospects_lead_score_idx on public.prospects(lead_score desc);

create table if not exists public.scrape_jobs (
  id uuid primary key default gen_random_uuid(),
  province text not null,
  city text,
  category text,
  keywords text,
  limit_count integer not null default 20,
  only_with_phone boolean not null default false,
  exclude_chain_brands boolean not null default false,
  status text not null default 'running' check (status in ('running','completed','failed')),
  found_count integer not null default 0,
  imported_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table if not exists public.scrape_job_items (
  id uuid primary key default gen_random_uuid(),
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
  status text not null default 'captured' check (status in ('captured','imported','duplicate','failed')),
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

create index if not exists scrape_jobs_created_by_idx on public.scrape_jobs(created_by);
create index if not exists scrape_jobs_status_idx on public.scrape_jobs(status);
create index if not exists scrape_job_items_job_id_idx on public.scrape_job_items(job_id);
create index if not exists scrape_job_items_place_id_idx on public.scrape_job_items(place_id);
create index if not exists scrape_job_items_hash_dedupe_idx on public.scrape_job_items(hash_dedupe);

drop trigger if exists scrape_jobs_updated_at on public.scrape_jobs;
create trigger scrape_jobs_updated_at
  before update on public.scrape_jobs
  for each row execute procedure public.set_updated_at();

drop trigger if exists scrape_job_items_updated_at on public.scrape_job_items;
create trigger scrape_job_items_updated_at
  before update on public.scrape_job_items
  for each row execute procedure public.set_updated_at();

alter table public.scrape_jobs enable row level security;
alter table public.scrape_job_items enable row level security;

create policy "Users can view their own scrape jobs"
  on public.scrape_jobs for select
  using (auth.uid() = created_by);

create policy "Users can insert their own scrape jobs"
  on public.scrape_jobs for insert
  with check (auth.uid() = created_by);

create policy "Users can update their own scrape jobs"
  on public.scrape_jobs for update
  using (auth.uid() = created_by);

create policy "Users can view scrape job items from own jobs"
  on public.scrape_job_items for select
  using (
    exists (
      select 1
      from public.scrape_jobs jobs
      where jobs.id = scrape_job_items.job_id
        and jobs.created_by = auth.uid()
    )
  );
