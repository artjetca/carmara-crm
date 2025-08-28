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
  const [fittingAll, setFittingAll] = useState(false)
  const mapRef = useRef<LeafletMap | null>(null)
  const t = translations
  const nominatimEmail = (import.meta as any).env?.VITE_NOMINATIM_EMAIL as string | undefined

  useEffect(() => {
    if (!user?.id) return
    loadCustomers()
    // Intentar obtener ubicación del usuario (opcional)
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => undefined,
        { enableHighAccuracy: true, timeout: 5000 }
      )
    }
  }, [user?.id])

  const loadCustomers = async () => {
    if (!user?.id) {
      setCustomers([])
      setLoading(false)
      return
    }
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

      let rows = result.data || []
      // 過濾只顯示當前用戶創建的客戶
      const userCustomers = rows.filter((customer: any) => customer.created_by === user.id)
      setCustomers(userCustomers)
    } catch (error) {
      console.error('Error loading customers:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredCustomers = useMemo(() => {
    try {
      return customers.filter(customer => {
        if (!customer) return false
        
        const q = searchTerm.toLowerCase()
        const matchesSearch = (
          customer.name?.toLowerCase().includes(q) ||
          customer.company?.toLowerCase().includes(q) ||
          customer.city?.toLowerCase().includes(q)
        )
        
        // 如果沒有選擇城市或選擇的是空字串，顯示所有客戶
        if (!selectedCity || selectedCity === '') {
          return matchesSearch
        }
        
        // 檢查省份是否匹配
        const customerProvince = displayProvince(customer)
        const matchesCity = customerProvince === selectedCity
        
        return matchesSearch && matchesCity
      })
    } catch (error) {
      console.error('[FILTER] Error filtering customers:', error)
      return []
    }
  }, [customers, searchTerm, selectedCity])

  // Solo mostrar provincias Cádiz y Huelva en el filtro
  const cities = ['Cádiz', 'Huelva']

  // 與 Visits 頁面一致的城市顯示與解析規則
  const isProvinceName = (v?: string) => {
    const s = String(v || '').trim().toLowerCase()
    return s === 'huelva' || s === 'cádiz' || s === 'cadiz'
  }

  const extractCityForDisplay = (notes?: string): string => {
    if (!notes) return ''
    const m = notes.match(/Ciudad:\s*([^\n]+)/i)
    return m ? m[1].trim() : ''
  }

  const displayCity = (c?: Customer): string => {
    if (!c) return ''
    try {
      const fromNotes = extractCityForDisplay(c.notes)
      if (fromNotes) return fromNotes
      const city = String(c.city || '').trim()
      if (city && !isProvinceName(city)) return city
      return ''
    } catch (error) {
      console.error('[DISPLAY_CITY] Error processing customer:', c, error)
      return ''
    }
  }

  const displayProvince = (c?: Customer): string => {
    if (!c) return ''
    try {
      // 先使用資料表中的 province 欄位
      if (c.province && String(c.province).trim().length > 0) {
        return String(c.province).trim()
      }
      if (c.city && isProvinceName(c.city)) return c.city
      if (c.notes) {
        const m = c.notes.match(/Provincia:\s*([^\n]+)/i)
        if (m) return m[1].trim()
      }
      return ''
    } catch (error) {
      console.error('[DISPLAY_PROVINCE] Error processing customer:', c, error)
      return ''
    }
  }

  const getAddress = (c: Customer) => {
    // 以解析後城市為優先，若無則回退到 city，再回退 province
    const cityResolved = displayCity(c)
    const province = c.province || ''
    const locality = cityResolved || c.city || province || ''
    const parts = [c.address || '', locality, province && locality !== province ? province : '', 'España']
      .filter(Boolean)
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

  // Cache para evitar geocoding duplicado
  const geocodeCache = useRef<Map<string, { lat: number; lng: number } | null>>(new Map())
  
  // 硬編碼主要城市座標作為備用
  const getCityCoordinates = (city: string, province: string): { lat: number; lng: number } | null => {
    const cityKey = `${city.toLowerCase().trim()}, ${province.toLowerCase().trim()}`
    const coordinates: Record<string, { lat: number; lng: number }> = {
      // Huelva省主要城市
      'huelva, huelva': { lat: 37.2614, lng: -6.9447 },
      'lepe, huelva': { lat: 37.2531, lng: -7.2044 },
      'almonte, huelva': { lat: 37.2631, lng: -6.5147 },
      'moguer, huelva': { lat: 37.2758, lng: -6.8386 },
      'ayamonte, huelva': { lat: 37.2097, lng: -7.4031 },
      'isla cristina, huelva': { lat: 37.1969, lng: -7.3158 },
      'valverde del camino, huelva': { lat: 37.5831, lng: -6.7486 },
      'cartaya, huelva': { lat: 37.2831, lng: -7.1531 },
      'palos de la frontera, huelva': { lat: 37.2264, lng: -6.9031 },
      'bollullos par del condado, huelva': { lat: 37.3431, lng: -6.5431 },
      // Cádiz省主要城市
      'cádiz, cádiz': { lat: 36.5297, lng: -6.2925 },
      'cadiz, cadiz': { lat: 36.5297, lng: -6.2925 },
      'jerez de la frontera, cádiz': { lat: 36.6864, lng: -6.1364 },
      'jerez, cádiz': { lat: 36.6864, lng: -6.1364 },
      'algeciras, cádiz': { lat: 36.1322, lng: -5.4553 },
      'la línea de la concepción, cádiz': { lat: 36.1658, lng: -5.3497 },
      'puerto real, cádiz': { lat: 36.5331, lng: -6.1831 },
      'san fernando, cádiz': { lat: 36.4614, lng: -6.1997 },
      'chiclana de la frontera, cádiz': { lat: 36.4197, lng: -6.1497 },
      'el puerto de santa maría, cádiz': { lat: 36.5997, lng: -6.2331 },
      'sanlúcar de barrameda, cádiz': { lat: 36.7781, lng: -6.3531 },
      // 省份級別座標
      ', huelva': { lat: 37.2614, lng: -6.9447 },
      ', cádiz': { lat: 36.5297, lng: -6.2925 },
      ', cadiz': { lat: 36.5297, lng: -6.2925 }
    }
    
    return coordinates[cityKey] || null
  }

  // 地理編碼函數
  const geocodeCustomer = async (customer: Customer): Promise<{ lat: number; lng: number } | null> => {
    console.log(`[GEOCODE] Starting geocode for customer:`, {
      id: customer.id,
      name: customer.name,
      address: customer.address,
      city: customer.city,
      province: customer.province,
      notes: customer.notes?.substring(0, 100)
    })

    // Check cache first
    const resolvedProvince = displayProvince(customer) || customer.province || ''
    const resolvedCity = displayCity(customer) || customer.city || ''
    const baseKeyPart = `${customer.address || ''}-${resolvedCity}-${resolvedProvince}` || 'noaddr'
    const cacheKey = `${customer.id}-${baseKeyPart}`
    if (geocodeCache.current.has(cacheKey)) {
      console.log(`[GEOCODE] Cache hit for ${customer.name}: ${cacheKey}`)
      return geocodeCache.current.get(cacheKey)!
    }

    // 首先嘗試硬編碼座標
    const hardcodedCoords = getCityCoordinates(resolvedCity, resolvedProvince)
    if (hardcodedCoords) {
      console.log(`[GEOCODE] Using hardcoded coordinates for ${customer.name} (${resolvedCity}, ${resolvedProvince}):`, hardcodedCoords)
      geocodeCache.current.set(cacheKey, hardcodedCoords)
      // 立即更新 coordsById 狀態
      setCoordsById(prev => ({ ...prev, [customer.id]: hardcodedCoords }))
      return hardcodedCoords
    }

    // 簡化候選查詢，專注於城市和省份
    const candidates = [
      // 完整地址
      `${customer.address || ''}, ${resolvedCity}, ${resolvedProvince}, España`,
      // 城市 + 省份
      `${resolvedCity}, ${resolvedProvince}, España`,
      // 只有省份
      `${resolvedProvince}, España`,
      // 城市 + 西班牙
      `${resolvedCity}, España`,
      // 原始城市欄位
      `${customer.city || ''}, España`,
      // 原始省份欄位
      `${customer.province || ''}, España`
    ]
      .map(q => q.replace(/,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim())
      .filter(q => q && q.length > 3 && q !== 'España')

    console.log(`[GEOCODE] Resolved data for ${customer.name}:`, {
      resolvedCity,
      resolvedProvince,
      candidates
    })

    // 如果沒有硬編碼座標，嘗試 API 地理編碼
    for (let i = 0; i < candidates.length; i++) {
      const query = candidates[i]
      try {
        console.log(`[GEOCODE] API attempt ${i + 1}/${candidates.length} for ${customer.name}: "${query}"`)
        const resp = await fetch('/api/geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: query })
        })
        
        if (resp.ok) {
          const result = await resp.json()
          console.log(`[GEOCODE] API response for ${customer.name}:`, result)
          if (result.lat && result.lng && typeof result.lat === 'number' && typeof result.lng === 'number') {
            const coords = { lat: result.lat, lng: result.lng }
            geocodeCache.current.set(cacheKey, coords)
            console.log(`[GEOCODE] API SUCCESS for ${customer.name}:`, coords)
            return coords
          }
        } else {
          const errorText = await resp.text()
          console.warn(`[GEOCODE] API HTTP ${resp.status} for ${customer.name} query: "${query}" - ${errorText}`)
        }
      } catch (e) {
        console.warn(`[GEOCODE] API error for ${customer.name} query: "${query}"`, e)
      }
    }
    
    // 最後嘗試省份級別的硬編碼座標
    const provinceCoords = getCityCoordinates('', resolvedProvince)
    if (provinceCoords) {
      console.log(`[GEOCODE] Using province-level coordinates for ${customer.name} (${resolvedProvince}):`, provinceCoords)
      geocodeCache.current.set(cacheKey, provinceCoords)
      // 立即更新 coordsById 狀態
      setCoordsById(prev => ({ ...prev, [customer.id]: provinceCoords }))
      return provinceCoords
    }
    
    console.warn(`[GEOCODE] FAILED all methods for ${customer.name}`)
    geocodeCache.current.set(cacheKey, null)
    return null
  }

  // Nota: se eliminó un efecto de geocodificación duplicado para evitar
  // solicitudes concurrentes excesivas que producían errores de recursos insuficientes.

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
      const lat = (typeof c.latitude === 'number' ? c.latitude : coordsById[c.id]?.lat)
      const lng = (typeof c.longitude === 'number' ? c.longitude : coordsById[c.id]?.lng)
      if (typeof lat === 'number' && typeof lng === 'number') return [lat, lng]
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

  // Inicializar mapa y guardar referencia, además de centrar vista inicial
  const MapInit: React.FC<{ center: LatLngExpression }> = ({ center }) => {
    const map = useMap()
    useEffect(() => {
      mapRef.current = map
      try { (map as any).setView(center as any, 12) } catch {}
    }, [center])
    return null
  }

  const fitToAll = async () => {
    if (fittingAll) return
    setFittingAll(true)
    console.log(`[FIT_TO_ALL] Starting fit to all with ${filteredCustomers.length} filtered customers`)
    
    try {
      // 直接使用現有的 markerPositions
      const currentPositions = markerPositions.map(m => m.pos)
      console.log(`[FIT_TO_ALL] Current marker positions:`, currentPositions)
      
      // 如果沒有任何標記，嘗試為所有客戶獲取座標
      if (currentPositions.length === 0) {
        console.log(`[FIT_TO_ALL] No markers found, trying to get coordinates for all customers`)
        const newCoords: Record<string, { lat: number; lng: number }> = {}
        
        for (const customer of filteredCustomers) {
          const resolvedProvince = displayProvince(customer) || customer.province || ''
          const resolvedCity = displayCity(customer) || customer.city || ''
          
          // 嘗試硬編碼座標
          let coords = getCityCoordinates(resolvedCity, resolvedProvince)
          if (!coords) {
            coords = getCityCoordinates('', resolvedProvince) // 省份級別
          }
          
          if (coords) {
            newCoords[customer.id] = coords
            console.log(`[FIT_TO_ALL] Assigned coordinates to ${customer.name}:`, coords)
          }
        }
        
        if (Object.keys(newCoords).length > 0) {
          setCoordsById(prev => ({ ...prev, ...newCoords }))
          // 等待狀態更新
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
      
      // 使用 jitter 後的位置，並去重(以 4 位小數作為鍵)
      const dedup: Record<string, { lat: number; lng: number }> = {}
      markerPositions.forEach(m => {
        const key = `${m.pos.lat.toFixed(4)},${m.pos.lng.toFixed(4)}`
        if (!dedup[key]) dedup[key] = m.pos
      })
      const allPositions = Object.values(dedup)

      console.log(`[FIT_TO_ALL] Final positions for fitting:`, allPositions)
      
      if (allPositions.length === 0) {
        console.warn(`[FIT_TO_ALL] No coordinates found, using default Andalusia center`)
        if (mapRef.current) {
          mapRef.current.setView([36.7, -6.3], 8)
        }
        return
      }
      
      if (allPositions.length === 1) {
        console.log(`[FIT_TO_ALL] Only one position, centering on it`)
        if (mapRef.current) {
          mapRef.current.setView([allPositions[0].lat, allPositions[0].lng], 12)
        }
        return
      }
      
      if (!mapRef.current) {
        console.warn(`[FIT_TO_ALL] No map reference available`)
        return
      }
      
      const bounds = L.latLngBounds(allPositions.map(p => L.latLng(p.lat, p.lng)))
      console.log(`[FIT_TO_ALL] Fitting map to bounds with ${allPositions.length} positions`)
      mapRef.current.fitBounds(bounds.pad(0.1))
    } finally {
      setFittingAll(false)
    }
  }

  const getCustomerLatLng = (c: Customer) => {
    const lat = typeof c.latitude === 'number' ? c.latitude : coordsById[c.id]?.lat
    const lng = typeof c.longitude === 'number' ? c.longitude : coordsById[c.id]?.lng
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng }
    return null
  }

  // 計算標記位置，包含硬編碼座標，並對重疊座標加入微擾(jitter)
  const markerPositions = useMemo(() => {
    try {
      const arr = filteredCustomers
        .map(c => {
          if (!c || !c.id) return null
          
          // 首先檢查資料庫座標
          let pos = getCustomerLatLng(c)
          
          // 如果沒有座標，嘗試硬編碼座標
          if (!pos) {
            const resolvedProvince = displayProvince(c) || c.province || ''
            const resolvedCity = displayCity(c) || c.city || ''
            const hardcodedCoords = getCityCoordinates(resolvedCity, resolvedProvince)
            if (hardcodedCoords) {
              pos = hardcodedCoords
              // 立即更新狀態以供下次使用
              setCoordsById(prev => ({ ...prev, [c.id]: hardcodedCoords }))
            } else {
              // 嘗試省份級別座標
              const provinceCoords = getCityCoordinates('', resolvedProvince)
              if (provinceCoords) {
                pos = provinceCoords
                setCoordsById(prev => ({ ...prev, [c.id]: provinceCoords }))
              }
            }
          }
          
          return { c, pos }
        })
        .filter(item => item && item.pos) as { c: Customer; pos: { lat: number; lng: number } }[]

      // 對相同座標的標記做微擾，避免重疊
      try {
        const groups: Record<string, number[]> = {}
        const keyOf = (p: { lat: number; lng: number }) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`
        arr.forEach((item, idx) => {
          const k = keyOf(item.pos)
          if (!groups[k]) groups[k] = []
          groups[k].push(idx)
        })
        const baseR = 0.0007 // 約 70m 視覺偏移
        Object.values(groups).forEach(indices => {
          if (indices.length <= 1) return
          const n = indices.length
          const radius = baseR * (1 + Math.min(n, 6) * 0.15)
          indices.forEach((arrIndex, i) => {
            const angle = (2 * Math.PI * i) / n
            const dx = radius * Math.cos(angle)
            const dy = radius * Math.sin(angle)
            const p = arr[arrIndex].pos
            arr[arrIndex] = {
              c: arr[arrIndex].c,
              pos: { lat: p.lat + dy, lng: p.lng + dx }
            }
          })
        })
      } catch (e) {
        console.warn('[MARKER_POSITIONS] jitter failed', e)
      }

      // 調試：輸出標記統計與示例
      try {
        const byKey: Record<string, number> = {}
        arr.forEach(({ c, pos }) => {
          const key = `${pos.lat.toFixed(3)},${pos.lng.toFixed(3)}`
          byKey[key] = (byKey[key] || 0) + 1
        })
        console.log('[MARKER_POSITIONS] total markers:', arr.length, 'unique coords:', Object.keys(byKey).length, byKey)
      } catch {}

      return arr
    } catch (error) {
      console.error('[MARKER_POSITIONS] Error calculating marker positions:', error)
      return []
    }
  }, [filteredCustomers, coordsById])

  const flyToCustomer = async (c: Customer) => {
    let pos = getCustomerLatLng(c)
    if (!pos) {
      await geocodeCustomer(c)
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
          return !hasCoords && (c.address || c.city || c.notes || c.province)
        })
        // Process in smaller batches to avoid overwhelming the API
        const batchSize = 3
        for (let i = 0; i < need.length; i += batchSize) {
          if (cancelled) break
          
          const batch = need.slice(i, i + batchSize)
          await Promise.all(
            batch.map(async (c) => {
              try {
                const coords = await geocodeCustomer(c)
                if (coords) {
                  setCoordsById(prev => ({ ...prev, [c.id]: coords }))
                }
              } catch (error) {
                console.warn('Geocoding failed for customer', c.id, error)
              }
            })
          )
          
          // Longer delay between batches
          if (i + batchSize < need.length) {
            await sleep(1500)
          }
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
                            <span className="text-xs text-gray-500">{displayCity(customer) || customer.city || customer.province}</span>
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
                  disabled={fittingAll}
                  aria-busy={fittingAll}
                  className={`inline-flex items-center space-x-2 px-3 py-2 rounded-md shadow border transition-colors ${fittingAll ? 'bg-gray-100 cursor-not-allowed' : 'bg-white/90 backdrop-blur hover:bg-white'}`}
                >
                  {fittingAll && (
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
                  )}
                  <span className="text-xs text-gray-700">{fittingAll ? 'Localizando…' : 'Ver todos'}</span>
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
                style={{ height: '100%', width: '100%' }}
              >
                <MapInit center={defaultCenter} />
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {markerPositions.map(({ c, pos }) => (
                  // @ts-expect-error react-leaflet typings may not include 'icon' though Leaflet MarkerOptions supports it
                  <Marker key={c.id} position={[pos.lat, pos.lng]} icon={customerIcon as any} eventHandlers={{ click: () => setSelectedCustomer(c) }}>
                    {/* @ts-expect-error Leaflet PopupOptions supports minWidth */}
                    <Popup minWidth={240 as any}>
                      <div className="space-y-1">
                        <div className="font-semibold text-gray-900">{c.name}</div>
                        {c.company && <div className="text-xs text-gray-600">{c.company}</div>}
                        <div className="text-sm text-gray-700">{c.address}</div>
                        <div className="text-sm text-gray-500">{displayCity(c) || c.city || c.province}</div>
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
                  // @ts-expect-error react-leaflet typings may not include 'icon' though Leaflet MarkerOptions supports it
                  <Marker position={[myLocation.lat, myLocation.lng]} icon={myLocationIcon as any}>
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
                    <div>{displayCity(selectedCustomer) || selectedCustomer.city || selectedCustomer.province}</div>
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