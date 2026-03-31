import test from 'node:test'
import assert from 'node:assert/strict'

import type { Customer } from '../lib/supabase'
import {
  normalizeGeocodeResults,
  type ClientCoordinateAudit,
} from '../components/communications/visitsGeocodeUtils'
import {
  buildCityDistanceSummary,
  buildResolvedMapClient,
  getClientRenderableCoordinates,
  getNearestClientInCity,
  refreshMapAndSidebarDistances,
  sanitizeClients,
} from './mapsPageUtils'

const makeCustomer = (overrides: Partial<Customer>): Customer => ({
  id: overrides.id ?? crypto.randomUUID(),
  name: overrides.name ?? 'Cliente',
  created_at: overrides.created_at ?? '2026-03-31T00:00:00.000Z',
  updated_at: overrides.updated_at ?? '2026-03-31T00:00:00.000Z',
  created_by: overrides.created_by ?? 'user-1',
  ...overrides,
})

const makeAudit = (overrides: Partial<ClientCoordinateAudit>): ClientCoordinateAudit => ({
  geocodeStatus: overrides.geocodeStatus ?? 'valid',
  geocodeReason: overrides.geocodeReason ?? 'Valid coordinates',
  originalLat: overrides.originalLat ?? null,
  originalLng: overrides.originalLng ?? null,
  correctedLat: overrides.correctedLat ?? null,
  correctedLng: overrides.correctedLng ?? null,
  markerCoords: overrides.markerCoords ?? null,
  hasExactCoords: overrides.hasExactCoords ?? true,
  usesApproximateMarker: overrides.usesApproximateMarker ?? false,
  normalizedAddress: overrides.normalizedAddress ?? 'Calle Larga 1, Jerez de la Frontera, Cádiz, Spain',
  addressCompleteness: overrides.addressCompleteness ?? 'full',
  source: overrides.source ?? 'geocoded',
  addressSignature: overrides.addressSignature ?? 'sig',
})

test('normalizeGeocodeResults accepts array, results, data and features payloads', () => {
  const fromArray = normalizeGeocodeResults([{ lat: 36.6, lng: -6.1, displayName: 'A' }])
  const fromResults = normalizeGeocodeResults({ results: [{ lat: 36.6, lng: -6.1, displayName: 'B' }] })
  const fromData = normalizeGeocodeResults({ data: [{ lat: 36.6, lng: -6.1, displayName: 'C' }] })
  const fromFeatures = normalizeGeocodeResults({
    features: [
      {
        center: [-6.1, 36.6],
        place_name: 'D',
        properties: { country: 'Spain', region: 'Cádiz', place: 'Jerez de la Frontera' },
      },
    ],
  })

  assert.equal(fromArray.length, 1)
  assert.equal(fromResults.length, 1)
  assert.equal(fromData.length, 1)
  assert.equal(fromFeatures.length, 1)
  assert.equal(fromFeatures[0]?.lat, 36.6)
  assert.equal(fromFeatures[0]?.lng, -6.1)
})

test('getClientRenderableCoordinates only returns final coordinates for renderable clients', () => {
  assert.deepEqual(
    getClientRenderableCoordinates({
      finalLat: 36.6867,
      finalLng: -6.1371,
      geocodeStatus: 'valid',
    }),
    { lat: 36.6867, lng: -6.1371 }
  )

  assert.equal(
    getClientRenderableCoordinates({
      finalLat: 36.6867,
      finalLng: -6.1371,
      geocodeStatus: 'invalid',
    }),
    null
  )
})

test('buildCityDistanceSummary uses final coordinates for user and nearest-neighbor distances', () => {
  const customerA = makeCustomer({ id: 'a', name: 'A', city: 'Jerez de la Frontera', province: 'Cádiz' })
  const customerB = makeCustomer({ id: 'b', name: 'B', city: 'Jerez de la Frontera', province: 'Cádiz' })

  const city = buildCityDistanceSummary(
    [
      buildResolvedMapClient(
        customerA,
        makeAudit({ correctedLat: 36.6867, correctedLng: -6.1371 }),
        'Calle Uno 1',
        'Jerez de la Frontera',
        'Cádiz',
        '600000001'
      ),
      buildResolvedMapClient(
        customerB,
        makeAudit({ correctedLat: 36.688, correctedLng: -6.138 }),
        'Calle Dos 2',
        'Jerez de la Frontera',
        'Cádiz',
        '600000002'
      ),
    ],
    { lat: 36.6867, lng: -6.1371 }
  )

  assert.ok(city)
  assert.equal(city?.nearestDistanceFromUser, 0)
  assert.ok((city?.clients[1]?.nearestNeighborDistanceInCity ?? 0) > 0)
})

test('sanitizeClients removes undefined, null and non-object rows', () => {
  const sanitized = sanitizeClients([
    undefined,
    null,
    'bad-row',
    { id: 'ok', name: 'Cliente válido' },
  ])

  assert.equal(sanitized.length, 1)
  assert.equal(sanitized[0]?.id, 'ok')
})

test('getNearestClientInCity returns null when no valid neighbor exists', () => {
  const lonely = {
    id: 'solo',
    name: 'Solo',
    finalLat: null,
    finalLng: null,
    geocodeStatus: 'valid',
  }

  assert.equal(getNearestClientInCity(lonely, [lonely, undefined, null]), null)
  assert.equal(getNearestClientInCity(undefined, [lonely]), null)
})

test('refreshMapAndSidebarDistances tolerates invalid rows and missing final coordinates', () => {
  const customerA = makeCustomer({ id: 'safe-a', name: 'A', city: 'Jerez de la Frontera', province: 'Cádiz' })
  const customerB = makeCustomer({ id: 'safe-b', name: 'B', city: 'Jerez de la Frontera', province: 'Cádiz' })

  const valid = buildResolvedMapClient(
    customerA,
    makeAudit({ correctedLat: 36.6867, correctedLng: -6.1371 }),
    'Calle Uno 1',
    'Jerez de la Frontera',
    'Cádiz',
    '600000001'
  )

  const missingCoords = buildResolvedMapClient(
    customerB,
    makeAudit({ geocodeStatus: 'invalid', correctedLat: null, correctedLng: null }),
    'Calle Dos 2',
    'Jerez de la Frontera',
    'Cádiz',
    '600000002'
  )

  const summary = refreshMapAndSidebarDistances(
    [valid, undefined, null, missingCoords],
    { lat: 36.6867, lng: -6.1371 }
  )

  assert.equal(summary.clients.length, 2)
  assert.equal(summary.cities.length, 1)
  assert.equal(summary.cities[0]?.nearestDistanceFromUser, 0)
  assert.equal(summary.cities[0]?.clients.length, 2)
})
