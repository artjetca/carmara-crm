import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Check, Loader2, Mic, Pause, Play, RotateCcw, Square, X } from 'lucide-react'
import {
  EMPTY_STRUCTURED_NOTE,
  canStartRecording,
  createRequestId,
  formatDuration,
  formatProductsInput,
  hasUnsavedWork,
  isBusyStage,
  normalizePriority,
  parseProductsInput,
  saveVisitNote,
  structureTranscript,
  todayIso,
  transcribeAudio,
  type FollowUpPriority,
  type StructuredVisitNote,
  type VisitNoteRecord,
  type VisitNoteStage,
} from '../../services/visitNotesClient'

interface VoiceVisitNoteModalProps {
  customerId: string | null
  customerName: string
  onClose: () => void
  onSaved?: (note: VisitNoteRecord) => void
}

const STAGE_LABEL: Record<VisitNoteStage, string> = {
  idle: 'Listo para grabar',
  recording: 'Grabando…',
  paused: 'En pausa',
  uploading: 'Subiendo audio…',
  transcribing: 'Transcribiendo…',
  structuring: 'Organizando la nota…',
  review: 'Revisa y confirma',
  saving: 'Guardando…',
  saved: 'Nota guardada',
  error: 'Se ha producido un error',
}

const PRIORITY_LABEL: Record<FollowUpPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
}

export default function VoiceVisitNoteModal({
  customerId,
  customerName,
  onClose,
  onSaved,
}: VoiceVisitNoteModalProps) {
  const [stage, setStage] = useState<VisitNoteStage>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [fields, setFields] = useState<StructuredVisitNote>({ ...EMPTY_STRUCTURED_NOTE })
  const [productsInput, setProductsInput] = useState('')
  const [structuringStatus, setStructuringStatus] = useState<'ok' | 'manual'>('ok')
  const [visitDate] = useState(() => todayIso())

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  // Same id for every retry of one note, so a repeated save cannot duplicate.
  const requestIdRef = useRef<string>(createRequestId())
  const savingRef = useRef(false)

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

  useEffect(() => {
    return () => {
      stopTimer()
      releaseStream()
    }
  }, [releaseStream, stopTimer])

  // Warn before a browser reload/close would discard an unsaved note.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedWork(stage)) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [stage])

  const runPipeline = useCallback(
    async (audio: Blob) => {
      if (audio.size === 0) {
        setStage('error')
        setErrorMessage('La grabación está vacía. Inténtalo de nuevo.')
        return
      }

      try {
        setStage('uploading')
        setStage('transcribing')
        const text = await transcribeAudio(audio)
        setTranscript(text)

        setStage('structuring')
        try {
          const result = await structureTranscript({
            transcript: text,
            customerName,
            visitDate,
          })
          setFields(result.structured)
          setProductsInput(formatProductsInput(result.structured.interested_products))
          setStructuringStatus(result.structuring_status)
        } catch {
          // Structuring failed but the transcript is safe: let the user fill
          // in the fields by hand instead of losing the recording.
          setFields({ ...EMPTY_STRUCTURED_NOTE })
          setProductsInput('')
          setStructuringStatus('manual')
        }
        setStage('review')
      } catch (error) {
        setStage('error')
        setErrorMessage(error instanceof Error ? error.message : 'Error desconocido.')
      }
    },
    [customerName, visitDate]
  )

  const startRecording = useCallback(async () => {
    setErrorMessage('')

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStage('error')
      setErrorMessage('Este dispositivo no permite grabar audio.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = event => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        stopTimer()
        releaseStream()
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        void runPipeline(blob)
      }

      recorder.start()
      setSeconds(0)
      setStage('recording')
      timerRef.current = window.setInterval(() => setSeconds(value => value + 1), 1000)
    } catch (error) {
      releaseStream()
      setStage('error')
      const denied = error instanceof DOMException && error.name === 'NotAllowedError'
      setErrorMessage(
        denied
          ? 'Permiso de micrófono denegado. Actívalo en los ajustes del teléfono.'
          : 'No se ha podido acceder al micrófono.'
      )
    }
  }, [releaseStream, runPipeline, stopTimer])

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state !== 'recording') return
    mediaRecorderRef.current.pause()
    stopTimer()
    setStage('paused')
  }, [stopTimer])

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state !== 'paused') return
    mediaRecorderRef.current.resume()
    timerRef.current = window.setInterval(() => setSeconds(value => value + 1), 1000)
    setStage('recording')
  }, [])

  const stopRecording = useCallback(() => {
    if (!mediaRecorderRef.current) return
    if (mediaRecorderRef.current.state === 'inactive') return
    mediaRecorderRef.current.stop()
  }, [])

  const restructure = useCallback(async () => {
    if (!transcript) return
    setStage('structuring')
    try {
      const result = await structureTranscript({ transcript, customerName, visitDate })
      setFields(result.structured)
      setProductsInput(formatProductsInput(result.structured.interested_products))
      setStructuringStatus(result.structuring_status)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo reorganizar la nota.')
      setStructuringStatus('manual')
    }
    setStage('review')
  }, [customerName, transcript, visitDate])

  const handleSave = useCallback(async () => {
    if (savingRef.current) return
    savingRef.current = true
    setStage('saving')
    setErrorMessage('')

    try {
      const saved = await saveVisitNote({
        ...fields,
        interested_products: parseProductsInput(productsInput),
        customer_id: customerId,
        customer_name: customerName,
        visit_date: visitDate,
        raw_transcript: transcript,
        structuring_status: structuringStatus,
        client_request_id: requestIdRef.current,
      })
      setStage('saved')
      onSaved?.(saved)
    } catch (error) {
      setStage('review')
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo guardar la nota.')
    } finally {
      savingRef.current = false
    }
  }, [customerId, customerName, fields, onSaved, productsInput, structuringStatus, transcript, visitDate])

  const requestClose = useCallback(() => {
    if (hasUnsavedWork(stage)) {
      const confirmed = window.confirm('Se perderá la nota sin guardar. ¿Quieres salir?')
      if (!confirmed) return
    }
    if (mediaRecorderRef.current?.state && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    stopTimer()
    releaseStream()
    onClose()
  }, [onClose, releaseStream, stage, stopTimer])

  const busy = isBusyStage(stage)
  const showRecorder = stage !== 'review' && stage !== 'saving' && stage !== 'saved'

  const statusTone = useMemo(() => {
    if (stage === 'error') return 'text-red-600'
    if (stage === 'saved') return 'text-green-700'
    if (stage === 'recording') return 'text-rose-600'
    return 'text-gray-600'
  }, [stage])

  const updateField = <K extends keyof StructuredVisitNote>(key: K, value: StructuredVisitNote[K]) => {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  return createPortal(
    <div className="fixed inset-0 z-[1400] flex items-end justify-center bg-black/50 sm:items-center">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-gray-900">Nota de visita por voz</h3>
            <p className="truncate text-xs text-gray-500">{customerName}</p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-gray-500 active:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <p className={`mb-4 flex items-center gap-2 text-sm font-medium ${statusTone}`}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {stage === 'error' && <AlertCircle className="h-4 w-4" />}
            {stage === 'saved' && <Check className="h-4 w-4" />}
            {STAGE_LABEL[stage]}
          </p>

          {errorMessage && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          {showRecorder && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="text-3xl font-semibold tabular-nums text-gray-900">
                {formatDuration(seconds)}
              </div>

              {canStartRecording(stage) ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition active:scale-95"
                  aria-label="Empezar a grabar"
                >
                  <Mic className="h-10 w-10" />
                </button>
              ) : (
                <div className="flex items-center gap-4">
                  {stage === 'recording' && (
                    <button
                      type="button"
                      onClick={pauseRecording}
                      className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-300 text-gray-700 active:scale-95"
                      aria-label="Pausar"
                    >
                      <Pause className="h-6 w-6" />
                    </button>
                  )}
                  {stage === 'paused' && (
                    <button
                      type="button"
                      onClick={resumeRecording}
                      className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-300 text-gray-700 active:scale-95"
                      aria-label="Continuar"
                    >
                      <Play className="h-6 w-6" />
                    </button>
                  )}
                  {(stage === 'recording' || stage === 'paused') && (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg active:scale-95"
                      aria-label="Detener y procesar"
                    >
                      <Square className="h-8 w-8 fill-current" />
                    </button>
                  )}
                </div>
              )}

              <p className="max-w-xs text-center text-xs text-gray-500">
                Habla con normalidad en español o chino. Al detener, la nota se transcribe y se
                organiza automáticamente.
              </p>
            </div>
          )}

          {(stage === 'review' || stage === 'saving' || stage === 'saved') && (
            <div className="space-y-4">
              {structuringStatus === 'manual' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  No se ha podido organizar la nota automáticamente. La transcripción está guardada;
                  completa los campos a mano.
                </div>
              )}

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Transcripción original</span>
                <textarea
                  value={transcript}
                  onChange={event => setTranscript(event.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Resumen de la visita</span>
                <textarea
                  value={fields.visit_summary}
                  onChange={event => updateField('visit_summary', event.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  Productos de interés <span className="text-gray-400">(separa con comas)</span>
                </span>
                <input
                  value={productsInput}
                  onChange={event => setProductsInput(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Comentarios del cliente</span>
                <textarea
                  value={fields.customer_feedback}
                  onChange={event => updateField('customer_feedback', event.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Problemas o quejas</span>
                <textarea
                  value={fields.customer_issues}
                  onChange={event => updateField('customer_issues', event.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Próxima acción</span>
                <textarea
                  value={fields.next_action}
                  onChange={event => updateField('next_action', event.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Fecha de seguimiento</span>
                  <input
                    type="date"
                    value={fields.follow_up_date || ''}
                    onChange={event => updateField('follow_up_date', event.target.value || null)}
                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Prioridad</span>
                  <select
                    value={fields.follow_up_priority}
                    onChange={event => updateField('follow_up_priority', normalizePriority(event.target.value))}
                    className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {(Object.keys(PRIORITY_LABEL) as FollowUpPriority[]).map(priority => (
                      <option key={priority} value={priority}>
                        {PRIORITY_LABEL[priority]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {fields.missing_information.length > 0 && (
                <p className="text-xs text-amber-700">
                  Datos no detectados: {fields.missing_information.join(', ')}
                </p>
              )}

              {fields.follow_up_date && (
                <p className="text-xs text-blue-700">
                  Se creará un recordatorio interno el {fields.follow_up_date} a las 09:00.
                </p>
              )}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap gap-2 border-t border-gray-200 px-4 py-3">
          {stage === 'review' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setTranscript('')
                  setFields({ ...EMPTY_STRUCTURED_NOTE })
                  setProductsInput('')
                  setSeconds(0)
                  setStage('idle')
                }}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700"
              >
                <Mic className="h-4 w-4" /> Regrabar
              </button>
              <button
                type="button"
                onClick={restructure}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700"
              >
                <RotateCcw className="h-4 w-4" /> Reorganizar
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="min-h-11 w-full rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white active:bg-blue-700"
              >
                Guardar nota
              </button>
            </>
          )}

          {stage === 'saved' && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 w-full rounded-lg bg-green-600 px-3 text-sm font-semibold text-white"
            >
              Hecho
            </button>
          )}

          {stage !== 'review' && stage !== 'saved' && (
            <button
              type="button"
              onClick={requestClose}
              className="min-h-11 w-full rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700"
            >
              Cancelar
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body
  )
}
