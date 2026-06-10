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
  distanceUnavailableReason: string | null
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
) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return unavailableLabel
  }
  return `${value.toFixed(1)} km`
}

export const formatDistanceAndTime = (
  distanceKm: number | null,
  travelTimeMinutes: number | null,
  status: 'pending' | 'ready' | 'unavailable' = 'unavailable',
  unavailableLabel = 'Distancia no disponible'
) => {
  // 防呆：檢查距離是否有效
  if (distanceKm === null || distanceKm === undefined || !Number.isFinite(distanceKm)) {
    return unavailableLabel
  }
  
  // 如果有路線時間（來自 OSRM API）
  if (status === 'ready' && travelTimeMinutes !== null && Number.isFinite(travelTimeMinutes)) {
    return `${distanceKm.toFixed(1)} km · ${Math.round(travelTimeMinutes)} min`
  }
  
  // 正在計算路線時間
  if (status === 'pending') {
    return `${distanceKm.toFixed(1)} km · calculando...`
  }
  
  // 只有直線距離（Haversine），無法取得路線時間
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
  // 防呆：檢查使用者位置是否有效
  if (!userLocation) {
    return null
  }
  
  // 防呆：檢查使用者座標是否為有效數字
  if (!Number.isFinite(userLocation.lat) || !Number.isFinite(userLocation.lng)) {
    return null
  }
  
  // 防呆：檢查客戶座標是否存在且有效
  if (!client.hasExactCoords || client.lat === null || client.lng === null) {
    return null
  }
  
  // 防呆：檢查客戶座標是否為有效數字（防止 NaN、Infinity）
  if (!Number.isFinite(client.lat) || !Number.isFinite(client.lng)) {
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
  if (distanceKm !== null && Number.isFinite(distanceKm)) {
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
  
  // 防呆：驗證 correctedLat/Lng 是有效數字
  const exactCoords =
    audit.hasExactCoords &&
    audit.correctedLat !== null &&
    audit.correctedLng !== null &&
    Number.isFinite(audit.correctedLat) &&
    Number.isFinite(audit.correctedLng)
      ? { lat: audit.correctedLat, lng: audit.correctedLng }
      : null

  // Use exact coords when available, fall back to markerCoords (approximate markers with offset)
  const distanceCoords = exactCoords ?? audit.markerCoords
  
  // 防呆：確保 distanceCoords 的座標是有效數字
  const validDistanceCoords = distanceCoords && 
    Number.isFinite(distanceCoords.lat) && 
    Number.isFinite(distanceCoords.lng)
    ? distanceCoords
    : null
  
  const distanceFromUser = getClientDistanceFromUser(
    {
      hasExactCoords: Boolean(validDistanceCoords),
      lat: validDistanceCoords?.lat ?? null,
      lng: validDistanceCoords?.lng ?? null,
    },
    activeOrigin.coords
  )
  const travelTime = routeTimeByClientId?.[customer.id]
  
  // 判斷距離不可用的原因
  let distanceUnavailableReason: string | null = null
  if (distanceFromUser === null) {
    if (audit.geocodeStatus === 'invalid') {
      distanceUnavailableReason = 'Sin coordenadas válidas'
    } else if (audit.geocodeStatus === 'sea_suspect') {
      distanceUnavailableReason = 'Ubicación en zona de mar'
    } else if (!validDistanceCoords) {
      distanceUnavailableReason = 'Coordenadas no disponibles'
    } else if (!Number.isFinite(validDistanceCoords.lat) || !Number.isFinite(validDistanceCoords.lng)) {
      distanceUnavailableReason = 'Coordenadas inválidas'
    } else {
      distanceUnavailableReason = 'Error al calcular distancia'
    }
  }

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
    distanceUnavailableReason,
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
  // Use exact coords, fall back to markerCoords for approximate markers
  const clientCoords = client.lat !== null && client.lng !== null
    ? { lat: client.lat, lng: client.lng }
    : client.markerCoords
  if (!clientCoords) return null

  let nearest: NearestClientMatch | null = null

  for (const candidate of cityClients) {
    if (candidate.id === client.id) continue

    const candidateCoords = candidate.lat !== null && candidate.lng !== null
      ? { lat: candidate.lat, lng: candidate.lng }
      : candidate.markerCoords
    if (!candidateCoords) continue

    const distanceKm = withOneDecimal(
      calculateDistanceKm(clientCoords.lat, clientCoords.lng, candidateCoords.lat, candidateCoords.lng)
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

  // Use city centroid as primary source to ensure city marker aligns with approximate clients
  const cityCentroid = getFallbackCityCoordinates(city, province)

  const coords =
    cityCentroid
      ? cityCentroid
      : exactMarkerCoords.length > 0
        ? averageCoordinates(exactMarkerCoords)
        : null

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
    | 'distanceUnavailableReason'
    | 'travelTimeMinutes'
    | 'travelTimeStatus'
    | 'nearestNeighborDistanceInCity'
    | 'phone'
    | 'geocodeStatus'
  >,
  userLocation: MapCoordinates | null
) => {
  const userDistanceLine = userLocation && client.distanceFromUser !== null
    ? `<div>Distancia desde mi ubicación: ${formatDistanceAndTime(client.distanceFromUser, client.travelTimeMinutes, client.travelTimeStatus)}</div>`
    : `<div>Distancia desde mi ubicación: <span style="color:#d97706">${client.distanceUnavailableReason || 'Distancia no disponible'}</span></div>`
  const neighborLine =
    client.nearestNeighborDistanceInCity === null
      ? '<div>Cliente más cercano: Distancia no disponible</div>'
      : `<div>Cliente más cercano: ${formatDistanceKm(client.nearestNeighborDistanceInCity)}</div>`
  const approximateLine =
    client.geocodeStatus === 'approximate'
      ? '<div style="color:#d97706">Ubicación aproximada</div><div style="color:#d97706">Dirección pendiente de validación</div>'
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
