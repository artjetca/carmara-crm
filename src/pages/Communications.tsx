import React, { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, Customer } from '../lib/supabase'
import { translations } from '../lib/translations'
import { format } from 'date-fns'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'
import {
  Phone,
  Mail,
  MessageSquare,
  Plus,
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

interface AppointmentResponse {
  id: string
  message_id: string
  customer_id: string
  response_token: string
  response_type: 'confirm' | 'reschedule'
  responded_at: string | null
  customer_ip?: string
  customer_user_agent?: string
  created_at: string
  customers?: {
    name: string
    email: string
    company?: string
  }
  scheduled_messages?: {
    message: string
    scheduled_for: string
  }
}

interface ScheduledMessage {
  id: string
  customer_ids?: string[]
  customer_id?: string
  message: string
  scheduled_for: string
  status: 'pending' | 'sent' | 'failed'
  type?: 'email' | 'sms'
  error_message?: string
  created_by: string
  creator_profile?: {
    full_name?: string
    name?: string
  }
  include_confirmation?: boolean
}



export default function Communications() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'calls' | 'messages'>('calls')
  const [calls, setCalls] = useState<Call[]>([])
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([])
  const [appointmentResponses, setAppointmentResponses] = useState<AppointmentResponse[]>([])
  const [emailTracking, setEmailTracking] = useState<any[]>([])
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
      
      // Cargar respuestas de citas - TEMPORALMENTE DESHABILITADO (404 errors)
      /* 
      const { data: responsesData, error: responsesError } = await supabase
        .from('appointment_responses')
        .select('*')

      if (responsesError) {
        console.error('Error loading appointment responses:', responsesError)
      } else {
        setAppointmentResponses(responsesData || [])
      }
      */
      setAppointmentResponses([]) // Set empty array to avoid undefined

      // Cargar seguimiento de emails - TEMPORALMENTE DESHABILITADO (404 errors)
      /*
      const { data: trackingData, error: trackingError } = await supabase
        .from('email_tracking')
        .select('*')

      if (trackingError) {
        console.error('Error loading email tracking:', trackingError)
        console.log('Email tracking table might not exist yet')
        setEmailTracking([])
      } else {
        console.log('Email tracking data loaded:', trackingData)
        setEmailTracking(trackingData || [])
      }
      */
      setEmailTracking([]) // Set empty array to avoid undefined

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
      setScheduledMessages(messagesData || [])
      setCustomers(customersData)
      console.log(`Loaded ${messagesData?.length || 0} scheduled messages`)
    } catch (error) {
      console.error('Error loading scheduled messages:', error)
      setScheduledMessages([])
    } finally {
      setLoading(false)
    }
  }

  // Delete handler bound to state
  const handleDeleteMessage = async (id: string) => {
    try {
      const { error } = await supabase
        .from('scheduled_messages')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      // Remove from local state
      setScheduledMessages(prev => prev.filter(m => m.id !== id))
    } catch (error) {
      console.error('Error deleting message:', error)
      alert('Error al eliminar el mensaje')
    }
  }

  const handleSendNow = async (messageId: string) => {
    try {
      // Find the message
      const message = scheduledMessages.find(m => m.id === messageId)
      if (!message) {
        throw new Error('Mensaje no encontrado')
      }

      console.log('Processing message:', message)

      // Extract customer ID from message
      const customerId = message.customer_ids?.[0]
      if (!customerId) {
        throw new Error('ID del cliente no encontrado')
      }

      // Find customer
      const customer = customers.find(c => c.id === customerId)
      if (!customer?.email) {
        throw new Error(`Email del cliente no encontrado. Cliente: ${customer?.name || 'Desconocido'}`)
      }

      console.log('Sending to customer:', customer.name, customer.email)

      // Extract subject and content from message
      let subject = 'Mensaje desde Casmara CRM'
      let content = message.message
      let isHtml = false

      // Handle new message format: "Mensaje: content (subject)" or "SMS: content"
      if (content.startsWith('Mensaje:')) {
        content = content.replace(/^Mensaje:\s*/, '')
        
        // Try to extract subject if it's in parentheses at the end
        const subjectMatch = content.match(/\s*\(([^)]+)\)\s*$/)
        if (subjectMatch) {
          subject = subjectMatch[1]
          content = content.replace(/\s*\([^)]+\)\s*$/, '')
        }
        
        // Detect if content is HTML
        isHtml = content.includes('<') && content.includes('>')
      } else if (content.startsWith('EMAIL:')) {
        // Handle old format
        content = content.replace(/^EMAIL:\s*/, '')
        const subjectMatch = content.match(/\s*\(([^)]+)\)\s*$/)
        if (subjectMatch) {
          subject = subjectMatch[1]
          content = content.replace(/\s*\([^)]+\)\s*$/, '')
        }
        
        // Detect if content is HTML
        isHtml = content.includes('<') && content.includes('>')
      }

      const cleanContent = content.trim()

      // Validate required fields
      if (!customer.email || !subject || !cleanContent) {
        throw new Error(`Missing required fields: to=${!!customer.email}, subject=${!!subject}, message=${!!cleanContent}`)
      }

      console.log('Sending email with:', { to: customer.email, subject, content: cleanContent, isHtml })

      // Send email
      const response = await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: customer.email,
          subject,
          message: cleanContent,
          type: 'email',
          isHtml,
          messageId: messageId,
          customerId: customer.id,
          includeConfirmation: true // Always include confirmation for manual sends
        })
      })

      console.log('Email API response status:', response.status)

      const emailResult = await response.json()
      console.log('Email API result:', emailResult)

      if (response.ok && emailResult.success) {
        // Update message status to 'sent'
        const { error: updateError } = await supabase
          .from('scheduled_messages')
          .update({ status: 'sent' })
          .eq('id', messageId)

        if (updateError) {
          console.error('Error updating status to sent:', updateError)
          throw updateError
        }

        console.log('✅ Email sent successfully, status updated')
        
        // Refresh data to show updated status
        loadData()
        alert(`✅ Email enviado correctamente a ${customer.email}`)
      } else {
        console.error('Email sending failed:', emailResult)
        
        // Update message status to 'failed'
        await supabase
          .from('scheduled_messages')
          .update({ 
            status: 'failed',
            error_message: emailResult.error || 'Error desconocido'
          })
          .eq('id', messageId)

        loadData()
        throw new Error(emailResult.error || 'Error al enviar email')
      }
    } catch (error: any) {
      console.error('Error sending email:', error)
      
      // Update message status to 'failed' if not already done
      try {
        await supabase
          .from('scheduled_messages')
          .update({ 
            status: 'failed',
            error_message: error.message || 'Error desconocido'
          })
          .eq('id', messageId)
        
        loadData()
      } catch (updateError) {
        console.error('Error updating failed status:', updateError)
      }
      
      alert(`❌ Error al enviar email: ${error.message}`)
    }
  }

  // Trigger email scheduler manually
  const triggerEmailScheduler = async () => {
    try {
      const response = await fetch('/.netlify/functions/email-scheduler', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      const result = await response.json()
      
      if (response.ok) {
        alert(`✅ Programador ejecutado: ${result.processed || 0} emails enviados, ${result.failed || 0} fallidos`)
        // Reload messages to show updated statuses
        loadData()
      } else {
        alert(`❌ Error: ${result.error || 'Error desconocido'}`)
      }
    } catch (error) {
      console.error('Scheduler error:', error)
      alert(`❌ Error de conexión: ${error.message || error}`)
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
      minute: '2-digit',
      timeZone: 'Europe/Madrid'
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

  const filteredMessages = scheduledMessages.filter(message => 
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

  // Check authentication status
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center space-x-3">
            <XCircle className="w-6 h-6 text-red-600" />
            <div>
              <h3 className="text-lg font-medium text-red-800">Error de Autenticación</h3>
              <p className="text-red-700 mt-1">No está autenticado. Por favor, inicie sesión para acceder a las comunicaciones.</p>
              <button 
                onClick={() => window.location.href = '/login'}
                className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Ir a Iniciar Sesión
              </button>
            </div>
          </div>
        </div>
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
          {/* Auth Status Indicator */}
          <div className="flex items-center space-x-2 mt-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-sm text-green-700">Autenticado como: {user.email}</span>
          </div>
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
                  {scheduledMessages.length}
                </span>
              </div>
            </button>
          </nav>
        </div>

        {/* Filters removed as requested */}

        {/* Contenido de las tabs */}
        <div className="p-6">
          {activeTab === 'calls' ? (
            <CallsList calls={filteredCalls} />
          ) : (
            <MessagesList messages={filteredMessages} customers={customers} appointmentResponses={appointmentResponses} emailTracking={emailTracking} onDelete={handleDeleteMessage} onSendNow={handleSendNow} />
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
      minute: '2-digit',
      timeZone: 'Europe/Madrid'
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
function MessagesList({ messages, customers, appointmentResponses, emailTracking, onDelete, onSendNow }: { messages: ScheduledMessage[]; customers: Customer[]; appointmentResponses: AppointmentResponse[]; emailTracking: any[]; onDelete: (id: string) => Promise<void> | void; onSendNow: (id: string) => Promise<void> | void }) {
  const t = translations
  const [selectedMessages, setSelectedMessages] = useState<string[]>([])
  const [isDeleting, setIsDeleting] = useState(false)
  const [sendingMessages, setSendingMessages] = useState<string[]>([])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Madrid'
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

  const handleSendNow = async (messageId: string) => {
    setSendingMessages(prev => [...prev, messageId])
    try {
      await onSendNow(messageId)
    } catch (error) {
      console.error('Error sending message:', error)
      alert('Error al enviar el mensaje')
    } finally {
      setSendingMessages(prev => prev.filter(id => id !== messageId))
    }
  }

  // Extract customer name and email from message content
  const extractCustomerInfo = (message: string, customers: Customer[]) => {
    // Extract customer ID from message customer_ids or get first customer
    const messageObj = messages.find(m => m.message === message)
    if (messageObj?.customer_ids?.[0]) {
      const customer = customers.find(c => c.id === messageObj.customer_ids[0])
      if (customer) {
        return {
          name: customer.name,
          email: customer.email || 'Sin email',
          company: customer.company || 'Sin empresa'
        }
      }
    }
    
    // Fallback: extract from message text
    const match = message.match(/Cliente:\s*([^|]+)/)
    return {
      name: match ? match[1].trim() : 'Cliente desconocido',
      email: 'Sin email',
      company: 'Sin empresa'
    }
  }

  // Check if message is email type
  const isEmailMessage = (message: string) => {
    return message.startsWith('EMAIL:') || message.startsWith('Mensaje:')
  }

  const sentMessages = messages.filter(m => m.status === 'sent')
  const emailMessages = messages.filter(m => isEmailMessage(m.message))
  const hasSentMessages = sentMessages.length > 0
  const hasEmailMessages = emailMessages.length > 0

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
      {/* Batch Actions Header - Show for email messages */}
      {hasEmailMessages && (
        <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center space-x-4">
            <Mail className="w-5 h-5 text-blue-600" />
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={selectedMessages.length === emailMessages.length && emailMessages.length > 0}
                onChange={() => {
                  if (selectedMessages.length === emailMessages.length) {
                    setSelectedMessages([])
                  } else {
                    setSelectedMessages(emailMessages.map(m => m.id))
                  }
                }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Seleccionar todos los emails ({emailMessages.length})
              </span>
            </label>
            {selectedMessages.length > 0 && (
              <span className="text-sm text-blue-600">
                {selectedMessages.length} email(s) seleccionado(s)
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
              <span>{isDeleting ? 'Eliminando...' : `Eliminar ${selectedMessages.length} email(s)`}</span>
            </button>
          )}
        </div>
      )}

      {/* Messages List */}
      {messages.map((message) => {
        const customerInfo = extractCustomerInfo(message.message, customers)
        const isEmail = isEmailMessage(message.message)
        
        // Check for confirmation status
        const hasConfirmation = message.message.includes('|INCLUDE_CONFIRMATION:true|') || message.include_confirmation
        const messageResponse = appointmentResponses.find(r => r.message_id === message.id)
        
        // Check for email tracking status
        const emailTrack = emailTracking.find(t => t.message_id === message.id)
        const isEmailOpened = emailTrack?.opened_at
        
        return (
          <div key={message.id} className={`border rounded-lg p-3 sm:p-4 hover:bg-gray-50 ${isEmail ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200'}`}>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between space-y-3 sm:space-y-0">
              <div className="flex items-start space-x-2 sm:space-x-3 flex-1 min-w-0">
                {isEmail && (
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
                  {isEmail ? (
                    <Mail className="w-4 h-4 text-blue-500" />
                  ) : (
                    <MessageSquare className="w-4 h-4 text-green-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      <span className="sm:hidden">{isEmail ? 'Email' : 'SMS'}</span>
                      <span className="hidden sm:inline">{isEmail ? 'Mensaje' : 'SMS'}</span>
                      <span className="hidden sm:inline"> - </span>
                      <span className="block sm:inline">{customerInfo.name}</span>
                    </h3>
                    <div className="flex items-center space-x-2 text-xs text-gray-500">
                      <span className="hidden sm:inline">({customerInfo.email})</span>
                      <span>{(message.customer_ids?.length || (message.customer_id ? 1 : 0))} destinatario(s)</span>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getMessageStatusColor(message.status)}`}>
                        {message.status === 'sent' ? 'Enviado' : message.status === 'failed' ? 'Fallido' : 'Pendiente'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-1 sm:space-y-0 mt-1 text-xs text-gray-500">
                    <span>{formatDate(message.scheduled_for)}</span>
                    <span className="hidden sm:inline">Creado por: {message.creator_profile?.full_name || message.creator_profile?.name || 'Usuario desconocido'}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2 break-words">
                    {message.message.replace(/\|INCLUDE_CONFIRMATION:true\|/g, '').trim()}
                  </p>
                  {(hasConfirmation || isEmailOpened) && (
                    <div className="flex flex-wrap items-center gap-1 mt-2">
                      {isEmail && isEmailOpened && (
                        <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                          📖 Abierto {new Date(isEmailOpened).toLocaleDateString('es-ES', { 
                            day: '2-digit', 
                            month: '2-digit'
                          })}
                        </span>
                      )}
                      {hasConfirmation && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                          📅 Con confirmación
                        </span>
                      )}
                      {messageResponse?.responded_at && (
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          messageResponse.response_type === 'confirm' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {messageResponse.response_type === 'confirm' 
                            ? '✅ Confirmado' 
                            : '📅 Reprogramar'}
                        </span>
                      )}
                    </div>
                  )}
                  {message.error_message && (
                    <p className="text-sm text-red-600 mt-1 break-words">{message.error_message}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end space-x-2 flex-shrink-0">
                {/* Send Now button for pending email messages */}
                {isEmail && message.status === 'pending' && (
                  <button
                    title="Enviar ahora"
                    className="px-2 sm:px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => handleSendNow(message.id)}
                    disabled={sendingMessages.includes(message.id)}
                  >
                    <span className="sm:hidden">Enviar</span>
                    <span className="hidden sm:inline">{sendingMessages.includes(message.id) ? 'Enviando...' : 'Enviar ahora'}</span>
                  </button>
                )}
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
        )
      })}
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
  
  // Load saved form data from localStorage
  const loadSavedFormData = () => {
    try {
      const saved = localStorage.getItem('programar_mensaje_form')
      if (saved) {
        const parsedData = JSON.parse(saved)
        return {
          ...parsedData,
          schedules: parsedData.schedules || [
            { date: format(toZonedTime(new Date(), 'Europe/Madrid'), 'yyyy-MM-dd'), time: '09:00' }
          ]
        }
      }
    } catch (error) {
      console.error('Error loading saved form data:', error)
    }
    
    return {
      customer_ids: [] as string[],
      type: 'email' as 'sms' | 'email',
      subject: '',
      message: '',
      htmlContent: '',
      useHtml: false,
      includeConfirmation: false,
      schedules: [
        { date: format(toZonedTime(new Date(), 'Europe/Madrid'), 'yyyy-MM-dd'), time: '09:00' }
      ] as { date: string; time: string }[]
    }
  }
  
  const [formData, setFormData] = useState(loadSavedFormData())
  const [loading, setLoading] = useState(false)
  
  // Auto-save form data to localStorage whenever formData changes
  React.useEffect(() => {
    try {
      localStorage.setItem('programar_mensaje_form', JSON.stringify(formData))
    } catch (error) {
      console.error('Error saving form data:', error)
    }
  }, [formData])
  
  // Clear saved data when modal closes successfully
  const clearSavedData = () => {
    try {
      localStorage.removeItem('programar_mensaje_form')
    } catch (error) {
      console.error('Error clearing saved data:', error)
    }
  }
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

  // Email helper validation
  const isValidEmail = (email?: string) => !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  // 當前在下拉中選擇的客戶（用於顯示聯絡方式與地址）
  const selectedCustomers = customers.filter(c => formData.customer_ids.includes(c.id))

  // 依省市過濾顧客
  const modalFilteredCustomers = customers.filter(c => {
    // 確保當前已選客戶永遠在清單中，避免被過濾掉
    if (formData.customer_ids?.includes(c.id)) return true
    const provinceOk = !selectedProvince || deriveProvince(c) === selectedProvince
    
    // Improved city matching with case-insensitive comparison and accent normalization
    const cityOk = !selectedCity || (() => {
      const customerCity = deriveCity(c)
      const normalizeForComparison = (str) => str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
      return normalizeForComparison(customerCity) === normalizeForComparison(selectedCity)
    })()
    
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
          try {
            // Determine subject and content based on mode
            let subject = formData.subject || 'Mensaje desde Casmara CRM'
            let content = ''
            let isHtml = false

            if (formData.useHtml && formData.htmlContent?.trim()) {
              // HTML mode with content
              content = formData.htmlContent.trim()
              isHtml = true
            } else if (formData.message?.trim()) {
              // Text mode or HTML mode fallback
              content = formData.message.trim()
              isHtml = false
            } else {
              console.error('No content provided for email')
              continue
            }

            // Validate required fields
            if (!customer.email || !subject || !content) {
              console.error(`Missing fields: to=${!!customer.email}, subject=${!!subject}, message=${!!content}`)
              continue
            }

            const response = await fetch('/.netlify/functions/send-email', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: customer.email,
                subject: subject,
                message: content,
                type: 'email',
                isHtml: isHtml,
                messageId: row.id,
                customerId: customer.id,
                includeConfirmation: formData.includeConfirmation
              })
            })
            
            const emailResult = await response.json()
            
            if (response.ok && emailResult.success) {
              // Update message status to 'sent' in database
              const { error: updateError } = await supabase
                .from('scheduled_messages')
                .update({ status: 'sent' })
                .eq('id', row.id)
              
              if (updateError) {
                console.error('Error updating message status:', updateError)
              } else {
                console.log(`Email sent successfully to ${customer.email} - Status updated to 'sent'`)
              }
            } else {
              // Update message status to 'failed' with error message
              await supabase
                .from('scheduled_messages')
                .update({ 
                  status: 'failed',
                  error_message: emailResult.error || 'Error desconocido'
                })
                .eq('id', row.id)
              
              console.error(`Failed to send email to ${customer.email}: ${emailResult.error}`)
            }
          } catch (emailError) {
            // Update message status to 'failed' with error message
            await supabase
              .from('scheduled_messages')
              .update({ 
                status: 'failed',
                error_message: `Error de conexión: ${emailError}`
              })
              .eq('id', row.id)
            
            console.error(`Email sending error for ${customer.email}:`, emailError)
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
      // Check authentication first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session?.user) {
        alert('❌ Error de autenticación. Por favor, cierre sesión e inicie sesión nuevamente.')
        console.error('Authentication error:', sessionError)
        return
      }
      
      if (!formData.customer_ids.length) {
        alert('Seleccione al menos un cliente')
        return
      }
      if (!formData.schedules.length) {
        alert('Agregue al menos una fecha y hora')
        return
      }

      // Block scheduling emails to customers without valid email addresses
      if (formData.type === 'email') {
        const selectedCustomersForEmail = customers.filter(c => formData.customer_ids.includes(c.id))
        const customersWithoutEmail = selectedCustomersForEmail.filter(c => !isValidEmail(c.email))
        if (customersWithoutEmail.length > 0) {
          const names = customersWithoutEmail.map(c => `- ${c.name}`).join('\n')
          alert(`Los siguientes clientes no tienen un email válido y no se puede programar correo para ellos:\n\n${names}\n\nQuite estos clientes de la lista o añada un email válido antes de continuar.`)
          return
        }
      }

      // Usar las columnas que realmente existen: customer_ids, message, scheduled_for, status, created_by
      const rows = formData.customer_ids.flatMap(cid => {
        const customer = customers.find(c => c.id === cid)
        const customerName = customer ? `${customer.name} (${customer.company || 'Sin empresa'})` : cid
        
        return formData.schedules.map(s => {
          const dateTimeStr = `${s.date}T${s.time}:00`
          const utcDate = fromZonedTime(dateTimeStr, 'Europe/Madrid')
          let messageWithMarker = formData.message
          if (formData.type === 'email') {
            messageWithMarker = `${formData.message}\n\n|INCLUDE_CONFIRMATION:true|`
          }
          // Determine message content based on mode
          let messageContent = ''
          if (formData.type === 'email') {
            if (formData.useHtml && formData.htmlContent?.trim()) {
              // HTML mode - store HTML content with subject and confirmation flag
              messageContent = `Mensaje: ${formData.htmlContent}${formData.subject ? ` (${formData.subject})` : ''}${formData.includeConfirmation ? ' |INCLUDE_CONFIRMATION:true|' : ''}`
            } else {
              // Text mode - store regular message with subject and confirmation flag
              messageContent = `Mensaje: ${messageWithMarker}${formData.subject ? ` (${formData.subject})` : ''}${formData.includeConfirmation ? ' |INCLUDE_CONFIRMATION:true|' : ''}`
            }
          } else {
            messageContent = `SMS: ${formData.message}`
          }
          
          return ({
          customer_ids: [cid], // Array format for customer_ids column
          message: messageContent,
          scheduled_for: utcDate.toISOString(),
          status: 'pending',
          created_by: user?.id
          // Note: include_confirmation temporarily stored in message content until schema cache refreshes
          })
        })
      })

      const { data, error } = await supabase
        .from('scheduled_messages')
        .insert(rows)
        .select('*')

      if (error) {
        console.error('Database insert error:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        
        if (error.message?.includes('JWT') || error.message?.includes('auth')) {
          alert('❌ Error de autenticación. Por favor, actualice la página e inicie sesión nuevamente.')
        } else {
          alert(`❌ Error al guardar: ${error.message}`)
        }
        return
      }

      const insertedCount = Array.isArray(data) ? data.length : (data ? 1 : 0)
      
      // Do not send emails immediately - all emails should be scheduled
      // Email sending will be handled by a separate background scheduler
      
      alert(`✅ Mensaje programado correctamente. Filas insertadas: ${insertedCount}`)
      
      // Clear saved form data after successful save
      clearSavedData()
      
      // Close modal and let parent component refresh the list
      onClose()
      
      onSave(Array.isArray(data) ? data[0] : data)
    } catch (error: any) {
      console.error('Error saving message:', {
        message: error?.message,
        name: error?.name,
        details: error?.details,
        hint: error?.hint,
        code: error?.code
      })
      
      if (error?.message?.includes('JWT') || error?.message?.includes('auth')) {
        alert('❌ Error de autenticación. Por favor, cierre sesión e inicie sesión nuevamente.')
      } else {
        alert(`❌ Error al guardar el mensaje: ${error?.message || 'Error desconocido'}`)
      }
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
              
              {/* Customer selection with checkboxes */}
              <div className="border rounded-lg max-h-60 overflow-y-auto bg-white">
                {/* Select All checkbox */}
                <div className="sticky top-0 bg-gray-50 border-b p-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={modalFilteredCustomers.length > 0 && modalFilteredCustomers.every(c => formData.customer_ids.includes(c.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Select all filtered customers
                          const allIds = modalFilteredCustomers.map(c => c.id)
                          setFormData({ ...formData, customer_ids: allIds })
                        } else {
                          // Deselect all
                          setFormData({ ...formData, customer_ids: [] })
                        }
                      }}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-900">
                      Seleccionar todos ({modalFilteredCustomers.length} clientes)
                    </span>
                  </label>
                </div>
                
                {/* Individual customer checkboxes */}
                <div className="p-2">
                  {modalFilteredCustomers.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No hay clientes que coincidan con los filtros</p>
                  ) : (
                    <div className="space-y-1">
                      {modalFilteredCustomers.map(customer => (
                        <label key={customer.id} className="flex items-start space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.customer_ids.includes(customer.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ 
                                  ...formData, 
                                  customer_ids: [...formData.customer_ids, customer.id] 
                                })
                              } else {
                                setFormData({ 
                                  ...formData, 
                                  customer_ids: formData.customer_ids.filter(id => id !== customer.id) 
                                })
                              }
                            }}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {customer.name.toUpperCase()}
                              {!isValidEmail(customer.email) && (
                                <span className="text-red-500 ml-1">(sin email)</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {customer.company || 'Sin empresa'}
                              {deriveProvince(customer) && (
                                <span className="ml-1">• {deriveProvince(customer)}</span>
                              )}
                              {deriveCity(customer) && deriveCity(customer) !== deriveProvince(customer) && (
                                <span className="ml-1">• {deriveCity(customer)}</span>
                              )}
                            </div>
                            {customer.email && (
                              <div className="text-xs text-blue-600 truncate">{customer.email}</div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Summary of selected customers */}
              {formData.customer_ids.length > 0 && (
                <div className="mt-3 border rounded-lg p-3 bg-blue-50 text-sm">
                  <div className="font-semibold text-blue-900">
                    {formData.customer_ids.length} cliente(s) seleccionados
                  </div>
                  <div className="mt-1 text-blue-800">
                    {formData.customer_ids.map(id => {
                      const customer = customers.find(c => c.id === id)
                      return customer ? customer.name : 'Cliente desconocido'
                    }).slice(0, 3).join(', ')}
                    {formData.customer_ids.length > 3 && ` y ${formData.customer_ids.length - 3} más`}
                  </div>
                </div>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.communications.messageType}
              </label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as 'sms' | 'email' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="email">{t.communications.email}</option>
                <option value="sms">{t.communications.sms}</option>
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
            
            {formData.type === 'email' && (
              <div className="mb-4">
                <div className="flex items-center space-x-4 mb-3">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="emailMode"
                      checked={!formData.useHtml}
                      onChange={() => setFormData({ ...formData, useHtml: false })}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">Texto Simple</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="emailMode"
                      checked={formData.useHtml}
                      onChange={() => setFormData({ ...formData, useHtml: true })}
                      className="mr-2"
                    />
                    <span className="text-sm font-medium text-gray-700">HTML Personalizado</span>
                  </label>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {formData.type === 'email' && formData.useHtml ? 'Contenido HTML *' : `${t.communications.message} *`}
              </label>
              {formData.type === 'email' && formData.useHtml ? (
                <div>
                  <textarea
                    required
                    rows={8}
                    value={formData.htmlContent}
                    onChange={(e) => setFormData({ ...formData, htmlContent: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                    placeholder="Pegue aquí su código HTML para crear emails promocionales atractivos..."
                  />
                  <div className="mt-2 text-xs text-gray-600">
                    <p>💡 <strong>Consejo:</strong> Puede pegar código HTML completo para crear emails promocionales con diseños atractivos, imágenes, botones y estilos personalizados.</p>
                  </div>
                </div>
              ) : (
                <textarea
                  required
                  rows={4}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={t.communications.messagePlaceholder}
                />
              )}
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