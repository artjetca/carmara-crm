// ============================================================
// dedupeService.ts
// Detects duplicate prospects vs. existing customers
// and prospect-to-prospect duplicates.
// ============================================================

import type { Customer, Prospect } from '../lib/supabase'

// ─── String normalisation helpers ────────────────────────────────────────────

function norm(s?: string | null): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip accents
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normPhone(p?: string | null): string {
  if (!p) return ''
  return p.replace(/\D/g, '').slice(-9) // last 9 digits
}

// ─── Similarity scoring ──────────────────────────────────────────────────────

function nameSimilarity(a: string, b: string): number {
  const na = norm(a)
  const nb = norm(b)
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
  const prospectPhone = normPhone(prospect.phone)
  const prospectName  = norm(prospect.business_name)
  const prospectAddr  = norm(prospect.address)
  const prospectCity  = norm(prospect.city)

  let best: DuplicateCheckResult = { isDuplicate: false, confidence: 0 }

  for (const c of customers) {
    let score = 0
    const reasons: string[] = []

    // Exact phone match is a very strong signal
    const custPhone = normPhone(c.phone || c.mobile_phone)
    if (prospectPhone && custPhone && prospectPhone === custPhone) {
      score += 0.7
      reasons.push('mismo teléfono')
    }

    // Name similarity
    const custName = norm(c.company || c.name)
    const nameSim = nameSimilarity(prospectName, custName)
    if (nameSim > 0.8) {
      score += 0.5
      reasons.push('nombre muy similar')
    } else if (nameSim > 0.5) {
      score += 0.2
      reasons.push('nombre similar')
    }

    // Same city
    if (prospectCity && norm(c.city) === prospectCity) {
      score += 0.1
    }

    // Address overlap
    if (prospectAddr && norm(c.address) === prospectAddr) {
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
  const prospectPhone = normPhone(prospect.phone)
  const prospectName  = norm(prospect.business_name)

  let best: ProspectDuplicateResult = { isDuplicate: false, confidence: 0 }

  for (const p of existingProspects) {
    if (p.id === excludeId) continue

    let score = 0
    const existingPhone = normPhone(p.phone)
    if (prospectPhone && existingPhone && prospectPhone === existingPhone) score += 0.8
    const nameSim = nameSimilarity(prospectName, norm(p.business_name))
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
