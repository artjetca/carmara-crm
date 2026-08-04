/**
 * Pure helpers for the "notas por revisar" screen.
 *
 * Kept free of React and network calls so the ordering and the nearby-customer
 * suggestions can be unit tested on their own.
 */

export type MatchConfidence = 'high' | 'medium' | 'low' | 'none'

export interface ReviewNote {
  id: string
  customer_id: string | null
  customer_name: string
  visit_summary: string
  raw_transcript: string
  visit_date: string
  match_confidence?: string | null
  match_method?: string | null
  captured_lat?: number | null
  captured_lng?: number | null
  created_at?: string
}

export interface CustomerLike {
  id: string
  name: string
  company?: string
  latitude?: number | null
  longitude?: number | null
}

export function normalizeConfidence(value: unknown): MatchConfidence {
  const raw = String(value ?? '').toLowerCase()
  return raw === 'high' || raw === 'medium' || raw === 'low' ? raw : 'none'
}

/**
 * A note is ready to confirm in bulk only when the customer is already
 * resolved and the match was strong. Anything weaker needs a human look.
 */
export function isReadyToConfirm(note: ReviewNote): boolean {
  if (!note.customer_id) return false
  return normalizeConfidence(note.match_confidence) === 'high'
}

export function needsAttention(note: ReviewNote): boolean {
  return !note.customer_id || normalizeConfidence(note.match_confidence) === 'low'
}

/**
 * Notes that need a decision come first: an unassigned note is the only thing
 * that actually blocks the salesperson.
 */
export function sortForReview(notes: ReviewNote[]): ReviewNote[] {
  const rank = (note: ReviewNote) => {
    if (!note.customer_id) return 0
    const confidence = normalizeConfidence(note.match_confidence)
    if (confidence === 'low') return 1
    if (confidence === 'medium') return 2
    return 3
  }

  return [...notes].sort((a, b) => {
    const byRank = rank(a) - rank(b)
    if (byRank !== 0) return byRank
    return String(b.created_at || '').localeCompare(String(a.created_at || ''))
  })
}

export interface ReviewSummary {
  total: number
  ready: number
  attention: number
  text: string
}

export function buildReviewSummary(notes: ReviewNote[]): ReviewSummary {
  const total = notes.length
  const ready = notes.filter(isReadyToConfirm).length
  const attention = notes.filter(needsAttention).length

  const parts: string[] = [`${total} por revisar`]
  if (ready > 0) parts.push(`${ready} lista${ready === 1 ? '' : 's'} para confirmar`)
  if (attention > 0) parts.push(`${attention} necesita${attention === 1 ? '' : 'n'} atención`)

  return { total, ready, attention, text: parts.join(' · ') }
}

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const earthRadius = 6371000

  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat))

  return 2 * earthRadius * Math.asin(Math.sqrt(h))
}

export interface CustomerSuggestion {
  id: string
  name: string
  meters: number
}

/**
 * Customers closest to where the note was recorded, so an unidentified note
 * can be assigned with one tap instead of hunting through a long dropdown.
 */
export function nearbySuggestions(
  note: ReviewNote,
  customers: CustomerLike[],
  limit = 3
): CustomerSuggestion[] {
  const lat = Number(note.captured_lat)
  const lng = Number(note.captured_lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []

  return customers
    .filter(
      customer =>
        Number.isFinite(Number(customer.latitude)) && Number.isFinite(Number(customer.longitude))
    )
    .map(customer => ({
      id: customer.id,
      name: customer.name,
      meters: Math.round(
        distanceMeters(
          { lat, lng },
          { lat: Number(customer.latitude), lng: Number(customer.longitude) }
        )
      ),
    }))
    .filter(entry => entry.meters <= 2000)
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit)
}

export function formatMeters(meters: number): string {
  if (!Number.isFinite(meters)) return ''
  return meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`
}

/** A one-line preview for a collapsed card. */
export function previewText(note: ReviewNote): string {
  const summary = String(note.visit_summary || '').trim()
  if (summary) return summary
  return String(note.raw_transcript || '').trim() || 'Sin contenido'
}
