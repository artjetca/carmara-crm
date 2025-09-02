import React, { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, Customer } from '../lib/supabase'
import { translations } from '../lib/translations'
import {
  Phone,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Filter,
  Clock,
  User,
  Calendar,
  Send,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  CheckCircle,
  XCircle,
  Trash2
} from 'lucide-react'

interface Call {
  id: string
  from_user: string
  to_user: string
  type: 'incoming' | 'outgoing'
  duration: number
  notes: string
  created_at: string
  status: string
  signal?: any
  from_profile?: {
    id: string
    name: string
    email: string
    full_name: string
  }
  to_profile?: {
    id: string
    name: string
    email: string
    full_name: string
  }
}

interface ScheduledMessage {
  id: string
  // Runtime may have either customer_ids (array) or single customer_id
  customer_ids?: string[]
  customer_id?: string
  message: string
  scheduled_for: string
  status: 'pending' | 'sent' | 'failed'
  error_message?: string
  created_at: string
  created_by?: string
  user_id?: string
  type?: 'sms' | 'email'
  subject?: string
  creator_profile?: {
    id: string
    name: string
    email: string
    full_name: string
  }
}

// Helper to delete a scheduled message in DB
const deleteScheduledMessage = async (id: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('scheduled_messages')
      .delete()
      .eq('id', id)
    if (error) throw error
    return true
  } catch (err) {
    console.error('Error deleting message:', err)
    alert('No se pudo eliminar el mensaje. Ver logs para más detalles.')
    return false
  }
}

// Test Email Form Component
const TestEmailForm = () => {
  const [testEmail, setTestEmail] = useState('')
  const [testSubject, setTestSubject] = useState('Prueba de Email - Casmara CRM')
  const [testMessage, setTestMessage] = useState('Este es un email de prueba desde el sistema Casmara CRM. Si recibes este mensaje, la configuración está funcionando correctamente.')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const sendTestEmail = async () => {
    if (!testEmail.trim()) {
      alert('Por favor ingresa un email de destino')
      return
    }

    setSending(true)
    setResult(null)

    try {
      const response = await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: testEmail,
          subject: testSubject,
          message: testMessage,
          type: 'email'
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setResult(`✅ Email enviado exitosamente a ${testEmail}`)
        // Show success notification for 3 seconds
        setTimeout(() => {
          setResult(null)
        }, 3000)
      } else {
        setResult(`❌ Error: ${data.error || 'Error desconocido'}`)
      }
    } catch (error) {
      setResult(`❌ Error de conexión: ${error}`)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email de destino
          </label>
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="tu-email@ejemplo.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Asunto
          </label>
          <input
            type="text"
            value={testSubject}
            onChange={(e) => setTestSubject(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Mensaje
        </label>
        <textarea
          value={testMessage}
          onChange={(e) => setTestMessage(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="flex items-center space-x-4">
        <button
          onClick={sendTestEmail}
          disabled={sending}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          <Send className="w-4 h-4" />
          <span>{sending ? 'Enviando...' : 'Enviar Email de Prueba'}</span>
        </button>
      </div>

      {result && (
        <div className={`p-3 rounded-lg ${result.includes('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {result}
        </div>
      )}
    </div>
  )
}

export default function Communications() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'calls' | 'messages'>('calls')
  const [calls, setCalls] = useState<Call[]>([])
  const [messages, setMessages] = useState<ScheduledMessage[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProvince, setSelectedProvince] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [showCallModal, setShowCallModal] = useState(false)
  const [showMessageModal, setShowMessageModal] = useState(false)
  const t = translations

  useEffect(() => {
    if (user?.id) {
      loadData()
    } else if (user === null) {
      // User is not authenticated, stop loading
      setLoading(false)
    }
  }, [user])

  const loadData = async () => {
    try {
      setLoading(true)
      
      // Verificar que el usuario esté autenticado antes de cargar datos
      if (!user?.id) {
        console.warn('User not authenticated, skipping data load')
        setLoading(false)
        return
      }
      
      // Cargar llamadas
      const { data: callsData, error: callsError } = await supabase
        .from('calls')
        .select(`
          *,
          from_profile:profiles!calls_from_user_fkey (
            id,
            name,
            email,
            full_name
          ),
          to_profile:profiles!calls_to_user_fkey (
            id,
            name,
            email,
            full_name
          )
        `)
        .eq('from_user', user.id)
        .order('created_at', { ascending: false })
      
      if (callsError) throw callsError
      
      // Cargar mensajes programados
      const { data: messagesData, error: messagesError } = await supabase
        .from('scheduled_messages')
        .select(`
        *,
        creator_profile:profiles!scheduled_messages_created_by_fkey (
          id,
          name,
          email,
          full_name
        )
      `)
      .order('scheduled_for', { ascending: true })
      
      if (messagesError) throw messagesError
      
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
      // 不過濾客戶，顯示所有客戶數據（與 Programación de Visitas 一致）
      // customersData = customersData.filter((customer: any) => customer.created_by === user?.id)
      
      setCalls(callsData || [])
      setMessages(messagesData || [])
      setCustomers(customersData || [])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Delete handler bound to state
  const handleDeleteMessage = async (id: string) => {
    const ok = await deleteScheduledMessage(id)
    if (ok) {
      setMessages(prev => prev.filter(m => m.id !== id))
    }
  }

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getCallIcon = (type: string) => {
    return type === 'incoming' ? (
      <PhoneIncoming className="w-4 h-4 text-green-500" />
    ) : (
      <PhoneOutgoing className="w-4 h-4 text-blue-500" />
    )
  }

  const getMessageStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />
    }
  }

  const getMessageStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-yellow-100 text-yellow-800'
    }
  }

  // Helpers (must be declared before first use)
  const isProvinceName = (v?: string) => {
    const s = String(v || '').trim().toLowerCase()
    return s === 'huelva' || s === 'cádiz' || s === 'cadiz' || s === 'ceuta'
  }

  const extractCityForDisplay = (notes?: string): string => {
    if (!notes) return ''
    const m = notes.match(/Ciudad:\s*([^\n]+)/i)
    return m ? m[1].trim() : ''
  }

  const displayCity = (c?: Customer): string => {
    if (!c) return ''
    const cityFromNotes = extractCityForDisplay(c.notes)
    if (cityFromNotes) return cityFromNotes
    const city = String(c.city || '').trim()
    if (city) return city
    return ''
  }

  const displayProvince = (c?: Customer): string => {
    if (!c) return ''
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
  }

  // 省份和城市數據
  const provinces = ['Cádiz', 'Huelva', 'Ceuta']
  const municipiosByProvince: Record<string, string[]> = {
    'Cádiz': [
      'Alcalá de los Gazules', 'Alcalá del Valle', 'Algar', 'Algeciras', 'Algodonales', 'Arcos de la Frontera',
      'Barbate', 'Los Barrios', 'Benalup-Casas Viejas', 'Benaocaz', 'Bornos', 'El Bosque', 'Cádiz',
      'Castellar de la Frontera', 'Chiclana de la Frontera', 'Chipiona', 'Conil de la Frontera', 'Espera',
      'El Gastor', 'Grazalema', 'Jerez de la Frontera', 'Jimena de la Frontera', 'La Línea de la Concepción',
      'Medina Sidonia', 'Olvera', 'Paterna de Rivera', 'Prado del Rey', 'El Puerto de Santa María',
      'Puerto Real', 'Puerto Serrano', 'Rota', 'San Fernando', 'San José del Valle', 'Sanlúcar de Barrameda',
      'San Martín del Tesorillo', 'San Roque', 'Setenil de las Bodegas', 'Tarifa', 'Torre Alháquime',
      'Trebujena', 'Ubrique', 'Vejer de la Frontera', 'Villaluenga del Rosario', 'Villamartín', 'Zahara'
    ],
    'Huelva': [
      'Huelva', 'Lepe', 'Almonte', 'Moguer', 'Ayamonte', 'Isla Cristina', 'Valverde del Camino', 'Cartaya',
      'Palos de la Frontera', 'Bollullos Par del Condado', 'Aljaraque', 'El Almendro', 'Aracena', 'Aroche',
      'Bonares', 'Chucena', 'Corrales', 'Cortegana', 'Cumbres Mayores', 'Galaroza', 'Hinojales',
      'Lucena del Puerto', 'Manzanilla', 'Mazagón', 'Nerva', 'El Repilado', 'San Juan del Puerto',
      'Trigueros', 'Villalba del Alcor', 'Villanueva de los Castillejos'
    ],
    'Ceuta': ['Ceuta']
  }

  // Obtener todas las ciudades únicas de los clientes existentes
  const customerCities = Array.from(new Set(
    customers.map(c => displayCity(c)).filter(city => city.length > 0)
  )).sort()
  
  // Combinar ciudades predefinidas con ciudades de clientes
  const predefinedCities = selectedProvince ? municipiosByProvince[selectedProvince] || [] : []
  const allCities = Array.from(new Set([...predefinedCities, ...customerCities])).sort()
  const availableCities = selectedProvince 
    ? allCities.filter(city => {
        // Si hay provincia seleccionada, mostrar ciudades predefinidas + ciudades de clientes de esa provincia
        const clientsInProvince = customers.filter(c => displayProvince(c) === selectedProvince)
        const citiesInProvince = clientsInProvince.map(c => displayCity(c)).filter(city => city.length > 0)
        return predefinedCities.includes(city) || citiesInProvince.includes(city)
      })
    : allCities

  // 輔助函數（moved above before first usage）

  const filteredCustomers = customers.filter(customer => {
    const matchesProvince = !selectedProvince || displayProvince(customer) === selectedProvince
    const matchesCity = !selectedCity || displayCity(customer) === selectedCity
    const matchesCustomer = !selectedCustomer || customer.id === selectedCustomer
    const matchesSearch = !searchTerm || (
      customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    
    return matchesProvince && matchesCity && matchesCustomer && matchesSearch
  })

  const filteredCalls = calls.filter(call => {
    const contactName = call.type === 'incoming' 
      ? (call.from_profile?.full_name || call.from_profile?.name || '')
      : (call.to_profile?.full_name || call.to_profile?.name || '')
    const contactEmail = call.type === 'incoming'
      ? (call.from_profile?.email || '')
      : (call.to_profile?.email || '')
    
    return contactName.toLowerCase().includes(searchTerm.toLowerCase()) ||
           contactEmail.toLowerCase().includes(searchTerm.toLowerCase())
  })

  const filteredMessages = messages.filter(message => 
    message.creator_profile?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    message.creator_profile?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    message.message.toLowerCase().includes(searchTerm.toLowerCase())
  )

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
          <h1 className="text-2xl font-bold text-gray-900">{t.communications.title}</h1>
          <p className="text-gray-600">{t.communications.subtitle}</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowCallModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Phone className="w-4 h-4" />
            <span>{t.communications.logCall}</span>
          </button>
          <button
            onClick={() => setShowMessageModal(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <MessageSquare className="w-4 h-4" />
            <span>{t.communications.scheduleMessage}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('calls')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'calls'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Phone className="w-4 h-4" />
                <span>{t.communications.calls}</span>
                <span className="bg-gray-100 text-gray-600 py-1 px-2 rounded-full text-xs">
                  {calls.length}
                </span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('messages')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'messages'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <MessageSquare className="w-4 h-4" />
                <span>{t.communications.messages}</span>
                <span className="bg-gray-100 text-gray-600 py-1 px-2 rounded-full text-xs">
                  {messages.length}
                </span>
              </div>
            </button>
          </nav>
        </div>

        {/* Filtros */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col gap-4">
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
                  disabled={false}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder={t.communications.searchPlaceholder}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Test Email Section */}
        <div className="p-6 border-b border-gray-200 bg-blue-50">
          <div className="max-w-2xl">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              🧪 Probar Envío de Email
            </h3>
            <TestEmailForm />
          </div>
        </div>

        {/* Contenido de las tabs */}
        <div className="p-6">
          {activeTab === 'calls' ? (
            <CallsList calls={filteredCalls} />
          ) : (
            <MessagesList messages={filteredMessages} onDelete={handleDeleteMessage} />
          )}
        </div>
      </div>

      {/* Modales */}
      {showCallModal && (
        <CallModal
          customers={customers}
          onClose={() => setShowCallModal(false)}
          onSave={(call) => {
            setCalls([call, ...calls])
            setShowCallModal(false)
          }}
        />
      )}
      
      {showMessageModal && (
        <MessageModal
          customers={customers}
          onClose={() => setShowMessageModal(false)}
          onSave={(message) => {
            // After saving potentially many rows, reload from DB for accuracy
            loadData()
            setShowMessageModal(false)
          }}
        />
      )}
    </div>
  )
}

// Componente para lista de llamadas
function CallsList({ calls }: { calls: Call[] }) {
  const t = translations

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getCallIcon = (type: string) => {
    return type === 'incoming' ? (
      <PhoneIncoming className="w-4 h-4 text-green-500" />
    ) : (
      <PhoneOutgoing className="w-4 h-4 text-blue-500" />
    )
  }

  if (calls.length === 0) {
    return (
      <div className="text-center py-12">
        <Phone className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">{t.communications.noCalls}</h3>
        <p className="text-gray-600">{t.communications.logFirstCall}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {calls.map((call) => (
        <div key={call.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                {getCallIcon(call.type)}
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-medium text-gray-900">
                    {call.type === 'outgoing' ? call.to_profile?.full_name || call.to_profile?.name : call.from_profile?.full_name || call.from_profile?.name}
                  </h3>
                  <span className="text-xs text-gray-500">
                    {call.type === 'outgoing' ? call.to_profile?.email : call.from_profile?.email}
                  </span>
                </div>
                <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                  <span>{formatDate(call.created_at)}</span>
                  <span>{formatDuration(call.duration)}</span>
                  <span>{call.type === 'incoming' ? t.communications.incoming : t.communications.outgoing}</span>
                </div>
                {call.notes && (
                  <p className="text-sm text-gray-600 mt-2">{call.notes}</p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {/* Phone action removed as profiles don't have phone field */}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Componente para lista de mensajes
function MessagesList({ messages, onDelete }: { messages: ScheduledMessage[]; onDelete: (id: string) => Promise<void> | void }) {
  const t = translations
  const [selectedMessages, setSelectedMessages] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState(false)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getMessageStatusIcon = (status: string) => {
    switch (status) {
      case 'sent':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />
    }
  }

  const getMessageStatusColor = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-yellow-100 text-yellow-800'
    }
  }

  const handleSelectMessage = (messageId: string) => {
    setSelectedMessages(prev => 
      prev.includes(messageId) 
        ? prev.filter(id => id !== messageId)
        : [...prev, messageId]
    )
  }

  const handleSelectAll = () => {
    if (selectedMessages.length === messages.length) {
      setSelectedMessages([])
    } else {
      setSelectedMessages(messages.map(m => m.id))
    }
  }

  const handleBatchDelete = async () => {
    if (selectedMessages.length === 0) return
    
    const confirmDelete = confirm(`¿Estás seguro de que quieres eliminar ${selectedMessages.length} mensaje(s)?`)
    if (!confirmDelete) return

    setIsDeleting(true)
    try {
      for (const messageId of selectedMessages) {
        await onDelete(messageId)
      }
      setSelectedMessages([])
    } catch (error) {
      console.error('Error deleting messages:', error)
      alert('Error al eliminar algunos mensajes')
    } finally {
      setIsDeleting(false)
    }
  }

  const sentMessages = messages.filter(m => m.status === 'sent')
  const hasSentMessages = sentMessages.length > 0

  if (messages.length === 0) {
    return (
      <div className="text-center py-12">
        <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">{t.communications.noMessages}</h3>
        <p className="text-gray-600">{t.communications.scheduleFirstMessage}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Batch Actions Header */}
      {hasSentMessages && (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={selectedMessages.length === messages.length}
                onChange={handleSelectAll}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Seleccionar todos ({messages.length})
              </span>
            </label>
            {selectedMessages.length > 0 && (
              <span className="text-sm text-gray-600">
                {selectedMessages.length} seleccionado(s)
              </span>
            )}
          </div>
          
          {selectedMessages.length > 0 && (
            <button
              onClick={handleBatchDelete}
              disabled={isDeleting}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isDeleting ? 'Eliminando...' : `Eliminar ${selectedMessages.length}`}</span>
            </button>
          )}
        </div>
      )}

      {/* Messages List */}
      {messages.map((message) => (
        <div key={message.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              {hasSentMessages && (
                <div className="flex-shrink-0 pt-1">
                  <input
                    type="checkbox"
                    checked={selectedMessages.includes(message.id)}
                    onChange={() => handleSelectMessage(message.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
              )}
              <div className="flex-shrink-0">
                <MessageSquare className="w-4 h-4 text-green-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-medium text-gray-900">
                    Creado por: {message.creator_profile?.full_name || message.creator_profile?.name || 'Usuario desconocido'}
                  </h3>
                  <span className="text-xs text-gray-500">
                    {(message.customer_ids?.length || (message.customer_id ? 1 : 0))} destinatario(s)
                  </span>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getMessageStatusColor(message.status)}`}>
                    {message.status === 'sent' ? 'Enviado' : message.status === 'failed' ? 'Fallido' : 'Pendiente'}
                  </span>
                </div>
                <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                  <span>{formatDate(message.scheduled_for)}</span>
                  <span>MENSAJE</span>
                </div>
                <p className="text-sm text-gray-600 mt-1 line-clamp-2">{message.message}</p>
                {message.error_message && (
                  <p className="text-sm text-red-600 mt-1">{message.error_message}</p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                title="Eliminar"
                className="p-1 rounded hover:bg-red-50"
                onClick={() => onDelete(message.id)}
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
              {getMessageStatusIcon(message.status)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Modal para registrar llamada
interface CallModalProps {
  customers: Customer[]
  onClose: () => void
  onSave: (call: Call) => void
}

function CallModal({ customers, onClose, onSave }: CallModalProps) {
  const { user } = useAuth()
  const [formData, setFormData] = useState({
    from_user: '',
    to_user: '',
    type: 'outgoing' as 'incoming' | 'outgoing',
    duration: 0,
    notes: '',
    status: 'completed'
  })
  const [loading, setLoading] = useState(false)
  const t = translations
  const selectedId = formData.type === 'outgoing' ? formData.to_user : formData.from_user
  const selectedCustomer = customers.find(c => c.id === selectedId)
  const cityFromNotes = selectedCustomer?.notes?.match(/Ciudad:\s*([^\n]+)/i)?.[1]?.trim() || ''
  const cityForMap = cityFromNotes || (selectedCustomer?.city || '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data, error } = await supabase
        .from('calls')
        .insert({
          ...formData,
          from_user: formData.type === 'outgoing' ? user?.id : formData.from_user,
          to_user: formData.type === 'incoming' ? user?.id : formData.to_user
        })
        .select(`
          *,
          from_profile:profiles!calls_from_user_fkey (
            id,
            name,
            email,
            full_name
          ),
          to_profile:profiles!calls_to_user_fkey (
            id,
            name,
            email,
            full_name
          )
        `)
        .single()
      
      if (error) throw error
      onSave(data)
    } catch (error) {
      console.error('Error saving call:', error)
      alert(t.communications.callSaveError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">{t.communications.logCall}</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {formData.type === 'outgoing' ? 'Llamar a' : 'Llamada de'} *
              </label>
              <select
                required
                value={formData.type === 'outgoing' ? formData.to_user : formData.from_user}
                onChange={(e) => setFormData({ 
                  ...formData, 
                  [formData.type === 'outgoing' ? 'to_user' : 'from_user']: e.target.value 
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Seleccionar usuario</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} - {customer.company}
                  </option>
                ))}
              </select>
            </div>

            {selectedCustomer && (
              <div className="border rounded-lg p-3 bg-gray-50 text-sm text-gray-700">
                <div className="font-semibold text-gray-900">{selectedCustomer.name}</div>
                <div className="text-gray-600">{selectedCustomer.company || 'Sin empresa'}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <span>
                    <span className="font-medium">Teléfono:</span>{' '}
                    {selectedCustomer.phone ? (
                      <a href={`tel:${selectedCustomer.phone}`} className="text-blue-600 hover:underline">{selectedCustomer.phone}</a>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </span>
                  <span>
                    <span className="font-medium">Móvil:</span>{' '}
                    {selectedCustomer.mobile_phone ? (
                      <a href={`tel:${selectedCustomer.mobile_phone}`} className="text-blue-600 hover:underline">{selectedCustomer.mobile_phone}</a>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </span>
                  <span>
                    <span className="font-medium">Email:</span>{' '}
                    {selectedCustomer.email ? (
                      <a href={`mailto:${selectedCustomer.email}`} className="text-blue-600 hover:underline">{selectedCustomer.email}</a>
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </span>
                </div>
                <div className="mt-1">
                  <span className="font-medium">Dirección:</span>{' '}
                  {selectedCustomer.address ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedCustomer.address || ''} ${cityForMap || ''}`.trim())}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                      title="Abrir en Google Maps"
                    >
                      {selectedCustomer.address}
                    </a>
                  ) : (
                    <span className="text-gray-500">Sin dirección</span>
                  )}
                </div>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.communications.callType}
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'incoming' | 'outgoing' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="outgoing">{t.communications.outgoing}</option>
                <option value="incoming">{t.communications.incoming}</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.communications.duration} ({t.communications.seconds})
              </label>
              <input
                type="number"
                min="0"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.communications.notes}
              </label>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t.communications.callNotesPlaceholder}
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
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
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

// Modal para programar mensaje
interface MessageModalProps {
  customers: Customer[]
  onClose: () => void
  onSave: (message: ScheduledMessage) => void
}

function MessageModal({ customers, onClose, onSave }: MessageModalProps) {
  const { user } = useAuth()
  const [formData, setFormData] = useState({
    customer_ids: [] as string[],
    type: 'sms' as 'sms' | 'email',
    subject: '',
    message: '',
    schedules: [
      { date: new Date().toISOString().split('T')[0], time: '09:00' }
    ] as { date: string; time: string }[]
  })
  const [loading, setLoading] = useState(false)
  const t = translations
  // 省/市用於過濾客戶下拉選單（不持久化到資料庫）
  const [selectedProvince, setSelectedProvince] = useState<string>('')
  const [selectedCity, setSelectedCity] = useState<string>('')
  // 單選加入用的暫存 id
  const [customerToAdd, setCustomerToAdd] = useState<string>('')

  // 本地 Province/City 常數（與 Visits 一致）
  const provinces = ['Cádiz', 'Huelva', 'Ceuta']
  const municipiosByProvince: Record<string, string[]> = {
    'Cádiz': [
      'Alcalá de los Gazules', 'Alcalá del Valle', 'Algar', 'Algeciras', 'Algodonales', 'Arcos de la Frontera',
      'Barbate', 'Los Barrios', 'Benalup-Casas Viejas', 'Benaocaz', 'Bornos', 'El Bosque', 'Cádiz',
      'Castellar de la Frontera', 'Chiclana de la Frontera', 'Chipiona', 'Conil de la Frontera', 'Espera',
      'El Gastor', 'Grazalema', 'Jerez de la Frontera', 'Jimena de la Frontera', 'La Línea de la Concepción',
      'Medina Sidonia', 'Olvera', 'Paterna de Rivera', 'Prado del Rey', 'El Puerto de Santa María',
      'Puerto Real', 'Puerto Serrano', 'Rota', 'San Fernando', 'San José del Valle', 'Sanlúcar de Barrameda',
      'San Martín del Tesorillo', 'San Roque', 'Setenil de las Bodegas', 'Tarifa', 'Torre Alháquime',
      'Trebujena', 'Ubrique', 'Vejer de la Frontera', 'Villaluenga del Rosario', 'Villamartín', 'Zahara'
    ],
    'Huelva': [
      'Huelva', 'Lepe', 'Almonte', 'Moguer', 'Ayamonte', 'Isla Cristina', 'Valverde del Camino', 'Cartaya',
      'Palos de la Frontera', 'Bollullos Par del Condado', 'Aljaraque', 'El Almendro', 'Aracena', 'Aroche',
      'Bonares', 'Chucena', 'Corrales', 'Cortegana', 'Cumbres Mayores', 'Galaroza', 'Hinojales',
      'Lucena del Puerto', 'Manzanilla', 'Mazagón', 'Nerva', 'El Repilado', 'San Juan del Puerto',
      'Trigueros', 'Villalba del Alcor', 'Villanueva de los Castillejos'
    ],
    'Ceuta': ['Ceuta']
  }

  // 本地輔助：從 notes/欄位推導省市
  const isProvinceName = (v?: string) => /^(huelva|c(a|á)diz|ceuta)$/i.test(String(v || '').trim())
  
  const extractFromNotes = (notes: string | undefined, key: 'Provincia' | 'Ciudad') => {
    if (!notes) return ''
    const m = notes.match(new RegExp(`${key}:\\s*([^\\n|]+)`, 'i'))
    return m ? m[1].trim() : ''
  }
  
  // 將省份字串正規化為統一格式（處理 Cadiz/Cádiz 差異）
  const normalizeProvince = (val: string) => {
    const s = String(val || '').trim().toLowerCase()
    if (s === 'cadiz' || s === 'cádiz') return 'Cádiz'
    if (s === 'huelva') return 'Huelva'
    if (s === 'ceuta') return 'Ceuta'
    return val?.trim() || ''
  }

  const deriveProvince = (c: Customer) => {
    const p = String(c.province || '').trim()
    if (p) return normalizeProvince(p)
    const fromNotes = extractFromNotes(c.notes, 'Provincia')
    if (fromNotes) return normalizeProvince(fromNotes)
    const city = String(c.city || '').trim()
    // City equals province
    if (/^huelva$/i.test(city)) return 'Huelva'
    if (/^c(a|á)diz$/i.test(city)) return 'Cádiz'
    if (/^ceuta$/i.test(city)) return 'Ceuta'
    // Infer province by municipality membership
    if (municipiosByProvince['Huelva']?.some(m => m.toLowerCase() === city.toLowerCase())) return 'Huelva'
    if (municipiosByProvince['Cádiz']?.some(m => m.toLowerCase() === city.toLowerCase())) return 'Cádiz'
    if (municipiosByProvince['Ceuta']?.some(m => m.toLowerCase() === city.toLowerCase())) return 'Ceuta'
    return ''
  }
  
  const deriveCity = (c: Customer) => {
    const fromNotes = extractFromNotes(c.notes, 'Ciudad')
    if (fromNotes) return fromNotes
    const city = String(c.city || '').trim()
    if (city) return city
    return ''
  }

  // 當前在下拉中選擇的客戶（用於顯示聯絡方式與地址）
  const selectedCustomers = customers.filter(c => formData.customer_ids.includes(c.id))

  // 依省市過濾顧客
  const modalFilteredCustomers = customers.filter(c => {
    // 確保當前已選客戶永遠在清單中，避免被過濾掉
    if (formData.customer_ids?.includes(c.id)) return true
    const provinceOk = !selectedProvince || deriveProvince(c) === selectedProvince
    const cityOk = !selectedCity || deriveCity(c) === selectedCity
    return provinceOk && cityOk
  })

  // 可加入清單（不含已選）
  const addableCustomers = modalFilteredCustomers.filter(c => !formData.customer_ids.includes(c.id))

  // 加入與移除選取的客戶（單選 + 準備清單）
  const addSelectedCustomer = () => {
    if (!customerToAdd) return
    if (!formData.customer_ids.includes(customerToAdd)) {
      setFormData({ ...formData, customer_ids: [...formData.customer_ids, customerToAdd] })
    }
    setCustomerToAdd('')
  }

  const removeSelectedCustomer = (id: string) => {
    setFormData({ ...formData, customer_ids: formData.customer_ids.filter(cid => cid !== id) })
  }

  // Send immediate emails for email type messages
  const sendImmediateEmails = async (rows: any[], formData: any) => {
    try {
      for (const row of rows) {
        const customer = customers.find(c => row.customer_ids.includes(c.id))
        if (customer?.email && formData.type === 'email') {
          const response = await fetch('/.netlify/functions/send-email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: customer.email,
              subject: formData.subject || 'Mensaje desde Casmara CRM',
              message: formData.message,
              type: 'email'
            })
          })
          
          if (!response.ok) {
            console.error(`Failed to send email to ${customer.email}`)
          }
        }
      }
    } catch (error) {
      console.error('Error sending immediate emails:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (!formData.customer_ids.length) {
        alert('Seleccione al menos un cliente')
        return
      }
      if (!formData.schedules.length) {
        alert('Agregue al menos una fecha y hora')
        return
      }

      // Usar las columnas que realmente existen: customer_ids, message, scheduled_for, status, created_by
      const rows = formData.customer_ids.flatMap(cid => {
        const customer = customers.find(c => c.id === cid)
        const customerName = customer ? `${customer.name} (${customer.company || 'Sin empresa'})` : cid
        
        return formData.schedules.map(s => ({
          customer_ids: [cid], // Array format for customer_ids column
          message: `${formData.type.toUpperCase()}: ${formData.message}${formData.type === 'email' && formData.subject ? ` (${formData.subject})` : ''} | Cliente: ${customerName}`,
          scheduled_for: new Date(`${s.date}T${s.time}:00`).toISOString(),
          status: 'pending',
          created_by: user?.id
        }))
      })

      const { data, error } = await supabase
        .from('scheduled_messages')
        .insert(rows)
        .select('*')

      if (error) throw error

      const insertedCount = Array.isArray(data) ? data.length : (data ? 1 : 0)
      
      // Send immediate emails for email type messages
      if (formData.type === 'email') {
        await sendImmediateEmails(rows, formData)
      }
      
      alert(`Mensaje programado correctamente. Filas insertadas: ${insertedCount}`)
      onSave(Array.isArray(data) ? data[0] : data)
    } catch (error: any) {
      console.error('Error saving message:', {
        message: error?.message,
        name: error?.name,
        details: error?.details,
        hint: error?.hint,
        code: error?.code
      })
      alert(t.communications.messageSaveError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">{t.communications.scheduleMessage}</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
                <select
                  value={selectedProvince}
                  onChange={(e) => {
                    setSelectedProvince(e.target.value)
                    setSelectedCity('')
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Todas</option>
                  {provinces.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                <select
                  value={selectedCity}
                  onChange={(e) => {
                    setSelectedCity(e.target.value)
                  }}
                  disabled={false}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Todas</option>
                  {selectedProvince ? (
                    // Mostrar ciudades predefinidas + ciudades de clientes de esa provincia
                    Array.from(new Set([
                      ...(municipiosByProvince[selectedProvince] || []),
                      ...customers.filter(c => deriveProvince(c) === selectedProvince).map(c => deriveCity(c)).filter(city => city.length > 0)
                    ])).sort().map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))
                  ) : (
                    // Si no hay provincia seleccionada, mostrar todas las ciudades de clientes
                    Array.from(new Set(customers.map(c => deriveCity(c)).filter(city => city.length > 0))).sort().map(city => (
                      <option key={city} value={city}>{city}</option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cliente(s) *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-7 gap-2 items-end">
                <div className="sm:col-span-5">
                  <select
                    value={customerToAdd}
                    onChange={(e) => setCustomerToAdd(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Seleccionar cliente</option>
                    {addableCustomers.map(customer => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name.toUpperCase()} - {customer.company || 'Sin empresa'} {deriveProvince(customer) ? `(${deriveProvince(customer)})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={addSelectedCustomer}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    disabled={!customerToAdd}
                    title="Añadir a la lista"
                  >
                    Añadir
                  </button>
                </div>
              </div>
              <div className="mt-3">
                {selectedCustomers.length === 0 ? (
                  <p className="text-sm text-gray-500">No hay clientes en la lista preparada.</p>
                ) : (
                  <div>
                    <div className="text-sm font-medium text-gray-700 mb-1">Lista preparada ({selectedCustomers.length})</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedCustomers.map(c => (
                        <span key={c.id} className="inline-flex items-center gap-2 px-2 py-1 rounded border text-sm bg-gray-50">
                          <span>{c.name}</span>
                          <button
                            type="button"
                            className="text-red-600 hover:text-red-800"
                            title="Quitar"
                            onClick={() => removeSelectedCustomer(c.id)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {selectedCustomers.length > 0 && (
              <div className="border rounded-lg p-3 bg-gray-50 text-sm text-gray-700">
                <div className="font-semibold text-gray-900">{selectedCustomers.length} cliente(s) seleccionados</div>
                <ul className="mt-1 list-disc list-inside space-y-0.5">
                  {selectedCustomers.slice(0, 5).map(c => (
                    <li key={c.id}>{c.name} — {c.company || 'Sin empresa'} ({deriveProvince(c) || '-'})</li>
                  ))}
                  {selectedCustomers.length > 5 && (
                    <li className="text-gray-500">… y {selectedCustomers.length - 5} más</li>
                  )}
                </ul>
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.communications.messageType}
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'sms' | 'email' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="sms">{t.communications.sms}</option>
                <option value="email">{t.communications.email}</option>
              </select>
            </div>
            
            {formData.type === 'email' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t.communications.subject}
                </label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.communications.message} *
              </label>
              <textarea
                required
                rows={4}
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={t.communications.messagePlaceholder}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fechas y horas</label>
              <div className="space-y-2">
                {formData.schedules.map((s, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-7 gap-2 items-end">
                    <div className="sm:col-span-3">
                      <input
                        type="date"
                        value={s.date}
                        onChange={(e) => {
                          const next = [...formData.schedules]
                          next[idx] = { ...next[idx], date: e.target.value }
                          setFormData({ ...formData, schedules: next })
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <input
                        type="time"
                        value={s.time}
                        onChange={(e) => {
                          const next = [...formData.schedules]
                          next[idx] = { ...next[idx], time: e.target.value }
                          setFormData({ ...formData, schedules: next })
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="sm:col-span-1 flex items-center gap-2">
                      <button
                        type="button"
                        className="px-2 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 w-full"
                        onClick={() => setFormData({ ...formData, schedules: [...formData.schedules, { date: s.date, time: s.time }] })}
                        title="Duplicar"
                      >
                        +
                      </button>
                      {formData.schedules.length > 1 && (
                        <button
                          type="button"
                          className="px-2 py-2 border border-red-300 rounded-lg text-red-700 hover:bg-red-50 w-full"
                          onClick={() => setFormData({ ...formData, schedules: formData.schedules.filter((_, i) => i !== idx) })}
                          title="Eliminar"
                        >
                          −
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <button
                  type="button"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  onClick={() => setFormData({ ...formData, schedules: [...formData.schedules, { date: formData.schedules[0]?.date || new Date().toISOString().split('T')[0], time: '09:00' }] })}
                >
                  Añadir fecha/hora
                </button>
              </div>
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