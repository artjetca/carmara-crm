import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, Clock, X, XCircle } from 'lucide-react'
import type { ScrapeJob } from '../../lib/supabase'
import { getProspectToolbarButtonClass } from './prospectActionButtonStyles'

type ProspectScrapeJobsModalProps = {
  jobs: ScrapeJob[]
  loading: boolean
  onClose: () => void
  onRefresh: () => Promise<void> | void
}

const statusMap: Record<
  ScrapeJob['status'],
  { label: string; cls: string; icon: React.ReactNode }
> = {
  pending: {
    label: 'Pendiente',
    cls: 'bg-slate-100 text-slate-700',
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  running: {
    label: 'En progreso',
    cls: 'bg-blue-100 text-blue-700',
    icon: <Clock className="h-3.5 w-3.5 animate-spin" />,
  },
  completed: {
    label: 'Completado',
    cls: 'bg-emerald-100 text-emerald-700',
    icon: <CheckCircle className="h-3.5 w-3.5" />,
  },
  failed: {
    label: 'Fallido',
    cls: 'bg-rose-100 text-rose-700',
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
}

export default function ProspectScrapeJobsModal({
  jobs,
  loading,
  onClose,
  onRefresh,
}: ProspectScrapeJobsModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  if (!mounted) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[5000] bg-black/55" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-[5001] flex items-center justify-center p-4 sm:p-6">
        <div
          className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl"
          onClick={event => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Estado de jobs de captación"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-5">
            <h2 className="text-lg font-bold text-gray-900">Jobs de captación</h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onRefresh()}
                className={getProspectToolbarButtonClass('violet')}
              >
                Actualizar
              </button>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="p-5">
            {loading ? (
              <div className="py-10 text-center text-sm text-gray-500">Cargando jobs…</div>
            ) : jobs.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">No hay jobs todavía.</div>
            ) : (
              <div className="space-y-3">
                {jobs.map(job => {
                  const status = statusMap[job.status] ?? {
                    label: job.status,
                    cls: 'bg-gray-100 text-gray-700',
                    icon: <Clock className="h-3.5 w-3.5" />,
                  }
                  const isRunning = job.status === 'running'
                  const isSuccess = job.status === 'completed' && job.total_imported > 0
                  const isEmpty = job.status === 'completed' && job.total_imported === 0
                  return (
                    <div
                      key={job.id}
                      className={`rounded-xl border p-4 shadow-sm ${
                        isSuccess ? 'border-emerald-200 bg-emerald-50/30' :
                        isEmpty ? 'border-amber-200 bg-amber-50/30' :
                        job.status === 'failed' ? 'border-rose-200 bg-rose-50/30' :
                        'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">
                            {[job.keyword, job.city, job.province].filter(Boolean).join(' · ')}
                          </div>
                          <div className="mt-0.5 text-xs text-gray-400">
                            {job.created_at ? new Date(job.created_at).toLocaleString('es-ES') : ''}
                          </div>
                        </div>
                        <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${status.cls}`}>
                          {status.icon}
                          {status.label}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600 sm:grid-cols-4">
                        <div className={`rounded-lg p-3 ${job.total_found > 0 ? 'bg-blue-50' : 'bg-gray-50'}`}>
                          <div className={`text-base font-bold ${job.total_found > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                            {job.total_found}
                          </div>
                          <div className="text-gray-500 mt-0.5">Captados</div>
                        </div>
                        <div className={`rounded-lg p-3 ${job.total_imported > 0 ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                          <div className={`text-base font-bold ${job.total_imported > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                            {job.total_imported}
                          </div>
                          <div className="text-gray-500 mt-0.5">Importados</div>
                        </div>
                        <div className={`rounded-lg p-3 ${job.total_failed > 0 ? 'bg-rose-50' : 'bg-gray-50'}`}>
                          <div className={`text-base font-bold ${job.total_failed > 0 ? 'text-rose-700' : 'text-gray-400'}`}>
                            {job.total_failed}
                          </div>
                          <div className="text-gray-500 mt-0.5">Fallidos</div>
                        </div>
                        <div className="rounded-lg bg-gray-50 p-3">
                          <div className="text-base font-bold text-gray-700">{job.limit_count ?? '—'}</div>
                          <div className="text-gray-500 mt-0.5">Límite</div>
                        </div>
                      </div>

                      {isRunning && (
                        <div className="mt-3 rounded-lg bg-blue-50 p-3 text-xs text-blue-700 flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 animate-spin shrink-0" />
                          Procesando… actualiza en unos segundos.
                        </div>
                      )}

                      {job.error_message && (
                        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                          ℹ️ {job.error_message}
                        </div>
                      )}

                      {isSuccess && (
                        <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-700">
                          ✅ {job.total_imported} prospectos importados correctamente.
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
