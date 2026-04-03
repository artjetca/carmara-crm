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

// ─── Prospect / Lead ──────────────────────────────────────────────────────────
export interface Prospect {
  id: string
  business_name: string
  contact_name?: string
  phone?: string
  address?: string
  city?: string
  province?: string               // 'Cádiz' | 'Huelva'
  postal_code?: string
  country?: string
  category?: string               // estética, peluquería, spa …
  source?: string                 // Google Maps | directorio | manual
  website?: string
  instagram?: string
  notes?: string
  lat?: number | null
  lng?: number | null
  geocode_status?: 'valid' | 'approximate' | 'invalid' | 'pending'
  rating?: number | null
  reviews_count?: number | null
  status?: string | null
  interest?: string | null
  lead_score?: number | null
  place_id?: string | null
  hash_dedupe?: string | null
  duplicate_with_existing_client?: boolean
  duplicate_prospect_id?: string | null
  unsupported_province?: boolean
  created_at: string
  updated_at: string
  created_by?: string
}

export interface ScrapeJob {
  id: string
  province?: string | null
  city?: string | null
  keyword?: string | null
  limit_count?: number | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  total_found: number
  total_imported: number
  total_failed: number
  started_at?: string
  finished_at?: string | null
  request_payload?: unknown
  error_message?: string | null
  created_at: string
  updated_at: string
  created_by?: string
}

export interface ScrapeJobItem {
  id: string
  job_id: string
  business_name: string
  phone?: string | null
  address?: string | null
  city?: string | null
  province?: string | null
  website?: string | null
  instagram?: string | null
  category?: string | null
  rating?: number | null
  reviews_count?: number | null
  source?: string | null
  status: 'captured' | 'imported' | 'duplicate' | 'failed'
  lead_score?: number | null
  place_id?: string | null
  hash_dedupe?: string | null
  lat?: number | null
  lng?: number | null
  geocode_status?: string | null
  raw_payload?: unknown
  created_at: string
  updated_at: string
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
