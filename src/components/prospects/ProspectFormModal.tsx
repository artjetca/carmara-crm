// ============================================================
// ProspectFormModal.tsx
// Add / Edit a single prospect with inline duplicate warning
// ============================================================

import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import type { Customer, Prospect } from '../../lib/supabase'
import { checkProspectVsCustomers, checkProspectVsProspects } from '../../services/dedupeService'
import {
  getCitiesForProvince,
  PROSPECT_PROVINCES,
} from './prospectLocationOptions'
import { getProspectModalButtonClass } from './prospectActionButtonStyles'

const CATEGORIES = [
  'estética',
  'clínica estética',
  'peluquería',
  'centro de belleza',
  'spa',
  'barbería',
  'centro wellness',
  'otro',
]
const SOURCES = [
  'Google Maps',
  'directorio web',
  'recomendación',
  'visita presencial',
  'manual',
]

interface ProspectFormModalProps {
  prospect?: Prospect | null      // null = new, Prospect = edit
  customers: Customer[]           // for dedup check
  prospects: Prospect[]           // for dedup check
  onSave: (data: Omit<Prospect, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  onClose: () => void
}

type FormData = {
  business_name:   string
  contact_name:    string
  phone:           string
  address:         string
  city:            string
  province:        string
  postal_code:     string
  country:         string
  category:        string
  source:          string
  website:         string
  notes:           string
}

const emptyForm: FormData = {
  business_name: '',
  contact_name:  '',
  phone:         '',
  address:       '',
  city:          '',
  province:      'Cádiz',
  postal_code:   '',
  country:       'España',
  category:      '',
  source:        'manual',
  website:       '',
  notes:         '',
}

export default function ProspectFormModal({
  prospect,
  customers,
  prospects,
  onSave,
  onClose,
}: ProspectFormModalProps) {
  const isEdit = Boolean(prospect?.id)

  const [form, setForm] = useState<FormData>(() => {
    if (!prospect) return emptyForm
    return {
      business_name: prospect.business_name ?? '',
      contact_name:  prospect.contact_name  ?? '',
      phone:         prospect.phone         ?? '',
      address:       prospect.address       ?? '',
      city:          prospect.city          ?? '',
      province:      prospect.province      ?? 'Cádiz',
      postal_code:   prospect.postal_code   ?? '',
      country:       prospect.country       ?? 'España',
      category:      prospect.category      ?? '',
      source:        prospect.source        ?? 'manual',
      website:       prospect.website       ?? '',
      notes:         prospect.notes         ?? '',
    }
  })

  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<FormData>>({})
  const [dupClient, setDupClient] = useState<string | null>(null)
  const [dupProspect, setDupProspect] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  const dupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Run dedup check debounced whenever key fields change
  useEffect(() => {
    if (dupTimerRef.current) clearTimeout(dupTimerRef.current)
    dupTimerRef.current = setTimeout(() => {
      if (!form.business_name && !form.phone) {
        setDupClient(null)
        setDupProspect(null)
        return
      }
      const checkData = {
        business_name: form.business_name,
        phone:         form.phone,
        address:       form.address,
        city:          form.city,
      }
      const clientResult  = checkProspectVsCustomers(checkData, customers)
      const prospectResult = checkProspectVsProspects(checkData, prospects, prospect?.id)

      setDupClient(
        clientResult.isDuplicate
          ? `Posible duplicado con cliente existente: ${clientResult.matchedCustomerName} (${Math.round(clientResult.confidence * 100)}% coincidencia)`
          : null
      )
      setDupProspect(
        prospectResult.isDuplicate
          ? `Posible duplicado con prospecto existente: ${prospectResult.matchedProspectName}`
          : null
      )
    }, 500)
    return () => { if (dupTimerRef.current) clearTimeout(dupTimerRef.current) }
  }, [form.business_name, form.phone, form.address, form.city])

  useEffect(() => {
    setMounted(true)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const cityOptions = getCitiesForProvince(form.province)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'province' ? { city: '' } : {}),
    }))
    setErrors((prev) => ({ ...prev, [name]: undefined }))
  }

  const validate = (): boolean => {
    const errs: Partial<FormData> = {}
    if (!form.business_name.trim()) errs.business_name = 'Nombre obligatorio'
    if (!form.province)              errs.province = 'Selecciona provincia'
    if (form.province && !PROSPECT_PROVINCES.includes(form.province as any))
      errs.province = 'Solo Cádiz o Huelva'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      const payload: Omit<Prospect, 'id' | 'created_at' | 'updated_at'> = {
        business_name:  form.business_name.trim(),
        contact_name:   form.contact_name.trim()  || undefined,
        phone:          form.phone.trim()          || undefined,
        address:        form.address.trim()        || undefined,
        city:           form.city.trim()           || undefined,
        province:       form.province,
        postal_code:    form.postal_code.trim()    || undefined,
        country:        form.country               || 'España',
        category:       form.category              || undefined,
        source:         form.source                || 'manual',
        website:        form.website.trim()        || undefined,
        notes:          form.notes.trim()          || undefined,
        lat:            prospect?.lat              ?? null,
        lng:            prospect?.lng              ?? null,
        geocode_status: prospect?.geocode_status   ?? 'pending',
        duplicate_with_existing_client: Boolean(dupClient),
        created_by:     undefined,
      }
      await onSave(payload)
      onClose()
    } catch (err) {
      alert(`Error al guardar: ${(err as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  if (!mounted) return null

  return createPortal(
    <>
      <style>{`
        .leaflet-pane,
        .leaflet-top,
        .leaflet-bottom,
        .leaflet-control {
          z-index: 400 !important;
        }
      `}</style>
      <div
        className="fixed inset-0 z-[5000] bg-black/55 p-4 sm:p-6"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-0 z-[5001] flex items-center justify-center p-4 sm:p-6">
        <div
          className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto overscroll-contain rounded-xl bg-white shadow-2xl"
          onClick={event => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={isEdit ? 'Editar prospecto' : 'Nuevo prospecto'}
        >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-5">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Editar prospecto' : 'Nuevo prospecto'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Duplicate warnings */}
          {(dupClient || dupProspect) && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1">
              <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                Posible duplicado detectado
              </div>
              {dupClient   && <p className="text-sm text-amber-600 pl-6">{dupClient}</p>}
              {dupProspect && <p className="text-sm text-amber-600 pl-6">{dupProspect}</p>}
            </div>
          )}

          {/* businessName */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del negocio <span className="text-red-500">*</span>
            </label>
            <input
              name="business_name"
              value={form.business_name}
              onChange={handleChange}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none
                ${errors.business_name ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="Ej. Clínica Estética Sol"
            />
            {errors.business_name && (
              <p className="text-red-500 text-xs mt-1">{errors.business_name}</p>
            )}
          </div>

          {/* contactName + phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contacto</label>
              <input
                name="contact_name"
                value={form.contact_name}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Nombre contacto"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="956 123 456"
              />
            </div>
          </div>

          {/* address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
            <input
              name="address"
              value={form.address}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="Calle Real 12"
            />
          </div>

          {/* city + province + postal_code */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
              <select
                name="city"
                value={form.city}
                onChange={handleChange}
                disabled={cityOptions.length === 0}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white disabled:cursor-not-allowed disabled:bg-gray-100"
              >
                <option value="">Todas / Selecciona una ciudad</option>
                {cityOptions.map(city => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Provincia <span className="text-red-500">*</span>
              </label>
              <select
                name="province"
                value={form.province}
                onChange={handleChange}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white
                  ${errors.province ? 'border-red-400' : 'border-gray-300'}`}
              >
                <option value="">Seleccionar</option>
                {PROSPECT_PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {errors.province && (
                <p className="text-red-500 text-xs mt-1">{errors.province}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">C.P.</label>
              <input
                name="postal_code"
                value={form.postal_code}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="11001"
                maxLength={5}
              />
            </div>
          </div>

          {/* category + source */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="">Seleccionar categoría</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fuente</label>
              <select
                name="source"
                value={form.source}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* website */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Web</label>
            <input
              name="website"
              value={form.website}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="www.ejemplo.es"
            />
          </div>

          {/* notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              placeholder="Observaciones…"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className={getProspectModalButtonClass('slate', 'secondary')}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className={getProspectModalButtonClass('emerald')}
            >
              {saving ? 'Guardando…' : isEdit ? 'Actualizar' : 'Añadir prospecto'}
            </button>
          </div>
        </form>
      </div>
      </div>
    </>,
    document.body
  )
}
