/**
 * Pure helpers for the AI assistance on the Mapa and Prospectos pages.
 *
 * Two very different jobs share this file because they share the same hard
 * rule: the model may only choose from values that already exist in the CRM.
 * It never invents a province, a city or a prospect.
 *
 * Side-effect free so it can be unit tested without network or database.
 */

const { extractJson } = require('./visitNotesCore.cjs')

/** Accent/case insensitive comparison key. */
function foldText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Resolve a spoken place name to one of the values the CRM actually knows.
 * Returns '' when there is no confident match, so we never filter the map by
 * a place that does not exist.
 */
function resolveKnownValue(spoken, allowedValues) {
  const target = foldText(spoken)
  if (!target || !Array.isArray(allowedValues)) return ''

  const exact = allowedValues.find(value => foldText(value) === target)
  if (exact) return exact

  const partial = allowedValues.filter(value => {
    const candidate = foldText(value)
    return candidate.startsWith(target) || target.startsWith(candidate)
  })

  return partial.length === 1 ? partial[0] : ''
}

// -- Mapa: natural language search ------------------------------------------

const MAP_INTENTS = ['filter', 'locate', 'unknown']

const EMPTY_MAP_QUERY = {
  intent: 'unknown',
  province: '',
  city: '',
  search_terms: '',
  only_unmapped: false,
  notes: '',
}

function buildMapSearchPrompt({ query, provinces, cities }) {
  const system = [
    'Interpretas lo que un comercial pide sobre su mapa de clientes.',
    'Devuelve EXCLUSIVAMENTE un objeto JSON valido. Sin markdown, sin explicaciones.',
    'Formato exacto:',
    '{"intent":"filter","province":"","city":"","search_terms":"","only_unmapped":false,"notes":""}',
    'Reglas:',
    '- intent es "filter" si pide un conjunto de clientes, "locate" si busca uno concreto, "unknown" si no se entiende.',
    '- province y city deben copiarse EXACTAMENTE de las listas permitidas. Si no aparece en la lista, dejalo vacio.',
    '- Nunca inventes provincias, ciudades ni nombres de clientes.',
    '- search_terms es el texto libre para buscar por nombre, empresa o telefono. Vacio si no aplica.',
    '- only_unmapped es true solo si pide clientes sin ubicacion o sin coordenadas.',
    '- notes es una frase corta en espanol explicando que vas a mostrar.',
    '- Responde SIEMPRE en espanol.',
  ].join('\n')

  const user = [
    'Provincias permitidas:',
    (provinces || []).join(', ') || '(ninguna)',
    '',
    'Ciudades permitidas:',
    (cities || []).join(', ') || '(ninguna)',
    '',
    'Peticion del comercial:',
    query,
  ].join('\n')

  return { system, user }
}

/**
 * Validate the model answer against the real province/city lists.
 * Anything it made up is dropped rather than trusted.
 */
function validateMapQuery(input, { provinces = [], cities = [] } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, value: null, errors: ['not-an-object'] }
  }

  const errors = []
  const intent = MAP_INTENTS.includes(input.intent) ? input.intent : 'unknown'

  const province = resolveKnownValue(input.province, provinces)
  if (input.province && !province) errors.push('unknown-province')

  const city = resolveKnownValue(input.city, cities)
  if (input.city && !city) errors.push('unknown-city')

  const value = {
    intent,
    province,
    city,
    search_terms: String(input.search_terms || '').trim(),
    only_unmapped: input.only_unmapped === true,
    notes: String(input.notes || '').trim(),
  }

  // A filter that selects nothing at all is not useful; treat it as unknown
  // so the UI can tell the user instead of silently clearing the map.
  const hasAnyFilter =
    value.province || value.city || value.search_terms || value.only_unmapped
  if (!hasAnyFilter) {
    value.intent = 'unknown'
    errors.push('empty-filter')
  }

  return { ok: errors.length === 0, value, errors }
}

async function interpretMapQuery(callLlm, { query, provinces, cities, maxAttempts = 2 }) {
  const prompt = buildMapSearchPrompt({ query, provinces, cities })
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

    const validated = validateMapQuery(parsed, { provinces, cities })
    if (validated.value) {
      return {
        status: validated.value.intent === 'unknown' ? 'unknown' : 'ok',
        value: validated.value,
        attempts: attempt,
        errors: validated.errors,
      }
    }

    attemptErrors.push('schema-invalid')
  }

  return {
    status: 'failed',
    value: { ...EMPTY_MAP_QUERY },
    attempts: maxAttempts,
    errors: attemptErrors,
  }
}

// -- Prospectos: which leads to approach first ------------------------------

const PROSPECT_PRIORITIES = ['low', 'medium', 'high']

function normalizeProspectPriority(value) {
  const raw = String(value || '').toLowerCase()
  if (PROSPECT_PRIORITIES.includes(raw)) return raw
  if (['alta', 'alto'].includes(raw)) return 'high'
  if (['baja', 'bajo'].includes(raw)) return 'low'
  return 'medium'
}

/**
 * Models like to leave fill-in-the-blank markers such as "[tu nombre]" or
 * "{empresa}" in a suggested opening line. A salesperson standing at the door
 * cannot read that out loud, so we drop the line rather than hand over a
 * half-written script.
 */
function hasPlaceholders(text) {
  return /\[[^\]]*\]|\{[^}]*\}|<[^>]*>|_{2,}|xxx+/i.test(String(text || ''))
}

function cleanOpeningLine(text) {
  const line = String(text || '').trim()
  return hasPlaceholders(line) ? '' : line
}

function buildProspectPrompt({ prospects, city }) {
  const roster = (prospects || [])
    .map((prospect, index) => {
      const bits = [
        prospect.business_name,
        prospect.category ? `categoria: ${prospect.category}` : null,
        prospect.city ? `ciudad: ${prospect.city}` : null,
        prospect.rating ? `valoracion: ${prospect.rating}` : null,
        prospect.reviews_count ? `resenas: ${prospect.reviews_count}` : null,
        prospect.phone ? 'tiene telefono' : 'sin telefono',
        prospect.website ? 'tiene web' : null,
      ].filter(Boolean)
      return `${index + 1}. ${bits.join(' | ')}`
    })
    .join('\n')

  const system = [
    'Ayudas a un comercial de cosmetica profesional a priorizar visitas a prospectos.',
    'Devuelve EXCLUSIVAMENTE un objeto JSON valido. Sin markdown, sin explicaciones.',
    'Formato exacto:',
    '{"ranking":[{"business_name":"","priority":"medium","reason":"","opening_line":""}],"summary":""}',
    'Reglas:',
    '- business_name debe copiarse EXACTAMENTE de la lista dada.',
    '- No inventes negocios, telefonos, datos ni valoraciones que no aparezcan.',
    '- Usa solo la informacion de la lista para justificar la prioridad.',
    '- reason: una frase corta explicando por que priorizarlo.',
    '- opening_line: una frase breve y lista para decir en la puerta.',
    '- PROHIBIDO usar marcadores como [tu nombre], [tu empresa] o similares: el comercial se presenta solo.',
    '- Empieza la frase por el motivo de la visita, no por una presentacion personal.',
    '- priority solo puede ser low, medium o high.',
    '- Ordena de mayor a menor prioridad.',
    '- Responde SIEMPRE en espanol.',
  ].join('\n')

  const user = [
    city ? `Zona de trabajo: ${city}` : null,
    'Prospectos disponibles:',
    roster || '(ninguno)',
  ]
    .filter(Boolean)
    .join('\n')

  return { system, user }
}

/**
 * Rank prospects, keeping only entries that map onto a real prospect row.
 * The CRM id always comes from our own data, never from the model.
 */
function validateProspectRanking(input, prospects = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, value: null, errors: ['not-an-object'] }
  }

  const entries = Array.isArray(input.ranking) ? input.ranking : []
  const names = prospects.map(prospect => prospect.business_name)
  const seen = new Set()
  const ranking = []
  const errors = []

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue

    const resolvedName = resolveKnownValue(entry.business_name, names)
    if (!resolvedName) {
      errors.push('unknown-prospect')
      continue
    }

    const prospect = prospects.find(item => item.business_name === resolvedName)
    if (!prospect || seen.has(prospect.id)) continue
    seen.add(prospect.id)

    ranking.push({
      prospect_id: prospect.id,
      business_name: prospect.business_name,
      priority: normalizeProspectPriority(entry.priority),
      reason: String(entry.reason || '').trim(),
      opening_line: cleanOpeningLine(entry.opening_line),
    })
  }

  return {
    ok: ranking.length > 0,
    value: { ranking, summary: String(input.summary || '').trim() },
    errors,
  }
}

async function rankProspects(callLlm, { prospects, city, maxAttempts = 2 }) {
  const prompt = buildProspectPrompt({ prospects, city })
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

    const validated = validateProspectRanking(parsed, prospects)
    if (validated.ok) {
      return {
        status: 'ok',
        ranking: validated.value.ranking,
        summary: validated.value.summary,
        attempts: attempt,
        errors: validated.errors,
      }
    }

    attemptErrors.push('no-valid-entries')
  }

  return {
    status: 'failed',
    ranking: [],
    summary: '',
    attempts: maxAttempts,
    errors: attemptErrors,
  }
}

module.exports = {
  foldText,
  resolveKnownValue,
  EMPTY_MAP_QUERY,
  buildMapSearchPrompt,
  validateMapQuery,
  interpretMapQuery,
  normalizeProspectPriority,
  cleanOpeningLine,
  buildProspectPrompt,
  validateProspectRanking,
  rankProspects,
}
