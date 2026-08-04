/**
 * POST /api/prospect-assist
 *
 * Ranks the prospects currently on screen so the salesperson knows which
 * doors to knock on first, with a short reason and an opening line.
 *
 * The ranking is always mapped back onto real prospect rows: the model can
 * only reorder what we sent it, never add a business that does not exist.
 */

const { jsonResponse, preflightResponse, requireUser } = require('./_shared/visitNotesAuth.cjs')
const { checkRateLimit } = require('./_shared/visitNotesCore.cjs')
const { rankProspects } = require('./_shared/aiAssistCore.cjs')

const MAX_PROSPECTS = 40
const REQUEST_TIMEOUT_MS = 45000

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
          temperature: 0.2,
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

  const limit = checkRateLimit(`prospect-assist:${auth.user.id}`, { limit: 20, windowMs: 60000 })
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

  // Only the fields needed to prioritise are sent; no notes or private data.
  const prospects = Array.isArray(body.prospects)
    ? body.prospects
        .slice(0, MAX_PROSPECTS)
        .map(prospect => ({
          id: String(prospect?.id || ''),
          business_name: String(prospect?.business_name || '').trim(),
          category: String(prospect?.category || '').trim(),
          city: String(prospect?.city || '').trim(),
          rating: Number.isFinite(Number(prospect?.rating)) ? Number(prospect.rating) : null,
          reviews_count: Number.isFinite(Number(prospect?.reviews_count))
            ? Number(prospect.reviews_count)
            : null,
          phone: prospect?.phone ? true : false,
          website: prospect?.website ? true : false,
        }))
        .filter(prospect => prospect.id && prospect.business_name)
    : []

  if (prospects.length === 0) {
    return jsonResponse(400, {
      success: false,
      error: 'No hay prospectos para analizar.',
      code: 'empty_prospects',
    })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return jsonResponse(503, {
      success: false,
      error: 'El asistente no esta configurado.',
      code: 'ai_not_configured',
    })
  }

  const result = await rankProspects(createOpenAiCaller(apiKey), {
    prospects,
    city: String(body.city || '').trim(),
    maxAttempts: 2,
  })

  if (result.status === 'failed') {
    console.error('prospect-assist failed', {
      user: auth.user.id,
      count: prospects.length,
      attempts: result.attempts,
      errors: result.errors,
    })
  }

  return jsonResponse(200, {
    success: true,
    data: {
      status: result.status,
      ranking: result.ranking,
      summary: result.summary,
    },
  })
}
