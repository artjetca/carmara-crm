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
  const [selectedProvince, setSelectedProvince] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  // 從 localStorage 載入已保存的座標，避免重複地理編碼
  const [coordsById, setCoordsById] = useState<Record<string, { lat: number; lng: number }>>(() => {
    try {
      const saved = localStorage.getItem('carmara-customer-coords')
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })
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
        (error) => {
          // Silently handle geolocation errors on page load
          console.debug('Geolocation not available:', error.message)
        },
        { enableHighAccuracy: false, timeout: 3000, maximumAge: 300000 }
      )
    }
  }, [user?.id])

  // 移除自動執行精準地理編碼，改為手動觸發
  // useEffect(() => {
  //   if (customers.length > 0 && !locatingAllPrecise) {
  //     const needsGeocoding = customers.some(c => 
  //       !coordsById[c.id] && (c.address || c.city || c.province)
  //     )
  //     
  //     if (needsGeocoding) {
  //       console.log('[AUTO_GEOCODE] Starting automatic precise geocoding for new customers')
  //       setTimeout(() => {
  //         preciseLocate()
  //       }, 1000)
  //     }
  //   }
  // }, [customers, coordsById])

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
      // 顯示所有客戶，不過濾用戶
      setCustomers(rows)
    } catch (error) {
      console.error('Error loading customers:', error)
    } finally {
      setLoading(false)
    }
  }

  // Provincias disponibles - 與客戶頁面一致
  const provinces = ['Cádiz', 'Huelva', 'Ceuta']
  
  // Municipios por provincia - 與客戶頁面完全一致
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

  // 與 Visits 頁面一致的城市顯示與解析規則
  const isProvinceName = (v?: string) => {
    const s = String(v || '').trim().toLowerCase()
    return s === 'huelva' || s === 'cádiz' || s === 'cadiz' || s === 'ceuta'
  }

  // 省份名稱標準化：無論大小寫/重音，統一為 "Cádiz"、"Huelva" 或 "Ceuta"
  const toCanonicalProvince = (v?: string): string => {
    const s = String(v || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // 去除重音符號
    if (s === 'huelva') return 'Huelva'
    if (s === 'cadiz') return 'Cádiz'
    if (s === 'ceuta') return 'Ceuta'
    return ''
  }

  // 获取根据选择省份过滤的城市选项
  const getFilteredCities = () => {
    const allCities = new Set<string>()
    
    if (selectedProvince) {
      // 如果选择了省份，只显示该省份下的城市
      const provinceCities = municipiosByProvince[selectedProvince] || []
      provinceCities.forEach(city => allCities.add(city))
    } else {
      // 如果没有选择省份，显示所有城市
      Object.values(municipiosByProvince).forEach(cities => {
        cities.forEach(city => allCities.add(city))
      })
    }
    
    return Array.from(allCities).sort()
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
      // 優先使用資料表中的 province 欄位
      if ((c as any).province && String((c as any).province).trim().length > 0) {
        const can = toCanonicalProvince((c as any).province)
        if (can) return can
      }
      // 從 notes 中解析省份
      if (c.notes) {
        const m = c.notes.match(/Provincia:\s*([^\n]+)/i)
        if (m) {
          const can = toCanonicalProvince(m[1])
          if (can) return can
        }
      }
      // 最後才檢查 city 是否為省份名稱
      if (c.city && isProvinceName(c.city)) {
        const can = toCanonicalProvince(c.city)
        if (can) return can
      }
      return ''
    } catch (error) {
      console.error('[DISPLAY_PROVINCE] Error processing customer:', c, error)
      return ''
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
          customer.email?.toLowerCase().includes(q)
        )
        
        // 省份篩選
        const matchesProvince = !selectedProvince || toCanonicalProvince(displayProvince(customer)) === toCanonicalProvince(selectedProvince)
        
        // 城市篩選 - 嚴格只匹配實際城市名稱
        const customerCity = displayCity(customer)
        const customerCityRaw = String(customer.city || '').trim()
        
        // 只匹配實際的城市，不管是否與省份同名
        const matchesCity = !selectedCity || 
                           customerCity.toLowerCase() === selectedCity.toLowerCase() ||
                           customerCityRaw.toLowerCase() === selectedCity.toLowerCase()
        
        return matchesSearch && matchesProvince && matchesCity
      })
    } catch (error) {
      console.error('[FILTER] Error filtering customers:', error)
      return []
    }
  }, [customers, searchTerm, selectedProvince, selectedCity])

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

  // 僅針對精準地址嘗試 API 地理編碼（不使用硬編碼），用於點擊左側客戶時優先精準定位
  const geocodeCustomerPrecise = async (customer: Customer): Promise<{ lat: number; lng: number } | null> => {
    const resolvedProvince = displayProvince(customer) || customer.province || ''
    const resolvedCity = displayCity(customer) || customer.city || ''
    const full = `${customer.address || ''}, ${resolvedCity}, ${resolvedProvince}, España`
      .replace(/,\s*,/g, ',')
      .replace(/^,\s*|,\s*$/g, '')
      .trim()
    
    console.log(`[GEOCODE_PRECISE] Customer: ${customer.name}`)
    console.log(`[GEOCODE_PRECISE] Raw address: "${customer.address}"`)
    console.log(`[GEOCODE_PRECISE] Resolved city: "${resolvedCity}"`)
    console.log(`[GEOCODE_PRECISE] Resolved province: "${resolvedProvince}"`)
    console.log(`[GEOCODE_PRECISE] Full query: "${full}"`)
    
    if (!full || full === 'España') {
      console.warn('[GEOCODE_PRECISE] Empty or invalid query, skipping')
      return null
    }
    
    try {
      const resp = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: full })
      })
      
      console.log(`[GEOCODE_PRECISE] API response status: ${resp.status}`)
      
      if (!resp.ok) {
        const errorText = await resp.text()
        console.error(`[GEOCODE_PRECISE] API error ${resp.status}: ${errorText}`)
        return null
      }
      
      const result = await resp.json()
      console.log(`[GEOCODE_PRECISE] API result:`, result)
      
      // 處理 API 返回格式 {success: true, data: {lat: number, lng: number}}
      if (result && result.success && result.data) {
        const coords = result.data
        if (typeof coords.lat === 'number' && typeof coords.lng === 'number') {
          console.log(`[GEOCODE_PRECISE] SUCCESS for ${customer.name}: lat=${coords.lat}, lng=${coords.lng}`)
          return { lat: coords.lat, lng: coords.lng }
        }
      }
      
      // 也支持直接返回座標的格式
      if (result && typeof result.lat === 'number' && typeof result.lng === 'number') {
        console.log(`[GEOCODE_PRECISE] SUCCESS for ${customer.name}: lat=${result.lat}, lng=${result.lng}`)
        return { lat: result.lat, lng: result.lng }
      }
      
      console.warn(`[GEOCODE_PRECISE] Invalid result format:`, result)
    } catch (e) {
      console.error('[GEOCODE_PRECISE] Exception:', e)
    }
    return null
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

  // 地理編碼函數 - 優先使用 API 獲取精確地址
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

    // 優先嘗試 API 地理編碼獲取精確地址（如果有地址信息）
    if (customer.address && customer.address.trim()) {
      const preciseCoords = await geocodeCustomerPrecise(customer)
      if (preciseCoords) {
        console.log(`[GEOCODE] Using API precise coordinates for ${customer.name}:`, preciseCoords)
        geocodeCache.current.set(cacheKey, preciseCoords)
        setCoordsById(prev => ({ ...prev, [customer.id]: preciseCoords }))
        return preciseCoords
      }
    }

    // 如果沒有地址或 API 失敗，才使用硬編碼座標
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
          
          // 處理 API 返回格式 {success: true, data: {lat: number, lng: number}}
          let coords = null
          if (result && result.success && result.data) {
            const data = result.data
            if (typeof data.lat === 'number' && typeof data.lng === 'number') {
              coords = { lat: data.lat, lng: data.lng }
            }
          }
          // 也支持直接返回座標的格式
          else if (result && typeof result.lat === 'number' && typeof result.lng === 'number') {
            coords = { lat: result.lat, lng: result.lng }
          }
          
          if (coords) {
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
    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported by this browser')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const cur = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setMyLocation(cur)
        if (mapRef.current) {
          mapRef.current.flyTo([cur.lat, cur.lng], 14, { duration: 0.8 })
        }
      },
      (error) => {
        console.debug('Geolocation error:', error.message)
        // Optionally show a user-friendly message
        switch(error.code) {
          case error.PERMISSION_DENIED:
            console.debug('User denied geolocation permission')
            break
          case error.POSITION_UNAVAILABLE:
            console.debug('Location information unavailable')
            break
          case error.TIMEOUT:
            console.debug('Location request timeout')
            break
        }
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
    )
  }

  // 一鍵精準定位：對當前篩選的客戶逐一做 API 地理編碼，獲取真實街道地址坐標
  const [locatingAllPrecise, setLocatingAllPrecise] = useState(false)
  const preciseLocate = async () => {
    if (locatingAllPrecise) return
    setLocatingAllPrecise(true)
    try {
      console.log('[PRECISE_LOCATE] Start precise geocoding for', filteredCustomers.length, 'customers')
      
      // 清除現有緩存，強制重新地理編碼
      geocodeCache.current.clear()
      const newCoords: Record<string, { lat: number; lng: number }> = {}
      
      for (const c of filteredCustomers) {
        try {
          // 嘗試精確地理編碼，無論是否有地址都試試看
          console.log(`[PRECISE_LOCATE] Processing ${c.name}`)
          console.log(`[PRECISE_LOCATE] Customer data:`, {
            id: c.id,
            name: c.name,
            address: c.address,
            city: c.city,
            province: c.province,
            notes: c.notes?.substring(0, 100)
          })
          
          let coords = null
          
          // 如果有地址，優先使用精確地理編碼
          if (c.address && c.address.trim()) {
            coords = await geocodeCustomerPrecise(c)
          }
          
          // 如果精確地理編碼失敗，使用一般地理編碼
          if (!coords) {
            console.log(`[PRECISE_LOCATE] Falling back to general geocoding for ${c.name}`)
            coords = await geocodeCustomer(c)
          }
          
          if (coords) {
            newCoords[c.id] = coords
            console.log(`[PRECISE_LOCATE] Final coordinates for ${c.name}:`, coords)
          } else {
            console.warn(`[PRECISE_LOCATE] No coordinates found for ${c.name}`)
          }
          // 延遲避免 API 限流
          await new Promise(r => setTimeout(r, 200))
        } catch (e) {
          console.warn('[PRECISE_LOCATE] geocode failed for', c.id, e)
        }
      }
      
      // 批量更新所有坐標
      if (Object.keys(newCoords).length > 0) {
        setCoordsById(prev => {
          const updated = { ...prev, ...newCoords }
          // 保存到 localStorage
          try {
            localStorage.setItem('carmara-customer-coords', JSON.stringify(updated))
          } catch (e) {
            console.warn('[PRECISE_LOCATE] Failed to save coordinates to localStorage:', e)
          }
          return updated
        })
        console.log(`[PRECISE_LOCATE] Updated coordinates for ${Object.keys(newCoords).length} customers`)
      }
      
      // 定位完成後，自動 fit
      await new Promise(r => setTimeout(r, 500))
      await fitToAll()
    } finally {
      setLocatingAllPrecise(false)
    }
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
      try {
        // Validate positions before creating bounds
        const validPositions = positions.filter(p => 
          typeof p.lat === 'number' && 
          typeof p.lng === 'number' && 
          !isNaN(p.lat) && 
          !isNaN(p.lng) &&
          p.lat >= -90 && p.lat <= 90 &&
          p.lng >= -180 && p.lng <= 180
        )
        
        if (validPositions.length === 0) return
        
        const bounds = L.latLngBounds(validPositions.map(p => L.latLng(p.lat, p.lng)))
        if (bounds.isValid()) {
          map.fitBounds(bounds.pad(0.2))
        }
      } catch (error) {
        console.warn('[FIT_BOUNDS] Error fitting bounds:', error)
      }
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
      
      // 使用真實坐標位置進行 fitBounds
      const allPositions = markerPositions.map(m => m.pos)

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
      
      try {
        // Validate positions before creating bounds
        const validPositions = allPositions.filter(p => 
          typeof p.lat === 'number' && 
          typeof p.lng === 'number' && 
          !isNaN(p.lat) && 
          !isNaN(p.lng) &&
          p.lat >= -90 && p.lat <= 90 &&
          p.lng >= -180 && p.lng <= 180
        )
        
        if (validPositions.length === 0) {
          console.warn(`[FIT_TO_ALL] No valid positions found`)
          return
        }
        
        const bounds = L.latLngBounds(validPositions.map(p => L.latLng(p.lat, p.lng)))
        if (bounds.isValid()) {
          console.log(`[FIT_TO_ALL] Fitting map to bounds with ${validPositions.length} positions`)
          mapRef.current.fitBounds(bounds.pad(0.1))
        } else {
          console.warn(`[FIT_TO_ALL] Invalid bounds created`)
        }
      } catch (error) {
        console.error(`[FIT_TO_ALL] Error fitting bounds:`, error)
      }
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

  // 計算標記位置，優先使用精確地址，並對重疊座標加入微擾(jitter)
  const markerPositions = useMemo(() => {
    try {
      const arr = filteredCustomers
        .map(c => {
          if (!c || !c.id) return null
          
          // 首先檢查資料庫座標
          let pos = getCustomerLatLng(c)
          
          // 如果沒有座標，不在這裡觸發地理編碼，讓用戶手動點擊"Localización precisa"按鈕
          
          // 如果仍沒有座標，使用硬編碼座標作為最後回退
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

      // 不使用微擾，保持真實地理坐標

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
    console.log(`[FLY_TO_CUSTOMER] Starting for ${c.name}`)
    
    // 先嘗試用詳細地址做精準地理編碼
    let pos = null as { lat: number; lng: number } | null
    if (c.address || c.notes) {
      const precise = await geocodeCustomerPrecise(c)
      if (precise) {
        pos = precise
        setCoordsById(prev => {
          const updated = { ...prev, [c.id]: precise }
          try {
            localStorage.setItem('carmara-customer-coords', JSON.stringify(updated))
          } catch (e) {
            console.warn('[FLY_TO_CUSTOMER] Failed to save coordinates to localStorage:', e)
          }
          return updated
        })
        console.log(`[FLY_TO_CUSTOMER] Got precise coordinates for ${c.name}:`, precise)
      }
    }

    // 若沒有拿到精準地址，再用現有/硬編碼/省級回退
    if (!pos) {
      pos = getCustomerLatLng(c)
      console.log(`[FLY_TO_CUSTOMER] Existing coordinates for ${c.name}:`, pos)
      
      if (!pos) {
        console.log(`[FLY_TO_CUSTOMER] No existing coordinates, geocoding ${c.name}`)
        await geocodeCustomer(c)
        pos = getCustomerLatLng(c)
        console.log(`[FLY_TO_CUSTOMER] After geocoding for ${c.name}:`, pos)
      }
    }

    if (pos && mapRef.current) {
      console.log(`[FLY_TO_CUSTOMER] Flying to ${c.name} at:`, pos)
      mapRef.current.flyTo([pos.lat, pos.lng], 14, { duration: 0.8 })
      
      // 設置選中的客戶，這會觸發地圖上對應標記的高亮
      setSelectedCustomer(c)
      
      // 延遲一下讓地圖飛行完成，然後嘗試打開彈出窗口
      setTimeout(() => {
        // 方法1: 通過 data-customer-id 找到標記
        const marker = document.querySelector(`[data-customer-id="${c.id}"]`) as HTMLElement
        if (marker) {
          console.log(`[FLY_TO_CUSTOMER] Found marker element for ${c.name}, clicking`)
          marker.click()
        } else {
          console.warn(`[FLY_TO_CUSTOMER] Could not find marker element for ${c.name}`)
          
          // 方法2: 通過 Leaflet API 找到標記並打開彈出窗口
          if (mapRef.current) {
            mapRef.current.eachLayer((layer: any) => {
              if (layer.options && layer.options.customerId === c.id) {
                console.log(`[FLY_TO_CUSTOMER] Found Leaflet marker for ${c.name}, opening popup`)
                layer.openPopup()
              }
            })
          }
        }
      }, 1200)
    } else {
      console.warn(`[FLY_TO_CUSTOMER] No position found for ${c.name}`)
      setSelectedCustomer(c)
    }
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
          {(selectedCity || selectedProvince || searchTerm) && (
            <div className="mt-2 text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded-lg inline-block">
              {filteredCustomers.length} clientes {selectedCity ? `en ${selectedCity}` : selectedProvince ? `en provincia ${selectedProvince}` : ''}
            </div>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex flex-col lg:flex-row gap-4">
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
              value={selectedProvince}
              onChange={(e) => {
                setSelectedProvince(e.target.value)
                setSelectedCity('') // 清空城市選擇
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Todas las Provincias</option>
              {provinces.map(province => (
                <option key={province} value={province as string}>{province}</option>
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Lista de clientes */}
        <div className="lg:col-span-1 space-y-6">
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
                          <div className="flex items-start mt-1">
                            <MapPin className="w-3 h-3 text-gray-400 mr-1 mt-0.5 flex-shrink-0" />
                            <span className="text-xs text-gray-600 break-words">
                              {getAddress(customer)}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-gray-500 truncate">
                            <span className="font-medium">Contrato:</span> {customer.contrato || '—'}
                          </div>
                          <div className="mt-0.5 text-xs text-gray-500 line-clamp-1">
                            <span className="font-medium">Notas:</span> {customer.notes || '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Customer details panel - moved to bottom */}
          {selectedCustomer && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Detalles del Cliente</h3>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700">{selectedCustomer.phone}</span>
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

        {/* Mapa expandido */}
        <div className="lg:col-span-3">
          {/* Mapa interactivo */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="h-[800px] relative">
              {/* Botón de centrar en mi ubicación */}
              <div className="absolute z-[1000] right-3 top-3 flex flex-col sm:flex-row gap-2">
                <button
                  onClick={fitToAll}
                  title="Ver todos"
                  disabled={fittingAll}
                  aria-busy={fittingAll}
                  className={`inline-flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md shadow border transition-colors ${fittingAll ? 'bg-gray-100 cursor-not-allowed' : 'bg-white/90 backdrop-blur hover:bg-white'}`}
                >
                  {fittingAll && (
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
                  )}
                  <span className="text-xs text-gray-700 hidden sm:inline">{fittingAll ? 'Localizando…' : 'Ver todos'}</span>
                  <span className="text-xs text-gray-700 sm:hidden">{fittingAll ? 'Loc…' : 'Todos'}</span>
                </button>
                <button
                  onClick={preciseLocate}
                  title="Localización precisa"
                  disabled={locatingAllPrecise}
                  aria-busy={locatingAllPrecise}
                  className={`inline-flex items-center space-x-1 sm:space-x-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-md shadow border transition-colors ${locatingAllPrecise ? 'bg-gray-100 cursor-not-allowed' : 'bg-white/90 backdrop-blur hover:bg-white'}`}
                >
                  {locatingAllPrecise && (
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                  )}
                  <span className="text-xs text-gray-700 hidden sm:inline">{locatingAllPrecise ? 'Geocodificando…' : 'Localización precisa'}</span>
                  <span className="text-xs text-gray-700 sm:hidden">{locatingAllPrecise ? 'Geo…' : 'Precisa'}</span>
                </button>
                <button
                  onClick={locateMe}
                  title="Mi ubicación"
                  className="inline-flex items-center space-x-1 px-2 sm:px-3 py-1.5 sm:py-2 bg-white/90 backdrop-blur rounded-md shadow border hover:bg-white"
                >
                  <LocateFixed className="w-4 h-4 text-blue-600" />
                  <span className="text-xs text-gray-700 hidden sm:inline">Mi ubicación</span>
                  <span className="text-xs text-gray-700 sm:hidden">Mi pos.</span>
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
                  <Marker 
                    key={c.id} 
                    position={[pos.lat, pos.lng]} 
                    icon={customerIcon as any}
                    ref={(ref) => {
                      // 為標記添加自定義屬性，方便查找
                      if (ref) {
                        (ref as any).options.customerId = c.id
                      }
                    }}
                    eventHandlers={{ 
                      click: (e) => {
                        setSelectedCustomer(c)
                        // En móvil, abrir popup automáticamente
                        if (window.innerWidth <= 768) {
                          setTimeout(() => {
                            const marker = e.target
                            if (marker && marker.openPopup) {
                              marker.openPopup()
                            }
                          }, 100)
                        }
                      },
                      add: (e) => {
                        // 為標記添加 data-customer-id 屬性，方便從左側點擊時找到
                        const marker = e.target
                        if (marker && marker.getElement) {
                          const element = marker.getElement()
                          if (element) {
                            element.setAttribute('data-customer-id', c.id)
                          }
                        }
                        // 同時為 Leaflet 層添加自定義屬性
                        if (marker) {
                          (marker as any).options.customerId = c.id
                        }
                      }
                    }}
                  >
                    <Popup minWidth={280 as any} maxWidth={320 as any}>
                      <div className="space-y-3">
                        <div className="border-b border-gray-200 pb-2">
                          <div className="font-semibold text-gray-900 text-base">{c.name}</div>
                          {c.company && <div className="text-sm text-gray-600 mt-1">{c.company}</div>}
                        </div>
                        
                        <div className="space-y-2">
                          {c.address && (
                            <div className="flex items-start space-x-2">
                              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                              <div className="text-sm text-gray-700">{c.address}</div>
                            </div>
                          )}
                          
                          <div className="flex items-center space-x-2">
                            <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <div className="text-sm text-gray-500">{displayCity(c) || c.city || c.province}</div>
                          </div>
                          <div className="text-sm text-gray-700">
                            <span className="font-medium">Contrato:</span> {c.contrato || '—'}
                          </div>
                          <div className="text-sm text-gray-700 break-words">
                            <span className="font-medium">Notas:</span> {c.notes || '—'}
                          </div>
                          
                          {(c.phone || c.mobile_phone) && (
                            <div className="flex items-center space-x-2">
                              <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <div className="text-sm text-gray-700">{c.phone || c.mobile_phone}</div>
                            </div>
                          )}
                          
                          {c.email && (
                            <div className="flex items-center space-x-2">
                              <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <div className="text-sm text-gray-700">{c.email}</div>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                          {(c.phone || c.mobile_phone) && (
                            <a 
                              href={`tel:${c.phone || c.mobile_phone}`} 
                              className="inline-flex items-center px-2 py-1 text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-md transition-colors"
                            >
                              <Phone className="w-3 h-3 mr-1" /> Llamar
                            </a>
                          )}
                          <button 
                            onClick={() => getDirections(c)} 
                            className="inline-flex items-center px-2 py-1 text-xs bg-green-50 text-green-600 hover:bg-green-100 rounded-md transition-colors"
                          >
                            <Navigation className="w-3 h-3 mr-1" /> Direcciones
                          </button>
                          <button 
                            onClick={() => openInGoogleMaps(c)} 
                            className="inline-flex items-center px-2 py-1 text-xs bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-md transition-colors"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" /> Google Maps
                          </button>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {myLocation && (
                  <Marker position={[myLocation.lat, myLocation.lng]} icon={myLocationIcon as any}>
                    <Popup>Mi Ubicación</Popup>
                  </Marker>
                )}

                <FitBounds positions={markerPositions.map(m => m.pos)} />
              </MapContainer>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}