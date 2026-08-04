/**
 * POST /api/map-assist
 *
 * Turns a spoken/typed request like "clientes de Huelva que no tienen mapa"
 * into the filters the map already supports. The model may only pick
 * provinces and cities that exist in the CRM, so it cannot send the map to a
 * place that has no customers.
 */

const { jsonResponse, preflightResponse, requireUser } = require('./_shared/visitNotesAuth.cjs')
const { checkRateLimit, sanitizeForLog } = require('./_shared/visitNotesCore.cjs')
const { interpretMapQuery } = require('./_shared/aiAssistCore.cjs')

const MAX_QUERY_CHARS = 400
const MAX_LIST_ITEMS = 300
const REQUEST_TIMEOUT_MS = 30000

function createOpenAiCaller(apiKey) {
  return async ({ system, user }) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: process.env.OPENAI_STRUCTURE_MODEL || 'gpt-4o-mini',
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      })

      if (!response.ok) {
        const detail = await response.text()
        throw new Error(`llm-http-${response.status}: ${detail.slice(0, 120)}`)
      }

      const payload = await response.json()
      return payload.choices && payload.choices[0] ? payload.choices[0].message.content : ''
    } finally {
      clearTimeout(timeout)
    }
  }
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return preflightResponse()
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Method not allowed' })
  }

  const auth = await requireUser(event)
  if (auth.error) return auth.error

  const limit = checkRateLimit(`map-assist:${auth.user.id}`, { limit: 40, windowMs: 60000 })
  if (!limit.allowed) {
    return jsonResponse(
      429,
      { success: false, error: 'Demasiadas solicitudes. Espera unos segundos.' },
      { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) }
    )
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return jsonResponse(400, { success: false, error: 'Invalid JSON body' })
  }

  const query = String(body.query || '').trim()
  if (!query) {
    return jsonResponse(400, {
      success: false,
      error: 'Falta la consulta.',
      code: 'empty_query',
    })
  }

  if (query.length > MAX_QUERY_CHARS) {
    return jsonResponse(413, {
      success: false,
      error: 'La consulta es demasiado larga.',
      code: 'query_too_large',
    })
  }

  const provinces = Array.isArray(body.provinces)
    ? body.provinces.slice(0, MAX_LIST_ITEMS).map(String).filter(Boolean)
    : []
  const cities = Array.isArray(body.cities)
    ? body.cities.slice(0, MAX_LIST_ITEMS).map(String).filter(Boolean)
    : []

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return jsonResponse(503, {
      success: false,
      error: 'La busqueda inteligente no esta configurada.',
      code: 'ai_not_configured',
    })
  }

  const result = await interpretMapQuery(createOpenAiCaller(apiKey), {
    query,
    provinces,
    cities,
    maxAttempts: 2,
  })

  if (result.status === 'failed') {
    console.error('map-assist failed', {
      user: auth.user.id,
      attempts: result.attempts,
      errors: result.errors,
      query: sanitizeForLog(query),
    })
    return jsonResponse(200, {
      success: true,
      data: { status: 'failed', filters: result.value },
    })
  }

  return jsonResponse(200, {
    success: true,
    data: { status: result.status, filters: result.value },
  })
}
