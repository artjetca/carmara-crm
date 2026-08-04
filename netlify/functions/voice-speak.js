/**
 * POST /api/voice-speak
 *
 * Turns an answer into natural-sounding Spanish speech.
 *
 * The browser's built-in voice is robotic and, inside the iOS WebView, often
 * silent altogether. A salesperson driving needs to actually hear the answer,
 * so we synthesise it server side and play back real audio.
 */

const { jsonResponse, preflightResponse, requireUser } = require('./_shared/visitNotesAuth.cjs')
const { checkRateLimit } = require('./_shared/visitNotesCore.cjs')

const MAX_TEXT_CHARS = 500
const REQUEST_TIMEOUT_MS = 30000

// Voices that read Spanish naturally. `nova` is warm and clear at speed,
// which suits short answers heard over road noise.
const ALLOWED_VOICES = ['nova', 'shimmer', 'alloy', 'echo', 'fable', 'onyx']
const DEFAULT_VOICE = 'nova'

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return preflightResponse()
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Method not allowed' })
  }

  const auth = await requireUser(event)
  if (auth.error) return auth.error

  const limit = checkRateLimit(`voice-speak:${auth.user.id}`, { limit: 60, windowMs: 60000 })
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
      error: 'La voz no esta configurada.',
      code: 'tts_not_configured',
    })
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return jsonResponse(400, { success: false, error: 'Invalid JSON body' })
  }

  const text = String(body.text || '').trim().slice(0, MAX_TEXT_CHARS)
  if (!text) {
    return jsonResponse(400, { success: false, error: 'Falta el texto.', code: 'empty_text' })
  }

  const voice = ALLOWED_VOICES.includes(String(body.voice)) ? String(body.voice) : DEFAULT_VOICE

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
        voice,
        input: text,
        response_format: 'mp3',
        // Spoken in the car: a natural, unhurried delivery beats a news read.
        instructions:
          'Habla en español de España, con tono natural y cercano, como un compañero de trabajo que te avisa de algo mientras conduces. Ritmo tranquilo y claro.',
      }),
    })

    if (!response.ok) {
      const detail = await response.text()
      console.error('TTS failed', response.status, detail.slice(0, 160))
      return jsonResponse(502, {
        success: false,
        error: 'No se pudo generar la voz.',
        code: 'tts_failed',
      })
    }

    const audio = Buffer.from(await response.arrayBuffer())

    // Returned as base64 so the caller can play it without a second request
    // and without any temporary file on the server.
    return jsonResponse(200, {
      success: true,
      data: {
        audio_base64: audio.toString('base64'),
        mime_type: 'audio/mpeg',
        voice,
      },
    })
  } catch (error) {
    const aborted = error && error.name === 'AbortError'
    console.error('TTS error', aborted ? 'timeout' : error && error.message)
    return jsonResponse(aborted ? 504 : 502, {
      success: false,
      error: 'No se pudo generar la voz.',
      code: 'tts_failed',
    })
  } finally {
    clearTimeout(timeout)
  }
}
