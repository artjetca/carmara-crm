// ============================================================
// prospectGeocodeService.ts
// Geocodes a single prospect via the existing /api/geocode endpoint
// and persists the result via /api/prospects (PATCH)
// Includes sea detection and coordinate validation
// ============================================================

import type { Prospect } from '../lib/supabase'
import { patchProspect } from './prospectService'
import { 
  isLikelyInSea, 
  isWithinServiceArea,
  type MapCoordinates 
} from '../components/communications/visitsGeocodeUtils'

const GEOCODE_ENDPOINT = '/api/geocode'

// Service area bounds for prospect geocoding
const SERVICE_AREA = {
  minLat: 35.5,
  maxLat: 38.9,
  minLng: -8.5,
  maxLng: -4.5,
}

export interface GeocodeResult {
  lat: number
  lng: number
  status: 'valid' | 'approximate' | 'invalid' | 'sea_suspect'
  reason?: string
}

export interface ProspectGeocodeAudit {
  prospectId: string
  originalLat: number | null
  originalLng: number | null
  correctedLat: number | null
  correctedLng: number | null
  status: GeocodeResult['status']
  reason: string
  geocodedAddress: string
}

/**
 * Validates if coordinates are within valid ranges
 */
export const isValidCoordinate = (lat: number, lng: number): boolean => {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  )
}

/**
 * Validates if coordinates are within the service area
 */
export const isInServiceArea = (lat: number, lng: number): boolean => {
  return (
    lat >= SERVICE_AREA.minLat &&
    lat <= SERVICE_AREA.maxLat &&
    lng >= SERVICE_AREA.minLng &&
    lng <= SERVICE_AREA.maxLng
  )
}

/**
 * Comprehensive coordinate validation for prospects
 * Checks: valid range, service area, and sea detection
 */
export const validateProspectCoordinates = (
  lat: number, 
  lng: number
): { valid: boolean; status: GeocodeResult['status']; reason: string } => {
  if (!isValidCoordinate(lat, lng)) {
    return { 
      valid: false, 
      status: 'invalid', 
      reason: 'Coordenadas fuera de rango válido' 
    }
  }

  if (!isWithinServiceArea(lat, lng)) {
    return { 
      valid: false, 
      status: 'invalid', 
      reason: 'Coordenadas fuera del área de servicio (Cádiz/Huelva/Ceuta)' 
    }
  }

  if (isLikelyInSea(lat, lng)) {
    return { 
      valid: false, 
      status: 'sea_suspect', 
      reason: 'Coordenadas caen en zona marítima o bahía' 
    }
  }

  return { valid: true, status: 'valid', reason: 'Coordenadas válidas' }
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

    // Validate coordinates including sea detection
    const validation = validateProspectCoordinates(lat, lng)
    
    if (!validation.valid) {
      return { 
        lat, 
        lng, 
        status: validation.status,
        reason: validation.reason 
      }
    }

    // Heuristic: if geocode type contains 'approximate' or accuracy is low mark accordingly
    const isApproximate =
      String(json.data.type || '').toLowerCase().includes('approximate') ||
      String(json.data.category || '').toLowerCase().includes('administrative')

    return { 
      lat, 
      lng, 
      status: isApproximate ? 'approximate' : 'valid',
      reason: isApproximate ? 'Ubicación aproximada' : 'Coordenadas válidas'
    }
  } catch {
    return null
  }
}

/**
 * Re-geocode a prospect with existing coordinates to verify/fix them
 * Useful for repairing prospects that may have fallen into the sea
 */
export async function regeocodeProspect(prospect: Prospect): Promise<{
  prospect: Prospect
  audit: ProspectGeocodeAudit
}> {
  const originalLat = prospect.lat ?? null
  const originalLng = prospect.lng ?? null
  
  // First check if existing coordinates are valid
  if (originalLat != null && originalLng != null) {
    const validation = validateProspectCoordinates(originalLat, originalLng)
    if (validation.valid) {
      // Existing coordinates are good, just update status if needed
      if (prospect.geocode_status !== 'valid' && prospect.geocode_status !== 'approximate') {
        const updated = await patchProspect(prospect.id, { 
          geocode_status: 'valid',
          lat: originalLat,
          lng: originalLng,
        })
        return {
          prospect: updated,
          audit: {
            prospectId: prospect.id,
            originalLat,
            originalLng,
            correctedLat: originalLat,
            correctedLng: originalLng,
            status: 'valid',
            reason: 'Coordenadas existentes validadas',
            geocodedAddress: buildAddress(prospect),
          }
        }
      }
      return {
        prospect,
        audit: {
          prospectId: prospect.id,
          originalLat,
          originalLng,
          correctedLat: originalLat,
          correctedLng: originalLng,
          status: 'valid',
          reason: 'Coordenadas ya válidas',
          geocodedAddress: buildAddress(prospect),
        }
      }
    }
  }
  
  // Need to re-geocode
  const result = await geocodeProspect(prospect)
  
  return {
    prospect: result,
    audit: {
      prospectId: prospect.id,
      originalLat,
      originalLng,
      correctedLat: result.lat ?? null,
      correctedLng: result.lng ?? null,
      status: result.geocode_status as GeocodeResult['status'] || 'invalid',
      reason: result.geocode_status === 'invalid' 
        ? 'Re-geocodificación fallida' 
        : 'Coordenadas corregidas mediante re-geocodificación',
      geocodedAddress: buildAddress(prospect),
    }
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

export type RepairResult = {
  repaired: Prospect[]
  failed: { prospect: Prospect; reason: string }[]
  skipped: Prospect[]
  summary: {
    totalChecked: number
    repairedCount: number
    failedCount: number
    skippedCount: number
  }
}

/**
 * Repair prospects that have fallen into the sea or have invalid coordinates
 * This function identifies prospects with sea_suspect or invalid geocode_status
 * and attempts to re-geocode them with better address formatting
 */
export async function repairProspectCoordinates(
  prospects: Prospect[],
  onProgress?: (done: number, total: number, current: string) => void
): Promise<RepairResult> {
  // Find prospects that need repair
  const needsRepair = prospects.filter((p) => {
    // Check geocode status
    if (p.geocode_status === 'sea_suspect' || p.geocode_status === 'invalid') {
      return true
    }
    
    // Also check if coordinates exist but are suspicious
    if (p.lat != null && p.lng != null) {
      const validation = validateProspectCoordinates(p.lat, p.lng)
      return !validation.valid
    }
    
    return false
  })
  
  const repaired: Prospect[] = []
  const failed: { prospect: Prospect; reason: string }[] = []
  const skipped: Prospect[] = []
  
  for (let i = 0; i < needsRepair.length; i++) {
    const prospect = needsRepair[i]
    onProgress?.(i + 1, needsRepair.length, prospect.business_name || 'Sin nombre')
    
    try {
      const { prospect: updated, audit } = await regeocodeProspect(prospect)
      
      if (audit.status === 'valid' || audit.status === 'approximate') {
        repaired.push(updated)
      } else {
        failed.push({ 
          prospect: updated, 
          reason: audit.reason || 'Re-geocodificación no produjo coordenadas válidas'
        })
      }
    } catch (error) {
      failed.push({ 
        prospect, 
        reason: `Error en re-geocodificación: ${(error as Error).message}` 
      })
    }
    
    // Polite delay to avoid hammering geocode API
    await new Promise((r) => setTimeout(r, 350))
  }
  
  // Those that didn't need repair are considered skipped
  const needsRepairIds = new Set(needsRepair.map(p => p.id))
  prospects.forEach(p => {
    if (!needsRepairIds.has(p.id)) {
      skipped.push(p)
    }
  })
  
  return {
    repaired,
    failed,
    skipped,
    summary: {
      totalChecked: prospects.length,
      repairedCount: repaired.length,
      failedCount: failed.length,
      skippedCount: skipped.length,
    }
  }
}
