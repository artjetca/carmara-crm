/**
 * Voice questions asked from the car.
 *
 * The answer is spoken out loud, because the whole point is not having to look
 * at the phone while driving.
 */

import { supabase } from '../lib/supabase'
import { blobToBase64 } from './visitNotesClient'
import { getQuickPosition } from './quickCaptureClient'

export type VoiceIntent = 'next_customer' | 'today_count' | 'navigate_next' | 'unknown'

export interface VoiceStop {
  id: string
  name: string
  address: string
  city: string
  phone?: string
  latitude: number | null
  longitude: number | null
  meters?: number | null
}

export interface NavigationUrls {
  google: string
  waze: string
  apple: string
}

export interface VoiceAnswer {
  question: string
  intent: VoiceIntent
  speech: string
  stop: VoiceStop | null
  navigation: NavigationUrls | null
  route_name: string | null
  is_today: boolean
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sesión caducada. Vuelve a iniciar sesión.')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

/** Ask a question, either as recorded audio or as plain text. */
export async function askVoiceAssistant(params: {
  blob?: Blob
  question?: string
}): Promise<VoiceAnswer> {
  const headers = await authHeaders()
  const coords = await getQuickPosition(4000)

  const body: Record<string, unknown> = {
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
  }

  if (params.question) {
    body.question = params.question
  } else if (params.blob) {
    body.audio_base64 = await blobToBase64(params.blob)
    body.mime_type = params.blob.type || 'audio/webm'
  } else {
    throw new Error('Falta la pregunta.')
  }

  const response = await fetch('/api/voice-assist', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const text = await response.text()
  let payload: Record<string, unknown> = {}
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = {}
  }

  if (!response.ok || !payload.success) {
    throw new Error(String(payload.error || 'No se pudo responder.'))
  }

  return payload.data as VoiceAnswer
}

let currentAudio: HTMLAudioElement | null = null

/** Stop whatever is playing so answers never overlap. */
function stopCurrentAudio(): void {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio = null
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
}

/**
 * Last-resort robotic voice. Only used when the natural one cannot be
 * fetched, because hearing something beats hearing nothing while driving.
 */
function speakWithBrowser(sentence: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return

  try {
    const utterance = new SpeechSynthesisUtterance(sentence)
    utterance.lang = 'es-ES'
    utterance.rate = 1
    window.speechSynthesis.speak(utterance)
  } catch {
    // The answer is on screen either way.
  }
}

/**
 * Read the answer out loud with a natural Spanish voice.
 *
 * The audio is synthesised server side: the browser's built-in voice sounds
 * robotic and is frequently silent inside the iOS WebView, which defeats the
 * whole point of not looking at the phone.
 */
export async function speak(sentence: string): Promise<void> {
  if (!sentence || typeof window === 'undefined') return

  stopCurrentAudio()

  try {
    const headers = await authHeaders()
    const response = await fetch('/api/voice-speak', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: sentence, voice: getPreferredVoice() }),
    })

    if (!response.ok) throw new Error('tts-failed')

    const payload = await response.json()
    if (!payload.success || !payload.data?.audio_base64) throw new Error('tts-empty')

    const audio = new Audio(
      `data:${payload.data.mime_type || 'audio/mpeg'};base64,${payload.data.audio_base64}`
    )
    currentAudio = audio

    // Playing follows a tap, so autoplay restrictions do not apply.
    await audio.play()
  } catch {
    speakWithBrowser(sentence)
  }
}

export function stopSpeaking(): void {
  stopCurrentAudio()
}

export type AssistantVoice = 'nova' | 'shimmer' | 'alloy' | 'echo' | 'fable' | 'onyx'

const VOICE_PREFERENCE_KEY = 'casmara-assistant-voice'

export function getPreferredVoice(): AssistantVoice {
  if (typeof localStorage === 'undefined') return 'nova'
  const stored = localStorage.getItem(VOICE_PREFERENCE_KEY)
  const allowed: AssistantVoice[] = ['nova', 'shimmer', 'alloy', 'echo', 'fable', 'onyx']
  return allowed.includes(stored as AssistantVoice) ? (stored as AssistantVoice) : 'nova'
}

export function setPreferredVoice(voice: AssistantVoice): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(VOICE_PREFERENCE_KEY, voice)
}

export type NavigationApp = 'google' | 'waze' | 'apple'

const NAVIGATION_PREFERENCE_KEY = 'casmara-navigation-app'

export function getPreferredNavigationApp(): NavigationApp {
  if (typeof localStorage === 'undefined') return 'google'
  const stored = localStorage.getItem(NAVIGATION_PREFERENCE_KEY)
  return stored === 'waze' || stored === 'apple' ? stored : 'google'
}

export function setPreferredNavigationApp(app: NavigationApp): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(NAVIGATION_PREFERENCE_KEY, app)
}

/** Open the destination in the salesperson's usual navigation app. */
export function openNavigation(urls: NavigationUrls, app?: NavigationApp): void {
  const chosen = app || getPreferredNavigationApp()
  const url = urls[chosen] || urls.google
  window.open(url, '_blank')
}
