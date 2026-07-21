const CACHE_TTL_MS = 30 * 60 * 1000
const ROUTING_TIMEOUT_MS = 8000
const routeCache = new Map()
const { getMapProviderConfig } = require('./_shared/map-providers')

const respond = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  },
  body: JSON.stringify(body),
})

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    }
  }

  if (event.httpMethod !== 'POST') {
    return respond(405, { success: false, error: 'Method not allowed' })
  }

  try {
    const { from, to } = JSON.parse(event.body || '{}')
    if (
      !from ||
      !to ||
      !Number.isFinite(from.lat) ||
      !Number.isFinite(from.lng) ||
      !Number.isFinite(to.lat) ||
      !Number.isFinite(to.lng)
    ) {
      return respond(400, { success: false, error: 'Missing valid coordinates' })
    }

    const cacheKey = `${from.lat.toFixed(5)},${from.lng.toFixed(5)}>${to.lat.toFixed(5)},${to.lng.toFixed(5)}`
    const cached = routeCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return respond(200, { success: true, data: cached.data })
    }

    const config = getMapProviderConfig()
    if (config.routingProvider !== 'osrm') {
      return respond(200, {
        success: true,
        data: { durationMinutes: null, distanceKm: null, status: 'unavailable' },
      })
    }

    const url = new URL(
      `${config.osrmBaseUrl}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}`
    )
    url.searchParams.set('overview', 'full')
    url.searchParams.set('geometries', 'geojson')
    url.searchParams.set('alternatives', 'false')
    url.searchParams.set('steps', 'false')

    let response
    let lastError
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), ROUTING_TIMEOUT_MS)

      try {
        response = await fetch(url.toString(), {
          headers: {
            'User-Agent': 'CASMARA-CRM/1.0',
            Accept: 'application/json',
          },
          signal: controller.signal,
        })

        if (response.ok || attempt === 1 || response.status < 500) break
      } catch (error) {
        lastError = error
        if (attempt === 1) break
      } finally {
        clearTimeout(timeout)
      }
    }

    if (!response || !response.ok) {
      return respond(502, {
        success: false,
        error: `Routing service failed with ${response?.status || lastError?.name || 'timeout'}`,
      })
    }

    const payload = await response.json()
    const route = Array.isArray(payload?.routes) ? payload.routes[0] : null
    if (!route || !Number.isFinite(route.duration)) {
      return respond(200, {
        success: true,
        data: { durationMinutes: null, distanceKm: null, status: 'unavailable' },
      })
    }

    const data = {
      durationMinutes: Math.ceil(route.duration / 60),
      distanceKm: Number((route.distance / 1000).toFixed(1)),
      geometry: Array.isArray(route.geometry?.coordinates) ? route.geometry.coordinates : null,
      status: 'ready',
    }

    routeCache.set(cacheKey, { ts: Date.now(), data })

    return respond(200, { success: true, data })
  } catch (error) {
    return respond(500, {
      success: false,
      error: error?.message || 'Unexpected routing error',
    })
  }
}
