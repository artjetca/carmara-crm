const { createClient } = require('@supabase/supabase-js')
const { getMapProviderConfig } = require('./_shared/map-providers')

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const memoryCache = new Map()
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

const respond = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  },
  body: JSON.stringify(body),
})

const normalizePart = value => String(value || '').trim().replace(/\s+/g, ' ')

const normalizeStreetAddress = value => normalizePart(value)
  .replace(/\bPKAZA\b/gi, 'PLAZA')
  .replace(/\bPZA\.?\b/gi, 'PLAZA')
  .replace(/\bC\s*\/\s*/gi, 'CALLE ')
  .replace(/\bAV\.?\s+/gi, 'AVENIDA ')
  .replace(/\b(?:N[º°]|Nº|N°|NO\.)\s*/gi, '')
  .replace(/[,.]?\s*(?:EDIFICIO|BLOQ(?:UE)?|LOCAL|CENTRO COMERCIAL|URB(?:ANIZACI[ÓO]N)?)[\s\S]*$/i, '')
  .replace(/^AMBERES\b/i, 'CALLE AMBERES')
  .replace(/^AVENIDA LA PEPA\b/i, 'AVENIDA DE LA PEPA')
  .replace(/(\d+)\s+\d+[A-Z]$/i, '$1')
  .replace(/\s+/g, ' ')
  .trim()

const buildNormalizedAddress = customer => {
  const parts = [
    normalizeStreetAddress(customer.address),
    normalizePart(customer.postal_code),
    normalizePart(customer.city),
    normalizePart(customer.province),
    normalizePart(customer.country) || 'España',
  ].filter(Boolean)

  return parts.join(', ')
}

const buildGeocodingCandidates = customer => {
  const street = normalizeStreetAddress(customer.address)
  const postalCode = normalizePart(customer.postal_code)
  const city = normalizePart(customer.city)
  const province = normalizePart(customer.province)
  const country = normalizePart(customer.country) || 'España'

  // Some imported CRM rows store the province in city. Keep the complete
  // address first, then retry with the postcode and province only instead of
  // assigning a city-centre coordinate to a potentially incorrect city.
  return [
    [street, postalCode, city, province, country].filter(Boolean).join(', '),
    [street, postalCode, province, country].filter(Boolean).join(', '),
  ].filter((candidate, index, candidates) => candidate && candidates.indexOf(candidate) === index)
}

const hasCompleteAddress = customer => {
  const street = normalizePart(customer.address)
  const city = normalizePart(customer.city)
  const province = normalizePart(customer.province)
  const normalizedAddress = buildNormalizedAddress(customer)
  const hasStreetLikeAddress =
    /(\d|calle|c\/|avenida|avda|av\.|plaza|pol[ií]gono|carretera|camino|urbanizaci[oó]n|local|nave|edificio|portal)/i.test(
      street
    ) && street.length >= 8

  return hasStreetLikeAddress && Boolean(province) && Boolean(city || normalizePart(customer.postal_code)) && normalizedAddress.length >= 18
}

const getConfidence = result => {
  const importance = Number(result?.importance || 0)
  const type = String(result?.type || '')
  const isStreetLevel = /^(house|building|amenity|shop|office|commercial|residential)$/i.test(type)
  if (isStreetLevel && importance >= 0.25) return { status: 'success', confidence: Math.min(1, importance) }
  return { status: 'low_confidence', confidence: Math.min(1, importance) }
}

const searchNominatim = async address => {
  const config = getMapProviderConfig()
  const cacheKey = address.toLowerCase()
  const cached = memoryCache.get(cacheKey)
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.results

  const url = new URL(`${config.nominatimBaseUrl}/search`)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('q', address)
  url.searchParams.set('limit', '3')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('countrycodes', 'es')
  if (config.nominatimEmail) url.searchParams.set('email', config.nominatimEmail)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': config.nominatimUserAgent,
        Referer: process.env.URL || 'https://casmara-charo.netlify.app',
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Nominatim responded ${response.status}`)
    const payload = await response.json()
    const results = Array.isArray(payload)
      ? payload
          .map(entry => {
            const lat = Number(entry.lat)
            const lng = Number(entry.lon)
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
            return {
              lat,
              lng,
              display_name: entry.display_name || '',
              source: 'nominatim',
              type: entry.type || '',
              category: entry.category || entry.class || '',
              raw: entry,
            }
          })
          .filter(Boolean)
      : []
    memoryCache.set(cacheKey, { createdAt: Date.now(), results })
    return results
  } finally {
    clearTimeout(timeout)
  }
}

const getAdmin = () => {
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const logUsage = async (admin, success, errorMessage = null) => {
  if (!admin) return
  await admin.from('map_service_usage').insert({
    provider: 'nominatim',
    operation: 'geocode',
    success,
    error_message: errorMessage,
  })
}

const geocodeCustomer = async (admin, customer) => {
  const normalizedAddress = buildNormalizedAddress(customer)
  if (!normalizedAddress || normalizedAddress === 'España') {
    await admin
      .from('customers')
      .update({
        normalized_address: normalizedAddress || null,
        geocoding_status: 'manual_review',
        geocoding_error: 'Dirección incompleta',
        geocoding_attempts: Number(customer.geocoding_attempts || 0) + 1,
      })
      .eq('id', customer.id)
    return { id: customer.id, status: 'manual_review', reason: 'Dirección incompleta' }
  }

  const attempts = Number(customer.geocoding_attempts || 0) + 1
  await admin
    .from('customers')
    .update({ geocoding_status: 'processing', geocoding_attempts: attempts, normalized_address: normalizedAddress })
    .eq('id', customer.id)

  try {
    const candidates = buildGeocodingCandidates(customer)
    let first = null
    for (let index = 0; index < candidates.length; index++) {
      const results = await searchNominatim(candidates[index])
      if (results[0]) {
        first = results[0]
        break
      }
      if (index < candidates.length - 1) {
        await new Promise(resolve => setTimeout(resolve, getMapProviderConfig().geocodingIntervalMs))
      }
    }
    if (!first) {
      const status = attempts >= 3 ? 'manual_review' : 'failed'
      await admin
        .from('customers')
        .update({
          geocoding_status: status,
          geocoding_provider: 'nominatim',
          geocoding_error: 'Sin resultados en Nominatim',
          geocoded_at: new Date().toISOString(),
        })
        .eq('id', customer.id)
      await logUsage(admin, false, 'Sin resultados en Nominatim')
      return { id: customer.id, status }
    }

    const confidence = getConfidence(first.raw)
    await admin
      .from('customers')
      .update({
        latitude: first.lat,
        longitude: first.lng,
        coordinates: `${first.lat},${first.lng}`,
        normalized_address: normalizedAddress,
        geocoding_status: confidence.status,
        geocoding_provider: 'nominatim',
        geocoding_confidence: confidence.confidence,
        geocoded_at: new Date().toISOString(),
        geocoding_error: null,
      })
      .eq('id', customer.id)
    await logUsage(admin, true)
    return { id: customer.id, status: confidence.status, lat: first.lat, lng: first.lng }
  } catch (error) {
    const status = attempts >= 3 ? 'manual_review' : 'failed'
    const message = error?.message || 'Error inesperado de geocodificación'
    await admin
      .from('customers')
      .update({
        geocoding_status: status,
        geocoding_provider: 'nominatim',
        geocoding_error: message,
        geocoded_at: new Date().toISOString(),
      })
      .eq('id', customer.id)
    await logUsage(admin, false, message)
    return { id: customer.id, status, error: message }
  }
}

const getStatus = async (admin, filters = {}) => {
  const config = getMapProviderConfig()
  let scopedCustomers = admin
    .from('customers')
    .select('latitude, longitude, geocoding_status')
  if (filters.province) scopedCustomers = scopedCustomers.eq('province', filters.province)
  if (filters.city) scopedCustomers = scopedCustomers.eq('city', filters.city)

  const [customers, usage] = await Promise.all([
    scopedCustomers,
    admin.from('map_service_usage').select('success, created_at').gte('created_at', new Date(Date.now() - 31 * 86400000).toISOString()),
  ])
  if (customers.error) throw customers.error
  if (usage.error) throw usage.error

  const counts = (customers.data || []).reduce((all, customer) => {
    const key = customer.geocoding_status || 'pending'
    all[key] = (all[key] || 0) + 1
    return all
  }, {})
  const today = new Date().toISOString().slice(0, 10)
  const requests = usage.data || []
  const successful = requests.filter(item => item.success)
  const scopeRows = customers.data || []
  const mapped = scopeRows.filter(customer => Number.isFinite(customer.latitude) && Number.isFinite(customer.longitude)).length
  const pending = scopeRows.filter(customer =>
    (!Number.isFinite(customer.latitude) || !Number.isFinite(customer.longitude)) &&
    ['pending', 'failed', 'manual_review'].includes(customer.geocoding_status || 'pending')
  ).length

  return {
    providers: {
      map: config.mapProvider,
      geocoding: config.geocodingProvider,
      routing: config.routingProvider,
      prospect: config.prospectProvider,
      ai: config.aiProvider,
    },
    geocoding: counts,
    scope: {
      total: scopeRows.length,
      mapped,
      pending,
      filters: {
        province: filters.province || null,
        city: filters.city || null,
      },
    },
    usage: {
      today: requests.filter(item => item.created_at?.slice(0, 10) === today).length,
      month: requests.length,
      errorRate: requests.length ? Number(((requests.length - successful.length) / requests.length).toFixed(3)) : 0,
      cacheHitRate: null,
      lastSuccessAt: successful[0]?.created_at || null,
      lastFailureAt: requests.find(item => !item.success)?.created_at || null,
    },
  }
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return respond(200, {})
  const admin = getAdmin()
  if (!admin) return respond(500, { success: false, error: 'Server missing map geocoding configuration' })

  try {
    const filters = {
      province: String(event.queryStringParameters?.province || '').trim(),
      city: String(event.queryStringParameters?.city || '').trim(),
    }
    if (event.httpMethod === 'GET') return respond(200, { success: true, data: await getStatus(admin, filters) })
    if (event.httpMethod !== 'POST') return respond(405, { success: false, error: 'Method not allowed' })

    const body = JSON.parse(event.body || '{}')
    if (body.action === 'batch') {
      const limit = Math.min(Math.max(Number(body.limit) || 10, 1), 25)
      const fullAddressOnly = body.fullAddressOnly === true
      const batchFilters = {
        province: String(body.province || '').trim(),
        city: String(body.city || '').trim(),
      }
      let pendingQuery = admin
        .from('customers')
        .select('id, address, postal_code, city, province, geocoding_attempts')
        .in('geocoding_status', ['pending', 'failed', 'manual_review'])
        .or('latitude.is.null,longitude.is.null')
        .or('geocoding_attempts.lt.3,geocoding_status.eq.manual_review')
        .order('updated_at', { ascending: true })
      if (batchFilters.province) pendingQuery = pendingQuery.eq('province', batchFilters.province)
      if (batchFilters.city) pendingQuery = pendingQuery.eq('city', batchFilters.city)
      const { data: pending, error } = await pendingQuery
      if (error) throw error

      const batch = (pending || [])
        .filter(customer => !fullAddressOnly || hasCompleteAddress(customer))
        .slice(0, limit)
      const results = []
      for (const customer of batch) {
        results.push(await geocodeCustomer(admin, customer))
        await new Promise(resolve => setTimeout(resolve, getMapProviderConfig().geocodingIntervalMs))
      }
      return respond(200, {
        success: true,
        data: {
          processed: results.length,
          fullAddressOnly,
          results,
          status: await getStatus(admin, batchFilters),
        },
      })
    }

    if (typeof body.address !== 'string' || !body.address.trim()) {
      return respond(400, { success: false, error: 'Missing address' })
    }
    const results = await searchNominatim(body.address.trim())
    return respond(200, { success: true, data: results[0] || null, results })
  } catch (error) {
    return respond(500, { success: false, error: error?.message || 'Unexpected geocoding error' })
  }
}
