import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, Customer } from '../lib/supabase'
import { translations } from '../lib/translations'
import {
  saveCompletedVisitsToDb,
  syncLocalCompletedVisitsToDb,
  deleteCompletedVisitsByRoute,
  readLocalCompletedVisits,
  writeLocalCompletedVisits,
} from '../services/completedVisitsService'
import {
  MapPin,
  Users,
  Calendar,
  Clock,
  Plus,
  X,
  Phone,
  Mail,
  ChevronUp,
  ChevronDown,
  Navigation,
  Search,
  Filter,
  Route,
  ArrowUpDown,
  Trash2,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  Car,
  ExternalLink,
  Download,
  Upload,
  LocateFixed,
  RefreshCcw,
  Maximize2,
  Minimize2,
  FileDown,
  Ruler
} from 'lucide-react'

// Leaflet (OpenStreetMap) imports for zero-Google-cost rendering
// Note: remember to `npm i leaflet @types/leaflet` in the project
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { mapTileProvider } from '../services/mapProviders'
import { createVehicleLocationIcon } from '../components/map/VehicleLocationIcon'
import {
  OsrmRoutingProvider,
  formatRouteDistance,
  formatRouteDuration,
  routePointFromCoordinates,
  type RoutePoint,
  type RouteResult,
} from '../services/routingProvider'
import '../styles/casmara-marker.css'

interface RouteCustomer extends Customer {
  order: number
  distance?: number // km
  duration?: number // minutes
}

type MeasurementStep = 'idle' | 'selecting-a' | 'selecting-b' | 'calculating' | 'result'

const formatKm = (value: number | undefined | null): string => {
  const num = Number(value || 0)
  if (!Number.isFinite(num)) return '0 km'
  return `${num.toFixed(1)} km`
}

// ── Unified Route Distance Model ──────────────────────────────
interface RouteDistanceStop {
  id: string
  name: string
  lat: number | null
  lng: number | null
  distanceFromUserKm: number | null
  distanceFromPreviousStopKm: number | null
  cumulativeDistanceKm: number | null
}

interface RouteDistanceState {
  userLocation: { lat: number; lng: number } | null
  stops: RouteDistanceStop[]
  totalDistanceKm: number | null
  calculatedAt: string | null
}

const EMPTY_ROUTE_DISTANCES: RouteDistanceState = {
  userLocation: null,
  stops: [],
  totalDistanceKm: null,
  calculatedAt: null,
}

const formatDistanceKm = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value < 1) return `${value.toFixed(2)} km`
  return `${value.toFixed(1)} km`
}

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function computeRouteDistances(
  routeCustomers: RouteCustomer[],
  coordsLookup: Record<string, { lat: number; lng: number }>,
  userLocation: { lat: number; lng: number } | null,
): RouteDistanceState {
  if (routeCustomers.length === 0) return { ...EMPTY_ROUTE_DISTANCES, userLocation }

  let cumulative = 0
  const stops: RouteDistanceStop[] = routeCustomers.map((c, idx) => {
    const pos = coordsLookup[c.id] ?? null
    const lat = pos?.lat ?? null
    const lng = pos?.lng ?? null

    let distanceFromUserKm: number | null = null
    let distanceFromPreviousStopKm: number | null = null

    if (idx === 0) {
      if (userLocation && lat != null && lng != null) {
        distanceFromUserKm = haversineKm(userLocation.lat, userLocation.lng, lat, lng)
        cumulative += distanceFromUserKm
      }
    } else {
      const prev = coordsLookup[routeCustomers[idx - 1].id]
      if (prev && lat != null && lng != null) {
        distanceFromPreviousStopKm = haversineKm(prev.lat, prev.lng, lat, lng)
        cumulative += distanceFromPreviousStopKm
      }
    }

    return {
      id: c.id,
      name: c.name,
      lat,
      lng,
      distanceFromUserKm,
      distanceFromPreviousStopKm,
      cumulativeDistanceKm: cumulative > 0 ? Number(cumulative.toFixed(2)) : null,
    }
  })

  const totalDistanceKm = cumulative > 0 ? Number(cumulative.toFixed(1)) : null

  console.log('[ROUTE_DISTANCE] user location:', userLocation)
  console.log('[ROUTE_DISTANCE] stop distances:', stops.map(s => ({
    name: s.name,
    fromUser: s.distanceFromUserKm,
    fromPrev: s.distanceFromPreviousStopKm,
    cumul: s.cumulativeDistanceKm,
  })))
  console.log('[ROUTE_DISTANCE] total:', totalDistanceKm)

  return {
    userLocation,
    stops,
    totalDistanceKm,
    calculatedAt: new Date().toISOString(),
  }
}

export default function Visits() {
  const { user } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [routeCustomers, setRouteCustomers] = useState<RouteCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProvince, setSelectedProvince] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [totalDistance, setTotalDistance] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  // Manual reset trigger for Leaflet map to recover from blank screen
  const [leafletReset, setLeafletReset] = useState(0)
  // Fullscreen state for Leaflet map
  const [leafletFullscreen, setLeafletFullscreen] = useState(false)
  // Document fullscreen state
  const [isDocFullscreen, setIsDocFullscreen] = useState(false)
  const [routeDate, setRouteDate] = useState('')
  const [routeTime, setRouteTime] = useState('')
  const [savedRoutes, setSavedRoutes] = useState<any[]>([])
  const [routeName, setRouteName] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showLoadModal, setShowLoadModal] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [mobileSheetTab, setMobileSheetTab] = useState<'route' | 'clients'>('route')
  const [loadingSavedRoutes, setLoadingSavedRoutes] = useState(false)
  // Filtering states for saved routes modal
  const [savedRoutesProvince, setSavedRoutesProvince] = useState('')
  const [savedRoutesCity, setSavedRoutesCity] = useState('')
  // Edit mode for save functionality
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null)
  // ── Unified route distance state ──────────────────────────
  const [routeDistances, setRouteDistances] = useState<RouteDistanceState>(EMPTY_ROUTE_DISTANCES)
  const [firstLegRoute, setFirstLegRoute] = useState<{ customerId: string; result: RouteResult | null; loading: boolean } | null>(null)
  const [measurementStep, setMeasurementStep] = useState<MeasurementStep>('idle')
  const [measurementOrigin, setMeasurementOrigin] = useState<RoutePoint | null>(null)
  const [measurementDestination, setMeasurementDestination] = useState<RoutePoint | null>(null)
  const [measurementResult, setMeasurementResult] = useState<RouteResult | null>(null)
  const [measurementError, setMeasurementError] = useState<string | null>(null)
  const userLocationRef = useRef<{ lat: number; lng: number } | null>(null)
  const firstLegAbortRef = useRef<AbortController | null>(null)
  const measurementAbortRef = useRef<AbortController | null>(null)
  const routingProviderRef = useRef(new OsrmRoutingProvider())
  // Detect if a saved route already exists with the same name (case-insensitive)
  const existingRouteSameName = useMemo(() => {
    try {
      const name = String(routeName || '').trim().toLowerCase()
      if (!name) return null
      return (savedRoutes || []).find((r: any) => String(r?.name || '').trim().toLowerCase() === name) || null
    } catch {
      return null
    }
  }, [routeName, savedRoutes])

  // Leaflet: manual reset to recover from blank screen
  const resetLeafletMap = () => {
    try {
      console.log('[Leaflet] Manual reset requested')
      isManualResetRef.current = true
      if (leafletMapInstanceRef.current) {
        try { leafletMapInstanceRef.current.remove() } catch {}
        leafletMapInstanceRef.current = null
      }
      leafletMarkersRef.current.forEach(m => { try { m.remove() } catch {} })
      leafletMarkersRef.current = []
      if (leafletPolylineRef.current) {
        try { leafletPolylineRef.current.remove() } catch {}
        leafletPolylineRef.current = null
      }
      setLeafletReset(v => v + 1)
      setTimeout(() => { try { leafletMapInstanceRef.current?.invalidateSize?.() } catch {} }, 300)
    } catch (e) {
      console.warn('[Leaflet] reset failed:', e)
    }
  }

  // 封裝：為客戶解析座標（帶有多級回退與本地持久化）
  const resolveCustomerCoords = async (c: Customer): Promise<{ lat: number; lng: number } | null> => {
    try {
      // 0) memory cache
      const cached = leafletCoordsRef.current[c.id]
      if (cached) return cached

      // 1) DB lat/lng
      if (
        typeof (c as any).latitude === 'number' && typeof (c as any).longitude === 'number' &&
        !isNaN((c as any).latitude) && !isNaN((c as any).longitude)
      ) {
        const val = { lat: (c as any).latitude as number, lng: (c as any).longitude as number }
        leafletCoordsRef.current[c.id] = val
        try {
          const m = JSON.parse(localStorage.getItem('carmara-customer-coords') || '{}')
          m[c.id] = val
          localStorage.setItem('carmara-customer-coords', JSON.stringify(m))
        } catch {}
        return val
      }

      // 2) localStorage cache (from Maps page or previous resolves)
      try {
        const m = JSON.parse(localStorage.getItem('carmara-customer-coords') || '{}')
        const lc = m && m[c.id]
        if (lc && typeof lc.lat === 'number' && typeof lc.lng === 'number') {
          const val = { lat: Number(lc.lat), lng: Number(lc.lng) }
          leafletCoordsRef.current[c.id] = val
          return val
        }
      } catch {}

      // 3) full formatted address
      const full = getAddress(c)
      if (full) {
        const gc1 = await geocodeAddress(full)
        if (gc1) {
          const val = { lat: gc1.lat, lng: gc1.lng }
          leafletCoordsRef.current[c.id] = val
          try {
            const m = JSON.parse(localStorage.getItem('carmara-customer-coords') || '{}')
            m[c.id] = val
            localStorage.setItem('carmara-customer-coords', JSON.stringify(m))
          } catch {}
          return val
        }
      }

      // 4) city + province
      const city = (displayCity(c) || (c as any).city || '').trim()
      const prov = (displayProvince(c) || (c as any).province || '').trim()
      if (city || prov) {
        const q2 = [city, prov, 'España'].filter(Boolean).join(', ')
        const gc2 = await geocodeAddress(q2)
        if (gc2) {
          const val = { lat: gc2.lat, lng: gc2.lng }
          leafletCoordsRef.current[c.id] = val
          try {
            const m = JSON.parse(localStorage.getItem('carmara-customer-coords') || '{}')
            m[c.id] = val
            localStorage.setItem('carmara-customer-coords', JSON.stringify(m))
          } catch {}
          return val
        }
      }

      // 5) province only
      if (prov) {
        const q3 = [prov, 'España'].filter(Boolean).join(', ')
        const gc3 = await geocodeAddress(q3)
        if (gc3) {
          const val = { lat: gc3.lat, lng: gc3.lng }
          leafletCoordsRef.current[c.id] = val
          try {
            const m = JSON.parse(localStorage.getItem('carmara-customer-coords') || '{}')
            m[c.id] = val
            localStorage.setItem('carmara-customer-coords', JSON.stringify(m))
          } catch {}
          return val
        }
      }

      return null
    } catch {
      return null
    }
  }
  const t = translations
  // Phase 1 intentionally keeps the route renderer on Leaflet only.
  const mapsApiKey = ''
  const mapProvider = 'leaflet' as 'google' | 'leaflet'
  // Per-user draft key for autosave of route planning
  const draftKey = useMemo(() => (user?.id ? `routeDraft:${user.id}` : 'routeDraft'), [user?.id])
  if (mapProvider === 'google') {
    console.log('[RoutePlanning] Maps API Key:', mapsApiKey ? 'Present' : 'Missing')
    if (!mapsApiKey) {
      console.warn('[RoutePlanning] VITE_GOOGLE_MAPS_API_KEY is missing on frontend. Map embed will not render directions.')
    }
  }

  // Helpers for tel: links and safe HTML in InfoWindow
  const sanitizePhone = (phone?: string) => String(phone || '').replace(/\D+/g, '')
  const telHref = (phone?: string) => {
    const digits = sanitizePhone(phone)
    return digits ? `tel:${digits}` : ''
  }
  const escapeHtml = (str?: string) =>
    String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')

  const buildGoogleMapsSearchUrl = (customer: Customer) => {
    const q = getAddress(customer)
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
  }
  const buildGoogleMapsDirectionsUrl = (customer: Customer) => {
    const dest = getAddress(customer)
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`
  }

  // Build a custom numbered SVG marker icon to avoid default label outlines
  const createNumberedMarkerIcon = (n: number) => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'>
  <defs>
    <filter id='shadow' x='-20%' y='-20%' width='140%' height='140%'>
      <feDropShadow dx='0' dy='1' stdDeviation='1' flood-color='rgba(0,0,0,0.25)'/>
    </filter>
  </defs>
  <circle cx='17' cy='17' r='14' fill='#2563EB' filter='url(#shadow)' />
  <text x='17' y='21' text-anchor='middle' font-family='system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif' font-size='14' font-weight='700' fill='#FFFFFF'>${n}</text>
</svg>`
    const url = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
    const g = (window as any).google
    return {
      url,
      scaledSize: new g.maps.Size(34, 34),
      anchor: new g.maps.Point(17, 17),
    }
  }

  // Icon for "My Location" marker
  const createMyLocationIcon = () => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'>
  <defs>
    <filter id='shadow' x='-20%' y='-20%' width='140%' height='140%'>
      <feDropShadow dx='0' dy='1' stdDeviation='1' flood-color='rgba(0,0,0,0.25)'/>
    </filter>
  </defs>
  <circle cx='10' cy='10' r='8' fill='#2563EB' filter='url(#shadow)' />
  <circle cx='10' cy='10' r='3' fill='#FFFFFF' />
  <circle cx='10' cy='10' r='2' fill='#2563EB' />
</svg>`
    const url = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg)
    const g = (window as any).google
    return {
      url,
      scaledSize: new g.maps.Size(20, 20),
      anchor: new g.maps.Point(10, 10),
    }
  }

  // Google Maps JS API refs/state
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const directionsServiceRef = useRef<any>(null)
  const directionsRendererRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const myLocationMarkerRef = useRef<any>(null)
  const myLocationInfoRef = useRef<any>(null)
  const bottomSheetRef = useRef<HTMLDivElement | null>(null)
  const fullContainerRef = useRef<HTMLDivElement | null>(null)

  // Leaflet map refs/state (for OSM rendering)
  const leafletMapInstanceRef = useRef<L.Map | null>(null)
  const leafletMarkersRef = useRef<L.Marker[]>([])
  const leafletPolylineRef = useRef<L.Polyline | null>(null)
  const leafletMeasurementMarkersRef = useRef<L.Marker[]>([])
  const leafletMeasurementPolylineRef = useRef<L.Polyline | null>(null)
  // Leaflet-only: my location marker & geolocation watcher
  const leafletMyLocationMarkerRef = useRef<L.Marker | null>(null)
  const leafletGeoWatchIdRef = useRef<number | null>(null)
  // Guard: manual reset in progress (to avoid any auto recalculation/reordering side-effects)
  const isManualResetRef = useRef(false)
  // Cache coords per customer id when in Leaflet mode to avoid re-geocoding
  const leafletCoordsRef = useRef<Record<string, { lat: number; lng: number }>>({})
  // Calculation guards to prevent loops / redundant recalculations in Leaflet mode
  const isCalculatingRef = useRef(false)
  const lastCalcKeyRef = useRef<string>('')
  const lastComputedDistanceRef = useRef<number>(-1)

  // ── Unified distance recalculation (single entry point) ────
  const recalcRouteDistances = useCallback((
    customers?: RouteCustomer[],
    userLoc?: { lat: number; lng: number } | null,
  ) => {
    const rc = customers ?? routeCustomers
    const ul = userLoc !== undefined ? userLoc : userLocationRef.current
    const state = computeRouteDistances(rc, leafletCoordsRef.current, ul)
    setRouteDistances(state)
    // Also sync the legacy totalDistance so existing summary cards stay accurate
    if (state.totalDistanceKm != null && state.totalDistanceKm > 0) {
      setTotalDistance(state.totalDistanceKm)
    }
  }, [routeCustomers])

  // The route list keeps straight-line distances for all stops. For the first
  // visit, show the practical road distance and driving time from the MINI.
  useEffect(() => {
    const firstStop = routeDistances.stops[0]
    const userLocation = routeDistances.userLocation
    firstLegAbortRef.current?.abort()

    if (!firstStop || !userLocation || firstStop.lat == null || firstStop.lng == null) {
      setFirstLegRoute(null)
      return
    }

    const controller = new AbortController()
    firstLegAbortRef.current = controller
    setFirstLegRoute({ customerId: firstStop.id, result: null, loading: true })

    routingProviderRef.current.calculateRoute(
      routePointFromCoordinates('current-location', 'Mi ubicación', userLocation),
      routePointFromCoordinates('customer', firstStop.name, { lat: firstStop.lat, lng: firstStop.lng }, firstStop.id),
      controller.signal,
    ).then(result => {
      if (!controller.signal.aborted) {
        setFirstLegRoute({ customerId: firstStop.id, result, loading: false })
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        setFirstLegRoute({ customerId: firstStop.id, result: null, loading: false })
      }
    })

    return () => controller.abort()
  }, [routeDistances.stops, routeDistances.userLocation])

  const clearMeasurement = useCallback(() => {
    measurementAbortRef.current?.abort()
    setMeasurementOrigin(null)
    setMeasurementDestination(null)
    setMeasurementResult(null)
    setMeasurementError(null)
    setMeasurementStep('idle')
  }, [])

  const startMeasurement = useCallback(() => {
    setMeasurementOrigin(null)
    setMeasurementDestination(null)
    setMeasurementResult(null)
    setMeasurementError(null)
    setMeasurementStep('selecting-a')
    setShowDetails(false)
  }, [])

  const selectMeasurementPoint = useCallback((point: RoutePoint) => {
    if (measurementStep === 'selecting-a') {
      setMeasurementOrigin(point)
      setMeasurementDestination(null)
      setMeasurementResult(null)
      setMeasurementError(null)
      setMeasurementStep('selecting-b')
      return
    }
    if (measurementStep === 'selecting-b') {
      setMeasurementDestination(point)
      setMeasurementResult(null)
      setMeasurementError(null)
      setMeasurementStep('calculating')
    }
  }, [measurementStep])

  useEffect(() => {
    measurementAbortRef.current?.abort()
    if (!measurementOrigin || !measurementDestination) return

    const controller = new AbortController()
    measurementAbortRef.current = controller
    setMeasurementStep('calculating')
    routingProviderRef.current.calculateRoute(measurementOrigin, measurementDestination, controller.signal)
      .then(result => {
        if (!controller.signal.aborted) {
          setMeasurementResult(result)
          setMeasurementStep('result')
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMeasurementResult(null)
          setMeasurementError('No se pudo calcular la ruta por carretera.')
          setMeasurementStep('result')
        }
      })

    return () => controller.abort()
  }, [measurementDestination, measurementOrigin])

  useEffect(() => {
    const map = leafletMapInstanceRef.current
    if (!map) return

    leafletMeasurementMarkersRef.current.forEach(marker => marker.remove())
    leafletMeasurementMarkersRef.current = []
    leafletMeasurementPolylineRef.current?.remove()
    leafletMeasurementPolylineRef.current = null

    const addPointMarker = (point: RoutePoint, label: 'A' | 'B') => {
      const marker = L.marker([point.latitude, point.longitude], {
        icon: L.divIcon({
          className: '',
          html: `<div style="display:flex;height:34px;width:34px;align-items:center;justify-content:center;border:3px solid #fff;border-radius:999px;background:${label === 'A' ? '#2563eb' : '#0f766e'};color:#fff;font-size:14px;font-weight:700;box-shadow:0 2px 5px rgba(15,23,42,.35)">${label}</div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        interactive: false,
      }).addTo(map)
      leafletMeasurementMarkersRef.current.push(marker)
    }

    if (measurementOrigin) addPointMarker(measurementOrigin, 'A')
    if (measurementDestination) addPointMarker(measurementDestination, 'B')

    if (measurementOrigin && measurementDestination) {
      const positions = measurementResult?.geometry && measurementResult.geometry.length > 1
        ? measurementResult.geometry.map(([lng, lat]) => [lat, lng] as L.LatLngExpression)
        : [[measurementOrigin.latitude, measurementOrigin.longitude], [measurementDestination.latitude, measurementDestination.longitude]] as L.LatLngExpression[]
      leafletMeasurementPolylineRef.current = L.polyline(positions, {
        color: '#2563eb',
        weight: 5,
        opacity: 0.9,
        dashArray: measurementResult?.geometry ? undefined : '8 8',
      }).addTo(map)
    }
  }, [measurementDestination, measurementOrigin, measurementResult])

  useEffect(() => {
    const map = leafletMapInstanceRef.current
    if (!map || (measurementStep !== 'selecting-a' && measurementStep !== 'selecting-b')) return
    const onMapClick = (event: L.LeafletMouseEvent) => {
      selectMeasurementPoint(routePointFromCoordinates('map-point', 'Punto seleccionado', {
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      }))
    }
    map.on('click', onMapClick)
    return () => { map.off('click', onMapClick) }
  }, [measurementStep, selectMeasurementPoint])

  // Load Google Maps JS API if needed
  const ensureGoogleMapsLoaded = async (): Promise<any> => {
    if ((window as any).google?.maps) return (window as any).google
    if (!mapsApiKey) throw new Error('Missing Google Maps API key')
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector('script[data-role="gmaps-js"]') as HTMLScriptElement | null
      if (existing) {
        existing.addEventListener('load', () => resolve())
        existing.addEventListener('error', () => reject(new Error('Google Maps script failed to load')))
        return
      }
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}`
      script.async = true
      script.defer = true
      script.setAttribute('data-role', 'gmaps-js')
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Google Maps script failed to load'))
      document.head.appendChild(script)
    })
    return (window as any).google
  }

  // Small helper to await next tick or a short delay
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  // Render route on Google Maps with numbered markers
  useEffect(() => {
    // Only run Google Maps renderer when provider is 'google'
    if (mapProvider !== 'google') return
    const render = async () => {
      try {
        // Require API key
        if (!mapsApiKey) return

        // Wait for the map container to be mounted (can lag right after draft restore)
        if (!mapRef.current) {
          await sleep(0)
        }
        if (!mapRef.current) {
          await sleep(50)
        }
        if (!mapRef.current) return
        const google = await ensureGoogleMapsLoaded()

        // Init map and services once
        if (!mapInstanceRef.current) {
          const isTouchDevice = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window || (navigator as any).maxTouchPoints > 0
          const gestureHandling = isTouchDevice ? ('greedy' as any) : ('cooperative' as any)
          mapInstanceRef.current = new google.maps.Map(mapRef.current, {
            // Default center; we fit bounds to the route below once directions are rendered
            center: { lat: 36.7213, lng: -4.4214 },
            zoom: routeCustomers.length ? 10 : 7,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            gestureHandling
          })
          // Ensure map properly lays out if container just appeared
          try {
            google.maps.event.trigger(mapInstanceRef.current, 'resize')
          } catch (err) {
            // Ignore: resize may fail if map not fully ready yet
          }
          // Base padding; bottom will be adjusted dynamically when the bottom sheet is open
          try {
            mapInstanceRef.current.setOptions?.({ padding: { top: 16, right: 16, bottom: 16, left: 16 } })
          } catch {}
        }
        if (!directionsServiceRef.current) directionsServiceRef.current = new google.maps.DirectionsService()
        if (!directionsRendererRef.current) {
          directionsRendererRef.current = new google.maps.DirectionsRenderer({
            suppressMarkers: true,
            polylineOptions: {
              strokeColor: '#2563EB',
              strokeOpacity: 0.9,
              strokeWeight: 5
            }
          })
          directionsRendererRef.current.setMap(mapInstanceRef.current)
        } else {
          // Ensure polyline styling is applied even if renderer already exists
          directionsRendererRef.current.setOptions({
            polylineOptions: {
              strokeColor: '#2563EB',
              strokeOpacity: 0.9,
              strokeWeight: 5
            }
          })
        }

        // If only one stop, skip directions and just drop a marker
        if (routeCustomers.length === 1) {
          // Clear any previous route
          if (directionsRendererRef.current) {
            directionsRendererRef.current.set('directions', null)
          }
          // Clear old markers
          markersRef.current.forEach(m => m.setMap(null))
          markersRef.current = []
          const single = routeCustomers[0]
          const coords = await geocodeAddress(getAddress(single))
          if (coords) {
            const map = mapInstanceRef.current
            const position = { lat: coords.lat, lng: coords.lng }
            const marker = new (window as any).google.maps.Marker({
              position,
              map,
              icon: createNumberedMarkerIcon(1),
              title: `${single.name}${single.phone ? ' • ' + single.phone : ''}`
            })
            const infoHtml = `
              <div class="space-y-3 text-[13px]">
                <div class="border-b border-gray-200 pb-2">
                  <div class="font-semibold text-gray-900">1. ${escapeHtml(single.name)}</div>
                  ${single.company ? `<div class="text-xs text-gray-600 mt-1">${escapeHtml(single.company)}</div>` : ''}
                </div>
                <div class="space-y-2">
                  ${single.address ? `<div class=\"text-xs text-gray-700\">${escapeHtml(single.address)}</div>` : ''}
                  <div class="text-xs text-gray-500">${escapeHtml(displayCity(single) || single.city || single.province || '')}</div>
                  ${(single.phone || (single as any).mobile_phone) ? `<div class=\"text-xs text-gray-700\">${escapeHtml(single.phone || (single as any).mobile_phone)}</div>` : ''}
                  ${single.email ? `<div class=\"text-xs text-gray-700\">${escapeHtml(single.email)}</div>` : ''}
                </div>
                <div class="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                  ${(single.phone || (single as any).mobile_phone) ? `<a href="${telHref(single.phone || (single as any).mobile_phone)}" class=\"inline-flex items-center px-2 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md\">Llamar</a>` : ''}
                  <a href="${buildGoogleMapsDirectionsUrl(single)}" target="_blank" rel="noopener" class="inline-flex items-center px-2 py-1 text-xs bg-green-50 text-green-600 hover:bg-green-100 rounded-md">Direcciones</a>
                  <a href="${buildGoogleMapsSearchUrl(single)}" target="_blank" rel="noopener" class="inline-flex items-center px-2 py-1 text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-md">Google Maps</a>
                </div>
              </div>`
            const info = new (window as any).google.maps.InfoWindow({ content: infoHtml })
            marker.addListener('click', () => info.open({ anchor: marker, map }))
            markersRef.current.push(marker)
            map.setCenter(position)
            map.setZoom(13)
          }
          return
        }

        // If no customers in route, just show empty map
        if (routeCustomers.length === 0) {
          // Clear any previous route and markers
          if (directionsRendererRef.current) {
            directionsRendererRef.current.set('directions', null)
          }
          markersRef.current.forEach(m => m.setMap(null))
          markersRef.current = []
          
          // Center map on default location (Andalusia)
          const map = mapInstanceRef.current
          map.setCenter({ lat: 36.7213, lng: -4.4214 })
          map.setZoom(8)
          return
        }

        // Build route request using formatted addresses (2+ stops)
        const originAddr = getAddress(routeCustomers[0])
        const destinationAddr = getAddress(routeCustomers[routeCustomers.length - 1])
        const waypoints = routeCustomers.slice(1, -1).map(c => ({ location: getAddress(c), stopover: true }))

        const request: any = {
          origin: originAddr,
          destination: destinationAddr,
          waypoints,
          travelMode: (window as any).google.maps.TravelMode.DRIVING,
          optimizeWaypoints: false
        }

        const result = await directionsServiceRef.current.route(request)
        directionsRendererRef.current.setDirections(result)

        // Clear old markers
        markersRef.current.forEach(m => m.setMap(null))
        markersRef.current = []

        // Place markers using DirectionsResult legs to ensure markers align with polyline
        const map = mapInstanceRef.current
        const route = (result as any)?.routes?.[0]
        const legs: any[] = route?.legs || []

        // Build positions from legs: start of first leg, then end of each leg -> N stops
        let positions: Array<{ lat: number; lng: number }> = []
        if (legs.length > 0) {
          const first = legs[0].start_location
          positions.push({ lat: first.lat(), lng: first.lng() })
          legs.forEach((leg) => {
            const end = leg.end_location
            positions.push({ lat: end.lat(), lng: end.lng() })
          })
        }

        // Fallback: if legs are missing or length mismatch, geocode each address
        if (positions.length !== routeCustomers.length) {
          const geocoded = await Promise.all(
            routeCustomers.map(async (c) => {
              const coords = await geocodeAddress(getAddress(c))
              return coords ? { lat: coords.lat, lng: coords.lng } : null
            })
          )
          positions = geocoded.filter(Boolean) as Array<{ lat: number; lng: number }>
        }

        const bounds = new (window as any).google.maps.LatLngBounds()
        routeCustomers.forEach((c, idx) => {
          const pos = positions[idx]
          if (!pos) return
          const position = { lat: pos.lat, lng: pos.lng }
          const marker = new (window as any).google.maps.Marker({
            position,
            map,
            icon: createNumberedMarkerIcon(idx + 1),
            title: `${c.name}${(c as any).phone ? ' • ' + (c as any).phone : ''}`
          })
          const rc: any = c
          const infoHtml = `
            <div class="space-y-3 text-[13px]">
              <div class="border-b border-gray-200 pb-2">
                <div class="font-semibold text-gray-900">${idx + 1}. ${escapeHtml(rc.name)}</div>
                ${rc.company ? `<div class="text-xs text-gray-600 mt-1">${escapeHtml(rc.company)}</div>` : ''}
              </div>
              <div class="space-y-2">
                ${rc.address ? `<div class=\"text-xs text-gray-700\">${escapeHtml(rc.address)}</div>` : ''}
                <div class="text-xs text-gray-500">${escapeHtml(displayCity(rc) || rc.city || rc.province || '')}</div>
                ${(rc.phone || rc.mobile_phone) ? `<div class=\"text-xs text-gray-700\">${escapeHtml(rc.phone || rc.mobile_phone)}</div>` : ''}
                ${rc.email ? `<div class=\"text-xs text-gray-700\">${escapeHtml(rc.email)}</div>` : ''}
              </div>
              <div class="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                ${(rc.phone || rc.mobile_phone) ? `<a href="${telHref(rc.phone || rc.mobile_phone)}" class=\"inline-flex items-center px-2 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md\">Llamar</a>` : ''}
                <a href="${buildGoogleMapsDirectionsUrl(rc)}" target="_blank" rel="noopener" class="inline-flex items-center px-2 py-1 text-xs bg-green-50 text-green-600 hover:bg-green-100 rounded-md">Direcciones</a>
                <a href="${buildGoogleMapsSearchUrl(rc)}" target="_blank" rel="noopener" class="inline-flex items-center px-2 py-1 text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-md">Google Maps</a>
              </div>
            </div>`
          const info = new (window as any).google.maps.InfoWindow({ content: infoHtml })
          marker.addListener('click', () => info.open({ anchor: marker, map }))
          markersRef.current.push(marker)
          bounds.extend(position)
        })

        if (!bounds.isEmpty()) {
          // Trigger resize to ensure bounds fit if the container size changed recently
          try {
            (window as any).google.maps.event.trigger(map, 'resize')
          } catch (err) {
            // Ignore: resize may fail if map not fully ready yet
          }
          map.fitBounds(bounds)
        }
      } catch (e) {
        console.warn('[RoutePlanning] map render failed', e)
      }
    }
    render()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapsApiKey, routeCustomers, mapProvider])

  // Render route on Leaflet (OSM) with numbered markers and polyline
  useEffect(() => {
    if (mapProvider !== 'leaflet') return

    const renderLeaflet = async () => {
      try {
        if (!mapRef.current) return

        // Init Leaflet map once
        if (!leafletMapInstanceRef.current) {
          const map = L.map(mapRef.current, {
            zoomControl: true,
          })
          leafletMapInstanceRef.current = map

          L.tileLayer(mapTileProvider.url, {
            attribution: mapTileProvider.attribution,
            maxZoom: mapTileProvider.maxZoom,
          }).addTo(map)
          // Fix occasional blank tiles by invalidating size after mount
          try { setTimeout(() => map.invalidateSize(), 0) } catch {}
          try { setTimeout(() => map.invalidateSize(), 250) } catch {}

          map.setView([36.7213, -4.4214], routeCustomers.length ? 10 : 7)
        }

        const map = leafletMapInstanceRef.current!

        // Clear existing markers/polyline
        try {
          leafletMarkersRef.current.forEach(m => m.remove())
          leafletMarkersRef.current = []
          if (leafletPolylineRef.current) {
            leafletPolylineRef.current.remove()
            leafletPolylineRef.current = null
          }
        } catch {}

        if (routeCustomers.length === 0) {
          map.setView([36.7213, -4.4214], 8)
          return
        }

        // Resolve coordinates for all stops (with caching/fallback)
        const entries = await Promise.all(
          routeCustomers.map(async (c, idx) => {
            const pos = await resolveCustomerCoords(c)
            return { c, idx, pos }
          })
        )
        // 构造与路线等长的位置数组；对缺失的点用相邻/默认位置回退
        const positionsByIdx: Array<{ lat: number; lng: number } | null> = new Array(routeCustomers.length).fill(null)
        entries.forEach(e => { if (e.pos) positionsByIdx[e.idx] = e.pos! })

        // 先正向遍历，用上一个有效点作为参考
        let lastValid: { lat: number; lng: number } | null = null
        for (let i = 0; i < positionsByIdx.length; i++) {
          if (positionsByIdx[i]) { lastValid = positionsByIdx[i]!; continue }
          // 找下一个有效点
          let nextValid: { lat: number; lng: number } | null = null
          for (let j = i + 1; j < positionsByIdx.length; j++) {
            if (positionsByIdx[j]) { nextValid = positionsByIdx[j]!; break }
          }
          const base = lastValid || nextValid || { lat: 36.7213, lng: -4.4214 }
          const delta = 0.0006 * (i + 1) // 每个缺失点按索引位移，避免完全重叠
          positionsByIdx[i] = { lat: base.lat + delta, lng: base.lng + delta }
        }

        // 城市內近距離聚合 + 徑向分散，避免遮擋，提升同城識別度
        const mapObj = leafletMapInstanceRef.current
        if (mapObj) {
          const toPoint = (p: { lat: number; lng: number }) => mapObj.latLngToLayerPoint([p.lat, p.lng])
          const fromGroup = (idxs: number[]) => {
            // 根據像素距離做簡單聚類（單鏈法）
            const clusters: number[][] = []
            const thresholdPx = 34 // 約一個標記直徑
            for (const idx of idxs) {
              const p = positionsByIdx[idx]!
              const pt = toPoint(p)
              let placed = false
              for (const cl of clusters) {
                // 與現有簇任一點小於閾值即歸入
                const anyIdx = cl[0]
                const anyPt = toPoint(positionsByIdx[anyIdx]!)
                const dx = pt.x - anyPt.x
                const dy = pt.y - anyPt.y
                const d = Math.hypot(dx, dy)
                if (d <= thresholdPx) {
                  cl.push(idx)
                  placed = true
                  break
                }
              }
              if (!placed) clusters.push([idx])
            }
            return clusters
          }

          // 先按城市分組，再在每組內按像素距離聚類
          const cityGroups = new Map<string, number[]>()
          positionsByIdx.forEach((_, i) => {
            const c = routeCustomers[i]
            const key = String((displayCity(c) || (c as any).city || '').toLowerCase().trim())
            const list = cityGroups.get(key) || []
            list.push(i)
            cityGroups.set(key, list)
          })

          cityGroups.forEach((idxs) => {
            const clusters = fromGroup(idxs)
            clusters.forEach((cl) => {
              if (cl.length <= 1) return
              // 簇中心（經緯度均值）
              const center = cl.reduce((acc, i) => ({
                lat: acc.lat + positionsByIdx[i]!.lat,
                lng: acc.lng + positionsByIdx[i]!.lng
              }), { lat: 0, lng: 0 })
              center.lat /= cl.length
              center.lng /= cl.length

              const baseLatRad = center.lat * Math.PI / 180
              const step = (2 * Math.PI) / cl.length
              const b = mapObj.getBounds?.()
              const latSpan = b ? Math.abs(b.getNorth() - b.getSouth()) : 0.0
              const base = Math.max(0.0015, latSpan * 0.0025) // 比此前略大，城市內更易分辨
              const radius = base + 0.0002 * Math.max(0, cl.length - 1)
              cl.forEach((idx, i) => {
                const angle = step * i
                const dLat = radius * Math.cos(angle)
                const dLng = (radius * Math.sin(angle)) / Math.cos(baseLatRad)
                positionsByIdx[idx] = { lat: center.lat + dLat, lng: center.lng + dLng }
              })
            })
          })
        }
        // 生成最終條目並寫入內存快取
        const jittered: Array<{ c: RouteCustomer; idx: number; pos: { lat: number; lng: number } }> = positionsByIdx.map((pos, idx) => {
          const c = routeCustomers[idx]
          try { leafletCoordsRef.current[c.id] = { lat: pos!.lat, lng: pos!.lng } } catch {}
          return { c, idx, pos: pos! }
        })

        const positions = jittered.map(e => e.pos)

        if (positions.length === 0) {
          // No geocoded points
          map.setView([36.7213, -4.4214], 8)
          return
        }

        // Helper: numbered divIcon
        const createLeafletNumberedIcon = (n: number) =>
          L.divIcon({
            html: `<div style="width:34px;height:34px;border-radius:17px;background:#2563EB;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;box-shadow:0 1px 2px rgba(0,0,0,0.25)">${n}</div>`,
            className: '',
            iconSize: [34, 34],
            iconAnchor: [17, 17],
          })

        // Place markers and build polyline path
        const latlngs: L.LatLngExpression[] = []
        jittered.forEach(({ c, idx, pos }) => {
          latlngs.push([pos.lat, pos.lng])
          const orderNumber = idx + 1 // 按路線順序連續編號（1..N）
          const marker = L.marker([pos.lat, pos.lng], { icon: createLeafletNumberedIcon(orderNumber) })
          // Bind popup similar to Maps page
          const popupHtml = `
            <div class="space-y-2">
              <div class="font-semibold text-gray-900">${escapeHtml(c.name || '')}</div>
              ${c.address ? `<div class=\"text-xs text-gray-700\">${escapeHtml(c.address)}</div>` : ''}
              <div class="text-xs text-gray-500">${escapeHtml(displayCity(c) || (c.city || c.province || ''))}</div>
              ${(c.phone || (c as any).mobile_phone) ? `<div class=\"text-xs text-gray-700\">${escapeHtml(c.phone || (c as any).mobile_phone)}</div>` : ''}
              ${c.email ? `<div class=\"text-xs text-gray-700\">${escapeHtml(c.email)}</div>` : ''}
              <div class="flex gap-2 pt-2 border-t border-gray-200">
                ${(c.phone || (c as any).mobile_phone) ? `<a href=\"tel:${sanitizePhone(c.phone || (c as any).mobile_phone)}\" class=\"inline-flex items-center px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded-md\">Llamar</a>` : ''}
                <a href=\"https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(getAddress(c))}\" target=\"_blank\" class=\"inline-flex items-center px-2 py-1 text-xs bg-green-50 text-green-600 rounded-md\">Direcciones</a>
              </div>
            </div>`
          marker.addTo(map)
          if (measurementStep === 'idle') marker.bindPopup(popupHtml)
          marker.on('click', () => {
            if (measurementStep !== 'idle') {
              selectMeasurementPoint(routePointFromCoordinates('customer', c.name, pos, c.id))
              return
            }
            try { setSelectedCustomer(c) } catch {}
            try { setShowDetails(true) } catch {}
          })
          leafletMarkersRef.current.push(marker)
        })

        // Draw polyline connecting stops
        if (latlngs.length >= 2) {
          leafletPolylineRef.current = L.polyline(latlngs, { color: '#2563EB', weight: 5, opacity: 0.9 })
          leafletPolylineRef.current.addTo(map)
        }

        // Fit bounds with padding
        if (measurementStep === 'idle') {
          try {
            const bounds = L.latLngBounds(latlngs as any)
            map.fitBounds(bounds, { padding: [16, 16] })
          } catch {}
        }

        // After render, compute offline distances if not set yet and coordinates are ready
        try {
          const allReady = routeCustomers.length >= 2 && routeCustomers.every(c => !!leafletCoordsRef.current[c.id])
          const needCalc = routeCustomers.some((c: any, idx: number) => idx > 0 && (c as any).distance == null)
          const routeKey = routeCustomers.map(c => c.id).join('>')
          if (!isManualResetRef.current && allReady && needCalc && !isCalculatingRef.current && lastCalcKeyRef.current !== routeKey) {
            await calculateRouteDistanceAndTime([...routeCustomers])
          }
        } catch {}
        // End of manual reset cycle (if any)
        try { isManualResetRef.current = false } catch {}
      } catch (e) {
        console.warn('[RoutePlanning][Leaflet] render failed', e)
      }
    }

    renderLeaflet()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapProvider, routeCustomers, leafletReset, measurementStep])

  // 地圖真正全螢幕切換（使用瀏覽器 Fullscreen API）
  const toggleMapFullscreen = async () => {
    try {
      const mapContainer = mapRef.current?.parentElement
      if (!mapContainer) return
      
      if (!document.fullscreenElement) {
        // 進入全螢幕
        await mapContainer.requestFullscreen()
        setLeafletFullscreen(true)
      } else {
        // 退出全螢幕
        await document.exitFullscreen()
        setLeafletFullscreen(false)
      }
      
      // 重新計算地圖尺寸
      setTimeout(() => { try { leafletMapInstanceRef.current?.invalidateSize?.() } catch {} }, 100)
      setTimeout(() => { try { leafletMapInstanceRef.current?.invalidateSize?.() } catch {} }, 300)
    } catch (err) {
      console.warn('[Fullscreen] Failed:', err)
    }
  }

  // PDF 獨立導出（僅客戶列表，每頁15個停靠點）
  const generateIndependentPdf = async () => {
    try {
      if (!routeCustomers.length) {
        alert('沒有路線可以導出')
        return
      }
      
      // 動態載入 html2pdf.js
      if (!(window as any).html2pdf) {
        const script = document.createElement('script')
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js'
        document.head.appendChild(script)
        await new Promise((resolve, reject) => {
          script.onload = resolve
          script.onerror = reject
        })
      }

      // 每頁最多15個停靠點
      const itemsPerPage = 15
      const stopCount = routeCustomers.length
      const pageCount = Math.ceil(stopCount / itemsPerPage)
      
      // 統一佈局參數（縮小字體與間距）
      const fontSize = '8pt'
      const itemMargin = '2.5mm'
      const itemPadding = '1.5mm'

      // 移除地圖截圖功能（根據用戶需求，無法實現只顯示標記無連線）

      // Route header for PDF — reads from the unified routeDistances state
      const pdfTitle = routeName || 'Ruta Planificada'
      const pdfDate = routeDate || new Date().toISOString().split('T')[0]
      const pdfTime = routeTime || ''
      const pdfDistanceKm = routeDistances.totalDistanceKm != null
        ? formatDistanceKm(routeDistances.totalDistanceKm)
        : (totalDistance > 0 ? formatKm(totalDistance) : '—')
      console.log('[PDF_ROUTE_DISTANCE] exported data:', {
        totalDistanceKm: routeDistances.totalDistanceKm,
        stops: routeDistances.stops.length,
        userLocation: routeDistances.userLocation,
        calculatedAt: routeDistances.calculatedAt,
      })

      // 創建 PDF 內容（純列表，每頁15個）
      const pdfContent = `
        <div style="width: 210mm; font-family: Arial, sans-serif;">
          ${Array.from({ length: pageCount }, (_, pageIndex) => {
            const startIdx = pageIndex * itemsPerPage
            const endIdx = Math.min(startIdx + itemsPerPage, stopCount)
            const pageCustomers = routeCustomers.slice(startIdx, endIdx)
            
            return `
              <div style="padding: 12mm; ${pageIndex > 0 ? 'page-break-before: always;' : ''}">
                ${pageIndex === 0 ? `
                  <div style="margin-bottom: 6mm; border-bottom: 2px solid #2563eb; padding-bottom: 4mm;">
                    <div style="font-size: 14pt; font-weight: bold; color: #111827;">${pdfTitle}</div>
                    <div style="font-size: 9pt; color: #6b7280; margin-top: 2mm;">
                      ${stopCount} paradas · ${pdfDistanceKm}${pdfDate ? ` · ${pdfDate}` : ''}${pdfTime ? ` ${pdfTime}` : ''}
                    </div>
                  </div>
                ` : `
                  <div style="margin-bottom: 4mm; font-size: 8pt; color: #9ca3af; text-align: right;">
                    ${pdfTitle} — página ${pageIndex + 1}
                  </div>
                `}
                <div style="font-size: ${fontSize}; line-height: 1.3;">
                  ${pageCustomers.map((customer, index) => {
                    const globalIndex = startIdx + index
                    return `
                      <div style="margin-bottom: ${itemMargin}; padding: ${itemPadding}; border: 1px solid #e5e7eb; border-radius: 3px; background: #f9fafb; page-break-inside: avoid;">
                        <div style="font-weight: bold; color: #2563eb; margin-bottom: 0.8mm; font-size: 9.5pt;">
                          ${globalIndex + 1}. ${customer.name}
                        </div>
                        <div style="color: #6b7280; margin-bottom: 0.8mm; font-size: 8pt;">
                          ${customer.company || '—'}
                        </div>
                        <div style="margin-bottom: 0.8mm; font-size: 8pt; color: #374151;">
                          📍 ${getAddress(customer)}
                        </div>
                        ${customer.phone || (customer as any).mobile_phone ? 
                          `<div style="color: #059669; font-size: 7.5pt; margin-bottom: 0.5mm;">
                            📞 ${customer.phone || (customer as any).mobile_phone}
                          </div>` : ''}
                        ${(() => {
                          const sd = routeDistances.stops.find(s => s.id === customer.id)
                          if (!sd) return ''
                          const distLine = globalIndex === 0
                            ? `📍 Desde mi ubicación: ${formatDistanceKm(sd.distanceFromUserKm)}`
                            : `🚗 Desde parada anterior: ${formatDistanceKm(sd.distanceFromPreviousStopKm)}`
                          const cumulLine = sd.cumulativeDistanceKm != null
                            ? `Acumulado: ${formatDistanceKm(sd.cumulativeDistanceKm)}`
                            : ''
                          return `<div style="color: #7c3aed; font-size: 7.5pt;">${distLine}${cumulLine ? ` · ${cumulLine}` : ''}</div>`
                        })()}
                      </div>
                    `
                  }).join('')}
                </div>
              </div>
            `
          }).join('')}
        </div>
      `
      
      const element = document.createElement('div')
      element.innerHTML = pdfContent
      
      const opt = {
        margin: 0,
        filename: `Ruta_${routeName || 'Planificada'}_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      }
      
      await (window as any).html2pdf().set(opt).from(element).save()
      
    } catch (e) {
      console.error('[PDF] Generation failed:', e)
      alert('PDF 生成失敗，請稍後再試')
    }
  }

  // Cleanup Leaflet map on unmount to avoid white screen when re-entering
  useEffect(() => {
    return () => {
      try {
        if (leafletMapInstanceRef.current) {
          leafletMapInstanceRef.current.remove()
          leafletMapInstanceRef.current = null
        }
        leafletMarkersRef.current.forEach(m => { try { m.remove() } catch {} })
        leafletMarkersRef.current = []
        if (leafletPolylineRef.current) {
          try { leafletPolylineRef.current.remove() } catch {}
          leafletPolylineRef.current = null
        }
      } catch {}
    }
  }, [])

  // 在返回頁面或窗口尺寸變更/全屏變更時，強制重算 Leaflet 容器尺寸，避免白屏
  useEffect(() => {
    const onVis = () => {
      if (!document.hidden) {
        try { leafletMapInstanceRef.current?.invalidateSize?.() } catch {}
      }
    }
    const onResize = () => { try { leafletMapInstanceRef.current?.invalidateSize?.() } catch {} }
    const onFs = () => {
      const isFullscreen = !!document.fullscreenElement
      setIsDocFullscreen(isFullscreen)
      setLeafletFullscreen(isFullscreen)
      try { 
        setTimeout(() => leafletMapInstanceRef.current?.invalidateSize?.(), 100)
        setTimeout(() => leafletMapInstanceRef.current?.invalidateSize?.(), 300)
      } catch {}
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('resize', onResize)
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('fullscreenchange', onFs)
    }
  }, [])

  // Leaflet: fit bounds to all current route stops
  const fitLeafletToAllStops = () => {
    try {
      const map = leafletMapInstanceRef.current
      if (!map) return
      const latlngs: L.LatLngExpression[] = []
      for (const c of routeCustomers) {
        const pos = leafletCoordsRef.current[c.id]
        if (pos && typeof pos.lat === 'number' && typeof pos.lng === 'number') {
          latlngs.push([pos.lat, pos.lng])
        }
      }
      if (latlngs.length === 0) {
        map.setView([36.7213, -4.4214], 8)
        return
      }
      const bounds = L.latLngBounds(latlngs as any)
      map.fitBounds(bounds, { padding: [16, 16] })
    } catch (e) {
      console.warn('[Leaflet] fitLeafletToAllStops failed:', e)
    }
  }

  // Leaflet: show my location and pan/zoom（加強：第二次也能定位，失敗時使用 watchPosition 後備）
  const getCurrentLocationLeaflet = async () => {
    try {
      if (!('geolocation' in navigator)) {
        alert('Geolocalización no disponible en este navegador')
        return
      }
      const tryGetPosition = (): Promise<GeolocationPosition> => new Promise((resolve, reject) => {
        const opts = { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
        navigator.geolocation.getCurrentPosition(resolve, reject, opts as any)
      })
      const tryWatchOnce = (): Promise<GeolocationPosition> => new Promise((resolve, reject) => {
        try {
          if (leafletGeoWatchIdRef.current != null) {
            try { navigator.geolocation.clearWatch(leafletGeoWatchIdRef.current) } catch {}
            leafletGeoWatchIdRef.current = null
          }
          const id = navigator.geolocation.watchPosition((pos) => {
            try { if (id != null) navigator.geolocation.clearWatch(id) } catch {}
            leafletGeoWatchIdRef.current = null
            resolve(pos)
          }, (err) => {
            try { if (id != null) navigator.geolocation.clearWatch(id) } catch {}
            leafletGeoWatchIdRef.current = null
            reject(err)
          }, { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 } as any)
          leafletGeoWatchIdRef.current = id as any
          // safety timeout
          setTimeout(() => {
            if (leafletGeoWatchIdRef.current != null) {
              try { navigator.geolocation.clearWatch(leafletGeoWatchIdRef.current) } catch {}
              leafletGeoWatchIdRef.current = null
              reject(new Error('watchPosition timeout'))
            }
          }, 13000)
        } catch (e) { reject(e as any) }
      })

      let position: GeolocationPosition
      try {
        position = await tryGetPosition()
      } catch (e: any) {
        // timeout or unavailable -> fallback to watch once
        position = await tryWatchOnce()
      }

      const map = leafletMapInstanceRef.current
      if (!map) return
      const { latitude, longitude } = position.coords
      const pos: [number, number] = [latitude, longitude]

      // Remove previous marker
      try { leafletMyLocationMarkerRef.current?.remove() } catch {}

      const marker = L.marker(pos, {
        icon: createVehicleLocationIcon({
          heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          isMoving: Number.isFinite(position.coords.speed) && (position.coords.speed || 0) > 1,
        }),
        title: 'Mi ubicación',
      })
      marker.addTo(map).bindPopup('Mi ubicación')
      leafletMyLocationMarkerRef.current = marker

      try { map.flyTo(pos, Math.max(map.getZoom(), 13), { duration: 0.8 }) } catch {}

      // Store user location and recalculate route distances
      const userLoc = { lat: latitude, lng: longitude }
      userLocationRef.current = userLoc
      recalcRouteDistances(undefined, userLoc)
      if (measurementStep === 'selecting-a' || measurementStep === 'selecting-b') {
        selectMeasurementPoint(routePointFromCoordinates('current-location', 'Mi ubicación', userLoc))
      }
    } catch (e) {
      console.error('[Leaflet] getCurrentLocation failed:', e)
      alert('No se pudo obtener la ubicación actual')
    }
  }

  // Adjust map padding dynamically when the bottom sheet opens/closes
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    const apply = () => {
      try {
        const h = bottomSheetRef.current?.offsetHeight || 240
        const padding = showDetails
          ? { top: 16, right: 16, bottom: Math.min(h + 16, 360), left: 16 }
          : { top: 16, right: 16, bottom: 16, left: 16 }
        map.setOptions?.({ padding })
      } catch {}
    }
    apply()
    const timeoutId = setTimeout(apply, 50)
    return () => clearTimeout(timeoutId)
  }, [showDetails])

  // Handle page visibility changes to refresh map when user returns from navigation
  useEffect(() => {
    let refreshTimeout: NodeJS.Timeout | null = null
    
    const forceMapRefresh = async () => {
      if (refreshTimeout) clearTimeout(refreshTimeout)
      
      refreshTimeout = setTimeout(async () => {
        try {
          console.log('[MapRefresh] Attempting to refresh map after navigation return')
          
          // Force complete map recreation
          if (mapInstanceRef.current) {
            try {
              // Clear all map elements
              if (directionsRendererRef.current) {
                directionsRendererRef.current.setMap(null)
                directionsRendererRef.current = null
              }
              markersRef.current.forEach(m => { try { m.setMap(null) } catch {} })
              markersRef.current = []
              if (myLocationMarkerRef.current) {
                try { myLocationMarkerRef.current.setMap(null) } catch {}
                myLocationMarkerRef.current = null
              }
              if (myLocationInfoRef.current) {
                try { myLocationInfoRef.current.close() } catch {}
                myLocationInfoRef.current = null
              }
              
              // Clear map instance
              mapInstanceRef.current = null
              directionsServiceRef.current = null
            } catch (error) {
              console.warn('[MapRefresh] Cleanup error:', error)
            }
          }
          
          // Wait a bit then force re-render
          await new Promise(resolve => setTimeout(resolve, 100))
          
          // Trigger main render effect by dispatching custom event
          const event = new CustomEvent('forceMapRender')
          window.dispatchEvent(event)
          
        } catch (error) {
          console.error('[MapRefresh] Failed to refresh map:', error)
        }
      }, 200)
    }

    const handleVisibilityChange = () => {
      if (!document.hidden && mapRef.current) {
        console.log('[MapRefresh] Page became visible, scheduling map refresh')
        forceMapRefresh()
      }
    }

    const handleFocus = () => {
      if (mapRef.current) {
        console.log('[MapRefresh] Window focused, scheduling map refresh')
        forceMapRefresh()
      }
    }

    // Also handle page load/reload
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted && mapRef.current) {
        console.log('[MapRefresh] Page restored from cache, scheduling map refresh')
        forceMapRefresh()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('pageshow', handlePageShow)
    
    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [routeCustomers.length])

  // Listen for custom map refresh events
  useEffect(() => {
    const handleMapRefresh = () => {
      console.log('[MapRefresh] Handling mapRefresh event - clearing map instance')
      // Force re-render by clearing the map instance and letting the main effect recreate it
      if (mapInstanceRef.current) {
        try {
          // Clear the map instance to force recreation
          mapInstanceRef.current = null
          directionsServiceRef.current = null
          directionsRendererRef.current = null
          markersRef.current.forEach(m => m.setMap?.(null))
          markersRef.current = []
          if (myLocationMarkerRef.current) {
            myLocationMarkerRef.current.setMap?.(null)
            myLocationMarkerRef.current = null
          }
        } catch (error) {
          console.warn('Map refresh cleanup failed:', error)
        }
      }
    }

    const handleForceMapRender = () => {
      console.log('[MapRefresh] Handling forceMapRender event - triggering map recreation')
      // This will trigger the main map render effect to recreate everything
      handleMapRefresh()
    }

    window.addEventListener('mapRefresh', handleMapRefresh)
    window.addEventListener('forceMapRender', handleForceMapRender)
    
    return () => {
      window.removeEventListener('mapRefresh', handleMapRefresh)
      window.removeEventListener('forceMapRender', handleForceMapRender)
    }
  }, [])

  // Clear map when route is empty - force complete reset to initial state
  useEffect(() => {
    if (routeCustomers.length === 0 && mapInstanceRef.current) {
      try {
        console.log('[MapReset] Clearing route, resetting map to initial state')
        
        // Clear directions renderer
        if (directionsRendererRef.current) {
          directionsRendererRef.current.set('directions', null)
        }
        
        // Clear all markers
        markersRef.current.forEach(m => { 
          try { m.setMap(null) } catch {} 
        })
        markersRef.current = []
        
        // Clear location marker and info
        if (myLocationMarkerRef.current) {
          try { myLocationMarkerRef.current.setMap(null) } catch {}
          myLocationMarkerRef.current = null
        }
        if (myLocationInfoRef.current) {
          try { myLocationInfoRef.current.close() } catch {}
          myLocationInfoRef.current = null
        }
        
        // Force map to reset to proper initial view - same as clean page load
        try {
          const map = mapInstanceRef.current
          const container = mapRef.current
          
          if (map && container) {
            // Force container dimensions with !important styles
            container.style.cssText = 'height: 800px !important; width: 100% !important; min-height: 800px !important;'
            
            // Reset map view immediately
            map.setCenter({ lat: 36.7213, lng: -4.4214 })
            map.setZoom(9)
            
            // Aggressive resize and redraw strategy
            const forceMapReset = () => {
              try {
                const google = (window as any).google
                if (google?.maps && map) {
                  // Multiple resize events
                  google.maps.event.trigger(map, 'resize')
                  google.maps.event.trigger(map, 'idle') 
                  
                  // Force viewport reset
                  map.setCenter({ lat: 36.7213, lng: -4.4214 })
                  map.setZoom(9)
                  
                  // Force container recalculation with style changes
                  const originalHeight = container.style.height
                  container.style.height = '799px'
                  container.style.display = 'none'
                  
                  // Trigger immediate reflow
                  void container.offsetHeight
                  
                  container.style.display = 'block'
                  container.style.height = '800px'
                  
                  // Final resize events
                  setTimeout(() => {
                    google.maps.event.trigger(map, 'resize')
                    map.setCenter({ lat: 36.7213, lng: -4.4214 })
                    map.setZoom(9)
                  }, 10)
                }
              } catch (e) {
                console.warn('[MapReset] Resize attempt failed:', e)
              }
            }
            
            // Execute multiple times with increasing delays
            forceMapReset()
            setTimeout(forceMapReset, 100)
            setTimeout(forceMapReset, 250)
            setTimeout(forceMapReset, 500)
            setTimeout(forceMapReset, 1000)
          }
        } catch (e) {
          console.warn('[MapReset] Reset attempt failed:', e)
        }
        
        console.log('[MapReset] Map reset completed')
      } catch (error) {
        console.warn('[MapReset] Failed to reset map:', error)
      }
    }
  }, [routeCustomers.length])

  useEffect(() => {
    if (!user?.id) return
    loadCustomers()
  }, [user?.id])

  const loadCustomers = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/customers', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      const result = await response.json()
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to load customers')
      }

      let customersData = result.data || []
      // 過濾只顯示當前用戶創建的客戶
      customersData = customersData.filter((customer: any) => customer.created_by === user?.id)

      console.log('[RoutePlanning] Loaded customers:', customersData?.length || 0)
      setCustomers(customersData || [])
    } catch (error) {
      console.error('Error loading customers:', error)
    } finally {
      setLoading(false)
    }
  }

  // 遷移 localStorage 路線到資料庫
  const migrateLocalRoutesToDatabase = async (routesToMigrate?: any[]) => {
    if (!user?.id) return

    try {
      const localRoutes = routesToMigrate ?? JSON.parse(localStorage.getItem('savedRoutes') || '[]')
      if (localRoutes.length === 0) return

      console.log('[RoutesMigration] Found', localRoutes.length, 'local routes to migrate')
      
      let successCount = 0
      let failCount = 0
      
      for (const route of localRoutes) {
        try {
          const { error } = await supabase
            .from('saved_routes')
            .insert([{
              created_by: user.id,
              name: route.name,
              route_date: route.date,
              route_time: route.time,
              customers: route.customers,
              total_distance: route.totalDistance || 0,
              total_duration: route.totalDuration || 0
            }])
          
          if (error) {
            console.warn('[RoutesMigration] Failed to migrate route:', route.name, error)
            failCount++
          } else {
            console.log('[RoutesMigration] Migrated route:', route.name)
            successCount++
          }
        } catch (routeError) {
          console.warn('[RoutesMigration] Error migrating route:', route.name, routeError)
          failCount++
        }
      }
      
      // Only clear migrated routes from localStorage if ALL succeeded
      if (successCount > 0 && failCount === 0) {
        const migratedIds = new Set(localRoutes.map((r: any) => r.id))
        const remaining = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
          .filter((r: any) => !migratedIds.has(r.id))
        if (remaining.length > 0) {
          localStorage.setItem('savedRoutes', JSON.stringify(remaining))
        } else {
          localStorage.removeItem('savedRoutes')
        }
        console.log('[RoutesMigration] Migration completed successfully, localStorage cleaned')
        return true
      } else if (successCount > 0 && failCount > 0) {
        console.warn(`[RoutesMigration] Partial migration: ${successCount} success, ${failCount} failed. Keeping localStorage for retry.`)
        return false
      } else {
        console.error('[RoutesMigration] All migrations failed. Keeping localStorage.')
        return false
      }
    } catch (error) {
      console.error('[RoutesMigration] Migration failed:', error)
      return false
    }
  }

  // 載入儲存的路線
  const loadSavedRoutes = async () => {
    try {
      setLoadingSavedRoutes(true)
      
      // Always load from both sources and merge them
      let dbRoutes: any[] = []
      let localRoutes: any[] = []
      
      const mapDbRoute = (route: any) => ({
        id: route.id,
        name: route.name,
        date: route.route_date,
        time: route.route_time,
        customers: route.customers,
        totalDistance: route.total_distance,
        totalDuration: route.total_duration,
        completed: route.completed || false,
        completedAt: route.completed_at || null,
        completedVisits: route.completed_visits || [],
        createdAt: route.created_at
      })

      // Try to load from database first for cross-device synchronization
      if (user?.id) {
        try {
          const { data, error } = await supabase
            .from('saved_routes')
            .select('*')
            .eq('created_by', user.id)
            .order('created_at', { ascending: false })

          if (!error && data) {
            dbRoutes = data.map(mapDbRoute)
            console.log('[RouteLoading] Loaded', dbRoutes.length, 'routes from database')
          } else {
            console.warn('[RouteLoading] Database query failed:', error)
          }
        } catch (dbError) {
          console.warn('[RouteLoading] Database connection failed:', dbError)
        }
      }
      
      // Always try to load from localStorage as backup
      try {
        const raw = localStorage.getItem('savedRoutes')
        localRoutes = raw ? JSON.parse(raw) : []
        console.log('[RouteLoading] Found', localRoutes.length, 'routes in localStorage')
      } catch (localError) {
        console.warn('[RouteLoading] Failed to read localStorage:', localError)
        localRoutes = []
      }
      
      // Migrate any local routes that aren't in the database yet
      // (matched by id or name) so offline saves reach the database.
      const dbIdsPre = new Set(dbRoutes.map((r: any) => r.id))
      const dbNamesPre = new Set(dbRoutes.map((r: any) => String(r?.name || '').trim().toLowerCase()))
      const localPendingMigration = localRoutes.filter((r: any) =>
        !dbIdsPre.has(r.id) && !dbNamesPre.has(String(r?.name || '').trim().toLowerCase())
      )
      if (localPendingMigration.length > 0 && user?.id) {
        console.log('[RouteLoading] Found', localPendingMigration.length, 'local-only routes, attempting migration...')
        const migrationSuccess = await migrateLocalRoutesToDatabase(localPendingMigration)

        if (migrationSuccess) {
          // Reload from database after successful migration
          try {
            const { data } = await supabase
              .from('saved_routes')
              .select('*')
              .eq('created_by', user.id)
              .order('created_at', { ascending: false })
            
            if (data) {
              dbRoutes = data.map(mapDbRoute)
              console.log('[RouteLoading] Reloaded', dbRoutes.length, 'routes after migration')
            }
          } catch (reloadError) {
            console.warn('[RouteLoading] Failed to reload after migration:', reloadError)
          }
        }
      }
      
      // Merge: database routes win, but local-only routes (saved while
      // offline) stay visible instead of silently disappearing.
      const dbIds = new Set(dbRoutes.map((r: any) => r.id))
      const dbNames = new Set(dbRoutes.map((r: any) => String(r?.name || '').trim().toLowerCase()))
      const localOnly = localRoutes.filter((r: any) =>
        !dbIds.has(r.id) && !dbNames.has(String(r?.name || '').trim().toLowerCase())
      )
      const finalRoutes = [...dbRoutes, ...localOnly]
      setSavedRoutes(finalRoutes)
      console.log('[RouteLoading] Using', dbRoutes.length, 'db routes +', localOnly.length, 'local-only routes')
      
    } catch (error) {
      console.error('[RouteLoading] Unexpected error:', error)
      // Emergency fallback to localStorage
      try {
        const localSaved = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
        setSavedRoutes(localSaved)
        console.log('[RouteLoading] Emergency fallback:', localSaved.length, 'routes from localStorage')
      } catch {
        setSavedRoutes([])
      }
    } finally {
      setLoadingSavedRoutes(false)
    }
  }

  // 城市和省份處理邏輯 - 與 Maps 頁面完全一致
  const extractCityForDisplay = (notes?: string): string => {
    if (!notes) return ''
    const match = notes.match(/Ciudad:\s*([^\n|]+)/i)
    return match ? match[1].trim() : ''
  }

  const isProvinceName = (s?: string) => /^(huelva|c(a|á)diz|ceuta)$/i.test(String(s || '').trim())

  const toCanonicalProvince = (v?: string): string => {
    const s = String(v || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    if (s === 'huelva') return 'Huelva'
    if (s === 'cadiz') return 'Cádiz'
    if (s === 'ceuta') return 'Ceuta'
    return ''
  }

  const displayCity = (customer?: Customer): string => {
    if (!customer) return ''
    const fromNotes = extractCityForDisplay(customer.notes)
    if (fromNotes) return fromNotes
    const city = String(customer.city || '').trim()
    if (city) {
      if (isProvinceName(city)) {
        const province = String((customer as any).province || '').trim()
        if (province.toLowerCase() === city.toLowerCase()) {
          return city
        }
        return ''
      }
      return city
    }
    return ''
  }

  const displayProvince = (customer?: Customer): string => {
    if (!customer) return ''
    if (customer.province && String(customer.province).trim().length > 0) {
      const can = toCanonicalProvince(customer.province)
      if (can) return can
    }
    if (customer.city && isProvinceName(customer.city)) {
      const can = toCanonicalProvince(customer.city)
      if (can) return can
    }
    if (customer.notes) {
      const m = customer.notes.match(/Provincia:\s*([^\n]+)/i)
      if (m) {
        const can = toCanonicalProvince(m[1])
        if (can) return can
      }
    }
    return ''
  }

  // 省份和城市數據 - 與 Maps 和 Customers 頁面一致
  const provinces = useMemo(() => {
    const provinceSet = new Set<string>()
    customers.forEach(customer => {
      const province = displayProvince(customer)
      if (province) provinceSet.add(province)
    })
    return Array.from(provinceSet).sort()
  }, [customers])

  // Municipios por provincia - lista completa (alineada con `src/pages/Maps.tsx`)
  const municipiosByProvince: Record<string, string[]> = {
    'Cádiz': [
      'Alcalá de los Gazules', 'Alcalá del Valle', 'Algar', 'Algeciras', 'Algodonales', 'Arcos de la Frontera',
      'Barbate', 'Benalup-Casas Viejas', 'Benaocaz', 'Bornos', 'El Bosque', 'Cádiz', 'Castellar de la Frontera',
      'Chiclana de la Frontera', 'Chipiona', 'Conil de la Frontera', 'Espera', 'El Gastor', 'Grazalema',
      'Jerez de la Frontera', 'Jimena de la Frontera', 'La Línea de la Concepción', 'Los Barrios',
      'Medina-Sidonia', 'Olvera', 'Paterna de Rivera', 'Prado del Rey', 'El Puerto de Santa María',
      'Puerto Real', 'Puerto Serrano', 'Rota', 'San Fernando', 'San José del Valle', 'San Roque',
      'Sanlúcar de Barrameda', 'Setenil de las Bodegas', 'Tarifa', 'Torre Alháquime', 'Trebujena',
      'Ubrique', 'Vejer de la Frontera', 'Villaluenga del Rosario', 'Villamartín', 'Zahara'
    ],
    'Huelva': [
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
      'Villarrasa', 'Zalamea la Real', 'Zufre'
    ],
    'Ceuta': ['Ceuta']
  }

  const getFilteredCities = () => {
    // 如果選擇了省份，顯示該省份的全部城市（與 Maps 頁一致）
    if (selectedProvince) {
      const list = municipiosByProvince[selectedProvince] || []
      return Array.from(new Set(list)).sort()
    }
    // 未選擇省份時，顯示所有省份的全部城市合集
    const all = Object.values(municipiosByProvince).flat()
    return Array.from(new Set(all)).sort()
  }

  // 篩選客戶邏輯
  const filteredCustomers = useMemo(() => {
    return customers.filter(customer => {
      // 排除已在路線中的客戶
      if (routeCustomers.some(rc => rc.id === customer.id)) return false

      const matchesSearch = !searchTerm || 
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (customer.company || '').toLowerCase().includes(searchTerm.toLowerCase())

      const customerProvince = displayProvince(customer)
      const matchesProvince = !selectedProvince || customerProvince === selectedProvince

      const customerCity = displayCity(customer)
      const matchesCity = !selectedCity ||
        (!!customerCity && customerCity.toLowerCase() === selectedCity.toLowerCase())

      return matchesSearch && matchesProvince && matchesCity
    })
  }, [customers, routeCustomers, searchTerm, selectedProvince, selectedCity])

  // 計算路線距離和時間
  const calculateRouteDistanceAndTime = async (route: RouteCustomer[]) => {
    if (route.length < 2) {
      setTotalDistance(0)
      setTotalDuration(0)
      return
    }

    // Prevent redundant recalculations and log spam
    const routeKey = route.map(c => c.id).join('>')
    if (isCalculatingRef.current) {
      return
    }
    if (lastCalcKeyRef.current !== routeKey) {
      try { console.log('[RoutePlanning] Calculating distances for route:', route.length, 'customers') } catch {}
    }
    isCalculatingRef.current = true

    try {
      // In Leaflet (OSM) mode: avoid any paid APIs and compute approximate distance offline
      if (mapProvider === 'leaflet') {
        // Use cached coordinates computed by Leaflet render to avoid extra geocoding
        let totalKm = 0
        let pairsResolved = 0
        const updatedRoute = [...route]
        for (let i = 0; i < route.length - 1; i++) {
          const a = leafletCoordsRef.current[route[i].id]
          const b = leafletCoordsRef.current[route[i + 1].id]
          if (a && b) {
            const segKm = haversineDistance(a.lat, a.lng, b.lat, b.lng)
            totalKm += segKm
            pairsResolved++
            if (i + 1 < updatedRoute.length) {
              updatedRoute[i + 1].distance = Number(segKm.toFixed(2))
              updatedRoute[i + 1].duration = undefined as any
            }
          }
        }
        // Only update totalDistance when we have real coords to compute from.
        // If coords aren't cached yet (e.g. route just loaded), preserve the
        // existing/saved value — the map render will trigger recalculation once ready.
        if (pairsResolved > 0) {
          setTotalDistance(Number(totalKm.toFixed(1)))
          lastComputedDistanceRef.current = Number(totalKm.toFixed(1))
        }
        setTotalDuration(0)
        // Mark calculation snapshot
        lastCalcKeyRef.current = routeKey
        setRouteCustomers(updatedRoute)
        // Sync unified route distance model
        recalcRouteDistances(updatedRoute)
        return
      }
      
      const waypoints = route.map(customer => {
        const address = getAddress(customer)
        console.log('[RoutePlanning] Waypoint:', address)
        return address
      })

      console.log('[RoutePlanning] Sending request with waypoints:', waypoints)

      // 使用本地 Express API（Google provider only）
      const response = await fetch('/api/distance/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ waypoints })
      })

      console.log('[RoutePlanning] Response status:', response.status)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('[RoutePlanning] API error response:', errorText)
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const result = await response.json()
      console.log('[RoutePlanning] Distance calculation result:', result)

      if (result.success && result.data) {
        const { segments, totalDistance: totDist, totalDuration: totTime } = result.data

        // 更新每個客戶的距離和時間信息
        const updatedRoute = [...route]
        segments.forEach((segment: any, index: number) => {
          if (index < updatedRoute.length - 1 && !segment.error) {
            updatedRoute[index + 1].distance = segment.distance
            updatedRoute[index + 1].duration = Math.round(segment.duration)
            console.log(`[RoutePlanning] Stop ${index + 2}: ${segment.distance.toFixed(1)}km, ${Math.round(segment.duration)}min`)
          }
        })

        setTotalDistance(totDist)
        setTotalDuration(Math.round(totTime))
        
        // 更新路線客戶數據
        setRouteCustomers(updatedRoute)
        console.log('[RoutePlanning] Route updated with distances:', updatedRoute)
      } else {
        console.warn('Distance calculation failed:', result.error)
        // 如果API失敗，仍然更新路線但不顯示距離
        setRouteCustomers([...route])
      }
    } catch (error) {
      console.error('Error calculating route distance and time:', error)
      // 如果發生錯誤，仍然更新路線但不顯示距離
      setRouteCustomers([...route])
    } finally {
      isCalculatingRef.current = false
    }
  }

  // 添加客戶到路線
  const addCustomerToRoute = async (customer: Customer) => {
    const routeCustomer: RouteCustomer = {
      ...customer,
      order: routeCustomers.length + 1
    }
    const newRoute = [...routeCustomers, routeCustomer]
    setRouteCustomers(newRoute)
    
    // 計算新路線的距離和時間
    await calculateRouteDistanceAndTime(newRoute)
  }

  // 從路線移除客戶
  const removeFromRoute = async (customerId: string) => {
    const newRoute = routeCustomers
      .filter(rc => rc.id !== customerId)
      .map((rc, index) => ({ ...rc, order: index + 1 }))
    setRouteCustomers(newRoute)
    
    // 重新計算距離和時間
    await calculateRouteDistanceAndTime(newRoute)
  }

  // 向上移動客戶
  const moveUp = async (index: number) => {
    if (index === 0) return
    const newRoute = [...routeCustomers]
    const temp = newRoute[index]
    newRoute[index] = newRoute[index - 1]
    newRoute[index - 1] = temp
    // 重新分配順序
    const reorderedRoute = newRoute.map((rc, idx) => ({ ...rc, order: idx + 1 }))
    setRouteCustomers(reorderedRoute)
    
    // 重新計算距離和時間
    await calculateRouteDistanceAndTime(reorderedRoute)
  }

  // 向下移動客戶
  const moveDown = async (index: number) => {
    if (index === routeCustomers.length - 1) return
    const newRoute = [...routeCustomers]
    const temp = newRoute[index]
    newRoute[index] = newRoute[index + 1]
    newRoute[index + 1] = temp
    // 重新分配順序
    const reorderedRoute = newRoute.map((rc, idx) => ({ ...rc, order: idx + 1 }))
    setRouteCustomers(reorderedRoute)
    
    // 重新計算距離和時間
    await calculateRouteDistanceAndTime(reorderedRoute)
  }

  // 清空路線
  const clearRoute = () => {
    setRouteCustomers([])
    setTotalDistance(0)
    setTotalDuration(0)
    setSelectedCustomer(null)
    setRouteDistances({ ...EMPTY_ROUTE_DISTANCES, userLocation: userLocationRef.current })
    // clear draft when route is cleared
    try { localStorage.removeItem(draftKey) } catch {}
  }

  // 儲存路線 (新增或更新)
  const saveRoute = async (saveAsNew = false, updateRouteId?: string) => {
    if (!routeName.trim()) {
      alert('Por favor ingresa un nombre para la ruta')
      return
    }
    
    const targetUpdateId = !saveAsNew ? (updateRouteId || editingRouteId || null) : null
    const isUpdating = !!targetUpdateId
    const routeData = {
      id: isUpdating ? (targetUpdateId as string) : Date.now().toString(),
      name: routeName,
      date: routeDate || null,
      time: routeTime || null,
      customers: routeCustomers,
      totalDistance: totalDistance,
      totalDuration: totalDuration,
      createdAt: isUpdating
        ? ((savedRoutes.find((r: any) => r.id === targetUpdateId)?.createdAt)
          || (savedRoutes.find((r: any) => String(r?.name || '').trim().toLowerCase() === String(routeName || '').trim().toLowerCase())?.createdAt)
          || new Date().toISOString())
        : new Date().toISOString()
    }

    try {
      let savedToDatabase = false
      
      console.log('🚀 Starting route save operation...')
      console.log('User:', user)
      console.log('Route data:', routeData)
      
      // Try to save to database first for cross-device synchronization
      if (user?.id) {
        console.log('👤 User authenticated, attempting database save...')
        try {
          if (isUpdating) {
            // Update existing route by ID
            const { data, error } = await supabase
              .from('saved_routes')
              .update({
                name: routeData.name,
                route_date: routeData.date,
                route_time: routeData.time,
                customers: routeData.customers,
                total_distance: routeData.totalDistance,
                total_duration: routeData.totalDuration
              })
              .eq('id', targetUpdateId as string)
              .select()

            if (!error && data && Array.isArray(data) && data.length > 0) {
              savedToDatabase = true
              console.log('[RouteSave] Updated route in database', editingRouteId)
            } else {
              console.warn('[RouteSave] Database update failed:', error)
            }
          } else {
            // Insert new route
            const { data, error } = await supabase
              .from('saved_routes')
              .insert([{
                created_by: user.id,
                name: routeData.name,
                route_date: routeData.date,
                route_time: routeData.time,
                customers: routeData.customers,
                total_distance: routeData.totalDistance,
                total_duration: routeData.totalDuration
              }])
              .select()

            if (!error && data && Array.isArray(data) && data.length > 0) {
              savedToDatabase = true
              console.log('[RouteSave] Inserted new route into database')
            } else {
              console.warn('[RouteSave] Database insert failed:', error)
            }
          }
        } catch (dbError) {
          console.warn('Database save failed, using localStorage fallback:', dbError)
        }
      }
      
      // Database is the source of truth. Only keep a localStorage copy
      // when the database save failed (offline fallback); otherwise prune
      // stale local copies so they never resurface or re-migrate later.
      const existingRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
      let updatedRoutes

      if (savedToDatabase) {
        const nameKey = String(routeData.name || '').trim().toLowerCase()
        updatedRoutes = existingRoutes.filter((route: any) =>
          route.id !== routeData.id &&
          String(route?.name || '').trim().toLowerCase() !== nameKey
        )
      } else if (isUpdating) {
        // Update existing route
        updatedRoutes = existingRoutes.map((route: any) =>
          route.id === targetUpdateId ? routeData : route
        )
      } else {
        // Add new route
        updatedRoutes = [...existingRoutes, routeData]
      }

      localStorage.setItem('savedRoutes', JSON.stringify(updatedRoutes))
      
      // Reload saved routes to get updated list
      await loadSavedRoutes()
      
      // Clear temporary draft and current route settings
      try { localStorage.removeItem(draftKey) } catch {}
      
      // Clear current route after successful save
      setRouteCustomers([])
      setTotalDistance(0)
      setTotalDuration(0)
      setSelectedCustomer(null)
      setRouteDate('')
      setRouteTime('')
      
      setShowSaveModal(false)
      setRouteName('')
      setEditingRouteId(null)
      
      const action = isUpdating ? 'actualizada' : 'guardada'
      const saveLocation = savedToDatabase ? 'Base de datos' : 'localStorage'
      alert(`Ruta ${action} exitosamente (${saveLocation})`)
    } catch (error) {
      console.error('Error saving route:', error)
      alert('Error al guardar la ruta: ' + (error as Error).message)
    }
  }


  // 載入路線
  const loadRoute = (routeData: any) => {
    setRouteCustomers(routeData.customers)
    setRouteDate(routeData.date)
    setRouteTime(routeData.time)
    setTotalDistance(routeData.totalDistance)
    setTotalDuration(routeData.totalDuration)
    setRouteName(routeData.name)
    setEditingRouteId(routeData.id) // Set editing mode
    setShowLoadModal(false)
    calculateRouteDistanceAndTime(routeData.customers)
  }
  
  // Wrapper functions for button handlers (support optional updateRouteId for same-name updates)
  const handleSaveRoute = (updateRouteId?: string) => saveRoute(false, updateRouteId)
  const handleSaveAsNew = () => saveRoute(true)

  // 完成路線並記錄到儀表板
  const completeRoute = async (routeData: any) => {
    try {
      const completedVisits = routeData.customers.map((customer: any) => ({
        id: `${routeData.id}_${customer.id}_${Date.now()}`,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_company: customer.company || '',
        visit_date: new Date().toISOString().split('T')[0], // Today's date
        visit_time: new Date().toTimeString().split(' ')[0].substring(0, 5), // Current time HH:MM
        notes: `Visita completada - Ruta: ${routeData.name}`,
        status: 'completed',
        route_id: routeData.id,
        route_name: routeData.name
      }))

      const visitCount = completedVisits.length
      const routeName = routeData.name
      
      if (confirm(`¿Marcar como completada la ruta "${routeName}" con ${visitCount} visitas?\n\nEsto registrará todas las paradas como visitadas en el Panel de Control.`)) {
        // Database first: persist completed visits to the visits table
        let dbSaved = false
        if (user?.id) {
          try {
            const { saved, failed } = await saveCompletedVisitsToDb(completedVisits, user.id)
            dbSaved = saved > 0 && failed === 0
            console.log(`[CompleteRoute] DB visits saved: ${saved}, failed: ${failed}`)
          } catch (dbError) {
            console.warn('[CompleteRoute] DB visit save failed, keeping localStorage copy:', dbError)
          }
        }

        // localStorage as offline cache / fallback
        const existingVisits = readLocalCompletedVisits()
        writeLocalCompletedVisits([...existingVisits, ...completedVisits])

        // Mark route as completed and update saved routes
        const completedAtIso = new Date().toISOString()
        const updatedRouteData = {
          ...routeData,
          completed: true,
          completedAt: completedAtIso,
          completedVisits: completedVisits
        }

        // Database first: persist completion state on the saved route
        // (only when the id is a DB UUID; local-only routes have numeric ids)
        const isDbRouteId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(routeData.id))
        if (user?.id && isDbRouteId) {
          try {
            const { error: routeUpdateError } = await supabase
              .from('saved_routes')
              .update({
                completed: true,
                completed_at: completedAtIso,
                completed_visits: completedVisits,
              })
              .eq('id', routeData.id)
              .eq('created_by', user.id)
            if (routeUpdateError) {
              console.warn('[CompleteRoute] DB route completion update failed:', routeUpdateError.message)
            }
          } catch (routeError) {
            console.warn('[CompleteRoute] DB route completion update error:', routeError)
          }
        }

        // Update the route in savedRoutes (localStorage cache)
        const existingRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
        const updatedRoutes = existingRoutes.map((route: any) =>
          route.id === routeData.id ? updatedRouteData : route
        )
        localStorage.setItem('savedRoutes', JSON.stringify(updatedRoutes))

        // Refresh saved routes list
        await loadSavedRoutes()

        console.log('Completed visits:', completedVisits, 'dbSaved:', dbSaved)

        alert(`✅ Ruta "${routeName}" marcada como completada!\n\n${visitCount} visitas registradas en el Panel de Control.${dbSaved ? '' : '\n\n⚠ Guardado solo en este dispositivo (sin conexión a la base de datos).'}`)
        
        // Optionally load current route to continue working
        if (confirm('¿Cargar esta ruta para continuar planificando?')) {
          loadRoute(routeData)
        }
      }
    } catch (error) {
      console.error('Error completing route:', error)
      alert('Error al completar la ruta: ' + (error as Error).message)
    }
  }

  // 匯出路線資料備份
  const exportRoutesBackup = () => {
    try {
      const savedRoutes = localStorage.getItem('savedRoutes')
      const routesData = savedRoutes ? JSON.parse(savedRoutes) : []
      
      if (routesData.length === 0) {
        alert('No hay rutas guardadas para exportar')
        return
      }

      const backup = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        routesCount: routesData.length,
        routes: routesData
      }

      const dataStr = JSON.stringify(backup, null, 2)
      const dataBlob = new Blob([dataStr], { type: 'application/json' })
      
      const link = document.createElement('a')
      link.href = URL.createObjectURL(dataBlob)
      link.download = `casmara-rutas-backup-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      alert(`✅ Backup exportado con ${routesData.length} rutas`)
    } catch (error) {
      console.error('Error exporting routes backup:', error)
      alert('Error al exportar el backup de rutas')
    }
  }

  // 匯入路線資料備份
  const importRoutesBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const backupData = JSON.parse(e.target?.result as string)
        
        if (!backupData.routes || !Array.isArray(backupData.routes)) {
          throw new Error('Formato de backup inválido')
        }

        const existingRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
        const importedCount = backupData.routes.length
        
        if (existingRoutes.length > 0) {
          const shouldMerge = confirm(
            `Ya tienes ${existingRoutes.length} rutas guardadas.\n` +
            `¿Quieres combinar con las ${importedCount} rutas del backup?\n\n` +
            `"Aceptar" = Combinar\n"Cancelar" = Reemplazar completamente`
          )
          
          if (shouldMerge) {
            // Combinar rutas evitando duplicados por nombre
            const merged = [...existingRoutes]
            backupData.routes.forEach((importedRoute: any) => {
              const exists = merged.find(r => r.name === importedRoute.name)
              if (!exists) {
                merged.push({
                  ...importedRoute,
                  id: crypto.randomUUID(),
                  createdAt: new Date().toISOString()
                })
              }
            })
            localStorage.setItem('savedRoutes', JSON.stringify(merged))
            alert(`✅ Backup importado: ${merged.length - existingRoutes.length} rutas nuevas añadidas`)
          } else {
            // Reemplazar completamente
            localStorage.setItem('savedRoutes', JSON.stringify(backupData.routes))
            alert(`✅ Backup importado completamente: ${importedCount} rutas restauradas`)
          }
        } else {
          // Sin rutas existentes, importar directamente
          localStorage.setItem('savedRoutes', JSON.stringify(backupData.routes))
          alert(`✅ Backup importado: ${importedCount} rutas restauradas`)
        }
        
        // Recargar rutas guardadas
        loadSavedRoutes()
        
      } catch (error) {
        console.error('Error importing backup:', error)
        alert('Error al importar el backup. Verifica que el archivo sea válido.')
      }
    }
    
    reader.readAsText(file)
    
    // Reset input
    if (event.target) {
      event.target.value = ''
    }
  }

  // 刪除儲存的路線
  const deleteSavedRoute = async (routeId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta ruta?')) {
      return
    }

    try {
      let deletedFromDatabase = false
      
      // Try to delete from database first for cross-device synchronization
      if (user?.id) {
        try {
          // Attempt direct Supabase deletion (returning representation to confirm affected rows)
          const { data: delData, error } = await supabase
            .from('saved_routes')
            .delete()
            .eq('id', routeId)
            .eq('created_by', user.id)
            .select()
          
          if (!error && Array.isArray(delData) && delData.length > 0) {
            deletedFromDatabase = true
            console.log('Route deleted from database successfully:', routeId)
          } else {
            console.warn('Database delete failed or returned no rows:', error || 'no rows')
          }
        } catch (dbError) {
          console.warn('Database delete failed, using localStorage fallback:', dbError)
        }
      }
      
      // Fallback: try Netlify function with Supabase JWT if DB delete didn't happen
      if (!deletedFromDatabase) {
        try {
          const { data: sessionData } = await supabase.auth.getSession()
          const token = sessionData?.session?.access_token
          if (token) {
            const resp = await fetch(`/.netlify/functions/saved-routes/${routeId}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            })
            if (resp.ok) {
              const json = await resp.json().catch(() => ({} as any))
              if (json?.success || resp.status === 200) {
                deletedFromDatabase = true
                console.log('Route deleted via Netlify function:', routeId)
              } else {
                console.warn('Netlify delete responded without success:', json)
              }
            } else {
              const text = await resp.text().catch(() => '')
              console.warn('Netlify delete failed:', resp.status, text)
            }
          }
        } catch (fnErr) {
          console.warn('Netlify delete error:', fnErr)
        }
      }
      
      // Remove the route's completed visits everywhere (DB + cache)
      try {
        await deleteCompletedVisitsByRoute(routeId, user?.id || '')
      } catch (visitsErr) {
        console.warn('Failed to delete completed visits for route:', visitsErr)
      }

      // Fallback to localStorage
      const existingRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
      const updatedRoutes = existingRoutes.filter((route: any) => route.id !== routeId)
      localStorage.setItem('savedRoutes', JSON.stringify(updatedRoutes))
      
      // Reload saved routes to get updated list
      await loadSavedRoutes()
      
      const deleteLocation = deletedFromDatabase ? 'Base de datos' : 'localStorage'
      alert(`Ruta eliminada exitosamente (${deleteLocation})`)
    } catch (error) {
      console.error('Error deleting route:', error)
      alert('Error al eliminar la ruta: ' + (error as Error).message)
    }
  }


  useEffect(() => {
    if (user) {
      loadCustomers()
      loadSavedRoutes()
      // Upload any completed visits that only exist in this browser
      // (idempotent: deduplicated by legacy_id in the visits table)
      syncLocalCompletedVisitsToDb(user.id).catch(err =>
        console.warn('[CompletedVisits] startup sync failed:', err)
      )
    }
  }, [user])

  // Restore draft route (if any) on mount / when user is ready
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return
      const draft = JSON.parse(raw || '{}')
      if (!draft || typeof draft !== 'object') return
      // avoid overwriting an existing in-memory route
      if (routeCustomers.length > 0) return
      const draftCustomers = Array.isArray(draft.customers) ? draft.customers : []
      if (draftCustomers.length === 0 && !draft.date && !draft.time) return
      setRouteCustomers(draftCustomers)
      setRouteDate(String(draft.date || ''))
      setRouteTime(String(draft.time || ''))
      setTotalDistance(Number(draft.totalDistance || 0))
      setTotalDuration(Number(draft.totalDuration || 0))
      if (draftCustomers.length > 0) {
        // recalc to ensure distances are fresh and map renders
        calculateRouteDistanceAndTime(draftCustomers)
      }
      try { console.log('[RoutePlanning] Draft route restored from localStorage') } catch {}
    } catch (e) {
      console.warn('[RoutePlanning] Failed to restore draft route', e)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])

  // Autosave draft whenever route-related state changes
  useEffect(() => {
    try {
      // If nothing meaningful, remove draft
      if (routeCustomers.length === 0 && !routeDate && !routeTime) {
        localStorage.removeItem(draftKey)
        return
      }
      const draft = {
        date: routeDate,
        time: routeTime,
        customers: routeCustomers,
        totalDistance,
        totalDuration,
        updatedAt: new Date().toISOString()
      }
      localStorage.setItem(draftKey, JSON.stringify(draft))
    } catch (e) {
      console.warn('[RoutePlanning] Failed to persist draft route', e)
    }
  }, [draftKey, routeCustomers, routeDate, routeTime, totalDistance, totalDuration])

  // 獲取當前位置 - 只顯示位置，不自動加入路線
  const getCurrentLocation = async () => {
    try {
      if (!('geolocation' in navigator)) {
        alert('Geolocalización no disponible en este navegador')
        return
      }
      // Comprobar permiso si el navegador lo soporta
      try {
        const perm = (navigator as any).permissions && await (navigator as any).permissions.query({ name: 'geolocation' as any })
        if (perm && perm.state === 'denied') {
          alert('Permiso de ubicación denegado. Habilítalo en la configuración del navegador para este sitio y vuelve a intentarlo.')
          return
        }
      } catch {}

      const options: PositionOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const { latitude, longitude } = coords
          
          // Try to ensure map is available and working
          let google: any = null
          try { 
            google = await ensureGoogleMapsLoaded() 
          } catch (error) {
            console.warn('Failed to load Google Maps:', error)
            alert(`Ubicación actual: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`)
            return
          }
          
          let map = mapInstanceRef.current
          
          // Check if map container exists and map instance is valid
          if (!mapRef.current) {
            alert(`Ubicación actual: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`)
            return
          }
          
          // If map instance doesn't exist or is invalid, try to recreate it
          if (!map || !google) {
            try {
              // Force map refresh by triggering the main render effect
              const event = new CustomEvent('mapRefresh')
              window.dispatchEvent(event)
              
              // Wait a bit for the map to be recreated
              await new Promise(resolve => setTimeout(resolve, 500))
              
              map = mapInstanceRef.current
              if (!map) {
                alert(`Ubicación actual: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`)
                return
              }
            } catch (error) {
              console.warn('Failed to recreate map:', error)
              alert(`Ubicación actual: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`)
              return
            }
          }

          // Clear previous my-location marker/info
          try {
            if (myLocationMarkerRef.current) {
              myLocationMarkerRef.current.setMap(null)
              myLocationMarkerRef.current = null
            }
          } catch {}
          try {
            if (myLocationInfoRef.current) {
              myLocationInfoRef.current.close()
              myLocationInfoRef.current = null
            }
          } catch {}

          const position = { lat: latitude, lng: longitude }
          const marker = new google.maps.Marker({
            position,
            map,
            icon: createMyLocationIcon(),
            zIndex: 9999,
            title: 'Mi Ubicación'
          })
          const infoHtml = `
            <div class="text-[13px]">
              <div class="font-semibold text-gray-900">Mi ubicación</div>
              <div class="text-xs text-gray-600">${latitude.toFixed(6)}, ${longitude.toFixed(6)}</div>
            </div>`
          const info = new google.maps.InfoWindow({ content: infoHtml })
          info.open({ anchor: marker, map })
          myLocationMarkerRef.current = marker
          myLocationInfoRef.current = info

          try {
            map.panTo(position)
            const currentZoom = map.getZoom?.() ?? 0
            if (!currentZoom || currentZoom < 13) map.setZoom(13)
          } catch {}

          // Store user location and recalculate route distances
          const userLoc = { lat: latitude, lng: longitude }
          userLocationRef.current = userLoc
          recalcRouteDistances(undefined, userLoc)
        },
        (error) => {
          console.error('Error getting location:', error)
          let msg = 'No se pudo obtener la ubicación actual'
          if (error.code === 1) msg = 'Permiso de ubicación denegado. Activa el permiso en el navegador y vuelve a intentarlo.'
          else if (error.code === 2) msg = 'Ubicación no disponible. Verifica el GPS o los servicios de ubicación del dispositivo.'
          else if (error.code === 3) msg = 'La solicitud de ubicación ha excedido el tiempo de espera. Inténtalo de nuevo.'
          alert(msg)
        },
        options
      )
    } catch (e) {
      console.error('Error getting location:', e)
      alert('No se pudo obtener la ubicación actual')
    }
  }

  // 根據經緯度計算哈弗辛距離（公里）
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371 // km
    const toRad = (d: number) => (d * Math.PI) / 180
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  // 服務端地理編碼，獲取座標
  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const resp = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      })
      const data = await resp.json()
      if (resp.ok && data?.success && data?.data?.lat != null && data?.data?.lng != null) {
        return { lat: Number(data.data.lat), lng: Number(data.data.lng) }
      }
    } catch (e) {
      console.warn('[RoutePlanning] geocode failed for', address, e)
    }
    return null
  }

  // 依據當前位置自動優化路線順序（最近鄰啟發式）
  const reorderRouteByCurrentLocation = async () => {
    try {
      if (routeCustomers.length < 2) {
        alert('Necesitas al menos 2 paradas para optimizar el orden de la ruta')
        return
      }

      // 取得當前位置
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('Geolocalización no disponible'))
        navigator.geolocation.getCurrentPosition(resolve, reject)
      })
      const { latitude: curLat, longitude: curLng } = position.coords

      // 取得各客戶座標（並行，使用帶回退的解析）
      const geocoded = await Promise.all(
        routeCustomers.map(async (c, idx) => {
          const coords = await resolveCustomerCoords(c)
          return { idx, customer: c, coords }
        })
      )

      // 分離可用與不可用座標
      const withCoords = geocoded.filter(g => g.coords).map(g => ({
        customer: g.customer,
        lat: (g.coords as any).lat as number,
        lng: (g.coords as any).lng as number
      }))
      const withoutCoords = geocoded.filter(g => !g.coords).map(g => g.customer)

      if (withCoords.length === 0) {
        alert('No se pudieron geocodificar las direcciones para optimizar la ruta')
        return
      }

      // 最近鄰排序
      const remaining = [...withCoords]
      const ordered: typeof withCoords = []
      let current = { lat: curLat, lng: curLng }
      while (remaining.length > 0) {
        let bestIndex = 0
        let bestDist = Number.POSITIVE_INFINITY
        for (let i = 0; i < remaining.length; i++) {
          const cand = remaining[i]
          const d = haversineDistance(current.lat, current.lng, cand.lat, cand.lng)
          if (d < bestDist) {
            bestDist = d
            bestIndex = i
          }
        }
        const next = remaining.splice(bestIndex, 1)[0]
        ordered.push(next)
        current = { lat: next.lat, lng: next.lng }
      }

      // 合併排序結果（未能地理編碼者維持在尾端原順序）
      const newOrderedCustomers: RouteCustomer[] = [
        ...ordered.map((o, i) => ({ ...o.customer, order: i + 1 })),
        ...withoutCoords.map((c, i) => ({ ...c, order: ordered.length + i + 1 }))
      ]

      setRouteCustomers(newOrderedCustomers)
      await calculateRouteDistanceAndTime(newOrderedCustomers)
    } catch (err: any) {
      console.error('[RoutePlanning] reorder by current location failed:', err)
      alert('No se pudo optimizar el orden de la ruta: ' + (err?.message || 'Error desconocido'))
    }
  }

  // 開啟 Google Maps 導航
  const startNavigation = () => {
    if (routeCustomers.length === 0) return

    // Use getAddress to get complete formatted addresses with province and country
    const waypoints = routeCustomers.map(customer => {
      const fullAddress = getAddress(customer)
      return encodeURIComponent(fullAddress)
    })

    const origin = waypoints[0]
    const destination = waypoints[waypoints.length - 1]
    const waypointsParam = waypoints.slice(1, -1).join('|')

    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`
    if (waypointsParam) {
      url += `&waypoints=${waypointsParam}`
    }
    url += '&travelmode=driving'

    console.log('[Navigation] Generated URL:', url)
    window.open(url, '_blank')
  }

  // 打開客戶位置在 Google Maps
  const openInGoogleMaps = (customer: Customer) => {
    const address = getAddress(customer)
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    window.open(url, '_blank')
  }

  // 獲取到客戶的導航
  const getDirections = (customer: Customer) => {
    const address = getAddress(customer)
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`
    window.open(url, '_blank')
  }

  // 格式化地址
  const getAddress = (customer: Customer) => {
    const parts = []
    if (customer.address) parts.push(customer.address)
    // 加入郵遞區號（若存在）提升地理編碼成功率
    const cp = (customer as any).cp || (customer as any).postal_code
    if (cp) parts.push(String(cp))
    const city = displayCity(customer)
    if (city) parts.push(city)
    const province = displayProvince(customer)
    if (province) parts.push(province)
    // Add country to improve geocoding stability
    parts.push('España')
    return parts.join(', ') || 'Sin dirección'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div ref={fullContainerRef} className="max-md:min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 print-hide max-md:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planificación de Rutas</h1>
          <p className="text-gray-600">Crear y optimizar rutas para visitas a clientes</p>
        </div>
        {/* Mobile-optimized button grid layout */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap gap-2 sm:gap-3">
          <button
            onClick={getCurrentLocation}
            className="inline-flex items-center justify-center space-x-1 sm:space-x-2 px-2 sm:px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-xs sm:text-sm"
          >
            <MapPin className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="hidden sm:inline">Mi Ubicación</span>
            <span className="sm:hidden">Ubicación</span>
          </button>
          
          <button
            onClick={() => setShowSaveModal(true)}
            disabled={routeCustomers.length === 0}
            className="inline-flex items-center justify-center space-x-1 sm:space-x-2 px-2 sm:px-4 py-2 border border-green-300 text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
          >
            <Plus className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="hidden sm:inline">Guardar Ruta</span>
            <span className="sm:hidden">Guardar</span>
          </button>
          
          <button
            onClick={() => setShowLoadModal(true)}
            className="inline-flex items-center justify-center space-x-1 sm:space-x-2 px-2 sm:px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 text-xs sm:text-sm"
          >
            <Route className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="hidden sm:inline">Cargar Ruta</span>
            <span className="sm:hidden">Cargar</span>
          </button>
          
          <button
            onClick={clearRoute}
            disabled={routeCustomers.length === 0}
            className="inline-flex items-center justify-center space-x-1 sm:space-x-2 px-2 sm:px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
          >
            <X className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="hidden sm:inline">Limpiar Ruta</span>
            <span className="sm:hidden">Limpiar</span>
          </button>
          
          {/* Backup button */}
          <button
            onClick={exportRoutesBackup}
            className="inline-flex items-center justify-center space-x-1 sm:space-x-2 px-2 sm:px-4 py-2 border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 text-xs sm:text-sm"
            title="Descargar backup de todas las rutas guardadas"
          >
            <Download className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
            <span>Backup</span>
          </button>
          
          {/* Restore button with hidden file input */}
          <div className="relative">
            <input
              type="file"
              accept=".json"
              onChange={importRoutesBackup}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              title="Restaurar rutas desde backup"
            />
            <button className="inline-flex items-center justify-center space-x-1 sm:space-x-2 px-2 sm:px-4 py-2 border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 w-full text-xs sm:text-sm">
              <Upload className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
              <span>Restaurar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Configuración de fecha y hora */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6 max-md:hidden">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Programación de la Ruta</h2>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Fecha de la ruta</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="date"
                value={routeDate}
                onChange={(e) => setRouteDate(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Hora de inicio</label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="time"
                value={routeTime}
                onChange={(e) => setRouteTime(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                if (!routeDate || !routeTime) {
                  alert('Por favor selecciona fecha y hora para la ruta')
                  return
                }
                alert(`Ruta programada para ${routeDate} a las ${routeTime}`)
              }}
              disabled={routeCustomers.length === 0 || !routeDate || !routeTime}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Programar Ruta
            </button>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6 max-md:hidden">
        <div className="flex flex-col lg:flex-row gap-4 mb-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar clientes por nombre o empresa..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="sm:w-48">
            <select
              value={selectedProvince}
              onChange={(e) => {
                setSelectedProvince(e.target.value)
                setSelectedCity('')
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Todas las Provincias</option>
              {provinces.map(province => (
                <option key={province} value={province}>{province}</option>
              ))}
            </select>
          </div>
          <div className="sm:w-48">
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Todas las Ciudades</option>
              {getFilteredCities().map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>
          <div className="lg:w-32 flex items-end">
            <button
              onClick={() => {
                setSearchTerm('')
                setSelectedProvince('')
                setSelectedCity('')
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              Limpiar
            </button>
          </div>
        </div>
        <div className="text-sm text-gray-600">
          {filteredCustomers.length} clientes disponibles • {routeCustomers.length} en la ruta
        </div>
      </div>

      {/* Layout matching Maps.tsx: 1/4 left panel, 3/4 right panel */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 print-grid">
        {/* Panel izquierdo - Lista de clientes y ruta */}
        <div className="hidden md:block lg:col-span-1 space-y-6">
            {/* Lista de clientes disponibles */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 print-hide">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Clientes Disponibles</h2>
                <p className="text-sm text-gray-600">{filteredCustomers.length} clientes encontrados</p>
              </div>
              <div className="max-h-96 lg:max-h-96 overflow-y-auto">
                {filteredCustomers.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600">No hay clientes disponibles</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {filteredCustomers.map((customer) => (
                      <div
                        key={customer.id}
                        className="p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-medium text-gray-900 truncate">{customer.name}</h3>
                            <p className="text-xs text-gray-600 truncate">{customer.company}</p>
                            {(customer.phone || (customer as any).mobile_phone) && (
                              <a
                                href={telHref(customer.phone || (customer as any).mobile_phone)}
                                className="text-xs text-blue-600 hover:underline mt-0.5 inline-block"
                              >
                                {customer.phone || (customer as any).mobile_phone}
                              </a>
                            )}
                            <div className="flex items-start mt-1">
                              <MapPin className="w-3 h-3 text-gray-400 mr-1 mt-0.5 flex-shrink-0" />
                              <span className="text-xs text-gray-600 break-words">{getAddress(customer)}</span>
                            </div>
                            <div className="mt-1 text-xs text-gray-500 truncate">
                              <span className="font-medium">Contrato:</span> {customer.contrato || '—'}
                            </div>
                            <div className="mt-0.5 text-xs text-gray-500 line-clamp-1">
                              <span className="font-medium">Notas:</span> {customer.notes || '—'}
                            </div>
                          </div>
                          <button
                            onClick={() => addCustomerToRoute(customer)}
                            className="ml-3 inline-flex items-center p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Ruta planificada */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-200">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Ruta Planificada</h2>
                    <p className="text-sm text-gray-600">
                      {routeCustomers.length} paradas{routeDistances.totalDistanceKm != null && routeDistances.totalDistanceKm > 0 && <> — <span className="text-blue-600 font-medium">{formatDistanceKm(routeDistances.totalDistanceKm)}</span></>}
                    </p>
                  </div>
                  {routeCustomers.length > 0 && (
                    <button
                      onClick={clearRoute}
                      className="text-red-600 hover:text-red-800"
                      title="Limpiar ruta"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            <div className="max-h-96 overflow-y-auto">
              {routeCustomers.length === 0 ? (
                <div className="text-center py-8">
                  <Route className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">Agrega clientes de la lista para crear una ruta</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {routeCustomers.map((customer, index) => (
                    <div key={customer.id} className="p-4">
                      <div className="flex items-start space-x-3">
                        <div className="flex flex-col items-center space-y-1">
                          <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-blue-600 font-medium text-xs">{index + 1}</span>
                          </div>
                          <div className="flex flex-col space-y-1">
                            <button
                              onClick={() => moveUp(index)}
                              disabled={index === 0}
                              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                              title="Subir"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => moveDown(index)}
                              disabled={index === routeCustomers.length - 1}
                              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                              title="Bajar"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div 
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => setSelectedCustomer(customer)}
                        >
                          <h3 
                            className="text-sm font-medium text-gray-900 truncate cursor-default"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {customer.name}
                          </h3>
                          <p className="text-xs text-gray-600 truncate">{customer.company}</p>
                          {(customer.phone || (customer as any).mobile_phone) && (
                            <a
                              href={telHref(customer.phone || (customer as any).mobile_phone)}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs text-blue-600 hover:underline mt-0.5 inline-block"
                            >
                              {customer.phone || (customer as any).mobile_phone}
                            </a>
                          )}
                          <div className="flex items-start mt-1">
                            <MapPin className="w-3 h-3 text-gray-400 mr-1 mt-0.5 flex-shrink-0" />
                            <span className="text-xs text-gray-600 break-words">{getAddress(customer)}</span>
                          </div>
                          <div className="mt-1 text-xs text-gray-500 truncate">
                            <span className="font-medium">Contrato:</span> {customer.contrato || '—'}
                          </div>
                          <div className="mt-0.5 text-xs text-gray-500 line-clamp-1">
                            <span className="font-medium">Notas:</span> {customer.notes || '—'}
                          </div>
                          {(() => {
                            const stopDist = routeDistances.stops.find(s => s.id === customer.id)
                            if (!stopDist) return null
                            return (
                              <div className="mt-1.5 space-y-0.5 text-xs">
                                {index === 0 ? (
                                  <div className="text-purple-600">
                                    <Navigation className="w-3 h-3 inline mr-1" />
                                    Desde mi ubicación: {formatDistanceKm(stopDist.distanceFromUserKm)}
                                  </div>
                                ) : (
                                  <div className="text-blue-600">
                                    <Car className="w-3 h-3 inline mr-1" />
                                    Desde parada anterior: {formatDistanceKm(stopDist.distanceFromPreviousStopKm)}
                                  </div>
                                )}
                                {stopDist.cumulativeDistanceKm != null && (
                                  <div className="text-gray-400">
                                    Acumulado: {formatDistanceKm(stopDist.cumulativeDistanceKm)}
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            removeFromRoute(customer.id)
                          }}
                          className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50"
                          title="Quitar de la ruta"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            {/* Estadísticas de la ruta */}
            {routeCustomers.length > 0 && (
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total paradas:</span>
                    <span className="font-medium">{routeCustomers.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Distancia total:</span>
                    <span className="font-medium text-blue-600">{routeDistances.totalDistanceKm != null ? formatDistanceKm(routeDistances.totalDistanceKm) : (totalDistance > 0 ? formatKm(totalDistance) : '—')}</span>
                  </div>
                  {mapProvider !== 'leaflet' && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tiempo estimado:</span>
                      <span className="font-medium text-green-600">{totalDuration > 0 ? `${Math.floor(totalDuration / 60)}h ${Math.round(totalDuration % 60)}min` : 'Calculando...'}</span>
                    </div>
                  )}
                  {/* Mostrar detalles individuales de cada parada */}
                  <div className="pt-2 border-t border-gray-300">
                    <h4 className="text-xs font-medium text-gray-700 mb-2">Detalles por parada:</h4>
                    <div className="space-y-1">
                      {routeCustomers.map((customer, index) => {
                        const sd = routeDistances.stops.find(s => s.id === customer.id)
                        return (
                        <div key={customer.id} className="flex justify-between text-xs">
                          <span className="text-gray-600">{index + 1}. {customer.name}</span>
                          <span className="text-gray-500">
                            {index === 0
                              ? (sd?.distanceFromUserKm != null ? formatDistanceKm(sd.distanceFromUserKm) : 'Origen')
                              : formatDistanceKm(sd?.distanceFromPreviousStopKm)}
                          </span>
                        </div>
                      )})}
                    </div>
                  </div>
                </div>
                <button
                  onClick={startNavigation}
                  className="w-full mt-3 inline-flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Navigation className="w-4 h-4" />
                  <span>Iniciar Navegación</span>
                </button>
              </div>
            )}
          </div>

          {/* Panel de detalles del cliente - moved to left panel */}
          {selectedCustomer && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Detalles del Cliente</h3>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
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
                  
                  {(selectedCustomer.phone || (selectedCustomer as any).mobile_phone) && (
                    <div className="flex items-center space-x-2">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <a
                        href={telHref(selectedCustomer.phone || (selectedCustomer as any).mobile_phone)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {selectedCustomer.phone || (selectedCustomer as any).mobile_phone}
                      </a>
                    </div>
                  )}
                  
                  {selectedCustomer.email && (
                    <div className="flex items-center space-x-2">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700">{selectedCustomer.email}</span>
                    </div>
                  )}
                  
                  <div className="flex items-start space-x-2">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <span className="text-sm text-gray-700">{getAddress(selectedCustomer)}</span>
                  </div>
                  
                  <div className="pt-3 border-t border-gray-200 space-y-2">
                    <button
                      onClick={() => openInGoogleMaps(selectedCustomer)}
                      className="w-full inline-flex items-center justify-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Abrir en Mapas</span>
                    </button>
                    <button
                      onClick={() => getDirections(selectedCustomer)}
                      className="w-full inline-flex items-center justify-center space-x-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                    >
                      <Navigation className="w-4 h-4" />
                      <span>Obtener Direcciones</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Map panel - Right side */}
        <div className="lg:col-span-3">
          {/* Mapa de la ruta */}
          <div className="max-md:fixed max-md:inset-0 max-md:z-40 bg-white md:rounded-xl md:shadow-sm md:border md:border-gray-200 overflow-hidden print-card">
              <div className="p-4 border-b border-gray-200 max-md:hidden">
                <h2 className="text-lg font-semibold text-gray-900">Mapa de la Ruta</h2>
                <p className="text-sm text-gray-600">Visualización de la ruta planificada</p>
              </div>
              {routeCustomers.length > 0 && (
                <div className="px-4 py-3 border-b border-gray-100 bg-white/60 max-md:hidden">
                  <div className="flex items-center gap-2 overflow-x-auto">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                      Paradas: <span className="ml-1 font-medium">{routeCustomers.length}</span>
                    </span>
                    {(mapProvider !== 'leaflet' || totalDistance > 0) && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700">
                        Distancia: <span className="ml-1 font-medium">{formatKm(totalDistance)}</span>
                      </span>
                    )}
                    {mapProvider !== 'leaflet' && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-green-50 text-green-700">
                        Tiempo: <span className="ml-1 font-medium">{Math.floor(totalDuration / 60)}h {Math.round(totalDuration % 60)}min</span>
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={reorderRouteByCurrentLocation}
                        className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 inline-flex items-center"
                      >
                        <Route className="w-3 h-3 mr-1" />
                        Optimizar por mi ubicación
                      </button>
                      <button
                        onClick={startNavigation}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center"
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        Navegar
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="h-[800px] relative bg-white max-md:h-full">
              {routeCustomers.length === 0 && mapProvider !== 'leaflet' ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Route className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Sin ruta planificada</h3>
                    <p className="text-gray-600">Agrega clientes de la lista izquierda para crear una ruta</p>
                  </div>
                </div>
              ) : (
                mapProvider === 'leaflet' ? (
                  <div className="h-full relative">
                    {/* Leaflet overlay controls */}
                    <div className="absolute z-[1000] right-3 top-3 hidden md:flex flex-col sm:flex-row gap-2 print-hide">
                      <button
                        onClick={fitLeafletToAllStops}
                        title="Ver todos"
                        className="inline-flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-white/90 backdrop-blur rounded-md shadow border hover:bg-white"
                      >
                        <span className="text-xs text-gray-700 hidden sm:inline">Ver todos</span>
                        <span className="text-xs text-gray-700 sm:hidden">Todos</span>
                      </button>
                      <button
                        onClick={getCurrentLocationLeaflet}
                        title="Mi ubicación"
                        className="inline-flex items-center space-x-1 px-2 sm:px-3 py-1.5 sm:py-2 bg-white/90 backdrop-blur rounded-md shadow border hover:bg-white"
                      >
                        <LocateFixed className="w-4 h-4 text-blue-600" />
                        <span className="text-xs text-gray-700 hidden sm:inline">Mi ubicación</span>
                        <span className="text-xs text-gray-700 sm:hidden">Mi pos.</span>
                      </button>
                      <button
                        onClick={resetLeafletMap}
                        title="Reiniciar mapa"
                        className="inline-flex items-center space-x-1 px-2 sm:px-3 py-1.5 sm:py-2 bg-white/90 backdrop-blur rounded-md shadow border hover:bg-white"
                      >
                        <RefreshCcw className="w-4 h-4 text-gray-700" />
                        <span className="text-xs text-gray-700 hidden sm:inline">Reiniciar</span>
                        <span className="text-xs text-gray-700 sm:hidden">Reset</span>
                      </button>
                      <button
                        onClick={toggleMapFullscreen}
                        title={leafletFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa del mapa'}
                        className="inline-flex items-center space-x-1 px-2 sm:px-3 py-1.5 sm:py-2 bg-white/90 backdrop-blur rounded-md shadow border hover:bg-white"
                      >
                        {leafletFullscreen ? (
                          <Minimize2 className="w-4 h-4 text-gray-700" />
                        ) : (
                          <Maximize2 className="w-4 h-4 text-gray-700" />
                        )}
                        <span className="text-xs text-gray-700 hidden sm:inline">{leafletFullscreen ? 'Salir' : 'Completa'}</span>
                      </button>
                      <button
                        onClick={generateIndependentPdf}
                        title="Generar PDF independiente"
                        className="inline-flex items-center space-x-1 px-2 sm:px-3 py-1.5 sm:py-2 bg-white/90 backdrop-blur rounded-md shadow border hover:bg-white"
                      >
                        <FileDown className="w-4 h-4 text-gray-700" />
                        <span className="text-xs text-gray-700 hidden sm:inline">PDF</span>
                      </button>
                    </div>
                    <div ref={mapRef} className="w-full h-full rounded-lg border print-map max-md:rounded-none max-md:border-0" />
                  </div>
                ) : (!mapsApiKey ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center max-w-md">
                      <Route className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">Falta la clave de Google Maps</h3>
                      <p className="text-gray-600 text-sm">Configura <code>VITE_GOOGLE_MAPS_API_KEY</code> en tu archivo <code>.env.local</code> y reinicia el servidor de Vite para visualizar el mapa de la ruta.</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-full relative">
                    <div ref={mapRef} className="w-full h-full rounded-lg border max-md:rounded-none max-md:border-0" />
                    {/* My Location button on map (Google only) */}
                    <button
                      onClick={getCurrentLocation}
                      className="absolute right-4 top-16 z-10 bg-white rounded-lg shadow-md p-2 hover:bg-gray-50 max-md:hidden"
                      title="Mi Ubicación"
                    >
                      <MapPin className="w-5 h-5 text-blue-600" />
                    </button>
                    {/* Manual Map Refresh button (Google only) */}
                    <button
                      onClick={async () => {
                        console.log('[MapRefresh] Manual refresh button clicked')
                        try {
                          // Clear map instance more gently - similar to Mi Ubicación logic
                          if (mapInstanceRef.current) {
                            // Clear my location marker first
                            if (myLocationMarkerRef.current) {
                              try { myLocationMarkerRef.current.setMap(null) } catch {}
                              myLocationMarkerRef.current = null
                            }
                            if (myLocationInfoRef.current) {
                              try { myLocationInfoRef.current.close() } catch {}
                              myLocationInfoRef.current = null
                            }
                          }
                          
                          // Trigger map refresh event
                          const event = new CustomEvent('mapRefresh')
                          window.dispatchEvent(event)
                          
                          // Wait for map to be recreated, then recalculate route if needed
                          setTimeout(() => {
                            if (routeCustomers.length > 0) {
                              console.log('[MapRefresh] Recalculating route after manual refresh')
                              calculateRouteDistanceAndTime([...routeCustomers])
                            }
                          }, 300)
                          
                        } catch (error) {
                          console.error('[MapRefresh] Manual refresh failed:', error)
                        }
                      }}
                      className="absolute right-4 top-28 z-10 bg-white rounded-lg shadow-md p-2 hover:bg-gray-50 max-md:hidden"
                      title="Refrescar Mapa"
                    >
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
              <div
                className="absolute inset-x-3 z-[1010] md:hidden"
                style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
              >
                <div className="flex items-center gap-2 rounded-full border border-white/60 bg-white/85 px-4 shadow-lg backdrop-blur-md">
                  <Search className="h-5 w-5 flex-shrink-0 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Buscar clientes..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value)
                      setMobileSheetTab('clients')
                      setShowDetails(true)
                    }}
                    onFocus={() => {
                      setMobileSheetTab('clients')
                      setShowDetails(true)
                    }}
                    className="h-12 w-full bg-transparent text-[15px] text-gray-900 placeholder-gray-500 focus:outline-none"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-500 active:bg-gray-100"
                      aria-label="Limpiar busqueda"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {measurementStep !== 'idle' && (
                <div
                  className="absolute inset-x-5 z-[1010] md:hidden"
                  style={{ top: 'calc(env(safe-area-inset-top) + 76px)' }}
                >
                  <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-blue-100 bg-white/95 px-3 text-sm shadow-lg backdrop-blur-md">
                    <span className="font-medium text-blue-700">
                      {measurementStep === 'selecting-a' && 'Selecciona el punto A'}
                      {measurementStep === 'selecting-b' && 'Ahora selecciona el punto B'}
                      {measurementStep === 'calculating' && 'Calculando ruta…'}
                      {measurementStep === 'result' && 'Medición lista'}
                    </span>
                    <button onClick={clearMeasurement} className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 active:bg-gray-100" aria-label="Cancelar medición">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}

              <div
                className="absolute right-3 z-[1009] flex flex-col gap-3 md:hidden"
                style={{ bottom: 'calc(env(safe-area-inset-bottom) + 170px)' }}
              >
                {measurementStep === 'idle' ? (
                  <button
                    onClick={startMeasurement}
                    title="Medir distancia"
                    aria-label="Medir distancia"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/85 shadow-lg backdrop-blur-md transition active:scale-95"
                  >
                    <Ruler className="h-6 w-6 text-blue-600" />
                  </button>
                ) : (
                  <button
                    onClick={clearMeasurement}
                    title="Cancelar medición"
                    aria-label="Cancelar medición"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition active:scale-95"
                  >
                    <X className="h-6 w-6" />
                  </button>
                )}
                {routeCustomers.length === 0 && measurementStep === 'idle' && (
                  <button
                    onClick={() => {
                      setMobileSheetTab('clients')
                      setShowDetails(true)
                    }}
                    title="Añadir primera visita"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition active:scale-95"
                    aria-label="Añadir primera visita"
                  >
                    <Plus className="h-6 w-6" />
                  </button>
                )}
                <button
                  onClick={mapProvider === 'leaflet' ? getCurrentLocationLeaflet : getCurrentLocation}
                  title="Mi ubicacion"
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/85 shadow-lg backdrop-blur-md transition active:scale-95"
                >
                  <LocateFixed className="h-6 w-6 text-blue-600" />
                </button>
                <button
                  onClick={mapProvider === 'leaflet' ? fitLeafletToAllStops : getCurrentLocation}
                  title="Ver ruta"
                  disabled={routeCustomers.length === 0}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-white/60 bg-white/85 shadow-lg backdrop-blur-md transition active:scale-95 disabled:opacity-50"
                >
                  <Maximize2 className="h-6 w-6 text-gray-700" />
                </button>
                {routeCustomers.length > 0 && (
                  <button
                    onClick={startNavigation}
                    title="Navegar"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 shadow-lg transition active:scale-95"
                  >
                    <Navigation className="h-6 w-6 text-white" />
                  </button>
                )}
              </div>

              {measurementStep === 'result' && measurementOrigin && measurementDestination && (
                <div
                  className="absolute inset-x-5 z-[1010] md:hidden"
                  style={{ bottom: 'calc(env(safe-area-inset-bottom) + 100px)' }}
                >
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-white/60 bg-white/95 px-4 py-3 shadow-xl backdrop-blur-md">
                    <div>
                      <div className="text-xs font-medium text-gray-500">A → B</div>
                      <div className="text-base font-bold text-blue-700">
                        {measurementResult
                          ? `${formatRouteDistance(measurementResult.distanceKm)} · ${formatRouteDuration(measurementResult.durationMinutes)}`
                          : 'Ruta no disponible'}
                      </div>
                      {measurementError && <div className="mt-0.5 text-xs text-amber-700">{measurementError}</div>}
                    </div>
                    <button onClick={startMeasurement} className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-700" aria-label="Nueva medición">
                      <Ruler className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}

              {!showDetails && (
                <div
                  className="absolute inset-x-0 z-[1010] flex justify-center md:hidden"
                  style={{ bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}
                >
                  <button
                    onClick={() => {
                      setMobileSheetTab(routeCustomers.length > 0 ? 'route' : 'clients')
                      setShowDetails(true)
                    }}
                    className="flex items-center gap-2 rounded-full border border-white/60 bg-white/90 px-5 py-3 text-sm font-medium text-gray-800 shadow-xl backdrop-blur-md transition active:scale-95"
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                    <span>{routeCustomers.length} paradas · {filteredCustomers.length} clientes</span>
                    <ChevronUp className="h-4 w-4 text-gray-500" />
                  </button>
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Bottom sheet with route details and actions (mobile-first) */}
      {showDetails && (
        <div className="fixed inset-x-0 bottom-0 z-[1050] md:hidden">
          <div className="pb-[env(safe-area-inset-bottom)]">
            <div ref={bottomSheetRef} className="flex max-h-[68vh] flex-col rounded-t-2xl border border-gray-200 bg-white shadow-2xl">
              <button
                className="flex w-full flex-col items-center pb-1 pt-2"
                onClick={() => setShowDetails(false)}
                aria-label="Cerrar panel"
              >
                <span className="h-1 w-10 rounded-full bg-gray-300" />
              </button>
              <div className="px-4 pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Planificacion de ruta</div>
                    <div className="text-xs text-gray-500">
                      {routeCustomers.length} paradas · {filteredCustomers.length} clientes disponibles
                    </div>
                  </div>
                  <button onClick={() => setShowDetails(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200" aria-label="Cerrar">
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 rounded-full bg-gray-100 p-1 text-sm font-medium">
                  <button
                    onClick={() => setMobileSheetTab('route')}
                    className={`rounded-full px-3 py-2 transition ${mobileSheetTab === 'route' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'}`}
                  >
                    Ruta
                  </button>
                  <button
                    onClick={() => setMobileSheetTab('clients')}
                    className={`rounded-full px-3 py-2 transition ${mobileSheetTab === 'clients' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600'}`}
                  >
                    Clientes
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto overscroll-contain px-4 pb-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-xs text-gray-500">Paradas</div>
                    <div className="font-semibold">{routeCustomers.length}</div>
                  </div>
                  {(mapProvider !== 'leaflet' || totalDistance > 0) && (
                    <div className="bg-blue-50 rounded-lg p-2">
                      <div className="text-xs text-blue-700">Distancia</div>
                      <div className="font-semibold text-blue-700">{formatKm(totalDistance)}</div>
                    </div>
                  )}
                  {mapProvider !== 'leaflet' && (
                    <div className="bg-green-50 rounded-lg p-2">
                      <div className="text-xs text-green-700">Tiempo</div>
                      <div className="font-semibold text-green-700">{Math.floor(totalDuration / 60)}h {Math.round(totalDuration % 60)}min</div>
                    </div>
                  )}
                </div>
                {routeCustomers.length > 0 && (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm">
                    <span className="min-w-0 text-blue-800">MINI → primera visita</span>
                    <span className="shrink-0 font-semibold text-blue-700">
                      {firstLegRoute?.customerId === routeCustomers[0]?.id && firstLegRoute.loading
                        ? 'Calculando…'
                        : firstLegRoute?.customerId === routeCustomers[0]?.id && firstLegRoute.result
                          ? `${formatRouteDistance(firstLegRoute.result.distanceKm)} · ${formatRouteDuration(firstLegRoute.result.durationMinutes)}`
                          : routeDistances.userLocation
                            ? 'No disponible'
                            : 'Activa ubicación'}
                    </span>
                  </div>
                )}
                {mobileSheetTab === 'route' ? (
                  <>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button onClick={reorderRouteByCurrentLocation} disabled={routeCustomers.length < 2} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-purple-600 px-3 py-2 text-sm text-white disabled:opacity-50">
                        <Route className="w-4 h-4 mr-1" />
                        <span>Optimizar</span>
                      </button>
                      <button onClick={startNavigation} disabled={routeCustomers.length === 0} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">
                        <ExternalLink className="w-4 h-4 mr-1" />
                        <span>Navegar</span>
                      </button>
                      <button onClick={() => setShowSaveModal(true)} disabled={routeCustomers.length === 0} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 disabled:opacity-50">
                        <Plus className="w-4 h-4 mr-1" />
                        <span>Guardar</span>
                      </button>
                      <button onClick={() => setShowLoadModal(true)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                        <Download className="w-4 h-4 mr-1" />
                        <span>Cargar</span>
                      </button>
                    </div>
                    <div className="mt-4 space-y-2">
                      {routeCustomers.length === 0 ? (
                        <div className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                          Agrega clientes para crear una ruta.
                        </div>
                      ) : (
                        routeCustomers.map((customer, index) => {
                          const stopDist = routeDistances.stops.find(s => s.id === customer.id)
                          return (
                            <div key={customer.id} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
                              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
                                {index + 1}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-gray-900">{customer.name}</div>
                                <div className="truncate text-xs text-gray-500">{customer.company}</div>
                                <div className="mt-1 text-xs text-blue-600">
                                  {index === 0
                                    ? (firstLegRoute?.customerId === customer.id && firstLegRoute.result
                                      ? `Desde el MINI: ${formatRouteDistance(firstLegRoute.result.distanceKm)} · ${formatRouteDuration(firstLegRoute.result.durationMinutes)}`
                                      : stopDist?.distanceFromUserKm != null ? `Desde mi ubicación: ${formatDistanceKm(stopDist.distanceFromUserKm)}` : 'Activa Mi ubicación para calcular')
                                    : `Desde anterior: ${formatDistanceKm(stopDist?.distanceFromPreviousStopKm)}`}
                                </div>
                              </div>
                              <div className="flex flex-shrink-0 items-center gap-1">
                                <button onClick={() => moveUp(index)} disabled={index === 0} className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-600 disabled:opacity-30" aria-label="Subir">
                                  <ArrowUp className="h-4 w-4" />
                                </button>
                                <button onClick={() => removeFromRoute(customer.id)} className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600" aria-label="Quitar">
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </>
                ) : (
                  <div className="mt-4 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={selectedProvince}
                        onChange={(e) => {
                          setSelectedProvince(e.target.value)
                          setSelectedCity('')
                        }}
                        className="min-h-11 rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Provincias</option>
                        {provinces.map(province => (
                          <option key={province} value={province}>{province}</option>
                        ))}
                      </select>
                      <select
                        value={selectedCity}
                        onChange={(e) => setSelectedCity(e.target.value)}
                        className="min-h-11 rounded-lg border border-gray-300 px-3 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Ciudades</option>
                        {getFilteredCities().map(city => (
                          <option key={city} value={city}>{city}</option>
                        ))}
                      </select>
                    </div>
                    {filteredCustomers.length === 0 ? (
                      <div className="rounded-lg bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                        No hay clientes disponibles.
                      </div>
                    ) : (
                      filteredCustomers.slice(0, 80).map((customer) => (
                        <div key={customer.id} className="flex items-start gap-3 rounded-lg border border-gray-100 bg-white p-3 shadow-sm">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-gray-900">{customer.name}</div>
                            <div className="truncate text-xs text-gray-500">{customer.company}</div>
                            <div className="mt-1 truncate text-xs text-gray-500">
                              {[displayCity(customer), displayProvince(customer)].filter(Boolean).join(', ')}
                            </div>
                          </div>
                          {(customer.phone || (customer as any).mobile_phone) && (
                            <a
                              href={telHref(customer.phone || (customer as any).mobile_phone)}
                              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600"
                              aria-label="Llamar"
                            >
                              <Phone className="h-4 w-4" />
                            </a>
                          )}
                          <button
                            onClick={() => {
                              addCustomerToRoute(customer)
                              setMobileSheetTab('route')
                            }}
                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"
                            aria-label="Agregar a ruta"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal para guardar ruta */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Guardar Ruta</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nombre de la ruta</label>
                <input
                  type="text"
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  placeholder="Ej: Ruta Algeciras Mañana"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="text-sm text-gray-600">
                <p>Esta ruta incluye:</p>
                <ul className="list-disc list-inside mt-1">
                  <li>{routeCustomers.length} paradas</li>
                  <li>Fecha: {routeDate || 'No especificada'}</li>
                  <li>Hora: {routeTime || 'No especificada'}</li>
                  <li>Distancia: {formatKm(totalDistance)}</li>
                </ul>
              </div>
              {!!existingRouteSameName && (!editingRouteId || editingRouteId !== existingRouteSameName.id) && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                  Ya existe una ruta con este nombre. Puedes <span className="font-semibold">Actualizar Ruta</span> para sobrescribirla
                  o <span className="font-semibold">Guardar Como Nueva</span> para crear una copia.
                </div>
              )}
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              {(editingRouteId || existingRouteSameName) ? (
                <>
                  <button
                    onClick={() => handleSaveRoute(editingRouteId || (existingRouteSameName as any)?.id)}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Actualizar Ruta
                  </button>
                  <button
                    onClick={() => handleSaveAsNew()}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Guardar Como Nueva
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleSaveRoute()}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Guardar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal para cargar ruta */}
      {showLoadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 max-w-2xl w-full max-h-[85vh] sm:max-h-[80vh] overflow-y-auto">
            <div className="flex flex-col gap-4 mb-4 sm:mb-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg sm:text-xl font-semibold text-gray-900">Rutas Guardadas</h3>
                <button
                  onClick={() => setShowLoadModal(false)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              {/* Province and City filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
                  <select
                    value={savedRoutesProvince}
                    onChange={(e) => {
                      setSavedRoutesProvince(e.target.value)
                      setSavedRoutesCity('')
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="">Todas las Provincias</option>
                    <option value="Cádiz">Cádiz</option>
                    <option value="Huelva">Huelva</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                  <select
                    value={savedRoutesCity}
                    onChange={(e) => setSavedRoutesCity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  >
                    <option value="">Todas las Ciudades</option>
                    {savedRoutesProvince === 'Cádiz' && [
                      'Cádiz', 'Jerez de la Frontera', 'Algeciras', 'San Fernando', 'El Puerto de Santa María',
                      'Chiclana de la Frontera', 'Sanlúcar de Barrameda', 'La Línea de la Concepción',
                      'Puerto Real', 'Rota', 'Barbate', 'Los Barrios', 'Medina-Sidonia', 'Conil de la Frontera',
                      'Tarifa', 'Ubrique', 'Arcos de la Frontera', 'Olvera', 'Villamartín', 'Bornos',
                      'El Gastor', 'Algodonales', 'Zahara', 'Grazalema', 'Villaluenga del Rosario',
                      'Benaocaz', 'Prado del Rey', 'Setenil de las Bodegas', 'Alcalá del Valle',
                      'Torre Alháquime', 'Espera', 'Puerto Serrano', 'Algar', 'San José del Valle'
                    ].map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                    {savedRoutesProvince === 'Huelva' && [
                      'Huelva', 'Lepe', 'Almonte', 'Ayamonte', 'Moguer', 'Isla Cristina', 'Valverde del Camino',
                      'Cartaya', 'Punta Umbría', 'Bollullos Par del Condado', 'La Palma del Condado',
                      'Aljaraque', 'San Juan del Puerto', 'Trigueros', 'Gibraleón', 'Palos de la Frontera',
                      'Rociana del Condado', 'Bonares', 'Lucena del Puerto', 'Villanueva de los Castillejos',
                      'Beas', 'Niebla', 'Calañas', 'El Cerro de Andévalo', 'Puebla de Guzmán',
                      'Zalamea la Real', 'Minas de Riotinto', 'Nerva', 'El Campillo', 'Berrocal',
                      'Campofrío', 'La Granada de Río-Tinto', 'Alosno', 'El Granado', 'Sanlúcar de Guadiana',
                      'Villanueva de las Cruces', 'San Bartolomé de la Torre', 'Villablanca', 'San Silvestre de Guzmán',
                      'Paymogo', 'Rosal de la Frontera', 'Aroche', 'Cortegana', 'Jabugo', 'Galaroza',
                      'Fuenteheridos', 'Castaño del Robledo', 'Los Marines', 'Valdelarco', 'Corteconcepción',
                      'Hinojales', 'Cumbres de San Bartolomé', 'Cumbres Mayores', 'Encinasola', 'Cumbres de Enmedio',
                      'La Nava', 'Arroyomolinos de León', 'Cañaveral de León', 'Fregenal de la Sierra', 'Bodonal de la Sierra',
                      'Segura de León', 'Fuentes de León', 'Monesterio', 'Cabeza la Vaca', 'Oliva de la Frontera',
                      'Valencia del Ventoso', 'Zahínos', 'Higuera la Real', 'La Codosera', 'Alconchel',
                      'Cheles', 'Táliga', 'Valuengo', 'Olivenza', 'Barcarrota', 'Salvaleón', 'Salvatierra de los Barros'
                    ].map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                    {savedRoutesProvince === '' && savedRoutes.length > 0 && [
                      ...new Set(savedRoutes.flatMap(route => 
                        route.customers?.map((c: any) => displayCity(c)).filter((city: string) => city)
                      ))
                    ].sort().map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            {/* Rutas Guardadas */}
            <div className="mb-6">
              <h4 className="text-md font-medium text-gray-800 mb-3">Rutas Guardadas</h4>
{(() => {
                // Filter saved routes by province and city
                const filteredRoutes = savedRoutes.filter(route => {
                  if (!savedRoutesProvince && !savedRoutesCity) return true
                  
                  const routeProvinces = route.customers?.map((c: any) => displayProvince(c)).filter((p: string) => p) || []
                  const routeCities = route.customers?.map((c: any) => displayCity(c)).filter((c: string) => c) || []
                  
                  const matchesProvince = !savedRoutesProvince || routeProvinces.includes(savedRoutesProvince)
                  const matchesCity = !savedRoutesCity || routeCities.includes(savedRoutesCity)
                  
                  return matchesProvince && matchesCity
                })
                
                if (filteredRoutes.length === 0) {
                  return (
                    <div className="text-center py-4">
                      <Route className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600 text-sm">
                        {savedRoutes.length === 0 ? 'No hay rutas guardadas' : 'No hay rutas que coincidan con los filtros'}
                      </p>
                    </div>
                  )
                }
                
                return (
                  <div className="space-y-3 sm:space-y-4">
                    {filteredRoutes.map((savedRoute) => (
                    <div 
                      key={savedRoute.id} 
                      className={`border rounded-lg p-3 sm:p-4 ${
                        savedRoute.completed 
                          ? 'border-green-200 bg-green-50' 
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      {/* Mobile-first responsive layout */}
                      <div className="space-y-3">
                        {/* Title and status */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className={`font-medium text-base sm:text-lg truncate ${
                              savedRoute.completed ? 'text-green-800' : 'text-gray-900'
                            }`}>
                              {savedRoute.name}
                            </h4>
                            {savedRoute.completed && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 mt-1">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Completada
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Route details - mobile optimized */}
                        <div className={`text-xs sm:text-sm space-y-1 ${
                          savedRoute.completed ? 'text-green-700' : 'text-gray-600'
                        }`}>
                          <div className="flex flex-col sm:flex-row sm:space-x-4">
                            <span className="font-medium">Fecha: {savedRoute.date || 'No especificada'}</span>
                            <span className="font-medium">Hora: {savedRoute.time || 'No especificada'}</span>
                          </div>
                          <div>
                            <span className="font-medium">
                              {savedRoute.customers.length} paradas • {formatKm(savedRoute.totalDistance)}
                              {mapProvider !== 'leaflet' && (
                                <> • {Math.floor(savedRoute.totalDuration / 60)}h {Math.round(savedRoute.totalDuration % 60)}min</>
                              )}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            Guardada: {new Date(savedRoute.createdAt).toLocaleDateString('es-ES')}
                            {savedRoute.completed && savedRoute.completedAt && (
                              <span className="block sm:inline sm:ml-2">
                                Completada: {new Date(savedRoute.completedAt).toLocaleDateString('es-ES')}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Action buttons - mobile optimized */}
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
                          <button
                            onClick={() => loadRoute(savedRoute)}
                            className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Cargar
                          </button>
                          <button
                            onClick={() => completeRoute(savedRoute)}
                            disabled={savedRoute.completed}
                            className={`flex-1 sm:flex-none px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors ${
                              savedRoute.completed
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-green-600 hover:bg-green-700'
                            }`}
                          >
                            {savedRoute.completed ? 'Ya Completada' : 'Completar'}
                          </button>
                          <button
                            onClick={() => deleteSavedRoute(savedRoute.id)}
                            className="flex-1 sm:flex-none px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
