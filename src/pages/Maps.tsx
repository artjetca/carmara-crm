import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { translations } from '../lib/translations'
import type { Customer } from '../lib/supabase'
import {
  ChevronDown,
  Expand,
  ExternalLink,
  LocateFixed,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Search,
  X,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import MarkerClusterGroup from '@changey/react-leaflet-markercluster'
import L, {
  LatLngBoundsExpression,
  LatLngExpression,
  Map as LeafletMap,
  Marker as LeafletMarker,
} from 'leaflet'

import {
  getCoordinateAuditForClient,
  isLikelyInSea,
  isSuspiciousDistanceFromCityCenter,
  isValidCoordinate,
  isWithinServiceArea,
  normalizeAddressForGeocoding,
  normalizeGeocodeResults,
  sanitizeCoordinateCache,
  validateAndFixClientCoordinates,
  type ClientCoordinateAudit,
  type MapCoordinates,
} from '../components/communications/visitsGeocodeUtils'
import {
  deriveCity,
  deriveProvince,
  formatDistanceKm,
  formatDistanceAndTime,
  getCustomerDisplayAddress,
  getCustomerPhone,
  getUserLocation,
  JEREZ_ORIGIN,
  type DistanceOrigin,
  refreshMapAndSidebarDistances as refreshWithDistances,
} from '../components/communications/visitsMapUtils'
import {
  getRouteTimeFromUserToClient,
  type RouteTimeEntry,
} from '../components/communications/visitsRoutingUtils'
import {
  buildClientPopupHtml,
  buildResolvedMapClient,
  getClientRenderableCoordinates,
  hasRenderableCoordinates,
  isValidClient,
  refreshMapAndSidebarDistances as refreshMapBasic,
  sanitizeClients,
  type ResolvedMapClient,
} from './mapsPageUtils'
import { PROVINCE_CENTERS } from '../utils/mapCentroids'

type CoordinateCache = Record<string, ClientCoordinateAudit | MapCoordinates>

const STORAGE_KEY = 'carmara-customer-coords'

const provinces = ['Cádiz', 'Huelva', 'Ceuta']

const municipiosByProvince: Record<string, string[]> = {
  Cádiz: [
    'Alcalá de los Gazules', 'Alcalá del Valle', 'Algar', 'Algeciras', 'Algodonales',
    'Arcos de la Frontera', 'Barbate', 'Benalup-Casas Viejas', 'Benaocaz', 'Bornos',
    'El Bosque', 'Cádiz', 'Castellar de la Frontera', 'Chiclana de la Frontera', 'Chipiona',
    'Conil de la Frontera', 'Espera', 'El Gastor', 'Grazalema', 'Jerez de la Frontera',
    'Jimena de la Frontera', 'La Línea de la Concepción', 'Los Barrios', 'Medina-Sidonia',
    'Olvera', 'Paterna de Rivera', 'Prado del Rey', 'El Puerto de Santa María', 'Puerto Real',
    'Puerto Serrano', 'Rota', 'San Fernando', 'San José del Valle', 'San Roque',
    'Sanlúcar de Barrameda', 'Setenil de las Bodegas', 'Tarifa', 'Torre Alháquime',
    'Trebujena', 'Ubrique', 'Vejer de la Frontera', 'Villaluenga del Rosario', 'Villamartín', 'Zahara',
  ],
  Huelva: [
    'Alájar', 'Aljaraque', 'Almendro', 'Almonaster la Real', 'Almonte', 'Alosno', 'Aracena',
    'Aroche', 'Arroyomolinos de León', 'Ayamonte', 'Beas', 'Berrocal', 'Bollullos Par del Condado',
    'Bonares', 'Cabezas Rubias', 'Cala', 'Calañas', 'El Campillo', 'Campofrío', 'Cañaveral de León',
    'Cartaya', 'Castaño del Robledo', 'El Cerro de Andévalo', 'Chucena', 'Corteconcepción', 'Cortegana',
    'Cortelazor', 'Cumbres de Enmedio', 'Cumbres de San Bartolomé', 'Cumbres Mayores', 'Encinasola',
    'Escacena del Campo', 'Fuenteheridos', 'Galaroza', 'El Granado', 'La Granada de Río-Tinto',
    'Gibraleón', 'Higuera de la Sierra', 'Hinojales', 'Hinojos', 'Huelva', 'Isla Cristina',
    'Jabugo', 'Lepe', 'Linares de la Sierra', 'Lucena del Puerto', 'Manzanilla', 'Marines',
    'Minas de Riotinto', 'Moguer', 'La Nava', 'Nerva', 'Niebla', 'Palos de la Frontera',
    'La Palma del Condado', 'Paterna del Campo', 'Paymogo', 'Puebla de Guzmán', 'Puerto Moral',
    'Punta Umbría', 'Rociana del Condado', 'Rosal de la Frontera', 'San Bartolomé de la Torre',
    'San Juan del Puerto', 'San Silvestre de Guzmán', 'Sanlúcar de Guadiana', 'Santa Ana la Real',
    'Santa Bárbara de Casa', 'Santa Olalla del Cala', 'Trigueros', 'Valdelarco', 'Valverde del Camino',
    'Villablanca', 'Villalba del Alcor', 'Villanueva de las Cruces', 'Villanueva de los Castillejos',
    'Villarrasa', 'Zalamea la Real', 'Zufre',
  ],
  Ceuta: ['Ceuta'],
}

const MARKER_BLUE = '#2563eb'
const MARKER_BLUE_RING = 'rgba(37,99,235,.28)'
const MARKER_RED = '#dc2626'
const MARKER_RED_RING = 'rgba(220,38,38,.28)'
const MARKER_AMBER = '#d97706'
const MARKER_AMBER_RING = 'rgba(217,119,6,.28)'
const MARKER_GRAY = '#6b7280'

// Unified marker icon factory - all client markers use blue color scheme
// Status differences shown via border style only, not color
const createCustomerIcon = (
  geocodeStatus: 'valid' | 'approximate' | 'invalid' | 'sea_suspect',
  selected: boolean
) => {
  const size = selected ? 22 : 18

  // All markers use blue base color for consistency
  const color = MARKER_BLUE
  const ringColor = MARKER_BLUE_RING

  // Status differentiation via border style only (not color)
  // valid: solid white border
  // approximate: dashed amber border (keep blue fill)
  // invalid/sea_suspect: should be filtered out by hasRenderableCoordinates
  const isApproximate = geocodeStatus === 'approximate'
  const borderStyle = isApproximate ? 'dashed' : 'solid'
  const borderColor = isApproximate ? MARKER_AMBER : '#ffffff'

  return L.divIcon({
    className: 'client-marker-icon',
    html: `
      <div style="
        width:${size}px;
        height:${size}px;
        border-radius:999px;
        background:${color};
        border:2px ${borderStyle} ${borderColor};
        box-shadow:0 4px 12px rgba(15,23,42,.24);
        outline:${selected ? `3px solid ${ringColor}` : 'none'};
      ">
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 8)],
  })
}

const myLocationIcon = L.divIcon({
  className: '',
  html: `
    <div style="width:18px;height:18px;border-radius:999px;background:${MARKER_RED};border:3px solid #ffffff;box-shadow:0 0 0 6px ${MARKER_RED_RING},0 4px 12px ${MARKER_RED_RING}"></div>
  `,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

// Province centers now imported from shared utils/mapCentroids.ts

function MapViewport({
  bounds,
  defaultCenter,
  filterProvince,
  filterCity,
}: {
  bounds: LatLngBoundsExpression | null
  defaultCenter: [number, number]
  filterProvince: string
  filterCity: string
}) {
  const map = useMap()
  const filterKey = `${filterProvince}|${filterCity}`
  const prevFilterRef = useRef(filterKey)

  useEffect(() => {
    map.invalidateSize()
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 300)

    const filterChanged = filterKey !== prevFilterRef.current
    prevFilterRef.current = filterKey

    if (bounds) {
      map.fitBounds(bounds, {
        padding: [48, 48],
        maxZoom: 14,
        animate: filterChanged,
      })
      return () => window.clearTimeout(resizeTimer)
    }

    // No markers — fall back to province center or default
    if (filterProvince && PROVINCE_CENTERS[filterProvince]) {
      map.flyTo(PROVINCE_CENTERS[filterProvince], 10, { duration: 0.6 })
      return () => window.clearTimeout(resizeTimer)
    }

    map.setView(defaultCenter, 8)
    return () => window.clearTimeout(resizeTimer)
  }, [bounds, defaultCenter, filterKey, filterProvince, map])

  return null
}

export default function Maps() {
  const { user } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProvince, setSelectedProvince] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [distanceMode, setDistanceMode] = useState(false)
  const [distanceOrigin, setDistanceOrigin] = useState<DistanceOrigin>(JEREZ_ORIGIN)
  const [routeTimeByClientId, setRouteTimeByClientId] = useState<Record<string, RouteTimeEntry>>({})
  const [coordsById, setCoordsById] = useState<CoordinateCache>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? (sanitizeCoordinateCache(JSON.parse(saved)) as CoordinateCache) : {}
    } catch {
      return {}
    }
  })
  const [myLocation, setMyLocation] = useState<MapCoordinates | null>(null)
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const [fittingAll, setFittingAll] = useState(false)
  const [locatingAllPrecise, setLocatingAllPrecise] = useState(false)
  const [repairingCoordinates, setRepairingCoordinates] = useState(false)
  const [repairStats, setRepairStats] = useState<{
    total: number
    repaired: number
    failed: number
    skipped: number
  } | null>(null)
  // ── Mobile app-like map UI ──
  const [sheetOpen, setSheetOpen] = useState(false)
  const [areaClients, setAreaClients] = useState<ResolvedMapClient[] | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRegistryRef = useRef(new Map<string, LeafletMarker>())
  const geocodeAttemptedRef = useRef(new Set<string>())
  const isGeocodingRef = useRef(false)
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set())
  const cityDistanceCacheRef = useRef(new Map<string, import('./mapsPageUtils').CityDistanceSummary>())
  const t = translations

  const persistedDbCoordSignaturesRef = useRef(new Map<string, string>())

  // Write validated coordinates back to the customers table so they
  // survive localStorage eviction and sync across devices.
  const persistCoordinatesToDb = useCallback((entries: CoordinateCache) => {
    for (const [customerId, entry] of Object.entries(entries)) {
      if (!entry || typeof entry !== 'object') continue
      const audit = entry as ClientCoordinateAudit
      const coords = audit.markerCoords
      if (!coords || audit.geocodeStatus !== 'valid') continue
      if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) continue

      const signature = `${coords.lat.toFixed(6)}|${coords.lng.toFixed(6)}`
      if (persistedDbCoordSignaturesRef.current.get(customerId) === signature) continue
      persistedDbCoordSignaturesRef.current.set(customerId, signature)

      fetch('/api/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: customerId,
          latitude: coords.lat,
          longitude: coords.lng,
          coordinates: `${coords.lat},${coords.lng}`,
        }),
      })
        .then(response => {
          if (!response.ok) {
            persistedDbCoordSignaturesRef.current.delete(customerId)
            console.warn('[COORDS_DB] Persist failed for', customerId, response.status)
          }
        })
        .catch(error => {
          persistedDbCoordSignaturesRef.current.delete(customerId)
          console.warn('[COORDS_DB] Persist error for', customerId, error)
        })
    }
  }, [])

  const persistCoordinateCache = useCallback((nextEntries: CoordinateCache) => {
    setCoordsById(previous => {
      const merged = { ...previous, ...nextEntries }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
      return merged
    })
    persistCoordinatesToDb(nextEntries)
  }, [persistCoordinatesToDb])

  useEffect(() => {
    setCoordsById(previous => {
      const cleaned = Object.fromEntries(
        Object.entries(previous).filter(([, entry]) => {
          if (!entry || typeof entry !== 'object') return true
          const record = entry as Record<string, unknown>
          // Remove cached entries whose marker coordinates are in the sea
          if ('markerCoords' in record && record.markerCoords && typeof record.markerCoords === 'object') {
            const mc = record.markerCoords as { lat?: number; lng?: number }
            if (typeof mc.lat === 'number' && typeof mc.lng === 'number' && isLikelyInSea(mc.lat, mc.lng)) {
              return false
            }
          }
          // Remove plain lat/lng entries that are in the sea
          if ('lat' in record && 'lng' in record && typeof record.lat === 'number' && typeof record.lng === 'number') {
            if (isLikelyInSea(record.lat, record.lng)) return false
          }
          return true
        })
      ) as CoordinateCache

      if (Object.keys(cleaned).length !== Object.keys(previous).length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned))
      }

      return cleaned
    })
  }, [])

  useEffect(() => {
    if (!user?.id) return

    const loadCustomers = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/customers', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })

        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Failed to load customers')
        }

        setCustomers(result.data || [])
      } catch (error) {
        console.error('Error loading customers:', error)
      } finally {
        setLoading(false)
      }
    }

    loadCustomers().catch(console.error)
  }, [user?.id])

  const getFilteredCities = useCallback(() => {
    const allCities = new Set<string>()

    if (selectedProvince) {
      for (const city of municipiosByProvince[selectedProvince] || []) {
        allCities.add(city)
      }
    } else {
      for (const provinceCities of Object.values(municipiosByProvince)) {
        for (const city of provinceCities) {
          allCities.add(city)
        }
      }
    }

    return Array.from(allCities).sort()
  }, [selectedProvince])

  const filteredCustomers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    return customers.filter(customer => {
      const city = deriveCity(customer)
      const province = deriveProvince(customer)
      const matchesSearch =
        !query ||
        customer.name?.toLowerCase().includes(query) ||
        customer.company?.toLowerCase().includes(query) ||
        customer.email?.toLowerCase().includes(query)

      const matchesProvince = !selectedProvince || province === selectedProvince
      const matchesCity = !selectedCity || city.toLowerCase() === selectedCity.toLowerCase()

      return matchesSearch && matchesProvince && matchesCity
    })
  }, [customers, searchTerm, selectedProvince, selectedCity])

  const fetchGeocodeCandidates = useCallback(async (address: string) => {
    const response = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    })

    const apiResult = await response.json()
    const normalized = normalizeGeocodeResults(apiResult)

    console.log('[GEOCODE] normalized results:', {
      address,
      status: response.status,
      total: normalized.length,
      apiResult,
    })

    if (!response.ok) {
      throw new Error(`Geocode request failed with ${response.status}`)
    }

    return normalized
  }, [])

  // Execute multi-query geocoding strategy (matching prospectGeocodeService pattern)
  const geocodeCustomerPrecise = useCallback(
    async (customer: Customer, force = false) => {
      console.log(`[GEOCODE_PRECISE] Customer: ${customer.name}`)

      try {
        const audit = await validateAndFixClientCoordinates(customer, {
          cachedAudit: force ? null : coordsById[customer.id],
          geocodeFetcher: fetchGeocodeCandidates,
        })
        console.log('[GEOCODE_PRECISE] audit:', audit)
        return audit
      } catch (error) {
        console.error('[GEOCODE_PRECISE] exception:', error)
        return null
      }
    },
    [coordsById, fetchGeocodeCandidates]
  )

  const ensureCustomerCoordinates = useCallback(
    async (customer: Customer, force = false) => {
      if (!force) {
        const existing = getCoordinateAuditForClient(customer, coordsById[customer.id])
        if (existing.geocodeStatus === 'valid') {
          return existing
        }
      }

      const preciseAudit = await geocodeCustomerPrecise(customer, force)
      if (preciseAudit) {
        return preciseAudit
      }

      return getCoordinateAuditForClient(customer, coordsById[customer.id])
    },
    [coordsById, geocodeCustomerPrecise]
  )

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (!selectedProvince) return
      if (isGeocodingRef.current) return
      isGeocodingRef.current = true

      try {
        const customersToGeocode = filteredCustomers.filter(customer => {
          const audit = getCoordinateAuditForClient(customer, coordsById[customer.id])
          const attemptKey = `${customer.id}:${audit.addressSignature}`
          return (
            audit.geocodeStatus !== 'valid' &&
            audit.addressCompleteness !== 'minimal' &&
            !geocodeAttemptedRef.current.has(attemptKey)
          )
        })

        if (customersToGeocode.length === 0) return

        const batchEntries: CoordinateCache = {}

        for (const customer of customersToGeocode) {
          if (cancelled) return

          const existing = getCoordinateAuditForClient(customer, coordsById[customer.id])
          const attemptKey = `${customer.id}:${existing.addressSignature}`
          geocodeAttemptedRef.current.add(attemptKey)

          const audit = await ensureCustomerCoordinates(customer)
          batchEntries[customer.id] = audit
          await new Promise(resolve => setTimeout(resolve, 150))
        }

        if (!cancelled && Object.keys(batchEntries).length > 0) {
          persistCoordinateCache(batchEntries)
        }
      } finally {
        isGeocodingRef.current = false
      }
    }

    run().catch(error => console.error('[GEOCODE_BATCH] Error:', error))

    return () => {
      cancelled = true
    }
  }, [coordsById, ensureCustomerCoordinates, filteredCustomers, persistCoordinateCache, selectedProvince])

  const resolvedCustomersBase = useMemo(() => {
    return filteredCustomers.map(customer => {
      const audit = getCoordinateAuditForClient(customer, coordsById[customer.id])
      return buildResolvedMapClient(
        customer,
        audit,
        getCustomerDisplayAddress(customer),
        deriveCity(customer),
        deriveProvince(customer),
        getCustomerPhone(customer)
      )
    })
  }, [coordsById, filteredCustomers])

  const distanceViewModel = useMemo(
    () => {
      if (!distanceMode) {
        // Non-distance mode: use basic grouping without advanced distance features
        return refreshMapBasic(resolvedCustomersBase, myLocation)
      }
      // Distance mode: use distanceOrigin and routeTimeByClientId
      return refreshWithDistances({
        customers: resolvedCustomersBase.map(c => c.sourceCustomer),
        coordsById,
        activeOrigin: distanceOrigin,
        routeTimeByClientId,
      })
    },
    [distanceMode, resolvedCustomersBase, myLocation, coordsById, distanceOrigin, routeTimeByClientId]
  )

  const resolvedCustomers = useMemo(
    () => sanitizeClients(distanceViewModel.clients),
    [distanceViewModel.clients]
  )
  const renderableClients = useMemo(
    () => resolvedCustomers.filter(client => hasRenderableCoordinates(client)),
    [resolvedCustomers]
  )

  // Clear city distance cache when location or province changes
  useEffect(() => {
    cityDistanceCacheRef.current.clear()
  }, [myLocation, selectedProvince])

  // City groups for sidebar - uses distanceViewModel.cities for sorted grouping
  const cityGroups = useMemo(() => {
    return distanceViewModel.cities
  }, [distanceViewModel.cities])

  // Auto-expand city groups when filtered results are small enough to scan
  useEffect(() => {
    if (!selectedCity && !selectedProvince && !searchTerm) {
      // No filter → collapse all
      setExpandedCities(new Set())
      return
    }
    // Only auto-expand when the filtered result is manageable (≤ 5 city groups)
    // or when a specific city is selected (always exactly 1 group)
    if (selectedCity || cityGroups.length <= 5) {
      setExpandedCities(new Set(cityGroups.map(g => `${g.province}|${g.city}`)))
    } else {
      setExpandedCities(new Set())
    }
  }, [selectedProvince, selectedCity, searchTerm, cityGroups])

  const selectedCustomer = useMemo(
    () => resolvedCustomers.find(customer => customer.id === selectedCustomerId) ?? null,
    [resolvedCustomers, selectedCustomerId]
  )

  const clearMarkers = useCallback(() => {
    markerRegistryRef.current.clear()
  }, [])

  const upsertMarkerForClient = useCallback((client: ResolvedMapClient, marker: LeafletMarker | null) => {
    if (marker) {
      markerRegistryRef.current.set(client.id, marker)
      return
    }

    markerRegistryRef.current.delete(client.id)
  }, [])

  const renderAllMarkers = useCallback((clients: unknown) => {
    return sanitizeClients(clients).filter(client => hasRenderableCoordinates(client))
  }, [])

  const markerClients = useMemo(() => renderAllMarkers(resolvedCustomers), [renderAllMarkers, resolvedCustomers])

  useEffect(() => {
    clearMarkers()
  }, [clearMarkers, markerClients.length])

  const buildMapsSearchUrl = useCallback((client: ResolvedMapClient) => {
    const coords = getClientRenderableCoordinates(client)
    if (coords) {
      return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`
  }, [])

  const buildMapsDirectionsUrl = useCallback((client: ResolvedMapClient) => {
    const coords = getClientRenderableCoordinates(client)
    const destination = coords ? `${coords.lat},${coords.lng}` : client.address
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
  }, [])

  const invalidateMapSoon = useCallback(() => {
    window.setTimeout(() => {
      mapRef.current?.invalidateSize()
    }, 300)
  }, [])

  useEffect(() => {
    invalidateMapSoon()
  }, [invalidateMapSoon, sheetOpen, selectedCustomerId])

  useEffect(() => {
    console.table(
      resolvedCustomers.map(client => ({
        name: client.name,
        city: client.city,
        address: client.address,
        originalLat: client.originalLat,
        originalLng: client.originalLng,
        finalLat: client.finalLat,
        finalLng: client.finalLng,
        geocodeStatus: client.geocodeStatus,
        geocodeReason: client.geocodeReason,
        distanceFromUser: client.distanceFromUser,
        nearestNeighborDistanceInCity: client.nearestNeighborDistanceInCity,
      }))
    )
  }, [resolvedCustomers])

  useEffect(() => {
    const sinCoordenadasRows = resolvedCustomers
      .filter(client => !getClientRenderableCoordinates(client))
      .map(client => {
        const src = client.sourceCustomer
        const hasLat = typeof src.latitude === 'number' && Number.isFinite(src.latitude)
        const hasLng = typeof src.longitude === 'number' && Number.isFinite(src.longitude)
        const hasAddress = Boolean(src.address && src.address.trim().length >= 4)
        const hasCity = Boolean(src.city && src.city.trim())

        let missingReason: string
        if (!hasLat && !hasLng) {
          missingReason = 'missing_lat_lng'
        } else if (hasLat && hasLng && (client.geocodeStatus === 'sea_suspect')) {
          missingReason = 'sea_suspect_coords'
        } else if (hasLat && hasLng && client.geocodeStatus === 'invalid') {
          missingReason = 'invalid_lat_lng'
        } else if (!hasAddress && !hasCity) {
          missingReason = 'incomplete_address'
        } else if (!hasAddress) {
          missingReason = 'missing_street_address'
        } else if (client.geocodeStatus === 'invalid') {
          missingReason = 'geocode_failed'
        } else {
          missingReason = 'pending_validation'
        }

        return {
          id: client.id,
          name: client.name,
          province: client.province,
          city: client.city,
          address: client.address,
          latitude: src.latitude ?? null,
          longitude: src.longitude ?? null,
          hasPreciseLocation: Boolean(hasLat && hasLng && client.geocodeStatus === 'valid'),
          isApproximate: client.geocodeStatus === 'approximate',
          geocodeStatus: client.geocodeStatus,
          geocodeReason: client.geocodeReason,
          missingReason,
        }
      })

    if (sinCoordenadasRows.length > 0) {
      console.log(`[SIN_COORDENADAS] ${sinCoordenadasRows.length} clients without renderable coordinates:`)
      console.table(sinCoordenadasRows)

      const byReason = sinCoordenadasRows.reduce<Record<string, number>>((acc, row) => {
        acc[row.missingReason] = (acc[row.missingReason] || 0) + 1
        return acc
      }, {})
      console.log('[SIN_COORDENADAS] breakdown by reason:', byReason)
    }
  }, [resolvedCustomers])

  useEffect(() => {
    const uniqueCoords = new Set(
      markerClients
        .map(client =>
          getClientRenderableCoordinates(client)
            ? `${getClientRenderableCoordinates(client)?.lat.toFixed(5)},${getClientRenderableCoordinates(client)?.lng.toFixed(5)}`
            : null
        )
        .filter(Boolean)
    )

    const stats = {
      totalRenderableClients: markerClients.length,
      totalMarkersRendered: markerRegistryRef.current.size,
      uniqueCoords: uniqueCoords.size,
      validMarkersCount: markerClients.filter(client => client.geocodeStatus === 'valid').length,
      approximateMarkersCount: markerClients.filter(client => client.geocodeStatus === 'approximate').length,
      invalidMarkersCount: resolvedCustomers.filter(
        client => client.geocodeStatus === 'invalid' || client.geocodeStatus === 'sea_suspect'
      ).length,
    }

    console.log('[MAP_MARKERS] stats:', stats)

    if (stats.totalMarkersRendered > stats.totalRenderableClients) {
      console.warn('[MAP_MARKERS] Marker registry exceeds renderable clients', stats)
    }
  }, [markerClients, resolvedCustomers])

  useEffect(() => {
    if (selectedProvince !== 'Cádiz') return

    const cadizRows = markerClients.map(client => {
      const coords = getClientRenderableCoordinates(client)
      const audit = getCoordinateAuditForClient(client.sourceCustomer, coordsById[client.id])
      return {
        id: client.id,
        name: client.name,
        province: client.province,
        city: client.city,
        address: client.address,
        latitude: client.originalLat,
        longitude: client.originalLng,
        isApproximate: client.geocodeStatus === 'approximate',
        hasPreciseLocation: audit.hasExactCoords,
        finalMarkerLat: coords?.lat ?? null,
        finalMarkerLng: coords?.lng ?? null,
        coordinateSource: audit.source,
        geocodeStatus: audit.geocodeStatus,
        inSea: coords ? isLikelyInSea(coords.lat, coords.lng) : false,
      }
    })

    console.log('[MAP_CADIZ_DEBUG] renderable marker rows:', cadizRows.length)
    console.table(cadizRows)
    console.table(cadizRows.filter(row => row.inSea))
  }, [selectedProvince, markerClients, coordsById])

  const markerBoundsKey = useMemo(() => {
    return markerClients
      .map(client => getClientRenderableCoordinates(client))
      .filter((coords): coords is MapCoordinates => Boolean(coords))
      .map(coords => `${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}`)
      .sort()
      .join('|')
  }, [markerClients])

  const defaultCenter: LatLngExpression = useMemo(() => {
    const firstCoordKey = markerBoundsKey.split('|')[0]
    if (firstCoordKey) {
      const [lat, lng] = firstCoordKey.split(',').map(Number)
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return [lat, lng]
      }
    }
    return [36.6867, -6.1371]
  }, [markerBoundsKey])

  const mapBounds = useMemo<LatLngBoundsExpression | null>(() => {
    const points: [number, number][] = [
      ...markerClients
        .map(client => getClientRenderableCoordinates(client))
        .filter((coords): coords is MapCoordinates => Boolean(coords))
        .map(coords => [coords.lat, coords.lng] as [number, number]),
    ]

    return points.length > 0 ? points : null
  }, [markerBoundsKey])

  const fitToAll = useCallback(() => {
    if (!mapRef.current || fittingAll) return
    setFittingAll(true)

    try {
      if (mapBounds) {
        mapRef.current.fitBounds(mapBounds, { padding: [48, 48] })
      } else {
        mapRef.current.setView(defaultCenter, 8)
      }
    } finally {
      setFittingAll(false)
    }
  }, [defaultCenter, fittingAll, mapBounds])

  const locateMe = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationMessage('No se pudo obtener tu ubicación.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        if (
          !isValidCoordinate(coords.lat, coords.lng) ||
          !isWithinServiceArea(coords.lat, coords.lng) ||
          isLikelyInSea(coords.lat, coords.lng)
        ) {
          setLocationMessage('Tu ubicación está fuera de la zona de trabajo. Se mantiene el mapa actual.')
          return
        }

        setMyLocation(coords)
        setLocationMessage('Distancias actualizadas desde tu ubicación.')
        mapRef.current?.flyTo([coords.lat, coords.lng], 13, { duration: 0.8 })
      },
      error => {
        console.debug('Geolocation error:', error.message)
        setLocationMessage('No se pudo obtener tu ubicación. Se mantiene la base actual.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }, [])

  // Filtra los clientes visibles dentro del encuadre actual del mapa (móvil)
  const searchThisArea = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const bounds = map.getBounds()
    const inArea = resolvedCustomers.filter(client => {
      const coords = getClientRenderableCoordinates(client)
      return coords ? bounds.contains([coords.lat, coords.lng] as [number, number]) : false
    })
    setAreaClients(inArea)
    setSheetOpen(true)
  }, [resolvedCustomers])

  const flyToCustomer = useCallback(
    async (customer: ResolvedMapClient) => {
      setSelectedCustomerId(customer.id)

      let target = customer
      if (!getClientRenderableCoordinates(customer)) {
        const audit = await ensureCustomerCoordinates(customer.sourceCustomer, true)
        persistCoordinateCache({ [customer.id]: audit })
        target = buildResolvedMapClient(
          customer.sourceCustomer,
          audit,
          getCustomerDisplayAddress(customer.sourceCustomer),
          deriveCity(customer.sourceCustomer),
          deriveProvince(customer.sourceCustomer),
          getCustomerPhone(customer.sourceCustomer)
        )
      }

      const coords = getClientRenderableCoordinates(target)
      if (!coords) return

      mapRef.current?.flyTo([coords.lat, coords.lng], 14, { duration: 0.8 })
      window.setTimeout(() => {
        mapRef.current?.invalidateSize()
        markerRegistryRef.current.get(target.id)?.openPopup()
      }, 300)
    },
    [ensureCustomerCoordinates, persistCoordinateCache]
  )

  const preciseLocate = useCallback(async () => {
    if (locatingAllPrecise) return
    setLocatingAllPrecise(true)

    try {
      geocodeAttemptedRef.current.clear()
      const batchEntries: CoordinateCache = {}

      for (const customer of filteredCustomers) {
        const audit = await ensureCustomerCoordinates(customer, true)
        batchEntries[customer.id] = audit
        await new Promise(resolve => setTimeout(resolve, 150))
      }

      if (Object.keys(batchEntries).length > 0) {
        persistCoordinateCache(batchEntries)
      }
    } finally {
      setLocatingAllPrecise(false)
    }
  }, [ensureCustomerCoordinates, filteredCustomers, locatingAllPrecise, persistCoordinateCache])

  // Detect suspicious coordinates that need repair
  const detectSuspiciousCoordinates = useCallback((customer: Customer): boolean => {
    const lat = typeof customer.latitude === 'number' ? customer.latitude : null
    const lng = typeof customer.longitude === 'number' ? customer.longitude : null

    if (lat === null || lng === null) return false

    // Check if coordinates are in the sea
    if (isLikelyInSea(lat, lng)) return true

    // Check if coordinates are suspiciously far from city center
    if (isSuspiciousDistanceFromCityCenter(customer, lat, lng)) return true

    // Check if existing audit shows invalid status
    const audit = getCoordinateAuditForClient(customer, coordsById[customer.id])
    if (audit.geocodeStatus === 'invalid' || audit.geocodeStatus === 'sea_suspect') return true

    return false
  }, [coordsById])

  // Repair all customers with suspicious coordinates
  const repairAllSuspiciousCoordinates = useCallback(async () => {
    if (repairingCoordinates) return
    setRepairingCoordinates(true)
    setRepairStats(null)

    const stats = { total: 0, repaired: 0, failed: 0, skipped: 0 }

    try {
      // Clear all geocode attempts to force re-evaluation
      geocodeAttemptedRef.current.clear()

      // Find customers with suspicious coordinates
      const customersToRepair = filteredCustomers.filter(customer => {
        const isSuspicious = detectSuspiciousCoordinates(customer)
        if (isSuspicious) stats.total++
        return isSuspicious
      })

      if (customersToRepair.length === 0) {
        setLocationMessage('No se encontraron coordenadas sospechosas para reparar')
        setRepairStats(stats)
        return
      }

      const batchEntries: CoordinateCache = {}

      for (const customer of customersToRepair) {
        // Force clear cached audit for this customer
        const existingEntry = coordsById[customer.id]
        if (existingEntry) {
          delete coordsById[customer.id]
        }

        // Re-geocode with force flag
        const audit = await ensureCustomerCoordinates(customer, true)
        batchEntries[customer.id] = audit

        // Update stats based on result
        if (audit.geocodeStatus === 'valid') {
          stats.repaired++
        } else if (audit.geocodeStatus === 'approximate') {
          stats.repaired++ // Approximate is still better than sea/invalid
        } else {
          stats.failed++
        }

        await new Promise(resolve => setTimeout(resolve, 200))
      }

      // Update customers without suspicious coordinates (they're already fine)
      stats.skipped = filteredCustomers.length - customersToRepair.length

      // Persist all changes
      if (Object.keys(batchEntries).length > 0) {
        persistCoordinateCache(batchEntries)
      }

      setRepairStats(stats)
      setLocationMessage(`Reparación completada: ${stats.repaired} reparados, ${stats.failed} fallidos, ${stats.skipped} correctos`)
    } catch (error) {
      console.error('[REPAIR_ALL] Error:', error)
      setLocationMessage('Error durante la reparación de coordenadas')
    } finally {
      setRepairingCoordinates(false)
    }
  }, [coordsById, detectSuspiciousCoordinates, ensureCustomerCoordinates, filteredCustomers, persistCoordinateCache, repairingCoordinates])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Cabecera y filtros: solo escritorio/tablet — en móvil el mapa es pantalla completa */}
      <div className="hidden gap-4 md:flex md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.maps.title}</h1>
          <p className="text-gray-600">{t.maps.subtitle}</p>
          {(selectedCity || selectedProvince || searchTerm) && (
            <div className="mt-2 inline-block rounded-lg bg-blue-50 px-3 py-1 text-sm text-blue-600">
              {resolvedCustomers.length} clientes
              {selectedCity
                ? ` en ${selectedCity}`
                : selectedProvince
                  ? ` en provincia ${selectedProvince}`
                  : ''}
            </div>
          )}
          {locationMessage && (
            <div className="mt-2 inline-block rounded-lg bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {locationMessage}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={distanceMode}
              onChange={e => setDistanceMode(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-sm font-medium text-gray-700">Modo distancia (km/min)</span>
          </label>
          {distanceMode && (
            <button
              onClick={async () => {
                setLocationMessage('Obteniendo ubicación...')
                const location = await getUserLocation()
                if (location) {
                  setDistanceOrigin({ name: 'Mi ubicación', coords: location })
                  setLocationMessage('Usando tu ubicación actual')
                } else {
                  setLocationMessage('No se pudo obtener la ubicación')
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
            >
              <LocateFixed className="h-4 w-4" />
              <span>Mi ubicación</span>
            </button>
          )}
        </div>
      </div>

      <div className="hidden rounded-xl border border-gray-200 bg-white p-6 shadow-sm md:block">
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={t.maps.searchPlaceholder}
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="sm:w-48">
            <select
              value={selectedProvince}
              onChange={event => {
                setSelectedProvince(event.target.value)
                setSelectedCity('')
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas las Provincias</option>
              {provinces.map(province => (
                <option key={province} value={province}>
                  {province}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:w-48">
            <select
              value={selectedCity}
              onChange={event => setSelectedCity(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas las Ciudades</option>
              {getFilteredCities().map(city => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:w-32">
            <button
              onClick={() => {
                setSearchTerm('')
                setSelectedProvince('')
                setSelectedCity('')
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Coordinate Repair Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={repairAllSuspiciousCoordinates}
            disabled={repairingCoordinates}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {repairingCoordinates ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                <span>Reparando...</span>
              </>
            ) : (
              <>
                <LocateFixed className="h-4 w-4" />
                <span>Reparar coordenadas</span>
              </>
            )}
          </button>
          <button
            onClick={preciseLocate}
            disabled={locatingAllPrecise}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {locatingAllPrecise ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                <span>Geocodificando...</span>
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4" />
                <span>Geocodificar todos</span>
              </>
            )}
          </button>
          {repairStats && (
            <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm">
              <span className="text-green-600 font-medium">{repairStats.repaired} reparados</span>
              {repairStats.failed > 0 && (
                <span className="text-red-600">· {repairStats.failed} fallidos</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="hidden space-y-6 md:block lg:col-span-1">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900">{t.maps.customerList}</h2>
              <p className="text-sm text-gray-600">
                {resolvedCustomers.length} {t.maps.customersFound}
                {resolvedCustomers.length > renderableClients.length && (
                  <span className="text-xs text-amber-600 ml-1">
                    ({renderableClients.length} en mapa · {resolvedCustomers.length - renderableClients.length} sin coordenadas)
                  </span>
                )}
              </p>
            </div>
            <div className="max-h-[720px] overflow-y-auto">
              {resolvedCustomers.length === 0 ? (
                <div className="py-8 text-center">
                  <MapPin className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                  <p className="text-gray-600">{t.maps.noCustomersFound}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {cityGroups.map(cityGroup => {
                    const cityKey = `${cityGroup.province}|${cityGroup.city}`
                    const isExpanded = expandedCities.has(cityKey)

                    return (
                      <div key={cityKey}>
                        <button
                          className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50"
                          onClick={() => {
                            setExpandedCities(prev => {
                              const next = new Set(prev)
                              if (next.has(cityKey)) next.delete(cityKey)
                              else next.add(cityKey)
                              return next
                            })
                          }}
                        >
                          <div className="min-w-0">
                            <span className="text-sm font-semibold text-gray-900">{cityGroup.city}</span>
                            <span className="ml-2 text-xs text-gray-500">
                              {cityGroup.clientCount} {cityGroup.clientCount === 1 ? 'cliente' : 'clientes'}
                              {(() => {
                                const onMap = cityGroup.clients.filter(c => hasRenderableCoordinates(c)).length
                                return onMap < cityGroup.clientCount ? (
                                  <span className="text-amber-500 ml-1">({onMap} en mapa)</span>
                                ) : null
                              })()}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {cityGroup.nearestDistanceFromUser !== null && (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                {formatDistanceKm(cityGroup.nearestDistanceFromUser, '')}
                              </span>
                            )}
                            <span className="text-xs text-gray-400">{isExpanded ? '▾' : '▸'}</span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="divide-y divide-gray-100 bg-gray-50/50">
                            {cityGroup.clients.map(customer => (
                              <div
                                key={customer.id}
                                className={`cursor-pointer p-4 pl-6 transition-colors hover:bg-gray-100 ${
                                  selectedCustomerId === customer.id ? 'border-r-2 border-blue-500 bg-blue-50' : ''
                                }`}
                                onClick={() => flyToCustomer(customer)}
                              >
                                <div className="flex items-start space-x-3">
                                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                                    <span className="text-sm font-medium text-blue-600">
                                      {customer.name.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <h3 className="truncate text-sm font-medium text-gray-900">
                                      {isValidClient(customer) ? customer.name : 'Cliente no disponible'}
                                    </h3>
                                    {customer.company && (
                                      <p className="truncate text-xs text-gray-600">{customer.company}</p>
                                    )}

                                    <div className="mt-1 flex items-start">
                                      <MapPin className="mr-1 mt-0.5 h-3 w-3 flex-shrink-0 text-gray-400" />
                                      <span className="break-words text-xs text-gray-600">{customer.address}</span>
                                    </div>

                                    <div className="mt-2 space-y-1 text-[11px] text-gray-500">
                                      <div>
                                        Distancia desde mi ubicación:{' '}
                                        {formatDistanceKm(customer.distanceFromUser, 'Distancia no disponible')}
                                      </div>
                                      {customer.nearestNeighborDistanceInCity !== null &&
                                        customer.nearestNeighborDistanceInCity !== customer.distanceFromUser && (
                                        <div>
                                          Cliente más cercano:{' '}
                                          {formatDistanceKm(
                                            customer.nearestNeighborDistanceInCity,
                                            'Distancia no disponible'
                                          )}
                                        </div>
                                      )}
                                      {customer.geocodeStatus === 'approximate' && (
                                        <div className="text-amber-600">
                                          Cliente aproximado. Dirección pendiente de validación.
                                        </div>
                                      )}
                                      {(customer.geocodeStatus === 'invalid' ||
                                        customer.geocodeStatus === 'sea_suspect') && (
                                        <div className="font-medium text-rose-600">Revisar: {customer.geocodeReason}</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {selectedCustomer && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-200 p-4">
                <h3 className="text-lg font-semibold text-gray-900">Detalles del Cliente</h3>
                <button
                  onClick={() => setSelectedCustomerId(null)}
                  className="text-gray-400 transition-colors hover:text-gray-600"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-medium text-gray-900">{selectedCustomer.name}</h4>
                    {selectedCustomer.company && (
                      <p className="text-sm text-gray-600">{selectedCustomer.company}</p>
                    )}
                  </div>

                  {selectedCustomer.phone && (
                    <div className="flex items-center space-x-2">
                      <Phone className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-700">{selectedCustomer.phone}</span>
                    </div>
                  )}

                  {selectedCustomer.email && (
                    <div className="flex items-center space-x-2">
                      <Mail className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-700">{selectedCustomer.email}</span>
                    </div>
                  )}

                  <div className="flex items-start space-x-2">
                    <MapPin className="mt-0.5 h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{selectedCustomer.address}</span>
                  </div>

                  <div className="space-y-1 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                    <div>
                      Distancia desde mi ubicación:{' '}
                      {formatDistanceKm(selectedCustomer.distanceFromUser, 'Distancia no disponible')}
                    </div>
                    {selectedCustomer.nearestNeighborDistanceInCity !== null &&
                      selectedCustomer.nearestNeighborDistanceInCity !== selectedCustomer.distanceFromUser && (
                      <div>
                        Cliente más cercano:{' '}
                        {formatDistanceKm(
                          selectedCustomer.nearestNeighborDistanceInCity,
                          'Distancia no disponible'
                        )}
                      </div>
                    )}
                    {selectedCustomer.geocodeStatus === 'approximate' && (
                      <div className="text-amber-600">
                        Cliente aproximado. Dirección pendiente de validación.
                      </div>
                    )}
                    {selectedCustomer.geocodeStatus !== 'valid' && (
                      <div className="text-rose-600">{selectedCustomer.geocodeReason}</div>
                    )}
                  </div>

                  <div className="space-y-2 border-t border-gray-200 pt-3">
                    <button
                      onClick={() => window.open(buildMapsSearchUrl(selectedCustomer), '_blank')}
                      className="inline-flex w-full items-center justify-center space-x-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>Abrir en Mapas</span>
                    </button>
                    <button
                      onClick={() => window.open(buildMapsDirectionsUrl(selectedCustomer), '_blank')}
                      className="inline-flex w-full items-center justify-center space-x-2 rounded-lg bg-green-600 px-3 py-2 text-sm text-white transition-colors hover:bg-green-700"
                    >
                      <Navigation className="h-4 w-4" />
                      <span>Obtener Direcciones</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-3">
          {/* En móvil el mapa ocupa toda la pantalla (debajo de la barra de pestañas) */}
          <div className="max-md:fixed max-md:inset-0 max-md:z-40 overflow-hidden md:rounded-xl md:border md:border-gray-200 bg-white md:shadow-sm">
            <div className="relative h-[800px] max-md:h-full">
              <div className="absolute right-3 top-3 z-[1000] hidden gap-2 md:flex">
                <button
                  onClick={fitToAll}
                  title="Ver todos"
                  disabled={fittingAll}
                  aria-busy={fittingAll}
                  className={`inline-flex items-center space-x-1 rounded-md border px-2 py-1.5 shadow transition-colors sm:space-x-2 sm:px-3 sm:py-2 ${
                    fittingAll
                      ? 'cursor-not-allowed bg-gray-100'
                      : 'bg-white/90 backdrop-blur hover:bg-white'
                  }`}
                >
                  <span className="text-xs text-gray-700">{fittingAll ? 'Ajustando…' : 'Ver todos'}</span>
                </button>
                <button
                  onClick={preciseLocate}
                  title="Localización precisa"
                  disabled={locatingAllPrecise}
                  aria-busy={locatingAllPrecise}
                  className={`inline-flex items-center space-x-1 rounded-md border px-2 py-1.5 shadow transition-colors sm:space-x-2 sm:px-3 sm:py-2 ${
                    locatingAllPrecise
                      ? 'cursor-not-allowed bg-gray-100'
                      : 'bg-white/90 backdrop-blur hover:bg-white'
                  }`}
                >
                  <span className="text-xs text-gray-700">
                    {locatingAllPrecise ? 'Geocodificando…' : 'Localización precisa'}
                  </span>
                </button>
                <button
                  onClick={locateMe}
                  title="Mi ubicación"
                  className="inline-flex items-center space-x-1 rounded-md border bg-white/90 px-2 py-1.5 shadow backdrop-blur hover:bg-white sm:px-3 sm:py-2"
                >
                  <LocateFixed className="h-4 w-4 text-blue-600" />
                  <span className="text-xs text-gray-700">Mi ubicación</span>
                </button>
              </div>

              <MapContainer style={{ height: '100%', width: '100%' }} center={defaultCenter} zoom={8}>
                <MapViewport
                  bounds={mapBounds}
                  defaultCenter={defaultCenter as [number, number]}
                  filterProvince={selectedProvince}
                  filterCity={selectedCity}
                />
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                <MarkerClusterGroup
                  iconCreateFunction={(cluster: { getChildCount: () => number }) => {
                    const count = cluster.getChildCount()
                    return L.divIcon({
                      html: `<div style="background:${MARKER_BLUE};color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);">${count}</div>`,
                      className: '',
                      iconSize: L.point(36, 36),
                    })
                  }}
                  maxClusterRadius={35}
                  spiderfyOnMaxZoom
                  spiderfyOnEveryZoom
                  spiderfyDistanceMultiplier={3}
                  disableClusteringAtZoom={15}
                  showCoverageOnHover={false}
                  zoomToBoundsOnClick
                  animate
                >
                  {markerClients.map(client => {
                    const coords = getClientRenderableCoordinates(client)
                    if (!coords) return null

                    const popupSummary = buildClientPopupHtml(client, myLocation)

                    return (
                      <Marker
                        key={client.id}
                        position={[coords.lat, coords.lng]}
                        icon={createCustomerIcon(
                          client.geocodeStatus,
                          client.id === selectedCustomerId
                        )}
                        ref={marker => upsertMarkerForClient(client, marker)}
                        eventHandlers={{
                          click: () => setSelectedCustomerId(client.id),
                        }}
                      >
                        <Popup minWidth={280}>
                          <div className="space-y-3" data-popup-summary={popupSummary}>
                            <div className="border-b border-gray-200 pb-2">
                              <div className="text-base font-semibold text-gray-900">{client.name}</div>
                              {client.company && (
                                <div className="mt-1 text-sm text-gray-600">{client.company}</div>
                              )}
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-start space-x-2">
                                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                                <div className="text-sm text-gray-700">{client.address}</div>
                              </div>

                              <div className="text-sm text-gray-700">
                                Distancia desde mi ubicación:{' '}
                                {formatDistanceKm(client.distanceFromUser, 'Distancia no disponible')}
                              </div>
                              <div className="text-sm text-gray-700">
                                Cliente más cercano:{' '}
                                {formatDistanceKm(
                                  client.nearestNeighborDistanceInCity,
                                  'Distancia no disponible'
                                )}
                              </div>

                              {client.geocodeStatus === 'approximate' && (
                                <div className="text-sm text-amber-600">
                                  Cliente aproximado. Dirección pendiente de validación.
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-2">
                              {client.phone && (
                                <a
                                  href={`tel:${client.phone}`}
                                  className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-600 transition-colors hover:bg-blue-100"
                                >
                                  <Phone className="mr-1 h-3 w-3" /> Llamar
                                </a>
                              )}
                              <button
                                onClick={() => window.open(buildMapsDirectionsUrl(client), '_blank')}
                                className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs text-green-600 transition-colors hover:bg-green-100"
                              >
                                <Navigation className="mr-1 h-3 w-3" /> Direcciones
                              </button>
                              <button
                                onClick={() => window.open(buildMapsSearchUrl(client), '_blank')}
                                className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs text-indigo-600 transition-colors hover:bg-indigo-100"
                              >
                                <ExternalLink className="mr-1 h-3 w-3" /> Google Maps
                              </button>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    )
                  })}
                </MarkerClusterGroup>

                {myLocation && (
                  <Marker position={[myLocation.lat, myLocation.lng]} icon={myLocationIcon}>
                    <Popup>Mi ubicación</Popup>
                  </Marker>
                )}

                <MapBridge mapRef={mapRef} />
              </MapContainer>

              {/* Map legend + stats (solo escritorio — en móvil lo sustituye la hoja inferior) */}
              <div className="absolute bottom-4 right-3 hidden bg-white rounded-lg shadow-md border border-gray-200 p-3 text-xs space-y-1.5 z-[1000] min-w-[170px] md:block">
                <div className="font-semibold text-gray-600 mb-1">Leyenda</div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow"></span> Cliente preciso
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-600 border-2 border-dashed border-amber-500 shadow"></span> Cliente aproximado
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-600 border-[3px] border-white shadow" style={{ boxShadow: '0 0 0 4px rgba(220,38,38,.18), 0 4px 12px rgba(220,38,38,.18)' }}></span> Mi ubicación
                </div>
                <div className="border-t border-gray-200 pt-1.5 mt-1.5 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">En mapa</span>
                    <span className="font-semibold text-blue-600">{markerClients.length}</span>
                  </div>
                  {resolvedCustomers.length > markerClients.length && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-500">Sin coordenadas</span>
                      <span className="font-semibold text-amber-600">{resolvedCustomers.length - markerClients.length}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-1">
                    <span className="text-gray-600 font-medium">Total</span>
                    <span className="font-bold text-gray-800">{resolvedCustomers.length}</span>
                  </div>
                </div>
              </div>

              {/* ── Superposiciones móviles (estilo app, solo <md) ── */}

              {/* Barra de búsqueda flotante */}
              <div
                className="absolute inset-x-3 z-[1010] md:hidden"
                style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
              >
                <div className="flex items-center gap-2 rounded-full border border-white/60 bg-white/85 px-4 shadow-lg backdrop-blur-md">
                  <Search className="h-5 w-5 flex-shrink-0 text-gray-500" />
                  <input
                    type="text"
                    placeholder={t.maps.searchPlaceholder}
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                    onFocus={() => setSheetOpen(true)}
                    className="h-12 w-full bg-transparent text-[15px] text-gray-900 placeholder-gray-500 focus:outline-none"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-500 active:bg-gray-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Botón "Buscar en esta zona" */}
              <div
                className="absolute inset-x-0 z-[1009] flex justify-center md:hidden"
                style={{ top: 'calc(env(safe-area-inset-top) + 72px)' }}
              >
                <button
                  onClick={searchThisArea}
                  className="rounded-full border border-white/60 bg-white/85 px-4 py-2 text-sm font-medium text-blue-600 shadow-lg backdrop-blur-md transition active:scale-95"
                >
                  Buscar en esta zona
                </button>
              </div>

              {locationMessage && (
                <div
                  className="absolute inset-x-4 z-[1009] flex justify-center md:hidden"
                  style={{ top: 'calc(env(safe-area-inset-top) + 118px)' }}
                >
                  <div className="max-w-full rounded-full border border-white/60 bg-white/90 px-4 py-2 text-center text-xs font-medium text-slate-700 shadow-lg backdrop-blur-md">
                    {locationMessage}
                  </div>
                </div>
              )}

              {/* Botones circulares flotantes (lado derecho) */}
              <div
                className="absolute right-3 z-[1009] flex flex-col gap-3 md:hidden"
                style={{ bottom: 'calc(env(safe-area-inset-bottom) + 170px)' }}
              >
                <button
                  onClick={locateMe}
                  title="Mi ubicación"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/85 shadow-lg backdrop-blur-md transition active:scale-95"
                >
                  <LocateFixed className="h-6 w-6 text-blue-600" />
                </button>
                <button
                  onClick={fitToAll}
                  disabled={fittingAll}
                  title="Ver todos"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/85 shadow-lg backdrop-blur-md transition active:scale-95 disabled:opacity-50"
                >
                  <Expand className="h-6 w-6 text-gray-700" />
                </button>
                {selectedCustomer && (
                  <button
                    onClick={() => window.open(buildMapsDirectionsUrl(selectedCustomer), '_blank')}
                    title="Navegar"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 shadow-lg transition active:scale-95"
                  >
                    <Navigation className="h-6 w-6 text-white" />
                  </button>
                )}
              </div>

              {/* Píldora resumen / hoja inferior */}
              {!sheetOpen ? (
                <div
                  className="absolute inset-x-0 z-[1010] flex justify-center md:hidden"
                  style={{ bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}
                >
                  <button
                    onClick={() => setSheetOpen(true)}
                    className="flex items-center gap-2 rounded-full border border-white/60 bg-white/90 px-5 py-3 text-sm font-medium text-gray-800 shadow-xl backdrop-blur-md transition active:scale-95"
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                    <span>{markerClients.length} en mapa · {resolvedCustomers.length} clientes</span>
                  </button>
                </div>
              ) : (
                <div className="absolute inset-x-0 bottom-0 z-[1011] flex max-h-[60%] flex-col rounded-t-2xl bg-white shadow-2xl md:hidden">
                  <button
                    className="flex w-full flex-col items-center pb-1 pt-2"
                    onClick={() => setSheetOpen(false)}
                  >
                    <span className="h-1 w-10 rounded-full bg-gray-300" />
                  </button>
                  <div className="flex items-center justify-between px-4 pb-2">
                    <div className="text-sm font-semibold text-gray-900">
                      {areaClients
                        ? `${areaClients.length} en esta zona`
                        : `${resolvedCustomers.length} clientes`}
                    </div>
                    <div className="flex items-center gap-2">
                      {areaClients && (
                        <button
                          onClick={() => setAreaClients(null)}
                          className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 active:bg-blue-100"
                        >
                          Quitar filtro
                        </button>
                      )}
                      <button
                        onClick={() => setSheetOpen(false)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200"
                      >
                        <ChevronDown className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                  <div
                    className="overflow-y-auto overscroll-contain"
                    style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}
                  >
                    {(areaClients ?? resolvedCustomers).length === 0 ? (
                      <div className="py-10 text-center">
                        <MapPin className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                        <p className="text-sm text-gray-500">{t.maps.noCustomersFound}</p>
                      </div>
                    ) : (
                      (areaClients ?? resolvedCustomers).map(client => (
                        <button
                          key={client.id}
                          onClick={() => {
                            setSheetOpen(false)
                            flyToCustomer(client)
                          }}
                          className="flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors active:bg-blue-50"
                        >
                          <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                            {client.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[15px] font-medium text-gray-900">{client.name}</div>
                            <div className="truncate text-xs text-gray-500">
                              {[client.city, client.province].filter(Boolean).join(', ')}
                            </div>
                          </div>
                          <div className="mt-1 flex flex-shrink-0 flex-col items-end gap-1">
                            {client.distanceFromUser !== null && (
                              <span className="text-xs font-medium text-blue-600">
                                {formatDistanceKm(client.distanceFromUser, '')}
                              </span>
                            )}
                            {!hasRenderableCoordinates(client) && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                                sin mapa
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MapBridge({ mapRef }: { mapRef: React.MutableRefObject<LeafletMap | null> }) {
  const map = useMap()

  useEffect(() => {
    mapRef.current = map
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 300)
    return () => window.clearTimeout(resizeTimer)
  }, [map, mapRef])

  return null
}
