import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, Customer } from '../lib/supabase'
import { translations } from '../lib/translations'
import {
  Plus,
  MapPin,
  User,
  Phone,
  Mail,
  Navigation,
  ExternalLink,
  Clock,
  Trash2,
  GripVertical,
  Search,
  Route,
  X
} from 'lucide-react'

interface RouteCustomer extends Customer {
  order: number
  distance?: number // km
  duration?: number // minutes
}
export default function RoutePlanning() {
  const { user } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [routeCustomers, setRouteCustomers] = useState<RouteCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProvince, setSelectedProvince] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [totalDistance, setTotalDistance] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  const t = translations
  // Map provider switch: default to Leaflet for zero-cost mode
  const mapProvider: 'google' | 'leaflet' = (import.meta as any).env?.VITE_MAP_PROVIDER === 'google' ? 'google' : 'leaflet'

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
`;
  // 城市和省份處理邏輯 - 與 Maps 頁面完全一致
  const extractCityForDisplay = (notes?: string): string => {
    if (!notes) return ''
    const match = notes.match(/Ciudad:\s*([^\n|]+)/i)
    return match ? match[1].trim() : ''
  }

  const isProvinceName = (s?: string) => /^(huelva|c(a|á)diz)$/i.test(String(s || '').trim())

  const toCanonicalProvince = (v?: string): string => {
    const s = String(v || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
    if (s === 'huelva') return 'Huelva'
    if (s === 'cadiz') return 'Cádiz'
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

  // 添加客戶到路線
  const addCustomerToRoute = (customer: Customer) => {
    const routeCustomer: RouteCustomer = {
      ...customer,
      order: routeCustomers.length + 1
    }
    setRouteCustomers([...routeCustomers, routeCustomer])
  }

  // 從路線移除客戶
  const removeFromRoute = (customerId: string) => {
    const newRoute = routeCustomers
      .filter(rc => rc.id !== customerId)
      .map((rc, index) => ({ ...rc, order: index + 1 }))
    setRouteCustomers(newRoute)
  }

  // 重新排序路線
  const reorderRoute = (startIndex: number, endIndex: number) => {
    const result = Array.from(routeCustomers)
    const [removed] = result.splice(startIndex, 1)
    result.splice(endIndex, 0, removed)
    
    // 重新分配順序號碼
    const reorderedRoute = result.map((rc, index) => ({ ...rc, order: index + 1 }))
    setRouteCustomers(reorderedRoute)
  }

  // 清空路線
  const clearRoute = () => {
    setRouteCustomers([])
    setTotalDistance(0)
    setTotalDuration(0)
  }

  // 優化路線順序 (簡單版本 - 可後續改善)
  const optimizeRoute = () => {
    // TODO: 實作路線優化算法
    console.log('Route optimization - to be implemented')
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
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900">Planificación de Rutas (legado)</h1>
      <p className="text-sm text-gray-600 mt-2">
        Esta pantalla ha sido desactivada. Usa la página <strong>Visitas</strong> para la planificación con Leaflet + OSM.
      </p>
      <div className="mt-4 text-sm text-gray-700">
        Distancia total (estimada): {totalDistance.toFixed(1)} km
        {mapProvider !== 'leaflet' && (
          <>
            {' '}• Tiempo estimado: {Math.floor(totalDuration / 60)}h {totalDuration % 60}min
          </>
        )}
      </div>
    </div>
  )
}
const __LEGACY__ = `
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
                  <User className="w-8 h-8 text-gray-400 mx-auto mb-2" />
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
                        <div className="flex items-center space-x-2">
                          <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />
                          <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-blue-600 font-medium text-xs">{index + 1}</span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-gray-900 truncate">{customer.name}</h3>
                          <p className="text-xs text-gray-600 truncate">{customer.company}</p>
                          <div className="flex items-center mt-1">
                            <MapPin className="w-3 h-3 text-gray-400 mr-1" />
                            <span className="text-xs text-gray-500">{displayCity(customer) || customer.city}</span>
                          </div>
                          {customer.distance && customer.duration && (
                            <div className="flex items-center mt-1 space-x-2 text-xs text-gray-500">
                              <span>{customer.distance.toFixed(1)} km</span>
                              <span>•</span>
                              <span>{customer.duration} min</span>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => removeFromRoute(customer.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Quitar de la ruta"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
              </div>
            )}
          </div>
        </div>
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Mapa de la Ruta</h2>
              <p className="text-sm text-gray-600">Visualización de la ruta planificada</p>
            </div>
            <div className="h-[800px] relative">
              {routeCustomers.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <Route className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Sin ruta planificada</h3>
                    <p className="text-gray-600">Agrega clientes de la lista izquierda para crear una ruta</p>
                  </div>
                </div>
              ) : (
                <div className="h-full bg-gray-100 flex items-center justify-center">
                  <div className="text-center">
                    <MapPin className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Mapa de Google Maps</h3>
                    <p className="text-gray-600 mb-4">
                      Ruta con {routeCustomers.length} paradas planificadas
                    </p>
                    <button
                      onClick={startNavigation}
                      className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Abrir en Google Maps</span>
                    </button>
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
