import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('VITE_SUPABASE_URL 環境變數未設置。請檢查 .env.local 文件。')
}

if (!supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_ANON_KEY 環境變數未設置。請檢查 .env.local 文件。')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Tipos de datos para TypeScript
export interface Customer {
  id: string
  name: string
  company?: string
  position?: string
  email?: string
  phone?: string
  mobile_phone?: string
  address?: string
  city?: string
  province?: string
  postal_code?: string
  cp?: string
  country?: string
  latitude?: number
  longitude?: number
  coordinates?: string
  distance?: number
  business_hours?: string
  contrato?: string
  num?: string
  notes?: string
  created_at: string
  updated_at: string
  created_by: string
}

export interface Profile {
  id: string
  name?: string
  created_at: string
  updated_at: string
}

export interface Visit {
  id: string
  customer_id: string
  user_id: string
  scheduled_at: string
  scheduled_date?: string
  scheduled_time?: string
  purpose?: string
  status: 'programada' | 'completada' | 'cancelada' | 'reprogramada'
  notes?: string
  created_at: string
  updated_at: string
  customer?: Customer
}

export interface ScheduledMessage {
  id: string
  customer_ids: string[]
  message: string
  scheduled_for: string
  status: 'pending' | 'sent' | 'failed'
  error_message?: string
  created_at: string
  updated_at: string
  created_by: string
}