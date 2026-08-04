/**
 * POST /api/visit-notes/structure
 *
 * Turns a raw transcript into the fixed first-version field set.
 * The transcript is always returned to the caller, so an AI failure can never
 * lose what the salesperson said.
 */

const { jsonResponse, preflightResponse, requireUser } = require('./_shared/visitNotesAuth.cjs')
const {
  structureWithRetry,
  checkRateLimit,
  sanitizeForLog,
  isValidIsoDate,
} = require('./_shared/visitNotesCore.cjs')

const MAX_TRANSCRIPT_CHARS = 8000
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

  const limit = checkRateLimit(`structure:${auth.user.id}`, { limit: 30, windowMs: 60000 })
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
      error: 'La nota de voz es demasiado larga.',
      code: 'transcript_too_large',
    })
  }

  // The visit date comes from the client clock but is validated here; the
  // model never decides "today" on its own.
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
        structured: {
          visit_summary: '',
          interested_products: [],
          customer_feedback: '',
          customer_issues: '',
          next_action: '',
          follow_up_date: null,
          follow_up_priority: 'medium',
          missing_information: ['ai_not_configured'],
        },
      },
    })
  }

  const result = await structureWithRetry(createOpenAiCaller(apiKey), {
    transcript,
    today,
    // Customer name comes from the CRM record, never from speech recognition.
    customerName: String(body.customer_name || '').trim(),
    maxAttempts: 2,
  })

  if (result.status === 'manual') {
    console.error('visit-note structuring failed', {
      user: auth.user.id,
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
      structured: result.value,
    },
  })
}
