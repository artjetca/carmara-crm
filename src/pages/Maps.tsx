import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, Customer } from '../lib/supabase'
import { translations } from '../lib/translations'
import {
  MapPin,
  Navigation,
  Search,
  Phone,
  Mail,
  ExternalLink,
  LocateFixed
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L, { LatLngExpression, Map as LeafletMap } from 'leaflet'

export default function Maps() {
  const { user } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [coordsById, setCoordsById] = useState<Record<string, { lat: number; lng: number }>>({})
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const t = translations
  const googleApiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  const nominatimEmail = (import.meta as any).env?.VITE_NOMINATIM_EMAIL as string | undefined

  useEffect(() => {
    loadCustomers()
    // Intentar obtener ubicación del usuario (opcional)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => undefined,
        { enableHighAccuracy: true, timeout: 5000 }
      )
    }
  }, [])

  const loadCustomers = async () => {
    try {
      setLoading(true)
      // Try backend proxy first (no RLS limits)
      try {
        const res = await fetch('/api/customers/all')
        if (res.ok) {
          const json = await res.json()
          if (json?.success && Array.isArray(json.data)) {
            setCustomers(json.data)
            return
          }
        }
      } catch (_) {
        // fallback to direct supabase below
      }

      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name')
      if (error) throw error
      setCustomers(data || [])
    } catch (error) {
      console.error('Error loading customers:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredCustomers = customers.filter(customer => {
    const q = searchTerm.toLowerCase()
    const matchesSearch = (
      customer.name?.toLowerCase().includes(q) ||
      customer.company?.toLowerCase().includes(q) ||
      customer.city?.toLowerCase().includes(q)
    )
    const matchesCity = !selectedCity || customer.city === selectedCity
    return matchesSearch && matchesCity
  })

  const cities = Array.from(new Set([...translations.cities, ...customers.map(c => c.city).filter(Boolean)])).sort() as string[]

  const getAddress = (c: Customer) => {
    // 嘗試從備註提取 Ciudad 作為 municipio
    const fromNotes = (c.notes || '').match(/Ciudad:\s*([^\n]+)/i)
    const municipio = fromNotes ? fromNotes[1].trim() : ''
    const cityOrProvince = c.city || ''
    // 組合：地址 > 市/自治市(municipio) > 省/城市欄位 > España
    const parts = [c.address || '', municipio || cityOrProvince, 'España'].filter(Boolean)
    return parts.join(', ')
  }

  const openInGoogleMaps = (customer: Customer) => {
    const encodedAddress = encodeURIComponent(getAddress(customer))
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank')
  }

  const getDirections = (customer: Customer) => {
    const encodedAddress = encodeURIComponent(getAddress(customer))
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`, '_blank')
  }

  // Geocodificación con caché local para clientes sin coordenadas (Google primero si hay API KEY, si no Nominatim)
  const geocodeAddress = async (customer: Customer) => {
    const key = `geo:${getAddress(customer)}`
    const cached = localStorage.getItem(key)
    if (cached) {
      try {
        const { lat, lng } = JSON.parse(cached)
        setCoordsById(prev => ({ ...prev, [customer.id]: { lat, lng } }))
        return
      } catch {}
    }
    try {
      let lat: number | null = null
      let lng: number | null = null

      if (googleApiKey) {
        const gUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(getAddress(customer))}&key=${googleApiKey}&region=es` 
        const gRes = await fetch(gUrl)
        const gData = await gRes.json()
        if (gData?.results?.[0]?.geometry?.location) {
          lat = gData.results[0].geometry.location.lat
          lng = gData.results[0].geometry.location.lng
        }
      }

      if (lat === null || lng === null) {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=es&q=${encodeURIComponent(getAddress(customer))}` +
          (nominatimEmail ? `&email=${encodeURIComponent(nominatimEmail)}` : '')
        const res = await fetch(url, { headers: { 'Accept-Language': 'es' } })
        const data = await res.json()
        if (Array.isArray(data) && data[0]) {
          lat = parseFloat(data[0].lat)
          lng = parseFloat(data[0].lon)
        }
      }

      if (lat !== null && lng !== null) {
        localStorage.setItem(key, JSON.stringify({ lat, lng }))
        setCoordsById(prev => ({ ...prev, [customer.id]: { lat, lng } }))
      }
    } catch (e) {
      console.warn('Geocoding failed for', customer.name)
    }
  }

  useEffect(() => {
    // Pre-cargar coordenadas para clientes filtrados que no las tengan
    filteredCustomers.forEach(c => {
      const hasCoords = (typeof c.latitude === 'number' && typeof c.longitude === 'number') || coordsById[c.id]
      if (!hasCoords && (c.address || c.city || c.notes)) {
        geocodeAddress(c)
      }
    })
  }, [filteredCustomers])

  // Iconos del mapa (SVG inline)
  const customerIcon = useMemo(() => L.divIcon({
    className: '',
    html: `\n      <svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35));">
        <path fill="#ef4444" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/>
      </svg>\n    `,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28]
  }), [])

  const myLocationIcon = useMemo(() => L.divIcon({
    className: '',
    html: `\n      <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35));">
        <circle cx="12" cy="12" r="6" fill="#3b82f6" />
      </svg>\n    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  }), [])

  const locateMe = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const cur = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setMyLocation(cur)
        if (mapRef.current) {
          mapRef.current.flyTo([cur.lat, cur.lng], 14, { duration: 0.8 })
        }
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  // Determinar centro inicial
  const defaultCenter: LatLngExpression = useMemo(() => {
    if (filteredCustomers.length > 0) {
      const c = filteredCustomers[0]
      const lat = c.latitude ?? coordsById[c.id]?.lat
      const lng = c.longitude ?? coordsById[c.id]?.lng
      if (lat && lng) return [lat, lng]
    }
    return [36.7, -6.3]
  }, [filteredCustomers, coordsById])

  // Ajustar a los límites de todos los marcadores
  const FitBounds: React.FC<{ positions: { lat: number; lng: number }[] }> = ({ positions }) => {
    const map = useMap()
    useEffect(() => {
      if (!positions.length) return
      const bounds = L.latLngBounds(positions.map(p => L.latLng(p.lat, p.lng)))
      map.fitBounds(bounds.pad(0.2))
    }, [positions])
    return null
  }

  const fitToAll = () => {
    const positions = markerPositions.map(m => m.pos)
    if (!positions.length || !mapRef.current) return
    const bounds = L.latLngBounds(positions.map(p => L.latLng(p.lat, p.lng)))
    mapRef.current.fitBounds(bounds.pad(0.2))
  }

  const getCustomerLatLng = (c: Customer) => {
    const lat = typeof c.latitude === 'number' ? c.latitude : coordsById[c.id]?.lat
    const lng = typeof c.longitude === 'number' ? c.longitude : coordsById[c.id]?.lng
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng }
    return null
  }

  const markerPositions = filteredCustomers
    .map(c => ({ c, pos: getCustomerLatLng(c) }))
    .filter(item => !!item.pos) as { c: Customer; pos: { lat: number; lng: number } }[]

  const flyToCustomer = async (c: Customer) => {
    let pos = getCustomerLatLng(c)
    if (!pos) {
      await geocodeAddress(c)
      pos = getCustomerLatLng(c)
    }
    if (pos && mapRef.current) {
      mapRef.current.flyTo([pos.lat, pos.lng], 14, { duration: 0.8 })
    }
    setSelectedCustomer(c)
  }

  // Secuenciar geocodificación para evitar saturar servicios externos
  const isGeocodingRef = useRef(false)
  useEffect(() => {
    let cancelled = false
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
    const run = async () => {
      if (isGeocodingRef.current) return
      isGeocodingRef.current = true
      try {
        const need = filteredCustomers.filter(c => {
          const hasCoords = (typeof c.latitude === 'number' && typeof c.longitude === 'number') || coordsById[c.id]
          return !hasCoords && (c.address || c.city)
        })
        for (const c of need) {
          if (cancelled) break
          await geocodeAddress(c)
          // 小延遲避免被 Nominatim/外部服務拒絕
          await sleep(350)
        }
      } finally {
        isGeocodingRef.current = false
      }
    }
    run()
    return () => { cancelled = true }
  }, [filteredCustomers, coordsById])

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
          <h1 className="text-2xl font-bold text-gray-900">{t.maps.title}</h1>
          <p className="text-gray-600">{t.maps.subtitle}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={t.maps.searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="sm:w-48">
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">{t.maps.allCities}</option>
              {cities.map(city => (
                <option key={city} value={city as string}>{city}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de clientes */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{t.maps.customerList}</h2>
              <p className="text-sm text-gray-600">{filteredCustomers.length} {t.maps.customersFound}</p>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {filteredCustomers.length === 0 ? (
                <div className="text-center py-8">
                  <MapPin className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">{t.maps.noCustomersFound}</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredCustomers.map((customer) => (
                    <div
                      key={customer.id}
                      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedCustomer?.id === customer.id ? 'bg-blue-50 border-r-2 border-blue-500' : ''
                      }`}
                      onClick={() => flyToCustomer(customer)}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-600 font-medium text-sm">
                            {customer.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-gray-900 truncate">{customer.name}</h3>
                          <p className="text-xs text-gray-600 truncate">{customer.company}</p>
                          <div className="flex items-center mt-1">
                            <MapPin className="w-3 h-3 text-gray-400 mr-1" />
                            <span className="text-xs text-gray-500">{customer.city}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mapa y detalles */}
        <div className="lg:col-span-2 space-y-6">
          {/* Mapa interactivo */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="h-96 relative">
              {/* Botón de centrar en mi ubicación */}
              <div className="absolute z-[1000] right-3 top-3 flex gap-2">
                <button
                  onClick={fitToAll}
                  title="Ver todos"
                  className="inline-flex items-center space-x-1 px-3 py-2 bg-white/90 backdrop-blur rounded-md shadow border hover:bg-white"
                >
                  <span className="text-xs text-gray-700">Ver todos</span>
                </button>
                <button
                  onClick={locateMe}
                  title="Mi ubicación"
                  className="inline-flex items-center space-x-1 px-3 py-2 bg-white/90 backdrop-blur rounded-md shadow border hover:bg-white"
                >
                  <LocateFixed className="w-4 h-4 text-blue-600" />
                  <span className="text-xs text-gray-700">Mi ubicación</span>
                </button>
              </div>

              <MapContainer
                center={defaultCenter}
                zoom={12}
                style={{ height: '100%', width: '100%' }}
                ref={mapRef}
              >
                {/* @ts-ignore */}
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {markerPositions.map(({ c, pos }) => (
                  /* @ts-ignore */
                  <Marker key={c.id} position={[pos.lat, pos.lng]} icon={customerIcon} eventHandlers={{ click: () => setSelectedCustomer(c) }}>
                    {/* @ts-ignore */}
                    <Popup minWidth={240}>
                      <div className="space-y-1">
                        <div className="font-semibold text-gray-900">{c.name}</div>
                        {c.company && <div className="text-xs text-gray-600">{c.company}</div>}
                        <div className="text-sm text-gray-700">{c.address}</div>
                        <div className="text-sm text-gray-500">{c.city}</div>
                        <div className="flex items-center space-x-3 pt-2">
                          {(c.phone || c.mobile_phone) && (
                            <a href={`tel:${c.phone || c.mobile_phone}`} className="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm">
                              <Phone className="w-4 h-4 mr-1" /> {t.maps.call}
                            </a>
                          )}
                          <button onClick={() => getDirections(c)} className="inline-flex items-center text-green-600 hover:text-green-800 text-sm">
                            <Navigation className="w-4 h-4 mr-1" /> {t.maps.getDirections}
                          </button>
                          <button onClick={() => openInGoogleMaps(c)} className="inline-flex items-center text-indigo-600 hover:text-indigo-800 text-sm">
                            <ExternalLink className="w-4 h-4 mr-1" /> {t.maps.openInMaps}
                          </button>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {myLocation && (
                  /* @ts-ignore */
                  <Marker position={[myLocation.lat, myLocation.lng]} icon={myLocationIcon}>
                    <Popup>Mi Ubicación</Popup>
                  </Marker>
                )}

                <FitBounds positions={markerPositions.map(m => m.pos)} />
              </MapContainer>
            </div>
          </div>

          {/* Detalles del cliente seleccionado */}
          {selectedCustomer && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">{selectedCustomer.name}</h3>
                  <p className="text-gray-600">{selectedCustomer.company}</p>
                  {selectedCustomer.position && (
                    <p className="text-sm text-gray-500">{selectedCustomer.position}</p>
                  )}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => openInGoogleMaps(selectedCustomer)}
                    className="inline-flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span>{t.maps.openInMaps}</span>
                  </button>
                  <button
                    onClick={() => getDirections(selectedCustomer)}
                    className="inline-flex items-center space-x-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                  >
                    <Navigation className="w-4 h-4" />
                    <span>{t.maps.getDirections}</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3">{t.maps.contactInfo}</h4>
                  <div className="space-y-2">
                    {selectedCustomer.phone && (
                      <div className="flex items-center space-x-2">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600">{selectedCustomer.phone}</span>
                        <a href={`tel:${selectedCustomer.phone}`} className="text-blue-600 hover:text-blue-800 text-xs">{t.maps.call}</a>
                      </div>
                    )}
                    {selectedCustomer.email && (
                      <div className="flex items-center space-x-2">
                        <Mail className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600">{selectedCustomer.email}</span>
                        <a href={`mailto:${selectedCustomer.email}`} className="text-blue-600 hover:text-blue-800 text-xs">{t.maps.email}</a>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3">{t.maps.location}</h4>
                  <div className="text-sm text-gray-600">
                    <div>{selectedCustomer.address}</div>
                    <div>{selectedCustomer.city}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}