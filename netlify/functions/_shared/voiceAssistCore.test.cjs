const test = require('node:test')
const assert = require('node:assert/strict')

const {
  detectIntent,
  classifyRecording,
  speakDistance,
  speakList,
  parseRouteCustomers,
  completedIds,
  pickNextStop,
  listCities,
  buildNavigationUrls,
  answerQuestion,
} = require('./voiceAssistCore.cjs')

// A short route through Jerez and Sanlúcar.
const ROUTE = {
  name: 'Lunes Cádiz',
  customers: [
    {
      id: 'c1',
      name: 'Clínica Rosa',
      address: 'Calle Larga 10',
      city: 'Jerez de la Frontera',
      order: 1,
      latitude: 36.6866,
      longitude: -6.1367,
    },
    {
      id: 'c2',
      name: 'Perfumería Luz',
      address: 'Plaza Mayor 3',
      city: 'Jerez de la Frontera',
      order: 2,
      latitude: 36.6935,
      longitude: -6.1401,
    },
    {
      id: 'c3',
      name: 'Centro Marina',
      address: 'Avenida del Mar 5',
      city: 'Sanlúcar de Barrameda',
      order: 3,
      latitude: 36.7789,
      longitude: -6.3533,
    },
  ],
  completed_visits: [],
}

const AT_ROSA = { lat: 36.6866, lng: -6.1367 }

const setup = (route = ROUTE, coords = null) => ({
  route,
  stops: parseRouteCustomers(route),
  done: completedIds(route),
  coords,
})

test('the three supported questions are recognised in Spanish', () => {
  assert.equal(detectIntent('¿Cuál es mi siguiente cliente?'), 'next_customer')
  assert.equal(detectIntent('quien es el siguiente'), 'next_customer')
  assert.equal(detectIntent('¿Cuántos clientes tengo hoy?'), 'today_count')
  assert.equal(detectIntent('que tengo hoy'), 'today_count')
  assert.equal(detectIntent('Llévame al siguiente'), 'navigate_next')
  assert.equal(detectIntent('navegar al siguiente cliente'), 'navigate_next')
})

test('navigation wins over the who-is-next wording it contains', () => {
  // This sentence matches both vocabularies; the driver wants the map open.
  assert.equal(detectIntent('llévame al siguiente cliente'), 'navigate_next')
  assert.equal(detectIntent('cómo llego al próximo cliente'), 'navigate_next')
})

test('accents and case never change the intent', () => {
  assert.equal(detectIntent('CUANTOS CLIENTES TENGO HOY'), 'today_count')
  assert.equal(detectIntent('cuántos clientes tengo hoy'), 'today_count')
  assert.equal(detectIntent('  próxima parada  '), 'next_customer')
})

test('anything else is answered with help instead of a guess', () => {
  assert.equal(detectIntent('qué tiempo hace'), 'unknown')
  assert.equal(detectIntent(''), 'unknown')
  assert.equal(detectIntent(null), 'unknown')

  const answer = answerQuestion({ intent: 'unknown', ...setup() })
  assert.ok(answer.speech.includes('siguiente cliente'))
  assert.equal(answer.stop, null)
})

test('a short recording that asks something is treated as a question', () => {
  assert.deepEqual(classifyRecording('¿Cuál es mi siguiente cliente?'), {
    kind: 'question',
    intent: 'next_customer',
  })
  assert.deepEqual(classifyRecording('llévame al siguiente'), {
    kind: 'question',
    intent: 'navigate_next',
  })
})

test('a visit note is filed even when it mentions the next customer', () => {
  // The salesperson is recounting a visit; the words overlap with the
  // question vocabulary but the recording is clearly a note.
  const note =
    'Acabo de salir de Clínica Rosa, les interesa mucho el Green Mask y quieren ' +
    'presupuesto de 20 cajas. Ahora voy al siguiente cliente.'

  assert.equal(classifyRecording(note).kind, 'note')
})

test('a recording with no recognisable question becomes a note', () => {
  assert.equal(classifyRecording('todo bien en la visita').kind, 'note')
  assert.equal(classifyRecording('').kind, 'note')
  assert.equal(classifyRecording(null).kind, 'note')
})

test('distances are spoken with sensible rounding', () => {
  assert.equal(speakDistance(120), '100 metros')
  assert.equal(speakDistance(980), '1000 metros')
  assert.equal(speakDistance(2400), '2,4 kilometros')
  assert.equal(speakDistance(23400), '23 kilometros')
  assert.equal(speakDistance(null), '')
})

test('city lists read the way a person says them', () => {
  assert.equal(speakList(['Jerez']), 'Jerez')
  assert.equal(speakList(['Jerez', 'Cádiz']), 'Jerez y Cádiz')
  assert.equal(speakList(['Jerez', 'Cádiz', 'Rota']), 'Jerez, Cádiz y Rota')
  assert.equal(speakList([]), '')
})

test('route stops are parsed in order, from JSON or an array', () => {
  const fromArray = parseRouteCustomers(ROUTE)
  assert.equal(fromArray.length, 3)
  assert.deepEqual(fromArray.map(stop => stop.id), ['c1', 'c2', 'c3'])

  const fromString = parseRouteCustomers({ customers: JSON.stringify(ROUTE.customers) })
  assert.equal(fromString.length, 3)

  assert.deepEqual(parseRouteCustomers({ customers: 'no es json' }), [])
  assert.deepEqual(parseRouteCustomers(null), [])
})

test('stops out of order are sorted by their planned position', () => {
  const shuffled = parseRouteCustomers({
    customers: [
      { id: 'b', name: 'Segundo', order: 2 },
      { id: 'a', name: 'Primero', order: 1 },
    ],
  })

  assert.deepEqual(shuffled.map(stop => stop.id), ['a', 'b'])
})

test('completed stops are read from the route', () => {
  const done = completedIds({ completed_visits: [{ customer_id: 'c1' }, { id: 'c2' }] })
  assert.equal(done.has('c1'), true)
  assert.equal(done.has('c2'), true)
  assert.equal(done.has('c3'), false)

  assert.equal(completedIds({ completed_visits: 'roto' }).size, 0)
  assert.equal(completedIds(null).size, 0)
})

test('the next stop is the first one still pending', () => {
  const stops = parseRouteCustomers(ROUTE)
  const next = pickNextStop(stops, new Set(['c1']), null)
  assert.equal(next.id, 'c2')
})

test('with a known position the closest pending stop wins', () => {
  const stops = parseRouteCustomers(ROUTE)
  // Parked next to Rosa but it is already done: Luz is closer than Marina.
  const next = pickNextStop(stops, new Set(['c1']), AT_ROSA)
  assert.equal(next.id, 'c2')
  assert.ok(next.meters > 0)
})

test('a finished route has no next stop', () => {
  const stops = parseRouteCustomers(ROUTE)
  assert.equal(pickNextStop(stops, new Set(['c1', 'c2', 'c3']), null), null)
})

test('cities are listed once each, in route order', () => {
  assert.deepEqual(listCities(parseRouteCustomers(ROUTE)), [
    'Jerez de la Frontera',
    'Sanlúcar de Barrameda',
  ])
})

test('the next-customer answer names the client, the place and the distance', () => {
  const answer = answerQuestion({ intent: 'next_customer', ...setup(ROUTE, AT_ROSA) })

  assert.ok(answer.speech.startsWith('Tu siguiente cliente es Clínica Rosa'))
  assert.ok(answer.speech.includes('Calle Larga 10'))
  assert.equal(answer.stop.id, 'c1')
  // Navigation links come along so "take me there" needs no second question.
  assert.ok(answer.navigation.google.includes('google.com/maps/dir'))
})

test('the count answer says how many are left, not just the total', () => {
  const route = { ...ROUTE, completed_visits: [{ customer_id: 'c1' }] }
  const answer = answerQuestion({ intent: 'today_count', ...setup(route) })

  assert.ok(answer.speech.includes('3 clientes'))
  assert.ok(answer.speech.includes('Jerez de la Frontera y Sanlúcar de Barrameda'))
  assert.ok(answer.speech.includes('1 ya visitados'))
  assert.ok(answer.speech.includes('Te quedan 2'))
})

test('a finished route is reported as finished, not as zero clients', () => {
  const route = {
    ...ROUTE,
    completed_visits: [{ customer_id: 'c1' }, { customer_id: 'c2' }, { customer_id: 'c3' }],
  }

  const count = answerQuestion({ intent: 'today_count', ...setup(route) })
  assert.ok(count.speech.includes('Has terminado'))

  const next = answerQuestion({ intent: 'next_customer', ...setup(route) })
  assert.ok(next.speech.includes('Ya has visitado todos'))
  assert.equal(next.stop, null)
})

test('without a route the assistant says so plainly', () => {
  const answer = answerQuestion({ intent: 'next_customer', route: null, stops: [], done: new Set() })
  assert.equal(answer.speech, 'No tienes ninguna ruta guardada para hoy.')
  assert.equal(answer.navigation, null)
})

test('the navigate answer confirms out loud before opening the map', () => {
  const answer = answerQuestion({ intent: 'navigate_next', ...setup(ROUTE, AT_ROSA) })

  assert.ok(answer.speech.startsWith('Vamos a Clínica Rosa'))
  assert.ok(answer.speech.includes('Abriendo la navegación'))
  assert.ok(answer.navigation.waze.includes('waze.com'))
  assert.ok(answer.navigation.apple.includes('maps.apple.com'))
})

test('navigation uses coordinates when we have them', () => {
  const urls = buildNavigationUrls({
    name: 'Clínica Rosa',
    address: 'Calle Larga 10',
    city: 'Jerez',
    latitude: 36.6866,
    longitude: -6.1367,
  })

  assert.ok(urls.google.includes('36.6866'))
  assert.ok(urls.waze.includes('ll='))
})

test('navigation falls back to the address when there are no coordinates', () => {
  const urls = buildNavigationUrls({
    name: 'Sin coordenadas',
    address: 'Calle Nueva 1',
    city: 'Rota',
    latitude: null,
    longitude: null,
  })

  assert.ok(urls.google.includes('Calle%20Nueva%201'))
  assert.ok(urls.google.includes('Rota'))
  assert.ok(urls.waze.includes('q='))
  assert.equal(buildNavigationUrls(null), null)
})
