import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { translations } from '../lib/translations'
import type { Customer } from '../lib/supabase'
import {
  ExternalLink,
  LocateFixed,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Search,
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-markercluster'
import L, {
  LatLngBoundsExpression,
  LatLngExpression,
  Map as LeafletMap,
  Marker as LeafletMarker,
} from 'leaflet'

import VisitsMapModal from '../components/communications/VisitsMapModal'
import {
  getCoordinateAuditForClient,
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
  getCustomerDisplayAddress,
  getCustomerPhone,
} from '../components/communications/visitsMapUtils'
import {
  buildClientPopupHtml,
  buildResolvedMapClient,
  getClientRenderableCoordinates,
  hasRenderableCoordinates,
  isValidClient,
  refreshMapAndSidebarDistances,
  sanitizeClients,
  type ResolvedMapClient,
} from './mapsPageUtils'

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

const createCustomerIcon = (approximate: boolean, selected: boolean) => {
  const size = selected ? 20 : 18
  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
        <div style="
          width:${size}px;
          height:${size}px;
          border-radius:999px;
          background:${approximate ? '#eff6ff' : '#2563eb'};
          border:2px ${approximate ? 'dashed #2563eb' : 'solid #ffffff'};
          box-shadow:0 4px 12px rgba(15,23,42,.22);
          outline:${selected ? '3px solid rgba(59,130,246,.28)' : 'none'};
        "></div>
        <div style="
          width:2px;height:${size * 0.45}px;background:#2563eb;
          margin-top:-2px;opacity:.7;
        "></div>
      </div>
    `,
    iconSize: [size, size + size * 0.45],
    iconAnchor: [size / 2, size + size * 0.45],
    popupAnchor: [0, -(size + 4)],
  })
}

const myLocationIcon = L.divIcon({
  className: '',
  html: `
    <div style="width:18px;height:18px;border-radius:999px;background:#2563eb;border:3px solid #ffffff;box-shadow:0 0 0 6px rgba(37,99,235,.18),0 4px 12px rgba(37,99,235,.18)"></div>
  `,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

function MapViewport({
  bounds,
  defaultCenter,
}: {
  bounds: LatLngBoundsExpression | null
  defaultCenter: [number, number]
}) {
  const map = useMap()

  useEffect(() => {
    map.invalidateSize()
    if (bounds) {
      map.fitBounds(bounds, { padding: [48, 48] })
      return
    }
    map.setView(defaultCenter, 8)
  }, [bounds, defaultCenter, map])

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
  const [showVisitsMapModal, setShowVisitsMapModal] = useState(false)
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
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRegistryRef = useRef(new Map<string, LeafletMarker>())
  const geocodeAttemptedRef = useRef(new Set<string>())
  const isGeocodingRef = useRef(false)
  const [expandedCities, setExpandedCities] = useState<Set<string>>(new Set())
  const cityDistanceCacheRef = useRef(new Map<string, import('./mapsPageUtils').CityDistanceSummary>())
  const t = translations

  const persistCoordinateCache = useCallback((nextEntries: CoordinateCache) => {
    setCoordsById(previous => {
      const merged = { ...previous, ...nextEntries }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
      return merged
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

  const geocodeCustomerPrecise = useCallback(
    async (customer: Customer, force = false) => {
      const address = normalizeAddressForGeocoding(customer)

      console.log(`[GEOCODE_PRECISE] Customer: ${customer.name}`)
      console.log(`[GEOCODE_PRECISE] Full query: "${address}"`)

      if (!address || address === 'Spain') {
        console.warn('[GEOCODE_PRECISE] Empty or invalid query, skipping')
        return null
      }

      try {
        const response = await fetch('/api/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }),
        })

        console.log(`[GEOCODE_PRECISE] API response status: ${response.status}`)

        const apiResult = await response.json()
        const normalizedResults = normalizeGeocodeResults(apiResult)
        console.log('[GEOCODE_PRECISE] API result:', apiResult)
        console.log('[GEOCODE_PRECISE] normalized results:', normalizedResults)

        if (!response.ok) {
          console.error(`[GEOCODE_PRECISE] API error ${response.status}:`, apiResult)
          return null
        }

        if (normalizedResults.length === 0) {
          console.warn('[GEOCODE_PRECISE] Invalid result format or no usable results')
          return null
        }

        const audit = await validateAndFixClientCoordinates(customer, {
          cachedAudit: force ? null : coordsById[customer.id],
          geocodeFetcher: async () => normalizedResults,
        })

        return audit
      } catch (error) {
        console.error('[GEOCODE_PRECISE] Exception:', error)
        return null
      }
    },
    [coordsById]
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
    () => refreshMapAndSidebarDistances(resolvedCustomersBase, myLocation),
    [myLocation, resolvedCustomersBase]
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

  // Reset expanded cities when province/city filter changes
  useEffect(() => {
    setExpandedCities(new Set())
  }, [selectedProvince, selectedCity])

  // City groups for sidebar - uses distanceViewModel.cities for sorted grouping
  const cityGroups = useMemo(() => {
    return distanceViewModel.cities
  }, [distanceViewModel.cities])

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

  const markerClients = useMemo(() => renderAllMarkers(resolvedCustomersBase), [renderAllMarkers, resolvedCustomersBase])

  useEffect(() => {
    clearMarkers()
  }, [clearMarkers, markerClients.length])

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
    const missingFinalCoords = resolvedCustomers.reduce<
      Array<{
        id: string
        name: string
        city: string
        geocodeStatus: ResolvedMapClient['geocodeStatus']
        finalLat: number | null
        finalLng: number | null
      }>
    >((rows, client) => {
      if (getClientRenderableCoordinates(client)) return rows
      rows.push({
        id: client.id,
        name: client.name,
        city: client.city,
        geocodeStatus: client.geocodeStatus,
        finalLat: client.finalLat,
        finalLng: client.finalLng,
      })
      return rows
    }, [])

    if (missingFinalCoords.length > 0) {
      console.table(missingFinalCoords)
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

  const defaultCenter: LatLngExpression = useMemo(() => {
    if (myLocation) return [myLocation.lat, myLocation.lng]
    const firstCoords = getClientRenderableCoordinates(markerClients[0] ?? null)
    if (firstCoords) {
      return [firstCoords.lat, firstCoords.lng]
    }
    return [36.6867, -6.1371]
  }, [markerClients, myLocation])

  const mapBounds = useMemo<LatLngBoundsExpression | null>(() => {
    const points: [number, number][] = [
      ...markerClients
        .map(client => getClientRenderableCoordinates(client))
        .filter((coords): coords is MapCoordinates => Boolean(coords))
        .map(coords => [coords.lat, coords.lng] as [number, number]),
    ]

    if (myLocation) {
      points.push([myLocation.lat, myLocation.lng])
    }

    return points.length > 0 ? points : null
  }, [markerClients, myLocation])

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
        setMyLocation(coords)
        setLocationMessage('Distancias actualizadas desde tu ubicación.')
        mapRef.current?.flyTo([coords.lat, coords.lng], 13, { duration: 0.8 })
      },
      error => {
        console.debug('Geolocation error:', error.message)
        setLocationMessage('No se pudo obtener tu ubicación. Se mantiene la base actual.')
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
    )
  }, [])

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
        markerRegistryRef.current.get(target.id)?.openPopup()
      }, 250)
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

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="flex items-center">
          <button
            onClick={() => setShowVisitsMapModal(true)}
            className="inline-flex items-center space-x-2 rounded-lg bg-violet-600 px-4 py-2 text-white hover:bg-violet-700"
          >
            <MapPin className="h-4 w-4" />
            <span>Mapa de Visitas</span>
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
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
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="space-y-6 lg:col-span-1">
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
              {cityGroups.length === 0 ? (
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
                                          Ubicación aproximada. Dirección pendiente de validación.
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
                        Ubicación aproximada. Dirección pendiente de validación.
                      </div>
                    )}
                    {selectedCustomer.geocodeStatus !== 'valid' && (
                      <div className="text-rose-600">{selectedCustomer.geocodeReason}</div>
                    )}
                  </div>

                  <div className="space-y-2 border-t border-gray-200 pt-3">
                    <button
                      onClick={() => window.open(
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedCustomer.address)}`,
                        '_blank'
                      )}
                      className="inline-flex w-full items-center justify-center space-x-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>Abrir en Mapas</span>
                    </button>
                    <button
                      onClick={() => window.open(
                        `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedCustomer.address)}`,
                        '_blank'
                      )}
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
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="relative h-[800px]">
              <div className="absolute right-3 top-3 z-[1000] flex flex-col gap-2 sm:flex-row">
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
                />
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                <MarkerClusterGroup
                  iconCreateFunction={(cluster: { getChildCount: () => number }) => {
                    const count = cluster.getChildCount()
                    return L.divIcon({
                      html: `<div style="background:#2563eb;color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);">${count}</div>`,
                      className: '',
                      iconSize: L.point(36, 36),
                    })
                  }}
                  maxClusterRadius={40}
                  spiderfyOnMaxZoom
                  showCoverageOnHover={false}
                  zoomToBoundsOnClick
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
                          client.geocodeStatus === 'approximate',
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
                                  Ubicación aproximada. Dirección pendiente de validación.
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
                                onClick={() => window.open(
                                  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(client.address)}`,
                                  '_blank'
                                )}
                                className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs text-green-600 transition-colors hover:bg-green-100"
                              >
                                <Navigation className="mr-1 h-3 w-3" /> Direcciones
                              </button>
                              <button
                                onClick={() => window.open(
                                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(client.address)}`,
                                  '_blank'
                                )}
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

              {/* Map legend + stats */}
              <div className="absolute bottom-4 right-3 bg-white rounded-lg shadow-md border border-gray-200 p-3 text-xs space-y-1.5 z-[1000] min-w-[170px]">
                <div className="font-semibold text-gray-600 mb-1">Leyenda</div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow"></span> Cliente
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-50 border-2 border-dashed border-blue-600 shadow"></span> Cliente aproximado
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-blue-600 border-[3px] border-white shadow" style={{ boxShadow: '0 0 0 4px rgba(37,99,235,.18), 0 4px 12px rgba(37,99,235,.18)' }}></span> Mi ubicación
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
            </div>
          </div>
        </div>
      </div>

      {showVisitsMapModal && (
        <VisitsMapModal customers={customers} onClose={() => setShowVisitsMapModal(false)} />
      )}
    </div>
  )
}

function MapBridge({ mapRef }: { mapRef: React.MutableRefObject<LeafletMap | null> }) {
  const map = useMap()

  useEffect(() => {
    mapRef.current = map
  }, [map, mapRef])

  return null
}
