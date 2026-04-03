import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260401_fix_scrape_jobs_runtime.sql'
)

test('scrape_jobs runtime migration defines the required public table and policies', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(sql, /create extension if not exists "uuid-ossp"/i)
  assert.match(sql, /create or replace function public\.refresh_pgrst_schema\(\)/i)
  assert.match(sql, /grant execute on function public\.refresh_pgrst_schema\(\) to service_role;/i)
  assert.match(sql, /create table if not exists public\.scrape_jobs/i)
  assert.match(sql, /id uuid primary key default uuid_generate_v4\(\)/i)
  assert.match(sql, /status text not null default 'pending'/i)
  assert.match(
    sql,
    /check \(status in \('pending',\s*'running',\s*'completed',\s*'failed'\)\)/i
  )
  assert.match(sql, /total_found integer not null default 0/i)
  assert.match(sql, /total_imported integer not null default 0/i)
  assert.match(sql, /total_failed integer not null default 0/i)
  assert.match(sql, /create policy "Allow full access to scrape_jobs"/i)
  assert.match(sql, /notify pgrst, 'reload schema';/i)
})
