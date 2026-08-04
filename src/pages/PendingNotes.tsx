import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, Loader2, MapPin, Mic, RefreshCw, Trash2 } from 'lucide-react'
import { supabase, type Customer } from '../lib/supabase'
import {
  formatProductsInput,
  normalizePriority,
  parseProductsInput,
  type FollowUpPriority,
  type VisitNoteRecord,
} from '../services/visitNotesClient'

/**
 * Review screen for notes dictated while driving.
 *
 * Drafts are saved without confirmation so the salesperson never touches the
 * screen in the car. Here, parked, they check the customer the system picked,
 * fix anything wrong, and confirm — which is also what creates the follow-up
 * reminder.
 */

interface PendingNote extends VisitNoteRecord {
  match_method?: string | null
  match_confidence?: string | null
}

const CONFIDENCE_LABEL: Record<string, { text: string; className: string }> = {
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, Partial<PendingNote> & { productsInput?: string }>>({})

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

      setNotes(payload.data || [])
      if (payload.data?.length) setExpandedId(payload.data[0].id)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // The customer list lets the salesperson correct a wrong match.
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

  const valueOf = <K extends keyof PendingNote>(note: PendingNote, key: K): PendingNote[K] => {
    const edit = edits[note.id]
    return edit && key in edit ? (edit[key] as PendingNote[K]) : note[key]
  }

  const setValue = (id: string, patch: Partial<PendingNote> & { productsInput?: string }) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const confirm = useCallback(
    async (note: PendingNote) => {
      setSavingId(note.id)
      setError('')

      try {
        const edit = edits[note.id] || {}
        const headers = await authHeaders()
        // Read straight from this note's pending edits so the callback does
        // not depend on a helper defined outside it.
        const pick = <K extends keyof PendingNote>(key: K): PendingNote[K] =>
          key in edit ? (edit[key] as PendingNote[K]) : note[key]

        const products =
          edit.productsInput !== undefined
            ? parseProductsInput(edit.productsInput)
            : note.interested_products

        const response = await fetch(`/api/visit-notes?id=${encodeURIComponent(note.id)}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            customer_id: pick('customer_id'),
            customer_name: pick('customer_name'),
            visit_summary: pick('visit_summary'),
            interested_products: products,
            customer_feedback: pick('customer_feedback'),
            customer_issues: pick('customer_issues'),
            next_action: pick('next_action'),
            follow_up_date: pick('follow_up_date'),
            follow_up_priority: normalizePriority(pick('follow_up_priority')),
            raw_transcript: note.raw_transcript,
            visit_date: note.visit_date,
            // Confirming is what turns the draft into a real note and creates
            // its reminder.
            review_status: 'reviewed',
          }),
        })

        const payload = await response.json()
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || 'No se pudo confirmar la nota.')
        }

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
    [edits]
  )

  const discard = useCallback(async (note: PendingNote) => {
    if (!window.confirm('¿Descartar esta nota? No se podrá recuperar.')) return

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
    } catch (discardError) {
      setError(discardError instanceof Error ? discardError.message : 'Error al descartar')
    } finally {
      setSavingId(null)
    }
  }, [])

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
            <Mic className="h-5 w-5 text-emerald-600" /> Notas por revisar
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Notas grabadas sobre la marcha. Confírmalas para que cuenten como visita y se cree el
            recordatorio.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700"
        >
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
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
          <p className="mt-1 text-sm text-gray-500">
            Graba una nota con el botón verde después de cada visita.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map(note => {
            const open = expandedId === note.id
            const confidence = CONFIDENCE_LABEL[note.match_confidence || 'none']
            const saving = savingId === note.id

            return (
              <div key={note.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <button
                  onClick={() => setExpandedId(open ? null : note.id)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-gray-900">
                        {valueOf(note, 'customer_name')}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${confidence.className}`}>
                        {confidence.text}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-600">
                      {valueOf(note, 'visit_summary') || note.raw_transcript}
                    </p>
                    <p className="mt-1 text-[11px] text-gray-400">
                      {note.visit_date}
                      {note.match_method === 'gps' && ' · identificado por ubicación'}
                      {note.match_method === 'voice+gps' && ' · voz y ubicación coinciden'}
                    </p>
                  </div>
                </button>

                {open && (
                  <div className="space-y-3 border-t border-gray-100 bg-gray-50 px-4 py-3">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-gray-700">Cliente</span>
                      <select
                        value={valueOf(note, 'customer_id') || ''}
                        onChange={event => {
                          const picked = customers.find(item => item.id === event.target.value)
                          setValue(note.id, {
                            customer_id: event.target.value || null,
                            customer_name: picked?.name || valueOf(note, 'customer_name'),
                          })
                        }}
                        className="min-h-11 w-full rounded-lg border border-gray-300 px-2 text-sm"
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

                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-gray-700">Productos</span>
                      <input
                        value={
                          edits[note.id]?.productsInput ??
                          formatProductsInput(note.interested_products)
                        }
                        onChange={event => setValue(note.id, { productsInput: event.target.value })}
                        className="min-h-10 w-full rounded-lg border border-gray-300 px-2 text-sm"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-gray-700">Próxima acción</span>
                      <textarea
                        value={valueOf(note, 'next_action') || ''}
                        onChange={event => setValue(note.id, { next_action: event.target.value })}
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
                          className="min-h-10 w-full rounded-lg border border-gray-300 px-2 text-sm"
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
                          className="min-h-10 w-full rounded-lg border border-gray-300 px-2 text-sm"
                        >
                          {(Object.keys(PRIORITY_LABEL) as FollowUpPriority[]).map(priority => (
                            <option key={priority} value={priority}>
                              {PRIORITY_LABEL[priority]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <details className="text-xs text-gray-600">
                      <summary className="cursor-pointer font-medium">Transcripción original</summary>
                      <p className="mt-1 whitespace-pre-wrap">{note.raw_transcript}</p>
                    </details>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => void discard(note)}
                        disabled={saving}
                        className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" /> Descartar
                      </button>
                      <button
                        onClick={() => void confirm(note)}
                        disabled={saving}
                        className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {saving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Confirmar
                      </button>
                    </div>

                    {!valueOf(note, 'customer_id') && (
                      <p className="flex items-start gap-1.5 text-xs text-amber-700">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        Elige el cliente antes de confirmar para que la visita quede en su ficha.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
