alter table if exists public.scrape_jobs
  add column if not exists keyword text,
  add column if not exists "limit" integer,
  add column if not exists started_at timestamptz not null default now(),
  add column if not exists finished_at timestamptz,
  add column if not exists total_found integer not null default 0,
  add column if not exists total_saved integer not null default 0,
  add column if not exists request_payload jsonb;

update public.scrape_jobs
set
  keyword = coalesce(keyword, keywords),
  "limit" = coalesce("limit", limit_count),
  total_found = coalesce(total_found, found_count),
  total_saved = coalesce(total_saved, imported_count),
  started_at = coalesce(started_at, created_at)
where
  keyword is null
  or "limit" is null
  or total_found is null
  or total_saved is null
  or started_at is null;

create index if not exists scrape_jobs_keyword_idx on public.scrape_jobs(keyword);
create index if not exists scrape_jobs_started_at_idx on public.scrape_jobs(started_at desc);

begin;
  notify pgrst, 'reload schema';
commit;
