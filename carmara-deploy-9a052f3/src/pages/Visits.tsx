import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, Customer } from '../lib/supabase'
import { translations } from '../lib/translations'
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
  FileDown
} from 'lucide-react'

// Leaflet (OpenStreetMap) imports for zero-Google-cost rendering
// Note: remember to `npm i leaflet @types/leaflet` in the project
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface RouteCustomer extends Customer {
  order: number
  distance?: number // km
  duration?: number // minutes
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
  const [loadingSavedRoutes, setLoadingSavedRoutes] = useState(false)
  // Filtering states for saved routes modal
  const [savedRoutesProvince, setSavedRoutesProvince] = useState('')
  const [savedRoutesCity, setSavedRoutesCity] = useState('')
  // Edit mode for save functionality
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null)
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
  // Google Maps Embed API key for frontend map visualization
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  // Map provider switch: 'google' or 'leaflet' (default to 'leaflet')
  const mapProvider: 'google' | 'leaflet' = (import.meta as any).env?.VITE_MAP_PROVIDER === 'google' ? 'google' : 'leaflet'
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

          // Basic OSM tile layer (note: for production consider a tile provider with SLA)
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19,
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
          marker.addTo(map).bindPopup(popupHtml)
          marker.on('click', () => {
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
        try {
          const bounds = L.latLngBounds(latlngs as any)
          map.fitBounds(bounds, { padding: [16, 16] })
        } catch {}

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
  }, [mapProvider, routeCustomers, leafletReset])

  // 地圖全屏切換（僅地圖容器）
  const toggleMapFullscreen = () => {
    setLeafletFullscreen(v => !v)
    setTimeout(() => { try { leafletMapInstanceRef.current?.invalidateSize?.() } catch {} }, 50)
    setTimeout(() => { try { leafletMapInstanceRef.current?.invalidateSize?.() } catch {} }, 250)
  }

  // PDF 獨立導出（非截圖方式）
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

      // 根據停靠點數量自適應佈局
      const stopCount = routeCustomers.length
      // 如果超過8個停靠點，使用更緊湊的佈局
      const isCompactMode = stopCount > 8
      const fontSize = isCompactMode ? '8.5pt' : '10pt'
      const itemMargin = isCompactMode ? '2.5mm' : '4mm'
      const itemPadding = isCompactMode ? '1.5mm' : '2mm'
      const headerMargin = isCompactMode ? '6mm' : '10mm'
      const summaryMargin = isCompactMode ? '3mm' : '5mm'

      // 創建 PDF 內容
      const pdfContent = `
        <div style="width: 297mm; height: 210mm; padding: 12mm; font-family: Arial, sans-serif; display: flex;">
          <!-- 左側：客戶詳細列表 -->
          <div style="width: 45%; padding-right: 8mm;">
            <h2 style="margin: 0 0 ${headerMargin} 0; color: #1f2937; font-size: ${isCompactMode ? '16pt' : '18pt'};">Ruta Planificada</h2>
            <div style="margin-bottom: ${summaryMargin}; font-size: ${isCompactMode ? '9pt' : '10pt'};">
              <strong>Paradas:</strong> ${stopCount}<br>
              ${totalDistance > 0 ? `<strong>Distancia total:</strong> ${totalDistance.toFixed(1)} km<br>` : ''}
              ${totalDuration > 0 ? `<strong>Tiempo total:</strong> ${Math.round(totalDuration)} min<br>` : ''}
              <strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}
            </div>
            <div style="font-size: ${fontSize}; line-height: 1.2; max-height: ${isCompactMode ? '168mm' : '160mm'}; overflow: hidden;">
              ${routeCustomers.map((customer, index) => `
                <div style="margin-bottom: ${itemMargin}; padding-bottom: ${itemPadding}; border-bottom: 1px solid #e5e7eb; page-break-inside: avoid;">
                  <div style="font-weight: bold; color: #2563eb; margin-bottom: 0.8mm;">
                    ${index + 1}. ${customer.name}
                  </div>
                  <div style="color: #6b7280; margin-bottom: 0.8mm; font-size: ${isCompactMode ? '8pt' : '9pt'};">${customer.company || '—'}</div>
                  <div style="margin-bottom: 0.8mm; font-size: ${isCompactMode ? '8pt' : '9pt'};">${getAddress(customer)}</div>
                  ${customer.phone || (customer as any).mobile_phone ? 
                    `<div style="color: #059669; font-size: ${isCompactMode ? '7.5pt' : '9pt'};">📞 ${customer.phone || (customer as any).mobile_phone}</div>` : ''}
                  ${customer.distance && customer.duration ? 
                    `<div style="color: #7c3aed; font-size: ${isCompactMode ? '7.5pt' : '8.5pt'};">
                      🚗 ${customer.distance.toFixed(1)} km • ⏱️ ${Math.round(customer.duration)} min
                    </div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
          
          <!-- 右側：地圖區域 -->
          <div style="width: 55%; position: relative;">
            <div style="width: 100%; height: 186mm; border: 2px solid #d1d5db; border-radius: 8px; background: #f9fafb; display: flex; align-items: center; justify-content: center;">
              <div style="text-align: center; color: #6b7280;">
                <div style="font-size: 48pt; margin-bottom: 5mm;">🗺️</div>
                <div style="font-size: 14pt;">Mapa de la Ruta</div>
                <div style="font-size: 10pt; margin-top: 2mm;">
                  ${stopCount} paradas planificadas
                </div>
                <div style="font-size: 9pt; margin-top: 3mm; color: #9ca3af;">
                  ${totalDistance > 0 ? `${totalDistance.toFixed(1)} km` : ''} 
                  ${totalDuration > 0 ? ` • ${Math.round(totalDuration)} min` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      `
      
      const element = document.createElement('div')
      element.innerHTML = pdfContent
      
      const opt = {
        margin: 0,
        filename: `Ruta_${routeName || 'Planificada'}_${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
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
      setIsDocFullscreen(!!document.fullscreenElement)
      try { leafletMapInstanceRef.current?.invalidateSize?.() } catch {}
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

      const icon = L.divIcon({
        className: '',
        html: "<div style='width:18px;height:18px;border-radius:9px;background:#2563EB;box-shadow:0 1px 2px rgba(0,0,0,0.35)'></div>",
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      })
      const marker = L.marker(pos, { icon })
      marker.addTo(map).bindPopup('Mi Ubicación')
      leafletMyLocationMarkerRef.current = marker

      try { map.flyTo(pos, Math.max(map.getZoom(), 13), { duration: 0.8 }) } catch {}
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
  const migrateLocalRoutesToDatabase = async () => {
    if (!user?.id) return

    try {
      const localRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
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
      
      // Only clear localStorage if ALL routes were successfully migrated
      if (successCount > 0 && failCount === 0) {
        localStorage.removeItem('savedRoutes')
        console.log('[RoutesMigration] Migration completed successfully, localStorage cleared')
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
      
      // Try to load from database first for cross-device synchronization
      if (user?.id) {
        try {
          const { data, error } = await supabase
            .from('saved_routes')
            .select('*')
            .eq('created_by', user.id)
            .order('created_at', { ascending: false })
          
          if (!error && data) {
            dbRoutes = data.map((route: any) => ({
              id: route.id,
              name: route.name,
              date: route.route_date,
              time: route.route_time,
              customers: route.customers,
              totalDistance: route.total_distance,
              totalDuration: route.total_duration,
              createdAt: route.created_at
            }))
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
      
      // If we have local routes but no database routes, try migration
      if (localRoutes.length > 0 && dbRoutes.length === 0 && user?.id) {
        console.log('[RouteLoading] Found local routes, attempting migration...')
        const migrationSuccess = await migrateLocalRoutesToDatabase()
        
        if (migrationSuccess) {
          // Reload from database after successful migration
          try {
            const { data } = await supabase
              .from('saved_routes')
              .select('*')
              .eq('created_by', user.id)
              .order('created_at', { ascending: false })
            
            if (data) {
              dbRoutes = data
              console.log('[RouteLoading] Reloaded', dbRoutes.length, 'routes after migration')
            }
          } catch (reloadError) {
            console.warn('[RouteLoading] Failed to reload after migration:', reloadError)
          }
        }
      }
      
      // Use database routes if available, otherwise fall back to localStorage
      const finalRoutes = dbRoutes.length > 0 ? dbRoutes : localRoutes
      setSavedRoutes(finalRoutes)
      console.log('[RouteLoading] Using', finalRoutes.length, 'routes from', dbRoutes.length > 0 ? 'database' : 'localStorage')
      
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
        const province = (customer as any).province || ''
        if (province === city) {
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
      'Cartaya', 'Castaño del Robledo', 'El Cerro de Andévalo', 'Corteconcepción', 'Cortegana',
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
      const customerCityRaw = String(customer.city || '').trim()
      // 僅當選擇了具體城市時，嚴格匹配該城市名稱，允許與省同名的城市（與 Customers.tsx 一致）
      const matchesCity = !selectedCity || (
        (!!customerCity && customerCity.toLowerCase() === selectedCity.toLowerCase()) ||
        (!!customerCityRaw && customerCityRaw.toLowerCase() === selectedCity.toLowerCase())
      )

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
        const updatedRoute = [...route]
        for (let i = 0; i < route.length - 1; i++) {
          const a = leafletCoordsRef.current[route[i].id]
          const b = leafletCoordsRef.current[route[i + 1].id]
          if (a && b) {
            const segKm = haversineDistance(a.lat, a.lng, b.lat, b.lng)
            totalKm += segKm
            if (i + 1 < updatedRoute.length) {
              updatedRoute[i + 1].distance = Number(segKm.toFixed(2))
              updatedRoute[i + 1].duration = undefined as any
            }
          }
        }
        setTotalDistance(Number(totalKm.toFixed(1)))
        setTotalDuration(0)
        // Mark calculation snapshot
        lastCalcKeyRef.current = routeKey
        lastComputedDistanceRef.current = Number(totalKm.toFixed(1))
        setRouteCustomers(updatedRoute)
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
      
      // Save to localStorage as backup/fallback
      const existingRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
      let updatedRoutes
      
      if (isUpdating) {
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
        // Save completed visits to localStorage for dashboard
        const existingVisits = JSON.parse(localStorage.getItem('completedVisits') || '[]')
        const updatedVisits = [...existingVisits, ...completedVisits]
        localStorage.setItem('completedVisits', JSON.stringify(updatedVisits))
        
        // Mark route as completed and update saved routes
        const updatedRouteData = {
          ...routeData,
          completed: true,
          completedAt: new Date().toISOString(),
          completedVisits: completedVisits
        }
        
        // Update the route in savedRoutes
        const existingRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
        const updatedRoutes = existingRoutes.map((route: any) => 
          route.id === routeData.id ? updatedRouteData : route
        )
        localStorage.setItem('savedRoutes', JSON.stringify(updatedRoutes))
        
        // Refresh saved routes list
        await loadSavedRoutes()
        
        console.log('Completed visits:', completedVisits)
        
        alert(`✅ Ruta "${routeName}" marcada como completada!\n\n${visitCount} visitas registradas en el Panel de Control.`)
        
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
      
      // Fallback to localStorage
      const existingRoutes = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
      const routeToDelete = existingRoutes.find((route: any) => route.id === routeId)
      
      // If route was completed, remove its visits from completed visits
      if (routeToDelete && routeToDelete.completed && routeToDelete.completedVisits) {
        const existingVisits = JSON.parse(localStorage.getItem('completedVisits') || '[]')
        const updatedVisits = existingVisits.filter((visit: any) => visit.route_id !== routeId)
        localStorage.setItem('completedVisits', JSON.stringify(updatedVisits))
      }
      
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
    <div ref={fullContainerRef}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 print-hide">
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
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
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
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6">
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
        <div className="lg:col-span-1 space-y-6">
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
                    <p className="text-sm text-gray-600">{routeCustomers.length} paradas</p>
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
                          {customer.distance && customer.duration && (
                            <div className="flex items-center mt-1 space-x-2 text-xs text-gray-500">
                              <Car className="w-3 h-3" />
                              <span>{customer.distance.toFixed(1)} km</span>
                              <Clock className="w-3 h-3" />
                              <span>{Math.round(customer.duration)} min</span>
                            </div>
                          )}
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
                  {(mapProvider !== 'leaflet' || totalDistance > 0) && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Distancia total:</span>
                      <span className="font-medium text-blue-600">{totalDistance.toFixed(1)} km</span>
                    </div>
                  )}
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
                      {routeCustomers.map((customer, index) => (
                        <div key={customer.id} className="flex justify-between text-xs">
                          <span className="text-gray-600">{index + 1}. {customer.name}</span>
                          <span className="text-gray-500">
                            {mapProvider === 'leaflet'
                              ? (index === 0
                                  ? 'Origen'
                                  : (typeof customer.distance === 'number' ? `${customer.distance.toFixed(1)}km` : '—'))
                              : (customer.distance && typeof customer.duration === 'number'
                                  ? `${customer.distance.toFixed(1)}km, ${Math.round(customer.duration)}min`
                                  : (index === 0 ? 'Origen' : 'Calculando...'))
                            }
                          </span>
                        </div>
                      ))}
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
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print-card">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Mapa de la Ruta</h2>
                <p className="text-sm text-gray-600">Visualización de la ruta planificada</p>
              </div>
              {routeCustomers.length > 0 && (
                <div className="px-4 py-3 border-b border-gray-100 bg-white/60">
                  <div className="flex items-center gap-2 overflow-x-auto">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                      Paradas: <span className="ml-1 font-medium">{routeCustomers.length}</span>
                    </span>
                    {(mapProvider !== 'leaflet' || totalDistance > 0) && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700">
                        Distancia: <span className="ml-1 font-medium">{totalDistance.toFixed(1)} km</span>
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
              <div className={`${leafletFullscreen ? 'fixed inset-0 z-[1200] bg-white' : 'h-[800px]'} relative`}>
              {routeCustomers.length === 0 ? (
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
                    <div className="absolute z-[1000] right-3 top-3 flex flex-col sm:flex-row gap-2 print-hide">
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
                    <div ref={mapRef} className="w-full h-full rounded-lg border print-map" />
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
                    <div ref={mapRef} className="w-full h-full rounded-lg border" />
                    {/* My Location button on map (Google only) */}
                    <button
                      onClick={getCurrentLocation}
                      className="absolute right-4 top-16 z-10 bg-white rounded-lg shadow-md p-2 hover:bg-gray-50"
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
                      className="absolute right-4 top-28 z-10 bg-white rounded-lg shadow-md p-2 hover:bg-gray-50"
                      title="Refrescar Mapa"
                    >
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
          </div>
        </div>
      </div>

      {/* Bottom sheet with route details and actions (mobile-first) */}
      {showDetails && (
        <div className="fixed inset-x-0 bottom-0 z-40">
          <div className="mx-auto max-w-6xl px-4 pb-[env(safe-area-inset-bottom)]">
            <div ref={bottomSheetRef} className="bg-white rounded-t-2xl shadow-xl border border-gray-200">
              <div className="px-4 py-2 border-b flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900">Ruta Actual</span>
                <button onClick={() => setShowDetails(false)} className="p-1 rounded hover:bg-gray-100" aria-label="Cerrar">
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
              <div className="p-4">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <div className="text-xs text-gray-500">Paradas</div>
                    <div className="font-semibold">{routeCustomers.length}</div>
                  </div>
                  {(mapProvider !== 'leaflet' || totalDistance > 0) && (
                    <div className="bg-blue-50 rounded-lg p-2">
                      <div className="text-xs text-blue-700">Distancia</div>
                      <div className="font-semibold text-blue-700">{totalDistance.toFixed(1)} km</div>
                    </div>
                  )}
                  {mapProvider !== 'leaflet' && (
                    <div className="bg-green-50 rounded-lg p-2">
                      <div className="text-xs text-green-700">Tiempo</div>
                      <div className="font-semibold text-green-700">{Math.floor(totalDuration / 60)}h {Math.round(totalDuration % 60)}min</div>
                    </div>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={reorderRouteByCurrentLocation} className="inline-flex items-center justify-center px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                    <Route className="w-4 h-4 mr-1" />
                    <span>Optimizar por mi ubicación</span>
                  </button>
                  <button onClick={startNavigation} className="inline-flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    <ExternalLink className="w-4 h-4 mr-1" />
                    <span>Navegar</span>
                  </button>
                </div>
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
                  <li>Distancia: {totalDistance.toFixed(1)} km</li>
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
                              {savedRoute.customers.length} paradas • {savedRoute.totalDistance.toFixed(1)} km
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
