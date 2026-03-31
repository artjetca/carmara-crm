const CACHE_TTL_MS = 30 * 60 * 1000
const routeCache = new Map()

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

    const url = new URL(
      `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}`
    )
    url.searchParams.set('overview', 'false')
    url.searchParams.set('alternatives', 'false')
    url.searchParams.set('steps', 'false')

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'CASMARA-CRM/1.0',
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      return respond(502, { success: false, error: `Routing service failed with ${response.status}` })
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
      durationMinutes: Math.round(route.duration / 60),
      distanceKm: Number((route.distance / 1000).toFixed(1)),
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
