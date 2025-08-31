import React, { useState, useEffect, useMemo } from 'react'
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
  const t = translations

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
    if (city && !isProvinceName(city)) return city
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

  const getFilteredCities = () => {
    if (!selectedProvince) return []
    const citySet = new Set<string>()
    customers
      .filter(customer => displayProvince(customer) === selectedProvince)
      .forEach(customer => {
        const city = displayCity(customer)
        if (city) citySet.add(city)
      })
    return Array.from(citySet).sort()
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
      const matchesCity = !selectedCity || customerCity.toLowerCase() === selectedCity.toLowerCase()

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

      // 使用本地 Express API
      const response = await fetch('/api/distance/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ waypoints })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      console.log('[RoutePlanning] Distance API response:', result)

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
  }

  // 儲存路線
  const saveRoute = () => {
    if (!routeName.trim()) {
      alert('Por favor ingresa un nombre para la ruta')
      return
    }
    
    const routeData = {
      id: Date.now().toString(),
      name: routeName,
      date: routeDate,
      time: routeTime,
      customers: routeCustomers,
      totalDistance,
      totalDuration,
      createdAt: new Date().toISOString()
    }
    
    const saved = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
    saved.push(routeData)
    localStorage.setItem('savedRoutes', JSON.stringify(saved))
    setSavedRoutes(saved)
    setShowSaveModal(false)
    setRouteName('')
    alert('Ruta guardada exitosamente')
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

  // 刪除儲存的路線
  const deleteSavedRoute = (routeId: string) => {
    const saved = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
    const updated = saved.filter((r: any) => r.id !== routeId)
    localStorage.setItem('savedRoutes', JSON.stringify(updated))
    setSavedRoutes(updated)
  }

  // 載入儲存的路線列表
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('savedRoutes') || '[]')
    setSavedRoutes(saved)
  }, [])

  // 獲取當前位置
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          const locationCustomer: RouteCustomer = {
            id: 'current-location',
            name: 'Mi Ubicación',
            company: 'Ubicación Actual',
            address: `${latitude}, ${longitude}`,
            city: 'Ubicación GPS',
            province: '',
            phone: '',
            email: '',
            notes: '',
            contrato: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            created_by: user?.id || '',
            order: 1
          }
          
          // 如果路線為空，添加當前位置作為起點
          if (routeCustomers.length === 0) {
            setRouteCustomers([locationCustomer])
          } else {
            // 否則將當前位置插入為第一個位置
            const newRoute = [locationCustomer, ...routeCustomers.map((rc, idx) => ({ ...rc, order: idx + 2 }))]
            setRouteCustomers(newRoute)
            calculateRouteDistanceAndTime(newRoute)
          }
        },
        (error) => {
          console.error('Error getting location:', error)
          alert('No se pudo obtener la ubicación actual')
        }
      )
    } else {
      alert('Geolocalización no disponible en este navegador')
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Panel izquierdo - Lista de clientes y ruta */}
        <div className="lg:col-span-1 space-y-6">
          {/* Lista de clientes disponibles */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Clientes Disponibles</h2>
              <p className="text-sm text-gray-600">{filteredCustomers.length} clientes encontrados</p>
            </div>
            <div className="max-h-96 overflow-y-auto">
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
                          <div className="flex items-center mt-1">
                            <MapPin className="w-3 h-3 text-gray-400 mr-1" />
                            <span className="text-xs text-gray-500">{displayCity(customer) || customer.city || customer.province}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => addCustomerToRoute(customer)}
                          className="ml-2 p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Agregar a la ruta"
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
                  <p className="text-gray-600">Agrega clientes para crear una ruta</p>
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
                          <h3 className="text-sm font-medium text-gray-900 truncate">{customer.name}</h3>
                          <p className="text-xs text-gray-600 truncate">{customer.company}</p>
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
        </div>

        {/* Panel derecho - Mapa y detalles */}
        <div className="lg:col-span-3 space-y-6">
          {/* Mapa de la ruta */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Mapa de la Ruta</h2>
              <p className="text-sm text-gray-600">Visualización de la ruta planificada</p>
            </div>
            <div className="h-[1100px] relative">
              {routeCustomers.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Route className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Sin ruta planificada</h3>
                    <p className="text-gray-600">Agrega clientes de la lista izquierda para crear una ruta</p>
                  </div>
                </div>
              ) : (
                <div className="h-full relative">
                  <iframe
                    className="w-full h-full border-0"
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                    src={routeCustomers.length === 1 
                      ? `https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(getAddress(routeCustomers[0]))}&language=es`
                      : `https://www.google.com/maps/embed/v1/directions?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&origin=${encodeURIComponent(getAddress(routeCustomers[0]))}&destination=${encodeURIComponent(getAddress(routeCustomers[routeCustomers.length - 1]))}&waypoints=${routeCustomers.slice(1, -1).map(c => encodeURIComponent(getAddress(c))).join('|')}&mode=driving&language=es`}
                  />
                  {/* My Location button on map */}
                  <button
                    onClick={getCurrentLocation}
                    className="absolute top-4 right-4 bg-white rounded-lg shadow-md p-2 hover:bg-gray-50"
                    title="Mi Ubicación"
                  >
                    <MapPinIcon className="w-5 h-5 text-blue-600" />
                  </button>
                  <div className="absolute top-4 left-4 bg-white rounded-lg shadow-md p-3 max-w-xs">
                    <h3 className="font-medium text-gray-900 mb-2">Ruta Actual</h3>
                    <div className="text-xs text-gray-600 space-y-1">
                      <div className="flex justify-between">
                        <span>Paradas:</span>
                        <span className="font-medium">{routeCustomers.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Distancia:</span>
                        <span className="font-medium">{totalDistance.toFixed(1)} km</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tiempo:</span>
                        <span className="font-medium">{Math.floor(totalDuration / 60)}h {Math.round(totalDuration % 60)}min</span>
                      </div>
                    </div>
                    <button
                      onClick={startNavigation}
                      className="w-full mt-2 inline-flex items-center justify-center space-x-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Navegar</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Panel de detalles del cliente */}
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
      </div>

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
              <h3 className="text-lg font-semibold text-gray-900">Rutas Guardadas</h3>
              <button
                onClick={() => setShowLoadModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {savedRoutes.length === 0 ? (
              <div className="text-center py-8">
                <Route className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No hay rutas guardadas</p>
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
      )}
    </div>
  )
}
