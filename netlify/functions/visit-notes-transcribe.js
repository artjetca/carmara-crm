/**
 * POST /api/visit-notes/transcribe
 *
 * Receives a short audio recording and returns its transcript.
 * The audio is never persisted: it lives in memory for the duration of the
 * request only, because the transcript is what the CRM actually needs.
 */

const { jsonResponse, preflightResponse, requireUser } = require('./_shared/visitNotesAuth.cjs')
const { checkRateLimit, sanitizeForLog } = require('./_shared/visitNotesCore.cjs')

// Whisper accepts 25 MB; we stay below Netlify's own request ceiling.
const MAX_AUDIO_BYTES = 8 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 60000

function decodeBase64Audio(base64) {
  const payload = String(base64 || '').replace(/^data:[^;]+;base64,/, '')
  if (!payload) return null
  try {
    return Buffer.from(payload, 'base64')
  } catch {
    return null
  }
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return preflightResponse()
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Method not allowed' })
  }

  const auth = await requireUser(event)
  if (auth.error) return auth.error

  const limit = checkRateLimit(`transcribe:${auth.user.id}`, { limit: 20, windowMs: 60000 })
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
      error: 'Transcripción no configurada en el servidor.',
      code: 'stt_not_configured',
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
      error: 'La grabación está vacía.',
      code: 'empty_audio',
    })
  }

  if (audio.length > MAX_AUDIO_BYTES) {
    return jsonResponse(413, {
      success: false,
      error: 'La grabación es demasiado larga. Divide la nota en partes más cortas.',
      code: 'audio_too_large',
    })
  }

  const mimeType = typeof body.mime_type === 'string' && body.mime_type ? body.mime_type : 'audio/webm'
  const extension = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('wav') ? 'wav' : 'webm'

  const form = new FormData()
  form.append('file', new Blob([audio], { type: mimeType }), `visit-note.${extension}`)
  form.append('model', process.env.OPENAI_STT_MODEL || 'whisper-1')
  // Transcription stays on auto-detect: the salesperson may speak Spanish,
  // Chinese or mix both, and the raw transcript must reflect what was said.
  // The structured note is always written in Spanish (see visitNotesCore).
  if (typeof body.language === 'string' && body.language) {
    form.append('language', body.language)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text()
      console.error('STT failed', response.status, detail.slice(0, 200))
      return jsonResponse(502, {
        success: false,
        error: 'No se pudo transcribir el audio. Inténtalo de nuevo.',
        code: 'stt_failed',
      })
    }

    const result = await response.json()
    const transcript = String(result.text || '').trim()

    if (!transcript) {
      return jsonResponse(422, {
        success: false,
        error: 'No se ha detectado voz en la grabación.',
        code: 'empty_transcript',
      })
    }

    console.log('visit-note transcribed', { user: auth.user.id, transcript: sanitizeForLog(transcript) })

    return jsonResponse(200, { success: true, data: { transcript } })
  } catch (error) {
    const aborted = error && error.name === 'AbortError'
    console.error('STT error', aborted ? 'timeout' : error && error.message)
    return jsonResponse(aborted ? 504 : 502, {
      success: false,
      error: aborted
        ? 'La transcripción ha tardado demasiado. Inténtalo de nuevo.'
        : 'Error de red al transcribir. Inténtalo de nuevo.',
      code: 'stt_failed',
    })
  } finally {
    clearTimeout(timeout)
  }
}
