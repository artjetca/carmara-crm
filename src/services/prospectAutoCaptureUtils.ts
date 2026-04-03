export type ProspectAutoCaptureInput = {
  province: string
  city?: string
  keyword: string
  limit: number
}

export type LeadScoreInput = {
  phone?: string | null
  website?: string | null
  category?: string | null
  rating?: number | null
  reviews_count?: number | null
  geocode_status?: string | null
}

type ComparableRecord = {
  id?: string | null
  business_name?: string | null
  name?: string | null
  company?: string | null
  phone?: string | null
  mobile_phone?: string | null
  address?: string | null
  city?: string | null
  province?: string | null
  website?: string | null
}

const normalizeForComparison = (value?: string | null) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

export const normalizeBusinessName = (value?: string | null) =>
  normalizeForComparison(value).replace(/\s+/g, ' ').trim()

export const normalizePhoneNumber = (value?: string | null) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const hasPlus = raw.startsWith('+')
  const digits = raw.replace(/[^\d]/g, '')
  return hasPlus ? `+${digits}` : digits
}

export const normalizePhoneForComparison = (value?: string | null) => {
  const normalized = normalizePhoneNumber(value)
  if (!normalized) return ''

  const digits = normalized.replace(/[^\d]/g, '')
  if (digits.length === 11 && digits.startsWith('34')) {
    return digits.slice(2)
  }

  return digits
}

export const normalizeAddressText = (value?: string | null) =>
  normalizeForComparison(
    String(value || '')
      .replace(/\bC\/\s*/gi, 'Calle ')
      .replace(/[.,;]+/g, ' ')
      .replace(/\s+/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()

export const normalizeWebsiteDomain = (value?: string | null) => {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return ''

  try {
    const withProtocol = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`
    const hostname = new URL(withProtocol).hostname.replace(/^www\./, '')
    return hostname.trim()
  } catch {
    return raw
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .trim()
  }
}

export const buildNameCityKey = (input: {
  business_name?: string | null
  name?: string | null
  company?: string | null
  city?: string | null
}) => {
  const name = normalizeBusinessName(input.business_name || input.company || input.name)
  const city = normalizeForComparison(input.city)
  return name && city ? `${name}|${city}` : ''
}

export const buildAddressKey = (input: {
  address?: string | null
  city?: string | null
  province?: string | null
}) => {
  const address = normalizeAddressText(input.address)
  const city = normalizeForComparison(input.city)
  const province = normalizeForComparison(input.province)
  return address ? `${address}|${city}|${province}` : ''
}

const simpleHash = (value: string) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash.toString(16)
}

export const buildProspectHashDedupe = (input: {
  business_name?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  province?: string | null
}) => {
  const payload = [
    normalizeBusinessName(input.business_name),
    normalizePhoneForComparison(input.phone),
    normalizeAddressText(input.address),
    normalizeForComparison(input.city),
    normalizeForComparison(input.province),
  ].join('|')

  return simpleHash(payload)
}

export const calculateLeadScore = (input: LeadScoreInput) => {
  let score = 0
  const reasons: string[] = []
  const category = normalizeForComparison(input.category)

  if (normalizePhoneNumber(input.phone)) {
    score += 30
    reasons.push('Teléfono disponible')
  } else {
    score -= 20
    reasons.push('Sin teléfono')
  }

  if (String(input.website || '').trim()) {
    score += 20
    reasons.push('Web disponible')
  }

  if ((input.rating ?? 0) >= 4.5) {
    score += 15
    reasons.push('Rating alto')
  }

  if ((input.reviews_count ?? 0) > 20) {
    score += 10
    reasons.push('Volumen sólido de reseñas')
  }

  if (category.includes('estetica facial') || category.includes('clinica estetica')) {
    score += 15
    reasons.push('Categoría prioritaria')
  }

  if (input.geocode_status === 'invalid') {
    score -= 15
    reasons.push('Geocoding fallido')
  }

  return {
    score,
    reasons,
  }
}

export const buildSearchQueries = (input: ProspectAutoCaptureInput) => {
  const normalizedKeyword = String(input.keyword || '').trim() || 'estética'
  const query = [normalizedKeyword, input.city, input.province, 'Spain']
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  return query ? [query] : []
}

export type DuplicateMatch =
  | {
      scope: 'customer'
      reason: 'phone' | 'name_city' | 'address' | 'website_domain'
      matchedId?: string
      matchedName?: string
      motivo: string
    }
  | {
      scope: 'prospect'
      reason: 'place_id' | 'phone' | 'name_city' | 'address' | 'website_domain' | 'hash'
      matchedId?: string
      matchedName?: string
      motivo: string
    }

type LookupMaps = {
  byPhone: Map<string, ComparableRecord>
  byNameCity: Map<string, ComparableRecord>
  byAddress: Map<string, ComparableRecord>
  byWebsiteDomain: Map<string, ComparableRecord>
}

const buildLookupMaps = (items: ComparableRecord[]): LookupMaps => {
  const byPhone = new Map<string, ComparableRecord>()
  const byNameCity = new Map<string, ComparableRecord>()
  const byAddress = new Map<string, ComparableRecord>()
  const byWebsiteDomain = new Map<string, ComparableRecord>()

  for (const item of items) {
    const phone = normalizePhoneForComparison(item.mobile_phone || item.phone)
    const nameCity = buildNameCityKey(item)
    const address = buildAddressKey(item)
    const websiteDomain = normalizeWebsiteDomain(item.website)

    if (phone && !byPhone.has(phone)) byPhone.set(phone, item)
    if (nameCity && !byNameCity.has(nameCity)) byNameCity.set(nameCity, item)
    if (address && !byAddress.has(address)) byAddress.set(address, item)
    if (websiteDomain && !byWebsiteDomain.has(websiteDomain)) byWebsiteDomain.set(websiteDomain, item)
  }

  return { byPhone, byNameCity, byAddress, byWebsiteDomain }
}

export const buildCustomerLookupMaps = (customers: ComparableRecord[]) => buildLookupMaps(customers)

export const buildProspectLookupMaps = (prospects: ComparableRecord[]) => buildLookupMaps(prospects)

const buildMatchedName = (item?: ComparableRecord) =>
  item?.company || item?.name || item?.business_name || undefined

export const matchAgainstCustomerLookups = (
  item: ComparableRecord,
  lookupMaps: LookupMaps
): DuplicateMatch | null => {
  const phone = normalizePhoneForComparison(item.mobile_phone || item.phone)
  if (phone) {
    const matched = lookupMaps.byPhone.get(phone)
    if (matched) {
      return {
        scope: 'customer',
        reason: 'phone',
        matchedId: matched.id || undefined,
        matchedName: buildMatchedName(matched),
        motivo: 'Ya existe en Gestión de Clientes',
      }
    }
  }

  const nameCity = buildNameCityKey(item)
  if (nameCity) {
    const matched = lookupMaps.byNameCity.get(nameCity)
    if (matched) {
      return {
        scope: 'customer',
        reason: 'name_city',
        matchedId: matched.id || undefined,
        matchedName: buildMatchedName(matched),
        motivo: 'Ya existe en Gestión de Clientes',
      }
    }
  }

  const address = buildAddressKey(item)
  if (address) {
    const matched = lookupMaps.byAddress.get(address)
    if (matched) {
      return {
        scope: 'customer',
        reason: 'address',
        matchedId: matched.id || undefined,
        matchedName: buildMatchedName(matched),
        motivo: 'Ya existe en Gestión de Clientes',
      }
    }
  }

  const websiteDomain = normalizeWebsiteDomain(item.website)
  if (websiteDomain) {
    const matched = lookupMaps.byWebsiteDomain.get(websiteDomain)
    if (matched) {
      return {
        scope: 'customer',
        reason: 'website_domain',
        matchedId: matched.id || undefined,
        matchedName: buildMatchedName(matched),
        motivo: 'Ya existe en Gestión de Clientes',
      }
    }
  }

  return null
}
