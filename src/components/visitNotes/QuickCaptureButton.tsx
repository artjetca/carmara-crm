import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Check, CloudOff, Loader2, Mic, Square } from 'lucide-react'
import {
  captureNote,
  flushCaptureQueue,
  getQuickPosition,
  type CaptureResult,
} from '../../services/quickCaptureClient'
import { countPendingCaptures } from '../../services/quickCaptureQueue'

type CaptureStage = 'idle' | 'recording' | 'sending' | 'done' | 'queued' | 'error'

/**
 * Always-available record button for a salesperson who is driving.
 *
 * One tap starts, one tap stops. Nothing else is required: the note is
 * transcribed, matched to a customer and stored as a draft server side, and
 * reviewed later when the car is parked.
 */
export default function QuickCaptureButton() {
  const [stage, setStage] = useState<CaptureStage>('idle')
  const [seconds, setSeconds] = useState(0)
  const [message, setMessage] = useState('')
  const [pendingCount, setPendingCount] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null)
  const resetRef = useRef<number | null>(null)

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }, [])

  const refreshPending = useCallback(async () => {
    setPendingCount(await countPendingCaptures())
  }, [])

  useEffect(() => {
    void refreshPending()
    return () => {
      stopTimer()
      releaseStream()
      if (resetRef.current !== null) window.clearTimeout(resetRef.current)
    }
  }, [refreshPending, releaseStream, stopTimer])

  // Anything recorded without signal is sent as soon as the phone is back
  // online, and also on a slow timer for flaky rural coverage.
  useEffect(() => {
    const flush = async () => {
      const outcome = await flushCaptureQueue().catch(() => null)
      if (outcome && outcome.uploaded > 0) {
        setMessage(`${outcome.uploaded} nota(s) enviada(s)`)
        window.setTimeout(() => setMessage(''), 4000)
      }
      await refreshPending()
    }

    window.addEventListener('online', flush)
    const interval = window.setInterval(flush, 60000)
    void flush()

    return () => {
      window.removeEventListener('online', flush)
      window.clearInterval(interval)
    }
  }, [refreshPending])

  const scheduleReset = useCallback(() => {
    if (resetRef.current !== null) window.clearTimeout(resetRef.current)
    resetRef.current = window.setTimeout(() => {
      setStage('idle')
      setMessage('')
      setSeconds(0)
    }, 5000)
  }, [])

  const finish = useCallback(
    async (blob: Blob) => {
      if (blob.size === 0) {
        setStage('error')
        setMessage('Grabación vacía')
        scheduleReset()
        return
      }

      setStage('sending')

      let result: CaptureResult | null = null
      try {
        result = await captureNote({
          blob,
          lat: coordsRef.current?.lat ?? null,
          lng: coordsRef.current?.lng ?? null,
        })
      } catch (error) {
        setStage('error')
        setMessage(error instanceof Error ? error.message : 'Error al guardar')
        scheduleReset()
        await refreshPending()
        return
      }

      if (result) {
        setStage('done')
        setMessage(result.customer_name || 'Nota guardada')
      } else {
        // Saved locally: it will go out when there is coverage again.
        setStage('queued')
        setMessage('Sin cobertura · se enviará sola')
      }

      await refreshPending()
      scheduleReset()
    },
    [refreshPending, scheduleReset]
  )

  const start = useCallback(async () => {
    setMessage('')

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStage('error')
      setMessage('Sin micrófono')
      scheduleReset()
      return
    }

    // Ask for the position in parallel; we never wait for it.
    void getQuickPosition().then(coords => {
      coordsRef.current = coords
    })

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        stopTimer()
        releaseStream()
        void finish(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }))
      }

      recorder.start()
      setSeconds(0)
      setStage('recording')
      timerRef.current = window.setInterval(() => setSeconds(value => value + 1), 1000)
    } catch (error) {
      releaseStream()
      setStage('error')
      const denied = error instanceof DOMException && error.name === 'NotAllowedError'
      setMessage(denied ? 'Permiso de micrófono denegado' : 'No se pudo grabar')
      scheduleReset()
    }
  }, [finish, releaseStream, scheduleReset, stopTimer])

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }, [])

  const handleTap = useCallback(() => {
    if (stage === 'recording') stop()
    else if (stage === 'idle' || stage === 'done' || stage === 'queued' || stage === 'error') {
      void start()
    }
  }, [stage, start, stop])

  const recording = stage === 'recording'
  const busy = stage === 'sending'

  const label = recording
    ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : ''

  return createPortal(
    <div
      className="fixed right-4 z-[1120] flex flex-col items-end gap-2 md:hidden"
      style={{ bottom: 'calc(max(0.5rem, env(safe-area-inset-bottom)) + 76px)' }}
    >
      {(message || pendingCount > 0) && (
        <div className="flex max-w-[70vw] items-center gap-1.5 rounded-full border border-gray-200 bg-white/95 px-3 py-1.5 text-xs font-medium text-gray-700 shadow-lg backdrop-blur">
          {stage === 'done' && <Check className="h-3.5 w-3.5 flex-shrink-0 text-green-600" />}
          {stage === 'queued' && <CloudOff className="h-3.5 w-3.5 flex-shrink-0 text-amber-600" />}
          {stage === 'error' && <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-red-600" />}
          <span className="truncate">
            {message || `${pendingCount} sin enviar`}
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={handleTap}
        disabled={busy}
        aria-label={recording ? 'Detener y guardar la nota' : 'Grabar nota rápida de visita'}
        className={`flex h-16 w-16 items-center justify-center rounded-full shadow-2xl transition active:scale-95 ${
          recording
            ? 'bg-rose-600 text-white'
            : busy
              ? 'bg-gray-400 text-white'
              : 'bg-emerald-600 text-white'
        }`}
      >
        {recording && <span className="absolute h-16 w-16 animate-ping rounded-full bg-rose-400 opacity-40" />}
        {busy ? (
          <Loader2 className="h-7 w-7 animate-spin" />
        ) : recording ? (
          <span className="relative flex flex-col items-center">
            <Square className="h-5 w-5 fill-current" />
            <span className="mt-0.5 text-[10px] font-semibold tabular-nums">{label}</span>
          </span>
        ) : (
          <Mic className="h-7 w-7" />
        )}
      </button>
    </div>,
    document.body
  )
}
