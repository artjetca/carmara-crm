/**
 * Upload layer for hands-free quick capture.
 *
 * The recording is queued locally first, then uploaded. Losing signal in the
 * countryside must never lose a note, so the queue is the source of truth and
 * the upload is just an attempt that can be repeated.
 */

import { supabase } from '../lib/supabase'
import {
  enqueueCapture,
  listPendingCaptures,
  removeCapture,
  shouldRetry,
  updateCapture,
  type PendingCapture,
} from './quickCaptureQueue'
import { blobToBase64, createRequestId, todayIso } from './visitNotesClient'

export interface CaptureMatchInfo {
  method: 'voice+gps' | 'voice' | 'gps' | 'none'
  confidence: 'high' | 'medium' | 'low' | 'none'
  meters: number | null
}

export interface CaptureResult {
  id: string
  customer_name: string
  match?: CaptureMatchInfo
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sesión caducada. Vuelve a iniciar sesión.')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

/**
 * Current position, best effort. A note without coordinates is still useful,
 * so we never block the recording waiting for a GPS fix.
 */
export function getQuickPosition(timeoutMs = 6000): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }

    let settled = false
    const finish = (value: { lat: number; lng: number } | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    navigator.geolocation.getCurrentPosition(
      position => finish({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => finish(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
    )

    window.setTimeout(() => finish(null), timeoutMs + 500)
  })
}

async function uploadCapture(entry: PendingCapture): Promise<CaptureResult> {
  const headers = await authHeaders()
  const response = await fetch('/api/visit-notes/capture', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      audio_base64: await blobToBase64(entry.blob),
      mime_type: entry.mimeType,
      lat: entry.lat,
      lng: entry.lng,
      visit_date: entry.visitDate,
      // The queue id doubles as the idempotency key, so a retry after a
      // timeout cannot create a second draft.
      client_request_id: entry.id,
    }),
  })

  const text = await response.text()
  let payload: Record<string, unknown> = {}
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = {}
  }

  if (!response.ok || !payload.success) {
    throw new Error(String(payload.error || 'No se pudo guardar la nota.'))
  }

  const data = (payload.data || {}) as Record<string, unknown>
  return {
    id: String(data.id || ''),
    customer_name: String(data.customer_name || ''),
    match: payload.match as CaptureMatchInfo | undefined,
  }
}

/**
 * Queue a recording and try to send it straight away.
 * Returns null when the upload did not go through; the note is safe in the
 * queue and will be retried.
 */
export async function captureNote(params: {
  blob: Blob
  lat: number | null
  lng: number | null
}): Promise<CaptureResult | null> {
  const entry: PendingCapture = {
    id: createRequestId(),
    blob: params.blob,
    mimeType: params.blob.type || 'audio/webm',
    lat: params.lat,
    lng: params.lng,
    visitDate: todayIso(),
    createdAt: Date.now(),
    attempts: 0,
  }

  await enqueueCapture(entry)

  try {
    const result = await uploadCapture(entry)
    await removeCapture(entry.id)
    return result
  } catch (error) {
    await updateCapture({
      ...entry,
      attempts: 1,
      lastError: error instanceof Error ? error.message : 'Error de red',
    })
    return null
  }
}

export interface FlushOutcome {
  uploaded: number
  remaining: number
}

/** Send everything waiting in the queue. Safe to call repeatedly. */
export async function flushCaptureQueue(): Promise<FlushOutcome> {
  let uploaded = 0

  const pending = await listPendingCaptures()
  for (const entry of pending) {
    if (!shouldRetry(entry)) continue

    try {
      await uploadCapture(entry)
      await removeCapture(entry.id)
      uploaded += 1
    } catch (error) {
      await updateCapture({
        ...entry,
        attempts: entry.attempts + 1,
        lastError: error instanceof Error ? error.message : 'Error de red',
      })
      // Stop on the first failure: if the network is down the rest will fail
      // too, and we would burn battery for nothing.
      break
    }
  }

  const remaining = (await listPendingCaptures()).length
  return { uploaded, remaining }
}
