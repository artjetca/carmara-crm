const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const getSupabaseConfig = () => {
  const source = process.env.SUPABASE_URL
    ? 'SUPABASE_URL'
    : (process.env.VITE_SUPABASE_URL ? 'VITE_SUPABASE_URL' : 'none')

  let host = 'none'
  try {
    host = supabaseUrl ? new URL(supabaseUrl).host : 'none'
  } catch {
    host = 'invalid'
  }

  return {
    url: supabaseUrl,
    urlExists: Boolean(supabaseUrl),
    urlSource: source,
    host,
    serviceRoleKeyExists: Boolean(serviceRoleKey),
  }
}

const getGoogleMapsConfig = () => {
  const key =
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_MAPS_SERVER_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    ''
  const source = process.env.GOOGLE_PLACES_API_KEY
    ? 'GOOGLE_PLACES_API_KEY'
    : process.env.GOOGLE_MAPS_SERVER_API_KEY
      ? 'GOOGLE_MAPS_SERVER_API_KEY'
      : process.env.GOOGLE_MAPS_API_KEY
        ? 'GOOGLE_MAPS_API_KEY'
        : (process.env.VITE_GOOGLE_MAPS_API_KEY ? 'VITE_GOOGLE_MAPS_API_KEY' : 'none')

  return {
    key,
    keyExists: Boolean(key),
    keySource: source,
  }
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const respond = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  body: JSON.stringify(body),
})

const buildTableMissingError = details =>
  `scrape_jobs schema unavailable. Could not find the table 'public.scrape_jobs' in the schema cache. ${details || 'Run the scrape_jobs migration and refresh PostgREST schema cache.'}`

const buildStageErrorMessage = (stage, details) => {
  const suffix = details ? ` ${details}` : ''

  switch (stage) {
    case 'db_connection':
      return `DB connection error.${suffix}`.trim()
    case 'scrape_jobs_select':
      return `scrape_jobs query failed.${suffix}`.trim()
    case 'scrape_jobs_insert':
      return `scrape_jobs insert failed.${suffix}`.trim()
    case 'scrape_job_items_insert':
      return `scrape_job_items insert failed.${suffix}`.trim()
    case 'prospects_select':
      return `prospects preload failed.${suffix}`.trim()
    case 'prospects_insert':
      return `prospects insert failed.${suffix}`.trim()
    case 'google_places':
      return `Google Places request failed.${suffix}`.trim()
    case 'google_places_empty':
      return `Google Places returned no results.${suffix}`.trim()
    default:
      return `Unexpected server error.${suffix}`.trim()
  }
}

const normalize = value =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const normalizePhone = value => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const hasPlus = raw.startsWith('+')
  const digits = raw.replace(/[^\d]/g, '')
  return hasPlus ? `+${digits}` : digits
}

const normalizePhoneForHash = value => {
  const normalized = normalizePhone(value)
  if (!normalized) return ''

  const digits = normalized.replace(/[^\d]/g, '')
  if (digits.length === 11 && digits.startsWith('34')) {
    return digits.slice(2)
  }

  return digits
}

const normalizeAddress = value =>
  normalize(
    String(value || '')
      .replace(/\bC\/\s*/gi, 'Calle ')
      .replace(/[.,;]+/g, ' ')
      .replace(/\s+/g, ' ')
  )

const normalizeWebsiteDomain = value => {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''

  try {
    const withProtocol = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`
    return new URL(withProtocol).hostname.replace(/^www\./, '').trim()
  } catch {
    return raw
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .trim()
  }
}

const buildNameCityKey = item => {
  const name = normalize(item.business_name || item.company || item.name)
  const city = normalize(item.city)
  return name && city ? `${name}|${city}` : ''
}

const buildAddressKey = item => {
  const address = normalizeAddress(item.address)
  const city = normalize(item.city)
  const province = normalize(item.province)
  return address ? `${address}|${city}|${province}` : ''
}

const simpleHash = value => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash.toString(16)
}

const buildHashDedupe = item =>
  simpleHash(
    [
      normalize(item.business_name),
      normalizePhoneForHash(item.phone),
      normalizeAddress(item.address),
      normalize(item.city),
      normalize(item.province),
    ].join('|')
  )

const createLookupMaps = items => {
  const byPhone = new Map()
  const byNameCity = new Map()
  const byAddress = new Map()
  const byWebsiteDomain = new Map()

  for (const item of items || []) {
    const phone = normalizePhoneForHash(item.mobile_phone || item.phone)
    const nameCity = buildNameCityKey(item)
    const address = buildAddressKey(item)
    const websiteDomain = normalizeWebsiteDomain(item.website)

    if (phone && !byPhone.has(phone)) byPhone.set(phone, item)
    if (nameCity && !byNameCity.has(nameCity)) byNameCity.set(nameCity, item)
    if (address && !byAddress.has(address)) byAddress.set(address, item)
    if (websiteDomain && !byWebsiteDomain.has(websiteDomain)) byWebsiteDomain.set(websiteDomain, item)
  }

  return { byPhone, byNameCity, byAddress, byWebsiteDomain }
}

const matchByLookupPriority = (item, lookupMaps) => {
  const phone = normalizePhoneForHash(item.phone)
  if (phone) {
    const matched = lookupMaps.byPhone.get(phone)
    if (matched) return { reason: 'phone', matched }
  }

  const nameCity = buildNameCityKey(item)
  if (nameCity) {
    const matched = lookupMaps.byNameCity.get(nameCity)
    if (matched) return { reason: 'name_city', matched }
  }

  const address = buildAddressKey(item)
  if (address) {
    const matched = lookupMaps.byAddress.get(address)
    if (matched) return { reason: 'address', matched }
  }

  const websiteDomain = normalizeWebsiteDomain(item.website)
  if (websiteDomain) {
    const matched = lookupMaps.byWebsiteDomain.get(websiteDomain)
    if (matched) return { reason: 'website_domain', matched }
  }

  return null
}

const calculateLeadScore = item => {
  let score = 0
  if (normalizePhone(item.phone)) score += 30
  else score -= 20
  if (item.website) score += 20
  if ((item.rating || 0) >= 4.5) score += 15
  if ((item.reviews_count || 0) > 20) score += 10
  if (/(estetica facial|clinica estetica)/i.test(normalize(item.category))) score += 15
  if (item.geocode_status === 'invalid') score -= 15
  return score
}

const buildSearchQueries = payload => {
  const keyword = String(payload.keyword || '').trim() || 'estética'
  const query = [keyword, payload.city, payload.province, 'Spain']
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  return query ? [query] : []
}

const fetchJson = async url => {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CASMARA-CRM/1.0',
    },
  })
  let json = {}
  try {
    json = await response.json()
  } catch {
    json = {}
  }
  return { ok: response.ok, status: response.status, json }
}

const maskGoogleUrl = url => String(url).replace(/([?&]key=)[^&]+/i, '$1***')

const isMissingRelationError = error =>
  /could not find the table .*schema cache/i.test(String(error?.message || error || '')) ||
  /relation .*scrape_jobs.* does not exist/i.test(String(error?.message || error || '')) ||
  /relation .*scrape_job_items.* does not exist/i.test(String(error?.message || error || ''))

const logSupabaseError = (step, error, extra = {}) => {
  console.error(`[prospect-scrape] ${step}`, {
    ...extra,
    message: error?.message || String(error),
    details: error?.details || null,
    hint: error?.hint || null,
    code: error?.code || null,
    stack: error?.stack || null,
  })
}

const logStep = (step, details = {}) => {
  console.info(`[prospect-scrape] ${step}`, details)
}

const isMissingColumnError = (error, columnName) =>
  new RegExp(`column .*${columnName}.* does not exist`, 'i').test(String(error?.message || error || ''))

const executeAdminSql = async (admin, sql) => {
  const attempts = [
    { fn: 'exec_sql', payload: { sql } },
    { fn: 'exec_sql', payload: { sql_query: sql } },
    { fn: 'exec', payload: { sql } },
  ]

  let lastError = null
  for (const attempt of attempts) {
    const { error } = await admin.rpc(attempt.fn, attempt.payload)
    if (!error) return { success: true }
    lastError = error
  }

  return { success: false, error: lastError }
}

const refreshSchemaCache = async admin => {
  const attempts = ['refresh_pgrst_schema']
  let lastError = null

  for (const fn of attempts) {
    const { error } = await admin.rpc(fn)
    if (!error) {
      return { success: true }
    }
    lastError = error
  }

  return { success: false, error: lastError }
}

const SCRAPE_JOBS_BOOTSTRAP_SQL = `
create extension if not exists "uuid-ossp";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table if exists public.prospects
  add column if not exists instagram text,
  add column if not exists rating double precision,
  add column if not exists reviews_count integer,
  add column if not exists status text,
  add column if not exists interest text,
  add column if not exists lead_score integer default 0,
  add column if not exists place_id text,
  add column if not exists hash_dedupe text;

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
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'scrape_jobs' and column_name = 'keywords'
  ) then
    execute 'update public.scrape_jobs set keyword = coalesce(keyword, keywords) where keyword is null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'scrape_jobs' and column_name = 'found_count'
  ) then
    execute 'update public.scrape_jobs set total_found = coalesce(total_found, found_count) where total_found is null or total_found = 0';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'scrape_jobs' and column_name = 'imported_count'
  ) then
    execute 'update public.scrape_jobs set total_imported = coalesce(total_imported, imported_count) where total_imported is null or total_imported = 0';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'scrape_jobs' and column_name = 'failed_count'
  ) then
    execute 'update public.scrape_jobs set total_failed = coalesce(total_failed, failed_count) where total_failed is null or total_failed = 0';
  end if;
end $$;

alter table if exists public.scrape_jobs drop constraint if exists scrape_jobs_status_check;
alter table public.scrape_jobs
  add constraint scrape_jobs_status_check check (status in ('pending','running','completed','failed'));

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

create index if not exists scrape_jobs_status_idx on public.scrape_jobs(status);
create index if not exists scrape_jobs_created_at_idx on public.scrape_jobs(created_at desc);
create index if not exists scrape_job_items_job_id_idx on public.scrape_job_items(job_id);
create index if not exists scrape_job_items_place_id_idx on public.scrape_job_items(place_id);
create index if not exists scrape_job_items_hash_dedupe_idx on public.scrape_job_items(hash_dedupe);

drop trigger if exists scrape_jobs_updated_at on public.scrape_jobs;
create trigger scrape_jobs_updated_at before update on public.scrape_jobs for each row execute procedure public.set_updated_at();
drop trigger if exists scrape_job_items_updated_at on public.scrape_job_items;
create trigger scrape_job_items_updated_at before update on public.scrape_job_items for each row execute procedure public.set_updated_at();

alter table public.scrape_jobs enable row level security;
alter table public.scrape_job_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'scrape_jobs' and policyname = 'Allow full access to scrape_jobs'
  ) then
    execute 'create policy "Allow full access to scrape_jobs" on public.scrape_jobs for all using (true) with check (true)';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'scrape_job_items' and policyname = 'Allow full access to scrape_job_items'
  ) then
    execute 'create policy "Allow full access to scrape_job_items" on public.scrape_job_items for all using (true) with check (true)';
  end if;
end $$;

notify pgrst, 'reload schema';
`

const ensureScrapeTables = async admin => {
  const probe = await admin.from('scrape_jobs').select('id').limit(1)
  if (!probe.error) {
    return { available: true, repaired: false }
  }

  if (!isMissingRelationError(probe.error)) {
    return { available: false, repaired: false, error: probe.error }
  }

  logSupabaseError('scrape_jobs probe failed, attempting schema refresh', probe.error)

  const refresh = await refreshSchemaCache(admin)
  if (refresh.success) {
    const retryAfterRefresh = await admin.from('scrape_jobs').select('id').limit(1)
    if (!retryAfterRefresh.error) {
      return { available: true, repaired: true, repairMode: 'refresh' }
    }

    if (!isMissingRelationError(retryAfterRefresh.error)) {
      logSupabaseError('scrape_jobs probe after schema refresh failed', retryAfterRefresh.error)
      return { available: false, repaired: true, error: retryAfterRefresh.error }
    }

    logSupabaseError('scrape_jobs still missing after schema refresh', retryAfterRefresh.error)
  } else {
    logSupabaseError('refresh_pgrst_schema failed', refresh.error)
  }

  logStep('attempting scrape_jobs bootstrap SQL fallback', {})
  const bootstrap = await executeAdminSql(admin, SCRAPE_JOBS_BOOTSTRAP_SQL)
  if (!bootstrap.success) {
    logSupabaseError('scrape_jobs bootstrap failed', bootstrap.error)
    const combinedMessage = [
      probe.error?.message || 'initial scrape_jobs probe failed',
      refresh.error?.message ? `refresh_pgrst_schema failed: ${refresh.error.message}` : null,
      bootstrap.error?.message ? `bootstrap failed: ${bootstrap.error.message}` : null,
    ]
      .filter(Boolean)
      .join(' | ')

    return {
      available: false,
      repaired: false,
      error: new Error(combinedMessage),
    }
  }

  const refreshAfterBootstrap = await refreshSchemaCache(admin)
  if (!refreshAfterBootstrap.success) {
    logSupabaseError('refresh_pgrst_schema after bootstrap failed', refreshAfterBootstrap.error)
  }

  const retry = await admin.from('scrape_jobs').select('id').limit(1)
  if (retry.error) {
    logSupabaseError('scrape_jobs probe after bootstrap failed', retry.error)
    return {
      available: false,
      repaired: true,
      error: retry.error,
    }
  }

  return { available: true, repaired: true, repairMode: 'bootstrap' }
}

const loadCustomersForDedupe = async admin => {
  logStep('loading customers for dedupe', {
    select: 'id, name, company, phone, mobile_phone, address, city, province, website',
  })

  const primary = await admin
    .from('customers')
    .select('id, name, company, phone, mobile_phone, address, city, province, website')
    .limit(5000)

  if (!primary.error) {
    return { data: primary.data || [], usedMobilePhone: true, error: null }
  }

  if (!isMissingColumnError(primary.error, 'mobile_phone')) {
    return { data: null, usedMobilePhone: false, error: primary.error }
  }

  logSupabaseError('customers preload missing mobile_phone, retrying with phone only', primary.error)
  logStep('loading customers for dedupe fallback', {
    select: '*',
  })

  const fallback = await admin
    .from('customers')
    .select('*')
    .limit(5000)

  if (fallback.error) {
    return { data: null, usedMobilePhone: false, error: fallback.error }
  }

  return { data: fallback.data || [], usedMobilePhone: false, error: null }
}

const fetchTextSearch = async query => {
  const { key } = getGoogleMapsConfig()
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
  url.searchParams.set('query', query)
  url.searchParams.set('language', 'es')
  url.searchParams.set('region', 'es')
  url.searchParams.set('key', key)

  logStep('calling Google Places Text Search', {
    requestUrl: maskGoogleUrl(url.toString()),
    query,
  })

  const { ok, status, json } = await fetchJson(url.toString())

  logStep('Google Places Text Search response', {
    query,
    httpStatus: status,
    apiStatus: json?.status || 'UNKNOWN',
    errorMessage: json?.error_message || null,
    parsedResultsCount: Array.isArray(json?.results) ? json.results.length : 0,
  })

  if (!ok) {
    return {
      ok: false,
      results: [],
      error: json?.error_message || json?.status || `HTTP ${json?.status || 'error'}`,
    }
  }

  if (json?.status === 'ZERO_RESULTS') {
    return { ok: true, results: [] }
  }

  if (json?.status && json.status !== 'OK') {
    return {
      ok: false,
      results: [],
      error: json.error_message || json.status,
    }
  }

  if (!Array.isArray(json?.results)) {
    return {
      ok: false,
      results: [],
      error: 'Invalid Google Places response format',
    }
  }

  return { ok: true, results: json.results }
}

const fetchPlaceDetails = async placeId => {
  const { key } = getGoogleMapsConfig()
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', placeId)
  url.searchParams.set(
    'fields',
    'name,formatted_phone_number,website,address_components,formatted_address'
  )
  url.searchParams.set('language', 'es')
  url.searchParams.set('key', key)

  logStep('calling Google Places Details', {
    requestUrl: maskGoogleUrl(url.toString()),
    placeId,
  })

  const { ok, status, json } = await fetchJson(url.toString())

  logStep('Google Places Details response', {
    placeId,
    httpStatus: status,
    apiStatus: json?.status || 'UNKNOWN',
    errorMessage: json?.error_message || null,
    hasResult: Boolean(json?.result),
  })

  if (!ok) {
    return { ok: false, result: null, error: json?.error_message || json?.status || 'HTTP error' }
  }

  if (json?.status && json.status !== 'OK') {
    return { ok: false, result: null, error: json.error_message || json.status }
  }

  return { ok: true, result: json?.result || null, error: null }
}

const getAddressComponent = (components, type) => {
  const match = (components || []).find(component => Array.isArray(component.types) && component.types.includes(type))
  return match?.long_name || ''
}

const normalizePlaceToProspect = (place, payload) => {
  const components = place.address_components || []
  const province =
    getAddressComponent(components, 'administrative_area_level_2') ||
    getAddressComponent(components, 'administrative_area_level_1') ||
    payload.province
  const city =
    getAddressComponent(components, 'locality') ||
    getAddressComponent(components, 'postal_town') ||
    getAddressComponent(components, 'administrative_area_level_3') ||
    payload.city

  const item = {
    business_name: place.name || '',
    phone: place.formatted_phone_number || null,
    address: place.formatted_address || null,
    city: city || payload.city || null,
    province: province || payload.province || null,
    lat: place.geometry?.location?.lat ?? null,
    lng: place.geometry?.location?.lng ?? null,
    website: place.website || null,
    instagram: null,
    category: String(payload.keyword || '').trim() || 'estética',
    rating: Number.isFinite(place.rating) ? Number(place.rating) : null,
    reviews_count: Number.isFinite(place.user_ratings_total) ? Number(place.user_ratings_total) : null,
    source: 'google_places',
    status: 'nuevo',
    interest: 'alto',
    place_id: place.place_id || null,
    geocode_status:
      Number.isFinite(place.geometry?.location?.lat) && Number.isFinite(place.geometry?.location?.lng)
        ? 'valid'
        : 'invalid',
  }

  return {
    ...item,
    hash_dedupe: buildHashDedupe(item),
    lead_score: calculateLeadScore(item),
  }
}

exports.handler = async event => {
  const mapsConfig = getGoogleMapsConfig()
  const supabaseConfig = getSupabaseConfig()

  console.info('[prospect-scrape] function started', {
    keyExists: mapsConfig.keyExists,
    keySource: mapsConfig.keySource,
    supabaseUrlExists: supabaseConfig.urlExists,
    supabaseUrlSource: supabaseConfig.urlSource,
    supabaseHost: supabaseConfig.host,
    serviceRoleKeyExists: supabaseConfig.serviceRoleKeyExists,
    method: event.httpMethod,
    path: event.path,
  })

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' }
  }

  if (!supabaseConfig.urlExists || supabaseConfig.host === 'invalid') {
    return respond(500, { success: false, error: buildStageErrorMessage('db_connection', 'SUPABASE_URL not configured correctly.') })
  }

  if (!serviceRoleKey) {
    return respond(500, { success: false, error: buildStageErrorMessage('db_connection', 'SUPABASE_SERVICE_ROLE_KEY missing.') })
  }

  if (event.httpMethod === 'GET' && event.queryStringParameters?.config === '1') {
    return respond(200, {
      success: true,
      data: {
        keyExists: mapsConfig.keyExists,
        keySource: mapsConfig.keySource,
      },
    })
  }

  if (!mapsConfig.keyExists) {
    console.warn('[prospect-scrape] Google Maps API key missing. Checked env: GOOGLE_PLACES_API_KEY, GOOGLE_MAPS_SERVER_API_KEY, GOOGLE_MAPS_API_KEY, VITE_GOOGLE_MAPS_API_KEY')
    return respond(500, {
      success: false,
      error:
        'Google Maps API key not configured. Configure GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_SERVER_API_KEY in Netlify environment variables and redeploy the site.',
    })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const tableStatus = await ensureScrapeTables(admin)
    if (!tableStatus.available) {
      logSupabaseError('scrape_jobs unavailable after ensureScrapeTables', tableStatus.error, {
        supabaseHost: supabaseConfig.host,
      })
      return respond(500, {
        success: false,
        error: isMissingRelationError(tableStatus.error)
          ? buildTableMissingError(tableStatus.error?.message)
          : buildStageErrorMessage('db_connection', tableStatus.error?.message || 'Unknown Supabase connection error.'),
      })
    }

    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}
      let jobsQuery = admin.from('scrape_jobs').select('*').order('created_at', { ascending: false }).limit(30)
      if (params.created_by) {
        jobsQuery = jobsQuery.eq('created_by', params.created_by)
      }
      const { data: jobs, error } = await jobsQuery
      if (error) {
        logSupabaseError('load scrape_jobs failed', error, { params })
        return respond(500, {
          success: false,
          error: isMissingRelationError(error)
            ? buildTableMissingError(error.message)
            : buildStageErrorMessage('scrape_jobs_select', error.message),
        })
      }

      if (params.job_id) {
        const { data: items, error: itemsError } = await admin
          .from('scrape_job_items')
          .select('*')
          .eq('job_id', params.job_id)
          .order('lead_score', { ascending: false })
        if (itemsError) {
          logSupabaseError('load scrape_job_items failed', itemsError, { params })
          return respond(500, {
            success: false,
            error: isMissingRelationError(itemsError)
              ? buildTableMissingError(itemsError.message)
              : buildStageErrorMessage('scrape_jobs_select', itemsError.message),
          })
        }
        return respond(200, { success: true, data: jobs, items })
      }

      return respond(200, { success: true, data: jobs })
    }

    if (event.httpMethod !== 'POST') {
      return respond(405, { success: false, error: 'Method not allowed' })
    }

    const payload = JSON.parse(event.body || '{}')
    if (!String(payload.province || '').trim()) {
      return respond(400, {
        success: false,
        error: 'Debes seleccionar una provincia antes de iniciar la captación.',
      })
    }
    console.info('[prospect-scrape] request config', {
      keyExists: mapsConfig.keyExists,
      keySource: mapsConfig.keySource,
      supabaseHost: supabaseConfig.host,
      province: payload.province || null,
      city: payload.city || null,
      keyword: payload.keyword || null,
      limit: payload.limit || null,
    })
    const limit = Math.min(Math.max(Number(payload.limit) || 50, 1), 50)
    const detailsLimit = Math.min(limit, 20)

    logStep('creating scrape_jobs...', {
      province: payload.province,
      city: payload.city || null,
      keyword: payload.keyword || 'estética',
      limit,
    })
    const { data: createdJob, error: createJobError } = await admin
      .from('scrape_jobs')
      .insert({
        province: payload.province,
        city: payload.city || null,
        keyword: payload.keyword || 'estética',
        limit_count: limit,
        status: 'running',
        request_payload: payload,
        created_by: payload.created_by || null,
      })
      .select()
      .single()

    if (createJobError) {
      logSupabaseError('create scrape_jobs row failed', createJobError, { payload, supabaseHost: supabaseConfig.host })
      return respond(500, {
        success: false,
        error: isMissingRelationError(createJobError)
          ? buildTableMissingError(createJobError.message)
          : buildStageErrorMessage('scrape_jobs_insert', createJobError.message),
      })
    }
    logStep('scrape_jobs insert result', {
      jobId: createdJob?.id || null,
      status: createdJob?.status || null,
      createdAt: createdJob?.created_at || null,
    })

    const { error: updateRunningError } = await admin
      .from('scrape_jobs')
      .update({
        started_at: new Date().toISOString(),
      })
      .eq('id', createdJob.id)
    if (updateRunningError) {
      logSupabaseError('mark scrape_jobs running failed', updateRunningError, { jobId: createdJob.id })
      return respond(500, {
        success: false,
        error: buildStageErrorMessage('scrape_jobs_insert', `Job created but could not be marked as running: ${updateRunningError.message}`),
      })
    }

    const queries = buildSearchQueries({
      province: payload.province,
      city: payload.city,
      keyword: payload.keyword,
      limit,
    })
    console.info('[prospect-scrape] built queries', { queries })

    logStep('loading existing prospects and customers for dedupe', {})
    const { data: existingProspects, error: existingProspectsError } = await admin
      .from('prospects')
      .select('id, business_name, phone, address, city, province, website, place_id, hash_dedupe')
      .limit(5000)
    if (existingProspectsError) {
      logSupabaseError('load prospects for dedupe failed', existingProspectsError, { jobId: createdJob.id })
      await admin.from('scrape_jobs').update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: `prospects preload error: ${existingProspectsError.message}`,
      }).eq('id', createdJob.id)
      return respond(500, {
        success: false,
        error: buildStageErrorMessage('prospects_select', existingProspectsError.message),
      })
    }
    const customersResult = await loadCustomersForDedupe(admin)
    const existingCustomers = customersResult.data
    if (customersResult.error) {
      logSupabaseError('load customers for dedupe failed', customersResult.error, { jobId: createdJob.id })
      await admin.from('scrape_jobs').update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: `customers preload error: ${customersResult.error.message}`,
      }).eq('id', createdJob.id)
      return respond(500, {
        success: false,
        error: buildStageErrorMessage('db_connection', `customers preload failed: ${customersResult.error.message}`),
      })
    }
    logStep('customers preload success', {
      count: existingCustomers.length,
      usedMobilePhone: customersResult.usedMobilePhone,
    })

    const existingPlaceIds = new Set((existingProspects || []).map(item => item.place_id).filter(Boolean))
    const existingHashes = new Set((existingProspects || []).map(item => item.hash_dedupe).filter(Boolean))
    const customerLookups = createLookupMaps(
      (existingCustomers || []).map(item => ({
        ...item,
        business_name: item.company || item.name,
        phone: item.mobile_phone || item.phone,
      }))
    )
    const prospectLookups = createLookupMaps(existingProspects || [])
    const batchLookups = createLookupMaps([])
    const batchPlaceIds = new Set()
    const batchHashes = new Set()

    const candidates = []
    const seenPlaces = new Set()
    let totalRawResults = 0

    for (const query of queries) {
      console.info('[prospect-scrape] [1/8] text search starting', { query })
      const textSearch = await fetchTextSearch(query)
      if (!textSearch.ok) {
        const errorMessage = buildStageErrorMessage('google_places', textSearch.error)
        await admin
          .from('scrape_jobs')
          .update({
            status: 'failed',
            finished_at: new Date().toISOString(),
            error_message: errorMessage,
          })
          .eq('id', createdJob.id)
        return respond(502, { success: false, error: errorMessage })
      }
      const results = textSearch.results
      totalRawResults += results.length
      console.info('[prospect-scrape] [2/8] raw results from Google', {
        query,
        rawCount: results.length,
      })
      // DEBUG: log rating distribution to diagnose filter issues
      const ratingBreakdown = results.reduce((acc, r) => {
        const bucket = r.rating == null ? 'no_rating' : r.rating < 3 ? '<3' : r.rating < 4 ? '3-4' : r.rating < 4.5 ? '4-4.5' : '>=4.5'
        acc[bucket] = (acc[bucket] || 0) + 1
        return acc
      }, {})
      console.info('[prospect-scrape] rating breakdown', ratingBreakdown)

      for (const result of results) {
        if (!result?.place_id || seenPlaces.has(result.place_id)) continue
        if (!result?.formatted_address) continue
        // REMOVED strict rating filter (was < 4.2) — it was silently dropping
        // all results when businesses have no rating or ratings below 4.2.
        // Lead score already penalises low-quality results.
        seenPlaces.add(result.place_id)
        candidates.push(result)
        if (candidates.length >= detailsLimit) break
      }
      if (candidates.length >= detailsLimit) break
    }

    console.info('[prospect-scrape] [3/8] candidates after dedup filter', {
      totalRawResults,
      candidatesCount: candidates.length,
      detailsLimit,
    })

    const collected = []
    let detailsFailed = 0
    for (const result of candidates) {
      try {
        const details = await fetchPlaceDetails(result.place_id)
        if (!details.ok) {
          detailsFailed += 1
          console.error('[prospect-scrape] details fetch error', {
            place_id: result.place_id,
            error: details.error,
          })
          continue
        }
        const normalized = normalizePlaceToProspect(
          { ...result, ...(details.result || {}) },
          payload
        )
        collected.push(normalized)
      } catch (detailsError) {
        detailsFailed += 1
        console.error('[prospect-scrape] details fetch error', { place_id: result.place_id, error: detailsError?.message || String(detailsError) })
      }
    }
    console.info('[prospect-scrape] [4/8] normalized items', {
      candidates: candidates.length,
      collected: collected.length,
      detailsFailed,
    })
    if (totalRawResults === 0) {
      await admin
        .from('scrape_jobs')
        .update({
          status: 'completed',
          total_found: 0,
          total_imported: 0,
          total_failed: 0,
          finished_at: new Date().toISOString(),
          error_message: buildStageErrorMessage('google_places_empty', queries.join(', ')),
        })
        .eq('id', createdJob.id)
      return respond(200, {
        success: true,
        data: {
          job: {
            ...createdJob,
            status: 'completed',
            total_found: 0,
            total_imported: 0,
            total_failed: 0,
          },
          items: [],
          prospects: [],
          summary: {
            nuevos_anadidos: 0,
            omitidos_por_existente_en_clientes: 0,
            duplicados_internos: 0,
            errores: 0,
          },
        },
      })
    }

    const jobItems = []
    const prospectsToInsert = []
    let duplicateCount = 0
    let omittedExistingCustomerCount = 0
    let internalDuplicateCount = 0

    for (const item of collected) {
      const customerMatch = matchByLookupPriority(item, customerLookups)
      const prospectMatch = item.place_id && existingPlaceIds.has(item.place_id)
        ? { reason: 'place_id', matched: null }
        : matchByLookupPriority(item, prospectLookups)
      const batchMatch = item.place_id && batchPlaceIds.has(item.place_id)
        ? { reason: 'place_id', matched: null }
        : matchByLookupPriority(item, batchLookups)

      const duplicateAgainstProspects =
        prospectMatch ||
        (existingHashes.has(item.hash_dedupe) ? { reason: 'hash', matched: null } : null)
      const duplicateAgainstBatch =
        batchMatch ||
        (batchHashes.has(item.hash_dedupe) ? { reason: 'hash', matched: null } : null)

      const duplicate = Boolean(customerMatch || duplicateAgainstProspects || duplicateAgainstBatch)
      const omitidoPorClienteExistente = Boolean(customerMatch)
      const duplicateReason = customerMatch
        ? `customer_${customerMatch.reason}`
        : duplicateAgainstProspects
          ? `prospect_${duplicateAgainstProspects.reason}`
          : duplicateAgainstBatch
            ? `batch_${duplicateAgainstBatch.reason}`
            : null

      let motivo = null
      if (customerMatch) {
        omittedExistingCustomerCount += 1
        duplicateCount += 1
        motivo = 'Ya existe en Gestión de Clientes'
      } else if (duplicateAgainstProspects || duplicateAgainstBatch) {
        internalDuplicateCount += 1
        duplicateCount += 1
        motivo = 'Duplicado interno'
      }

      jobItems.push({
        job_id: createdJob.id,
        business_name: item.business_name,
        phone: item.phone,
        address: item.address,
        city: item.city,
        province: item.province,
        website: item.website,
        instagram: item.instagram,
        category: item.category,
        rating: item.rating,
        reviews_count: item.reviews_count,
        source: item.source,
        status: duplicate ? 'duplicate' : 'captured',
        lead_score: item.lead_score,
        place_id: item.place_id,
        hash_dedupe: item.hash_dedupe,
        lat: item.lat,
        lng: item.lng,
        geocode_status: item.geocode_status,
        raw_payload: {
          ...item,
          omitido_por_cliente_existente: omitidoPorClienteExistente,
          motivo,
          duplicate_reason: duplicateReason,
        },
      })

      if (!duplicate) {
        if (item.place_id) batchPlaceIds.add(item.place_id)
        if (item.hash_dedupe) batchHashes.add(item.hash_dedupe)
        const phone = normalizePhoneForHash(item.phone)
        const nameCity = buildNameCityKey(item)
        const address = buildAddressKey(item)
        const websiteDomain = normalizeWebsiteDomain(item.website)
        if (phone && !batchLookups.byPhone.has(phone)) batchLookups.byPhone.set(phone, item)
        if (nameCity && !batchLookups.byNameCity.has(nameCity)) batchLookups.byNameCity.set(nameCity, item)
        if (address && !batchLookups.byAddress.has(address)) batchLookups.byAddress.set(address, item)
        if (websiteDomain && !batchLookups.byWebsiteDomain.has(websiteDomain)) batchLookups.byWebsiteDomain.set(websiteDomain, item)

        prospectsToInsert.push({
          business_name: item.business_name,
          phone: item.phone,
          address: item.address,
          city: item.city,
          province: item.province,
          website: item.website,
          instagram: item.instagram,
          category: item.category,
          rating: item.rating,
          reviews_count: item.reviews_count,
          source: item.source,
          status: item.status,
          interest: item.interest,
          lead_score: item.lead_score,
          place_id: item.place_id,
          hash_dedupe: item.hash_dedupe,
          lat: item.lat,
          lng: item.lng,
          geocode_status: item.geocode_status,
          created_by: payload.created_by || null,
        })
      }
    }

    console.info('[prospect-scrape] [5/8] deduplication complete', {
      total: collected.length,
      duplicates: duplicateCount,
      omittedExistingCustomerCount,
      internalDuplicateCount,
      toInsert: prospectsToInsert.length,
    })

    if (jobItems.length > 0) {
      console.info('[prospect-scrape] [6/8] inserting scrape_job_items', { count: jobItems.length })
      const { error: jobItemsError } = await admin.from('scrape_job_items').insert(jobItems)
      if (jobItemsError) {
        logSupabaseError('[6/8] insert scrape_job_items failed', jobItemsError, { createdJobId: createdJob.id })
        await admin
          .from('scrape_jobs')
          .update({
            status: 'failed',
            total_found: collected.length,
            total_imported: 0,
            total_failed: collected.length,
            finished_at: new Date().toISOString(),
            error_message: `scrape_job_items insert error: ${jobItemsError.message}`,
          })
          .eq('id', createdJob.id)
        return respond(500, {
          success: false,
          error: `No se pudieron guardar los items del job: ${jobItemsError.message}`,
        })
      }
      console.info('[prospect-scrape] [6/8] scrape_job_items inserted OK')
    } else {
      console.info('[prospect-scrape] [6/8] no job items to insert')
    }

    let insertedProspects = []
    let prospectInsertError = null

    if (prospectsToInsert.length > 0) {
      console.info('[prospect-scrape] [7/8] inserting into prospects table', { count: prospectsToInsert.length })
      const { data, error } = await admin.from('prospects').insert(prospectsToInsert).select('*')
      if (error) {
        prospectInsertError = error
        logSupabaseError('[7/8] insert prospects from scrape failed', error, {
          createdJobId: createdJob.id,
          sampleRecord: prospectsToInsert[0],
        })
        await admin
          .from('scrape_jobs')
          .update({
            status: 'failed',
            total_found: collected.length,
            total_imported: 0,
            total_failed: prospectsToInsert.length,
            finished_at: new Date().toISOString(),
            error_message: `prospects insert error: ${error.message}`,
          })
          .eq('id', createdJob.id)
        return respond(500, { success: false, error: `Error al importar prospectos: ${error.message}` })
      }
      insertedProspects = data || []
      console.info('[prospect-scrape] [7/8] prospects inserted into DB', {
        requested: prospectsToInsert.length,
        inserted: insertedProspects.length,
      })
    } else if (collected.length === 0) {
      console.info('[prospect-scrape] [7/8] no results from Google search (0 candidates after raw fetch)')
    } else {
      console.info('[prospect-scrape] [7/8] all results were duplicates, nothing to insert', {
        collected: collected.length,
        duplicates: duplicateCount,
      })
    }

    // Mark job items as imported
    if (insertedProspects.length > 0) {
      const importedHashes = insertedProspects.map(item => item.hash_dedupe).filter(Boolean)
      if (importedHashes.length > 0) {
        await admin
          .from('scrape_job_items')
          .update({ status: 'imported' })
          .eq('job_id', createdJob.id)
          .in('hash_dedupe', importedHashes)
      }
    }

    // Determine final status
    const totalFound = collected.length
    const totalImported = insertedProspects.length
    const totalFailed = Math.max(0, prospectsToInsert.length - insertedProspects.length)

    let finalStatus
    finalStatus = totalFailed > 0 && totalImported === 0 && totalFound === 0 ? 'failed' : 'completed'

    console.info('[prospect-scrape] [8/8] final job status', {
      totalRawResults,
      totalFound,
      totalImported,
      totalFailed,
      duplicates: duplicateCount,
      omittedExistingCustomerCount,
      internalDuplicateCount,
      finalStatus,
    })

    const { data: finalJob, error: finalJobError } = await admin
      .from('scrape_jobs')
      .update({
        status: finalStatus,
        total_found: totalFound,
        total_imported: totalImported,
        total_failed: totalFailed,
        finished_at: new Date().toISOString(),
        error_message: totalFound === 0
          ? `Sin resultados de Google Places para: ${queries.join(', ')}`
          : (totalImported === 0 && totalFound > 0)
            ? `${totalFound} encontrados, ${omittedExistingCustomerCount} omitidos por cliente existente y ${internalDuplicateCount} duplicados internos`
            : null,
      })
      .eq('id', createdJob.id)
      .select('*')
      .single()
    if (finalJobError) {
      logSupabaseError('final scrape_jobs update failed', finalJobError, { jobId: createdJob.id })
      return respond(500, {
        success: false,
        error: buildStageErrorMessage('scrape_jobs_insert', `Final job update failed: ${finalJobError.message}`),
      })
    }

    console.info('[prospect-scrape] final success', {
      jobId: createdJob.id,
      totalFound,
      totalImported,
      totalFailed,
      finalStatus,
    })
    return respond(200, {
      success: true,
      data: {
        job: finalJob || createdJob,
        items: jobItems,
        prospects: insertedProspects,
        summary: {
          nuevos_anadidos: totalImported,
          omitidos_por_existente_en_clientes: omittedExistingCustomerCount,
          duplicados_internos: internalDuplicateCount,
          errores: totalFailed,
        },
      },
    })
  } catch (error) {
    console.error('[prospect-scrape] unexpected error', {
      message: error?.message || String(error),
      stack: error?.stack || null,
      supabaseHost: supabaseConfig.host,
    })
    return respond(500, {
      success: false,
      error: error?.message || 'Unexpected scrape error',
    })
  }
}
