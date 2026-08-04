/**
 * Pure helpers for the voice visit-note feature.
 *
 * Everything here is side-effect free so it can be unit tested without
 * network, database or audio. HTTP calls live in the function handlers.
 */

const PRIORITIES = ['low', 'medium', 'high']
const SUPERVISOR_ROLES = ['supervisor', 'administrador']

const EMPTY_STRUCTURED_NOTE = {
  visit_summary: '',
  interested_products: [],
  customer_feedback: '',
  customer_issues: '',
  next_action: '',
  follow_up_date: null,
  follow_up_priority: 'medium',
  missing_information: [],
}

function isSupervisorRole(role) {
  return SUPERVISOR_ROLES.includes(String(role || '').toLowerCase())
}

/**
 * Read access: authors always, supervisors/administrators for every note.
 */
function canReadNote(note, actor) {
  if (!note || !actor || !actor.userId) return false
  if (note.salesperson_id === actor.userId) return true
  return isSupervisorRole(actor.role)
}

/**
 * Write access is deliberately narrower than read access: supervisors can
 * review everything but must not rewrite somebody else's visit record.
 */
function canModifyNote(note, actor) {
  if (!note || !actor || !actor.userId) return false
  return note.salesperson_id === actor.userId
}

/**
 * Which rows a list request may return. Salespeople are always pinned to
 * their own id, whatever the query string asks for.
 */
function buildListFilter(actor, params = {}) {
  const filter = {}

  if (!actor || !actor.userId) return null

  if (isSupervisorRole(actor.role)) {
    if (params.salesperson_id) filter.salesperson_id = params.salesperson_id
  } else {
    filter.salesperson_id = actor.userId
  }

  if (params.customer_id) filter.customer_id = params.customer_id
  return filter
}

function normalizePriority(value) {
  const raw = String(value || '').trim().toLowerCase()
  if (PRIORITIES.includes(raw)) return raw
  // Tolerate the words the model may emit in Spanish or Chinese.
  if (['baja', 'bajo', '低'].includes(raw)) return 'low'
  if (['alta', 'alto', 'urgente', '高', '緊急'].includes(raw)) return 'high'
  if (['media', 'medio', '中'].includes(raw)) return 'medium'
  return 'medium'
}

function toCleanString(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(item => toCleanString(item)).filter(item => item.length > 0)
  }
  const single = toCleanString(value)
  return single ? [single] : []
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/**
 * Models like to wrap JSON in ``` fences or add a sentence before it.
 * Pull out the first balanced JSON object instead of failing outright.
 */
function extractJson(text) {
  if (typeof text !== 'string') return null

  const withoutFences = text
    .replace(/```json/gi, '```')
    .split('```')
    .map(part => part.trim())
    .filter(Boolean)

  const candidates = [text.trim(), ...withoutFences]

  for (const candidate of candidates) {
    const start = candidate.indexOf('{')
    if (start === -1) continue

    let depth = 0
    let inString = false
    let escaped = false

    for (let index = start; index < candidate.length; index += 1) {
      const char = candidate[index]

      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }

      if (char === '"') inString = true
      else if (char === '{') depth += 1
      else if (char === '}') {
        depth -= 1
        if (depth === 0) {
          try {
            return JSON.parse(candidate.slice(start, index + 1))
          } catch {
            break
          }
        }
      }
    }
  }

  return null
}

// -- Relative date resolution ----------------------------------------------

const WEEKDAYS = [
  { index: 1, tokens: ['lunes', '星期一', '週一', '周一', '禮拜一'] },
  { index: 2, tokens: ['martes', '星期二', '週二', '周二', '禮拜二'] },
  { index: 3, tokens: ['miércoles', 'miercoles', '星期三', '週三', '周三', '禮拜三'] },
  { index: 4, tokens: ['jueves', '星期四', '週四', '周四', '禮拜四'] },
  { index: 5, tokens: ['viernes', '星期五', '週五', '周五', '禮拜五'] },
  { index: 6, tokens: ['sábado', 'sabado', '星期六', '週六', '周六', '禮拜六'] },
  { index: 0, tokens: ['domingo', '星期日', '星期天', '週日', '周日', '禮拜日', '禮拜天'] },
]

const NEXT_WEEK_TOKENS = [
  'la semana que viene',
  'la próxima semana',
  'la proxima semana',
  'semana que viene',
  'próxima semana',
  'proxima semana',
  '下星期',
  '下週',
  '下周',
  '下禮拜',
]

/**
 * In Spanish "el miércoles que viene" / "el próximo miércoles" attach the
 * "next" qualifier to the weekday itself, not to the word "semana". Those
 * phrases mean next week's Wednesday, so we detect them per weekday token.
 */
function mentionsNextWeekday(haystack, tokens) {
  return tokens.some(token => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const after = new RegExp(`${escaped}\\s*(que\\s+viene|pr[oó]xim[oa])`)
    const before = new RegExp(`(pr[oó]xim[oa])\\s+${escaped}`)
    return after.test(haystack) || before.test(haystack)
  })
}

function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function weekdayOf(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/**
 * Translate a spoken relative date into an ISO date.
 * Returns null whenever the expression is missing or ambiguous - we never
 * invent a follow-up date.
 */
function resolveRelativeDate(text, baseDateIso) {
  if (typeof text !== 'string' || !isValidIsoDate(baseDateIso)) return null

  const haystack = text.toLowerCase()

  // Order matters. A transcript usually opens with "hoy visité…" and only
  // later says when to follow up ("下星期三再聯絡"), so the most specific
  // expression must win over a bare "today"/"tomorrow" mentioned earlier.
  const currentDow = weekdayOf(baseDateIso)

  const weekday = WEEKDAYS.find(entry => entry.tokens.some(token => haystack.includes(token)))
  if (weekday) {
    const mentionsNextWeek =
      NEXT_WEEK_TOKENS.some(token => haystack.includes(token)) ||
      mentionsNextWeekday(haystack, weekday.tokens)

    if (mentionsNextWeek) {
      // Monday of next week, then the requested weekday inside that week.
      const daysUntilNextMonday = ((8 - currentDow) % 7) || 7
      const nextMonday = addDays(baseDateIso, daysUntilNextMonday)
      const offset = weekday.index === 0 ? 6 : weekday.index - 1
      return addDays(nextMonday, offset)
    }

    let delta = (weekday.index - currentDow + 7) % 7
    if (delta === 0) delta = 7
    return addDays(baseDateIso, delta)
  }

  const inDaysEs = haystack.match(/\ben\s+(\d{1,2})\s+d[ií]as?\b/)
  if (inDaysEs) return addDays(baseDateIso, Number(inDaysEs[1]))

  const inDaysZh = haystack.match(/(\d{1,2})\s*天(?:後|后|之後|之后)/)
  if (inDaysZh) return addDays(baseDateIso, Number(inDaysZh[1]))

  // Speech-to-text often drops the tilde, so accept "manana" as well.
  if (/pasado\s+ma(ñ|n)ana/.test(haystack) || haystack.includes('後天') || haystack.includes('后天')) {
    return addDays(baseDateIso, 2)
  }
  if (/\bma(ñ|n)ana\b/.test(haystack) || haystack.includes('明天') || haystack.includes('明日')) {
    return addDays(baseDateIso, 1)
  }

  // "Today" is almost always narration ("hoy he visitado…"), never a
  // follow-up instruction, so it is the last thing we consider.
  if (/\bhoy\b/.test(haystack) || haystack.includes('今天')) {
    return baseDateIso
  }

  return null
}

// -- Structured note validation --------------------------------------------

/**
 * Validate whatever the model returned against the fixed first-version schema.
 * Unknown keys are dropped and impossible values are neutralised rather than
 * trusted, because the model must never invent CRM data.
 */
function validateStructuredNote(input, options = {}) {
  const errors = []

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['not-an-object'], value: null }
  }

  const value = {
    visit_summary: toCleanString(input.visit_summary),
    interested_products: toStringArray(input.interested_products),
    customer_feedback: toCleanString(input.customer_feedback),
    customer_issues: toCleanString(input.customer_issues),
    next_action: toCleanString(input.next_action),
    follow_up_date: null,
    follow_up_priority: normalizePriority(input.follow_up_priority),
    missing_information: toStringArray(input.missing_information),
  }

  const rawDate = input.follow_up_date
  if (rawDate === null || rawDate === undefined || toCleanString(rawDate) === '') {
    value.follow_up_date = null
  } else if (isValidIsoDate(toCleanString(rawDate))) {
    value.follow_up_date = toCleanString(rawDate)
  } else {
    errors.push('invalid-follow-up-date')
    value.follow_up_date = null
  }

  if (!value.visit_summary) errors.push('empty-visit-summary')

  // Date arithmetic is the one thing an LLM reliably gets wrong: it happily
  // returns a well-formed date that lands on the wrong weekday. Whenever the
  // transcript contains an expression we can resolve ourselves, our own
  // calculation wins over whatever the model produced.
  const { transcript, today } = options
  if (transcript && today) {
    const resolved = resolveRelativeDate(transcript, today)
    if (resolved && resolved !== value.follow_up_date) {
      if (value.follow_up_date) errors.push('model-date-overridden')
      value.follow_up_date = resolved
    }
  }

  if (!value.follow_up_date && value.next_action) {
    const alreadyFlagged = value.missing_information.some(item =>
      item.toLowerCase().includes('follow_up_date')
    )
    if (!alreadyFlagged) value.missing_information.push('follow_up_date')
  }

  return { ok: errors.length === 0, errors, value }
}

function buildStructurePrompt({ transcript, today, customerName }) {
  const system = [
    'Eres un asistente que estructura notas de visitas comerciales.',
    'Devuelve EXCLUSIVAMENTE un objeto JSON valido. Sin markdown, sin explicaciones.',
    'Formato exacto:',
    '{"visit_summary":"","interested_products":[],"customer_feedback":"","customer_issues":"","next_action":"","follow_up_date":null,"follow_up_priority":"medium","missing_information":[]}',
    'Reglas:',
    '- Usa unicamente la informacion de la transcripcion.',
    '- Nunca inventes productos, cantidades, fechas ni compromisos.',
    '- Si un dato no aparece, deja el campo vacio o null y anadelo a missing_information.',
    `- La visita ocurre el ${today}. Convierte fechas relativas a formato ISO YYYY-MM-DD.`,
    '- Si no puedes convertir la fecha con seguridad, usa null y anade "follow_up_date" a missing_information.',
    '- follow_up_priority solo puede ser low, medium o high.',
    '- Redacta SIEMPRE en espanol, aunque el comercial hable en chino o mezcle idiomas.',
    '- Manten los nombres de producto y de cliente tal y como se dicen, sin traducirlos.',
  ].join('\n')

  const user = [
    customerName ? `Cliente (dato oficial del CRM): ${customerName}` : null,
    `Fecha de la visita: ${today}`,
    'Transcripcion:',
    transcript,
  ]
    .filter(Boolean)
    .join('\n')

  return { system, user }
}

/**
 * Ask the model for structured JSON, retrying once when the answer is not
 * valid JSON. `callLlm` is injected so this stays testable.
 */
async function structureWithRetry(callLlm, { transcript, today, customerName, maxAttempts = 2 }) {
  const prompt = buildStructurePrompt({ transcript, today, customerName })
  const attemptErrors = []

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let raw
    try {
      raw = await callLlm({ ...prompt, attempt })
    } catch (error) {
      attemptErrors.push(`llm-error:${error && error.message ? error.message : 'unknown'}`)
      continue
    }

    const parsed = extractJson(raw)
    if (!parsed) {
      attemptErrors.push('invalid-json')
      continue
    }

    const validated = validateStructuredNote(parsed, { transcript, today })
    if (validated.value) {
      return {
        status: validated.ok ? 'ok' : 'partial',
        value: validated.value,
        attempts: attempt,
        errors: validated.errors,
      }
    }

    attemptErrors.push('schema-invalid')
  }

  // Never lose the transcript: hand back an empty shell the user can fill in.
  return {
    status: 'manual',
    value: {
      ...EMPTY_STRUCTURED_NOTE,
      interested_products: [],
      missing_information: ['ai_structuring_failed'],
    },
    attempts: maxAttempts,
    errors: attemptErrors,
  }
}

// -- Whole-route dictation --------------------------------------------------

/**
 * Normalise a name for fuzzy matching: lowercase, strip accents and any
 * punctuation, collapse whitespace. Speech-to-text rarely reproduces the
 * exact CRM spelling, so we compare on this simplified form.
 */
function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const NAME_STOPWORDS = new Set([
  'clinica', 'clinicas', 'centro', 'centros', 'estetica', 'esthetic',
  'peluqueria', 'salon', 'spa', 'farmacia', 'perfumeria', 'instituto',
  'de', 'del', 'la', 'las', 'el', 'los', 'y', 'sl', 'slu', 'sa', 'cb',
])

function significantTokens(name) {
  return normalizeName(name)
    .split(' ')
    .filter(token => token.length > 2 && !NAME_STOPWORDS.has(token))
}

/**
 * Match a spoken customer name against the stops actually on the route.
 * We only ever return a customer that is already in the route, so the model
 * cannot invent a client. Ambiguous matches return null on purpose.
 */
function matchRouteCustomer(spokenName, routeCustomers) {
  if (!spokenName || !Array.isArray(routeCustomers) || routeCustomers.length === 0) {
    return null
  }

  const spoken = normalizeName(spokenName)
  if (!spoken) return null

  const exact = routeCustomers.filter(customer => normalizeName(customer.name) === spoken)
  if (exact.length === 1) return exact[0]

  const contains = routeCustomers.filter(customer => {
    const candidate = normalizeName(customer.name)
    return candidate.includes(spoken) || spoken.includes(candidate)
  })
  if (contains.length === 1) return contains[0]

  // Fall back to distinctive word overlap ("Rosa" for "Clínica Rosa S.L.").
  const spokenTokens = significantTokens(spokenName)
  if (spokenTokens.length === 0) return null

  const scored = routeCustomers
    .map(customer => {
      const tokens = significantTokens(customer.name)
      const shared = tokens.filter(token => spokenTokens.includes(token))
      return { customer, score: shared.length }
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return null
  // A tie means we cannot be sure which stop was meant.
  if (scored.length > 1 && scored[0].score === scored[1].score) return null

  return scored[0].customer
}

function buildRoutePrompt({ transcript, today, routeCustomers }) {
  const roster = (routeCustomers || [])
    .map((customer, index) => `${index + 1}. ${customer.name}${customer.city ? ` (${customer.city})` : ''}`)
    .join('\n')

  const system = [
    'Eres un asistente que separa el resumen hablado de una jornada comercial',
    'en una nota por cada cliente visitado.',
    'Devuelve EXCLUSIVAMENTE un objeto JSON valido. Sin markdown, sin explicaciones.',
    'Formato exacto:',
    '{"visits":[{"customer_name":"","visit_summary":"","interested_products":[],"customer_feedback":"","customer_issues":"","next_action":"","follow_up_date":null,"follow_up_priority":"medium","missing_information":[]}],"unmatched_notes":[]}',
    'Reglas:',
    '- Crea un elemento en "visits" por cada cliente del que hable el comercial.',
    '- customer_name debe copiarse EXACTAMENTE de la lista de paradas de la ruta.',
    '- Si menciona un cliente que no esta en la lista, no lo inventes: pon ese comentario en "unmatched_notes".',
    '- No repitas el mismo cliente dos veces: agrupa todo lo que diga de el.',
    '- Nunca inventes productos, cantidades, fechas ni compromisos.',
    '- Si un dato no aparece, deja el campo vacio o null y anadelo a missing_information.',
    `- La jornada es el ${today}. Convierte fechas relativas a formato ISO YYYY-MM-DD.`,
    '- Si no puedes convertir la fecha con seguridad, usa null.',
    '- follow_up_priority solo puede ser low, medium o high.',
    '- Redacta SIEMPRE en espanol, aunque el comercial hable en chino o mezcle idiomas.',
    '- Manten los nombres de producto tal y como se dicen, sin traducirlos.',
  ].join('\n')

  const user = [
    'Paradas de la ruta (usa estos nombres exactos):',
    roster || '(sin paradas)',
    '',
    `Fecha de la jornada: ${today}`,
    'Transcripcion de la jornada:',
    transcript,
  ].join('\n')

  return { system, user }
}

/**
 * Split one spoken summary of a whole day into per-customer notes.
 *
 * Each note is validated with the same schema as a single visit, and the
 * customer is resolved against the real route stops so the CRM link is never
 * based on speech recognition alone.
 */
async function structureRouteWithRetry(
  callLlm,
  { transcript, today, routeCustomers = [], maxAttempts = 2 }
) {
  const prompt = buildRoutePrompt({ transcript, today, routeCustomers })
  const attemptErrors = []

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let raw
    try {
      raw = await callLlm({ ...prompt, attempt })
    } catch (error) {
      attemptErrors.push(`llm-error:${error && error.message ? error.message : 'unknown'}`)
      continue
    }

    const parsed = extractJson(raw)
    if (!parsed || !Array.isArray(parsed.visits)) {
      attemptErrors.push('invalid-json')
      continue
    }

    const seen = new Set()
    const visits = []
    const unmatched = toStringArray(parsed.unmatched_notes)

    for (const entry of parsed.visits) {
      if (!entry || typeof entry !== 'object') continue

      const spokenName = toCleanString(entry.customer_name)
      const matched = matchRouteCustomer(spokenName, routeCustomers)

      if (!matched) {
        // Keep the content instead of dropping it, but never guess the client.
        if (spokenName || toCleanString(entry.visit_summary)) {
          unmatched.push(
            `${spokenName || 'Cliente no identificado'}: ${toCleanString(entry.visit_summary)}`.trim()
          )
        }
        continue
      }

      if (seen.has(matched.id)) continue
      seen.add(matched.id)

      // Resolve dates from THIS customer's own text only. Using the whole-day
      // transcript here would apply one stop's date to every other stop.
      const entryText = [
        toCleanString(entry.next_action),
        toCleanString(entry.visit_summary),
        toCleanString(entry.customer_feedback),
      ]
        .filter(Boolean)
        .join('. ')

      const validated = validateStructuredNote(entry, { today, transcript: entryText })
      if (!validated.value) continue

      visits.push({
        customer_id: matched.id,
        customer_name: matched.name,
        ...validated.value,
      })
    }

    return {
      status: visits.length > 0 ? 'ok' : 'manual',
      visits,
      unmatched,
      attempts: attempt,
      errors: attemptErrors,
    }
  }

  return {
    status: 'manual',
    visits: [],
    unmatched: [],
    attempts: maxAttempts,
    errors: attemptErrors,
  }
}

// -- Follow-up task ---------------------------------------------------------

function timeZoneOffsetMinutes(instant, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
  const part = formatter.formatToParts(instant).find(item => item.type === 'timeZoneName')
  const match = part && part.value.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/)
  if (!match) return 0
  const hours = Number(match[1])
  const minutes = Number(match[2] || 0)
  return hours * 60 + (hours < 0 ? -minutes : minutes)
}

/** Reminder defaults to 09:00 local time on the follow-up day. */
function buildRemindAt(dueDate, timeZone = 'Europe/Madrid', hour = 9) {
  if (!isValidIsoDate(dueDate)) return null

  const [year, month, day] = dueDate.split('-').map(Number)
  const naiveUtc = new Date(Date.UTC(year, month - 1, day, hour, 0, 0))
  const offset = timeZoneOffsetMinutes(naiveUtc, timeZone)
  return new Date(naiveUtc.getTime() - offset * 60000).toISOString()
}

function buildFollowUpTask(note, { timeZone = 'Europe/Madrid' } = {}) {
  if (!note || !note.follow_up_date || !isValidIsoDate(note.follow_up_date)) return null

  return {
    visit_note_id: note.id || null,
    customer_id: note.customer_id || null,
    customer_name: note.customer_name || '',
    salesperson_id: note.salesperson_id,
    next_action: note.next_action || '',
    due_date: note.follow_up_date,
    remind_at: buildRemindAt(note.follow_up_date, timeZone),
    priority: normalizePriority(note.follow_up_priority),
    status: 'pending',
  }
}

// -- Request helpers --------------------------------------------------------

const rateLimitBuckets = new Map()

/**
 * Best-effort per-instance rate limit. Netlify may run several instances, so
 * this throttles abuse without pretending to be a global quota.
 */
function checkRateLimit(key, { limit = 20, windowMs = 60000, now = Date.now() } = {}) {
  const bucket = rateLimitBuckets.get(key) || []
  const fresh = bucket.filter(timestamp => now - timestamp < windowMs)

  if (fresh.length >= limit) {
    rateLimitBuckets.set(key, fresh)
    return { allowed: false, retryAfterMs: windowMs - (now - fresh[0]) }
  }

  fresh.push(now)
  rateLimitBuckets.set(key, fresh)
  return { allowed: true, retryAfterMs: 0 }
}

function resetRateLimits() {
  rateLimitBuckets.clear()
}

/** Keep customer content out of logs; only shape information is safe. */
function sanitizeForLog(text) {
  if (typeof text !== 'string' || text.length === 0) return '<empty>'
  return `<${text.length} chars>`
}

module.exports = {
  PRIORITIES,
  EMPTY_STRUCTURED_NOTE,
  isSupervisorRole,
  canReadNote,
  canModifyNote,
  buildListFilter,
  normalizePriority,
  isValidIsoDate,
  extractJson,
  resolveRelativeDate,
  validateStructuredNote,
  buildStructurePrompt,
  structureWithRetry,
  buildRoutePrompt,
  structureRouteWithRetry,
  matchRouteCustomer,
  normalizeName,
  buildRemindAt,
  buildFollowUpTask,
  checkRateLimit,
  resetRateLimits,
  sanitizeForLog,
}
