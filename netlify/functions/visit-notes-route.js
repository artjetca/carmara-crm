/**
 * POST /api/visit-notes/route
 *
 * Takes one spoken summary of a whole day and splits it into per-customer
 * notes. The salesperson dictates once after finishing the route instead of
 * recording a separate note for every stop.
 *
 * Customers are resolved against the stops actually on the route, so the CRM
 * link never depends on speech recognition alone.
 */

const { jsonResponse, preflightResponse, requireUser } = require('./_shared/visitNotesAuth.cjs')
const {
  structureRouteWithRetry,
  checkRateLimit,
  sanitizeForLog,
  isValidIsoDate,
} = require('./_shared/visitNotesCore.cjs')

const MAX_TRANSCRIPT_CHARS = 16000
const MAX_ROUTE_STOPS = 60
const REQUEST_TIMEOUT_MS = 60000

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

  const limit = checkRateLimit(`route-structure:${auth.user.id}`, { limit: 20, windowMs: 60000 })
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

  const transcript = String(body.transcript || '').trim()
  if (!transcript) {
    return jsonResponse(400, {
      success: false,
      error: 'Falta la transcripción.',
      code: 'empty_transcript',
    })
  }

  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    return jsonResponse(413, {
      success: false,
      error: 'El resumen de la jornada es demasiado largo.',
      code: 'transcript_too_large',
    })
  }

  const routeCustomers = Array.isArray(body.route_customers)
    ? body.route_customers
        .slice(0, MAX_ROUTE_STOPS)
        .map(customer => ({
          id: String(customer?.id || ''),
          name: String(customer?.name || '').trim(),
          city: String(customer?.city || '').trim(),
        }))
        .filter(customer => customer.id && customer.name)
    : []

  if (routeCustomers.length === 0) {
    return jsonResponse(400, {
      success: false,
      error: 'La ruta no tiene paradas para asignar las notas.',
      code: 'empty_route',
    })
  }

  const today = isValidIsoDate(body.visit_date)
    ? body.visit_date
    : new Date().toISOString().slice(0, 10)

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return jsonResponse(200, {
      success: true,
      data: {
        transcript,
        visit_date: today,
        structuring_status: 'manual',
        visits: [],
        unmatched: ['ai_not_configured'],
      },
    })
  }

  const result = await structureRouteWithRetry(createOpenAiCaller(apiKey), {
    transcript,
    today,
    routeCustomers,
    maxAttempts: 2,
  })

  if (result.status === 'manual') {
    console.error('route dictation structuring failed', {
      user: auth.user.id,
      stops: routeCustomers.length,
      attempts: result.attempts,
      errors: result.errors,
      transcript: sanitizeForLog(transcript),
    })
  }

  return jsonResponse(200, {
    success: true,
    data: {
      transcript,
      visit_date: today,
      structuring_status: result.status === 'manual' ? 'manual' : 'ok',
      visits: result.visits,
      unmatched: result.unmatched,
    },
  })
}
