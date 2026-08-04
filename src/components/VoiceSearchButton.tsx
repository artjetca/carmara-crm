import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { SpeechRecognition } from '@capgo/capacitor-speech-recognition'
import type { PluginListenerHandle } from '@capacitor/core'

export type VoiceSearchStatus = 'idle' | 'listening' | 'success' | 'unsupported' | 'permission-denied' | 'error'

type VoiceSearchButtonProps = {
  onTranscript: (transcript: string) => void
  onStatusChange?: (status: VoiceSearchStatus) => void
  className?: string
}

const statusMessage: Record<Exclude<VoiceSearchStatus, 'idle'>, string> = {
  listening: 'Habla ahora',
  success: 'Búsqueda por voz completada',
  unsupported: 'La búsqueda por voz no está disponible en este dispositivo.',
  'permission-denied': 'Permite el acceso al micrófono para usar esta función.',
  error: 'No se ha podido reconocer la voz. Inténtalo de nuevo.',
}

const RECOGNITION_LANGUAGE = 'es-ES'

// Inside the iOS/Android app the browser SpeechRecognition API is missing
// (WKWebView never implemented it and Android WebView needs Chrome), so we
// use the native recogniser through Capacitor and keep the web API for
// desktop browsers.
const isNativeApp = Capacitor.isNativePlatform()

export function VoiceSearchButton({ onTranscript, onStatusChange, className = '' }: VoiceSearchButtonProps) {
  const [isSupported, setIsSupported] = useState<boolean | null>(null)
  const [status, setStatus] = useState<VoiceSearchStatus>('idle')
  const recognitionRef = useRef<any>(null)
  const resetTimerRef = useRef<number | null>(null)
  const partialListenerRef = useRef<PluginListenerHandle | null>(null)
  const stateListenerRef = useRef<PluginListenerHandle | null>(null)
  const lastPartialRef = useRef('')
  const statusRef = useRef<VoiceSearchStatus>('idle')

  const updateStatus = useCallback((nextStatus: VoiceSearchStatus) => {
    statusRef.current = nextStatus
    setStatus(nextStatus)
    onStatusChange?.(nextStatus)
  }, [onStatusChange])

  useEffect(() => {
    let cancelled = false

    if (isNativeApp) {
      SpeechRecognition.available()
        .then(result => {
          if (!cancelled) setIsSupported(Boolean(result?.available))
        })
        .catch(() => {
          if (!cancelled) setIsSupported(false)
        })
    } else {
      setIsSupported('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    }

    return () => {
      cancelled = true
      recognitionRef.current?.abort?.()
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
      partialListenerRef.current?.remove()
      stateListenerRef.current?.remove()
      if (isNativeApp) SpeechRecognition.stop().catch(() => undefined)
    }
  }, [])

  const resetLater = useCallback(() => {
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
    resetTimerRef.current = window.setTimeout(() => updateStatus('idle'), 2600)
  }, [updateStatus])

  const finishNative = useCallback((transcript: string) => {
    const cleaned = transcript.trim()
    if (cleaned) onTranscript(cleaned)
    updateStatus(cleaned ? 'success' : 'error')
    resetLater()
  }, [onTranscript, resetLater, updateStatus])

  const stopNative = useCallback(async () => {
    try {
      await SpeechRecognition.stop()
    } catch {
      // Stopping an already stopped recogniser is not an error for the user.
    }
    finishNative(lastPartialRef.current)
  }, [finishNative])

  const startNative = useCallback(async () => {
    try {
      const current = await SpeechRecognition.checkPermissions()
      let granted = current.speechRecognition === 'granted'

      if (!granted) {
        const requested = await SpeechRecognition.requestPermissions()
        granted = requested.speechRecognition === 'granted'
      }

      if (!granted) {
        updateStatus('permission-denied')
        resetLater()
        return
      }

      lastPartialRef.current = ''
      await partialListenerRef.current?.remove()
      await stateListenerRef.current?.remove()

      // Partial results let the user see progress and give us a transcript
      // even when the platform ends the session on its own.
      partialListenerRef.current = await SpeechRecognition.addListener('partialResults', data => {
        const match = String(data?.matches?.[0] || '').trim()
        if (match) lastPartialRef.current = match
      })

      stateListenerRef.current = await SpeechRecognition.addListener('listeningState', data => {
        if (data?.state === 'stopped' && statusRef.current === 'listening') {
          finishNative(lastPartialRef.current)
        }
      })

      updateStatus('listening')

      const result = await SpeechRecognition.start({
        language: RECOGNITION_LANGUAGE,
        maxResults: 1,
        partialResults: true,
        popup: false,
      })

      const direct = String(result?.matches?.[0] || '').trim()
      if (direct) {
        lastPartialRef.current = direct
        finishNative(direct)
      }
    } catch {
      updateStatus('error')
      resetLater()
    }
  }, [finishNative, resetLater, updateStatus])

  const toggleRecognition = () => {
    if (!isSupported) {
      updateStatus('unsupported')
      resetLater()
      return
    }

    if (isNativeApp) {
      if (status === 'listening') {
        stopNative().catch(() => undefined)
      } else {
        startNative().catch(() => undefined)
      }
      return
    }

    if (status === 'listening') {
      recognitionRef.current?.stop?.()
      return
    }

    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Recognition) {
      updateStatus('unsupported')
      resetLater()
      return
    }

    const recognition = new Recognition()
    let hasTerminalStatus = false
    recognitionRef.current = recognition
    recognition.lang = RECOGNITION_LANGUAGE
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => updateStatus('listening')
    recognition.onresult = (event: any) => {
      hasTerminalStatus = true
      const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim()
      if (transcript) onTranscript(transcript)
      updateStatus(transcript ? 'success' : 'error')
      resetLater()
    }
    recognition.onerror = (event: any) => {
      hasTerminalStatus = true
      updateStatus(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'permission-denied' : 'error')
      resetLater()
    }
    recognition.onend = () => {
      if (!hasTerminalStatus) updateStatus('idle')
    }
    try {
      recognition.start()
    } catch {
      updateStatus('error')
      resetLater()
    }
  }

  const isListening = status === 'listening'
  const message = status === 'idle' ? '' : statusMessage[status]

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={toggleRecognition}
        title={isListening ? 'Detener búsqueda por voz' : 'Búsqueda por voz'}
        aria-label={isListening ? 'Detener escucha' : 'Búsqueda por voz'}
        aria-pressed={isListening}
        className={`relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border transition ${isListening ? 'border-rose-200 bg-rose-500 text-white shadow-lg shadow-rose-500/30' : 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm active:bg-emerald-100'} ${className}`}
      >
        {isListening && <span className="absolute inset-0 rounded-full bg-rose-400 animate-ping opacity-40" />}
        {isListening ? <Square className="relative h-4 w-4 fill-current" /> : <Mic className="relative h-5 w-5" />}
      </button>
      <span className="sr-only" aria-live="polite">{message}</span>
    </div>
  )
}
