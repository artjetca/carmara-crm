/**
 * Free-form questions about customers: who they are, where they are, and how
 * to get there.
 *
 * The three high-frequency route questions stay on the rule-based path, which
 * answers in milliseconds. Everything else lands here and is handed to the
 * model, so the salesperson can phrase a question however they like.
 *
 * The model never sees the whole database and never invents a customer: we
 * search the CRM first and let it speak only about the rows we found.
 */

const { extractJson } = require('./visitNotesCore.cjs')
const { foldText } = require('./aiAssistCore.cjs')

/** Words that carry no meaning when searching for a business name. */
const STOPWORDS = new Set([
  'donde', 'esta', 'como', 'llego', 'llegar', 'cual', 'cuales', 'quien', 'que',
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'en', 'a', 'al', 'para',
  'me', 'mi', 'te', 'se', 'es', 'son', 'tiene', 'tienen', 'hay', 'dime',
  'dame', 'busca', 'buscar', 'telefono', 'direccion', 'cliente', 'clientes',
  'llevame', 'navega', 'ir', 'vamos', 'por', 'con', 'y', 'o', 'sobre',
])

/**
 * A usable coordinate.
 *
 * `Number(null)` is 0, which passes an isFinite check and would place a
 * customer without coordinates in the Atlantic off Africa. Missing values
 * have to be rejected explicitly.
 */
function toCoordinate(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function hasLocation(customer) {
  return toCoordinate(customer.latitude) !== null && toCoordinate(customer.longitude) !== null
}

/**
 * Words worth searching the CRM for.
 *
 * Names in this database are people ("GARCIA LARIOS, ROCIO") and businesses
 * alike, so we keep anything that is not filler.
 */
function searchTerms(question) {
  return foldText(question)
    // Speech-to-text keeps "¿" and "?", which would never match a CRM field.
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(' ')
    .map(word => word.trim())
    .filter(word => word.length > 2 && !STOPWORDS.has(word))
}

/**
 * Score how well a customer matches the words in the question.
 * Returning zero means "not a match", so unrelated rows never reach the model.
 */
function scoreCustomer(customer, terms) {
  if (terms.length === 0) return 0

  const name = foldText(customer.name)
  const city = foldText(customer.city)
  const address = foldText(customer.address)
  const province = foldText(customer.province)

  let score = 0
  for (const term of terms) {
    // A hit on the name is what identifies a customer; the rest is context.
    if (name.includes(term)) score += 10
    else if (city.includes(term) || province.includes(term)) score += 4
    else if (address.includes(term)) score += 2
  }

  return score
}

/** The handful of customers a question could plausibly be about. */
function findRelevantCustomers(question, customers, limit = 8) {
  const terms = searchTerms(question)
  if (terms.length === 0 || !Array.isArray(customers)) return []

  return customers
    .map(customer => ({ customer, score: scoreCustomer(customer, terms) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(entry => entry.customer)
}

function metersBetween(a, b) {
  if (!a || !b) return null
  const toRad = value => (Number(value) * Math.PI) / 180
  const earthRadius = 6371000

  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat))

  const meters = 2 * earthRadius * Math.asin(Math.sqrt(h))
  return Number.isFinite(meters) ? meters : null
}

/**
 * Compact description of a customer for the prompt.
 *
 * Only the fields that answer "who, where, how far" — no notes or private
 * commentary leaves the CRM.
 */
function describeCustomer(customer, coords) {
  const parts = [customer.name]
  if (customer.company) parts.push(`empresa: ${customer.company}`)

  const place = [customer.address, customer.city, customer.province]
    .filter(Boolean)
    .join(', ')
  if (place) parts.push(`dirección: ${place}`)
  if (customer.phone) parts.push(`teléfono: ${customer.phone}`)

  if (coords && hasLocation(customer)) {
    const meters = metersBetween(coords, {
      lat: toCoordinate(customer.latitude),
      lng: toCoordinate(customer.longitude),
    })
    if (meters !== null) {
      parts.push(
        meters < 1000
          ? `a ${Math.round(meters / 50) * 50} metros de ti`
          : `a ${(meters / 1000).toFixed(1).replace('.', ',')} kilómetros de ti`
      )
    }
  }

  if (!hasLocation(customer)) {
    parts.push('sin ubicación en el mapa')
  }

  return parts.join(' | ')
}

function buildCustomerPrompt({ question, customers, coords }) {
  const roster = customers
    .map((customer, index) => `${index + 1}. ${describeCustomer(customer, coords)}`)
    .join('\n')

  const system = [
    'Eres el asistente de un comercial de cosmética que va conduciendo.',
    'Responde SOLO con un objeto JSON válido, sin markdown:',
    '{"speech":"","customer_name":"","navigate":false}',
    'Reglas:',
    '- speech es lo que se va a leer en voz alta: español natural, una o dos frases cortas.',
    '- Usa EXCLUSIVAMENTE los datos de la lista. Si algo no aparece, di que no lo tienes.',
    '- Nunca inventes clientes, teléfonos, direcciones ni distancias.',
    '- Si la lista está vacía, dilo con naturalidad y ofrece repetir el nombre.',
    '- customer_name debe copiarse EXACTAMENTE de la lista, o quedar vacío.',
    '- navigate es true solo si el comercial pide que le lleves o cómo llegar.',
    '- Va conduciendo: sé breve y no leas listas largas. Si hay varios, di cuántos y nombra dos.',
    '- No leas los números de teléfono dígito a dígito salvo que los pida.',
  ].join('\n')

  const user = [
    'Clientes encontrados en el CRM:',
    roster || '(ninguno)',
    '',
    `Pregunta del comercial: ${question}`,
  ].join('\n')

  return { system, user }
}

/**
 * Validate the model answer and tie it back to a real CRM row.
 * A name the model made up is dropped rather than trusted.
 */
function validateCustomerAnswer(input, customers) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null

  const speech = String(input.speech || '').trim()
  if (!speech) return null

  const spoken = foldText(input.customer_name)
  const matched = spoken
    ? customers.find(customer => foldText(customer.name) === spoken) ||
      customers.find(customer => foldText(customer.name).includes(spoken)) ||
      null
    : null

  return {
    speech,
    customer: matched,
    navigate: input.navigate === true && Boolean(matched),
  }
}

/**
 * Answer a free-form customer question, retrying once on malformed JSON.
 * `callLlm` is injected so this stays testable without network access.
 */
async function answerCustomerQuestion(
  callLlm,
  { question, customers, coords, maxAttempts = 2 }
) {
  const relevant = findRelevantCustomers(question, customers)
  const prompt = buildCustomerPrompt({ question, customers: relevant, coords })
  const errors = []

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let raw
    try {
      raw = await callLlm({ ...prompt, attempt })
    } catch (error) {
      errors.push(`llm-error:${error && error.message ? error.message : 'unknown'}`)
      continue
    }

    const parsed = extractJson(raw)
    if (!parsed) {
      errors.push('invalid-json')
      continue
    }

    const validated = validateCustomerAnswer(parsed, relevant)
    if (validated) {
      return { status: 'ok', ...validated, matches: relevant.length, attempts: attempt, errors }
    }

    errors.push('schema-invalid')
  }

  // Never leave the driver in silence: say something useful instead.
  return {
    status: 'failed',
    speech: 'No he podido consultarlo ahora mismo. Inténtalo otra vez en un momento.',
    customer: null,
    navigate: false,
    matches: relevant.length,
    attempts: maxAttempts,
    errors,
  }
}

module.exports = {
  searchTerms,
  scoreCustomer,
  findRelevantCustomers,
  describeCustomer,
  buildCustomerPrompt,
  validateCustomerAnswer,
  answerCustomerQuestion,
  hasLocation,
  toCoordinate,
}
