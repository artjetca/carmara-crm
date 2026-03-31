// ============================================================
// prospectGeocodeService.ts
// Geocodes a single prospect via the existing /api/geocode endpoint
// and persists the result via /api/prospects (PATCH)
// ============================================================

import type { Prospect } from '../lib/supabase'
import { patchProspect } from './prospectService'

const GEOCODE_ENDPOINT = '/api/geocode'

export interface GeocodeResult {
  lat: number
  lng: number
  status: 'valid' | 'approximate' | 'invalid'
}

// Build a geocodable address string from a prospect
function buildAddress(p: Pick<Prospect, 'address' | 'city' | 'province' | 'postal_code'>): string {
  const parts = [p.address, p.postal_code, p.city, p.province, 'España'].filter(Boolean)
  return parts.join(', ')
}

// Call /api/geocode with the prospect address
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  try {
    const res = await fetch(GEOCODE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    })
    const json = await res.json()
    if (!json.success || !json.data) return null

    const { lat, lng } = json.data
    if (typeof lat !== 'number' || typeof lng !== 'number') return null

    // Heuristic: if geocode type contains 'approximate' or accuracy is low mark accordingly
    const isApproximate =
      String(json.data.type || '').toLowerCase().includes('approximate') ||
      String(json.data.category || '').toLowerCase().includes('administrative')

    return { lat, lng, status: isApproximate ? 'approximate' : 'valid' }
  } catch {
    return null
  }
}

// Geocode a prospect and persist the result
export async function geocodeProspect(prospect: Prospect): Promise<Prospect> {
  const address = buildAddress(prospect)
  const result = await geocodeAddress(address)

  const patch: Partial<Prospect> = result
    ? {
        lat: result.lat,
        lng: result.lng,
        geocode_status: result.status,
      }
    : { geocode_status: 'invalid' }

  return patchProspect(prospect.id, patch)
}

// Geocode a batch of prospects (those with geocode_status = 'pending')
export async function geocodePendingProspects(
  prospects: Prospect[],
  onProgress?: (done: number, total: number) => void
): Promise<Prospect[]> {
  const pending = prospects.filter((p) => p.geocode_status === 'pending')
  const updated: Prospect[] = []

  for (let i = 0; i < pending.length; i++) {
    const result = await geocodeProspect(pending[i])
    updated.push(result)
    onProgress?.(i + 1, pending.length)
    // Polite delay to avoid hammering geocode API
    await new Promise((r) => setTimeout(r, 350))
  }

  return updated
}
