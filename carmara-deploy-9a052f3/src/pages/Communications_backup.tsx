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
  const [testMessage, setTestMessage] = useState('Este es un email de prueba desde el sistema Casmara CRM.')
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t.communications.title}</h1>
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-6 border-b border-gray-200 bg-blue-50">
          <div className="max-w-2xl">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              🧪 Probar Envío de Email
            </h3>
            <TestEmailForm />
          </div>
        </div>
      </div>
    </div>
  )
}
