import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  MapPin,
  Mic,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { supabase, type Customer } from '../lib/supabase'
import {
  formatProductsInput,
  normalizePriority,
  parseProductsInput,
  type FollowUpPriority,
  type VisitNoteRecord,
} from '../services/visitNotesClient'
import {
  buildReviewSummary,
  formatMeters,
  isReadyToConfirm,
  nearbySuggestions,
  normalizeConfidence,
  previewText,
  sortForReview,
} from '../services/pendingNotesUtils'

/**
 * Review screen for notes dictated while driving.
 *
 * Cards start collapsed: at a glance the salesperson sees who the note is for
 * and how sure we are. Only what needs a decision is opened. Notes that were
 * matched confidently can be confirmed in one go.
 */

interface PendingNote extends VisitNoteRecord {
  match_method?: string | null
  match_confidence?: string | null
  captured_lat?: number | null
  captured_lng?: number | null
}

const CONFIDENCE_BADGE: Record<string, { text: string; className: string }> = {
  high: { text: 'Cliente seguro', className: 'bg-green-100 text-green-800' },
  medium: { text: 'Cliente probable', className: 'bg-amber-100 text-amber-800' },
  low: { text: 'Revisa el cliente', className: 'bg-orange-100 text-orange-800' },
  none: { text: 'Sin identificar', className: 'bg-red-100 text-red-800' },
}

const PRIORITY_LABEL: Record<FollowUpPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
}

type NoteEdits = Partial<PendingNote> & { productsInput?: string }

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sesión caducada. Vuelve a iniciar sesión.')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

export default function PendingNotes() {
  const [notes, setNotes] = useState<PendingNote[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const [showOptional, setShowOptional] = useState<Record<string, boolean>>({})
  const [edits, setEdits] = useState<Record<string, NoteEdits>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const headers = await authHeaders()
      const response = await fetch('/api/visit-notes?review_status=pending_review', { headers })
      const payload = await response.json()

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'No se pudieron cargar las notas.')
      }

      setNotes(sortForReview(payload.data || []) as PendingNote[])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    fetch('/api/customers')
      .then(response => response.json())
      .then(payload => {
        if (!cancelled && payload?.success) setCustomers(payload.data || [])
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => a.name.localeCompare(b.name)),
    [customers]
  )

  const summary = useMemo(() => buildReviewSummary(notes), [notes])
  const readyIds = useMemo(
    () => notes.filter(note => isReadyToConfirm(note) && !edits[note.id]).map(note => note.id),
    [notes, edits]
  )

  const setValue = (id: string, patch: NoteEdits) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const buildBody = useCallback(
    (note: PendingNote) => {
      const edit = edits[note.id] || {}
      const pick = <K extends keyof PendingNote>(key: K): PendingNote[K] =>
        key in edit ? (edit[key] as PendingNote[K]) : note[key]

      return {
        customer_id: pick('customer_id'),
        customer_name: pick('customer_name'),
        visit_summary: pick('visit_summary'),
        interested_products:
          edit.productsInput !== undefined
            ? parseProductsInput(edit.productsInput)
            : note.interested_products,
        customer_feedback: pick('customer_feedback'),
        customer_issues: pick('customer_issues'),
        next_action: pick('next_action'),
        follow_up_date: pick('follow_up_date'),
        follow_up_priority: normalizePriority(pick('follow_up_priority')),
        raw_transcript: note.raw_transcript,
        visit_date: note.visit_date,
        review_status: 'reviewed',
      }
    },
    [edits]
  )

  const confirmOne = useCallback(
    async (note: PendingNote) => {
      const headers = await authHeaders()
      const response = await fetch(`/api/visit-notes?id=${encodeURIComponent(note.id)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(buildBody(note)),
      })

      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'No se pudo confirmar la nota.')
      }
    },
    [buildBody]
  )

  const handleConfirm = useCallback(
    async (note: PendingNote) => {
      setSavingId(note.id)
      setError('')

      try {
        await confirmOne(note)
        setNotes(prev => prev.filter(item => item.id !== note.id))
        setEdits(prev => {
          const next = { ...prev }
          delete next[note.id]
          return next
        })
      } catch (confirmError) {
        setError(confirmError instanceof Error ? confirmError.message : 'Error al confirmar')
      } finally {
        setSavingId(null)
      }
    },
    [confirmOne]
  )

  /** Confirm every note the system matched confidently, in one action. */
  const handleConfirmReady = useCallback(async () => {
    if (readyIds.length === 0 || bulkSaving) return

    setBulkSaving(true)
    setError('')

    const failed: string[] = []
    for (const id of readyIds) {
      const note = notes.find(item => item.id === id)
      if (!note) continue
      try {
        await confirmOne(note)
      } catch {
        // One bad row must not stop the rest of the batch.
        failed.push(note.customer_name)
      }
    }

    const confirmed = new Set(readyIds)
    setNotes(prev => prev.filter(item => !confirmed.has(item.id) || failed.includes(item.customer_name)))
    if (failed.length > 0) setError(`No se pudieron confirmar: ${failed.join(', ')}`)
    setBulkSaving(false)
  }, [bulkSaving, confirmOne, notes, readyIds])

  const handleDelete = useCallback(async (note: PendingNote) => {
    setSavingId(note.id)
    try {
      const headers = await authHeaders()
      const response = await fetch(`/api/visit-notes?id=${encodeURIComponent(note.id)}`, {
        method: 'DELETE',
        headers,
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'No se pudo descartar.')
      }
      setNotes(prev => prev.filter(item => item.id !== note.id))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Error al descartar')
    } finally {
      setSavingId(null)
      setConfirmingDelete(null)
    }
  }, [])

  const assignCustomer = (note: PendingNote, customerId: string) => {
    const picked = customers.find(item => item.id === customerId)
    setValue(note.id, {
      customer_id: customerId || null,
      customer_name: picked?.name || note.customer_name,
    })
  }

  const valueOf = <K extends keyof PendingNote>(note: PendingNote, key: K): PendingNote[K] => {
    const edit = edits[note.id]
    return edit && key in edit ? (edit[key] as PendingNote[K]) : note[key]
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3 pb-28">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Mic className="h-5 w-5 text-emerald-600" /> Notas por revisar
          </h1>
          <button
            onClick={() => void load()}
            aria-label="Actualizar"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-600 active:bg-gray-100"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {notes.length > 0 && (
          <p className="text-sm text-gray-600">{summary.text}</p>
        )}
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : notes.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-12 text-center">
          <Check className="mx-auto mb-3 h-10 w-10 text-green-500" />
          <p className="text-sm font-medium text-gray-900">No hay notas pendientes</p>
          <p className="mt-1 px-6 text-sm text-gray-500">
            Graba una nota con el botón verde después de cada visita.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map(note => {
            const open = expandedId === note.id
            const confidence = normalizeConfidence(note.match_confidence)
            const badge = CONFIDENCE_BADGE[confidence]
            const saving = savingId === note.id
            const assigned = valueOf(note, 'customer_id')
            const suggestions = nearbySuggestions(note, customers)
            const optional = showOptional[note.id]

            return (
              <div
                key={note.id}
                className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
                  assigned ? 'border-gray-200' : 'border-orange-200'
                }`}
              >
                <button
                  onClick={() => setExpandedId(open ? null : note.id)}
                  aria-expanded={open}
                  className="flex w-full items-start gap-2 px-3 py-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-gray-900">
                        {valueOf(note, 'customer_name')}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
                        {badge.text}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-xs text-gray-600">{previewText(note)}</p>
                  </div>
                  <ChevronDown
                    className={`mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${
                      open ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* One-tap assignment without opening the card: this is the
                    only thing that truly blocks the salesperson. */}
                {!assigned && !open && suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 border-t border-orange-100 bg-orange-50/60 px-3 py-2">
                    <span className="w-full text-[11px] font-medium text-orange-800">
                      ¿Era alguno de estos?
                    </span>
                    {suggestions.map(suggestion => (
                      <button
                        key={suggestion.id}
                        onClick={() => assignCustomer(note, suggestion.id)}
                        className="min-h-9 rounded-full border border-orange-200 bg-white px-3 text-xs font-medium text-gray-800 active:bg-orange-100"
                      >
                        {suggestion.name}
                        <span className="ml-1 text-gray-400">{formatMeters(suggestion.meters)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {open && (
                  <div className="space-y-3 border-t border-gray-100 bg-gray-50 px-3 py-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-gray-700">Cliente</span>
                      <select
                        value={assigned || ''}
                        onChange={event => assignCustomer(note, event.target.value)}
                        className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm"
                      >
                        <option value="">Sin asignar</option>
                        {sortedCustomers.map(customer => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-gray-700">Resumen</span>
                      <textarea
                        value={valueOf(note, 'visit_summary') || ''}
                        onChange={event => setValue(note.id, { visit_summary: event.target.value })}
                        rows={2}
                        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-700">Seguimiento</span>
                        <input
                          type="date"
                          value={valueOf(note, 'follow_up_date') || ''}
                          onChange={event =>
                            setValue(note.id, { follow_up_date: event.target.value || null })
                          }
                          className="min-h-11 w-full rounded-lg border border-gray-300 px-2 text-sm"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-gray-700">Prioridad</span>
                        <select
                          value={normalizePriority(valueOf(note, 'follow_up_priority'))}
                          onChange={event =>
                            setValue(note.id, {
                              follow_up_priority: normalizePriority(event.target.value),
                            })
                          }
                          className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm"
                        >
                          {(Object.keys(PRIORITY_LABEL) as FollowUpPriority[]).map(priority => (
                            <option key={priority} value={priority}>
                              {PRIORITY_LABEL[priority]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* Secondary fields stay out of the way until asked for:
                        most notes never fill them in. */}
                    {optional ? (
                      <div className="space-y-3">
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-gray-700">Productos</span>
                          <input
                            value={
                              edits[note.id]?.productsInput ??
                              formatProductsInput(note.interested_products)
                            }
                            onChange={event => setValue(note.id, { productsInput: event.target.value })}
                            className="min-h-11 w-full rounded-lg border border-gray-300 px-2 text-sm"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-gray-700">
                            Próxima acción
                          </span>
                          <textarea
                            value={valueOf(note, 'next_action') || ''}
                            onChange={event => setValue(note.id, { next_action: event.target.value })}
                            rows={2}
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-gray-700">
                            Comentarios
                          </span>
                          <textarea
                            value={valueOf(note, 'customer_feedback') || ''}
                            onChange={event =>
                              setValue(note.id, { customer_feedback: event.target.value })
                            }
                            rows={2}
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-medium text-gray-700">Problemas</span>
                          <textarea
                            value={valueOf(note, 'customer_issues') || ''}
                            onChange={event =>
                              setValue(note.id, { customer_issues: event.target.value })
                            }
                            rows={2}
                            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                          />
                        </label>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowOptional(prev => ({ ...prev, [note.id]: true }))}
                        className="flex min-h-9 items-center gap-1 text-xs font-medium text-blue-700"
                      >
                        <Plus className="h-3.5 w-3.5" /> Más detalles
                      </button>
                    )}

                    <details className="text-xs text-gray-600">
                      <summary className="min-h-9 cursor-pointer py-1.5 font-medium">
                        Transcripción original
                      </summary>
                      <p className="mt-1 whitespace-pre-wrap">{note.raw_transcript}</p>
                    </details>

                    {confirmingDelete === note.id ? (
                      <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                        <p className="mb-2 text-xs text-red-800">
                          ¿Seguro? La nota no se podrá recuperar.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setConfirmingDelete(null)}
                            className="min-h-11 flex-1 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => void handleDelete(note)}
                            disabled={saving}
                            className="min-h-11 flex-1 rounded-lg bg-red-600 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            Descartar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmingDelete(note.id)}
                          disabled={saving}
                          aria-label="Descartar la nota"
                          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => void handleConfirm(note)}
                          disabled={saving}
                          className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Confirmar
                        </button>
                      </div>
                    )}

                    {!assigned && (
                      <p className="flex items-start gap-1.5 text-xs text-amber-700">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        Sin cliente, la visita no aparecerá en su ficha.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Bulk action: everything matched confidently goes in one tap. */}
      {readyIds.length > 0 && (
        <div
          className="fixed inset-x-3 z-[1110] md:static md:mt-4"
          style={{ bottom: 'calc(max(0.5rem, env(safe-area-inset-bottom)) + 76px)' }}
        >
          <button
            onClick={() => void handleConfirmReady()}
            disabled={bulkSaving}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white shadow-xl disabled:opacity-60"
          >
            {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Confirmar {readyIds.length} nota{readyIds.length === 1 ? '' : 's'} segura
            {readyIds.length === 1 ? '' : 's'}
          </button>
        </div>
      )}
    </div>
  )
}
