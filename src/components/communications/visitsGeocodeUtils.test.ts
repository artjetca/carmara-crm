import test from 'node:test'
import assert from 'node:assert/strict'

import type { Customer } from '../../lib/supabase'
import {
  isLikelyInSea,
  isValidCoordinate,
  isWithinServiceArea,
  normalizeAddressForGeocoding,
  sanitizeCoordinateCache,
  selectBestGeocodeResult,
  validateAndFixClientCoordinates,
  type GeocodeCandidate,
} from './visitsGeocodeUtils'

const makeCustomer = (overrides: Partial<Customer>): Customer => ({
  id: overrides.id ?? crypto.randomUUID(),
  name: overrides.name ?? 'Cliente',
  created_at: overrides.created_at ?? '2026-03-31T00:00:00.000Z',
  updated_at: overrides.updated_at ?? '2026-03-31T00:00:00.000Z',
  created_by: overrides.created_by ?? 'user-1',
  ...overrides,
})

const makeResult = (overrides: Partial<GeocodeCandidate>): GeocodeCandidate => ({
  lat: overrides.lat ?? 36.5297,
  lng: overrides.lng ?? -6.2925,
  displayName: overrides.displayName ?? 'Calle Real, Cádiz, España',
  country: overrides.country ?? 'Spain',
  province: overrides.province ?? 'Cádiz',
  city: overrides.city ?? 'Cádiz',
  type: overrides.type ?? 'residential',
  category: overrides.category ?? 'building',
  source: overrides.source ?? 'nominatim',
  raw: overrides.raw ?? null,
})

test('isValidCoordinate validates numeric latitude and longitude bounds', () => {
  assert.equal(isValidCoordinate(36.5, -6.2), true)
  assert.equal(isValidCoordinate(Number.NaN, -6.2), false)
  assert.equal(isValidCoordinate(120, -6.2), false)
  assert.equal(isValidCoordinate(36.5, -190), false)
})

test('isWithinServiceArea and isLikelyInSea detect obvious invalid map points', () => {
  assert.equal(isWithinServiceArea(36.68, -6.13), true)
  assert.equal(isWithinServiceArea(40.4, -3.7), false)
  assert.equal(isLikelyInSea(36.49, -6.31), true)
  assert.equal(isLikelyInSea(36.6867, -6.1371), false)
})

test('normalizeAddressForGeocoding completes and cleans the customer address', () => {
  const customer = makeCustomer({
    address: ' C/AGUILA Nº 41. ',
    city: 'Jerez de la Frontera',
    province: 'Cádiz',
  })

  assert.equal(
    normalizeAddressForGeocoding(customer),
    'Calle AGUILA 41, Jerez de la Frontera, Cádiz, Spain'
  )
})

test('normalizeAddressForGeocoding expands street abbreviations and cleans noisy punctuation', () => {
  const customer = makeCustomer({
    address: 'C/ PEPE REMIGIO. EDIFICIO. FLORENCIA 1',
    city: 'Ceuta',
    province: 'Ceuta',
  })

  assert.equal(
    normalizeAddressForGeocoding(customer),
    'Calle PEPE REMIGIO EDIFICIO FLORENCIA 1, Ceuta, Spain'
  )
})

test('selectBestGeocodeResult does not trust the first result when city/province do not match', () => {
  const customer = makeCustomer({
    address: 'Avenida de Europa 5',
    city: 'Jerez de la Frontera',
    province: 'Cádiz',
  })

  const selected = selectBestGeocodeResult(
    [
      makeResult({
        lat: 36.49,
        lng: -6.31,
        displayName: 'Bahía de Cádiz, España',
        city: 'Cádiz',
        type: 'bay',
        category: 'natural',
      }),
      makeResult({
        lat: 36.6871,
        lng: -6.1358,
        displayName: 'Avenida de Europa 5, Jerez de la Frontera, Cádiz, España',
        city: 'Jerez de la Frontera',
        province: 'Cádiz',
        type: 'house',
        category: 'building',
      }),
    ],
    customer
  )

  assert.ok(selected)
  assert.equal(selected?.city, 'Jerez de la Frontera')
  assert.equal(selected?.lat, 36.6871)
})

test('validateAndFixClientCoordinates auto-corrects swapped latitude and longitude', async () => {
  const customer = makeCustomer({
    address: 'Calle Larga 12',
    city: 'Jerez de la Frontera',
    province: 'Cádiz',
    latitude: -6.1371,
    longitude: 36.6867,
  })

  const audit = await validateAndFixClientCoordinates(customer, {
    geocodeFetcher: async () => [],
  })

  assert.equal(audit.geocodeStatus, 'valid')
  assert.equal(audit.correctedLat, 36.6867)
  assert.equal(audit.correctedLng, -6.1371)
  assert.match(audit.geocodeReason, /invertid/i)
})

test('validateAndFixClientCoordinates falls back to approximate city center for incomplete addresses', async () => {
  const customer = makeCustomer({
    address: 'Huelva',
    city: 'Huelva',
    province: 'Huelva',
  })

  const audit = await validateAndFixClientCoordinates(customer, {
    geocodeFetcher: async () => [],
  })

  assert.equal(audit.geocodeStatus, 'approximate')
  assert.equal(audit.hasExactCoords, false)
  assert.ok(audit.markerCoords)
  assert.match(audit.geocodeReason, /aproximada/i)
})

test('validateAndFixClientCoordinates rejects sea-suspect geocoding results instead of plotting them', async () => {
  const customer = makeCustomer({
    address: 'Avenida del Mar 1',
    city: 'Cádiz',
    province: 'Cádiz',
  })

  const audit = await validateAndFixClientCoordinates(customer, {
    geocodeFetcher: async () => [
      makeResult({
        lat: 36.48,
        lng: -6.33,
        displayName: 'Atlantic Ocean, Cádiz, España',
        city: 'Cádiz',
        province: 'Cádiz',
        type: 'bay',
        category: 'natural',
      }),
    ],
  })

  assert.notEqual(audit.geocodeStatus, 'valid')
  assert.match(audit.geocodeReason, /mar|confirm/i)
})

test('sanitizeCoordinateCache removes malformed localStorage entries that would crash runtime checks', () => {
  const sanitized = sanitizeCoordinateCache({
    goodCoords: { lat: 36.6, lng: -6.1 },
    goodAudit: {
      geocodeStatus: 'approximate',
      geocodeReason: 'fallback',
    },
    badString: 'oops',
    badArray: [],
    badObject: { foo: 'bar' },
  })

  assert.deepEqual(Object.keys(sanitized).sort(), ['goodAudit', 'goodCoords'])
})
