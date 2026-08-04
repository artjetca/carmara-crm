/**
 * POST /api/visit-notes/capture
 *
 * One-shot endpoint for a salesperson who is driving: send the audio, get a
 * saved draft back. Everything in between (transcription, structuring,
 * customer matching) happens server side so the phone needs a single request
 * and the driver never touches the screen twice.
 *
 * The note is always stored as a draft: an unreviewed AI date must not create
 * a reminder, and a wrongly matched customer must be easy to fix later.
 */

const { jsonResponse, preflightResponse, requireUser } = require('./_shared/visitNotesAuth.cjs')
const {
  structureWithRetry,
  checkRateLimit,
  sanitizeForLog,
  isValidIsoDate,
  validateStructuredNote,
} = require('./_shared/visitNotesCore.cjs')
const { resolveCaptureCustomer, stripLeadIn } = require('./_shared/quickCaptureCore.cjs')

const MAX_AUDIO_BYTES = 8 * 1024 * 1024
const STT_TIMEOUT_MS = 60000
const LLM_TIMEOUT_MS = 45000

function decodeBase64Audio(base64) {
  const payload = String(base64 || '').replace(/^data:[^;]+;base64,/, '')
  if (!payload) return null
  try {
    return Buffer.from(payload, 'base64')
  } catch {
    return null
  }
}

async function transcribe(apiKey, audio, mimeType) {
  const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('wav') ? 'wav' : 'webm'

  const form = new FormData()
  form.append('file', new Blob([audio], { type: mimeType }), `capture.${extension}`)
  form.append('model', process.env.OPENAI_STT_MODEL || 'whisper-1')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), STT_TIMEOUT_MS)

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text()
      throw new Error(`stt-http-${response.status}: ${detail.slice(0, 120)}`)
    }

    const result = await response.json()
    return String(result.text || '').trim()
  } finally {
    clearTimeout(timeout)
  }
}

function createOpenAiCaller(apiKey) {
  return async ({ system, user }) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)

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

/** Ask the model which customer was named, choosing only from real rows. */
async function extractSpokenCustomer(callLlm, transcript) {
  const system = [
    'Extraes el nombre del cliente que menciona un comercial en su nota de voz.',
    'Devuelve EXCLUSIVAMENTE un objeto JSON valido: {"customer_name":""}',
    'Si no menciona ningun negocio o cliente, devuelve una cadena vacia.',
    'No inventes nombres.',
  ].join('\n')

  try {
    const raw = await callLlm({ system, user: transcript })
    const parsed = JSON.parse(raw)
    return String(parsed.customer_name || '').trim()
  } catch {
    return ''
  }
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return preflightResponse()
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Method not allowed' })
  }

  const auth = await requireUser(event)
  if (auth.error) return auth.error

  const limit = checkRateLimit(`capture:${auth.user.id}`, { limit: 30, windowMs: 60000 })
  if (!limit.allowed) {
    return jsonResponse(
      429,
      { success: false, error: 'Demasiadas solicitudes. Espera unos segundos.' },
      { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) }
    )
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return jsonResponse(503, {
      success: false,
      error: 'La nota rapida no esta configurada.',
      code: 'ai_not_configured',
    })
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return jsonResponse(400, { success: false, error: 'Invalid JSON body' })
  }

  const audio = decodeBase64Audio(body.audio_base64)
  if (!audio || audio.length === 0) {
    return jsonResponse(400, {
      success: false,
      error: 'La grabacion esta vacia.',
      code: 'empty_audio',
    })
  }

  if (audio.length > MAX_AUDIO_BYTES) {
    return jsonResponse(413, {
      success: false,
      error: 'La grabacion es demasiado larga.',
      code: 'audio_too_large',
    })
  }

  const clientRequestId = String(body.client_request_id || '').trim()
  if (!clientRequestId) {
    return jsonResponse(400, {
      success: false,
      error: 'Falta el identificador de la nota.',
      code: 'missing_request_id',
    })
  }

  // A retry of the same recording must not create a second draft.
  const { data: alreadySaved } = await auth.supabase
    .from('sales_visit_notes')
    .select('id, customer_name, review_status')
    .eq('salesperson_id', auth.user.id)
    .eq('client_request_id', clientRequestId)
    .maybeSingle()

  if (alreadySaved) {
    return jsonResponse(200, { success: true, data: alreadySaved, deduplicated: true })
  }

  const today = isValidIsoDate(body.visit_date)
    ? body.visit_date
    : new Date().toISOString().slice(0, 10)

  const coords =
    Number.isFinite(Number(body.lat)) && Number.isFinite(Number(body.lng))
      ? { lat: Number(body.lat), lng: Number(body.lng) }
      : null

  // Transcription first: from here on the salesperson's words are safe.
  let transcript
  try {
    transcript = await transcribe(apiKey, audio, body.mime_type || 'audio/webm')
  } catch (error) {
    console.error('capture stt failed', error && error.message)
    return jsonResponse(502, {
      success: false,
      error: 'No se pudo transcribir la nota.',
      code: 'stt_failed',
    })
  }

  if (!transcript) {
    return jsonResponse(422, {
      success: false,
      error: 'No se ha detectado voz en la grabacion.',
      code: 'empty_transcript',
    })
  }

  // Customers are loaded server side so the phone does not have to upload the
  // whole address book with every recording.
  const { data: customers } = await auth.supabase
    .from('customers')
    .select('id, name, company, latitude, longitude, city')
    .limit(2000)

  const callLlm = createOpenAiCaller(apiKey)
  const spokenName = await extractSpokenCustomer(callLlm, transcript)
  const match = resolveCaptureCustomer({
    coords,
    spokenName,
    customers: customers || [],
  })

  const structured = await structureWithRetry(callLlm, {
    transcript: stripLeadIn(transcript),
    today,
    customerName: match.customer ? match.customer.name : '',
    maxAttempts: 2,
  })

  const validated = validateStructuredNote(structured.value, { today })
  const fields = validated.value || structured.value

  const now = new Date().toISOString()
  const { data, error } = await auth.supabase
    .from('sales_visit_notes')
    .insert({
      customer_id: match.customer ? match.customer.id : null,
      // Without a match we still need a label; the review screen will ask.
      customer_name: match.customer ? match.customer.name : spokenName || 'Cliente por identificar',
      salesperson_id: auth.user.id,
      visit_date: today,
      raw_transcript: transcript,
      ...fields,
      structuring_status: structured.status === 'manual' ? 'manual' : 'ok',
      review_status: 'pending_review',
      match_method: match.method,
      match_confidence: match.confidence,
      captured_lat: coords ? coords.lat : null,
      captured_lng: coords ? coords.lng : null,
      client_request_id: clientRequestId,
      created_by: auth.user.id,
      updated_by: auth.user.id,
      created_at: now,
      updated_at: now,
    })
    .select('id, customer_id, customer_name, visit_summary, review_status, match_method, match_confidence')
    .single()

  if (error) {
    // A concurrent retry may have inserted it first.
    if (error.code === '23505') {
      const { data: existing } = await auth.supabase
        .from('sales_visit_notes')
        .select('id, customer_name, review_status')
        .eq('salesperson_id', auth.user.id)
        .eq('client_request_id', clientRequestId)
        .maybeSingle()

      if (existing) {
        return jsonResponse(200, { success: true, data: existing, deduplicated: true })
      }
    }

    console.error('capture insert failed', error.message, {
      transcript: sanitizeForLog(transcript),
    })
    return jsonResponse(500, {
      success: false,
      error: 'No se pudo guardar la nota.',
      code: 'save_failed',
    })
  }

  return jsonResponse(201, {
    success: true,
    data,
    match: {
      method: match.method,
      confidence: match.confidence,
      meters: match.meters,
      nearby: match.nearby,
    },
  })
}
