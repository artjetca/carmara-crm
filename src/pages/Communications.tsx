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
  XCircle
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
  customer_ids: string[]
  message: string
  scheduled_for: string
  status: 'pending' | 'sent' | 'failed'
  error_message?: string
  created_at: string
  created_by: string
  creator_profile?: {
    id: string
    name: string
    email: string
    full_name: string
  }
}

export default function Communications() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'calls' | 'messages'>('calls')
  const [calls, setCalls] = useState<Call[]>([])
  const [messages, setMessages] = useState<ScheduledMessage[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showCallModal, setShowCallModal] = useState(false)
  const [showMessageModal, setShowMessageModal] = useState(false)
  const t = translations

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      
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
        .eq('user_id', user?.id)
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
      
      // Cargar clientes
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', user?.id)
        .order('name')
      
      if (customersError) throw customersError
      
      setCalls(callsData || [])
      setMessages(messagesData || [])
      setCustomers(customersData || [])
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
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
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
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

        {/* Contenido de las tabs */}
        <div className="p-6">
          {activeTab === 'calls' ? (
            <CallsList calls={filteredCalls} />
          ) : (
            <MessagesList messages={filteredMessages} />
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
            setMessages([message, ...messages])
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
function MessagesList({ messages }: { messages: ScheduledMessage[] }) {
  const t = translations

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
      {messages.map((message) => (
        <div key={message.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <MessageSquare className="w-4 h-4 text-green-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-medium text-gray-900">
                    Creado por: {message.creator_profile?.full_name || message.creator_profile?.name || 'Usuario desconocido'}
                  </h3>
                  <span className="text-xs text-gray-500">
                    {message.customer_ids.length} destinatario(s)
                  </span>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getMessageStatusColor(message.status)}`}>
                    {t.communications[message.status as keyof typeof t.communications] || message.status}
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
    customer_id: '',
    type: 'sms' as 'sms' | 'email',
    subject: '',
    message: '',
    scheduled_date: new Date().toISOString().slice(0, 16)
  })
  const [loading, setLoading] = useState(false)
  const t = translations

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { data, error } = await supabase
        .from('scheduled_messages')
        .insert({
          ...formData,
          status: 'pending',
          user_id: user?.id
        })
        .select('*')
        .single()
      
      if (error) throw error
      onSave(data)
    } catch (error) {
      console.error('Error saving message:', error)
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.communications.customer} *
              </label>
              <select
                required
                value={formData.customer_id}
                onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">{t.communications.selectCustomer}</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} - {customer.company}
                  </option>
                ))}
              </select>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t.communications.scheduledDate}
              </label>
              <input
                type="datetime-local"
                value={formData.scheduled_date}
                onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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