// ============================================================
// dedupeService.ts
// Detects duplicate prospects vs. existing customers
// and prospect-to-prospect duplicates.
// ============================================================

import type { Customer, Prospect } from '../lib/supabase'
import {
  buildAddressKey,
  buildCustomerLookupMaps,
  buildNameCityKey,
  matchAgainstCustomerLookups,
  normalizeBusinessName,
  normalizePhoneForComparison,
} from './prospectAutoCaptureUtils'

// ─── Similarity scoring ──────────────────────────────────────────────────────

function nameSimilarity(a: string, b: string): number {
  const na = normalizeBusinessName(a)
  const nb = normalizeBusinessName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  // Token overlap
  const tokA = new Set(na.split(' '))
  const tokB = new Set(nb.split(' '))
  const intersection = [...tokA].filter((t) => tokB.has(t)).length
  const union = new Set([...tokA, ...tokB]).size
  return union > 0 ? intersection / union : 0
}

// ─── Prospect vs. existing customers ─────────────────────────────────────────

export interface DuplicateCheckResult {
  isDuplicate: boolean
  confidence: number          // 0–1
  matchedCustomerId?: string
  matchedCustomerName?: string
  reason?: string
}

export function checkProspectVsCustomers(
  prospect: Pick<Prospect, 'business_name' | 'phone' | 'address' | 'city'>,
  customers: Customer[]
): DuplicateCheckResult {
  const exactLookup = buildCustomerLookupMaps(customers)
  const directMatch = matchAgainstCustomerLookups(
    {
      business_name: prospect.business_name,
      phone: prospect.phone,
      address: prospect.address,
      city: prospect.city,
    },
    exactLookup
  )

  if (directMatch) {
    return {
      isDuplicate: true,
      confidence: 1,
      matchedCustomerId: directMatch.matchedId,
      matchedCustomerName: directMatch.matchedName,
      reason: directMatch.motivo,
    }
  }

  const prospectPhone = normalizePhoneForComparison(prospect.phone)
  const prospectName = normalizeBusinessName(prospect.business_name)
  const prospectAddress = buildAddressKey({
    address: prospect.address,
    city: prospect.city,
  })
  const prospectNameCity = buildNameCityKey({
    business_name: prospect.business_name,
    city: prospect.city,
  })

  let best: DuplicateCheckResult = { isDuplicate: false, confidence: 0 }

  for (const c of customers) {
    let score = 0
    const reasons: string[] = []

    const custPhone = normalizePhoneForComparison(c.mobile_phone || c.phone)
    if (prospectPhone && custPhone && prospectPhone === custPhone) {
      score += 0.7
      reasons.push('mismo teléfono')
    }

    const custName = normalizeBusinessName(c.company || c.name)
    const nameSim = nameSimilarity(prospectName, custName)
    if (nameSim > 0.8) {
      score += 0.5
      reasons.push('nombre muy similar')
    } else if (nameSim > 0.5) {
      score += 0.2
      reasons.push('nombre similar')
    }

    if (prospectNameCity && buildNameCityKey({ company: c.company, name: c.name, city: c.city }) === prospectNameCity) {
      score += 0.15
    }

    if (prospectAddress && buildAddressKey({ address: c.address, city: c.city, province: c.province }) === prospectAddress) {
      score += 0.3
      reasons.push('misma dirección')
    }

    const confidence = Math.min(score, 1)
    if (confidence > best.confidence) {
      best = {
        isDuplicate: confidence >= 0.65,
        confidence,
        matchedCustomerId: c.id,
        matchedCustomerName: c.company || c.name,
        reason: reasons.join(' + '),
      }
    }
  }

  return best
}

// ─── Prospect vs. prospect list ───────────────────────────────────────────────

export interface ProspectDuplicateResult {
  isDuplicate: boolean
  confidence: number
  matchedProspectId?: string
  matchedProspectName?: string
}

export function checkProspectVsProspects(
  prospect: Pick<Prospect, 'business_name' | 'phone' | 'address' | 'city'>,
  existingProspects: Prospect[],
  excludeId?: string
): ProspectDuplicateResult {
  const prospectPhone = normalizePhoneForComparison(prospect.phone)
  const prospectName = normalizeBusinessName(prospect.business_name)

  let best: ProspectDuplicateResult = { isDuplicate: false, confidence: 0 }

  for (const p of existingProspects) {
    if (p.id === excludeId) continue

    let score = 0
    const existingPhone = normalizePhoneForComparison(p.phone)
    if (prospectPhone && existingPhone && prospectPhone === existingPhone) score += 0.8
    const nameSim = nameSimilarity(prospectName, normalizeBusinessName(p.business_name))
    if (nameSim > 0.8) score += 0.5
    else if (nameSim > 0.5) score += 0.2

    const confidence = Math.min(score, 1)
    if (confidence > best.confidence) {
      best = {
        isDuplicate: confidence >= 0.7,
        confidence,
        matchedProspectId: p.id,
        matchedProspectName: p.business_name,
      }
    }
  }

  return best
}
