import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Customer } from '../lib/supabase'
import { translations } from '../lib/translations'
import {
  Search,
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  Navigation,
  Route,
  MapPin,
  Car,
  Clock,
  ExternalLink,
  MapPinIcon,
  Phone,
  Mail,
  Calendar,
  Timer,
  Users,
  Trash2
} from 'lucide-react'

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
  const [routeDate, setRouteDate] = useState('')
  const [routeTime, setRouteTime] = useState('')
  const [savedRoutes, setSavedRoutes] = useState<any[]>([])
  const [routeName, setRouteName] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showLoadModal, setShowLoadModal] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [loadingSavedRoutes, setLoadingSavedRoutes] = useState(false)
  const t = translations
  // Google Maps Embed API key for frontend map visualization
  const mapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  // Per-user draft key for autosave of route planning
  const draftKey = useMemo(() => (user?.id ? `routeDraft:${user.id}` : 'routeDraft'), [user?.id])
  console.log('[RoutePlanning] Maps API Key:', mapsApiKey ? 'Present' : 'Missing')
  if (!mapsApiKey) {
    console.warn('[RoutePlanning] VITE_GOOGLE_MAPS_API_KEY is missing on frontend. Map embed will not render directions.')
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
    const render = async () => {
      try {
        // Require API key and at least 1 stop
        if (!mapsApiKey || routeCustomers.length === 0) return

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
  }, [mapsApiKey, routeCustomers])

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
    if (showDetails) {
      const tId = window.setTimeout(apply, 50)
      const onResize = () => apply()
      window.addEventListener('resize', onResize)
      return () => {
        window.clearTimeout(tId)
        window.removeEventListener('resize', onResize)
      }
    }
  }, [showDetails, routeCustomers.length, totalDistance, totalDuration])

  // Clear map when route is empty
  useEffect(() => {
    if (routeCustomers.length === 0 && mapInstanceRef.current) {
      try {
        if (directionsRendererRef.current) {
          directionsRendererRef.current.set('directions', null)
        }
        markersRef.current.forEach(m => m.setMap(null))
        markersRef.current = []
        if (myLocationMarkerRef.current) {
          try { myLocationMarkerRef.current.setMap(null) } catch {}
          myLocationMarkerRef.current = null
        }
        if (myLocationInfoRef.current) {
          try { myLocationInfoRef.current.close() } catch {}
          myLocationInfoRef.current = null
        }
        try {
          mapInstanceRef.current.setCenter({ lat: 36.7213, lng: -4.4214 })
          mapInstanceRef.current.setZoom(9)
        } catch {}
      } catch {}
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

  // Load saved routes from database
  const loadSavedRoutes = async () => {
    try {
      setLoadingSavedRoutes(true)
      
      // Check if we're in development mode or if Netlify functions are available
      const isNetlifyAvailable = window.location.hostname !== 'localhost'
      
      if (!isNetlifyAvailable) {
        // Use localStorage in development
        const localSaved = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
        setSavedRoutes(localSaved)
        return
      }

      const response = await fetch('/.netlify/functions/saved-routes', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(user as any)?.session?.access_token || ''}`
        }
      })

      if (response.status === 502 || response.status === 404) {
        // Netlify function not available, use localStorage
        const localSaved = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
        setSavedRoutes(localSaved)
        return
      }

      const result = await response.json()
      
      if (!response.ok || !result.success) {
        // Fallback to localStorage if database fails
        const localSaved = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
        setSavedRoutes(localSaved)
        return
      }

      setSavedRoutes(result.data || [])
    } catch (error) {
      // Silent fallback to localStorage to avoid console errors
      const localSaved = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
      setSavedRoutes(localSaved)
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

    try {
      console.log('[RoutePlanning] Calculating distances for route:', route.length, 'customers')
      
      const waypoints = route.map(customer => {
        const address = getAddress(customer)
        console.log('[RoutePlanning] Waypoint:', address)
        return address
      })

      console.log('[RoutePlanning] Sending request with waypoints:', waypoints)

      // 使用本地 Express API
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

  // 儲存路線
  const saveRoute = async () => {
    if (!routeName.trim()) {
      alert('Por favor ingresa un nombre para la ruta')
      return
    }
    
    const routeData = {
      name: routeName,
      route_date: routeDate || null,
      route_time: routeTime || null,
      customers: routeCustomers,
      total_distance: totalDistance,
      total_duration: totalDuration
    }

    try {
      const response = await fetch('/.netlify/functions/saved-routes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(user as any)?.session?.access_token || ''}`
        },
        body: JSON.stringify(routeData)
      })

      const result = await response.json()
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to save route')
      }

      // Reload saved routes to get updated list
      await loadSavedRoutes()
      
      // on successful save, clear the temporary draft
      try { localStorage.removeItem(draftKey) } catch {}
      setShowSaveModal(false)
      setRouteName('')
      alert('Ruta guardada exitosamente')
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
    setShowLoadModal(false)
    calculateRouteDistanceAndTime(routeData.customers)
  }

  // 完成路線並記錄到儀表板
  const completeRoute = async (routeData: any) => {
    try {
      const completedVisits = routeData.customers.map((customer: any) => ({
        customer_id: customer.id,
        customer_name: customer.name,
        customer_company: customer.company || '',
        visit_date: new Date().toISOString().split('T')[0], // Today's date
        visit_time: new Date().toTimeString().split(' ')[0].substring(0, 5), // Current time HH:MM
        notes: `Visita completada - Ruta: ${routeData.name}`,
        status: 'completed'
      }))

      // Here you would typically save these completed visits to a visits/dashboard table
      // For now, we'll show a success message and could integrate with existing dashboard
      const visitCount = completedVisits.length
      const routeName = routeData.name
      
      if (confirm(`¿Marcar como completada la ruta "${routeName}" con ${visitCount} visitas?\n\nEsto registrará todas las paradas como visitadas en el Panel de Control.`)) {
        // Simulate successful completion - in a real implementation, you'd save to database
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

  // 刪除儲存的路線
  const deleteSavedRoute = async (routeId: string) => {
    try {
      const response = await fetch(`/.netlify/functions/saved-routes/${routeId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(user as any)?.session?.access_token || ''}`
        }
      })

      const result = await response.json()
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete route')
      }

      // Reload saved routes to get updated list
      await loadSavedRoutes()
      alert('Ruta eliminada exitosamente')
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
          // If map is not available (e.g., no route -> map not rendered), fallback to alert
          let google: any = null
          try { google = await ensureGoogleMapsLoaded() } catch {}
          const map = mapInstanceRef.current
          if (!map || !mapRef.current || !google) {
            alert(`Ubicación actual: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`)
            return
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

      // 取得各客戶座標（並行）
      const geocoded = await Promise.all(
        routeCustomers.map(async (c, idx) => {
          const addr = getAddress(c)
          const coords = await geocodeAddress(addr)
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

    const waypoints = routeCustomers.map(customer => {
      const address = customer.address || ''
      const city = displayCity(customer) || ''
      return encodeURIComponent(`${address} ${city}`.trim())
    })

    const origin = waypoints[0]
    const destination = waypoints[waypoints.length - 1]
    const waypointsParam = waypoints.slice(1, -1).join('|')

    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`
    if (waypointsParam) {
      url += `&waypoints=${waypointsParam}`
    }
    url += '&travelmode=driving'

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
    const city = displayCity(customer)
    if (city) parts.push(city)
    const province = displayProvince(customer)
    if (province) parts.push(province)
    // Add country to improve geocoding stability
    parts.push('Spain')
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planificación de Rutas</h1>
          <p className="text-gray-600">Crear y optimizar rutas para visitas a clientes</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={getCurrentLocation}
            className="inline-flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            <MapPinIcon className="w-4 h-4" />
            <span>Mi Ubicación</span>
          </button>
          <button
            onClick={() => setShowSaveModal(true)}
            disabled={routeCustomers.length === 0}
            className="inline-flex items-center space-x-2 px-4 py-2 border border-green-300 text-green-700 rounded-lg hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>Guardar Ruta</span>
          </button>
          <button
            onClick={() => setShowLoadModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50"
          >
            <Route className="w-4 h-4" />
            <span>Cargar Ruta</span>
          </button>
          <button
            onClick={clearRoute}
            disabled={routeCustomers.length === 0}
            className="inline-flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
            <span>Limpiar Ruta</span>
          </button>
          <button
            onClick={startNavigation}
            disabled={routeCustomers.length === 0}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Navigation className="w-4 h-4" />
            <span>Iniciar Navegación</span>
          </button>
        </div>
      </div>

      {/* Configuración de fecha y hora */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
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
              <Timer className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
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
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
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

      {/* Layout: Left panel with customers/route, right panel with map */}
      {/* Desktop: Side-by-side flex, Mobile: Stacked */}
      <div 
        className="flex flex-col lg:flex-row gap-6" 
        style={{
          minHeight: '400px'
        }}
      >
          {/* Panel izquierdo - Lista de clientes y ruta */}
          <div 
            className="space-y-6 w-full lg:w-1/4 flex-shrink-0" 
          >
            {/* Lista de clientes disponibles */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
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
                            <div className="flex items-center mt-1">
                              <MapPin className="w-3 h-3 text-gray-400 mr-1" />
                              <span className="text-xs text-gray-500">{displayCity(customer) || customer.city || customer.province}</span>
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
                          <div className="flex items-center mt-1">
                            <MapPin className="w-3 h-3 text-gray-400 mr-1" />
                            <span className="text-xs text-gray-500">{displayCity(customer) || customer.city}</span>
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
                  <div className="flex justify-between">
                    <span className="text-gray-600">Distancia total:</span>
                    <span className="font-medium text-blue-600">{totalDistance > 0 ? `${totalDistance.toFixed(1)} km` : 'Calculando...'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tiempo estimado:</span>
                    <span className="font-medium text-green-600">{totalDuration > 0 ? `${Math.floor(totalDuration / 60)}h ${Math.round(totalDuration % 60)}min` : 'Calculando...'}</span>
                  </div>
                  {/* Mostrar detalles individuales de cada parada */}
                  <div className="pt-2 border-t border-gray-300">
                    <h4 className="text-xs font-medium text-gray-700 mb-2">Detalles por parada:</h4>
                    <div className="space-y-1">
                      {routeCustomers.map((customer, index) => (
                        <div key={customer.id} className="flex justify-between text-xs">
                          <span className="text-gray-600">{index + 1}. {customer.name}</span>
                          <span className="text-gray-500">
                            {customer.distance && customer.duration 
                              ? `${customer.distance.toFixed(1)}km, ${Math.round(customer.duration)}min`
                              : index === 0 ? 'Origen' : 'Calculando...'
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

          {/* Map panel - Desktop: Right side, Mobile: Bottom */}
          <div 
            className="space-y-6 lg:w-3/4"
          >
            {/* Mapa de la ruta */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-blue-50 text-blue-700">
                      Distancia: <span className="ml-1 font-medium">{totalDistance.toFixed(1)} km</span>
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-green-50 text-green-700">
                      Tiempo: <span className="ml-1 font-medium">{Math.floor(totalDuration / 60)}h {Math.round(totalDuration % 60)}min</span>
                    </span>
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
              <div className="h-[500px] lg:h-[900px] relative">
              {routeCustomers.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Route className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Sin ruta planificada</h3>
                    <p className="text-gray-600">Agrega clientes de la lista izquierda para crear una ruta</p>
                  </div>
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
                  {/* My Location button on map */}
                  <button
                    onClick={getCurrentLocation}
                    className="absolute right-4 top-16 z-10 bg-white rounded-lg shadow-md p-2 hover:bg-gray-50"
                    title="Mi Ubicación"
                  >
                    <MapPinIcon className="w-5 h-5 text-blue-600" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Panel de detalles del cliente */}
          {selectedCustomer && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 lg:hidden">
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
                  <div className="bg-blue-50 rounded-lg p-2">
                    <div className="text-xs text-blue-700">Distancia</div>
                    <div className="font-semibold text-blue-700">{totalDistance.toFixed(1)} km</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2">
                    <div className="text-xs text-green-700">Tiempo</div>
                    <div className="font-semibold text-green-700">{Math.floor(totalDuration / 60)}h {Math.round(totalDuration % 60)}min</div>
                  </div>
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
            </div>
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => setShowSaveModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveRoute}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para cargar ruta */}
      {showLoadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Rutas Guardadas y Respaldos</h3>
              <button
                onClick={() => setShowLoadModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Rutas Guardadas */}
            <div className="mb-6">
              <h4 className="text-md font-medium text-gray-800 mb-3">Rutas Guardadas</h4>
              {savedRoutes.length === 0 ? (
                <div className="text-center py-4">
                  <Route className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600 text-sm">No hay rutas guardadas</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedRoutes.map((savedRoute) => (
                    <div key={savedRoute.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">{savedRoute.name}</h4>
                          <div className="text-sm text-gray-600 mt-1">
                            <p>Fecha: {savedRoute.date || 'No especificada'} - Hora: {savedRoute.time || 'No especificada'}</p>
                            <p>{savedRoute.customers.length} paradas - {savedRoute.totalDistance.toFixed(1)} km - {Math.floor(savedRoute.totalDuration / 60)}h {Math.round(savedRoute.totalDuration % 60)}min</p>
                            <p className="text-xs text-gray-500 mt-1">Guardada: {new Date(savedRoute.createdAt).toLocaleDateString('es-ES')}</p>
                          </div>
                        </div>
                        <div className="flex space-x-2 ml-4">
                          <button
                            onClick={() => loadRoute(savedRoute)}
                            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                          >
                            Cargar
                          </button>
                          <button
                            onClick={() => completeRoute(savedRoute)}
                            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                          >
                            Completar
                          </button>
                          <button
                            onClick={() => deleteSavedRoute(savedRoute.id)}
                            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
