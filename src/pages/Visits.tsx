import React, { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, Visit, Customer } from '../lib/supabase'
import { translations } from '../lib/translations'
import {
  Plus,
  Calendar,
  Clock,
  MapPin,
  User,
  CheckCircle,
  XCircle,
  AlertCircle,
  Edit,
  Trash2,
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'

export default function Visits() {
  const { user } = useAuth()
  const [visits, setVisits] = useState<Visit[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedProvince, setSelectedProvince] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null)
  const [customerDetail, setCustomerDetail] = useState<Customer | null>(null)
  const t = translations

  useEffect(() => {
    if (!user?.id) return
    loadData()
  }, [user?.id])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // Cargar visitas
      const { data: visitsData, error: visitsError } = await supabase
        .from('visits')
        .select(`
          *,
          customer:customers (
            id,
            name,
            company,
            city,
            address,
            phone,
            mobile_phone,
            email,
            province,
            notes
          )
        `)
        .eq('created_by', user?.id)
        .order('scheduled_at', { ascending: true })
      
      if (visitsError) throw visitsError
      
      // Cargar clientes usando API
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

      console.log('[Visits] Final customers data:', customersData?.length || 0, 'records')

      setVisits((visitsData || []) as Visit[])
      setCustomers(customersData || [])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  // 顯示用城市：優先從 notes 解析 "Ciudad: xxx"，否則使用 city 欄位
  const extractCityForDisplay = (notes?: string): string => {
    if (!notes) return ''
    const match = notes.match(/Ciudad:\s*([^\n|]+)/i)
    return match ? match[1].trim() : ''
  }

  const isProvinceName = (s?: string) => /^(huelva|c(a|á)diz)$/i.test(String(s || '').trim())

  const displayCity = (customer?: Customer): string => {
    if (!customer) return ''
    const fromNotes = extractCityForDisplay(customer.notes)
    if (fromNotes) return fromNotes
    const city = String(customer.city || '').trim()
    if (city && !isProvinceName(city)) return city
    return ''
  }

  const deleteVisit = async (id: string) => {
    if (!confirm(t.visits.confirmDelete)) return
    
    try {
      const { error } = await supabase
        .from('visits')
        .delete()
        .eq('id', id)
      
      if (error) throw error
      setVisits(visits.filter(v => v.id !== id))
    } catch (error) {
      console.error('Error deleting visit:', error)
      alert(t.visits.deleteError)
    }
  }

  const updateVisitStatus = async (id: string, status: 'programada' | 'completada' | 'cancelada' | 'reprogramada') => {
    try {
      const { error } = await supabase
        .from('visits')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
      
      if (error) throw error
      
      setVisits(visits.map(v => 
        v.id === id ? { ...v, status: status as 'programada' | 'completada' | 'cancelada' | 'reprogramada' } : v
      ))
    } catch (error) {
      console.error('Error updating visit status:', error)
      alert(t.visits.updateError)
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatTime = (time: string) => {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completada':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'cancelada':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'reprogramada':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />
      default:
        return <Clock className="w-5 h-5 text-blue-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completada':
        return 'bg-green-100 text-green-800'
      case 'cancelada':
        return 'bg-red-100 text-red-800'
      case 'reprogramada':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-blue-100 text-blue-800'
    }
  }

  // 省份和城市數據
  const provinces = ['Cádiz', 'Huelva']
  const municipiosByProvince: Record<string, string[]> = {
    'Cádiz': ['Cádiz', 'Jerez de la Frontera', 'Algeciras', 'San Fernando', 'El Puerto de Santa María', 'Chiclana de la Frontera', 'Sanlúcar de Barrameda', 'La Línea de la Concepción', 'Puerto Real', 'Barbate'],
    'Huelva': ['Huelva', 'Lepe', 'Almonte', 'Moguer', 'Ayamonte', 'Isla Cristina', 'Valverde del Camino', 'Cartaya', 'Palos de la Frontera', 'Bollullos Par del Condado']
  }

  const availableCities = selectedProvince ? municipiosByProvince[selectedProvince] || [] : []

  // 輔助函數 - 重命名避免重複定義
  const isProvinceNameFilter = (v?: string) => {
    const s = String(v || '').trim().toLowerCase()
    return s === 'huelva' || s === 'cádiz' || s === 'cadiz'
  }

  const displayProvince = (c?: Customer): string => {
    if (!c) return ''
    // 先使用資料表中的 province 欄位
    if (c.province && String(c.province).trim().length > 0) {
      return String(c.province).trim()
    }
    if (c.city && isProvinceNameFilter(c.city)) return c.city
    if (c.notes) {
      const m = c.notes.match(/Provincia:\s*([^\n]+)/i)
      if (m) return m[1].trim()
    }
    return ''
  }

  const filteredCustomers = customers.filter(customer => {
    const matchesProvince = !selectedProvince || displayProvince(customer) === selectedProvince
    const matchesCity = !selectedCity || displayCity(customer) === selectedCity
    return matchesProvince && matchesCity
  })

  const filteredVisits = visits.filter(visit => {
    const matchesStatus = !selectedStatus || visit.status === selectedStatus
    const visitDate = new Date(visit.scheduled_at)
    const filterDate = selectedDate
    const matchesDate = visitDate.toDateString() === filterDate.toDateString()
    const matchesCustomer = !selectedCustomer || visit.customer_id === selectedCustomer
    
    // 如果選擇了省份或城市，檢查訪問的客戶是否符合條件
    if (selectedProvince || selectedCity) {
      const customer = customers.find(c => c.id === visit.customer_id)
      if (!customer) return false
      
      const customerProvince = displayProvince(customer)
      const customerCity = displayCity(customer)
      
      const matchesProvince = !selectedProvince || customerProvince === selectedProvince
      const matchesCity = !selectedCity || customerCity === selectedCity
      
      if (!matchesProvince || !matchesCity) return false
    }
    
    return matchesStatus && matchesDate && matchesCustomer
  })

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1))
    setSelectedDate(newDate)
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
          <h1 className="text-2xl font-bold text-gray-900">{t.visits.title}</h1>
          <p className="text-gray-600">{t.visits.subtitle}</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          <span>{t.visits.scheduleVisit}</span>
        </button>
      </div>

      {/* Filtros y navegación de fecha */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex flex-col gap-4">
          {/* Navegación de fecha */}
          <div className="flex items-center justify-center space-x-4">
            <button
              onClick={() => navigateDate('prev')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900">
                {formatDate(selectedDate.toISOString())}
              </h3>
            </div>
            <button
              onClick={() => navigateDate('next')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          
          {/* Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
              <select
                value={selectedProvince}
                onChange={(e) => {
                  setSelectedProvince(e.target.value)
                  setSelectedCity('')
                  setSelectedCustomer('')
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Todas</option>
                {provinces.map(province => (
                  <option key={province} value={province}>{province}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
              <select
                value={selectedCity}
                onChange={(e) => {
                  setSelectedCity(e.target.value)
                  setSelectedCustomer('')
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!selectedProvince}
              >
                <option value="">Todas</option>
                {availableCities.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
              <select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Seleccionar cliente</option>
                {filteredCustomers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} - {customer.company}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">{t.visits.allStatuses}</option>
                <option value="programada">Programada</option>
                <option value="completada">Completada</option>
                <option value="cancelada">Cancelada</option>
                <option value="reprogramada">Reprogramada</option>
              </select>
            </div>
          </div>
          
          <div className="flex items-center justify-center">
            <input
              type="date"
              value={selectedDate.toISOString().split('T')[0]}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Lista de visitas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        {filteredVisits.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {visits.length === 0 ? t.visits.noVisits : t.visits.noVisitsForDate}
            </h3>
            <p className="text-gray-600 mb-4">
              {visits.length === 0 ? t.visits.scheduleFirstVisit : t.visits.selectDifferentDate}
            </p>
            {visits.length === 0 && (
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                <span>{t.visits.scheduleVisit}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredVisits.map((visit) => (
              <div key={visit.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      {getStatusIcon(visit.status)}
                      <button
                        onClick={() => setCustomerDetail(visit.customer as Customer)}
                        className="text-lg font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        title="Ver detalles del cliente"
                      >
                        {visit.customer?.name || 'Cliente sin nombre'}
                      </button>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(visit.status)}`}>
                        {t.visits[visit.status as keyof typeof t.visits] || visit.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 mb-2 flex flex-wrap gap-x-3 gap-y-1">
                      <span>
                        <span className="font-medium">Teléfono:</span>{' '}
                        {visit.customer?.phone ? (
                          <a href={`tel:${visit.customer.phone}`} className="text-blue-600 hover:underline">{visit.customer.phone}</a>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </span>
                      <span>
                        <span className="font-medium">Móvil:</span>{' '}
                        {visit.customer?.mobile_phone ? (
                          <a href={`tel:${visit.customer.mobile_phone}`} className="text-blue-600 hover:underline">{visit.customer.mobile_phone}</a>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </span>
                      <span>
                        <span className="font-medium">Email:</span>{' '}
                        {visit.customer?.email ? (
                          <a href={`mailto:${visit.customer.email}`} className="text-blue-600 hover:underline">{visit.customer.email}</a>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Clock className="w-4 h-4" />
                          <span>{formatTime(new Date(visit.scheduled_at).toTimeString().slice(0, 5))}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <User className="w-4 h-4" />
                          <span>{visit.customer?.company || 'Sin empresa'}</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <MapPin className="w-4 h-4" />
                          <span>{displayCity(visit.customer) || 'Sin ciudad'}</span>
                        </div>
                        <div className="text-xs text-gray-700">
                          <span className="font-medium">Dirección:</span>{' '}
                          {visit.customer?.address ? (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${visit.customer.address || ''} ${displayCity(visit.customer) || ''}`.trim())}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                              title="Abrir en Google Maps"
                            >
                              {visit.customer.address}
                            </a>
                          ) : (
                            <span className="text-gray-500">Sin dirección</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {visit.purpose && (
                      <div className="mt-3">
                        <p className="text-sm text-gray-700">
                          <strong>{t.visits.purpose}:</strong> {visit.purpose}
                        </p>
                      </div>
                    )}
                    
                    {visit.notes && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-600">{visit.notes}</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-2 ml-4">
                    {visit.status === 'programada' && (
                      <>
                        <button
                          onClick={() => updateVisitStatus(visit.id, 'completada')}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                          title={t.visits.markCompleted}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => updateVisitStatus(visit.id, 'cancelada')}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          title={t.visits.cancelled}
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setEditingVisit(visit)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteVisit(visit.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modales */}
      {showAddModal && (
        <VisitModal
          customers={customers}
          onClose={() => setShowAddModal(false)}
          onSave={(visit) => {
            setVisits([visit, ...visits])
            setShowAddModal(false)
          }}
        />
      )}
      
      {editingVisit && (
        <VisitModal
          visit={editingVisit}
          customers={customers}
          onClose={() => setEditingVisit(null)}
          onSave={(visit) => {
            setVisits(visits.map(v => v.id === visit.id ? visit : v))
            setEditingVisit(null)
          }}
        />
      )}

      {customerDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-lg rounded-lg shadow-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{customerDetail.name}</h3>
                <p className="text-gray-600">{customerDetail.company || 'Sin empresa'}</p>
              </div>
              <button onClick={() => setCustomerDetail(null)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>

            <div className="space-y-3 text-sm text-gray-700">
              <div>
                <span className="font-medium">Teléfono: </span>
                {customerDetail.phone ? (
                  <a href={`tel:${customerDetail.phone}`} className="text-blue-600 hover:underline">{customerDetail.phone}</a>
                ) : (
                  <span className="text-gray-500">-</span>
                )}
              </div>
              <div>
                <span className="font-medium">Móvil: </span>
                {customerDetail.mobile_phone ? (
                  <a href={`tel:${customerDetail.mobile_phone}`} className="text-blue-600 hover:underline">{customerDetail.mobile_phone}</a>
                ) : (
                  <span className="text-gray-500">-</span>
                )}
              </div>
              <div>
                <span className="font-medium">Email: </span>
                {customerDetail.email ? (
                  <a href={`mailto:${customerDetail.email}`} className="text-blue-600 hover:underline">{customerDetail.email}</a>
                ) : (
                  <span className="text-gray-500">-</span>
                )}
              </div>
              <div>
                <span className="font-medium">Ciudad: </span>
                <span>{displayCity(customerDetail) || '-'}</span>
              </div>
              <div>
                <span className="font-medium">Dirección: </span>
                {customerDetail.address ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${customerDetail.address || ''} ${displayCity(customerDetail) || ''}`.trim())}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                    title="Abrir en Google Maps"
                  >
                    {customerDetail.address}
                  </a>
                ) : (
                  <span className="text-gray-500">-</span>
                )}
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button onClick={() => setCustomerDetail(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Modal para agregar/editar visita
interface VisitModalProps {
  visit?: Visit
  customers: Customer[]
  onClose: () => void
  onSave: (visit: Visit) => void
}

function VisitModal({ visit, customers, onClose, onSave }: VisitModalProps) {
  const { user } = useAuth()
  const [formData, setFormData] = useState({
    customer_id: visit?.customer_id || '',
    scheduled_date: visit?.scheduled_at ? new Date(visit.scheduled_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    scheduled_time: visit?.scheduled_at ? new Date(visit.scheduled_at).toTimeString().slice(0, 5) : '09:00',
    purpose: visit?.purpose || '',
    notes: visit?.notes || '',
    status: visit?.status || 'programada'
  })
  const [loading, setLoading] = useState(false)
  const [modalCustomers, setModalCustomers] = useState<Customer[]>(customers)
  const t = translations
  const selectedCustomer = modalCustomers.find(c => c.id === formData.customer_id)

  // 省/市用於過濾客戶下拉選單（不持久化到資料庫）
  const [selectedProvince, setSelectedProvince] = useState<string>('')
  const [selectedCity, setSelectedCity] = useState<string>('')

  // 當 modal 打開時，如果沒有客戶資料，直接重新載入
  useEffect(() => {
    if (customers.length === 0 && user?.id) {
      console.log('[VisitModal] No customers provided, loading directly...')
      loadModalCustomers()
    } else {
      setModalCustomers(customers)
    }
  }, [customers.length, user?.id])

  const loadModalCustomers = async () => {
    if (!user?.id) return
    try {
      let { data: customersData, error } = await supabase
        .from('customers')
        .select('*')
        .eq('created_by', user.id)
        .order('name')

      if (error) throw error

      // 如果沒有資料，嘗試不加過濾
      if (!customersData || customersData.length === 0) {
        console.log('[VisitModal] No customers for user, trying fallback...')
        const fallback = await supabase
          .from('customers')
          .select('*')
          .order('name')
        if (!fallback.error && fallback.data) {
          customersData = fallback.data
        }
      }

      console.log('[VisitModal] Loaded customers:', customersData?.length || 0)
      setModalCustomers(customersData || [])
    } catch (error) {
      console.error('[VisitModal] Error loading customers:', error)
    }
  }

  // 從客戶資料提取省份與城市
  const normalizeCity = (c?: string) => (c || '').trim()
  
  // 從 notes 中提取省份資訊
  const extractProvinceFromNotes = (notes?: string): string => {
    if (!notes) return ''
    const match = notes.match(/Provincia:\s*([^\n|]+)/i)
    return match ? match[1].trim() : ''
  }
  
  // 從 notes 中提取城市資訊
  const extractCityFromNotes = (notes?: string): string => {
    if (!notes) return ''
    const match = notes.match(/Ciudad:\s*([^\n|]+)/i)
    return match ? match[1].trim() : ''
  }
  
  // 正規化狀態值，對齊資料庫允許的西班牙文枚舉
  const normalizeStatus = (raw?: string): 'programada' | 'completada' | 'cancelada' | 'reprogramada' => {
    const s = String(raw || '').trim().toLowerCase()
    if (['programada', 'scheduled', 'schedule', 'pending', 'pendiente'].includes(s)) return 'programada'
    if (['completada', 'completed', 'complete', 'done', 'hecho'].includes(s)) return 'completada'
    if (['cancelada', 'canceled', 'cancelled', 'cancel'].includes(s)) return 'cancelada'
    if (['reprogramada', 'rescheduled', 'reschedule', 'reprogramado', 'reprogramar'].includes(s)) return 'reprogramada'
    return 'programada'
  }
  
  const deriveProvince = (customer: Customer) => {
    // 1. 優先使用 province 欄位
    if (customer.province && customer.province.trim().length > 0) {
      return customer.province.trim()
    }
    
    // 2. 從 notes 中提取 "Provincia: xxx"
    const provinceFromNotes = extractProvinceFromNotes(customer.notes)
    if (provinceFromNotes) return provinceFromNotes
    
    // 3. 根據 city 欄位推斷（Huelva 是省也是市）
    const city = normalizeCity(customer.city)
    if (/^huelva$/i.test(city)) return 'Huelva'
    if (/^c(a|á)diz$/i.test(city)) return 'Cádiz'
    
    return ''
  }
  
  const deriveCity = (customer: Customer) => {
    // 1. 從 notes 中提取 "Ciudad: xxx"（這是實際的市鎮）
    const cityFromNotes = extractCityFromNotes(customer.notes)
    if (cityFromNotes) return cityFromNotes
    
    // 2. 如果 city 欄位不是省名，則使用 city 欄位
    const city = normalizeCity(customer.city)
    if (city && !/^(huelva|c(a|á)diz)$/i.test(city)) {
      return city
    }
    
    return ''
  }

  const allProvinces = Array.from(
    new Set(
      modalCustomers
        .map(c => deriveProvince(c))
        .filter(p => p && p.length > 0)
    )
  ).sort()

  const allCities = Array.from(
    new Set(
      modalCustomers
        .filter(c => !selectedProvince || deriveProvince(c) === selectedProvince)
        .map(c => deriveCity(c))
        .filter(city => city && city.length > 0)
    )
  ).sort()

  const filteredCustomers = modalCustomers.filter(c => {
    // 確保當前已選客戶永遠在清單中，避免被過濾掉後需要重選
    if (formData.customer_id && c.id === formData.customer_id) return true
    const provinceOk = !selectedProvince || deriveProvince(c) === selectedProvince
    const cityOk = !selectedCity || deriveCity(c) === selectedCity
    return provinceOk && cityOk
  })

  // 依目前選中客戶，初始化省/市（僅在尚未選擇時帶入）
  useEffect(() => {
    if (!selectedCustomer) return
    const p = deriveProvince(selectedCustomer)
    const c = deriveCity(selectedCustomer)
    setSelectedProvince(prev => prev || p)
    setSelectedCity(prev => prev || c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer?.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (visit) {
        // Actualizar visita existente
        const scheduledDateTime = new Date(`${formData.scheduled_date}T${formData.scheduled_time}:00.000Z`)
        
        const updateData = {
          customer_id: formData.customer_id,
          scheduled_at: scheduledDateTime.toISOString(),
          status: formData.status as 'programada' | 'completada' | 'cancelada' | 'reprogramada',
          notes: [formData.purpose, formData.notes].filter(Boolean).join('\n') || null,
          updated_at: new Date().toISOString()
        }

        const { data, error } = await supabase
          .from('visits')
          .update(updateData)
          .eq('id', visit.id)
          .select(`
            *,
            customer:customers (
              id,
              name,
              company,
              city,
              address,
              phone,
              mobile_phone,
              email,
              province,
              notes
            )
          `)
          .single()
        
        if (error) throw error
        onSave(data)
      } else {
        // Crear nueva visita
        // 合併日期和時間為完整的 timestamp
        const scheduledDateTime = new Date(`${formData.scheduled_date}T${formData.scheduled_time}:00.000Z`)
        
        if (!user?.id) throw new Error('No authenticated user found for creating visit')

        let visitData = {
          customer_id: formData.customer_id,
          scheduled_at: scheduledDateTime.toISOString(),
          // 移除 status，交由資料庫預設 'programada'，以避免 CHECK 約束 23514
          notes: [formData.purpose, formData.notes].filter(Boolean).join('\n') || null,
          created_by: user.id
        }

        console.log('[VisitModal] Inserting visit data:', visitData)

        // Enhanced retry with exponential backoff for PostgREST schema cache (PGRST204)
        const minimalVisitData = {
          customer_id: formData.customer_id,
          scheduled_at: scheduledDateTime.toISOString(),
          // 仍不帶 status，讓 DB 預設
          notes: [formData.purpose, formData.notes].filter(Boolean).join('\n') || null,
          created_by: user.id
        }

        let data: any = null
        let error: any = null
        for (let attempt = 1; attempt <= 3; attempt++) {
          const payload = attempt === 1 ? visitData : minimalVisitData
          console.log(`[VisitModal] Insert attempt ${attempt} with payload:`, payload)
          const res = await supabase
            .from('visits')
            .insert(payload)
            .select(`
              *,
              customer:customers (
                id,
                name,
                company,
                city,
                address,
                phone,
                mobile_phone,
                email,
                province,
                notes
              )
            `)
            .single()
          data = res.data
          error = res.error
          console.log(`[VisitModal] Insert attempt ${attempt} result:`, res)
          if (!error) break
          if ((error as any).code === 'PGRST204' && attempt < 3) {
            const delay = 500 * Math.pow(2, attempt - 1)
            console.warn(`[VisitModal] Schema cache error (PGRST204). Waiting ${delay}ms before retry...`)
            await new Promise(r => setTimeout(r, delay))
            continue
          }
          // 若仍出現狀態檢核錯誤（理論上不會，因為不再發送 status），短暫延遲後重試
          if ((error as any).code === '23514' && String((error as any).message || '').includes('visits_status_check') && attempt < 3) {
            const delay = 300
            console.warn(`[VisitModal] Status check failed even without status field. Retrying after ${delay}ms...`)
            await new Promise(r => setTimeout(r, delay))
            continue
          }
          break
        }
        
        if (error) {
          console.error('[VisitModal] Insert error:', error)
          throw error
        }
        onSave(data)
      }
    } catch (error) {
      console.error('Error saving visit:', error)
      alert(visit ? t.visits.updateError : t.visits.createError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">
            {visit ? t.visits.editVisit : t.visits.scheduleVisit}
          </h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Provincia / Ciudad 篩選（僅影響下方客戶清單） */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Provincia
                </label>
                <select
                  value={selectedProvince}
                  onChange={(e) => {
                    setSelectedProvince(e.target.value)
                    // 變更省份時重置城市
                    setSelectedCity('')
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Todas</option>
                  {allProvinces.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ciudad
                </label>
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={allCities.length === 0}
                >
                  <option value="">Todas</option>
                  {allCities.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.visits.customer} *
              </label>
              <select
                required
                value={formData.customer_id}
                onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">{t.visits.selectCustomer}</option>
                {filteredCustomers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} - {customer.company || 'Sin empresa'} {customer.city ? `(${customer.city})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {selectedCustomer && (
              <div className="mt-3 p-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700">
                <div className="font-medium text-gray-900">{selectedCustomer.name}</div>
                <div className="text-gray-600 mb-1">{selectedCustomer.company || 'Sin empresa'}</div>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <div>
                    <span className="font-medium">Teléfono:</span>{' '}
                    {selectedCustomer.phone ? (
                      <a href={`tel:${selectedCustomer.phone}`} className="text-blue-600 hover:underline">{selectedCustomer.phone}</a>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </div>
                  <div>
                    <span className="font-medium">Email:</span>{' '}
                    {selectedCustomer.email ? (
                      <a href={`mailto:${selectedCustomer.email}`} className="text-blue-600 hover:underline">{selectedCustomer.email}</a>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </div>
                </div>
                {(selectedCustomer.city || selectedCustomer.address) && (
                  <div className="mt-1 text-gray-600">
                    <span className="font-medium">Dirección:</span>{' '}
                    {selectedCustomer.address || '-'}{selectedCustomer.city ? `, ${selectedCustomer.city}` : ''}
                    {Boolean(selectedCustomer.address || selectedCustomer.city) && (
                      <>
                        {' '}
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedCustomer.address || ''} ${selectedCustomer.city || ''}`.trim())}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline ml-1"
                          title="Abrir en Google Maps"
                        >
                          (Google Maps)
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.visits.date} *
                </label>
                <input
                  type="date"
                  required
                  value={formData.scheduled_date}
                  onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.visits.time} *
                </label>
                <input
                  type="time"
                  required
                  value={formData.scheduled_time}
                  onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.visits.purpose}
              </label>
              <input
                type="text"
                value={formData.purpose}
                onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t.visits.purposePlaceholder}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.visits.status}
              </label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as 'programada' | 'completada' | 'cancelada' | 'reprogramada' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="programada">Programada</option>
                <option value="completada">Completada</option>
                <option value="cancelada">Cancelada</option>
                <option value="reprogramada">Reprogramada</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.visits.notes}
              </label>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t.visits.notesPlaceholder}
              />
            </div>
            
            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? t.common.saving : t.common.save}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}