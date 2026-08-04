import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Check, Loader2, Mic, Pause, Play, RotateCcw, Square, X } from 'lucide-react'
import {
  canStartRecording,
  countSelectedDrafts,
  createRequestId,
  findUncoveredStops,
  formatDuration,
  formatProductsInput,
  hasUnsavedWork,
  isBusyStage,
  normalizePriority,
  parseProductsInput,
  saveRouteVisitNotes,
  structureRouteTranscript,
  todayIso,
  toRouteStops,
  transcribeAudio,
  type FollowUpPriority,
  type RouteVisitDraft,
  type VisitNoteStage,
} from '../../services/visitNotesClient'

interface RouteVoiceNotesModalProps {
  routeName: string
  routeCustomers: Array<{ id?: string; name?: string; city?: string }>
  onClose: () => void
  onSaved?: (savedCount: number) => void
}

const STAGE_LABEL: Record<VisitNoteStage, string> = {
  idle: 'Listo para dictar la jornada',
  recording: 'Grabando…',
  paused: 'En pausa',
  uploading: 'Subiendo audio…',
  transcribing: 'Transcribiendo…',
  structuring: 'Repartiendo por cliente…',
  review: 'Revisa las notas',
  saving: 'Guardando…',
  saved: 'Notas guardadas',
  error: 'Se ha producido un error',
}

const PRIORITY_LABEL: Record<FollowUpPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
}

export default function RouteVoiceNotesModal({
  routeName,
  routeCustomers,
  onClose,
  onSaved,
}: RouteVoiceNotesModalProps) {
  const [stage, setStage] = useState<VisitNoteStage>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [drafts, setDrafts] = useState<RouteVisitDraft[]>([])
  const [productInputs, setProductInputs] = useState<Record<string, string>>({})
  const [unmatched, setUnmatched] = useState<string[]>([])
  const [structuringStatus, setStructuringStatus] = useState<'ok' | 'manual'>('ok')
  const [savedCount, setSavedCount] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [visitDate] = useState(() => todayIso())

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  // One id for the whole batch: retrying cannot duplicate any stop.
  const batchIdRef = useRef<string>(createRequestId())
  const savingRef = useRef(false)

  const stops = useMemo(() => toRouteStops(routeCustomers), [routeCustomers])
  const uncovered = useMemo(() => findUncoveredStops(stops, drafts), [stops, drafts])
  const selectedCount = countSelectedDrafts(drafts)

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

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedWork(stage)) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [stage])

  const applyDrafts = useCallback((nextDrafts: RouteVisitDraft[]) => {
    setDrafts(nextDrafts)
    setProductInputs(
      Object.fromEntries(
        nextDrafts.map(draft => [draft.customer_id, formatProductsInput(draft.interested_products)])
      )
    )
  }, [])

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
          const result = await structureRouteTranscript({
            transcript: text,
            routeCustomers: stops,
            visitDate,
          })
          applyDrafts(result.drafts)
          setUnmatched(result.unmatched)
          setStructuringStatus(result.structuring_status)
        } catch {
          // The transcript is safe even when the split fails.
          applyDrafts([])
          setUnmatched([])
          setStructuringStatus('manual')
        }
        setStage('review')
      } catch (error) {
        setStage('error')
        setErrorMessage(error instanceof Error ? error.message : 'Error desconocido.')
      }
    },
    [applyDrafts, stops, visitDate]
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
      const result = await structureRouteTranscript({
        transcript,
        routeCustomers: stops,
        visitDate,
      })
      applyDrafts(result.drafts)
      setUnmatched(result.unmatched)
      setStructuringStatus(result.structuring_status)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo reorganizar la jornada.')
      setStructuringStatus('manual')
    }
    setStage('review')
  }, [applyDrafts, stops, transcript, visitDate])

  const handleSave = useCallback(async () => {
    if (savingRef.current || selectedCount === 0) return
    savingRef.current = true
    setStage('saving')
    setErrorMessage('')

    try {
      const withProducts = drafts.map(draft => ({
        ...draft,
        interested_products: parseProductsInput(productInputs[draft.customer_id] ?? ''),
      }))

      const outcome = await saveRouteVisitNotes({
        drafts: withProducts,
        transcript,
        visitDate,
        structuringStatus,
        batchRequestId: batchIdRef.current,
      })

      setSavedCount(outcome.saved.length)

      if (outcome.failed.length > 0) {
        setStage('review')
        setErrorMessage(
          `Guardadas ${outcome.saved.length}. No se pudieron guardar: ${outcome.failed
            .map(item => item.customerName)
            .join(', ')}`
        )
      } else {
        setStage('saved')
        onSaved?.(outcome.saved.length)
      }
    } catch (error) {
      setStage('review')
      setErrorMessage(error instanceof Error ? error.message : 'No se pudieron guardar las notas.')
    } finally {
      savingRef.current = false
    }
  }, [drafts, onSaved, productInputs, selectedCount, structuringStatus, transcript, visitDate])

  const requestClose = useCallback(() => {
    if (hasUnsavedWork(stage)) {
      const confirmed = window.confirm('Se perderán las notas sin guardar. ¿Quieres salir?')
      if (!confirmed) return
    }
    if (mediaRecorderRef.current?.state && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    stopTimer()
    releaseStream()
    onClose()
  }, [onClose, releaseStream, stage, stopTimer])

  const updateDraft = (customerId: string, patch: Partial<RouteVisitDraft>) => {
    setDrafts(prev =>
      prev.map(draft => (draft.customer_id === customerId ? { ...draft, ...patch } : draft))
    )
  }

  const busy = isBusyStage(stage)
  const showRecorder = stage !== 'review' && stage !== 'saving' && stage !== 'saved'

  const statusTone =
    stage === 'error'
      ? 'text-red-600'
      : stage === 'saved'
        ? 'text-green-700'
        : stage === 'recording'
          ? 'text-rose-600'
          : 'text-gray-600'

  return createPortal(
    <div className="fixed inset-0 z-[1400] flex items-end justify-center bg-black/50 sm:items-center">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-gray-900">Resumen de la jornada</h3>
            <p className="truncate text-xs text-gray-500">
              {routeName ? `${routeName} · ` : ''}
              {stops.length} paradas
            </p>
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
                  aria-label="Empezar a dictar la jornada"
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
                      aria-label="Detener y repartir"
                    >
                      <Square className="h-8 w-8 fill-current" />
                    </button>
                  )}
                </div>
              )}

              <p className="max-w-xs text-center text-xs text-gray-500">
                Cuenta toda la jornada seguida, cliente por cliente. Se creará una nota para cada
                parada que menciones.
              </p>
            </div>
          )}

          {(stage === 'review' || stage === 'saving' || stage === 'saved') && (
            <div className="space-y-4">
              {structuringStatus === 'manual' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  No se ha podido repartir la jornada automáticamente. La transcripción está
                  guardada abajo; puedes volver a intentarlo con «Reorganizar».
                </div>
              )}

              {drafts.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    {selectedCount} de {drafts.length} notas se guardarán
                  </p>

                  {drafts.map(draft => {
                    const open = expandedId === draft.customer_id
                    return (
                      <div
                        key={draft.customer_id}
                        className="overflow-hidden rounded-lg border border-gray-200"
                      >
                        <div className="flex items-start gap-2 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={draft.selected}
                            onChange={event =>
                              updateDraft(draft.customer_id, { selected: event.target.checked })
                            }
                            aria-label={`Guardar la nota de ${draft.customer_name}`}
                            className="mt-1 h-5 w-5 flex-shrink-0"
                          />
                          <button
                            type="button"
                            onClick={() => setExpandedId(open ? null : draft.customer_id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="block truncate text-sm font-medium text-gray-900">
                              {draft.customer_name}
                            </span>
                            <span className="block truncate text-xs text-gray-500">
                              {draft.visit_summary || 'Sin resumen'}
                            </span>
                            {draft.follow_up_date && (
                              <span className="mt-0.5 block text-xs text-blue-700">
                                Seguimiento: {draft.follow_up_date}
                              </span>
                            )}
                          </button>
                        </div>

                        {open && (
                          <div className="space-y-3 border-t border-gray-100 bg-gray-50 px-3 py-3">
                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-gray-700">Resumen</span>
                              <textarea
                                value={draft.visit_summary}
                                onChange={event =>
                                  updateDraft(draft.customer_id, { visit_summary: event.target.value })
                                }
                                rows={2}
                                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                              />
                            </label>

                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-gray-700">
                                Productos de interés
                              </span>
                              <input
                                value={productInputs[draft.customer_id] ?? ''}
                                onChange={event =>
                                  setProductInputs(prev => ({
                                    ...prev,
                                    [draft.customer_id]: event.target.value,
                                  }))
                                }
                                className="min-h-10 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                              />
                            </label>

                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-gray-700">
                                Comentarios del cliente
                              </span>
                              <textarea
                                value={draft.customer_feedback}
                                onChange={event =>
                                  updateDraft(draft.customer_id, {
                                    customer_feedback: event.target.value,
                                  })
                                }
                                rows={2}
                                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                              />
                            </label>

                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-gray-700">
                                Problemas o quejas
                              </span>
                              <textarea
                                value={draft.customer_issues}
                                onChange={event =>
                                  updateDraft(draft.customer_id, {
                                    customer_issues: event.target.value,
                                  })
                                }
                                rows={2}
                                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                              />
                            </label>

                            <label className="block">
                              <span className="mb-1 block text-xs font-medium text-gray-700">
                                Próxima acción
                              </span>
                              <textarea
                                value={draft.next_action}
                                onChange={event =>
                                  updateDraft(draft.customer_id, { next_action: event.target.value })
                                }
                                rows={2}
                                className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                              />
                            </label>

                            <div className="grid grid-cols-2 gap-2">
                              <label className="block">
                                <span className="mb-1 block text-xs font-medium text-gray-700">
                                  Seguimiento
                                </span>
                                <input
                                  type="date"
                                  value={draft.follow_up_date || ''}
                                  onChange={event =>
                                    updateDraft(draft.customer_id, {
                                      follow_up_date: event.target.value || null,
                                    })
                                  }
                                  className="min-h-10 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                                />
                              </label>
                              <label className="block">
                                <span className="mb-1 block text-xs font-medium text-gray-700">
                                  Prioridad
                                </span>
                                <select
                                  value={draft.follow_up_priority}
                                  onChange={event =>
                                    updateDraft(draft.customer_id, {
                                      follow_up_priority: normalizePriority(event.target.value),
                                    })
                                  }
                                  className="min-h-10 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                                >
                                  {(Object.keys(PRIORITY_LABEL) as FollowUpPriority[]).map(priority => (
                                    <option key={priority} value={priority}>
                                      {PRIORITY_LABEL[priority]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {uncovered.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Paradas sin nota: {uncovered.map(stop => stop.name).join(', ')}
                </div>
              )}

              {unmatched.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p className="mb-1 font-medium">Comentarios sin cliente asignado:</p>
                  <ul className="list-disc pl-4">
                    {unmatched.map((note, index) => (
                      <li key={index}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">
                  Transcripción original
                </span>
                <textarea
                  value={transcript}
                  onChange={event => setTranscript(event.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              {stage === 'saved' && (
                <p className="text-sm font-medium text-green-700">
                  Se han guardado {savedCount} notas de visita.
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
                  applyDrafts([])
                  setUnmatched([])
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
                disabled={selectedCount === 0}
                className="min-h-11 w-full rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white active:bg-blue-700 disabled:bg-gray-300"
              >
                {selectedCount === 0 ? 'Nada seleccionado' : `Guardar ${selectedCount} notas`}
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
