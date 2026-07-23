import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { translations } from '../lib/translations'
import type { Customer, Visit } from '../lib/supabase'
import {
  ChevronDown,
  ChevronLeft,
  Compass,
  Crosshair,
  Expand,
  ExternalLink,
  LocateFixed,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Search,
  Ruler,
  X,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import {
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
  calculateDistanceKm,
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
  refreshMapAndSidebarDistances as refreshMapBasic,
  sanitizeClients,
  type ResolvedMapClient,
} from './mapsPageUtils'
import { PROVINCE_CENTERS } from '../utils/mapCentroids'
import { externalNavigationProvider, isAppleDevice, mapTileProvider } from '../services/mapProviders'
import { createCasmaraMarkerIcon } from '../components/map/CasmaraMarkerIcon'
import {
  createVehicleLocationIcon,
  getLocationAccuracyLabel,
} from '../components/map/VehicleLocationIcon'
import { VoiceSearchButton } from '../components/VoiceSearchButton'
import {
  OsrmRoutingProvider,
  formatRouteDistance,
  formatRouteDuration,
  routePointFromCoordinates,
  type RoutePoint,
  type RouteResult,
} from '../services/routingProvider'
import '../styles/casmara-marker.css'

type CoordinateCache = Record<string, ClientCoordinateAudit | MapCoordinates>
type MobileListMode = 'all' | 'mapped' | 'unmapped'
type MobileSheetSize = 'half' | 'full'
type VisitMarkerState = { scheduled: boolean; overdue: boolean }
type MapPointSelectionPurpose = 'origin' | 'destination' | 'choose'
type MeasureState =
  | 'idle'
  | 'selecting-a'
  | 'selecting-b'
  | 'calculating'
  | 'result'
  | 'error'
type MobileMapSheet =
  | 'none'
  | 'choose-origin'
  | 'choose-destination'
  | 'customer-choice'
  | 'select-map-point'
  | 'calculating'
  | 'route-result'
type LocationDetails = {
  accuracy: number | null
  heading: number | null
  speed: number | null
  updatedAt: Date
}

const routingProvider = new OsrmRoutingProvider()

const STORAGE_KEY = 'carmara-customer-coords'

const normalizeCityName = (value: string | null | undefined) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es-ES')
  .replace(/\s+/g, ' ')
  .trim()

const isCitySearch = (query: string, city: string) => {
  const queryTokens = normalizeCityName(query).split(' ').filter(token => token.length >= 3)
  const cityTokens = normalizeCityName(city).split(' ')
  return queryTokens.length > 0 && queryTokens.every(token => cityTokens.some(cityToken => cityToken.includes(token)))
}

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

// Province centers now imported from shared utils/mapCentroids.ts

function MapViewport({
  bounds,
  defaultCenter,
  filterProvince,
  filterCity,
  suspendAutoFit,
}: {
  bounds: LatLngBoundsExpression | null
  defaultCenter: [number, number]
  filterProvince: string
  filterCity: string
  suspendAutoFit: boolean
}) {
  const map = useMap()
  const filterKey = `${filterProvince}|${filterCity}`
  const prevFilterRef = useRef(filterKey)
  const wasSuspendedRef = useRef(false)

  useEffect(() => {
    map.invalidateSize({ pan: false })
    const resizeTimer = window.setTimeout(() => map.invalidateSize({ pan: false }), 300)

    if (suspendAutoFit) {
      wasSuspendedRef.current = true
      return () => window.clearTimeout(resizeTimer)
    }

    if (wasSuspendedRef.current) {
      wasSuspendedRef.current = false
      return () => window.clearTimeout(resizeTimer)
    }

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
  }, [bounds, defaultCenter, filterKey, filterProvince, map, suspendAutoFit])

  return null
}

export default function Maps() {
  const { user } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<Customer[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedProvince, setSelectedProvince] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [cityDetailMode, setCityDetailMode] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [distanceMode, setDistanceMode] = useState(false)
  const [distanceModeState, setDistanceModeState] = useState<MeasureState>('idle')
  const [mobileMapSheet, setMobileMapSheet] = useState<MobileMapSheet>('none')
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
  const [locationDetails, setLocationDetails] = useState<LocationDetails | null>(null)
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const [routeOrigin, setRouteOrigin] = useState<RoutePoint | null>(null)
  const [routeDestination, setRouteDestination] = useState<RoutePoint | null>(null)
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const [routeRequestVersion, setRouteRequestVersion] = useState(0)
  const [routeStops, setRouteStops] = useState<RoutePoint[]>([])
  const [routeSheetExpanded, setRouteSheetExpanded] = useState(false)
  const [mapPointSelectionMode, setMapPointSelectionMode] = useState(false)
  const [mapPointSelectionPurpose, setMapPointSelectionPurpose] = useState<MapPointSelectionPurpose>('choose')
  const [pendingMapPoint, setPendingMapPoint] = useState<RoutePoint | null>(null)
  const [mapPointHint, setMapPointHint] = useState<string | null>(null)
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
  const [sheetSize, setSheetSize] = useState<MobileSheetSize>('half')
  const [mobileListMode, setMobileListMode] = useState<MobileListMode>('all')
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRegistryRef = useRef(new Map<string, LeafletMarker>())
  const geocodeAttemptedRef = useRef(new Set<string>())
  const isGeocodingRef = useRef(false)
  const searchAbortRef = useRef<AbortController | null>(null)
  const cityDistanceCacheRef = useRef(new Map<string, import('./mapsPageUtils').CityDistanceSummary>())
  const t = translations

  const persistedDbCoordSignaturesRef = useRef(new Map<string, string>())
  const smoothedHeadingRef = useRef<number | null>(null)

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

  useEffect(() => {
    if (!user?.id) return

    const controller = new AbortController()
    fetch('/api/visits', { signal: controller.signal })
      .then(async response => {
        const result = await response.json()
        if (!response.ok || !result.success) throw new Error(result.error || 'Failed to load visits')
        setVisits(result.data || [])
      })
      .catch(error => {
        if (error.name !== 'AbortError') console.warn('Error loading visits for map markers:', error)
      })

    return () => controller.abort()
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

  useEffect(() => {
    const query = searchTerm.trim()
    searchAbortRef.current?.abort()
    if (query.length < 2) {
      setSearchResults(null)
      setSearchLoading(false)
      setSearchError(null)
      return
    }

    const controller = new AbortController()
    searchAbortRef.current = controller
    setSearchLoading(true)
    setSearchError(null)
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, limit: '30' })
        if (selectedProvince) params.set('province', selectedProvince)
        if (selectedCity) params.set('city', selectedCity)
        const response = await fetch(`/api/customers/search?${params}`, { signal: controller.signal })
        const result = await response.json()
        if (!response.ok || !result.success) throw new Error(result.error || 'No se pudo buscar clientes.')
        setSearchResults(result.data || [])
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setSearchError((error as Error).message || 'No se pudo buscar clientes.')
        }
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false)
      }
    }, 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [searchTerm, selectedCity, selectedProvince])

  const allMatchedCustomers = useMemo(() => {
    const source = searchResults ?? customers
    return source.filter(customer => {
      const province = deriveProvince(customer)
      const matchesProvince = !selectedProvince || province === selectedProvince
      return matchesProvince
    })
  }, [customers, searchResults, selectedProvince])

  const cityCustomers = useMemo(() => {
    if (!selectedCity) return allMatchedCustomers
    const normalizedSelectedCity = normalizeCityName(selectedCity)
    return allMatchedCustomers.filter(customer => normalizeCityName(deriveCity(customer)) === normalizedSelectedCity)
  }, [allMatchedCustomers, selectedCity])

  const filteredCustomers = cityCustomers

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
  const cityMappedCustomers = useMemo(
    () => resolvedCustomers.filter(client => hasRenderableCoordinates(client)),
    [resolvedCustomers]
  )
  const cityUnmappedCustomers = useMemo(
    () => resolvedCustomers.filter(client => !hasRenderableCoordinates(client)),
    [resolvedCustomers]
  )
  const renderableClients = cityMappedCustomers
  const searchActive = searchTerm.trim().length >= 2
  const mobileSummaryClients = resolvedCustomers
  const mobileSummaryMappedClients = useMemo(
    () => mobileSummaryClients.filter(client => hasRenderableCoordinates(client)),
    [mobileSummaryClients]
  )
  const mobileSummaryUnmappedClients = useMemo(
    () => mobileSummaryClients.filter(client => !hasRenderableCoordinates(client)),
    [mobileSummaryClients]
  )
  const mobileSheetClients = useMemo(() => {
    if (mobileListMode === 'mapped') return mobileSummaryMappedClients
    if (mobileListMode === 'unmapped') return mobileSummaryUnmappedClients
    return mobileSummaryClients
  }, [mobileListMode, mobileSummaryClients, mobileSummaryMappedClients, mobileSummaryUnmappedClients])
  const searchSuggestions = searchActive ? resolvedCustomers.slice(0, 8) : []

  // Clear city distance cache when location or province changes
  useEffect(() => {
    cityDistanceCacheRef.current.clear()
  }, [myLocation, selectedProvince])

  // City groups for sidebar - uses distanceViewModel.cities for sorted grouping
  const cityGroups = useMemo(() => {
    return distanceViewModel.cities
  }, [distanceViewModel.cities])

  const selectedCustomer = useMemo(
    () => resolvedCustomers.find(customer => customer.id === selectedCustomerId) ?? null,
    [resolvedCustomers, selectedCustomerId]
  )
  const routeDestinationCustomer = useMemo(
    () => routeDestination?.type === 'customer'
      ? resolvedCustomers.find(customer => customer.id === routeDestination.id) ?? null
      : null,
    [resolvedCustomers, routeDestination]
  )
  const preferredMapPointPurpose: 'origin' | 'destination' = useMemo(() => {
    if (mapPointSelectionPurpose !== 'choose') return mapPointSelectionPurpose
    return routeOrigin ? 'destination' : 'origin'
  }, [mapPointSelectionPurpose, routeOrigin])
  const nearestCustomer = useMemo(() => {
    if (!myLocation) return null
    return resolvedCustomers
      .filter(client => Number.isFinite(client.distanceFromUser))
      .sort((left, right) => (left.distanceFromUser ?? Infinity) - (right.distanceFromUser ?? Infinity))[0] ?? null
  }, [myLocation, resolvedCustomers])

  const customerRoutePoint = useCallback((customer: ResolvedMapClient) => {
    const coords = getClientRenderableCoordinates(customer)
    return coords
      ? routePointFromCoordinates('customer', customer.name, coords, customer.id)
      : null
  }, [])

  const currentLocationRoutePoint = useCallback(() => (
    myLocation ? routePointFromCoordinates('current-location', 'Mi ubicación', myLocation) : null
  ), [myLocation])

  const closeMapPointSelection = useCallback(() => {
    setMapPointSelectionMode(false)
    setMapPointSelectionPurpose('choose')
    setPendingMapPoint(null)
    setMapPointHint(null)
    if (distanceMode) {
      const nextState = routeOrigin ? 'selecting-b' : 'selecting-a'
      setDistanceModeState(nextState)
      setMobileMapSheet('none')
    }
  }, [distanceMode, routeOrigin])

  const updatePendingMapPoint = useCallback((coordinates: MapCoordinates) => {
    if (!isValidCoordinate(coordinates.lat, coordinates.lng)) {
      setLocationMessage('No hemos podido seleccionar este punto.')
      return
    }
    setPendingMapPoint(routePointFromCoordinates('map-point', 'Punto seleccionado', coordinates))
  }, [])

  const startMapPointSelection = useCallback((purpose: MapPointSelectionPurpose = 'choose') => {
    const map = mapRef.current
    if (!map) {
      setLocationMessage('El mapa todavía se está cargando.')
      return
    }

    const center = map.getCenter()
    updatePendingMapPoint({ lat: center.lat, lng: center.lng })
    setMapPointSelectionPurpose(purpose)
    setMapPointSelectionMode(true)
    setMobileMapSheet('select-map-point')
    setMapPointHint('Mueve el mapa y confirma el punto')
    if (window.matchMedia('(max-width: 767px)').matches) setSheetOpen(false)
  }, [updatePendingMapPoint])

  const selectRoutePoint = useCallback((role: 'origin' | 'destination', point: RoutePoint) => {
    if (role === 'origin') setRouteOrigin(point)
    else setRouteDestination(point)
    setRouteResult(null)
    setRouteError(null)
    setRouteSheetExpanded(false)
    if (role === 'origin') {
      setDistanceModeState('selecting-b')
      setMobileMapSheet('none')
    } else {
      setDistanceModeState('calculating')
      setMobileMapSheet('calculating')
    }
    if (window.matchMedia('(max-width: 767px)').matches) {
      setSheetOpen(false)
      setMobileListMode('all')
    }
  }, [])

  const selectDistanceCustomer = useCallback((customer: ResolvedMapClient) => {
    const point = customerRoutePoint(customer)
    if (!point) {
      setLocationMessage('Este cliente todavía no tiene coordenadas.')
      return
    }
    const role = distanceModeState === 'selecting-a' ? 'origin' : 'destination'
    selectRoutePoint(role, point)
  }, [customerRoutePoint, distanceModeState, selectRoutePoint])

  const useCurrentLocationAsOrigin = useCallback(async () => {
    const coordinates = myLocation ?? await getUserLocation()
    if (!coordinates) {
      setLocationMessage('No hemos podido obtener tu ubicación.')
      return
    }
    if (!myLocation) setMyLocation(coordinates)
    selectRoutePoint('origin', routePointFromCoordinates('current-location', 'Mi ubicación', coordinates))
  }, [myLocation, selectRoutePoint])

  const confirmMapPoint = useCallback((purpose: MapPointSelectionPurpose) => {
    if (!pendingMapPoint) {
      setLocationMessage('No hemos podido seleccionar este punto.')
      return
    }

    const role = purpose === 'choose'
      ? routeOrigin ? 'destination' : 'origin'
      : purpose
    selectRoutePoint(role, pendingMapPoint)
    closeMapPointSelection()
  }, [closeMapPointSelection, pendingMapPoint, routeOrigin, selectRoutePoint])

  const clearRoute = useCallback(() => {
    setRouteOrigin(null)
    setRouteDestination(null)
    setRouteResult(null)
    setRouteError(null)
    setRouteStops([])
    setRouteSheetExpanded(false)
    closeMapPointSelection()
    setDistanceModeState('idle')
    setMobileMapSheet('none')
  }, [closeMapPointSelection])

  const setDistanceModeSafely = useCallback((enabled: boolean) => {
    if (!enabled && (routeOrigin || routeDestination)) {
      const confirmed = window.confirm('¿Quieres salir del modo distancia y limpiar la ruta?')
      if (!confirmed) return
      clearRoute()
    }
    if (!enabled) {
      closeMapPointSelection()
      setDistanceModeState('idle')
      setMobileMapSheet('none')
    }
    setDistanceMode(enabled)
    if (enabled) {
      setDistanceModeState('selecting-a')
      setMobileMapSheet('none')
      setSheetOpen(false)
    }
  }, [clearRoute, closeMapPointSelection, routeDestination, routeOrigin])

  const retryRoute = useCallback(() => setRouteRequestVersion(version => version + 1), [])

  const swapRoutePoints = useCallback(() => {
    if (!routeOrigin || !routeDestination) return
    setRouteOrigin(routeDestination)
    setRouteDestination(routeOrigin)
    setRouteResult(null)
    setRouteError(null)
  }, [routeDestination, routeOrigin])

  const addRouteStop = useCallback(() => {
    if (!routeDestination) return
    setRouteStops(stops => stops.some(stop => stop.type === routeDestination.type && stop.id === routeDestination.id)
      ? stops
      : [...stops, routeDestination])
  }, [routeDestination])

  const focusRoute = useCallback(() => {
    if (!routeResult?.geometry || routeResult.geometry.length < 2) return
    mapRef.current?.fitBounds(
      routeResult.geometry.map(([lng, lat]) => [lat, lng] as [number, number]),
      { padding: [48, 48], maxZoom: 15 }
    )
  }, [routeResult])

  const buildRouteNavigationUrl = useCallback((origin: RoutePoint, destination: RoutePoint) => {
    if (isAppleDevice()) {
      return `https://maps.apple.com/?saddr=${encodeURIComponent(`${origin.latitude},${origin.longitude}`)}&daddr=${encodeURIComponent(`${destination.latitude},${destination.longitude}`)}&dirflg=d`
    }
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${origin.latitude},${origin.longitude}`)}&destination=${encodeURIComponent(`${destination.latitude},${destination.longitude}`)}&travelmode=driving`
  }, [])

  useEffect(() => {
    if (!routeOrigin || !routeDestination) return

    const controller = new AbortController()
    setRouteLoading(true)
    setRouteError(null)

    setDistanceModeState('calculating')
    setMobileMapSheet('calculating')
    routingProvider.calculateRoute(routeOrigin, routeDestination, controller.signal)
      .then(result => {
        setRouteResult(result)
        setDistanceModeState('result')
        setMobileMapSheet('route-result')
      })
      .catch(error => {
        if (error.name === 'AbortError') return
        setRouteResult({
          straightLineKm: calculateDistanceKm(
            routeOrigin.latitude,
            routeOrigin.longitude,
            routeDestination.latitude,
            routeDestination.longitude
          ),
          distanceKm: null,
          durationMinutes: null,
          geometry: null,
          createdAt: Date.now(),
        })
        setRouteError('No hemos podido calcular la ruta por carretera.')
        setDistanceModeState('error')
        setMobileMapSheet('route-result')
      })
      .finally(() => {
        if (!controller.signal.aborted) setRouteLoading(false)
      })

    return () => controller.abort()
  }, [routeDestination, routeOrigin, routeRequestVersion])

  useEffect(() => {
    if (!mapPointHint) return
    const timer = window.setTimeout(() => setMapPointHint(null), 1500)
    return () => window.clearTimeout(timer)
  }, [mapPointHint])

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

  // Distance sorting is only for route information. Keep the current filtered
  // CRM coordinates on the map so entering Medir never removes selectable markers.
  const markerSourceClients = distanceMode ? resolvedCustomersBase : cityMappedCustomers
  const markerClients = useMemo(() => renderAllMarkers(markerSourceClients), [markerSourceClients, renderAllMarkers])
  const visitMarkerStateByCustomerId = useMemo(() => {
    const now = Date.now()
    const states = new Map<string, VisitMarkerState>()

    for (const visit of visits) {
      if (!['programada', 'pending'].includes(String(visit.status).toLowerCase()) || !visit.customer_id) continue
      const scheduledAt = visit.scheduled_at || visit.scheduled_date
      const scheduledTime = scheduledAt ? new Date(scheduledAt).getTime() : Number.NaN
      const current = states.get(visit.customer_id) ?? { scheduled: false, overdue: false }
      current.scheduled = true
      current.overdue ||= Number.isFinite(scheduledTime) && scheduledTime < now
      states.set(visit.customer_id, current)
    }

    return states
  }, [visits])
  const unmappedClientsCount = cityUnmappedCustomers.length
  const searchCityLabel = useMemo(() => {
    if (!searchActive || resolvedCustomers.length === 0) return null
    const cities = Array.from(new Set(resolvedCustomers.map(customer => customer.city).filter(Boolean)))
    return cities.length === 1 ? cities[0] : null
  }, [resolvedCustomers, searchActive])

  useEffect(() => {
    if (!searchActive || !searchCityLabel || !isCitySearch(searchTerm, searchCityLabel)) return
    if (selectedCity !== searchCityLabel) setSelectedCity(searchCityLabel)
    if (!cityDetailMode) setCityDetailMode(true)
    setSheetOpen(true)
  }, [cityDetailMode, searchActive, searchCityLabel, searchTerm, selectedCity])

  useEffect(() => {
    clearMarkers()
  }, [clearMarkers, markerClients.length])

  const buildMapsSearchUrl = useCallback((client: ResolvedMapClient) => {
    const coords = getClientRenderableCoordinates(client)
    if (coords) {
      return externalNavigationProvider.openStreetMap(coords.lat, coords.lng)
    }
    return `https://www.openstreetmap.org/search?query=${encodeURIComponent(client.address)}`
  }, [])

  const buildMapsDirectionsUrl = useCallback((client: ResolvedMapClient) => {
    const coords = getClientRenderableCoordinates(client)
    if (!coords) return `https://www.openstreetmap.org/search?query=${encodeURIComponent(client.address)}`
    return isAppleDevice()
      ? externalNavigationProvider.appleMaps(coords.lat, coords.lng)
      : externalNavigationProvider.googleMaps(coords.lat, coords.lng)
  }, [])

  const invalidateMapSoon = useCallback(() => {
    window.setTimeout(() => {
      mapRef.current?.invalidateSize({ pan: false })
    }, 300)
  }, [])

  const openCityDetails = useCallback((city: string, province: string) => {
    setSelectedProvince(province)
    setSelectedCity(city)
    setSearchTerm('')
    setSearchResults(null)
    setSelectedCustomerId(null)
    setCityDetailMode(true)
    setMobileListMode('all')
    setSheetSize('half')
    setSheetOpen(true)
    invalidateMapSoon()
  }, [invalidateMapSoon])

  const closeCityDetails = useCallback(() => {
    setSelectedCity('')
    setSearchTerm('')
    setSearchResults(null)
    setSelectedCustomerId(null)
    setCityDetailMode(false)
    invalidateMapSoon()
  }, [invalidateMapSoon])

  const openMobileList = useCallback((mode: MobileListMode) => {
    setMobileListMode(mode)
    setSheetSize('half')
    setSheetOpen(true)
  }, [])

  useEffect(() => {
    invalidateMapSoon()
  }, [invalidateMapSoon, sheetOpen, selectedCustomerId])

  useEffect(() => {
    if (!import.meta.env.DEV) return
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
    if (!import.meta.env.DEV) return
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
    if (!import.meta.env.DEV) return
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

    console.table({
      selectedCity,
      expectedCount: markerClients.length,
      renderedCount: stats.totalMarkersRendered,
      filteredCustomerCount: resolvedCustomers.length,
    })

    if (stats.totalMarkersRendered > stats.totalRenderableClients) {
      console.warn('[MAP_MARKERS] Marker registry exceeds renderable clients', stats)
    }
  }, [markerClients, resolvedCustomers, selectedCity])

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

        const rawHeading = position.coords.heading
        const heading = Number.isFinite(rawHeading)
          ? (() => {
              const current = smoothedHeadingRef.current
              const next = Number(rawHeading)
              if (current === null) return next
              const shortestTurn = ((next - current + 540) % 360) - 180
              return (current + shortestTurn * 0.35 + 360) % 360
            })()
          : null

        smoothedHeadingRef.current = heading
        setMyLocation(coords)
        setLocationDetails({
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          heading,
          speed: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
          updatedAt: new Date(position.timestamp),
        })
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

  const centerOnMyLocation = useCallback(() => {
    if (!myLocation) return
    mapRef.current?.flyTo([myLocation.lat, myLocation.lng], 13, { duration: 0.5 })
  }, [myLocation])

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

  const autoFocusedSearchRef = useRef('')
  useEffect(() => {
    if (!searchActive || resolvedCustomers.length !== 1) return
    const onlyClient = resolvedCustomers[0]
    if (!onlyClient || !hasRenderableCoordinates(onlyClient) || autoFocusedSearchRef.current === searchTerm) return
    autoFocusedSearchRef.current = searchTerm
    setSheetOpen(true)
    flyToCustomer(onlyClient).catch(console.error)
  }, [flyToCustomer, resolvedCustomers, searchActive, searchTerm])

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
              onChange={e => setDistanceModeSafely(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-sm font-medium text-gray-700">Modo distancia (km/min)</span>
          </label>
          {distanceMode && (
            <>
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
              <button
                onClick={() => startMapPointSelection(routeOrigin ? 'destination' : 'origin')}
                title="Seleccionar punto"
                aria-label="Seleccionar un punto en el mapa"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                <Crosshair className="h-4 w-4" />
                <span>Seleccionar punto</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="hidden rounded-xl border border-gray-200 bg-white p-6 shadow-sm md:block">
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex-1">
            <div className="relative flex items-center">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={t.maps.searchPlaceholder}
                value={searchTerm}
                onChange={event => {
                  if (cityDetailMode) {
                    setCityDetailMode(false)
                    setSelectedCity('')
                  }
                  setMobileListMode('all')
                  setSearchTerm(event.target.value)
                }}
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-12 focus:border-transparent focus:ring-2 focus:ring-blue-500"
              />
              <div className="absolute right-2">
                <VoiceSearchButton onTranscript={setSearchTerm} />
              </div>
            </div>
          </div>
          <div className="sm:w-48">
            <select
              value={selectedProvince}
              onChange={event => {
                setSelectedProvince(event.target.value)
                setSelectedCity('')
                setCityDetailMode(false)
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
              onChange={event => {
                setSelectedCity(event.target.value)
                setCityDetailMode(Boolean(event.target.value))
              }}
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
                setCityDetailMode(false)
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50"
            >
              Limpiar
            </button>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="hidden space-y-6 md:block">
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
                  {cityDetailMode ? (
                    <>
                      <div className="bg-blue-50 px-4 py-3">
                        <button
                          onClick={closeCityDetails}
                          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800"
                        >
                          <ChevronLeft className="h-4 w-4" /> Volver a ciudades
                        </button>
                        <div className="text-sm font-semibold text-gray-900">{selectedCity}</div>
                        <div className="mt-1 text-xs text-gray-600">
                          {cityCustomers.length} clientes · {cityMappedCustomers.length} en el mapa · {cityUnmappedCustomers.length} sin coordenadas
                        </div>
                      </div>
                      {resolvedCustomers.map(customer => (
                        <button
                          key={customer.id}
                          onClick={() => flyToCustomer(customer)}
                          className={`w-full p-4 text-left transition-colors hover:bg-gray-50 ${
                            selectedCustomerId === customer.id ? 'border-r-2 border-blue-500 bg-blue-50' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-600">
                              {customer.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h3 className="truncate text-sm font-medium text-gray-900">{customer.name}</h3>
                                  {customer.company && <p className="truncate text-xs text-gray-600">{customer.company}</p>}
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  hasRenderableCoordinates(customer) ? 'bg-blue-50 text-blue-700' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {hasRenderableCoordinates(customer) ? 'en mapa' : 'sin coordenadas'}
                                </span>
                              </div>
                              <div className="mt-1 flex items-start text-xs text-gray-600">
                                <MapPin className="mr-1 mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
                                <span>{customer.address}</span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
                                {customer.phone && <span>{customer.phone}</span>}
                                <span>Estado: activo</span>
                                <span>Última visita: sin registrar</span>
                                <span>Próxima visita: sin programar</span>
                              </div>
                              {customer.geocodeStatus === 'approximate' && (
                                <div className="mt-1 text-[11px] text-amber-600">Cliente aproximado. Dirección pendiente de validación.</div>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </>
                  ) : cityGroups.map(cityGroup => {
                    const onMap = cityGroup.clients.filter(client => hasRenderableCoordinates(client)).length
                    const withoutMap = cityGroup.clientCount - onMap
                    return (
                      <button
                        key={`${cityGroup.province}|${cityGroup.city}`}
                        className="flex min-h-[76px] w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-gray-50"
                        onClick={() => openCityDetails(cityGroup.city, cityGroup.province)}
                      >
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-gray-900">{cityGroup.city}</span>
                          <span className="mt-1 block text-xs text-gray-600">
                            {cityGroup.clientCount} {cityGroup.clientCount === 1 ? 'cliente' : 'clientes'}
                          </span>
                          <span className="mt-1 block text-[11px] text-gray-500">
                            <span className="font-medium text-blue-700">{onMap} en mapa</span> · <span className="font-medium text-amber-700">{withoutMap} sin coordenadas</span>
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {cityGroup.nearestDistanceFromUser !== null && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              {formatDistanceKm(cityGroup.nearestDistanceFromUser, '')}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">▸</span>
                        </div>
                      </button>
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

                  {distanceMode && routeDestination?.id === selectedCustomer.id && routeResult && (
                    <div className="space-y-1 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950">
                      <div className="font-semibold">Ruta desde {routeOrigin?.name}</div>
                      <div>{formatRouteDistance(routeResult.straightLineKm)} en línea recta</div>
                      <div>{routeResult.distanceKm !== null ? `${formatRouteDistance(routeResult.distanceKm)} por carretera` : 'Distancia por carretera no disponible'}</div>
                      <div>{routeResult.durationMinutes !== null ? `${formatRouteDuration(routeResult.durationMinutes)} en coche` : 'Tiempo estimado no disponible'}</div>
                      <div className="text-xs text-blue-700">Tiempo estimado, sin tráfico en tiempo real.</div>
                    </div>
                  )}

                  <div className="space-y-2 border-t border-gray-200 pt-3">
                    {distanceMode && customerRoutePoint(selectedCustomer) && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => selectRoutePoint('origin', customerRoutePoint(selectedCustomer)!)}
                          className="rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                        >
                          {routeOrigin?.id === selectedCustomer.id ? 'Origen seleccionado' : 'Establecer como origen'}
                        </button>
                        <button
                          onClick={() => selectRoutePoint('destination', customerRoutePoint(selectedCustomer)!)}
                          className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                        >
                          {routeDestination?.id === selectedCustomer.id ? 'Destino seleccionado' : 'Establecer como destino'}
                        </button>
                      </div>
                    )}
                    {distanceMode && myLocation && customerRoutePoint(selectedCustomer) && (
                      <button
                        onClick={() => {
                          selectRoutePoint('origin', currentLocationRoutePoint()!)
                          selectRoutePoint('destination', customerRoutePoint(selectedCustomer)!)
                        }}
                        className="inline-flex w-full items-center justify-center space-x-2 rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
                      >
                        <LocateFixed className="h-4 w-4" />
                        <span>Calcular desde mi ubicación</span>
                      </button>
                    )}
                    {distanceMode && routeOrigin && routeDestination && (
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={focusRoute} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">Ver ruta</button>
                        <button onClick={() => window.open(buildRouteNavigationUrl(routeOrigin, routeDestination), '_blank')} className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700">Navegar</button>
                      </div>
                    )}
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

        <div>
          {/* En móvil el mapa ocupa toda la pantalla (debajo de la barra de pestañas) */}
          <div className="map-container max-md:fixed max-md:inset-0 max-md:z-40 overflow-hidden md:rounded-xl md:border md:border-gray-200 bg-white md:shadow-sm">
            <div className="relative h-[800px] max-md:h-full">
              {selectedCity && (
                <div className="absolute left-3 top-3 z-[1000] hidden max-w-[360px] items-center gap-3 rounded-lg border border-white/60 bg-white/90 px-3 py-2 shadow-md backdrop-blur md:flex">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">{selectedCity}</div>
                    <div className="text-xs text-gray-600">
                      {cityCustomers.length} clientes · {cityMappedCustomers.length} en mapa · {cityUnmappedCustomers.length} sin coordenadas
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => setCityDetailMode(true)} className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50">Ver lista</button>
                    <button onClick={fitToAll} className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50">Ajustar mapa</button>
                    <button onClick={closeCityDetails} className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100">Quitar filtro</button>
                  </div>
                </div>
              )}
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
                  suspendAutoFit={distanceMode}
                />
                <TileLayer
                  url={mapTileProvider.url}
                  attribution={mapTileProvider.attribution}
                  maxZoom={mapTileProvider.maxZoom}
                />
                <MapRoutePointPicker
                  enabled={distanceMode}
                  selectionMode={mapPointSelectionMode}
                  onLongPress={coordinates => {
                    updatePendingMapPoint(coordinates)
                    setMapPointSelectionMode(false)
                    setMapPointSelectionPurpose('choose')
                    setMobileMapSheet('select-map-point')
                    setSheetOpen(false)
                  }}
                  onCenterChange={updatePendingMapPoint}
                  onConfirmCenter={() => confirmMapPoint(mapPointSelectionPurpose)}
                  onCancel={closeMapPointSelection}
                />

                {distanceMode && routeResult?.geometry && routeResult.geometry.length > 1 && (
                  <>
                    <Polyline
                      positions={routeResult.geometry.map(([lng, lat]) => [lat, lng] as [number, number])}
                      pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }}
                    />
                    <Polyline
                      positions={routeResult.geometry.map(([lng, lat]) => [lat, lng] as [number, number])}
                      pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' }}
                    />
                  </>
                )}
                {distanceMode && routeOrigin && routeOrigin.type !== 'current-location' && (
                  <CircleMarker
                    center={[routeOrigin.latitude, routeOrigin.longitude]}
                    radius={18}
                    pathOptions={{ color: '#16a34a', weight: 3, fillOpacity: 0.12 }}
                  />
                )}
                {distanceMode && routeOrigin?.type === 'current-location' && myLocation && (
                  <CircleMarker
                    center={[myLocation.lat, myLocation.lng]}
                    radius={24}
                    pathOptions={{ color: '#16a34a', weight: 3, fillOpacity: 0.05 }}
                  />
                )}
                {distanceMode && routeDestination && (
                  <CircleMarker
                    center={[routeDestination.latitude, routeDestination.longitude]}
                    radius={18}
                    pathOptions={{ color: '#dc2626', weight: 3, fillOpacity: 0.1 }}
                  />
                )}
                {markerClients.map(client => {
                    const coords = getClientRenderableCoordinates(client)
                    if (!coords) return null

                    const popupSummary = buildClientPopupHtml(client, myLocation)
                    const visitState = visitMarkerStateByCustomerId.get(client.id) ?? { scheduled: false, overdue: false }
                    const followUp = /seguimiento|follow.?up|pendiente/i.test(String(client.sourceCustomer.status || ''))
                    return (
                      <Marker
                        key={client.id}
                        position={[coords.lat, coords.lng]}
                        icon={createCasmaraMarkerIcon({
                          accuracy: client.geocodeStatus === 'approximate' ? 'approximate' : 'precise',
                          selected: client.id === selectedCustomerId,
                          scheduled: visitState.scheduled,
                          overdue: visitState.overdue,
                          followUp,
                        })}
                        opacity={distanceMode && client.id !== routeOrigin?.id && client.id !== routeDestination?.id ? 0.7 : 1}
                        zIndexOffset={client.id === routeOrigin?.id || client.id === routeDestination?.id ? 500 : 0}
                        keyboard
                        ref={marker => upsertMarkerForClient(client, marker)}
                        eventHandlers={{
                          click: () => {
                            if (distanceMode) {
                              selectDistanceCustomer(client)
                              return
                            }
                            setSelectedCustomerId(client.id)
                          },
                        }}
                      >
                        {!distanceMode && <Popup minWidth={280}>
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
                              {distanceMode && <>
                              <button
                                onClick={() => selectRoutePoint('origin', customerRoutePoint(client)!)}
                                className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700 transition-colors hover:bg-emerald-100"
                              >
                                Origen
                              </button>
                              <button
                                onClick={() => selectRoutePoint('destination', customerRoutePoint(client)!)}
                                className="inline-flex items-center rounded-md bg-rose-50 px-2 py-1 text-xs text-rose-700 transition-colors hover:bg-rose-100"
                              >
                                Destino
                              </button>
                              {myLocation && (
                                <button
                                  onClick={() => {
                                    selectRoutePoint('origin', currentLocationRoutePoint()!)
                                    selectRoutePoint('destination', customerRoutePoint(client)!)
                                  }}
                                  className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700 transition-colors hover:bg-blue-100"
                                >
                                  Calcular desde mi ubicación
                                </button>
                              )}
                              </>}
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
                                <ExternalLink className="mr-1 h-3 w-3" /> OpenStreetMap
                              </button>
                            </div>
                          </div>
                        </Popup>}
                      </Marker>
                    )
                })}

                {myLocation && (
                  <Marker
                    position={[myLocation.lat, myLocation.lng]}
                    icon={createVehicleLocationIcon({
                      heading: locationDetails?.heading,
                      accuracy: locationDetails?.accuracy,
                      isMoving: (locationDetails?.speed ?? 0) > 1,
                    })}
                    eventHandlers={{
                      click: () => {
                        if (!distanceMode || !myLocation) return
                        selectRoutePoint(
                          distanceModeState === 'selecting-a' ? 'origin' : 'destination',
                          routePointFromCoordinates('current-location', 'Mi ubicación', myLocation)
                        )
                      },
                    }}
                  >
                    {!distanceMode && <Popup minWidth={260}>
                      <div className="space-y-3">
                        <div className="border-b border-gray-200 pb-2">
                          <div className="text-base font-semibold text-gray-900">Mi ubicación</div>
                          <div className="mt-1 text-sm text-gray-600">
                            {locationDetails?.updatedAt
                              ? `Última actualización: ${locationDetails.updatedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
                              : 'Última actualización no disponible'}
                          </div>
                        </div>
                        <div className="space-y-1.5 text-sm text-gray-700">
                          <div>{getLocationAccuracyLabel(locationDetails?.accuracy)}{locationDetails?.accuracy !== null && locationDetails?.accuracy !== undefined ? ` (${Math.round(locationDetails.accuracy)} m)` : ''}</div>
                          {locationDetails?.speed !== null && locationDetails?.speed !== undefined && (
                            <div>Velocidad: {Math.round(locationDetails.speed * 3.6)} km/h</div>
                          )}
                          {locationDetails?.heading !== null && locationDetails?.heading !== undefined && (
                            <div>Dirección: {Math.round(locationDetails.heading)}°</div>
                          )}
                          <div>
                            Cliente más cercano: {nearestCustomer
                              ? `${nearestCustomer.name} (${formatDistanceKm(nearestCustomer.distanceFromUser, 'Distancia no disponible')})`
                              : 'No disponible'}
                          </div>
                          {selectedCustomer && (
                            <div>
                              Distancia al cliente seleccionado: {formatDistanceKm(selectedCustomer.distanceFromUser, 'Distancia no disponible')}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-2">
                          {distanceMode && <>
                          <button
                            onClick={() => {
                              const point = currentLocationRoutePoint()
                              if (point) selectRoutePoint('origin', point)
                            }}
                            className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-700 transition-colors hover:bg-emerald-100"
                          >
                            Usar como origen
                          </button>
                          {selectedCustomer && customerRoutePoint(selectedCustomer) && (
                            <button
                              onClick={() => {
                                const point = currentLocationRoutePoint()
                                if (!point) return
                                selectRoutePoint('origin', point)
                                selectRoutePoint('destination', customerRoutePoint(selectedCustomer)!)
                              }}
                              className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700 transition-colors hover:bg-blue-100"
                            >
                              Calcular ruta al cliente seleccionado
                              </button>
                            )}
                          </>}
                          <button
                            onClick={centerOnMyLocation}
                            className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700 transition-colors hover:bg-blue-100"
                          >
                            Centrar mapa
                          </button>
                          {nearestCustomer && (
                            <button
                              onClick={() => window.open(buildMapsDirectionsUrl(nearestCustomer), '_blank')}
                              className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs text-green-700 transition-colors hover:bg-green-100"
                            >
                              Navegar al siguiente cliente
                            </button>
                          )}
                          <button
                            onClick={locateMe}
                            className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700 transition-colors hover:bg-gray-200"
                          >
                            Actualizar ubicación
                          </button>
                        </div>
                      </div>
                    </Popup>}
                  </Marker>
                )}

                <MapBridge mapRef={mapRef} />
              </MapContainer>

              {mapPointSelectionMode && (
                <>
                  <div className="map-point-crosshair" aria-hidden="true">
                    <div className="map-point-crosshair__ring" />
                    <div className="map-point-crosshair__dot" />
                  </div>
                  <div className="sr-only" role="status">
                    Modo de selección de punto activado. Mueve el mapa y confirma la ubicación.
                  </div>
                </>
              )}

              {mapPointHint && (
                <div className="absolute left-1/2 top-[88px] z-[1013] -translate-x-1/2 rounded-full bg-slate-900/85 px-3 py-1.5 text-xs font-medium text-white shadow-md md:top-4">
                  {mapPointHint}
                </div>
              )}

              {distanceMode && pendingMapPoint && (
                <div
                  className="absolute inset-x-3 z-[1013] hidden md:block md:inset-x-auto md:bottom-4 md:left-1/2 md:w-[360px] md:-translate-x-1/2"
                  style={{ bottom: 'calc(env(safe-area-inset-bottom) + 150px)' }}
                >
                  <div className="rounded-xl border border-white/70 bg-white/95 p-3 shadow-xl backdrop-blur-md">
                    <div className="text-sm font-semibold text-gray-900">
                      {mapPointSelectionMode ? 'Seleccionar este punto' : '¿Qué quieres hacer con este punto?'}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {mapPointSelectionMode ? 'Ubicación seleccionada en el mapa' : 'Punto seleccionado'}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => confirmMapPoint('origin')}
                        className={`min-h-12 rounded-lg px-3 text-sm font-medium ${
                          preferredMapPointPurpose === 'origin'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        Usar como origen
                      </button>
                      <button
                        onClick={() => confirmMapPoint('destination')}
                        className={`min-h-12 rounded-lg px-3 text-sm font-medium ${
                          preferredMapPointPurpose === 'destination'
                            ? 'bg-rose-600 text-white'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        Usar como destino
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <button onClick={closeMapPointSelection} className="min-h-11 px-2 text-sm font-medium text-gray-600">
                        Cancelar
                      </button>
                      <button onClick={centerOnMyLocation} disabled={!myLocation} className="min-h-11 px-2 text-sm font-medium text-blue-700 disabled:text-gray-400">
                        Centrar en mi ubicación
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {distanceMode && mobileMapSheet !== 'none' && (
                <div
                  className="absolute inset-x-3 z-[1012] md:hidden"
                  style={{ bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}
                >
                  <div className="overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-2xl backdrop-blur-md">
                    {(mobileMapSheet === 'choose-origin' || mobileMapSheet === 'choose-destination') && (
                      <div className="p-4">
                        <div className="text-base font-semibold text-gray-900">
                          {mobileMapSheet === 'choose-origin' ? '¿Desde dónde quieres salir?' : 'Selecciona el destino'}
                        </div>
                        {routeOrigin && (
                          <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                            <span><strong>A</strong> {routeOrigin.name}</span>
                            <button onClick={() => { setRouteOrigin(null); setRouteResult(null); setDistanceModeState('selecting-a'); setMobileMapSheet('none') }} className="font-medium text-emerald-700">Cambiar</button>
                          </div>
                        )}
                        <div className="mt-3 space-y-2">
                          {mobileMapSheet === 'choose-origin' && (
                            <button onClick={useCurrentLocationAsOrigin} className="flex min-h-[52px] w-full items-center gap-3 rounded-xl bg-blue-600 px-4 text-left text-sm font-semibold text-white">
                              <LocateFixed className="h-5 w-5" /> Mi ubicación
                            </button>
                          )}
                          <button onClick={() => { setSelectedCustomerId(null); setMobileMapSheet('customer-choice') }} className="flex min-h-[52px] w-full items-center gap-3 rounded-xl bg-slate-100 px-4 text-left text-sm font-semibold text-slate-800">
                            <Search className="h-5 w-5 text-blue-600" /> Elegir cliente
                          </button>
                          <button onClick={() => startMapPointSelection(mobileMapSheet === 'choose-origin' ? 'origin' : 'destination')} className="flex min-h-[52px] w-full items-center gap-3 rounded-xl bg-slate-100 px-4 text-left text-sm font-semibold text-slate-800">
                            <Crosshair className="h-5 w-5 text-blue-600" /> Elegir punto en el mapa
                          </button>
                        </div>
                      </div>
                    )}

                    {mobileMapSheet === 'customer-choice' && (
                      <div className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-base font-semibold text-gray-900">Selecciona un cliente</div>
                          <button onClick={() => setMobileMapSheet(routeOrigin ? 'choose-destination' : 'choose-origin')} className="text-sm font-medium text-gray-600">Volver</button>
                        </div>
                        {selectedCustomer ? (
                          <div className="mt-3 rounded-xl border border-gray-100 p-3">
                            <div className="font-semibold text-gray-900">{selectedCustomer.name}</div>
                            <div className="mt-1 text-xs text-gray-500">{[selectedCustomer.city, selectedCustomer.address].filter(Boolean).join(' · ')}</div>
                            <button onClick={() => selectDistanceCustomer(selectedCustomer)} className="mt-3 min-h-12 w-full rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">
                              {distanceModeState === 'selecting-a' ? 'Usar como origen' : 'Usar como destino'}
                            </button>
                            <button onClick={() => { setMobileMapSheet('none'); setSheetOpen(true) }} className="mt-2 min-h-11 w-full text-sm font-medium text-blue-700">Ver cliente</button>
                          </div>
                        ) : (
                          <>
                            <div className="relative mt-3 flex items-center">
                              <input
                                value={searchTerm}
                                onChange={event => setSearchTerm(event.target.value)}
                                placeholder={distanceModeState === 'selecting-a' ? 'Buscar punto A' : 'Buscar punto B'}
                                className="min-h-12 w-full rounded-xl border border-gray-200 px-3 pr-12 text-sm outline-none focus:border-blue-500"
                              />
                              <div className="absolute right-2">
                                <VoiceSearchButton onTranscript={setSearchTerm} />
                              </div>
                            </div>
                            <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-gray-100">
                            {resolvedCustomers.filter(client => hasRenderableCoordinates(client) && (
                              !searchTerm || normalizeCityName(`${client.name} ${client.city} ${client.address}`).includes(normalizeCityName(searchTerm))
                            )).slice(0, 8).map(client => (
                              <button key={client.id} onClick={() => selectDistanceCustomer(client)} className="flex min-h-[52px] w-full items-center justify-between border-b border-gray-100 px-3 py-2 text-left last:border-0">
                                <span className="min-w-0"><span className="block truncate text-sm font-medium text-gray-900">{client.name}</span><span className="block truncate text-xs text-gray-500">{[client.city, client.address].filter(Boolean).join(' · ')}</span></span>
                                <span className="ml-2 text-xs font-medium text-blue-600">Elegir</span>
                              </button>
                            ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {mobileMapSheet === 'select-map-point' && (
                      <div className="p-4">
                        <div className="text-base font-semibold text-gray-900">Seleccionar este punto</div>
                        <div className="mt-1 text-sm text-gray-500">Mueve el mapa y confirma la ubicación.</div>
                        <button onClick={() => confirmMapPoint(mapPointSelectionPurpose)} className="mt-4 min-h-12 w-full rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">
                          {preferredMapPointPurpose === 'destination' ? 'Usar este punto como destino' : 'Usar este punto como origen'}
                        </button>
                        <button onClick={closeMapPointSelection} className="mt-2 min-h-11 w-full text-sm font-medium text-gray-600">Cancelar</button>
                      </div>
                    )}

                    {mobileMapSheet === 'calculating' && (
                      <div className="flex min-h-24 items-center gap-3 px-4 text-sm font-medium text-gray-800">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                        Calculando ruta…
                      </div>
                    )}

                    {mobileMapSheet === 'route-result' && routeOrigin && routeDestination && (
                      <>
                        <button onClick={() => setRouteSheetExpanded(expanded => !expanded)} className="flex min-h-[60px] w-full items-center justify-between gap-3 px-4 text-left">
                          <span><span className="text-sm font-semibold text-gray-900">A → B</span><span className="mt-0.5 block text-base font-bold text-blue-700">{routeLoading ? 'Calculando ruta…' : routeResult ? `${formatRouteDistance(routeResult.distanceKm)} · ${formatRouteDuration(routeResult.durationMinutes)}` : 'Ruta no disponible'}</span></span>
                          <span className="text-xs font-medium text-blue-700">Ver detalles</span>
                        </button>
                        {routeSheetExpanded && (
                          <div className="border-t border-gray-100 p-4 text-sm text-gray-700">
                            <div><span className="font-semibold text-emerald-700">A · Origen</span><div className="mt-0.5">{routeOrigin.name}</div></div>
                            <div className="mt-3"><span className="font-semibold text-rose-700">B · Destino</span><div className="mt-0.5">{routeDestination.name}</div></div>
                            {routeResult && <div className="mt-3 space-y-1 text-xs"><div>{formatRouteDistance(routeResult.distanceKm)} por carretera</div><div>{formatRouteDuration(routeResult.durationMinutes)} en coche</div><div>{formatRouteDistance(routeResult.straightLineKm)} en línea recta</div></div>}
                            <div className="mt-3 text-[11px] text-gray-500">Tiempo estimado sin tráfico en tiempo real.</div>
                            {routeError && <div className="mt-2 text-sm text-amber-700">{routeError}</div>}
                            <button onClick={() => window.open(buildRouteNavigationUrl(routeOrigin, routeDestination), '_blank')} className="mt-4 min-h-12 w-full rounded-xl bg-green-600 px-4 text-sm font-semibold text-white">Navegar</button>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <button onClick={swapRoutePoints} className="min-h-11 rounded-lg bg-slate-100 text-sm font-medium text-slate-700">Intercambiar</button>
                              <button onClick={() => { setRouteOrigin(null); setRouteResult(null); setDistanceModeState('selecting-a'); setMobileMapSheet('none') }} className="min-h-11 rounded-lg bg-slate-100 text-sm font-medium text-slate-700">Cambiar A</button>
                              <button onClick={() => { setRouteDestination(null); setRouteResult(null); setDistanceModeState('selecting-b'); setMobileMapSheet('none') }} className="min-h-11 rounded-lg bg-slate-100 text-sm font-medium text-slate-700">Cambiar B</button>
                              <button onClick={() => { clearRoute(); setDistanceModeState('selecting-a'); setMobileMapSheet('none') }} className="min-h-11 rounded-lg bg-slate-100 text-sm font-medium text-slate-700">Nueva medición</button>
                            </div>
                            <button onClick={() => setDistanceModeSafely(false)} className="mt-2 min-h-11 w-full text-sm font-medium text-gray-600">Cerrar</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {distanceMode && routeOrigin && routeDestination && !pendingMapPoint && (
                <div className="absolute right-3 top-16 z-[1001] hidden w-[290px] rounded-lg border border-white/70 bg-white/95 p-3 shadow-lg backdrop-blur md:block">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-900">Ruta calculada</div>
                    <button onClick={clearRoute} className="text-xs font-medium text-gray-500 hover:text-gray-800">Limpiar</button>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-gray-600">
                    <div><span className="font-medium text-emerald-700">Origen</span> · {routeOrigin.name}</div>
                    <div><span className="font-medium text-rose-700">Destino</span> · {routeDestination.name}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div><div className="text-sm font-semibold text-gray-900">{routeLoading ? '…' : formatRouteDistance(routeResult?.distanceKm ?? null)}</div><div className="text-[10px] text-gray-500">por carretera</div></div>
                    <div><div className="text-sm font-semibold text-gray-900">{routeLoading ? '…' : formatRouteDuration(routeResult?.durationMinutes ?? null)}</div><div className="text-[10px] text-gray-500">en coche</div></div>
                    <div><div className="text-sm font-semibold text-gray-900">{routeResult ? formatRouteDistance(routeResult.straightLineKm) : '…'}</div><div className="text-[10px] text-gray-500">en línea recta</div></div>
                  </div>
                  <div className="mt-2 text-[10px] text-gray-500">Tiempo estimado, sin tráfico en tiempo real.</div>
                  {routeError && (
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-amber-700">
                      <span>{routeError}</span><button onClick={retryRoute} className="font-medium underline">Reintentar</button>
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={focusRoute} className="rounded-md bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Ver ruta</button>
                    <button onClick={() => window.open(buildRouteNavigationUrl(routeOrigin, routeDestination), '_blank')} className="rounded-md bg-green-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-green-700">Navegar</button>
                    <button onClick={swapRoutePoints} className="rounded-md bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200">Intercambiar</button>
                    <button onClick={addRouteStop} className="rounded-md bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200">Añadir parada</button>
                  </div>
                  {routeDestinationCustomer && <button onClick={() => flyToCustomer(routeDestinationCustomer)} className="mt-2 text-xs font-medium text-blue-700 hover:text-blue-800">Ver cliente</button>}
                  {routeStops.length > 0 && <div className="mt-2 text-[10px] text-slate-500">{routeStops.length} parada preparada para la siguiente ruta.</div>}
                </div>
              )}

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
                  <span className="vehicle-location-legend-icon" aria-hidden="true" /> Mi ubicación
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
                <div data-app-build={__APP_BUILD_VERSION__} className="border-t border-gray-100 pt-1 text-[10px] text-gray-400">
                  Build {__APP_BUILD_VERSION__}
                </div>
              </div>

              {/* ── Superposiciones móviles (estilo app, solo <md) ── */}

              {/* Barra de búsqueda flotante */}
              <div
                className="absolute inset-x-3 z-[1010] md:hidden"
                style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
              >
                <div className="flex min-h-[52px] items-center gap-2 rounded-full border border-white/60 bg-white/85 px-4 shadow-lg backdrop-blur-md">
                  <Search className="h-5 w-5 flex-shrink-0 text-gray-500" />
                  <input
                    type="text"
                    placeholder={distanceMode
                      ? distanceModeState === 'selecting-a'
                        ? 'Buscar punto A'
                        : 'Buscar punto B'
                      : 'Buscar por nombre, teléfono, ciudad…'}
                    value={searchTerm}
                    onChange={event => {
                      if (cityDetailMode) {
                        setCityDetailMode(false)
                        setSelectedCity('')
                      }
                      setMobileListMode('all')
                      setSearchTerm(event.target.value)
                    }}
                    onFocus={() => {
                      if (distanceMode) {
                        setMobileMapSheet('none')
                      } else {
                        setSheetOpen(true)
                      }
                    }}
                    className="h-[52px] w-full bg-transparent text-[15px] text-gray-900 placeholder-gray-500 focus:outline-none"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => {
                        setMobileListMode('all')
                        if (cityDetailMode) {
                          setCityDetailMode(false)
                          setSelectedCity('')
                        }
                        setSearchTerm('')
                      }}
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-500 active:bg-gray-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  <VoiceSearchButton onTranscript={setSearchTerm} />
                </div>
                {mapPointSelectionMode && (
                  <div className="mt-2 inline-flex min-h-9 items-center gap-2 rounded-full border border-blue-100 bg-white/95 px-3 text-xs font-medium text-blue-700 shadow-md backdrop-blur-md">
                    <Crosshair className="h-4 w-4" />
                    <span>Seleccionando punto</span>
                    <button
                      onClick={closeMapPointSelection}
                      aria-label="Cancelar selección de punto"
                      title="Cancelar"
                      className="-mr-1 flex h-7 w-7 items-center justify-center rounded-full text-blue-700 active:bg-blue-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {distanceMode && (distanceModeState === 'selecting-a' || distanceModeState === 'selecting-b') && (
                  <div className="mt-2 flex min-h-10 items-center justify-between gap-2 rounded-xl border border-blue-100 bg-white/95 px-3 text-xs shadow-md backdrop-blur-md">
                    <div className="min-w-0 truncate font-semibold text-blue-700">
                      {distanceModeState === 'selecting-a' && 'Selecciona el punto A'}
                      {distanceModeState === 'selecting-b' && `Ahora selecciona el punto B${routeOrigin ? ` · A: ${routeOrigin.name}` : ''}`}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button onClick={() => setMobileMapSheet(routeOrigin ? 'choose-destination' : 'choose-origin')} className="min-h-9 font-medium text-blue-700">
                        Más
                      </button>
                    </div>
                  </div>
                )}
                {(searchLoading || searchError || searchSuggestions.length > 0) && (
                  <div className="mt-2 overflow-hidden rounded-xl border border-white/60 bg-white/95 shadow-xl backdrop-blur-md">
                    {searchLoading && <p className="px-4 py-3 text-sm text-gray-500">Buscando clientes…</p>}
                    {searchError && <p className="px-4 py-3 text-sm text-red-600">{searchError}</p>}
                    {!searchLoading && !searchError && searchSuggestions.map(client => (
                      <button key={client.id} onClick={() => {
                        if (distanceMode) selectDistanceCustomer(client)
                        else { setSheetOpen(true); flyToCustomer(client) }
                      }} className="flex w-full items-center justify-between border-b border-gray-100 px-4 py-3 text-left last:border-0 active:bg-blue-50">
                        <span className="min-w-0"><span className="block truncate text-sm font-medium text-gray-900">{client.name}</span><span className="block truncate text-xs text-gray-500">{[client.city, client.province].filter(Boolean).join(', ')}</span></span>
                        <span className="ml-3 text-xs text-gray-500">{client.phone ? String(client.phone).slice(-4) : hasRenderableCoordinates(client) ? 'en mapa' : 'sin mapa'}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Botones circulares flotantes (lado derecho) */}
              <div
                className="absolute right-3 z-[1009] flex flex-col gap-3 md:hidden"
                style={{ bottom: 'calc(env(safe-area-inset-bottom) + 170px)' }}
              >
                {!distanceMode ? <>
                  <button
                    onClick={() => setDistanceModeSafely(true)}
                    title="Medir distancia"
                    aria-label="Medir distancia"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/90 shadow-lg backdrop-blur-md transition active:scale-95"
                  >
                    <Ruler className="h-6 w-6 text-blue-600" />
                  </button>
                  <button onClick={locateMe} title="Mi ubicación" className="flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/85 shadow-lg backdrop-blur-md transition active:scale-95">
                    <LocateFixed className="h-6 w-6 text-blue-600" />
                  </button>
                  <button onClick={fitToAll} disabled={fittingAll} title="Ver todos" className="flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/85 shadow-lg backdrop-blur-md transition active:scale-95 disabled:opacity-50">
                    <Expand className="h-6 w-6 text-gray-700" />
                  </button>
                  {selectedCustomer && (
                    <button onClick={() => window.open(buildMapsDirectionsUrl(selectedCustomer), '_blank')} title="Navegar" className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 shadow-lg transition active:scale-95">
                      <Navigation className="h-6 w-6 text-white" />
                    </button>
                  )}
                </> : <>
                  <button onClick={() => setDistanceModeSafely(false)} title="Cancelar medición" aria-label="Cancelar medición" className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition active:scale-95">
                    <X className="h-6 w-6" />
                  </button>
                  <button
                    onClick={() => startMapPointSelection(routeOrigin ? 'destination' : 'origin')}
                    title="Elegir punto en el mapa"
                    aria-label="Elegir punto en el mapa"
                    aria-pressed={mapPointSelectionMode}
                    className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition active:scale-95 ${mapPointSelectionMode ? 'border-blue-600 bg-blue-600 text-white' : 'border-white/60 bg-white/85 text-blue-600'}`}
                  >
                    <Crosshair className="h-6 w-6" />
                  </button>
                  <button onClick={locateMe} title="Mi ubicación" className="flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/85 shadow-lg backdrop-blur-md transition active:scale-95">
                    <LocateFixed className="h-6 w-6 text-blue-600" />
                  </button>
                </>}
                <div title="Norte" aria-label="Norte" className="flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/85 shadow-lg backdrop-blur-md">
                  <Compass
                    className="h-6 w-6 text-rose-500 transition-transform duration-300"
                    style={{ transform: `rotate(${-Number(locationDetails?.heading || 0)}deg)` }}
                  />
                </div>
              </div>

              {distanceMode && mobileMapSheet === 'none' && routeOrigin && routeDestination && !pendingMapPoint && (
                <div
                  className="absolute inset-x-3 z-[1012] md:hidden"
                  style={{ bottom: 'calc(env(safe-area-inset-bottom) + 150px)' }}
                >
                  <div className="overflow-hidden rounded-xl border border-white/70 bg-white/95 shadow-xl backdrop-blur-md">
                    <button
                      onClick={() => setRouteSheetExpanded(expanded => !expanded)}
                      className="flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left"
                      aria-expanded={routeSheetExpanded}
                    >
                      <span className="text-sm font-semibold text-gray-900">{routeLoading ? 'Calculando ruta…' : routeResult ? `${formatRouteDistance(routeResult.distanceKm)} · ${formatRouteDuration(routeResult.durationMinutes)}` : 'Ruta'}</span>
                      <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform ${routeSheetExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {routeSheetExpanded && (
                      <div className="border-t border-gray-100 px-4 pb-3 pt-2 text-xs text-gray-700">
                        <div className="space-y-1">
                          <div><span className="font-medium text-emerald-700">Origen</span> · {routeOrigin.name}</div>
                          <div><span className="font-medium text-rose-700">Destino</span> · {routeDestination.name}</div>
                          {routeResult && <div>{formatRouteDistance(routeResult.straightLineKm)} en línea recta</div>}
                          <div className="text-[10px] text-gray-500">Tiempo estimado, sin tráfico en tiempo real.</div>
                          {routeError && <div className="text-amber-700">{routeError}</div>}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button onClick={focusRoute} className="rounded-md bg-blue-600 px-2 py-2 text-xs font-medium text-white">Ver ruta</button>
                          <button onClick={() => window.open(buildRouteNavigationUrl(routeOrigin, routeDestination), '_blank')} className="rounded-md bg-green-600 px-2 py-2 text-xs font-medium text-white">Navegar</button>
                          <button onClick={swapRoutePoints} className="rounded-md bg-slate-100 px-2 py-2 text-xs font-medium text-slate-700">Intercambiar</button>
                          <button onClick={clearRoute} className="rounded-md bg-slate-100 px-2 py-2 text-xs font-medium text-slate-700">Limpiar</button>
                        </div>
                        {routeDestinationCustomer && <button onClick={() => flyToCustomer(routeDestinationCustomer)} className="mt-2 text-xs font-medium text-blue-700">Ver cliente</button>}
                        {routeError && <button onClick={retryRoute} className="mt-2 text-xs font-medium text-blue-700">Reintentar</button>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Píldora resumen / hoja inferior */}
              {!distanceMode && (!sheetOpen && !pendingMapPoint ? (
                <div
                  className="absolute inset-x-0 z-[1010] flex justify-center md:hidden"
                  style={{ bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}
                >
                  <div className="flex min-h-11 items-stretch overflow-hidden rounded-full border border-white/60 bg-white/90 text-xs font-medium text-gray-800 shadow-xl backdrop-blur-md">
                    <button
                      onClick={() => openMobileList('mapped')}
                      aria-label={`Ver ${mobileSummaryMappedClients.length} clientes en el mapa`}
                      className="min-h-11 px-3 text-blue-700 transition active:bg-blue-50"
                    >
                      {mobileSummaryMappedClients.length} en mapa
                    </button>
                    <span className="my-2 w-px bg-gray-200" />
                    <button
                      onClick={() => openMobileList('all')}
                      aria-label={`Ver ${mobileSummaryClients.length} clientes`}
                      className="min-h-11 px-3 transition active:bg-gray-100"
                    >
                      {mobileSummaryClients.length} clientes
                    </button>
                    <span className="my-2 w-px bg-gray-200" />
                    <button
                      onClick={() => openMobileList('unmapped')}
                      aria-label={`Ver ${mobileSummaryUnmappedClients.length} clientes sin coordenadas`}
                      className="min-h-11 px-3 text-amber-700 transition active:bg-amber-50"
                    >
                      {mobileSummaryUnmappedClients.length} sin mapa
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`absolute inset-x-0 bottom-0 z-[1011] flex flex-col rounded-t-2xl bg-white shadow-2xl md:hidden ${
                  sheetSize === 'full' ? 'max-h-[calc(100%-env(safe-area-inset-top)-72px)]' : 'max-h-[60%]'
                }`}>
                  <button
                    className="flex w-full flex-col items-center pb-1 pt-2"
                    onClick={() => setSheetSize(size => size === 'half' ? 'full' : 'half')}
                    aria-label={sheetSize === 'half' ? 'Ampliar lista' : 'Reducir lista'}
                  >
                    <span className="h-1 w-10 rounded-full bg-gray-300" />
                  </button>
                  <div className="flex items-center justify-between px-4 pb-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {mobileListMode === 'mapped'
                          ? 'Clientes en el mapa'
                          : mobileListMode === 'unmapped'
                            ? 'Clientes sin coordenadas'
                            : cityDetailMode
                          ? `${selectedCity} · ${cityCustomers.length} clientes`
                          : searchActive
                            ? searchCityLabel
                              ? `${resolvedCustomers.length} clientes encontrados en ${searchCityLabel}`
                              : 'Resultados de búsqueda'
                            : `${resolvedCustomers.length} clientes`}
                      </div>
                      {(cityDetailMode || searchActive || mobileListMode !== 'all') && (
                        <div className="mt-0.5 text-xs text-gray-500">
                          {`${mobileSummaryMappedClients.length} en el mapa · ${mobileSummaryUnmappedClients.length} sin localizar`}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {cityDetailMode && (
                        <button
                          onClick={closeCityDetails}
                          className="inline-flex h-9 items-center gap-1 rounded-full bg-blue-50 px-3 text-xs font-medium text-blue-700 active:bg-blue-100"
                        >
                          <ChevronLeft className="h-4 w-4" /> Volver
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
                    {mobileSheetClients.length === 0 ? (
                      <div className="py-10 text-center">
                        <MapPin className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                        <p className="text-sm text-gray-500">No encontramos clientes que coincidan con tu búsqueda.</p>
                        <button onClick={() => setSearchTerm('')} className="mt-3 text-sm font-medium text-blue-600">Limpiar búsqueda</button>
                      </div>
                    ) : (
                      mobileSheetClients.map(client => (
                        <button
                          key={client.id}
                          onClick={() => {
                            setSheetOpen(false)
                            setMobileListMode('all')
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
                            <div className="mt-0.5 truncate text-xs text-gray-500">{client.address}</div>
                            {client.phone && <div className="mt-0.5 text-xs text-gray-500">{client.phone}</div>}
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
                            {hasRenderableCoordinates(client) && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">
                                en mapa
                              </span>
                            )}
                            {client.geocodeStatus === 'approximate' && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                                aproximado
                              </span>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ))}
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
    const resizeTimer = window.setTimeout(() => map.invalidateSize({ pan: false }), 300)

    return () => {
      window.clearTimeout(resizeTimer)
    }
  }, [map, mapRef])

  return null
}

function MapRoutePointPicker({
  enabled,
  selectionMode,
  onLongPress,
  onCenterChange,
  onConfirmCenter,
  onCancel,
}: {
  enabled: boolean
  selectionMode: boolean
  onLongPress: (coordinates: MapCoordinates) => void
  onCenterChange: (coordinates: MapCoordinates) => void
  onConfirmCenter: () => void
  onCancel: () => void
}) {
  const map = useMap()

  useMapEvents({
    moveend: () => {
      if (!selectionMode) return
      const center = map.getCenter()
      onCenterChange({ lat: center.lat, lng: center.lng })
    },
  })

  useEffect(() => {
    if (!selectionMode) return
    const container = map.getContainer()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        onConfirmCenter()
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }

    container.addEventListener('keydown', onKeyDown)
    return () => container.removeEventListener('keydown', onKeyDown)
  }, [map, onCancel, onConfirmCenter, selectionMode])

  useEffect(() => {
    if (!enabled) return

    const container = map.getContainer()
    const delay = 650
    const tolerance = 10
    let timer: number | null = null
    let startPoint: { x: number; y: number } | null = null
    let suppressNextClick = false

    const isMapControlTarget = (target: EventTarget | null) => target instanceof Element && Boolean(
      target.closest('.leaflet-marker-icon, .leaflet-marker-shadow, .leaflet-popup, .leaflet-control, button, input, a')
    )
    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = null
      startPoint = null
    }
    const toCoordinates = (x: number, y: number) => {
      const rect = container.getBoundingClientRect()
      const latLng = map.containerPointToLatLng([x - rect.left, y - rect.top])
      return { lat: latLng.lat, lng: latLng.lng }
    }
    const begin = (x: number, y: number, target: EventTarget | null) => {
      if (isMapControlTarget(target)) return
      startPoint = { x, y }
      timer = window.setTimeout(() => {
        timer = null
        startPoint = null
        suppressNextClick = true
        navigator.vibrate?.(20)
        onLongPress(toCoordinates(x, y))
        window.setTimeout(() => { suppressNextClick = false }, 300)
      }, delay)
    }
    const move = (x: number, y: number) => {
      if (!startPoint) return
      if (Math.hypot(x - startPoint.x, y - startPoint.y) > tolerance) clearTimer()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button > 0) return
      begin(event.clientX, event.clientY, event.target)
    }
    const onPointerMove = (event: PointerEvent) => move(event.clientX, event.clientY)
    const onPointerUp = () => clearTimer()
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      begin(touch.clientX, touch.clientY, event.target)
    }
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return clearTimer()
      const touch = event.touches[0]
      move(touch.clientX, touch.clientY)
    }
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      if (isMapControlTarget(event.target)) return
      onLongPress(toCoordinates(event.clientX, event.clientY))
    }
    const onClick = (event: MouseEvent) => {
      if (!suppressNextClick) return
      event.preventDefault()
      event.stopPropagation()
    }

    if ('PointerEvent' in window) {
      container.addEventListener('pointerdown', onPointerDown)
      container.addEventListener('pointermove', onPointerMove)
      container.addEventListener('pointerup', onPointerUp)
      container.addEventListener('pointercancel', onPointerUp)
    } else {
      container.addEventListener('touchstart', onTouchStart, { passive: true })
      container.addEventListener('touchmove', onTouchMove, { passive: true })
      container.addEventListener('touchend', onPointerUp)
      container.addEventListener('touchcancel', onPointerUp)
    }
    container.addEventListener('contextmenu', onContextMenu)
    container.addEventListener('click', onClick, true)

    return () => {
      clearTimer()
      container.removeEventListener('pointerdown', onPointerDown)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerup', onPointerUp)
      container.removeEventListener('pointercancel', onPointerUp)
      container.removeEventListener('touchstart', onTouchStart)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onPointerUp)
      container.removeEventListener('touchcancel', onPointerUp)
      container.removeEventListener('contextmenu', onContextMenu)
      container.removeEventListener('click', onClick, true)
    }
  }, [enabled, map, onLongPress])

  return null
}
