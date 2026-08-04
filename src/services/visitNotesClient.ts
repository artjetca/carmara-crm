/**
 * Network layer for the voice visit-note feature.
 *
 * Pure helpers live in `visitNotesFormat` so they stay unit testable; this
 * module only talks to our own authenticated endpoints. No API key ever
 * reaches the browser: the functions hold the STT/LLM credentials.
 */

import { supabase } from '../lib/supabase'
import {
  buildSavePayload,
  normalizeStructured,
  type SaveVisitNoteInput,
  type StructuredVisitNote,
  type VisitNoteRecord,
} from './visitNotesFormat'

export * from './visitNotesFormat'

export function createRequestId(): string {
  const globalCrypto = typeof crypto !== 'undefined' ? crypto : undefined
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID()
  }
  return `vn-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sesión caducada. Vuelve a iniciar sesión.')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

interface ApiEnvelope {
  success?: boolean
  error?: string
  data?: Record<string, unknown>
}

async function readJson(response: Response): Promise<ApiEnvelope> {
  const text = await response.text()
  try {
    return text ? (JSON.parse(text) as ApiEnvelope) : {}
  } catch {
    return {}
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

export async function transcribeAudio(blob: Blob): Promise<string> {
  const headers = await authHeaders()
  const response = await fetch('/api/visit-notes/transcribe', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      audio_base64: await blobToBase64(blob),
      mime_type: blob.type || 'audio/webm',
    }),
  })

  const payload = await readJson(response)
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'No se pudo transcribir el audio.')
  }
  return String(payload.data?.transcript || '')
}

export interface StructureResult {
  structured: StructuredVisitNote
  structuring_status: 'ok' | 'manual'
  visit_date: string
}

export async function structureTranscript(params: {
  transcript: string
  customerName: string
  visitDate: string
}): Promise<StructureResult> {
  const headers = await authHeaders()
  const response = await fetch('/api/visit-notes/structure', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      transcript: params.transcript,
      customer_name: params.customerName,
      visit_date: params.visitDate,
    }),
  })

  const payload = await readJson(response)
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'No se pudo organizar la nota.')
  }

  return {
    structured: normalizeStructured(payload.data?.structured),
    structuring_status: payload.data?.structuring_status === 'manual' ? 'manual' : 'ok',
    visit_date: String(payload.data?.visit_date || params.visitDate),
  }
}

export async function saveVisitNote(input: SaveVisitNoteInput): Promise<VisitNoteRecord> {
  const headers = await authHeaders()
  const response = await fetch('/api/visit-notes', {
    method: 'POST',
    headers,
    body: JSON.stringify(buildSavePayload(input)),
  })

  const payload = await readJson(response)
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'No se pudo guardar la nota.')
  }
  return payload.data as unknown as VisitNoteRecord
}

export async function listVisitNotes(customerId: string): Promise<VisitNoteRecord[]> {
  const headers = await authHeaders()
  const response = await fetch(`/api/visit-notes?customer_id=${encodeURIComponent(customerId)}`, {
    headers,
  })

  const payload = await readJson(response)
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || 'No se pudieron cargar las notas.')
  }
  return (payload.data || []) as VisitNoteRecord[]
}
