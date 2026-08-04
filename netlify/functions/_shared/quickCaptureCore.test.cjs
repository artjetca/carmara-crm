const test = require('node:test')
const assert = require('node:assert/strict')

const {
  distanceMeters,
  customersByProximity,
  resolveCaptureCustomer,
  stripLeadIn,
} = require('./quickCaptureCore.cjs')

// Three shops around Jerez, plus one far away in Huelva.
const ROSA = { id: 'c1', name: 'Clínica Rosa S.L.', latitude: 36.6866, longitude: -6.1367 }
const LUZ = { id: 'c2', name: 'Perfumería Luz', latitude: 36.6871, longitude: -6.1372 }
const MARINA = { id: 'c3', name: 'Centro de Estética Marina', latitude: 37.2614, longitude: -6.9447 }
const CUSTOMERS = [ROSA, LUZ, MARINA]

// Right on top of Clínica Rosa.
const AT_ROSA = { lat: 36.6866, lng: -6.1367 }
// About 2 km away from every shop above.
const FAR_AWAY = { lat: 36.7050, lng: -6.1500 }

test('distance between two points is measured in metres', () => {
  assert.equal(Math.round(distanceMeters(AT_ROSA, AT_ROSA)), 0)

  const meters = distanceMeters(AT_ROSA, { lat: 36.6871, lng: -6.1372 })
  // Roughly 65 m between Rosa and Luz.
  assert.ok(meters > 40 && meters < 100, `esperado ~65 m, obtenido ${meters}`)

  assert.equal(distanceMeters(null, AT_ROSA), Number.POSITIVE_INFINITY)
})

test('customers are ordered by how close they are', () => {
  const nearby = customersByProximity(AT_ROSA, CUSTOMERS)

  assert.equal(nearby[0].customer.id, 'c1')
  assert.equal(nearby[1].customer.id, 'c2')
  // The Huelva shop is over 70 km away but still listed last.
  assert.equal(nearby[2].customer.id, 'c3')
})

test('customers without coordinates are skipped', () => {
  const nearby = customersByProximity(AT_ROSA, [
    { id: 'x', name: 'Sin coordenadas' },
    ROSA,
  ])

  assert.equal(nearby.length, 1)
  assert.equal(nearby[0].customer.id, 'c1')
})

test('voice and GPS agreeing gives a confident match', () => {
  const result = resolveCaptureCustomer({
    coords: AT_ROSA,
    spokenName: 'Clínica Rosa',
    customers: CUSTOMERS,
  })

  assert.equal(result.customer.id, 'c1')
  assert.equal(result.method, 'voice+gps')
  assert.equal(result.confidence, 'high')
})

test('the spoken name wins when GPS points somewhere else', () => {
  // The salesperson says Marina but the phone still reports Jerez: a stale fix
  // or a roughly geocoded address. Their word is more reliable.
  const result = resolveCaptureCustomer({
    coords: AT_ROSA,
    spokenName: 'Centro de Estética Marina',
    customers: CUSTOMERS,
  })

  assert.equal(result.customer.id, 'c3')
  assert.equal(result.method, 'voice')
  // Flagged as weak so the review screen asks for a second look.
  assert.equal(result.confidence, 'low')
})

test('GPS alone identifies an isolated shop', () => {
  const result = resolveCaptureCustomer({
    coords: { lat: 37.2614, lng: -6.9447 },
    spokenName: '',
    customers: CUSTOMERS,
  })

  assert.equal(result.customer.id, 'c3')
  assert.equal(result.method, 'gps')
  assert.equal(result.confidence, 'medium')
})

test('two shops side by side are never guessed from GPS alone', () => {
  // Rosa and Luz are ~65 m apart; picking one would be a coin flip.
  const result = resolveCaptureCustomer({
    coords: AT_ROSA,
    spokenName: '',
    customers: [ROSA, LUZ],
  })

  assert.equal(result.customer, null)
  assert.equal(result.confidence, 'none')
  // The review screen still gets the candidates to choose from.
  assert.equal(result.nearby.length, 2)
})

test('being far from everything leaves the note unassigned', () => {
  const result = resolveCaptureCustomer({
    coords: FAR_AWAY,
    spokenName: '',
    customers: CUSTOMERS,
  })

  assert.equal(result.customer, null)
  assert.equal(result.method, 'none')
})

test('a note with no GPS at all still works from the spoken name', () => {
  const result = resolveCaptureCustomer({
    coords: null,
    spokenName: 'Perfumería Luz',
    customers: CUSTOMERS,
  })

  assert.equal(result.customer.id, 'c2')
  assert.equal(result.method, 'voice')
})

test('an unknown business is never filed under a real customer', () => {
  const result = resolveCaptureCustomer({
    coords: FAR_AWAY,
    spokenName: 'Farmacia Central',
    customers: CUSTOMERS,
  })

  assert.equal(result.customer, null)
  assert.equal(result.confidence, 'none')
})

test('the lead-in phrase is stripped from the note', () => {
  assert.equal(
    stripLeadIn('acabo de salir de Clínica Rosa, les interesa el Green Mask'),
    'Clínica Rosa, les interesa el Green Mask'
  )
  assert.equal(stripLeadIn('Vengo de Perfumería Luz'), 'Perfumería Luz')
  assert.equal(stripLeadIn('剛拜訪完 Clínica Rosa'), '拜訪完 Clínica Rosa')

  // A note that does not start with a lead-in is untouched.
  const plain = 'Les interesa el Green Mask'
  assert.equal(stripLeadIn(plain), plain)
})
