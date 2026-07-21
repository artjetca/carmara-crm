import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRouteCacheKey,
  formatRouteDistance,
  formatRouteDuration,
  routePointFromCoordinates,
} from './routingProvider'

test('formats route distances with Spanish-friendly km and metre labels', () => {
  assert.equal(formatRouteDistance(0.85), '850 m')
  assert.equal(formatRouteDistance(3.4), '3,4 km')
})

test('formats route duration without raw seconds', () => {
  assert.equal(formatRouteDuration(8), '8 min')
  assert.equal(formatRouteDuration(72), '1 h 12 min')
})

test('builds a rounded driving cache key for route points', () => {
  const origin = routePointFromCoordinates('current-location', 'Mi ubicación', { lat: 36.6867123, lng: -6.1371456 })
  const destination = routePointFromCoordinates('customer', 'Cliente', { lat: 36.700004, lng: -6.150006 }, 'customer-1')

  assert.equal(
    buildRouteCacheKey(origin, destination),
    '36.68671,-6.13715:36.70000,-6.15001:driving'
  )
})
