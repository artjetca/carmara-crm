import type { Customer } from '../../lib/supabase'
import {
  calculateDistanceKm as calculateGeodesicDistanceKm,
  getCityCenterCoordinates,
  getCoordinateAuditForClient,
  type ClientCoordinateAudit,
  type GeocodeStatus,
  type MapCoordinates,
} from './visitsGeocodeUtils'

export type { MapCoordinates } from './visitsGeocodeUtils'

export type DistanceOrigin = {
  name: string
  coords: MapCoordinates
}

export type DistanceAwareClient = {
  id: string
  name: string
  address: string
  phone: string
  city: string
  province: string
  lat: number | null
  lng: number | null
  distanceFromUser: number | null
  distanceFromUserKm: number | null
  nearestNeighborDistanceInCity: number | null
  nearestNeighborClientId: string | null
  travelTimeMinutes: number | null
  travelTimeStatus: 'pending' | 'ready' | 'unavailable'
  markerCoords: MapCoordinates | null
  hasExactCoords: boolean
  usesApproximateMarker: boolean
  geocodeStatus: GeocodeStatus
  geocodeReason: string
  originalLat: number | null
  originalLng: number | null
  correctedLat: number | null
  correctedLng: number | null
  requiresManualReview: boolean
  sourceCustomer: Customer
}

export type DistanceAwareCity = {
  city: string
  province: string
  clientCount: number
  nearestDistanceFromUser: number | null
  nearestDistanceFromUserKm: number | null
  nearestTravelTimeMinutes: number | null
  coords: MapCoordinates | null
  clients: DistanceAwareClient[]
  hasReachableClient: boolean
  nearestClientIdFromUser: string | null
}

export type DistanceViewModel = {
  origin: DistanceOrigin
  cities: DistanceAwareCity[]
  clients: DistanceAwareClient[]
}

export type CityDistanceInput = {
  city: string
  province: string
  clients: DistanceAwareClient[]
}

export type RefreshDistanceParams = {
  customers: Customer[]
  coordsById: Record<string, ClientCoordinateAudit | MapCoordinates>
  activeOrigin: DistanceOrigin
  routeTimeByClientId?: Record<string, { minutes: number | null; status: 'pending' | 'ready' | 'unavailable' }>
}

export type NearestClientMatch = {
  clientId: string
  distanceKm: number | null
}

export const JEREZ_ORIGIN: DistanceOrigin = {
  name: 'Jerez de la Frontera',
  coords: { lat: 36.6867, lng: -6.1371 },
}

const SUPPORTED_PROVINCES = new Set(['Cádiz', 'Huelva'])

const normalizeForComparison = (value?: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const createCityKey = (city: string, province: string) =>
  `${normalizeForComparison(city)}|${normalizeForComparison(province)}`

export const isProvinceName = (value?: string) => {
  const normalized = normalizeForComparison(value)
  return normalized === 'huelva' || normalized === 'cadiz' || normalized === 'ceuta'
}

export const toCanonicalProvince = (value?: string) => {
  const normalized = normalizeForComparison(value)
  if (normalized === 'huelva') return 'Huelva'
  if (normalized === 'cadiz') return 'Cádiz'
  if (normalized === 'ceuta') return 'Ceuta'
  return ''
}

const extractFromNotes = (notes: string | undefined, label: 'Ciudad' | 'Provincia') => {
  if (!notes) return ''
  const match = notes.match(new RegExp(`${label}:\\s*([^\\n]+)`, 'i'))
  return match ? match[1].trim() : ''
}

export const deriveProvince = (customer?: Customer) => {
  if (!customer) return ''

  const direct = toCanonicalProvince(customer.province)
  if (direct) return direct

  const fromNotes = toCanonicalProvince(extractFromNotes(customer.notes, 'Provincia'))
  if (fromNotes) return fromNotes

  if (isProvinceName(customer.city)) {
    return toCanonicalProvince(customer.city)
  }

  return ''
}

export const deriveCity = (customer?: Customer) => {
  if (!customer) return ''

  const fromNotes = extractFromNotes(customer.notes, 'Ciudad')
  if (fromNotes) return fromNotes

  const city = String(customer.city || '').trim()
  if (!city) return ''

  if (isProvinceName(city)) {
    const canonicalCity = toCanonicalProvince(city)
    const canonicalProvince = deriveProvince(customer)
    return canonicalCity && canonicalCity === canonicalProvince ? canonicalCity : canonicalCity
  }

  return city
}

export const getCustomerDisplayAddress = (customer: Customer) => {
  const city = deriveCity(customer)
  const province = deriveProvince(customer)
  return [customer.address || '', city, province && province !== city ? province : '', 'España']
    .filter(Boolean)
    .join(', ')
}

export const getCustomerPhone = (customer: Customer) => {
  const phone = customer.mobile_phone || customer.phone || ''
  return String(phone).replace(/\s+/g, '')
}

export const getFallbackCityCoordinates = (city: string, province: string) =>
  getCityCenterCoordinates(city, province)

export const calculateDistanceKm = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) => calculateGeodesicDistanceKm(lat1, lng1, lat2, lng2)

export const formatDistanceKm = (
  value: number | null,
  unavailableLabel = 'Distancia no disponible'
) => (value === null ? unavailableLabel : `${value.toFixed(1)} km`)

export const formatDistanceAndTime = (
  distanceKm: number | null,
  travelTimeMinutes: number | null,
  status: 'pending' | 'ready' | 'unavailable' = 'unavailable',
  unavailableLabel = 'Distancia no disponible'
) => {
  if (distanceKm === null) return unavailableLabel
  if (status === 'ready' && travelTimeMinutes !== null) {
    return `${distanceKm.toFixed(1)} km · ${Math.round(travelTimeMinutes)} min`
  }
  if (status === 'pending') {
    return `${distanceKm.toFixed(1)} km · calculando...`
  }
  return `${distanceKm.toFixed(1)} km`
}

export const getUserLocation = async (): Promise<MapCoordinates> => {
  if (!navigator.geolocation) {
    throw new Error('Geolocation unavailable')
  }

  return await new Promise<MapCoordinates>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      position => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      error => reject(error),
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 300000 }
    )
  })
}

const withOneDecimal = (value: number | null) => {
  if (value === null) return null
  return Number(value.toFixed(1))
}

const distanceMemo = new Map<string, number>()

export const getClientDistanceFromUser = (
  client: Pick<DistanceAwareClient, 'hasExactCoords' | 'lat' | 'lng'>,
  userLocation: MapCoordinates | null
) => {
  if (!userLocation || !client.hasExactCoords || client.lat === null || client.lng === null) {
    return null
  }

  const cacheKey = `${userLocation.lat.toFixed(5)},${userLocation.lng.toFixed(5)}>${client.lat.toFixed(5)},${client.lng.toFixed(5)}`
  const cached = distanceMemo.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  const distanceKm = withOneDecimal(
    calculateDistanceKm(userLocation.lat, userLocation.lng, client.lat, client.lng)
  )
  if (distanceKm !== null) {
    distanceMemo.set(cacheKey, distanceKm)
  }
  return distanceKm
}

const averageCoordinates = (coords: MapCoordinates[]) => ({
  lat: coords.reduce((sum, entry) => sum + entry.lat, 0) / coords.length,
  lng: coords.reduce((sum, entry) => sum + entry.lng, 0) / coords.length,
})

const buildDistanceAwareClient = (
  customer: Customer,
  coordsById: Record<string, ClientCoordinateAudit | MapCoordinates>,
  activeOrigin: DistanceOrigin,
  routeTimeByClientId: RefreshDistanceParams['routeTimeByClientId'] = {}
): DistanceAwareClient | null => {
  const city = deriveCity(customer)
  const province = deriveProvince(customer)

  if (!SUPPORTED_PROVINCES.has(province) || !city) {
    return null
  }

  const audit = getCoordinateAuditForClient(customer, coordsById[customer.id])
  const exactCoords =
    audit.hasExactCoords &&
    audit.correctedLat !== null &&
    audit.correctedLng !== null
      ? { lat: audit.correctedLat, lng: audit.correctedLng }
      : null

  const distanceFromUser = getClientDistanceFromUser(
    {
      hasExactCoords: Boolean(exactCoords),
      lat: exactCoords?.lat ?? null,
      lng: exactCoords?.lng ?? null,
    },
    activeOrigin.coords
  )
  const travelTime = routeTimeByClientId?.[customer.id]

  return {
    id: customer.id,
    name: customer.name || 'Sin nombre',
    address: getCustomerDisplayAddress(customer),
    phone: getCustomerPhone(customer),
    city,
    province,
    lat: exactCoords?.lat ?? null,
    lng: exactCoords?.lng ?? null,
    distanceFromUser,
    distanceFromUserKm: distanceFromUser,
    nearestNeighborDistanceInCity: null,
    nearestNeighborClientId: null,
    travelTimeMinutes: travelTime?.minutes ?? null,
    travelTimeStatus: travelTime?.status ?? 'unavailable',
    markerCoords: audit.geocodeStatus === 'invalid' || audit.geocodeStatus === 'sea_suspect'
      ? null
      : audit.markerCoords,
    hasExactCoords: audit.hasExactCoords,
    usesApproximateMarker: audit.usesApproximateMarker,
    geocodeStatus: audit.geocodeStatus,
    geocodeReason: audit.geocodeReason,
    originalLat: audit.originalLat,
    originalLng: audit.originalLng,
    correctedLat: audit.correctedLat,
    correctedLng: audit.correctedLng,
    requiresManualReview: audit.geocodeStatus !== 'valid',
    sourceCustomer: customer,
  }
}

export const getNearestClientInCity = (
  client: DistanceAwareClient,
  cityClients: DistanceAwareClient[]
): NearestClientMatch | null => {
  if (!client.hasExactCoords || client.lat === null || client.lng === null) {
    return null
  }

  let nearest: NearestClientMatch | null = null

  for (const candidate of cityClients) {
    if (
      candidate.id === client.id ||
      !candidate.hasExactCoords ||
      candidate.lat === null ||
      candidate.lng === null
    ) {
      continue
    }

    const distanceKm = withOneDecimal(
      calculateDistanceKm(client.lat, client.lng, candidate.lat, candidate.lng)
    )

    if (!nearest || (distanceKm !== null && distanceKm < (nearest.distanceKm ?? Infinity))) {
      nearest = {
        clientId: candidate.id,
        distanceKm,
      }
    }
  }

  return nearest
}

export const sortClientsByDistance = (clients: DistanceAwareClient[]) => {
  return [...clients].sort((left, right) => {
    if (left.distanceFromUser === null && right.distanceFromUser === null) {
      return left.name.localeCompare(right.name, 'es')
    }
    if (left.distanceFromUser === null) return 1
    if (right.distanceFromUser === null) return -1
    if (left.distanceFromUser !== right.distanceFromUser) {
      return left.distanceFromUser - right.distanceFromUser
    }
    return left.name.localeCompare(right.name, 'es')
  })
}

export const buildCityDistanceSummary = ({
  city,
  province,
  clients,
}: CityDistanceInput): DistanceAwareCity => {
  const reachableDistances = clients
    .map(client => client.distanceFromUser)
    .filter((distance): distance is number => distance !== null)

  const exactMarkerCoords = clients
    .filter(client => client.hasExactCoords && client.lat !== null && client.lng !== null)
    .map(client => ({ lat: client.lat as number, lng: client.lng as number }))

  const fallbackMarkers = clients
    .filter(client => client.markerCoords)
    .map(client => client.markerCoords as MapCoordinates)

  const coords =
    exactMarkerCoords.length > 0
      ? averageCoordinates(exactMarkerCoords)
      : fallbackMarkers.length > 0
        ? averageCoordinates(fallbackMarkers)
        : getFallbackCityCoordinates(city, province)

  const nearestClient =
    sortClientsByDistance(clients).find(client => client.distanceFromUser !== null) ?? null

  return {
    city,
    province,
    clientCount: clients.length,
    nearestDistanceFromUser:
      reachableDistances.length > 0 ? Math.min(...reachableDistances) : null,
    nearestDistanceFromUserKm:
      reachableDistances.length > 0 ? Math.min(...reachableDistances) : null,
    nearestTravelTimeMinutes: nearestClient?.travelTimeMinutes ?? null,
    coords,
    clients: sortClientsByDistance(clients),
    hasReachableClient: reachableDistances.length > 0,
    nearestClientIdFromUser: nearestClient?.id ?? null,
  }
}

export const buildClientPopupHtml = (
  client: Pick<
    DistanceAwareClient,
    | 'name'
    | 'address'
      | 'distanceFromUser'
      | 'travelTimeMinutes'
      | 'travelTimeStatus'
      | 'nearestNeighborDistanceInCity'
      | 'phone'
      | 'geocodeStatus'
  >,
  userLocation: MapCoordinates | null
) => {
  const userDistanceLine = userLocation
    ? `<div>Distancia desde mi ubicación: ${formatDistanceAndTime(client.distanceFromUser, client.travelTimeMinutes, client.travelTimeStatus)}</div>`
    : '<div>Distancia desde mi ubicación: Distancia no disponible</div>'
  const neighborLine =
    client.nearestNeighborDistanceInCity === null
      ? '<div>Cliente más cercano: Distancia no disponible</div>'
      : `<div>Cliente más cercano: ${formatDistanceKm(client.nearestNeighborDistanceInCity)}</div>`
  const approximateLine =
    client.geocodeStatus === 'approximate'
      ? '<div>Ubicación aproximada</div><div>Dirección pendiente de validación</div>'
      : ''

  return `
    <div>
      <div><strong>${client.name}</strong></div>
      <div>${client.address}</div>
      ${userDistanceLine}
      ${neighborLine}
      ${approximateLine}
      ${client.phone ? `<div>${client.phone}</div>` : ''}
    </div>
  `.trim()
}

export const sortCitiesByDistance = (cities: DistanceAwareCity[]) => {
  return [...cities].sort((left, right) => {
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
}

export const refreshMapAndSidebarDistances = ({
  customers,
  coordsById,
  activeOrigin,
  routeTimeByClientId,
}: RefreshDistanceParams): DistanceViewModel => {
  const grouped = new Map<string, DistanceAwareClient[]>()

  for (const customer of customers) {
    const distanceAwareClient = buildDistanceAwareClient(
      customer,
      coordsById,
      activeOrigin,
      routeTimeByClientId
    )
    if (!distanceAwareClient) continue

    const key = createCityKey(distanceAwareClient.city, distanceAwareClient.province)
    const clients = grouped.get(key)

    if (clients) {
      clients.push(distanceAwareClient)
      continue
    }

    grouped.set(key, [distanceAwareClient])
  }

  const cities = sortCitiesByDistance(
    Array.from(grouped.values()).map(cityClients => {
      const withNeighborDistances = cityClients.map(client => {
        const nearest = getNearestClientInCity(client, cityClients)
        return {
          ...client,
          nearestNeighborDistanceInCity: nearest?.distanceKm ?? null,
          nearestNeighborClientId: nearest?.clientId ?? null,
        }
      })

      return buildCityDistanceSummary({
        city: withNeighborDistances[0]?.city || '',
        province: withNeighborDistances[0]?.province || '',
        clients: withNeighborDistances,
      })
    })
  )

  return {
    origin: activeOrigin,
    cities,
    clients: cities.flatMap(city => city.clients),
  }
}

export const buildVisitsCityGroups = (
  customers: Customer[],
  coordsById: Record<string, ClientCoordinateAudit | MapCoordinates>,
  origin = JEREZ_ORIGIN
) => {
  return refreshMapAndSidebarDistances({
    customers,
    coordsById,
    activeOrigin: origin,
  }).cities.map(city => ({
    city: city.city,
    province: city.province,
    customers: city.clients.map(client => client.sourceCustomer),
    coords: city.coords ?? getFallbackCityCoordinates(city.city, city.province) ?? origin.coords,
    distanceKm: city.nearestDistanceFromUser ?? 0,
    origin,
  }))
}
