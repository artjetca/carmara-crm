const test = require('node:test')
const assert = require('node:assert/strict')

const {
  searchTerms,
  scoreCustomer,
  findRelevantCustomers,
  describeCustomer,
  validateCustomerAnswer,
  answerCustomerQuestion,
} = require('./customerQueryCore.cjs')

const CUSTOMERS = [
  {
    id: 'c1',
    name: 'CLINICA ROSA S.L.',
    city: 'Jerez de la Frontera',
    province: 'Cádiz',
    address: 'Calle Larga 10',
    phone: '956111222',
    latitude: 36.6866,
    longitude: -6.1367,
  },
  {
    id: 'c2',
    name: 'GARCIA LARIOS, ROCÍO',
    city: 'Almonte',
    province: 'Huelva',
    address: 'Calle La Sabina 21',
    phone: '665110994',
    latitude: 37.2614,
    longitude: -6.5163,
  },
  {
    id: 'c3',
    name: 'PERFUMERIA LUZ',
    city: 'Jerez de la Frontera',
    province: 'Cádiz',
    address: 'Plaza Mayor 3',
    phone: null,
    latitude: null,
    longitude: null,
  },
]

const AT_JEREZ = { lat: 36.6866, lng: -6.1367 }

test('filler words are dropped when searching', () => {
  assert.deepEqual(searchTerms('¿Dónde está Clínica Rosa?'), ['clinica', 'rosa'])
  assert.deepEqual(searchTerms('dime el teléfono de Rocío'), ['rocio'])
  assert.deepEqual(searchTerms('¿qué clientes hay en Huelva?'), ['huelva'])
  assert.deepEqual(searchTerms('¿cómo llego?'), [])
})

test('a name match counts for more than a city match', () => {
  const byName = scoreCustomer(CUSTOMERS[0], ['rosa'])
  const byCity = scoreCustomer(CUSTOMERS[0], ['jerez'])

  assert.ok(byName > byCity, `nombre ${byName} deberia pesar mas que ciudad ${byCity}`)
})

test('a question finds the customer it is about', () => {
  const found = findRelevantCustomers('¿dónde está Clínica Rosa?', CUSTOMERS)

  assert.equal(found[0].id, 'c1')
})

test('accents and case never hide a customer', () => {
  assert.equal(findRelevantCustomers('telefono de rocio garcia', CUSTOMERS)[0].id, 'c2')
  assert.equal(findRelevantCustomers('PERFUMERIA LUZ', CUSTOMERS)[0].id, 'c3')
})

test('asking about a city returns everyone there', () => {
  const found = findRelevantCustomers('clientes en Huelva', CUSTOMERS)

  assert.equal(found.length, 1)
  assert.equal(found[0].id, 'c2')
})

test('a question about nobody we know returns nothing to talk about', () => {
  assert.deepEqual(findRelevantCustomers('Farmacia Central de Madrid', CUSTOMERS), [])
  assert.deepEqual(findRelevantCustomers('¿cómo llego?', CUSTOMERS), [])
})

test('the description carries what the driver needs, and nothing private', () => {
  const text = describeCustomer(CUSTOMERS[0], AT_JEREZ)

  assert.ok(text.includes('CLINICA ROSA'))
  assert.ok(text.includes('Calle Larga 10'))
  assert.ok(text.includes('956111222'))
  // Standing on top of it, so the distance is tiny.
  assert.ok(/metros de ti/.test(text), text)
})

test('a customer with no coordinates says so instead of guessing', () => {
  const text = describeCustomer(CUSTOMERS[2], AT_JEREZ)

  assert.ok(text.includes('sin ubicación en el mapa'), text)
  assert.ok(!/de ti/.test(text), text)
})

test('the answer is tied back to a real CRM row', () => {
  const validated = validateCustomerAnswer(
    { speech: 'Clínica Rosa está en Calle Larga 10.', customer_name: 'CLINICA ROSA S.L.' },
    CUSTOMERS
  )

  assert.equal(validated.customer.id, 'c1')
  assert.equal(validated.navigate, false)
})

test('a customer the model invented is dropped', () => {
  const validated = validateCustomerAnswer(
    { speech: 'Está en la calle Mayor.', customer_name: 'FARMACIA FANTASMA' },
    CUSTOMERS
  )

  assert.equal(validated.customer, null)
  // Navigation needs a real destination, so it cannot be requested either.
  assert.equal(validated.navigate, false)
})

test('navigation is only offered when there is somewhere to go', () => {
  const withCustomer = validateCustomerAnswer(
    { speech: 'Vamos.', customer_name: 'CLINICA ROSA S.L.', navigate: true },
    CUSTOMERS
  )
  assert.equal(withCustomer.navigate, true)

  const withoutCustomer = validateCustomerAnswer(
    { speech: 'No sé a quién te refieres.', customer_name: '', navigate: true },
    CUSTOMERS
  )
  assert.equal(withoutCustomer.navigate, false)
})

test('an answer with no sentence to speak is rejected', () => {
  assert.equal(validateCustomerAnswer({ speech: '   ' }, CUSTOMERS), null)
  assert.equal(validateCustomerAnswer('texto plano', CUSTOMERS), null)
  assert.equal(validateCustomerAnswer(null, CUSTOMERS), null)
})

test('a well-formed answer is returned on the first try', async () => {
  const reply = JSON.stringify({
    speech: 'Clínica Rosa está en Calle Larga 10, en Jerez.',
    customer_name: 'CLINICA ROSA S.L.',
    navigate: false,
  })

  const result = await answerCustomerQuestion(async () => reply, {
    question: '¿dónde está Clínica Rosa?',
    customers: CUSTOMERS,
    coords: AT_JEREZ,
  })

  assert.equal(result.status, 'ok')
  assert.equal(result.attempts, 1)
  assert.equal(result.customer.id, 'c1')
})

test('malformed JSON is retried once', async () => {
  let calls = 0
  const result = await answerCustomerQuestion(
    async () => {
      calls += 1
      if (calls === 1) return 'lo siento, no puedo'
      return JSON.stringify({ speech: 'Está en Calle Larga 10.', customer_name: 'CLINICA ROSA S.L.' })
    },
    { question: '¿dónde está Clínica Rosa?', customers: CUSTOMERS }
  )

  assert.equal(calls, 2)
  assert.equal(result.status, 'ok')
})

test('a failing model still says something out loud', async () => {
  const result = await answerCustomerQuestion(
    async () => {
      throw new Error('network down')
    },
    { question: '¿dónde está Clínica Rosa?', customers: CUSTOMERS }
  )

  assert.equal(result.status, 'failed')
  // Silence in the car is the one outcome we cannot accept.
  assert.ok(result.speech.length > 0)
  assert.equal(result.customer, null)
})
