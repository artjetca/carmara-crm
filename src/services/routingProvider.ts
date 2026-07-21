import { calculateDistanceKm } from '../components/communications/visitsMapUtils'
import type { MapCoordinates } from '../components/communications/visitsGeocodeUtils'

const ROUTE_CACHE_TTL_MS = 30 * 60 * 1000

export type RoutePoint = {
  type: 'current-location' | 'customer' | 'map-point'
  id?: string
  name: string
  latitude: number
  longitude: number
}

export type RouteResult = {
  straightLineKm: number
  distanceKm: number | null
  durationMinutes: number | null
  geometry: [number, number][] | null
  createdAt: number
}

export interface RoutingProvider {
  calculateRoute(origin: RoutePoint, destination: RoutePoint, signal?: AbortSignal): Promise<RouteResult>
}

type CachedRoute = { result: RouteResult; createdAt: number }

const routeCache = new Map<string, CachedRoute>()

export const buildRouteCacheKey = (origin: RoutePoint, destination: RoutePoint) =>
  `${origin.latitude.toFixed(5)},${origin.longitude.toFixed(5)}:${destination.latitude.toFixed(5)},${destination.longitude.toFixed(5)}:driving`

export const formatRouteDistance = (distanceKm: number | null) => {
  if (distanceKm === null || !Number.isFinite(distanceKm)) return 'No disponible'
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`
  return `${distanceKm.toFixed(1).replace('.', ',')} km`
}

export const formatRouteDuration = (durationMinutes: number | null) => {
  if (durationMinutes === null || !Number.isFinite(durationMinutes)) return 'No disponible'
  if (durationMinutes < 60) return `${Math.round(durationMinutes)} min`
  const hours = Math.floor(durationMinutes / 60)
  const minutes = Math.round(durationMinutes % 60)
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`
}

export class OsrmRoutingProvider implements RoutingProvider {
  async calculateRoute(origin: RoutePoint, destination: RoutePoint, signal?: AbortSignal): Promise<RouteResult> {
    const straightLineKm = calculateDistanceKm(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude
    )
    const cacheKey = buildRouteCacheKey(origin, destination)
    const cached = routeCache.get(cacheKey)
    if (cached && Date.now() - cached.createdAt < ROUTE_CACHE_TTL_MS) return cached.result

    const response = await fetch('/.netlify/functions/route-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        from: { lat: origin.latitude, lng: origin.longitude },
        to: { lat: destination.latitude, lng: destination.longitude },
      }),
    })

    if (!response.ok) throw new Error('routing-unavailable')

    const payload = await response.json()
    const data = payload?.data
    if (!payload?.success || data?.status !== 'ready') throw new Error('routing-unavailable')

    const geometry = Array.isArray(data.geometry)
      ? data.geometry.filter((point: unknown): point is [number, number] =>
        Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])
      )
      : null
    const result = {
      straightLineKm,
      distanceKm: Number.isFinite(data.distanceKm) ? Number(data.distanceKm) : null,
      durationMinutes: Number.isFinite(data.durationMinutes) ? Number(data.durationMinutes) : null,
      geometry,
      createdAt: Date.now(),
    }
    routeCache.set(cacheKey, { result, createdAt: result.createdAt })
    return result
  }
}

export const routePointFromCoordinates = (
  type: RoutePoint['type'],
  name: string,
  coordinates: MapCoordinates,
  id?: string
): RoutePoint => ({ type, name, id, latitude: coordinates.lat, longitude: coordinates.lng })
