import { useEffect, useState } from 'react'
import { Mic } from 'lucide-react'

type VoiceSearchButtonProps = {
  onTranscript: (transcript: string) => void
  className?: string
}

export function VoiceSearchButton({ onTranscript, className = '' }: VoiceSearchButtonProps) {
  const [isSupported, setIsSupported] = useState(false)
  const [isListening, setIsListening] = useState(false)

  useEffect(() => {
    setIsSupported('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  }, [])

  if (!isSupported) return null

  const startRecognition = () => {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Recognition || isListening) return

    const recognition = new Recognition()
    recognition.lang = 'es-ES'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => setIsListening(true)
    recognition.onresult = (event: any) => onTranscript(event.results[0][0].transcript)
    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)
    recognition.start()
  }

  return (
    <button
      type="button"
      onClick={startRecognition}
      title="Búsqueda por voz"
      aria-label="Búsqueda por voz"
      aria-pressed={isListening}
      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-500 active:bg-gray-100 ${className}`}
    >
      <Mic className={`h-4 w-4 ${isListening ? 'animate-pulse text-blue-600' : ''}`} />
    </button>
  )
}
