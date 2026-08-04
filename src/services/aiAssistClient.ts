/**
 * Client layer for the AI assistance on the Mapa and Prospectos pages.
 *
 * Both endpoints are authenticated on the server; no API key is ever exposed
 * to the browser.
 */

import { supabase } from '../lib/supabase'

export interface MapAssistFilters {
  intent: 'filter' | 'locate' | 'unknown'
  province: string
  city: string
  search_terms: string
  only_unmapped: boolean
  notes: string
}

export interface MapAssistResult {
  status: 'ok' | 'unknown' | 'failed'
  filters: MapAssistFilters
}

export type ProspectPriority = 'low' | 'medium' | 'high'

export interface ProspectSuggestion {
  prospect_id: string
  business_name: string
  priority: ProspectPriority
  reason: string
  opening_line: string
}

export interface ProspectAssistResult {
  status: 'ok' | 'failed'
  ranking: ProspectSuggestion[]
  summary: string
}

interface ApiEnvelope {
  success?: boolean
  error?: string
  data?: Record<string, unknown>
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sesión caducada. Vuelve a iniciar sesión.')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

async function readJson(response: Response): Promise<ApiEnvelope> {
  const text = await response.text()
  try {
    return text ? (JSON.parse(text) as ApiEnvelope) : {}
  } catch {
    return {}
  }
}

export const EMPTY_MAP_FILTERS: MapAssistFilters = {
  intent: 'unknown',
  province: '',
  city: '',
  search_terms: '',
  only_unmapped: false,
  notes: '',
}

/** Turn a free-text request into filters the map already understands. */
export async function interpretMapRequest(params: {
  query: string
  provinces: string[]
  cities: string[]
}): Promise<MapAssistResult> {
  const headers = await authHeaders()
  const response = await fetch('/api/map-assist', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query: params.query,
      provinces: params.provinces,
      cities: params.cities,
    }),
  })

  const payload = await readJson(response)
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'No se pudo interpretar la búsqueda.')
  }

  const data = (payload.data || {}) as Record<string, unknown>
  const filters = (data.filters || {}) as Partial<MapAssistFilters>

  return {
    status: (data.status as MapAssistResult['status']) || 'failed',
    filters: {
      intent: (filters.intent as MapAssistFilters['intent']) || 'unknown',
      province: String(filters.province || ''),
      city: String(filters.city || ''),
      search_terms: String(filters.search_terms || ''),
      only_unmapped: filters.only_unmapped === true,
      notes: String(filters.notes || ''),
    },
  }
}

/** Ask which prospects deserve a visit first. */
export async function rankProspectsForVisit(params: {
  prospects: Array<{
    id: string
    business_name: string
    category?: string
    city?: string
    rating?: number | null
    reviews_count?: number | null
    phone?: string
    website?: string
  }>
  city?: string
}): Promise<ProspectAssistResult> {
  const headers = await authHeaders()
  const response = await fetch('/api/prospect-assist', {
    method: 'POST',
    headers,
    body: JSON.stringify({ prospects: params.prospects, city: params.city || '' }),
  })

  const payload = await readJson(response)
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'No se pudo analizar los prospectos.')
  }

  const data = (payload.data || {}) as Record<string, unknown>
  const ranking = Array.isArray(data.ranking) ? (data.ranking as ProspectSuggestion[]) : []

  return {
    status: (data.status as ProspectAssistResult['status']) || 'failed',
    ranking,
    summary: String(data.summary || ''),
  }
}
