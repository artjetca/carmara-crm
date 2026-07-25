import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'

export type VoiceSearchStatus = 'idle' | 'listening' | 'success' | 'unsupported' | 'permission-denied' | 'error'

type VoiceSearchButtonProps = {
  onTranscript: (transcript: string) => void
  onStatusChange?: (status: VoiceSearchStatus) => void
  className?: string
}

const statusMessage: Record<Exclude<VoiceSearchStatus, 'idle'>, string> = {
  listening: 'Habla ahora',
  success: 'Búsqueda por voz completada',
  unsupported: 'El navegador no admite la búsqueda por voz.',
  'permission-denied': 'Permite el acceso al micrófono para usar esta función.',
  error: 'No se ha podido reconocer la voz. Inténtalo de nuevo.',
}

export function VoiceSearchButton({ onTranscript, onStatusChange, className = '' }: VoiceSearchButtonProps) {
  const [isSupported, setIsSupported] = useState<boolean | null>(null)
  const [status, setStatus] = useState<VoiceSearchStatus>('idle')
  const recognitionRef = useRef<any>(null)
  const resetTimerRef = useRef<number | null>(null)

  const updateStatus = (nextStatus: VoiceSearchStatus) => {
    setStatus(nextStatus)
    onStatusChange?.(nextStatus)
  }

  useEffect(() => {
    setIsSupported('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
    return () => {
      recognitionRef.current?.abort?.()
      if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
    }
  }, [])

  const resetLater = () => {
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current)
    resetTimerRef.current = window.setTimeout(() => updateStatus('idle'), 2600)
  }

  const toggleRecognition = () => {
    if (!isSupported) {
      updateStatus('unsupported')
      resetLater()
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
    recognition.lang = 'es-ES'
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
