import type { DistanceAwareCity, DistanceAwareClient, MapCoordinates } from './visitsMapUtils'

export type RouteTimeStatus = 'pending' | 'ready' | 'unavailable'

export type RouteTimeEntry = {
  minutes: number | null
  status: RouteTimeStatus
  cacheKey: string
}

const routeTimeCache = new Map<string, RouteTimeEntry>()

export const buildRouteCacheKey = (
  userLocation: MapCoordinates,
  destination: MapCoordinates
) =>
  `${userLocation.lat.toFixed(5)},${userLocation.lng.toFixed(5)}>${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}`

export const getRouteTimeFromUserToClient = async (
  userLocation: MapCoordinates,
  client: Pick<DistanceAwareClient, 'id' | 'lat' | 'lng' | 'hasExactCoords'>
) => {
  if (!client.hasExactCoords || client.lat === null || client.lng === null) {
    return {
      minutes: null,
      status: 'unavailable' as const,
      cacheKey: '',
    }
  }

  const cacheKey = buildRouteCacheKey(userLocation, { lat: client.lat, lng: client.lng })
  const cached = routeTimeCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const response = await fetch('/.netlify/functions/route-time', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: userLocation,
      to: { lat: client.lat, lng: client.lng },
    }),
  })

  if (!response.ok) {
    const fallback = { minutes: null, status: 'unavailable' as const, cacheKey }
    routeTimeCache.set(cacheKey, fallback)
    return fallback
  }

  const payload = await response.json()
  const minutes =
    payload?.success && Number.isFinite(payload?.data?.durationMinutes)
      ? Number(payload.data.durationMinutes)
      : null

  const entry = {
    minutes,
    status: minutes === null ? ('unavailable' as const) : ('ready' as const),
    cacheKey,
  }
  routeTimeCache.set(cacheKey, entry)
  return entry
}

export const getRouteSummaryForCity = (
  userLocation: MapCoordinates,
  city: DistanceAwareCity,
  routeTimeByClientId: Record<string, RouteTimeEntry>
) => {
  if (!city.nearestClientIdFromUser) {
    return { minutes: null, status: 'unavailable' as const }
  }

  const fromCache = routeTimeByClientId[city.nearestClientIdFromUser]
  if (fromCache) {
    return {
      minutes: fromCache.minutes,
      status: fromCache.status,
    }
  }

  const nearestClient = city.clients.find(client => client.id === city.nearestClientIdFromUser)
  if (!nearestClient || !nearestClient.hasExactCoords || nearestClient.lat === null || nearestClient.lng === null) {
    return { minutes: null, status: 'unavailable' as const }
  }

  const cacheKey = buildRouteCacheKey(userLocation, { lat: nearestClient.lat, lng: nearestClient.lng })
  const cached = routeTimeCache.get(cacheKey)
  return cached
    ? { minutes: cached.minutes, status: cached.status }
    : { minutes: null, status: 'unavailable' as const }
}

export const primePendingRouteTimes = (
  clientIds: string[],
  routeTimeByClientId: Record<string, RouteTimeEntry>,
  userLocation: MapCoordinates
) => {
  const updates: Record<string, RouteTimeEntry> = {}
  for (const clientId of clientIds) {
    if (routeTimeByClientId[clientId]) continue
    updates[clientId] = {
      minutes: null,
      status: 'pending',
      cacheKey: `${userLocation.lat.toFixed(5)},${userLocation.lng.toFixed(5)}>${clientId}`,
    }
  }
  return updates
}
