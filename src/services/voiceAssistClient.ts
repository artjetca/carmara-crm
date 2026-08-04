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

/**
 * Read the answer out loud.
 *
 * Uses the browser voice: it needs no extra plugin and works offline. iOS only
 * allows it after a user gesture, which we always have because the answer
 * follows a tap.
 */
export function speak(sentence: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  if (!sentence) return

  try {
    // Cancel anything queued so answers never pile up on top of each other.
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(sentence)
    utterance.lang = 'es-ES'
    utterance.rate = 1
    window.speechSynthesis.speak(utterance)
  } catch {
    // Speaking is a convenience: the text is on screen either way.
  }
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(window.speechSynthesis)
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
