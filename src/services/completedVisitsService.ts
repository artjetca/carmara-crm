// ============================================================
// completedVisitsService.ts
// Bridges the legacy localStorage 'completedVisits' records with
// the Supabase `visits` table. The database is the source of
// truth; localStorage stays as an offline cache so the app keeps
// working without connection (and so nothing breaks before the
// 20260610_phase0_data_hardening.sql migration is applied).
// ============================================================

import { supabase } from '../lib/supabase'

export interface CompletedVisitRecord {
  id: string
  customer_id: string | null
  customer_name: string
  customer_company?: string
  visit_date: string // YYYY-MM-DD
  visit_time: string // HH:MM
  notes?: string
  status: string
  route_id?: string
  route_name?: string
}

const LOCAL_KEY = 'completedVisits'
const SYNCED_FLAG = 'completedVisitsSyncedAt'

export const readLocalCompletedVisits = (): CompletedVisitRecord[] => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
  } catch {
    return []
  }
}

export const writeLocalCompletedVisits = (visits: CompletedVisitRecord[]) => {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(visits))
  } catch {
    // storage full/unavailable — DB already has the data
  }
}

const toScheduledAtIso = (visitDate: string, visitTime: string): string => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(visitDate || '')
    ? visitDate
    : new Date().toISOString().split('T')[0]
  const time = /^\d{2}:\d{2}$/.test(visitTime || '') ? visitTime : '00:00'
  const parsed = new Date(`${date}T${time}:00`)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

const toDbRow = (visit: CompletedVisitRecord, userId: string) => {
  const scheduledAt = toScheduledAtIso(visit.visit_date, visit.visit_time)
  return {
    legacy_id: visit.id,
    customer_id: visit.customer_id || null,
    customer_name: visit.customer_name || '',
    customer_company: visit.customer_company || null,
    scheduled_date: /^\d{4}-\d{2}-\d{2}$/.test(visit.visit_date || '') ? visit.visit_date : null,
    scheduled_at: scheduledAt,
    completed_at: scheduledAt,
    status: 'completed',
    notes: visit.notes || null,
    route_id: visit.route_id || null,
    route_name: visit.route_name || null,
    created_by: userId,
  }
}

/**
 * Upsert completed visits into the `visits` table, deduplicated by
 * legacy_id so the same record never creates duplicates. Rows that
 * fail as a batch (e.g. a customer_id that no longer exists) are
 * retried one by one with customer_id nulled, so a single bad row
 * never blocks the rest.
 */
export const saveCompletedVisitsToDb = async (
  visits: CompletedVisitRecord[],
  userId: string
): Promise<{ saved: number; failed: number }> => {
  if (!visits.length || !userId) return { saved: 0, failed: 0 }

  const rows = visits.map(v => toDbRow(v, userId))

  const { error } = await supabase
    .from('visits')
    .upsert(rows, { onConflict: 'legacy_id' })

  if (!error) return { saved: rows.length, failed: 0 }

  console.warn('[CompletedVisits] Batch upsert failed, retrying per row:', error.message)

  let saved = 0
  let failed = 0
  for (const row of rows) {
    const { error: rowError } = await supabase
      .from('visits')
      .upsert([row], { onConflict: 'legacy_id' })
    if (!rowError) {
      saved++
      continue
    }
    // FK violation (customer deleted) — keep the visit, drop the reference
    const { error: retryError } = await supabase
      .from('visits')
      .upsert([{ ...row, customer_id: null }], { onConflict: 'legacy_id' })
    if (!retryError) {
      saved++
    } else {
      failed++
      console.warn('[CompletedVisits] Row upsert failed:', row.legacy_id, retryError.message)
    }
  }
  return { saved, failed }
}

/**
 * One-time (idempotent) upload of any completed visits that only
 * exist in localStorage. Keeps the local copy as cache; re-runs are
 * harmless thanks to the legacy_id upsert key. Returns true once
 * everything local is known to be in the database.
 */
export const syncLocalCompletedVisitsToDb = async (userId: string): Promise<boolean> => {
  if (!userId) return false
  const local = readLocalCompletedVisits()
  if (local.length === 0) return true

  const { saved, failed } = await saveCompletedVisitsToDb(local, userId)
  if (failed === 0 && saved > 0) {
    try {
      localStorage.setItem(SYNCED_FLAG, new Date().toISOString())
    } catch {
      // flag is best-effort only
    }
    console.log(`[CompletedVisits] Synced ${saved} local visits to database`)
    return true
  }
  console.warn(`[CompletedVisits] Partial sync: ${saved} saved, ${failed} failed — will retry next load`)
  return false
}

/** Load completed visits, database first, localStorage as fallback. */
export const loadCompletedVisits = async (userId: string): Promise<CompletedVisitRecord[]> => {
  if (userId) {
    const { data, error } = await supabase
      .from('visits')
      .select('*')
      .eq('created_by', userId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })

    if (!error && data) {
      return data.map(row => ({
        id: row.legacy_id || row.id,
        customer_id: row.customer_id,
        customer_name: row.customer_name || '',
        customer_company: row.customer_company || '',
        visit_date: row.scheduled_date || (row.scheduled_at || '').split('T')[0] || '',
        visit_time: row.scheduled_at
          ? new Date(row.scheduled_at).toTimeString().substring(0, 5)
          : '',
        notes: row.notes || '',
        status: 'completed',
        route_id: row.route_id || undefined,
        route_name: row.route_name || undefined,
      }))
    }
    console.warn('[CompletedVisits] DB load failed, using localStorage:', error?.message)
  }
  return readLocalCompletedVisits()
}

/** Remove the completed visits belonging to a deleted route (DB + cache). */
export const deleteCompletedVisitsByRoute = async (routeId: string, userId: string) => {
  if (userId) {
    const { error } = await supabase
      .from('visits')
      .delete()
      .eq('created_by', userId)
      .eq('route_id', routeId)
    if (error) {
      console.warn('[CompletedVisits] DB delete by route failed:', error.message)
    }
  }
  const local = readLocalCompletedVisits()
  writeLocalCompletedVisits(local.filter(visit => visit.route_id !== routeId))
}
