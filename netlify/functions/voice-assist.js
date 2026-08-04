/**
 * POST /api/voice-assist
 *
 * Answers the three questions a salesperson asks from the car:
 *   - who is my next customer
 *   - how many customers do I have today
 *   - take me to the next one
 *
 * The answer comes back as a sentence meant to be spoken, plus navigation
 * links when there is a destination. Audio in, words out: no screen needed.
 */

const { jsonResponse, preflightResponse, requireUser } = require('./_shared/visitNotesAuth.cjs')
const { checkRateLimit, sanitizeForLog } = require('./_shared/visitNotesCore.cjs')
const {
  detectIntent,
  parseRouteCustomers,
  completedIds,
  answerQuestion,
} = require('./_shared/voiceAssistCore.cjs')

const MAX_AUDIO_BYTES = 4 * 1024 * 1024
const MAX_QUESTION_CHARS = 300
const STT_TIMEOUT_MS = 30000

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
  form.append('file', new Blob([audio], { type: mimeType }), `question.${extension}`)
  form.append('model', process.env.OPENAI_STT_MODEL || 'whisper-1')
  // The questions are always Spanish; telling Whisper avoids it guessing
  // another language on a two second clip.
  form.append('language', 'es')

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

/**
 * The route to answer about: today's if there is one, otherwise the most
 * recent unfinished plan, since a route is often saved the night before.
 */
async function loadRoute(supabase, userId, todayIso) {
  const { data: todays } = await supabase
    .from('saved_routes')
    .select('id, name, route_date, route_time, customers, completed, completed_visits')
    .eq('created_by', userId)
    .eq('route_date', todayIso)
    .order('created_at', { ascending: false })
    .limit(1)

  if (todays && todays.length > 0) return { route: todays[0], isToday: true }

  const { data: recent } = await supabase
    .from('saved_routes')
    .select('id, name, route_date, route_time, customers, completed, completed_visits')
    .eq('created_by', userId)
    .eq('completed', false)
    .order('route_date', { ascending: false, nullsFirst: false })
    .limit(1)

  if (recent && recent.length > 0) return { route: recent[0], isToday: false }
  return { route: null, isToday: false }
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return preflightResponse()
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { success: false, error: 'Method not allowed' })
  }

  const auth = await requireUser(event)
  if (auth.error) return auth.error

  const limit = checkRateLimit(`voice-assist:${auth.user.id}`, { limit: 40, windowMs: 60000 })
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

  // The question arrives either as audio or as text already transcribed on
  // the device.
  let question = String(body.question || '').trim().slice(0, MAX_QUESTION_CHARS)

  if (!question && body.audio_base64) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return jsonResponse(503, {
        success: false,
        error: 'El asistente de voz no esta configurado.',
        code: 'ai_not_configured',
      })
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
        error: 'La pregunta es demasiado larga.',
        code: 'audio_too_large',
      })
    }

    try {
      question = await transcribe(apiKey, audio, body.mime_type || 'audio/webm')
    } catch (error) {
      console.error('voice-assist stt failed', error && error.message)
      return jsonResponse(502, {
        success: false,
        error: 'No se pudo entender la pregunta.',
        code: 'stt_failed',
      })
    }
  }

  if (!question) {
    return jsonResponse(400, {
      success: false,
      error: 'Falta la pregunta.',
      code: 'empty_question',
    })
  }

  const intent = detectIntent(question)
  const today = new Date().toISOString().slice(0, 10)
  const { route, isToday } = await loadRoute(auth.supabase, auth.user.id, today)

  const stops = parseRouteCustomers(route)
  const done = completedIds(route)
  const coords =
    Number.isFinite(Number(body.lat)) && Number.isFinite(Number(body.lng))
      ? { lat: Number(body.lat), lng: Number(body.lng) }
      : null

  const answer = answerQuestion({ intent, route, stops, done, coords })

  // Be honest when the plan we are reading is not from today.
  let speech = answer.speech
  if (route && !isToday && intent !== 'unknown' && stops.length > 0) {
    speech = `No hay ruta para hoy, te respondo con la ultima ruta pendiente. ${speech}`
  }

  console.log('voice-assist', {
    user: auth.user.id,
    intent,
    stops: stops.length,
    question: sanitizeForLog(question),
  })

  return jsonResponse(200, {
    success: true,
    data: {
      question,
      intent: answer.intent,
      speech,
      stop: answer.stop,
      navigation: answer.navigation,
      route_name: route ? route.name : null,
      is_today: isToday,
    },
  })
}
