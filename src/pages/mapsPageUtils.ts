import type { Customer } from '../lib/supabase'
import type {
  ClientCoordinateAudit,
  GeocodeStatus,
  MapCoordinates,
} from '../components/communications/visitsGeocodeUtils'
import {
  calculateDistanceKm,
  formatDistanceKm,
  getClientDistanceFromUser,
} from '../components/communications/visitsMapUtils'

export type ResolvedMapClient = {
  id: string
  name: string
  company?: string
  email?: string
  address: string
  city: string
  province: string
  phone: string
  originalLat: number | null
  originalLng: number | null
  correctedLat: number | null
  correctedLng: number | null
  finalLat: number | null
  finalLng: number | null
  geocodeStatus: GeocodeStatus
  geocodeReason: string
  distanceFromUser: number | null
  nearestNeighborDistanceInCity: number | null
  nearestNeighborClientId: string | null
  sourceCustomer: Customer
}

export type CityDistanceSummary = {
  city: string
  province: string
  clientCount: number
  nearestDistanceFromUser: number | null
  clients: ResolvedMapClient[]
}

export const isValidClient = (client: unknown): client is ResolvedMapClient =>
  typeof client === 'object' && client !== null

export const sanitizeClients = (clients: unknown) => {
  if (!Array.isArray(clients)) return [] as ResolvedMapClient[]

  const invalidRows = clients
    .map((client, index) => ({
      index,
      raw: client,
      reason:
        client === null
          ? 'null'
          : client === undefined
            ? 'undefined'
            : typeof client !== 'object'
              ? `invalid type: ${typeof client}`
              : '',
    }))
    .filter(entry => entry.reason)

  if (invalidRows.length > 0) {
    console.table(invalidRows)
  }

  return clients.filter((client): client is ResolvedMapClient => isValidClient(client))
}

export const hasRenderableCoordinates = (
  client: unknown
): client is ResolvedMapClient & { finalLat: number; finalLng: number } => {
  if (!isValidClient(client)) return false

  return (
    client.geocodeStatus !== 'invalid' &&
    client.geocodeStatus !== 'sea_suspect' &&
    Number.isFinite(client.finalLat) &&
    Number.isFinite(client.finalLng)
  )
}

export const getClientRenderableCoordinates = (client: unknown): MapCoordinates | null => {
  if (!hasRenderableCoordinates(client)) return null
  return { lat: client.finalLat, lng: client.finalLng }
}

export const getNearestClientInCity = (client: unknown, cityClients: unknown) => {
  if (!hasRenderableCoordinates(client)) return null

  const sanitizedCityClients = sanitizeClients(cityClients)
  const validCandidates = sanitizedCityClients.filter(
    candidate => candidate.id !== client.id && hasRenderableCoordinates(candidate)
  )

  if (validCandidates.length === 0) return null

  let nearest: { client: ResolvedMapClient; distanceKm: number } | null = null

  const clientCoords = getClientRenderableCoordinates(client)
  if (!clientCoords) return null

  for (const candidate of validCandidates) {
    const candidateCoords = getClientRenderableCoordinates(candidate)
    if (!candidateCoords) continue

    const distanceKm = Number(
      calculateDistanceKm(
        clientCoords.lat,
        clientCoords.lng,
        candidateCoords.lat,
        candidateCoords.lng
      ).toFixed(1)
    )

    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { client: candidate, distanceKm }
    }
  }

  return nearest
}

export const buildCityDistanceSummary = (
  cityClients: unknown,
  userLocation: MapCoordinates | null
): CityDistanceSummary | null => {
  const sanitizedCityClients = sanitizeClients(cityClients)
  if (sanitizedCityClients.length === 0) return null

  const invalidCount = Array.isArray(cityClients) ? cityClients.length - sanitizedCityClients.length : 0
  if (invalidCount > 0) {
    console.warn('[MAP_CITY_SUMMARY] invalid items removed from city group', {
      city: sanitizedCityClients[0]?.city || 'unknown',
      invalidCount,
    })
  }

  const clients = sanitizedCityClients.map(client => {
    const coords = getClientRenderableCoordinates(client)
    return {
      ...client,
      distanceFromUser: getClientDistanceFromUser(
        {
          hasExactCoords: Boolean(coords),
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
        },
        userLocation
      ),
    }
  })

  const withNeighbors = clients.map(client => {
    const nearest = getNearestClientInCity(client, clients)
    return {
      ...client,
      nearestNeighborDistanceInCity: nearest?.distanceKm ?? null,
      nearestNeighborClientId: nearest?.client.id ?? null,
    }
  })

  const nearestDistanceFromUser =
    withNeighbors
      .map(client => client.distanceFromUser)
      .filter((value): value is number => value !== null)
      .sort((left, right) => left - right)[0] ?? null

  return {
    city: withNeighbors[0]?.city || 'Sin ciudad',
    province: withNeighbors[0]?.province || 'Sin provincia',
    clientCount: withNeighbors.length,
    nearestDistanceFromUser,
    clients: withNeighbors,
  }
}

export const refreshMapAndSidebarDistances = (
  clients: unknown,
  userLocation: MapCoordinates | null
) => {
  const sanitized = sanitizeClients(clients)
  const grouped = new Map<string, ResolvedMapClient[]>()

  for (const client of sanitized) {
    const key = `${client.province}|${client.city}`
    const bucket = grouped.get(key)
    if (bucket) {
      bucket.push(client)
    } else {
      grouped.set(key, [client])
    }
  }

  const citySummaries = Array.from(grouped.values())
    .map(group => buildCityDistanceSummary(group, userLocation))
    .filter((group): group is CityDistanceSummary => Boolean(group))
    .sort((left, right) => {
      if (left.nearestDistanceFromUser === null && right.nearestDistanceFromUser === null) {
        return left.city.localeCompare(right.city, 'es')
      }
      if (left.nearestDistanceFromUser === null) return 1
      if (right.nearestDistanceFromUser === null) return -1
      if (left.nearestDistanceFromUser !== right.nearestDistanceFromUser) {
        return left.nearestDistanceFromUser - right.nearestDistanceFromUser
      }
      return left.city.localeCompare(right.city, 'es')
    })

  return {
    clients: citySummaries.flatMap(city => sanitizeClients(city.clients)),
    cities: citySummaries,
  }
}

export const buildClientPopupHtml = (
  client: Partial<
    Pick<
      ResolvedMapClient,
      | 'name'
      | 'address'
      | 'phone'
      | 'distanceFromUser'
      | 'nearestNeighborDistanceInCity'
      | 'geocodeStatus'
    >
  >,
  userLocation: MapCoordinates | null
) => {
  const locationLine = userLocation
    ? `Distancia desde mi ubicación: ${formatDistanceKm(client.distanceFromUser ?? null, 'Distancia no disponible')}`
    : 'Distancia desde mi ubicación: Distancia no disponible'
  const neighborLine = `Cliente más cercano: ${formatDistanceKm(
    client.nearestNeighborDistanceInCity ?? null,
    'Distancia no disponible'
  )}`

  return [
    client.name || 'Sin nombre',
    client.address || 'Dirección no disponible',
    locationLine,
    neighborLine,
    client.geocodeStatus === 'approximate'
      ? 'Ubicación aproximada. Dirección pendiente de validación.'
      : '',
    client.phone || '',
  ]
    .filter(Boolean)
    .join('\n')
}

export const buildResolvedMapClient = (
  customer: Customer,
  audit: ClientCoordinateAudit,
  address: string,
  city: string,
  province: string,
  phone: string
): ResolvedMapClient => {
  // Prefer markerCoords (includes offset for approximate markers) over correctedLat/Lng
  // (which is the raw city center without offset, causing all approximate markers to overlap)
  const finalLat = audit.markerCoords?.lat
    ?? (typeof audit.correctedLat === 'number' ? audit.correctedLat : null)
  const finalLng = audit.markerCoords?.lng
    ?? (typeof audit.correctedLng === 'number' ? audit.correctedLng : null)

  return {
    id: customer.id,
    name: customer.name || 'Sin nombre',
    company: customer.company,
    email: customer.email,
    address,
    city,
    province,
    phone,
    originalLat: audit.originalLat,
    originalLng: audit.originalLng,
    correctedLat: audit.correctedLat,
    correctedLng: audit.correctedLng,
    finalLat,
    finalLng,
    geocodeStatus: audit.geocodeStatus,
    geocodeReason: audit.geocodeReason,
    distanceFromUser: null,
    nearestNeighborDistanceInCity: null,
    nearestNeighborClientId: null,
    sourceCustomer: customer,
  }
}
