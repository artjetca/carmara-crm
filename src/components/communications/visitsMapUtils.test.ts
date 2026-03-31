import test from 'node:test'
import assert from 'node:assert/strict'

import type { Customer } from '../../lib/supabase'
import {
  buildCityDistanceSummary,
  calculateDistanceKm,
  deriveCity,
  deriveProvince,
  getNearestClientInCity,
  JEREZ_ORIGIN,
  refreshMapAndSidebarDistances,
  sortCitiesByDistance,
  sortClientsByDistance,
  type DistanceAwareCity,
  type DistanceAwareClient,
} from './visitsMapUtils'

const makeCustomer = (overrides: Partial<Customer>): Customer => ({
  id: overrides.id ?? crypto.randomUUID(),
  name: overrides.name ?? 'Cliente',
  created_at: overrides.created_at ?? '2026-03-31T00:00:00.000Z',
  updated_at: overrides.updated_at ?? '2026-03-31T00:00:00.000Z',
  created_by: overrides.created_by ?? 'user-1',
  ...overrides,
})

const makeDistanceAwareClient = (
  overrides: Partial<DistanceAwareClient>
): DistanceAwareClient => ({
  id: overrides.id ?? crypto.randomUUID(),
  name: overrides.name ?? 'Cliente',
  address: overrides.address ?? 'Calle Falsa 123',
  phone: overrides.phone ?? '',
  city: overrides.city ?? 'Jerez de la Frontera',
  province: overrides.province ?? 'Cádiz',
  lat: overrides.lat ?? null,
  lng: overrides.lng ?? null,
  distanceFromUser: overrides.distanceFromUser ?? null,
  distanceFromUserKm: overrides.distanceFromUserKm ?? overrides.distanceFromUser ?? null,
  nearestNeighborDistanceInCity: overrides.nearestNeighborDistanceInCity ?? null,
  nearestNeighborClientId: overrides.nearestNeighborClientId ?? null,
  travelTimeMinutes: overrides.travelTimeMinutes ?? null,
  travelTimeStatus: overrides.travelTimeStatus ?? 'unavailable',
  markerCoords: overrides.markerCoords ?? null,
  hasExactCoords: overrides.hasExactCoords ?? false,
  usesApproximateMarker: overrides.usesApproximateMarker ?? false,
  geocodeStatus: overrides.geocodeStatus ?? 'valid',
  geocodeReason: overrides.geocodeReason ?? 'Valid test coordinates',
  originalLat: overrides.originalLat ?? overrides.lat ?? null,
  originalLng: overrides.originalLng ?? overrides.lng ?? null,
  correctedLat: overrides.correctedLat ?? overrides.lat ?? null,
  correctedLng: overrides.correctedLng ?? overrides.lng ?? null,
  requiresManualReview: overrides.requiresManualReview ?? false,
  sourceCustomer: overrides.sourceCustomer ?? makeCustomer({ id: overrides.id, city: overrides.city, province: overrides.province }),
})

test('deriveProvince prefers canonical province values and falls back to notes', () => {
  const direct = makeCustomer({ province: 'cadiz', city: 'Jerez de la Frontera' })
  const fromNotes = makeCustomer({
    city: 'Huelva',
    notes: 'Provincia: Huelva\nCiudad: Trigueros',
  })

  assert.equal(deriveProvince(direct), 'Cádiz')
  assert.equal(deriveProvince(fromNotes), 'Huelva')
})

test('deriveCity ignores province-like city values and uses notes city when available', () => {
  const fromNotes = makeCustomer({
    city: 'Huelva',
    notes: 'Provincia: Huelva\nCiudad: Trigueros',
  })
  const direct = makeCustomer({ city: 'Jerez de la Frontera', province: 'Cádiz' })

  assert.equal(deriveCity(fromNotes), 'Trigueros')
  assert.equal(deriveCity(direct), 'Jerez de la Frontera')
})

test('calculateDistanceKm returns zero for the same coordinate and a known positive value otherwise', () => {
  assert.equal(calculateDistanceKm(36.6867, -6.1371, 36.6867, -6.1371), 0)

  const distance = calculateDistanceKm(36.6867, -6.1371, 36.5297, -6.2925)
  assert.ok(distance > 20 && distance < 25)
})

test('sortClientsByDistance orders known distances first and leaves unknown distances last', () => {
  const sorted = sortClientsByDistance([
    makeDistanceAwareClient({ id: 'unknown', distanceFromUser: null }),
    makeDistanceAwareClient({ id: 'far', distanceFromUser: 25.1 }),
    makeDistanceAwareClient({ id: 'near', distanceFromUser: 2.4 }),
  ])

  assert.deepEqual(sorted.map(client => client.id), ['near', 'far', 'unknown'])
})

test('sortCitiesByDistance orders known distances first and leaves unknown distances last', () => {
  const sorted = sortCitiesByDistance([
    {
      city: 'Sin coords',
      province: 'Cádiz',
      clientCount: 1,
      nearestDistanceFromUser: null,
      nearestDistanceFromUserKm: null,
      nearestTravelTimeMinutes: null,
      coords: null,
      clients: [],
      hasReachableClient: false,
      nearestClientIdFromUser: null,
    },
    {
      city: 'Cádiz',
      province: 'Cádiz',
      clientCount: 1,
      nearestDistanceFromUser: 20.4,
      nearestDistanceFromUserKm: 20.4,
      nearestTravelTimeMinutes: null,
      coords: { lat: 36.5297, lng: -6.2925 },
      clients: [],
      hasReachableClient: true,
      nearestClientIdFromUser: null,
    },
    {
      city: 'Jerez de la Frontera',
      province: 'Cádiz',
      clientCount: 1,
      nearestDistanceFromUser: 0,
      nearestDistanceFromUserKm: 0,
      nearestTravelTimeMinutes: null,
      coords: { lat: 36.6867, lng: -6.1371 },
      clients: [],
      hasReachableClient: true,
      nearestClientIdFromUser: null,
    },
  ] satisfies DistanceAwareCity[])

  assert.deepEqual(sorted.map(city => city.city), ['Jerez de la Frontera', 'Cádiz', 'Sin coords'])
})

test('getNearestClientInCity returns the nearest neighbor for exact-coordinate clients only', () => {
  const clients = [
    makeDistanceAwareClient({
      id: 'a',
      city: 'Jerez de la Frontera',
      lat: 36.6867,
      lng: -6.1371,
      hasExactCoords: true,
    }),
    makeDistanceAwareClient({
      id: 'b',
      city: 'Jerez de la Frontera',
      lat: 36.688,
      lng: -6.138,
      hasExactCoords: true,
    }),
    makeDistanceAwareClient({
      id: 'c',
      city: 'Jerez de la Frontera',
      lat: null,
      lng: null,
      hasExactCoords: false,
    }),
  ]

  const nearest = getNearestClientInCity(clients[0], clients)
  assert.equal(nearest?.clientId, 'b')
  assert.ok(nearest && nearest.distanceKm !== null && nearest.distanceKm < 1)
  assert.equal(getNearestClientInCity(clients[2], clients), null)
})

test('buildCityDistanceSummary uses the nearest exact client distance instead of city center distance', () => {
  const city = buildCityDistanceSummary({
    city: 'Huelva',
    province: 'Huelva',
    clients: [
      makeDistanceAwareClient({
        id: 'h1',
        city: 'Huelva',
        province: 'Huelva',
        lat: 37.2614,
        lng: -6.9447,
        hasExactCoords: true,
        distanceFromUser: 96.1,
      }),
      makeDistanceAwareClient({
        id: 'h2',
        city: 'Huelva',
        province: 'Huelva',
        lat: null,
        lng: null,
        hasExactCoords: false,
        distanceFromUser: null,
      }),
    ],
  })

  assert.equal(city.nearestDistanceFromUser, 96.1)
  assert.equal(city.clientCount, 2)
  assert.equal(city.hasReachableClient, true)
})

test('refreshMapAndSidebarDistances recalculates city and client distances when origin changes', () => {
  const customers = [
    makeCustomer({
      id: 'jerez-1',
      name: 'Cliente Jerez',
      city: 'Jerez de la Frontera',
      province: 'Cádiz',
      address: 'Calle Uno 1',
      latitude: 36.6867,
      longitude: -6.1371,
      phone: '600000001',
    }),
    makeCustomer({
      id: 'cadiz-1',
      name: 'Cliente Cádiz',
      city: 'Cádiz',
      province: 'Cádiz',
      address: 'Calle Dos 2',
      latitude: 36.5297,
      longitude: -6.2925,
      phone: '600000002',
    }),
    makeCustomer({
      id: 'cadiz-2',
      name: 'Cliente Cádiz Centro',
      city: 'Cádiz',
      province: 'Cádiz',
      address: 'Calle Tres Exacta 3',
      latitude: 36.527,
      longitude: -6.288,
      phone: '600000004',
    }),
    makeCustomer({
      id: 'cadiz-3',
      name: 'Cliente Sin Coordenadas',
      city: 'Cádiz',
      province: 'Cádiz',
      address: 'Calle Tres 3',
      phone: '600000003',
    }),
  ]

  const fromJerez = refreshMapAndSidebarDistances({
    customers,
    coordsById: {},
    activeOrigin: JEREZ_ORIGIN,
  })
  const fromCadiz = refreshMapAndSidebarDistances({
    customers,
    coordsById: {},
    activeOrigin: { name: 'Mi ubicación', coords: { lat: 36.5297, lng: -6.2925 } },
  })

  assert.deepEqual(fromJerez.cities.map(city => city.city), ['Jerez de la Frontera', 'Cádiz'])
  assert.equal(fromJerez.cities[0]?.nearestDistanceFromUser, 0)
  assert.ok((fromJerez.cities[1]?.nearestDistanceFromUser ?? 0) > 20)
  assert.equal(fromJerez.cities[1]?.clients[2]?.distanceFromUser, null)
  assert.equal(fromJerez.cities[1]?.clients[2]?.usesApproximateMarker, true)
  assert.ok((fromJerez.cities[1]?.clients[0]?.nearestNeighborDistanceInCity ?? 0) > 0)

  assert.deepEqual(fromCadiz.cities.map(city => city.city), ['Cádiz', 'Jerez de la Frontera'])
  assert.equal(fromCadiz.cities[0]?.nearestDistanceFromUser, 0)
  assert.ok((fromCadiz.cities[1]?.nearestDistanceFromUser ?? 0) > 20)
})
