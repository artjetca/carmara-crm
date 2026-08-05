/**
 * Voice questions a salesperson asks from the car.
 *
 * Intent detection is rule based on purpose. Driving needs an answer in well
 * under a second, and the three supported questions have a small, predictable
 * vocabulary; sending them to a model would add latency and cost for no gain.
 *
 * Answers are plain Spanish sentences meant to be spoken out loud, so they
 * avoid abbreviations and read naturally.
 */

const INTENTS = ['next_customer', 'today_count', 'navigate_next', 'unknown']

function fold(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Navigation is checked first: "llévame al siguiente cliente" also contains
// the words that would match the "who is next" question.
const NAVIGATE_PATTERNS = [
  /\bllevame\b/,
  /\bllevarme\b/,
  /\bvamos a\b/,
  /\bnavega\b/,
  /\bnavegar\b/,
  /\bcomo llego\b/,
  /\bruta al\b/,
  /\bdirecciones\b/,
  /\bir al siguiente\b/,
  /\bir a la siguiente\b/,
]

const NEXT_PATTERNS = [
  /\bsiguiente cliente\b/,
  /\bproximo cliente\b/,
  /\bproxima visita\b/,
  /\bsiguiente visita\b/,
  /\bsiguiente parada\b/,
  /\bproxima parada\b/,
  /\bquien es el siguiente\b/,
  /\bquien sigue\b/,
  /\ba quien voy\b/,
  /\bdonde voy ahora\b/,
]

const COUNT_PATTERNS = [
  /\bcuantos clientes\b/,
  /\bcuantas visitas\b/,
  /\bcuantas paradas\b/,
  /\bque tengo hoy\b/,
  /\bque hay hoy\b/,
  /\bagenda de hoy\b/,
  /\bruta de hoy\b/,
  /\bplan de hoy\b/,
  /\ba donde voy hoy\b/,
  /\bdonde voy hoy\b/,
]

function detectIntent(text) {
  const haystack = fold(text)
  if (!haystack) return 'unknown'

  if (NAVIGATE_PATTERNS.some(pattern => pattern.test(haystack))) return 'navigate_next'
  if (COUNT_PATTERNS.some(pattern => pattern.test(haystack))) return 'today_count'
  if (NEXT_PATTERNS.some(pattern => pattern.test(haystack))) return 'next_customer'

  // "el siguiente" on its own, after the app has just answered something.
  if (/\bel siguiente\b|\bla siguiente\b/.test(haystack)) return 'next_customer'

  return 'unknown'
}

// A question is short. A visit note runs on for a couple of sentences, and may
// well contain the words "el siguiente cliente" while describing what happened.
const MAX_QUESTION_CHARS = 70

// Words that mark a sentence as a question rather than a story about a visit.
const QUESTION_MARKERS = [
  /^\s*¿/,
  /\bdonde\b/,
  /\bcual\b/,
  /\bcuales\b/,
  /\bcuanto\b/,
  /\bcuantos\b/,
  /\bcuantas\b/,
  /\bquien\b/,
  /\bque\b/,
  /\bcomo\b/,
  /\bcuando\b/,
  /\btiene\b/,
  /\btelefono\b/,
  /\bdireccion\b/,
  /\bbusca\b/,
  /\bbuscar\b/,
  /\bdime\b/,
  /\bdame\b/,
  /\bllevame\b/,
  /\bnavega\b/,
  /\bmas cercano\b/,
  /\bmas cerca\b/,
]

function looksLikeQuestion(text) {
  const haystack = fold(text)
  if (!haystack) return false
  return QUESTION_MARKERS.some(pattern => pattern.test(haystack))
}

/**
 * Decide whether a recording is a question to answer or a visit note to file.
 *
 * One button has to serve both, because the salesperson is driving and cannot
 * choose a mode. Length is the discriminator: asking is brief, recounting a
 * visit is not.
 */
function classifyRecording(text) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return { kind: 'note', intent: 'unknown' }

  // Anything long is a visit note, whatever words it happens to contain.
  if (trimmed.length > MAX_QUESTION_CHARS) return { kind: 'note', intent: 'unknown' }

  const intent = detectIntent(trimmed)
  if (intent !== 'unknown') return { kind: 'question', intent }

  // Short and phrased as a question, but not one of the three we answer
  // instantly: hand it to the model so any wording works.
  if (looksLikeQuestion(trimmed)) return { kind: 'customer-question', intent: 'unknown' }

  return { kind: 'note', intent: 'unknown' }
}

/** Metres between two coordinates (haversine). */
function distanceMeters(a, b) {
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

/** Spoken distance: rounded, never more precise than it deserves. */
function speakDistance(meters) {
  if (meters === null || !Number.isFinite(meters)) return ''
  if (meters < 1000) return `${Math.round(meters / 50) * 50} metros`
  const km = meters / 1000
  return km < 10 ? `${km.toFixed(1).replace('.', ',')} kilometros` : `${Math.round(km)} kilometros`
}

function parseRouteCustomers(route) {
  if (!route) return []

  let list = route.customers
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []

  return list
    .filter(item => item && item.id && item.name)
    .map((item, index) => ({
      id: String(item.id),
      name: String(item.name),
      address: String(item.address || ''),
      city: String(item.city || ''),
      phone: String(item.phone || ''),
      order: Number.isFinite(Number(item.order)) ? Number(item.order) : index + 1,
      latitude: Number.isFinite(Number(item.latitude)) ? Number(item.latitude) : null,
      longitude: Number.isFinite(Number(item.longitude)) ? Number(item.longitude) : null,
    }))
    .sort((a, b) => a.order - b.order)
}

/** Ids already visited, taken from the route's completed list. */
function completedIds(route) {
  let list = route && route.completed_visits
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list)
    } catch {
      list = []
    }
  }
  if (!Array.isArray(list)) return new Set()

  return new Set(
    list
      .map(item => (item && (item.customer_id || item.id)) || null)
      .filter(Boolean)
      .map(String)
  )
}

/**
 * The stop to head for: the first one not yet done. When we know where the
 * phone is, the closest pending stop wins instead, because a salesperson does
 * not always follow the planned order.
 */
function pickNextStop(stops, done, coords) {
  const pending = stops.filter(stop => !done.has(stop.id))
  if (pending.length === 0) return null

  if (coords) {
    const withDistance = pending
      .filter(stop => stop.latitude !== null && stop.longitude !== null)
      .map(stop => ({
        stop,
        meters: distanceMeters(coords, { lat: stop.latitude, lng: stop.longitude }),
      }))
      .filter(entry => entry.meters !== null)
      .sort((a, b) => a.meters - b.meters)

    if (withDistance.length > 0) {
      return { ...withDistance[0].stop, meters: withDistance[0].meters }
    }
  }

  const next = pending[0]
  const meters =
    coords && next.latitude !== null && next.longitude !== null
      ? distanceMeters(coords, { lat: next.latitude, lng: next.longitude })
      : null

  return { ...next, meters }
}

function listCities(stops) {
  const seen = []
  for (const stop of stops) {
    const city = stop.city.trim()
    if (city && !seen.includes(city)) seen.push(city)
  }
  return seen
}

// -- Talking like an assistant, not a form -----------------------------------

/**
 * Pick one of several wordings.
 *
 * A colleague does not answer with the identical sentence every time; hearing
 * the same phrase all day makes the assistant feel like a machine reading a
 * field. The seed keeps one answer stable while it is being spoken.
 */
function pickVariant(options, seed = Date.now()) {
  if (!Array.isArray(options) || options.length === 0) return ''
  const index = Math.abs(Math.floor(seed / 1000)) % options.length
  return options[index]
}

/** Morning, afternoon or evening in Spain, for a natural greeting. */
function partOfDay(date = new Date(), timeZone = 'Europe/Madrid') {
  let hour
  try {
    hour = Number(
      new Intl.DateTimeFormat('es-ES', { timeZone, hour: 'numeric', hour12: false }).format(date)
    )
  } catch {
    hour = date.getHours()
  }

  if (!Number.isFinite(hour)) hour = 12
  if (hour < 6) return 'night'
  if (hour < 14) return 'morning'
  if (hour < 21) return 'afternoon'
  return 'night'
}

/**
 * A short remark about how the day is going.
 *
 * This is what makes it sound like an assistant rather than a database: it
 * notices progress instead of only reciting numbers. Only ever states facts
 * we can see in the route.
 */
function progressRemark(doneCount, pendingCount) {
  const total = doneCount + pendingCount
  if (total === 0) return ''

  if (doneCount === 0) return ''
  if (pendingCount === 0) return ''
  if (pendingCount === 1) return 'Ya solo te queda uno.'
  if (doneCount >= pendingCount) return 'Vas por buen camino.'
  return ''
}

/** Join city names the way a person would say them. */
function speakList(items) {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} y ${items[1]}`
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`
}

function buildNavigationUrls(stop) {
  if (!stop) return null

  const hasCoords = stop.latitude !== null && stop.longitude !== null
  const point = hasCoords ? `${stop.latitude},${stop.longitude}` : ''
  const query = hasCoords
    ? point
    : [stop.address, stop.city, 'España'].filter(Boolean).join(', ')
  const encoded = encodeURIComponent(query)

  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`,
    waze: hasCoords
      ? `https://waze.com/ul?ll=${encodeURIComponent(point)}&navigate=yes`
      : `https://waze.com/ul?q=${encoded}&navigate=yes`,
    apple: `https://maps.apple.com/?daddr=${encoded}&dirflg=d`,
  }
}

/**
 * Turn a question plus the day's route into something worth saying out loud.
 *
 * Every branch returns a `speech` sentence: the whole point is that the
 * salesperson never has to look at the screen.
 */
function answerQuestion({ intent, route, stops, done, coords, seed = Date.now(), now = new Date() }) {
  if (intent === 'unknown') {
    return {
      intent,
      speech: pickVariant(
        [
          'Perdona, no te he pillado. Puedes preguntarme quién es tu siguiente cliente, cuántos tienes hoy, o decirme que te lleve al siguiente.',
          'No te he entendido bien. Pregúntame por tu siguiente cliente, por los que tienes hoy, o dime que te lleve al siguiente.',
          'Eso no lo he cogido. Prueba con: quién es el siguiente, cuántos clientes tengo hoy, o llévame al siguiente.',
        ],
        seed
      ),
      stop: null,
      navigation: null,
    }
  }

  if (!route || stops.length === 0) {
    return {
      intent,
      speech: pickVariant(
        [
          'No veo ninguna ruta guardada para hoy. Si la preparas en Visitas, te voy guiando.',
          'Hoy no tienes ruta guardada. Créala en Visitas y te aviso de cada parada.',
          'No encuentro ruta para hoy. En cuanto guardes una, te digo por dónde empezar.',
        ],
        seed
      ),
      stop: null,
      navigation: null,
    }
  }

  const pending = stops.filter(stop => !done.has(stop.id))

  if (intent === 'today_count') {
    const cities = listCities(stops)
    const where = cities.length > 0 ? ` en ${speakList(cities)}` : ''

    if (pending.length === 0) {
      return {
        intent,
        speech: pickVariant(
          [
            `Ya está, ruta terminada: ${stops.length} clientes${where}. Buen trabajo.`,
            `Has cerrado la ruta de hoy, ${stops.length} clientes${where}. Nada más pendiente.`,
            `Todo hecho: los ${stops.length} clientes${where} están visitados.`,
          ],
          seed
        ),
        stop: null,
        navigation: null,
      }
    }

    const doneCount = stops.length - pending.length
    const remark = progressRemark(doneCount, pending.length)

    // Nothing done yet: this is the start of the day.
    if (doneCount === 0) {
      const moment = partOfDay(now)
      // Only full-stop greetings: a comma would leave "Buenos días, Te
      // esperan…", which reads and sounds wrong.
      const opener =
        moment === 'morning'
          ? pickVariant(['Buenos días. ', '', 'Buenos días. '], seed)
          : moment === 'afternoon'
            ? pickVariant(['Buenas tardes. ', '', 'Buenas tardes. '], seed)
            : ''

      return {
        intent,
        speech: pickVariant(
          [
            `${opener}Hoy tienes ${stops.length} clientes${where}.`,
            `${opener}Te esperan ${stops.length} clientes${where}.`,
            `${opener}La ruta de hoy son ${stops.length} clientes${where}.`,
          ],
          seed
        ).trim(),
        stop: null,
        navigation: null,
      }
    }

    return {
      intent,
      speech: pickVariant(
        [
          `Llevas ${doneCount} de ${stops.length}${where}. Te quedan ${pending.length}. ${remark}`,
          `De los ${stops.length} de hoy${where} ya has visto ${doneCount}. Quedan ${pending.length}. ${remark}`,
          `Van ${doneCount} visitados y quedan ${pending.length}${where}. ${remark}`,
        ],
        seed
      ).trim(),
      stop: null,
      navigation: null,
    }
  }

  const next = pickNextStop(stops, done, coords)

  if (!next) {
    return {
      intent,
      speech: pickVariant(
        [
          'Ya no queda nadie por visitar hoy. Buen trabajo.',
          'Has visitado a todos los de hoy, no queda ninguno.',
          'Ruta completa, no tienes más paradas hoy.',
        ],
        seed
      ),
      stop: null,
      navigation: null,
    }
  }

  const distance = speakDistance(next.meters)
  const navigation = buildNavigationUrls(next)
  const remaining = pending.length

  if (intent === 'navigate_next') {
    return {
      intent,
      speech: pickVariant(
        [
          `Vamos a ${next.name}${distance ? `, a ${distance}` : ''}. Te abro la navegación.`,
          `Marchando a ${next.name}${distance ? `, ${distance}` : ''}. Abriendo el mapa.`,
          `Te llevo a ${next.name}${distance ? `, a ${distance}` : ''}. Ahí va la ruta.`,
        ],
        seed
      ),
      stop: next,
      navigation,
    }
  }

  const place = [next.address, next.city].filter(Boolean).join(', ')
  const where = place ? `, en ${place}` : ''
  const howFar = distance ? `, a ${distance}` : ''
  // Mentioning what is left turns a lookup into a briefing.
  const tail =
    remaining === 1
      ? ' Es el último de hoy.'
      : remaining === 2
        ? ' Después te queda uno más.'
        : ` Después te quedan ${remaining - 1}.`

  return {
    intent,
    speech: pickVariant(
      [
        `Tu siguiente cliente es ${next.name}${where}${howFar}.${tail}`,
        `Ahora toca ${next.name}${where}${howFar}.${tail}`,
        `Te espera ${next.name}${where}${howFar}.${tail}`,
      ],
      seed
    ),
    stop: next,
    navigation,
  }
}

module.exports = {
  INTENTS,
  fold,
  detectIntent,
  classifyRecording,
  looksLikeQuestion,
  distanceMeters,
  speakDistance,
  speakList,
  parseRouteCustomers,
  completedIds,
  pickNextStop,
  listCities,
  pickVariant,
  partOfDay,
  progressRemark,
  buildNavigationUrls,
  answerQuestion,
}
