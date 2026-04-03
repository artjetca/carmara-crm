import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'
import { fetchProspectAutoCaptureConfig } from '../../services/prospectScrapeService'
import {
  buildProspectAutoCaptureQuery,
  getCitiesForProvince,
  PROSPECT_PROVINCES,
} from './prospectLocationOptions'
import { getProspectModalButtonClass } from './prospectActionButtonStyles'

type ProspectAutoCaptureModalProps = {
  onClose: () => void
  onSubmit: (payload: {
    province: string
    city?: string
    keyword: string
    limit: number
  }) => Promise<void>
}

export default function ProspectAutoCaptureModal({
  onClose,
  onSubmit,
}: ProspectAutoCaptureModalProps) {
  const [mounted, setMounted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [configChecking, setConfigChecking] = useState(true)
  const [keyConfigured, setKeyConfigured] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    province: 'Cádiz',
    city: '',
    keyword: 'estética',
    limit: 50,
  })

  useEffect(() => {
    setMounted(true)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const cityOptions = useMemo(() => getCitiesForProvince(form.province), [form.province])

  useEffect(() => {
    let cancelled = false

    const checkConfig = async () => {
      setConfigChecking(true)
      try {
        const config = await fetchProspectAutoCaptureConfig()
        console.info('[Auto captar] backend key exists:', config.keyExists, 'source:', config.keySource)
        if (cancelled) return
        setKeyConfigured(config.keyExists)
        setError(
          config.keyExists
            ? ''
            : 'Google Maps API key not configured. Auto captar necesita una server-side key. 請在 Netlify 設定 GOOGLE_PLACES_API_KEY 或 GOOGLE_MAPS_SERVER_API_KEY，並重新部署網站。'
        )
      } catch (configError) {
        if (cancelled) return
        setKeyConfigured(false)
        setError((configError as Error).message || 'No se pudo verificar la configuración.')
      } finally {
        if (!cancelled) {
          setConfigChecking(false)
        }
      }
    }

    checkConfig().catch(console.error)

    return () => {
      cancelled = true
    }
  }, [])

  if (!mounted) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[5000] bg-black/55" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-0 z-[5001] flex items-center justify-center p-4 sm:p-6">
        <div
          className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-2xl"
          onClick={event => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Auto captar prospectos"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-emerald-600" />
              <h2 className="text-lg font-bold text-gray-900">Auto captar</h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            className="space-y-4 p-5"
            onSubmit={async event => {
              event.preventDefault()
              setSubmitting(true)
              if (keyConfigured) setError('')
              try {
                if (!keyConfigured) {
                  throw new Error(
                    'Google Maps API key not configured. Auto captar necesita una server-side key. 請在 Netlify 設定 GOOGLE_PLACES_API_KEY 或 GOOGLE_MAPS_SERVER_API_KEY，並重新部署網站。'
                  )
                }
                await onSubmit({
                  province: form.province,
                  city: form.city.trim() || undefined,
                  keyword: form.keyword.trim() || 'estética',
                  limit: form.limit,
                })
              } catch (submitError) {
                setError((submitError as Error).message || 'No se pudo completar la captura.')
              } finally {
                setSubmitting(false)
              }
            }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Provincia</label>
                <select
                  value={form.province}
                  onChange={event =>
                    setForm(previous => ({
                      ...previous,
                      province: event.target.value,
                      city: '',
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {PROSPECT_PROVINCES.map(province => (
                    <option key={province} value={province}>{province}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Ciudad</label>
                <select
                  value={form.city}
                  onChange={event => setForm(previous => ({ ...previous, city: event.target.value }))}
                  disabled={cityOptions.length === 0}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-100"
                >
                  <option value="">Todas / Selecciona una ciudad</option>
                  {cityOptions.map(city => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Keyword</label>
                <input
                  value={form.keyword}
                  onChange={event => setForm(previous => ({ ...previous, keyword: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="estética"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Límite</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={form.limit}
                  onChange={event => setForm(previous => ({ ...previous, limit: Number(event.target.value) || 50 }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
              Se buscarán negocios con Google Places usando la consulta:
              <div className="mt-1 font-medium text-gray-900">
                {buildProspectAutoCaptureQuery({
                  keyword: form.keyword,
                  city: form.city,
                  province: form.province,
                })}
              </div>
            </div>

            {configChecking && (
              <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
                Comprobando configuración del backend…
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={onClose}
                className={getProspectModalButtonClass('slate', 'secondary')}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || configChecking || !form.keyword.trim()}
                className={getProspectModalButtonClass('emerald')}
              >
                {submitting ? 'Buscando…' : 'Empezar captura'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  )
}
