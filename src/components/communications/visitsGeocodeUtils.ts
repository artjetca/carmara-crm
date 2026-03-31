import type { Customer } from '../../lib/supabase'

export type MapCoordinates = {
  lat: number
  lng: number
}

export type GeocodeStatus = 'valid' | 'approximate' | 'invalid' | 'sea_suspect'

export type GeocodeCandidate = {
  lat: number
  lng: number
  displayName: string
  country?: string
  province?: string
  city?: string
  type?: string
  category?: string
  source?: 'nominatim' | 'google' | 'unknown'
  raw?: unknown
}

export type ClientCoordinateAudit = {
  geocodeStatus: GeocodeStatus
  geocodeReason: string
  originalLat: number | null
  originalLng: number | null
  correctedLat: number | null
  correctedLng: number | null
  markerCoords: MapCoordinates | null
  hasExactCoords: boolean
  usesApproximateMarker: boolean
  normalizedAddress: string
  addressCompleteness: 'full' | 'partial' | 'minimal'
  source: 'original' | 'swapped' | 'geocoded' | 'city_fallback' | 'none'
  addressSignature: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type GeocodeFeatureLike = {
  center?: [number, number]
  geometry?: {
    coordinates?: [number, number]
  }
  properties?: Record<string, unknown>
  place_name?: string
  text?: string
}

type ValidateAndFixOptions = {
  cachedAudit?: ClientCoordinateAudit | MapCoordinates | null
  geocodeFetcher: (address: string) => Promise<GeocodeCandidate[]>
}

type GeocodeQueryPlan = {
  query: string
  tier: 1 | 2 | 3 | 4
  approximate: boolean
  precisionRisk: boolean
}

type CoordinateCheck =
  | {
      ok: true
      coords: MapCoordinates
      source: 'original' | 'swapped' | 'geocoded'
      reason: string
    }
  | {
      ok: false
      status: GeocodeStatus
      reason: string
    }

type Bounds = {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

const SERVICE_AREA: Bounds = {
  minLat: 35.5,
  maxLat: 38.9,
  minLng: -8.5,
  maxLng: -4.5,
}

const OPEN_WATER_ZONES: Bounds[] = [
  { minLat: 36.46, maxLat: 36.57, minLng: -6.43, maxLng: -6.305 },
  { minLat: 37.02, maxLat: 37.2, minLng: -7.42, maxLng: -7.18 },
  { minLat: 35.98, maxLat: 36.11, minLng: -5.56, maxLng: -5.38 },
]

const normalizeForComparison = (value?: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

const createCityKey = (city: string, province: string) =>
  `${normalizeForComparison(city)}|${normalizeForComparison(province)}`

const toCanonicalProvince = (value?: string) => {
  const normalized = normalizeForComparison(value)
  if (normalized === 'cadiz') return 'Cádiz'
  if (normalized === 'huelva') return 'Huelva'
  if (normalized === 'ceuta') return 'Ceuta'
  return ''
}

const cleanSegment = (value?: string) =>
  String(value || '')
    .replace(/[|;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/,+/g, ',')
    .trim()
    .replace(/^,+|,+$/g, '')

const normalizeStreetSegment = (value?: string) =>
  cleanSegment(
    String(value || '')
      .replace(/\bC\/\s*/gi, 'Calle ')
      .replace(/\bAVDA?\.?\b/gi, 'Avenida')
      .replace(/\bAV\.?\b/gi, 'Avenida')
      .replace(/\bPKAZA\b/gi, 'Plaza')
      .replace(/\bPLZ\.?\b/gi, 'Plaza')
      .replace(/\bCTRA\.?\b/gi, 'Carretera')
      .replace(/\bURB\.?\b/gi, 'Urbanización')
      .replace(/\bEDIF\.?\b/gi, 'Edificio')
      .replace(/\bN[º°o.]?\s*(\d+)/gi, '$1')
      .replace(/\bN\.\s*(\d+)/gi, '$1')
      .replace(/[.]+/g, ' ')
      .replace(/\s+/g, ' ')
  )

const uniqueSegments = (parts: string[]) => {
  const seen = new Set<string>()
  const result: string[] = []

  for (const part of parts) {
    const cleaned = cleanSegment(part)
    if (!cleaned) continue
    const key = normalizeForComparison(cleaned)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(cleaned)
  }

  return result
}

const stripCountryFromAddress = (value: string) =>
  value
    .replace(/\b(?:españa|espana|spain)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/,+/g, ',')
    .trim()
    .replace(/^,+|,+$/g, '')

const buildStreetFragment = (value: string) => {
  const primary = value.split(',')[0]?.trim() || value
  const fragment = primary
    .replace(/\b(edificio|bloque|portal|escalera|piso|planta|local|nave|puerta)\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  return fragment
}

const extractFromNotes = (notes: string | undefined, label: 'Ciudad' | 'Provincia') => {
  if (!notes) return ''
  const match = notes.match(new RegExp(`${label}:\\s*([^\\n]+)`, 'i'))
  return match ? match[1].trim() : ''
}

const deriveProvince = (customer?: Customer) => {
  if (!customer) return ''

  const direct = toCanonicalProvince(customer.province)
  if (direct) return direct

  const fromNotes = toCanonicalProvince(extractFromNotes(customer.notes, 'Provincia'))
  if (fromNotes) return fromNotes

  const cityAsProvince = toCanonicalProvince(customer.city)
  return cityAsProvince || ''
}

const deriveCity = (customer?: Customer) => {
  if (!customer) return ''

  const fromNotes = cleanSegment(extractFromNotes(customer.notes, 'Ciudad'))
  if (fromNotes) return fromNotes

  const city = cleanSegment(customer.city)
  if (!city) return ''
  const canonicalProvince = deriveProvince(customer)
  const canonicalCity = toCanonicalProvince(city)
  return canonicalCity && canonicalCity === canonicalProvince ? canonicalCity : city
}

const CITY_CENTERS: Record<string, MapCoordinates> = {
  [createCityKey('Jerez de la Frontera', 'Cádiz')]: { lat: 36.6867, lng: -6.1371 },
  [createCityKey('Cádiz', 'Cádiz')]: { lat: 36.5297, lng: -6.2925 },
  [createCityKey('Cadiz', 'Cádiz')]: { lat: 36.5297, lng: -6.2925 },
  [createCityKey('El Puerto de Santa María', 'Cádiz')]: { lat: 36.5997, lng: -6.2331 },
  [createCityKey('Sanlúcar de Barrameda', 'Cádiz')]: { lat: 36.7781, lng: -6.3531 },
  [createCityKey('Chipiona', 'Cádiz')]: { lat: 36.7367, lng: -6.4378 },
  [createCityKey('Chiclana de la Frontera', 'Cádiz')]: { lat: 36.4197, lng: -6.1497 },
  [createCityKey('San Fernando', 'Cádiz')]: { lat: 36.4614, lng: -6.1997 },
  [createCityKey('Algeciras', 'Cádiz')]: { lat: 36.1322, lng: -5.4553 },
  [createCityKey('Huelva', 'Huelva')]: { lat: 37.2614, lng: -6.9447 },
  [createCityKey('Punta Umbría', 'Huelva')]: { lat: 37.1848, lng: -7.0103 },
  [createCityKey('Ayamonte', 'Huelva')]: { lat: 37.2144, lng: -7.4057 },
  [createCityKey('Moguer', 'Huelva')]: { lat: 37.273, lng: -6.8387 },
  [createCityKey('Almonte', 'Huelva')]: { lat: 37.2578, lng: -6.5214 },
  [createCityKey('Palos de la Frontera', 'Huelva')]: { lat: 37.233, lng: -6.8939 },
  [createCityKey('Bollullos Par del Condado', 'Huelva')]: { lat: 37.3441, lng: -6.6913 },
  [createCityKey('Lepe', 'Huelva')]: { lat: 37.2504, lng: -7.201 },
  [createCityKey('Cartaya', 'Huelva')]: { lat: 37.2877, lng: -7.1614 },
  [createCityKey('San Juan del Puerto', 'Huelva')]: { lat: 37.3114, lng: -6.8395 },
  [createCityKey('Lucena del Puerto', 'Huelva')]: { lat: 37.3116, lng: -6.8999 },
  [createCityKey('Trigueros', 'Huelva')]: { lat: 37.3824, lng: -6.8334 },
  [createCityKey('Valverde del Camino', 'Huelva')]: { lat: 37.5673, lng: -6.7499 },
  [createCityKey('Ceuta', 'Ceuta')]: { lat: 35.8894, lng: -5.3213 },
}

const LARGE_CITY_KEYS = new Set([
  createCityKey('Jerez de la Frontera', 'Cádiz'),
  createCityKey('Cádiz', 'Cádiz'),
  createCityKey('El Puerto de Santa María', 'Cádiz'),
  createCityKey('Huelva', 'Huelva'),
  createCityKey('Algeciras', 'Cádiz'),
])

const createMarkerOffset = (seed: string) => {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0
  }

  const normalized = Math.abs(hash)
  const angle = (normalized % 360) * (Math.PI / 180)
  const radius = 0.006 + ((normalized % 9) * 0.0014)

  return {
    lat: Math.sin(angle) * radius,
    lng: Math.cos(angle) * radius,
  }
}

export const calculateDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  if (lat1 === lat2 && lng1 === lng2) return 0

  const radiusKm = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2

  return radiusKm * 2 * Math.asin(Math.sqrt(a))
}

const getCityCenter = (customerOrCity: Customer | string, provinceArg?: string) => {
  if (typeof customerOrCity === 'string') {
    return CITY_CENTERS[createCityKey(customerOrCity, provinceArg || '')] || null
  }

  const city = deriveCity(customerOrCity)
  const province = deriveProvince(customerOrCity)
  if (!city || !province) return null
  return CITY_CENTERS[createCityKey(city, province)] || null
}

const getAddressCompleteness = (customer: Customer, normalizedAddress: string) => {
  const address = stripCountryFromAddress(cleanSegment(customer.address))
  const city = deriveCity(customer)
  const province = deriveProvince(customer)
  const hasStreetLikeAddress =
    /(\d|calle|c\/|avenida|avda|av\.|plaza|pol[ií]gono|carretera|camino|urbanizaci[oó]n|local|nave|edificio|portal)/i.test(
      address
    ) && address.length >= 8

  if (hasStreetLikeAddress && city && province && normalizedAddress.length >= 18) {
    return 'full'
  }

  if ((address.length >= 4 && city) || (city && province)) {
    return 'partial'
  }

  return 'minimal'
}

export const isValidCoordinate = (lat: number, lng: number) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180

export const isWithinServiceArea = (lat: number, lng: number) =>
  lat >= SERVICE_AREA.minLat &&
  lat <= SERVICE_AREA.maxLat &&
  lng >= SERVICE_AREA.minLng &&
  lng <= SERVICE_AREA.maxLng

const isInBounds = (lat: number, lng: number, bounds: Bounds) =>
  lat >= bounds.minLat &&
  lat <= bounds.maxLat &&
  lng >= bounds.minLng &&
  lng <= bounds.maxLng

const nearestKnownCityDistance = (lat: number, lng: number) => {
  let best = Number.POSITIVE_INFINITY

  for (const coords of Object.values(CITY_CENTERS)) {
    const distance = calculateDistanceKm(lat, lng, coords.lat, coords.lng)
    if (distance < best) {
      best = distance
    }
  }

  return best
}

export const isLikelyInSea = (lat: number, lng: number) => {
  if (!isWithinServiceArea(lat, lng)) return false

  if (OPEN_WATER_ZONES.some(bounds => isInBounds(lat, lng, bounds))) {
    return true
  }

  const nearestCityKm = nearestKnownCityDistance(lat, lng)
  const coastalBand = lat <= 37.3
  return coastalBand && nearestCityKm > 20
}

export const isSuspiciousDistanceFromCityCenter = (
  client: Customer,
  lat: number,
  lng: number
) => {
  const center = getCityCenter(client)
  if (!center) return false

  const cityKey = createCityKey(deriveCity(client), deriveProvince(client))
  const thresholdKm = LARGE_CITY_KEYS.has(cityKey) ? 20 : 15
  return calculateDistanceKm(lat, lng, center.lat, center.lng) > thresholdKm
}

export const normalizeAddressForGeocoding = (client: Customer) => {
  const city = deriveCity(client)
  const province = deriveProvince(client)
  const address = stripCountryFromAddress(normalizeStreetSegment(client.address))

  const parts = uniqueSegments([address, city, province, 'Spain'])
  return parts.join(', ')
}

const buildGeocodeQueries = (client: Customer): GeocodeQueryPlan[] => {
  const city = deriveCity(client)
  const province = deriveProvince(client)
  const normalizedAddress = normalizeAddressForGeocoding(client)
  const streetOnly = stripCountryFromAddress(normalizeStreetSegment(client.address))
  const streetFragment = buildStreetFragment(streetOnly)
  const precisionRisk = !/\d/.test(streetOnly) || streetOnly.length < 8

  return uniqueSegments([
    normalizedAddress,
    [streetOnly, city, 'Spain'].filter(Boolean).join(', '),
    [streetFragment, city, province, 'Spain'].filter(Boolean).join(', '),
    [city, province, 'Spain'].filter(Boolean).join(', '),
  ]).map(query => {
    if (query === normalizedAddress) {
      return { query, tier: 1, approximate: false, precisionRisk }
    }
    if (query === [streetOnly, city, 'Spain'].filter(Boolean).join(', ')) {
      return { query, tier: 2, approximate: false, precisionRisk }
    }
    if (query === [streetFragment, city, province, 'Spain'].filter(Boolean).join(', ')) {
      return { query, tier: 3, approximate: false, precisionRisk: true }
    }
    return { query, tier: 4, approximate: true, precisionRisk: true }
  })
}

const normalizeGeocodeEntry = (entry: any): GeocodeCandidate | null => {
  if (!entry || typeof entry !== 'object') return null

  if (typeof entry.lat === 'number' && typeof entry.lng === 'number') {
    return {
      lat: entry.lat,
      lng: entry.lng,
      displayName: entry.displayName || entry.display_name || '',
      country: entry.country,
      province: entry.province,
      city: entry.city,
      type: entry.type,
      category: entry.category,
      source: entry.source || 'unknown',
      raw: entry.raw ?? entry,
    }
  }

  if (entry.lat && entry.lon) {
    return {
      lat: Number(entry.lat),
      lng: Number(entry.lon),
      displayName: entry.display_name || entry.displayName || '',
      country: entry.address?.country || entry.country,
      province: entry.address?.state || entry.address?.province || entry.province,
      city:
        entry.address?.city ||
        entry.address?.town ||
        entry.address?.village ||
        entry.city,
      type: entry.type,
      category: entry.class || entry.category,
      source: entry.source || 'nominatim',
      raw: entry,
    }
  }

  const feature = entry as GeocodeFeatureLike
  const coordinates = feature.center || feature.geometry?.coordinates
  if (Array.isArray(coordinates) && coordinates.length >= 2) {
    return {
      lat: Number(coordinates[1]),
      lng: Number(coordinates[0]),
      displayName:
        String(
          feature.place_name ||
            feature.properties?.display_name ||
            feature.properties?.name ||
            feature.text ||
            ''
        ) || '',
      country: String(feature.properties?.country || ''),
      province: String(feature.properties?.region || feature.properties?.province || ''),
      city: String(feature.properties?.place || feature.properties?.city || ''),
      type: String(feature.properties?.type || ''),
      category: String(feature.properties?.category || ''),
      source: 'unknown',
      raw: entry,
    }
  }

  return null
}

export const normalizeGeocodeResults = (apiResult: unknown): GeocodeCandidate[] => {
  if (!apiResult) return []

  const asRecord = typeof apiResult === 'object' ? (apiResult as Record<string, unknown>) : null
  const candidates = Array.isArray(apiResult)
    ? apiResult
    : Array.isArray(asRecord?.results)
      ? asRecord?.results
      : Array.isArray(asRecord?.data)
        ? asRecord?.data
        : Array.isArray(asRecord?.features)
          ? asRecord?.features
          : asRecord?.data && typeof asRecord.data === 'object'
            ? [asRecord.data]
            : asRecord
              ? [asRecord]
              : []

  return candidates
    .map(candidate => normalizeGeocodeEntry(candidate))
    .filter((candidate): candidate is GeocodeCandidate => Boolean(candidate))
}

const normalizeLocationName = (value?: string) => normalizeForComparison(cleanSegment(value))

const containsStreetHint = (value?: string) =>
  /(calle|avenida|avda|av\.|plaza|carretera|camino|pol[ií]gono|house|building|residential|address|road|street)/i.test(
    String(value || '')
  )

const hasHouseNumberHint = (value?: string) => /\b\d+[a-z]?\b/i.test(String(value || ''))

const isAdministrativeOnlyResult = (result: GeocodeCandidate) =>
  /(city|municipality|town|village|region|administrative|province|county|state)/i.test(
    `${result.category || ''} ${result.type || ''}`
  ) && !containsStreetHint(`${result.category || ''} ${result.type || ''} ${result.displayName || ''}`)

export const selectBestGeocodeResult = (
  results: GeocodeCandidate[],
  client: Customer
) => {
  if (!Array.isArray(results) || results.length === 0) return null

  const targetCity = normalizeLocationName(deriveCity(client))
  const targetProvince = normalizeLocationName(deriveProvince(client))
  const normalizedAddress = normalizeAddressForGeocoding(client)
  const streetOnly = normalizeLocationName(stripCountryFromAddress(normalizeStreetSegment(client.address)))
  const streetFragment = normalizeLocationName(buildStreetFragment(streetOnly))
  const houseNumber = (String(client.address || '').match(/\b\d+[a-z]?\b/i) || [])[0] || ''

  let winner: { score: number; result: GeocodeCandidate } | null = null

  for (const result of results) {
    if (!isValidCoordinate(result.lat, result.lng)) continue
    if (!isWithinServiceArea(result.lat, result.lng)) continue
    if (isLikelyInSea(result.lat, result.lng)) continue
    if (isSuspiciousDistanceFromCityCenter(client, result.lat, result.lng)) continue

    let score = 0

    const country = normalizeLocationName(result.country || result.displayName)
    const province = normalizeLocationName(result.province || result.displayName)
    const city = normalizeLocationName(result.city || result.displayName)
    const displayName = normalizeLocationName(result.displayName)
    const category = normalizeLocationName(result.category)
    const type = normalizeLocationName(result.type)

    if (!(country.includes('spain') || country.includes('espana'))) continue

    if (targetProvince && province.includes(targetProvince)) score += 35
    if (targetCity && (city.includes(targetCity) || displayName.includes(targetCity))) score += 30
    if (streetOnly && displayName.includes(streetOnly)) score += 28
    if (streetFragment && displayName.includes(streetFragment)) score += 18
    if (houseNumber && displayName.includes(normalizeLocationName(houseNumber))) score += 20
    if (normalizedAddress && displayName.length >= normalizedAddress.length * 0.5) score += 8
    if (containsStreetHint(`${category} ${type}`)) score += 12
    if (hasHouseNumberHint(result.displayName)) score += 6

    if (
      /(bay|sea|ocean|water|mar|coast|natural|harbour|port|beach|administrative)/.test(
        `${category} ${type}`
      )
    ) {
      score -= 45
    }

    if (isAdministrativeOnlyResult(result)) {
      score -= 18
    }

    if (!winner || score > winner.score) {
      winner = { score, result }
    }
  }

  return winner?.score && winner.score > 0 ? winner.result : null
}

const buildAddressSignature = (client: Customer) =>
  normalizeForComparison(
    [
      client.address || '',
      deriveCity(client),
      deriveProvince(client),
      client.postal_code || client.cp || '',
      client.country || 'Spain',
    ].join('|')
  )

const buildAudit = (
  client: Customer,
  overrides: Partial<ClientCoordinateAudit>
): ClientCoordinateAudit => {
  const normalizedAddress = normalizeAddressForGeocoding(client)
  const addressSignature = buildAddressSignature(client)

  return {
    geocodeStatus: overrides.geocodeStatus ?? 'invalid',
    geocodeReason: overrides.geocodeReason ?? 'Sin coordenadas fiables',
    originalLat:
      overrides.originalLat ??
      (typeof client.latitude === 'number' ? client.latitude : null),
    originalLng:
      overrides.originalLng ??
      (typeof client.longitude === 'number' ? client.longitude : null),
    correctedLat: overrides.correctedLat ?? null,
    correctedLng: overrides.correctedLng ?? null,
    markerCoords: overrides.markerCoords ?? null,
    hasExactCoords: overrides.hasExactCoords ?? false,
    usesApproximateMarker: overrides.usesApproximateMarker ?? false,
    normalizedAddress,
    addressCompleteness:
      overrides.addressCompleteness ?? getAddressCompleteness(client, normalizedAddress),
    source: overrides.source ?? 'none',
    addressSignature,
  }
}

const buildGeocodeAuditFromCandidate = (
  client: Customer,
  selected: GeocodeCandidate,
  checked: Extract<CoordinateCheck, { ok: true }>,
  queryPlan: GeocodeQueryPlan,
  addressCompleteness: 'full' | 'partial' | 'minimal'
) => {
  const approximate =
    queryPlan.approximate ||
    queryPlan.precisionRisk ||
    addressCompleteness !== 'full' ||
    isAdministrativeOnlyResult(selected)

  return buildAudit(client, {
    geocodeStatus: approximate ? 'approximate' : 'valid',
    geocodeReason: approximate
      ? 'Ubicación aproximada. Dirección pendiente de validación.'
      : checked.reason,
    correctedLat: checked.coords.lat,
    correctedLng: checked.coords.lng,
    markerCoords: checked.coords,
    hasExactCoords: !approximate,
    usesApproximateMarker: approximate,
    source: queryPlan.approximate ? 'city_fallback' : 'geocoded',
    addressCompleteness,
  })
}

const validateCoordinateCandidate = (
  client: Customer,
  lat: number,
  lng: number,
  source: 'original' | 'swapped' | 'geocoded'
): CoordinateCheck => {
  if (!isValidCoordinate(lat, lng)) {
    return {
      ok: false,
      status: 'invalid',
      reason: 'Coordenadas no válidas',
    }
  }

  if (!isWithinServiceArea(lat, lng)) {
    return {
      ok: false,
      status: 'invalid',
      reason: 'Coordenadas fuera del área de servicio',
    }
  }

  if (isLikelyInSea(lat, lng)) {
    return {
      ok: false,
      status: 'sea_suspect',
      reason: 'El punto cae en una zona de mar o bahía',
    }
  }

  if (isSuspiciousDistanceFromCityCenter(client, lat, lng)) {
    return {
      ok: false,
      status: 'invalid',
      reason: 'El punto queda demasiado lejos del centro urbano esperado',
    }
  }

  return {
    ok: true,
    coords: { lat, lng },
    source,
    reason:
      source === 'swapped'
        ? 'Se corrigieron coordenadas invertidas (lat/lng)'
        : source === 'geocoded'
          ? 'Coordenadas corregidas mediante geocodificación'
          : 'Coordenadas originales validadas',
  }
}

const validateOriginalCoordinates = (client: Customer) => {
  const originalLat = typeof client.latitude === 'number' ? client.latitude : null
  const originalLng = typeof client.longitude === 'number' ? client.longitude : null

  if (originalLat === null || originalLng === null) return null

  const direct = validateCoordinateCandidate(client, originalLat, originalLng, 'original')
  if (direct.ok) return direct

  const swapped = validateCoordinateCandidate(client, originalLng, originalLat, 'swapped')
  return swapped.ok ? swapped : direct
}

const buildApproximateFallback = (client: Customer, reason: string) => {
  const center = getCityCenter(client)
  if (!center) {
    return buildAudit(client, {
      geocodeStatus: 'invalid',
      geocodeReason: `${reason}. Localización pendiente de validación manual`,
      markerCoords: null,
      source: 'none',
    })
  }

  const offset = createMarkerOffset(client.id)
  return buildAudit(client, {
    geocodeStatus: 'approximate',
    geocodeReason: `${reason}. Ubicación aproximada por centro urbano`,
    correctedLat: center.lat,
    correctedLng: center.lng,
    markerCoords: {
      lat: center.lat + offset.lat,
      lng: center.lng + offset.lng,
    },
    hasExactCoords: false,
    usesApproximateMarker: true,
    source: 'city_fallback',
  })
}

const auditFromStoredEntry = (
  client: Customer,
  entry?: ClientCoordinateAudit | MapCoordinates | null
) => {
  if (!entry) return null
  if (!isRecord(entry)) return null

  if ('geocodeStatus' in entry) {
    if (entry.addressSignature === buildAddressSignature(client)) {
      return entry
    }
    return null
  }

  if ('lat' in entry && 'lng' in entry) {
    const candidate = validateCoordinateCandidate(client, entry.lat, entry.lng, 'geocoded')
    if (candidate.ok) {
      return buildAudit(client, {
        geocodeStatus: 'valid',
        geocodeReason: 'Coordenadas cacheadas validadas',
        correctedLat: candidate.coords.lat,
        correctedLng: candidate.coords.lng,
        markerCoords: candidate.coords,
        hasExactCoords: true,
        usesApproximateMarker: false,
        source: 'geocoded',
      })
    }
  }

  return null
}

export const sanitizeCoordinateCache = (input: unknown) => {
  if (!isRecord(input)) return {}

  const sanitized: Record<string, ClientCoordinateAudit | MapCoordinates> = {}

  for (const [key, value] of Object.entries(input)) {
    if (!isRecord(value)) continue

    if (
      'lat' in value &&
      'lng' in value &&
      typeof value.lat === 'number' &&
      typeof value.lng === 'number'
    ) {
      sanitized[key] = { lat: value.lat, lng: value.lng }
      continue
    }

    if (
      'geocodeStatus' in value &&
      'geocodeReason' in value &&
      typeof value.geocodeStatus === 'string' &&
      typeof value.geocodeReason === 'string'
    ) {
      sanitized[key] = value as ClientCoordinateAudit
    }
  }

  return sanitized
}

export const getCoordinateAuditForClient = (
  client: Customer,
  entry?: ClientCoordinateAudit | MapCoordinates | null
) => {
  const stored = auditFromStoredEntry(client, entry)
  if (stored) return stored

  const original = validateOriginalCoordinates(client)
  if (original?.ok) {
    return buildAudit(client, {
      geocodeStatus: 'valid',
      geocodeReason: original.reason,
      correctedLat: original.coords.lat,
      correctedLng: original.coords.lng,
      markerCoords: original.coords,
      hasExactCoords: true,
      usesApproximateMarker: false,
      source: original.source,
    })
  }

  return buildApproximateFallback(client, original?.reason || 'Dirección incompleta o sin coordenadas')
}

export const validateAndFixClientCoordinates = async (
  client: Customer,
  options: ValidateAndFixOptions
) => {
  const cached = auditFromStoredEntry(client, options.cachedAudit)
  if (cached && (cached.geocodeStatus === 'valid' || cached.geocodeStatus === 'approximate')) {
    return cached
  }

  const original = validateOriginalCoordinates(client)
  if (original?.ok) {
    return buildAudit(client, {
      geocodeStatus: 'valid',
      geocodeReason: original.reason,
      correctedLat: original.coords.lat,
      correctedLng: original.coords.lng,
      markerCoords: original.coords,
      hasExactCoords: true,
      usesApproximateMarker: false,
      source: original.source,
    })
  }

  const normalizedAddress = normalizeAddressForGeocoding(client)
  const addressCompleteness = getAddressCompleteness(client, normalizedAddress)
  const geocodeQueries = buildGeocodeQueries(client)

  if (!normalizedAddress || addressCompleteness === 'minimal') {
    return buildApproximateFallback(
      client,
      original?.reason || 'Dirección insuficiente para geocodificar con precisión'
    )
  }

  let rejectedForSea = false

  try {
    for (const queryPlan of geocodeQueries) {
      const results = await options.geocodeFetcher(queryPlan.query)
      const selected = selectBestGeocodeResult(results, client)

      if (selected) {
        const checked = validateCoordinateCandidate(client, selected.lat, selected.lng, 'geocoded')
        if (checked.ok) {
          return buildGeocodeAuditFromCandidate(
            client,
            selected,
            checked,
            queryPlan,
            addressCompleteness
          )
        }

        if ('status' in checked && checked.status === 'sea_suspect') {
          rejectedForSea = true
        }
      }

      if (results.length > 0) {
        const hasSeaCandidates = results.some(result =>
          isValidCoordinate(result.lat, result.lng) &&
          isWithinServiceArea(result.lat, result.lng) &&
          isLikelyInSea(result.lat, result.lng)
        )
        if (hasSeaCandidates) {
          rejectedForSea = true
        }
      }
    }
  } catch {
    return buildApproximateFallback(client, 'No se pudo validar la dirección en el geocoder')
  }

  if (rejectedForSea) {
    return buildApproximateFallback(
      client,
      'Resultado descartado por caer en mar o bahía, requiere confirmación'
    )
  }

  return buildApproximateFallback(
    client,
    original?.reason || 'Geocodificación no concluyente, requiere validación manual'
  )
}

export const getCityCenterCoordinates = (city: string, province: string) =>
  getCityCenter(city, province)
