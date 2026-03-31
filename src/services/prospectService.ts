// ============================================================
// prospectService.ts
// CRUD wrapper for the /api/prospects Netlify function
// ============================================================

import type { Prospect } from '../lib/supabase'

const BASE = '/api/prospects'

// ─── Fetch ────────────────────────────────────────────────────────────────────

export interface ProspectFilters {
  province?: string
  city?: string
  search?: string
  geocode_status?: string
}

export async function fetchProspects(filters?: ProspectFilters): Promise<Prospect[]> {
  const params = new URLSearchParams()
  if (filters?.province)       params.set('province',       filters.province)
  if (filters?.city)           params.set('city',           filters.city)
  if (filters?.search)         params.set('search',         filters.search)
  if (filters?.geocode_status) params.set('geocode_status', filters.geocode_status)

  const url = params.toString() ? `${BASE}?${params}` : BASE
  const res = await fetch(url)
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Error fetching prospects')
  return json.data as Prospect[]
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createProspect(
  data: Omit<Prospect, 'id' | 'created_at' | 'updated_at'>
): Promise<Prospect> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Error creating prospect')
  // single insert returns array[0]
  return (Array.isArray(json.data) ? json.data[0] : json.data) as Prospect
}

// ─── Batch create (import) ────────────────────────────────────────────────────

export interface BatchInsertResult {
  inserted: number
  skippedCount: number
  skipped: unknown[]
  data: Prospect[]
}

export async function batchCreateProspects(
  records: Omit<Prospect, 'id' | 'created_at' | 'updated_at'>[]
): Promise<BatchInsertResult> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(records),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Error batch-creating prospects')
  return json as BatchInsertResult
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateProspect(
  id: string,
  data: Partial<Prospect>
): Promise<Prospect> {
  const res = await fetch(BASE, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Error updating prospect')
  return json.data as Prospect
}

// ─── Patch (partial) ─────────────────────────────────────────────────────────

export async function patchProspect(
  id: string,
  data: Partial<Prospect>
): Promise<Prospect> {
  const res = await fetch(BASE, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...data }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Error patching prospect')
  return json.data as Prospect
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteProspect(id: string): Promise<void> {
  const res = await fetch(`${BASE}?id=${id}`, { method: 'DELETE' })
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Error deleting prospect')
}
