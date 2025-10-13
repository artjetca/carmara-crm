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
  ChevronRight,
  Printer,
  Route
} from 'lucide-react'

export default function Visits() {
  const { user } = useAuth()
  const [visits, setVisits] = useState<Visit[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedStatus, setSelectedStatus] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null)
  const [showRoutePlan, setShowRoutePlan] = useState(false)
  const t = translations

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // Cargar visitas
      const { data: visitsData, error: visitsError } = await supabase
        .from('visits')
        .select(`
          *,
          customers (
            id,
            name,
            company,
            city,
            address
          )
        `)
        .eq('created_by', user?.id)
        .order('scheduled_date', { ascending: true })
      
      if (visitsError) throw visitsError
      
      // Cargar clientes
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .eq('created_by', user?.id)
        .order('name')
      
      if (customersError) throw customersError
      
      setVisits(visitsData || [])
      setCustomers(customersData || [])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
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

  const updateVisitStatus = async (id: string, status: 'pending' | 'completed' | 'cancelled') => {
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
        v.id === id ? { ...v, status } : v
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
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'pending':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />
      default:
        return <Clock className="w-5 h-5 text-blue-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'cancelled':
        return 'bg-red-100 text-red-800'
      case 'pending':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-blue-100 text-blue-800'
    }
  }

  const filteredVisits = visits.filter(visit => {
    const matchesStatus = !selectedStatus || visit.status === selectedStatus
    const visitDate = new Date(visit.scheduled_date)
    const filterDate = selectedDate
    const matchesDate = visitDate.toDateString() === filterDate.toDateString()
    return matchesStatus && matchesDate
  })

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1))
    setSelectedDate(newDate)
  }

  const handlePrintRoute = () => {
    setShowRoutePlan(true)
    // Wait for the route plan to render before printing
    setTimeout(() => {
      window.print()
      // Close the print view after printing or canceling
      setTimeout(() => {
        setShowRoutePlan(false)
      }, 500)
    }, 100)
  }

  // Sort filtered visits by time for route planning
  const sortedVisits = [...filteredVisits].sort((a, b) => {
    return a.scheduled_time.localeCompare(b.scheduled_time)
  })

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
        <div className="flex gap-2">
          {filteredVisits.length > 0 && (
            <button
              onClick={handlePrintRoute}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Printer className="w-4 h-4" />
              <span>Descargar PDF</span>
            </button>
          )}
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            <span>{t.visits.scheduleVisit}</span>
          </button>
        </div>
      </div>

      {/* Filtros y navegación de fecha */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Navegación de fecha */}
          <div className="flex items-center space-x-4">
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
          
          {/* Filtro de estado */}
          <div className="flex items-center space-x-4">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">{t.visits.allStatuses}</option>
              <option value="scheduled">{t.visits.scheduled}</option>
              <option value="pending">{t.visits.pending}</option>
              <option value="completed">{t.visits.completed}</option>
              <option value="cancelled">{t.visits.cancelled}</option>
            </select>
            
            <input
              type="date"
              value={selectedDate.toISOString().split('T')[0]}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Ruta Planificada - Print View */}
      {showRoutePlan && (
        <div className="print-only fixed inset-0 bg-white z-50 p-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-6">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Ruta Planificada</h1>
              <h2 className="text-xl text-gray-700">{formatDate(selectedDate.toISOString())}</h2>
              <p className="text-gray-600 mt-2">{sortedVisits.length} paradas programadas</p>
            </div>
            
            <div className="space-y-4">
              {sortedVisits.map((visit, index) => (
                <div key={visit.id} className="border border-gray-300 rounded-lg p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-bold text-gray-900">{visit.customer?.name}</h3>
                        <span className="text-lg font-semibold text-blue-600">{formatTime(visit.scheduled_time)}</span>
                      </div>
                      <p className="text-gray-700 font-medium">{visit.customer?.company}</p>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-2 text-gray-600">
                          <MapPin className="w-4 h-4" />
                          <span>{visit.customer?.address}, {visit.customer?.city}</span>
                        </div>
                        {visit.customer?.phone && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <span className="font-medium">Tel:</span>
                            <span>{visit.customer.phone}</span>
                          </div>
                        )}
                        {visit.purpose && (
                          <div className="text-gray-700 mt-2">
                            <span className="font-medium">Propósito:</span> {visit.purpose}
                          </div>
                        )}
                        {visit.notes && (
                          <div className="text-gray-600 mt-1 text-sm">
                            <span className="font-medium">Notas:</span> {visit.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-6 text-center text-sm text-gray-500">
              <p>Generado el {new Date().toLocaleString('es-ES')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Lista de visitas */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 screen-only">
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
            {sortedVisits.map((visit) => (
              <div key={visit.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      {getStatusIcon(visit.status)}
                      <h3 className="text-lg font-medium text-gray-900">
                        {visit.customer?.name}
                      </h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(visit.status)}`}>
                        {t.visits[visit.status as keyof typeof t.visits] || visit.status}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Clock className="w-4 h-4" />
                          <span>{formatTime(visit.scheduled_time)}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <User className="w-4 h-4" />
                          <span>{visit.customer?.company}</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <MapPin className="w-4 h-4" />
                          <span>{visit.customer?.city}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {visit.customer?.address}
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
                    {visit.status === 'pending' && (
                      <>
                        <button
                          onClick={() => updateVisitStatus(visit.id, 'completed')}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                          title={t.visits.markCompleted}
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => updateVisitStatus(visit.id, 'cancelled')}
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
    scheduled_date: visit?.scheduled_date?.split('T')[0] || new Date().toISOString().split('T')[0],
    scheduled_time: visit?.scheduled_time || '09:00',
    purpose: visit?.purpose || '',
    notes: visit?.notes || '',
    status: visit?.status || 'scheduled'
  })
  const [loading, setLoading] = useState(false)
  const t = translations

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (visit) {
        // Actualizar visita existente
        const { data, error } = await supabase
          .from('visits')
          .update({
            ...formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', visit.id)
          .select(`
            *,
            customers (
              id,
              name,
              company,
              city,
              address
            )
          `)
          .single()
        
        if (error) throw error
        onSave(data)
      } else {
        // Crear nueva visita
        const { data, error } = await supabase
          .from('visits')
          .insert({
            ...formData,
            user_id: user?.id
          })
          .select(`
            *,
            customers (
              id,
              name,
              company,
              city,
              address
            )
          `)
          .single()
        
        if (error) throw error
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
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} - {customer.company}
                  </option>
                ))}
              </select>
            </div>
            
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
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="scheduled">{t.visits.scheduled}</option>
                <option value="pending">{t.visits.pending}</option>
                <option value="completed">{t.visits.completed}</option>
                <option value="cancelled">{t.visits.cancelled}</option>
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