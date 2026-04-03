import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildSearchQueries,
  buildCustomerLookupMaps,
  buildNameCityKey,
  buildProspectHashDedupe,
  buildAddressKey,
  calculateLeadScore,
  matchAgainstCustomerLookups,
  normalizeAddressText,
  normalizeBusinessName,
  normalizePhoneNumber,
  normalizePhoneForComparison,
  normalizeWebsiteDomain,
} from './prospectAutoCaptureUtils'

test('normalizeBusinessName trims chains and casing noise', () => {
  assert.equal(normalizeBusinessName('  Clínica  Estética  Sol  '), 'clinica estetica sol')
})

test('normalizePhoneNumber keeps only digits and leading plus', () => {
  assert.equal(normalizePhoneNumber('+34 956 12 34 56'), '+34956123456')
  assert.equal(normalizePhoneNumber('956-12-34-56'), '956123456')
})

test('normalizePhoneForComparison strips +34 and punctuation for dedupe', () => {
  assert.equal(normalizePhoneForComparison('+34 956 12 34 56'), '956123456')
  assert.equal(normalizePhoneForComparison('956-12-34-56'), '956123456')
})

test('normalizeAddressText expands compact punctuation and whitespace', () => {
  assert.equal(
    normalizeAddressText('C/ Real,  12.  Jerez'),
    'calle real 12 jerez'
  )
})

test('buildProspectHashDedupe is stable for equivalent inputs', () => {
  const first = buildProspectHashDedupe({
    business_name: 'Clínica Estética Sol',
    phone: '+34 956 12 34 56',
    address: 'C/ Real 12',
    city: 'Jerez de la Frontera',
    province: 'Cádiz',
  })
  const second = buildProspectHashDedupe({
    business_name: 'clinica estetica sol',
    phone: '956123456',
    address: 'Calle Real 12',
    city: 'Jerez de la Frontera',
    province: 'Cádiz',
  })

  assert.equal(first, second)
})

test('normalizeWebsiteDomain extracts the comparable domain only', () => {
  assert.equal(normalizeWebsiteDomain('https://www.centro-sol.es/contacto'), 'centro-sol.es')
  assert.equal(normalizeWebsiteDomain('centro-sol.es'), 'centro-sol.es')
})

test('buildNameCityKey and buildAddressKey create stable comparison keys', () => {
  assert.equal(
    buildNameCityKey({ business_name: 'Clínica Sol', city: 'Jerez de la Frontera' }),
    'clinica sol|jerez de la frontera'
  )
  assert.equal(
    buildAddressKey({
      address: 'C/ Real 12',
      city: 'Jerez de la Frontera',
      province: 'Cádiz',
    }),
    'calle real 12|jerez de la frontera|cadiz'
  )
})

test('matchAgainstCustomerLookups uses the requested priority order', () => {
  const lookups = buildCustomerLookupMaps([
    {
      id: 'cust-1',
      company: 'Clínica Sol',
      phone: '+34 956 12 34 56',
      address: 'Calle Real 12',
      city: 'Jerez de la Frontera',
      province: 'Cádiz',
      website: 'https://www.clinicasol.es',
    },
  ])

  const phoneMatch = matchAgainstCustomerLookups(
    {
      business_name: 'Otro nombre',
      phone: '956123456',
      city: 'Cádiz',
    },
    lookups
  )
  assert.equal(phoneMatch?.scope, 'customer')
  assert.equal(phoneMatch?.reason, 'phone')

  const nameCityMatch = matchAgainstCustomerLookups(
    {
      business_name: 'Clinica Sol',
      city: 'Jerez de la Frontera',
    },
    lookups
  )
  assert.equal(nameCityMatch?.reason, 'name_city')

  const addressMatch = matchAgainstCustomerLookups(
    {
      business_name: 'Sin coincidencia',
      address: 'C/ Real 12',
      city: 'Jerez de la Frontera',
      province: 'Cádiz',
    },
    lookups
  )
  assert.equal(addressMatch?.reason, 'address')

  const domainMatch = matchAgainstCustomerLookups(
    {
      business_name: 'No importa',
      website: 'clinicasol.es/reserva',
    },
    lookups
  )
  assert.equal(domainMatch?.reason, 'website_domain')
})

test('calculateLeadScore applies positive and negative rules', () => {
  const result = calculateLeadScore({
    phone: '+34956123456',
    website: 'https://example.com',
    category: 'clínica estética',
    rating: 4.7,
    reviews_count: 54,
    geocode_status: 'valid',
  })

  assert.equal(result.score, 90)
  assert.ok(result.reasons.includes('Teléfono disponible'))
  assert.ok(result.reasons.includes('Web disponible'))
})

test('buildSearchQueries creates layered keyword queries', () => {
  const queries = buildSearchQueries({
    province: 'Cádiz',
    city: 'Jerez de la Frontera',
    keyword: 'estética',
    limit: 50,
  })

  assert.deepEqual(queries, ['estética Jerez de la Frontera Cádiz Spain'])
})
