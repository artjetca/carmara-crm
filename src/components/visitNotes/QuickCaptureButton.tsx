import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Check, CloudOff, Loader2, Mic, Square } from 'lucide-react'
import { useStore } from '../../store/useStore'
import {
  captureNote,
  flushCaptureQueue,
  getQuickPosition,
  type CaptureOutcome,
} from '../../services/quickCaptureClient'
import { countPendingCaptures } from '../../services/quickCaptureQueue'
import { openNavigation, speak } from '../../services/voiceAssistClient'

type CaptureStage = 'idle' | 'recording' | 'sending' | 'done' | 'queued' | 'error'

// Pages where the button would only get in the way: the review screen is used
// parked, with both hands, and its Confirmar button sits exactly here.
const HIDDEN_ON_PAGES = ['pendingNotes']

/**
 * Always-available record button for a salesperson who is driving.
 *
 * One tap starts, one tap stops. Nothing else is required: the note is
 * transcribed, matched to a customer and stored as a draft server side, and
 * reviewed later when the car is parked.
 *
 * It shrinks to a translucent dot while the page is being scrolled so it never
 * covers the field or button underneath, and comes back as soon as scrolling
 * stops. Driving still needs a single deliberate tap.
 */
export default function QuickCaptureButton() {
  const { currentPage, sidebarOpen } = useStore()
  const [stage, setStage] = useState<CaptureStage>('idle')
  const [seconds, setSeconds] = useState(0)
  const [message, setMessage] = useState('')
  const [pendingCount, setPendingCount] = useState(0)
  const [dimmed, setDimmed] = useState(false)

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

  // Fade to a small dot while the page moves, so the button never sits on top
  // of the field or button the salesperson is scrolling towards.
  useEffect(() => {
    let restore: number | null = null

    const onScroll = () => {
      setDimmed(true)
      if (restore !== null) window.clearTimeout(restore)
      restore = window.setTimeout(() => setDimmed(false), 1200)
    }

    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions)
      if (restore !== null) window.clearTimeout(restore)
    }
  }, [])

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

      let result: CaptureOutcome | null = null
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

      if (!result) {
        // Saved locally: it will go out when there is coverage again.
        setStage('queued')
        setMessage('Sin cobertura · se enviará sola')
      } else if (result.kind === 'question') {
        // The recording was a question, not a note: say the answer out loud so
        // the salesperson never looks at the phone, and open the map when they
        // asked to be taken somewhere.
        setStage('done')
        setMessage(result.speech)
        speak(result.speech)

        if (result.intent === 'navigate_next' && result.navigation) {
          openNavigation(result.navigation)
        }
      } else {
        setStage('done')
        setMessage(result.customer_name || 'Nota guardada')
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

  // Never cover the review screen (its Confirmar button sits right here) and
  // step aside while the drawer is open.
  const hiddenHere = HIDDEN_ON_PAGES.includes(currentPage) || sidebarOpen
  if (hiddenHere && !recording && !busy) return null

  // While scrolling we shrink to a dot; recording always stays full size so
  // stopping is never a small target.
  const shrunk = dimmed && !recording && !busy

  const label = recording
    ? `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : ''

  return createPortal(
    <div
      className="fixed right-3 z-[1120] flex flex-col items-end gap-2 md:hidden"
      // Sits at the foot of the map's floating button column (right-3, 48 px,
      // 12 px gaps) so it reads as one aligned stack instead of an odd extra
      // circle, and stays clear of the tab bar.
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 110px)' }}
    >
      {(message || pendingCount > 0) && !shrunk && (
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
        className={`relative flex items-center justify-center rounded-full shadow-2xl transition-all duration-300 active:scale-95 ${
          shrunk ? 'h-9 w-9 opacity-40' : 'h-12 w-12 opacity-100'
        } ${
          recording
            ? 'bg-rose-600 text-white'
            : busy
              ? 'bg-gray-400 text-white'
              : 'bg-emerald-600 text-white'
        }`}
      >
        {recording && <span className="absolute h-12 w-12 animate-ping rounded-full bg-rose-400 opacity-40" />}
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : recording ? (
          <span className="relative flex flex-col items-center">
            <Square className="h-4 w-4 fill-current" />
            <span className="text-[9px] font-semibold leading-tight tabular-nums">{label}</span>
          </span>
        ) : (
          <Mic className={shrunk ? 'h-4 w-4' : 'h-5 w-5'} />
        )}
      </button>
    </div>,
    document.body
  )
}
