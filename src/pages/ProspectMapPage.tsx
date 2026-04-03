// ============================================================
// ProspectMapPage.tsx
// Mapa de Prospectos – Cádiz / Huelva
// Independent from Mapa de Visitas; uses its own prospect layer.
// ============================================================

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Filter,
  Globe,
  MapPin,
  Navigation,
  Phone,
  PlusCircle,
  Search,
  Upload,
  X,
  RefreshCw,
  CheckCircle,
  Clock,
  XCircle,
} from 'lucide-react'

import 'leaflet/dist/leaflet.css'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'

import type { Customer, Prospect } from '../lib/supabase'
import { useStore } from '../store/useStore'
import {
  fetchProspects,
  createProspect,
  updateProspect,
  deleteProspect,
} from '../services/prospectService'
import { geocodePendingProspects } from '../services/prospectGeocodeService'
import { parseProspectFile, generateImportTemplate } from '../services/prospectImportService'
import { exportProspectsToExcel } from '../services/prospectExportService'
import { batchCreateProspects } from '../services/prospectService'
import ProspectFormModal from '../components/prospects/ProspectFormModal'
import ProspectAutoCaptureModal from '../components/prospects/ProspectAutoCaptureModal'
import ProspectScrapeJobsModal from '../components/prospects/ProspectScrapeJobsModal'
import { fetchScrapeJobs, runProspectAutoCapture } from '../services/prospectScrapeService'
import type { ScrapeJob } from '../lib/supabase'
import {
  getAllProspectCities,
  getCitiesForProvince,
} from '../components/prospects/prospectLocationOptions'
import {
  getCoordinateAuditForClient,
  normalizeGeocodeResults,
  sanitizeCoordinateCache,
  validateAndFixClientCoordinates,
  type ClientCoordinateAudit,
  type MapCoordinates,
} from '../components/communications/visitsGeocodeUtils'
import {
  buildResolvedMapClient,
  getClientRenderableCoordinates,
  hasRenderableCoordinates,
  type ResolvedMapClient,
} from './mapsPageUtils'
import {
  deriveCity,
  deriveProvince,
  getCustomerDisplayAddress,
  getCustomerPhone,
} from '../components/communications/visitsMapUtils'
import {
  getProspectModalButtonClass,
  getProspectPopupButtonClass,
  getProspectToolbarButtonClass,
} from '../components/prospects/prospectActionButtonStyles'

// ─── Map helpers ──────────────────────────────────────────────────────────────

const CADIZ_CENTER: [number, number] = [36.52, -6.28]
const CUSTOMER_COORDS_STORAGE_KEY = 'prospect-map-customer-coords'

type CoordinateCache = Record<string, ClientCoordinateAudit | MapCoordinates>

// ─── Marker icons ──────────────────────────────────────────────────────────────

const createProspectIcon = (status: Prospect['geocode_status'], selected: boolean) => {
  const size = selected ? 22 : 18
  let bg = '#ec4899'      // valid   → pink
  let border = '#ffffff'
  let dash = false

  if (status === 'approximate') { bg = '#fdf2f8'; border = '#ec4899'; dash = true }
  else if (status === 'invalid' || status === 'pending') { bg = '#6b7280'; border = '#d1d5db' }

  return L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
        <div style="
          width:${size}px;height:${size}px;border-radius:50%;
          background:${bg};
          border:2px ${dash ? 'dashed' : 'solid'} ${border};
          box-shadow:0 4px 12px rgba(15,23,42,.22);
          ${selected ? 'transform:scale(1.25);' : ''}
        "></div>
        <div style="
          width:2px;height:${size * 0.5}px;background:${bg};
          margin-top:-2px;opacity:.7;
        "></div>
      </div>`,
    iconSize: [size, size + size * 0.5],
    iconAnchor: [size / 2, size + size * 0.5],
    popupAnchor: [0, -(size + 4)],
  })
}

const createCustomerIcon = (approximate = false) =>
  L.divIcon({
    className: '',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
        <div style="
          width:16px;height:16px;border-radius:50%;
          background:#2563eb;
          border:2px solid #ffffff;
          box-shadow:0 4px 12px rgba(15,23,42,.22);
        "></div>
        <div style="
          width:2px;height:8px;background:#2563eb;
          margin-top:-2px;opacity:.7;
        "></div>
      </div>`,
    iconSize: [16, 24],
    iconAnchor: [8, 24],
    popupAnchor: [0, -18],
  })

// ─── Geocode status badge ─────────────────────────────────────────────────────

function GeoBadge({ status }: { status: Prospect['geocode_status'] }) {
  const map: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    valid:       { label: 'Geocodificado',     icon: <CheckCircle className="w-3 h-3" />,   cls: 'bg-emerald-100 text-emerald-700' },
    approximate: { label: 'Aproximado',        icon: <AlertTriangle className="w-3 h-3" />, cls: 'bg-amber-100 text-amber-700' },
    invalid:     { label: 'Sin coordenadas',   icon: <XCircle className="w-3 h-3" />,       cls: 'bg-red-100 text-red-700' },
    pending:     { label: 'Pendiente geocod.', icon: <Clock className="w-3 h-3" />,         cls: 'bg-gray-100 text-gray-600' },
  }
  const s = map[status ?? 'pending'] ?? map.pending
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${s.cls}`}>
      {s.icon}{s.label}
    </span>
  )
}

// ─── FlyTo helper ─────────────────────────────────────────────────────────────

function FlyToMarker({ coords }: { coords: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (coords) map.flyTo(coords, 15, { duration: 0.8 })
  }, [coords, map])
  return null
}

// ─── Import modal ─────────────────────────────────────────────────────────────

interface ImportModalProps {
  customers: Customer[]
  prospects: Prospect[]
  onImported: (newOnes: Prospect[]) => void
  onClose: () => void
  userId?: string
}

function ImportModal({ customers, prospects, onImported, onClose, userId }: ImportModalProps) {
  const [preview, setPreview] = useState<ReturnType<typeof parseProspectFile> | null>(null)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [geocodeProgress, setGeocodeProgress] = useState<string>('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const result = parseProspectFile(ev.target!.result as ArrayBuffer, f.name)
      setPreview(result)
    }
    reader.readAsArrayBuffer(f)
  }

  const handleImport = async () => {
    if (!preview) return
    setLoading(true)
    setStatus('Subiendo prospectos…')
    try {
      const records = preview.rows.map((r) => ({ ...r, created_by: userId ?? undefined }))
      const result = await batchCreateProspects(records as any)
      setStatus(`✓ ${result.inserted} importados, ${result.skippedCount} omitidos.`)

      // Geocode pending
      const pending = (result.data ?? []).filter((p) => p.geocode_status === 'pending')
      if (pending.length > 0) {
        setGeocodeProgress(`Geocodificando 0/${pending.length}…`)
        const updated = await geocodePendingProspects(pending, (done, total) => {
          setGeocodeProgress(`Geocodificando ${done}/${total}…`)
        })
        setGeocodeProgress(`✓ ${updated.filter(p => p.geocode_status !== 'invalid').length} geocodificados.`)
        // merge updated coords back
        const updatedMap = Object.fromEntries(updated.map((p) => [p.id, p]))
        onImported(result.data.map((p) => updatedMap[p.id] ?? p))
      } else {
        onImported(result.data ?? [])
      }
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[5001] flex items-center justify-center bg-black/55 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Importar prospectos (Excel / CSV)</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              className={getProspectToolbarButtonClass('blue', 'md')}
            >
              <Upload className="w-4 h-4" /> Seleccionar archivo
            </button>
            <button
              onClick={generateImportTemplate}
              className={getProspectToolbarButtonClass('indigo', 'md')}
            >
              <Download className="w-4 h-4" /> Descargar plantilla
            </button>
          </div>

          {preview && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
              <p className="text-sm font-medium text-gray-700">Vista previa</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white rounded-lg p-3 border border-gray-100">
                  <div className="text-2xl font-bold text-gray-900">{preview.totalParsed}</div>
                  <div className="text-xs text-gray-500">Filas leídas</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-100">
                  <div className="text-2xl font-bold text-emerald-600">{preview.valid}</div>
                  <div className="text-xs text-gray-500">Válidas</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-gray-100">
                  <div className="text-2xl font-bold text-amber-600">{preview.skipped}</div>
                  <div className="text-xs text-gray-500">Omitidas</div>
                </div>
              </div>
              {preview.errors.length > 0 && (
                <ul className="text-xs text-red-600 space-y-1">
                  {preview.errors.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              )}
              {/* Sample rows */}
              {preview.rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="text-xs w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100">
                        {['Negocio','Teléfono','Ciudad','Provincia','Categoría'].map(h => (
                          <th key={h} className="text-left px-2 py-1 text-gray-600 font-medium border border-gray-200">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 5).map((r, i) => (
                        <tr key={i} className="even:bg-gray-50">
                          <td className="px-2 py-1 border border-gray-200 max-w-[140px] truncate">{r.business_name}</td>
                          <td className="px-2 py-1 border border-gray-200">{r.phone ?? '–'}</td>
                          <td className="px-2 py-1 border border-gray-200">{r.city ?? '–'}</td>
                          <td className="px-2 py-1 border border-gray-200">{r.province ?? '–'}</td>
                          <td className="px-2 py-1 border border-gray-200">{r.category ?? '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.rows.length > 5 && (
                    <p className="text-xs text-gray-400 mt-1">… y {preview.rows.length - 5} más</p>
                  )}
                </div>
              )}
            </div>
          )}

          {status && <p className="text-sm text-gray-700 font-medium">{status}</p>}
          {geocodeProgress && <p className="text-sm text-blue-600">{geocodeProgress}</p>}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-200">
          <button onClick={onClose} className={getProspectToolbarButtonClass('slate', 'md')}>
            Cerrar
          </button>
          <button
            onClick={handleImport}
            disabled={!preview || loading || preview.valid === 0}
            className={getProspectModalButtonClass('emerald')}
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {loading ? 'Importando…' : `Importar ${preview?.valid ?? 0} prospectos`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProspectMapPage() {
  const { customers, profile, setCustomers, updateCustomer } = useStore()

  // ── State ────────────────────────────────────────────────────────────────────
  const [prospects, setProspects]             = useState<Prospect[]>([])
  const [loading, setLoading]                 = useState(true)
  const [customersLoading, setCustomersLoading] = useState(true)
  const [selectedId, setSelectedId]           = useState<string | null>(null)
  const [flyTo, setFlyTo]                     = useState<[number, number] | null>(null)

  // Filters
  const [searchTerm, setSearchTerm]           = useState('')
  const [filterProvince, setFilterProvince]   = useState<string>('')
  const [filterCity, setFilterCity]           = useState<string>('')

  // Modals
  const [showFormModal, setShowFormModal]     = useState(false)
  const [editProspect, setEditProspect]       = useState<Prospect | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showAutoCaptureModal, setShowAutoCaptureModal] = useState(false)
  const [showJobsModal, setShowJobsModal] = useState(false)
  const [jobs, setJobs] = useState<ScrapeJob[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobMessage, setJobMessage] = useState('')
  const [coordsByCustomerId, setCoordsByCustomerId] = useState<CoordinateCache>(() => {
    try {
      const saved = localStorage.getItem(CUSTOMER_COORDS_STORAGE_KEY)
      return saved ? (sanitizeCoordinateCache(JSON.parse(saved)) as CoordinateCache) : {}
    } catch {
      return {}
    }
  })

  // Geocode batch
  const [geocoding, setGeocoding]             = useState(false)
  const [geocodeMsg, setGeocodeMsg]           = useState('')
  const geocodeAttemptedRef = useRef(new Set<string>())
  const geocodingCustomersRef = useRef(false)
  const persistedCoordinateSignaturesRef = useRef(new Map<string, string>())

  // ── Load ─────────────────────────────────────────────────────────────────────
  const loadProspects = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchProspects()
      setProspects(data)
    } catch (err) {
      console.error('Error loading prospects:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadProspects() }, [loadProspects])

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true)
    try {
      const response = await fetch('/api/customers', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'No se pudieron cargar los clientes.')
      }

      const nextCustomers = Array.isArray(result.data) ? result.data : []
      console.log('[MAP] clientes loaded count', nextCustomers.length)
      setCustomers(nextCustomers)
    } catch (error) {
      console.error('[MAP] customers load failed', error)
    } finally {
      setCustomersLoading(false)
    }
  }, [setCustomers])

  useEffect(() => {
    loadCustomers().catch(console.error)
  }, [loadCustomers])

  const loadJobs = useCallback(async () => {
    setJobsLoading(true)
    try {
      const result = await fetchScrapeJobs(profile?.id)
      setJobs(result.jobs)
    } catch (err) {
      console.error('Error loading scrape jobs:', err)
      setJobMessage((err as Error).message || 'No se pudieron cargar los jobs de captación.')
    } finally {
      setJobsLoading(false)
    }
  }, [profile?.id])

  useEffect(() => {
    loadJobs().catch(console.error)
  }, [loadJobs])

  useEffect(() => {
    console.log('[MAP] prospectos loaded count', prospects.length)
  }, [prospects.length])

  const persistCoordinateCache = useCallback((nextEntries: CoordinateCache) => {
    setCoordsByCustomerId(previous => {
      const merged = { ...previous, ...nextEntries }
      localStorage.setItem(CUSTOMER_COORDS_STORAGE_KEY, JSON.stringify(merged))
      return merged
    })
  }, [])

  const fetchGeocodeCandidates = useCallback(async (address: string) => {
    const response = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    })

    const apiResult = await response.json()
    const normalized = normalizeGeocodeResults(apiResult)

    console.log('[MAP_GEOCODE] normalized results', {
      address,
      status: response.status,
      total: normalized.length,
    })

    if (!response.ok) {
      throw new Error(`Geocode request failed with ${response.status}`)
    }

    return normalized
  }, [])

  const persistCustomerCoordinates = useCallback(
    async (customer: Customer, audit: ClientCoordinateAudit) => {
      const coords = audit.markerCoords
      if (!coords || (audit.geocodeStatus !== 'valid' && audit.geocodeStatus !== 'approximate')) {
        return
      }

      const signature = [
        coords.lat.toFixed(6),
        coords.lng.toFixed(6),
        audit.geocodeStatus,
      ].join('|')

      if (persistedCoordinateSignaturesRef.current.get(customer.id) === signature) {
        return
      }

      const response = await fetch('/api/customers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: customer.id,
          latitude: coords.lat,
          longitude: coords.lng,
          coordinates: `${coords.lat},${coords.lng}`,
        }),
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'No se pudieron guardar las coordenadas del cliente.')
      }

      persistedCoordinateSignaturesRef.current.set(customer.id, signature)
      updateCustomer(customer.id, {
        latitude: coords.lat,
        longitude: coords.lng,
        coordinates: `${coords.lat},${coords.lng}`,
      })
    },
    [updateCustomer]
  )

  const ensureCustomerCoordinates = useCallback(
    async (customer: Customer, force = false) => {
      if (!force) {
        const existing = getCoordinateAuditForClient(customer, coordsByCustomerId[customer.id])
        if (existing.geocodeStatus === 'valid') {
          return existing
        }
      }

      const audit = await validateAndFixClientCoordinates(customer, {
        cachedAudit: force ? null : coordsByCustomerId[customer.id],
        geocodeFetcher: fetchGeocodeCandidates,
      })

      if (audit.markerCoords && (audit.geocodeStatus === 'valid' || audit.geocodeStatus === 'approximate')) {
        try {
          await persistCustomerCoordinates(customer, audit)
        } catch (error) {
          console.error('[MAP] customer coordinate persistence failed', {
            customerId: customer.id,
            customerName: customer.name,
            error,
          })
        }
      }

      return audit
    },
    [coordsByCustomerId, fetchGeocodeCandidates, persistCustomerCoordinates]
  )

  // ── Derived cities list ──────────────────────────────────────────────────────
  const availableCities = useMemo<string[]>(() => {
    return filterProvince ? getCitiesForProvince(filterProvince) : getAllProspectCities()
  }, [filterProvince])

  // ── Filtered prospects ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return prospects.filter((p) => {
      if (filterProvince && p.province !== filterProvince) return false
      if (filterCity && p.city !== filterCity) return false
      if (q) {
        const haystack = [p.business_name, p.phone, p.address, p.city, p.category]
          .join(' ')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [prospects, filterProvince, filterCity, searchTerm])

  const filteredCustomers = useMemo(() => {
    const q = searchTerm.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return customers.filter(customer => {
      const city = deriveCity(customer)
      const province = deriveProvince(customer)

      if (filterProvince && province !== filterProvince) return false
      if (filterCity && city !== filterCity) return false
      if (q) {
        const haystack = [
          customer.company,
          customer.name,
          customer.phone,
          customer.mobile_phone,
          customer.address,
          city,
          province,
        ]
          .join(' ')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [customers, filterProvince, filterCity, searchTerm])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      if (geocodingCustomersRef.current) return
      geocodingCustomersRef.current = true

      try {
        const customersToGeocode = filteredCustomers.filter(customer => {
          const audit = getCoordinateAuditForClient(customer, coordsByCustomerId[customer.id])
          const attemptKey = `${customer.id}:${audit.addressSignature}`
          return (
            audit.geocodeStatus !== 'valid' &&
            audit.addressCompleteness !== 'minimal' &&
            !geocodeAttemptedRef.current.has(attemptKey)
          )
        })

        if (customersToGeocode.length === 0) {
          return
        }

        const batchEntries: CoordinateCache = {}

        for (const customer of customersToGeocode) {
          if (cancelled) return

          const existing = getCoordinateAuditForClient(customer, coordsByCustomerId[customer.id])
          const attemptKey = `${customer.id}:${existing.addressSignature}`
          geocodeAttemptedRef.current.add(attemptKey)

          const audit = await ensureCustomerCoordinates(customer)
          batchEntries[customer.id] = audit
          await new Promise(resolve => setTimeout(resolve, 150))
        }

        if (!cancelled && Object.keys(batchEntries).length > 0) {
          persistCoordinateCache(batchEntries)
        }
      } finally {
        geocodingCustomersRef.current = false
      }
    }

    run().catch(error => console.error('[MAP] customer geocode batch failed', error))

    return () => {
      cancelled = true
    }
  }, [coordsByCustomerId, ensureCustomerCoordinates, filteredCustomers, persistCoordinateCache])

  const resolvedCustomers = useMemo<ResolvedMapClient[]>(
    () =>
      filteredCustomers.map(customer => {
        const audit = getCoordinateAuditForClient(customer, coordsByCustomerId[customer.id])
        return buildResolvedMapClient(
          customer,
          audit,
          getCustomerDisplayAddress(customer),
          deriveCity(customer),
          deriveProvince(customer),
          getCustomerPhone(customer)
        )
      }),
    [coordsByCustomerId, filteredCustomers]
  )

  const mappableCustomers = useMemo(
    () =>
      resolvedCustomers.filter(customer => {
        if (!hasRenderableCoordinates(customer)) return false
        return true
      }),
    [resolvedCustomers]
  )

  // Prospects with valid map coordinates
  const mappable = useMemo(
    () =>
      filtered.filter(
        (p) =>
          p.lat != null &&
          p.lng != null &&
          p.geocode_status !== 'invalid' &&
          !p.duplicate_with_existing_client
      ),
    [filtered]
  )

  useEffect(() => {
    const customerRowsWithoutCoords = resolvedCustomers
      .filter(customer => !getClientRenderableCoordinates(customer))
      .map(customer => ({
        id: customer.id,
        name: customer.name,
        city: customer.city,
        province: customer.province,
        geocodeStatus: customer.geocodeStatus,
        geocodeReason: customer.geocodeReason,
      }))

    console.log('[MAP] clientes with coordinates count', mappableCustomers.length)
    console.log('[MAP] prospectos loaded count', prospects.length)
    console.log('[MAP] filtered markers count', mappableCustomers.length + mappable.length)
    console.log('[MAP] markers rendered count', mappableCustomers.length + mappable.length)

    if (customerRowsWithoutCoords.length > 0) {
      console.table(customerRowsWithoutCoords)
    }
  }, [mappable.length, mappableCustomers.length, prospects.length, resolvedCustomers])

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(
    async (data: Omit<Prospect, 'id' | 'created_at' | 'updated_at'>) => {
      if (editProspect) {
        const updated = await updateProspect(editProspect.id, data)
        setProspects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      } else {
        const created = await createProspect({ ...data, created_by: profile?.id ?? undefined } as any)
        setProspects((prev) => [created, ...prev])
        // Geocode if pending
        if (created.geocode_status === 'pending') {
          const { geocodeProspect } = await import('../services/prospectGeocodeService')
          const geocoded = await geocodeProspect(created)
          setProspects((prev) => prev.map((p) => (p.id === geocoded.id ? geocoded : p)))
        }
      }
    },
    [editProspect, profile]
  )

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar este prospecto?')) return
    await deleteProspect(id)
    setProspects((prev) => prev.filter((p) => p.id !== id))
    if (selectedId === id) setSelectedId(null)
  }, [selectedId])

  const handleSelect = useCallback((p: Prospect) => {
    setSelectedId(p.id)
    if (p.lat != null && p.lng != null) {
      setFlyTo([p.lat, p.lng])
    }
  }, [])

  const handleGeocodeAll = useCallback(async () => {
    const pending = prospects.filter((p) => p.geocode_status === 'pending')
    if (pending.length === 0) {
      setGeocodeMsg('No hay prospectos pendientes de geocodificación.')
      return
    }
    setGeocoding(true)
    setGeocodeMsg(`Geocodificando 0/${pending.length}…`)
    const updated = await geocodePendingProspects(pending, (done, total) => {
      setGeocodeMsg(`Geocodificando ${done}/${total}…`)
    })
    setProspects((prev) => {
      const map = Object.fromEntries(updated.map((p) => [p.id, p]))
      return prev.map((p) => map[p.id] ?? p)
    })
    const ok = updated.filter((p) => p.geocode_status !== 'invalid').length
    setGeocodeMsg(`✓ ${ok}/${pending.length} geocodificados correctamente.`)
    setGeocoding(false)
  }, [prospects])

  const handleImported = useCallback((newOnes: Prospect[]) => {
    setProspects((prev) => {
      const existing = new Set(prev.map((p) => p.id))
      const fresh = newOnes.filter((p) => !existing.has(p.id))
      return [...fresh, ...prev]
    })
    setShowImportModal(false)
  }, [])

  const handleExport = useCallback(() => {
    exportProspectsToExcel(filtered)
  }, [filtered])

  const handleAutoCapture = useCallback(
    async (payload: {
      province: string
      city?: string
      keyword: string
      limit: number
    }) => {
      setJobMessage('Captando prospectos…')
      try {
        const result = await runProspectAutoCapture({
          ...payload,
          created_by: profile?.id,
        })

        // Immediately merge new prospects into state so list + map refresh without reload
        if (result.prospects && result.prospects.length > 0) {
          setProspects(prev => {
            const merged = new Map(prev.map(item => [item.id, item]))
            result.prospects.forEach(item => merged.set(item.id, item))
            return Array.from(merged.values()).sort(
              (left, right) => (right.lead_score || 0) - (left.lead_score || 0)
            )
          })
        }

        setJobs(previous => [result.job, ...previous.filter(job => job.id !== result.job.id)])
        setShowAutoCaptureModal(false)

        const { total_imported, total_found, status } = result.job
        const summary = result.summary ?? {
          nuevos_anadidos: total_imported,
          omitidos_por_existente_en_clientes: 0,
          duplicados_internos: Math.max(0, total_found - total_imported),
          errores: result.job.total_failed,
        }
        if (total_imported > 0) {
          setJobMessage(
            `✅ Nuevos añadidos: ${summary.nuevos_anadidos} · Omitidos por existente en Gestión de Clientes: ${summary.omitidos_por_existente_en_clientes} · Duplicados internos: ${summary.duplicados_internos} · Errores: ${summary.errores}`
          )
        } else if (status === 'completed' && total_found === 0) {
          setJobMessage(`⚠️ Búsqueda completada: 0 resultados de Google Places.`)
        } else if (total_found > 0 && total_imported === 0) {
          setJobMessage(
            `ℹ️ Nuevos añadidos: ${summary.nuevos_anadidos} · Omitidos por existente en Gestión de Clientes: ${summary.omitidos_por_existente_en_clientes} · Duplicados internos: ${summary.duplicados_internos} · Errores: ${summary.errores}`
          )
        } else {
          setJobMessage(
            `Job completado. Nuevos añadidos: ${summary.nuevos_anadidos} · Omitidos por existente en Gestión de Clientes: ${summary.omitidos_por_existente_en_clientes} · Duplicados internos: ${summary.duplicados_internos} · Errores: ${summary.errores}`
          )
        }
      } catch (error) {
        const message = (error as Error).message || 'No se pudo completar la captación.'
        setJobMessage(message)
        throw error
      }
    },
    [profile?.id]
  )

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full gap-0 -m-6">
      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-auto">
          <MapPin className="w-5 h-5 text-emerald-600" />
          <h1 className="text-lg font-bold text-gray-900">Mapa de Prospectos</h1>
          <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
            Cádiz · Huelva
          </span>
          <span className="text-xs text-gray-400 ml-1">{filtered.length} prospectos</span>
        </div>

        {geocodeMsg && (
          <span className={`text-xs ${geocoding ? 'text-blue-600' : 'text-gray-500'}`}>
            {geocoding && <RefreshCw className="w-3 h-3 inline mr-1 animate-spin" />}
            {geocodeMsg}
          </span>
        )}
        {jobMessage && (
          <span className="text-xs text-gray-500">{jobMessage}</span>
        )}

        <button
          onClick={handleGeocodeAll}
          disabled={geocoding}
          title="Geocodificar pendientes"
          className={getProspectToolbarButtonClass('slate')}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${geocoding ? 'animate-spin' : ''}`} />
          Geocodificar
        </button>
        <button
          onClick={() => setShowJobsModal(true)}
          className={getProspectToolbarButtonClass('violet')}
        >
          <Clock className="w-3.5 h-3.5" /> Jobs
        </button>
        <button
          onClick={() => setShowAutoCaptureModal(true)}
          className={getProspectToolbarButtonClass('emerald')}
        >
          <Search className="w-3.5 h-3.5" /> Auto captar
        </button>
        <button
          onClick={() => setShowImportModal(true)}
          className={getProspectToolbarButtonClass('blue')}
        >
          <Upload className="w-3.5 h-3.5" /> Importar Excel
        </button>
        <button
          onClick={handleExport}
          className={getProspectToolbarButtonClass('indigo')}
        >
          <Download className="w-3.5 h-3.5" /> Exportar Excel
        </button>
        <button
          onClick={() => { setEditProspect(null); setShowFormModal(true) }}
          className={getProspectToolbarButtonClass('emerald', 'md')}
        >
          <PlusCircle className="w-4 h-4" /> Nuevo prospecto
        </button>
      </div>

      {/* ── Filters bar ── */}
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-2 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar…"
            className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none w-52"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Province */}
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <select
            value={filterProvince}
            onChange={(e) => { setFilterProvince(e.target.value); setFilterCity('') }}
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value="">Todas las provincias</option>
            <option value="Cádiz">Cádiz</option>
            <option value="Huelva">Huelva</option>
          </select>
        </div>

        {/* City */}
        <select
          value={filterCity}
          onChange={(e) => setFilterCity(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
        >
          <option value="">Todas las ciudades</option>
          {availableCities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Active filters */}
        {(filterProvince || filterCity || searchTerm) && (
          <button
            onClick={() => { setFilterProvince(''); setFilterCity(''); setSearchTerm('') }}
            className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Limpiar filtros
          </button>
        )}
      </div>

      {/* ── Main content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <div className="w-80 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {loading || customersLoading ? (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Cargando…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm gap-2">
                <MapPin className="w-8 h-8 opacity-30" />
                <p>No hay prospectos</p>
                <button
                  onClick={() => { setEditProspect(null); setShowFormModal(true) }}
                  className="text-emerald-600 text-xs hover:underline"
                >
                  Añadir el primero
                </button>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {filtered.map((p) => (
                  <ProspectCard
                    key={p.id}
                    prospect={p}
                    selected={selectedId === p.id}
                    onSelect={() => handleSelect(p)}
                    onEdit={() => { setEditProspect(p); setShowFormModal(true) }}
                    onDelete={() => handleDelete(p.id)}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Stats footer */}
          <div className="border-t border-gray-100 px-4 py-2 flex gap-4 text-xs text-gray-500 bg-gray-50">
            <span>
              <span className="font-semibold text-emerald-600">{mappable.length}</span> en mapa
            </span>
            <span>
              <span className="font-semibold text-amber-600">
                {filtered.filter(p => p.geocode_status === 'pending').length}
              </span> pendientes
            </span>
            <span>
              <span className="font-semibold text-red-500">
                {filtered.filter(p => p.duplicate_with_existing_client).length}
              </span> posibles duplicados
            </span>
          </div>
        </div>

        {/* ── Map ── */}
        <div className="flex-1 relative">
          <MapContainer
            center={CADIZ_CENTER}
            zoom={9}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />

            <FlyToMarker coords={flyTo} />

            {mappableCustomers.map((customer) => {
              const coords = getClientRenderableCoordinates(customer)
              if (!coords) return null

              return (
                <Marker
                  key={`customer-${customer.id}`}
                  position={[coords.lat, coords.lng]}
                  icon={createCustomerIcon(customer.geocodeStatus === 'approximate')}
                >
                  <Popup maxWidth={280}>
                    <div className="text-sm space-y-1.5 min-w-[220px]">
                      <div className="font-bold text-gray-900 text-base leading-tight">
                        {customer.company || customer.name}
                      </div>
                      <div className="text-xs font-medium uppercase tracking-wide text-blue-700">
                        Gestión de Clientes
                      </div>
                      {customer.phone && (
                        <div className="flex items-center gap-1.5 text-gray-700">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          <a href={`tel:${customer.phone}`} className="text-blue-600 hover:underline">
                            {customer.phone}
                          </a>
                        </div>
                      )}
                      {customer.address && (
                        <div className="flex items-start gap-1.5 text-gray-600 text-xs">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                          <span>{customer.address}</span>
                        </div>
                      )}
                      {(customer.city || customer.province) && (
                        <div className="text-xs text-gray-500">{[customer.city, customer.province].filter(Boolean).join(', ')}</div>
                      )}
                      {customer.geocodeStatus === 'approximate' && (
                        <div className="flex items-center gap-1 text-amber-600 text-xs">
                          <AlertTriangle className="w-3 h-3" /> Ubicación aproximada. Dirección pendiente de validación.
                        </div>
                      )}
                      <div className="flex gap-2 pt-1.5 border-t border-gray-100">
                        {customer.phone && (
                          <a
                            href={`tel:${customer.phone}`}
                            className={getProspectPopupButtonClass('blue')}
                          >
                            <Phone className="w-3 h-3" /> Llamar
                          </a>
                        )}
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={getProspectPopupButtonClass('indigo')}
                        >
                          <Navigation className="w-3 h-3" /> Navegar
                        </a>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )
            })}

            {mappable.map((p) => (
              <Marker
                key={p.id}
                position={[p.lat!, p.lng!]}
                icon={createProspectIcon(p.geocode_status, selectedId === p.id)}
                eventHandlers={{ click: () => setSelectedId(p.id) }}
              >
                <Popup maxWidth={280}>
                  <div className="text-sm space-y-1.5 min-w-[220px]">
                    <div className="font-bold text-gray-900 text-base leading-tight">{p.business_name}</div>
                    {p.category && (
                      <div className="text-xs text-emerald-700 font-medium uppercase tracking-wide">{p.category}</div>
                    )}
                    {p.geocode_status === 'approximate' && (
                      <div className="flex items-center gap-1 text-amber-600 text-xs">
                        <AlertTriangle className="w-3 h-3" /> Ubicación aproximada
                      </div>
                    )}
                    {p.phone && (
                      <div className="flex items-center gap-1.5 text-gray-700">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        <a href={`tel:${p.phone}`} className="text-blue-600 hover:underline">{p.phone}</a>
                      </div>
                    )}
                    {p.website && (
                      <div className="flex items-center gap-1.5 text-gray-700">
                        <Globe className="w-3.5 h-3.5 text-gray-400" />
                        <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {p.website}
                        </a>
                      </div>
                    )}
                    {p.address && (
                      <div className="flex items-start gap-1.5 text-gray-600 text-xs">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                        <span>{p.address}</span>
                      </div>
                    )}
                    {(p.city || p.province) && (
                      <div className="text-xs text-gray-500">{[p.city, p.province].filter(Boolean).join(', ')}</div>
                    )}
                    {p.source && (
                      <div className="text-xs text-gray-400">Fuente: {p.source}</div>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                      {typeof p.rating === 'number' && <span>⭐ {p.rating.toFixed(1)}</span>}
                      {typeof p.reviews_count === 'number' && <span>{p.reviews_count} reseñas</span>}
                      {typeof p.lead_score === 'number' && (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-700">
                          Lead {p.lead_score}
                        </span>
                      )}
                    </div>
                    {p.duplicate_with_existing_client && (
                      <div className="flex items-center gap-1 text-amber-700 text-xs bg-amber-50 rounded px-2 py-1">
                        <AlertTriangle className="w-3 h-3" /> Posible duplicado con cliente existente
                      </div>
                    )}
                    <div className="flex gap-2 pt-1.5 border-t border-gray-100">
                      {p.phone && (
                        <a
                          href={`tel:${p.phone}`}
                          className={getProspectPopupButtonClass('blue')}
                        >
                          <Phone className="w-3 h-3" /> Llamar
                        </a>
                      )}
                      {p.lat != null && p.lng != null && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={getProspectPopupButtonClass('emerald')}
                        >
                          <Navigation className="w-3 h-3" /> Navegar
                        </a>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Map legend */}
          <div className="absolute bottom-6 right-4 bg-white rounded-lg shadow-md border border-gray-200 p-3 text-xs space-y-1.5 z-[1000]">
            <div className="font-semibold text-gray-600 mb-1">Leyenda</div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-600 border-2 border-white shadow"></span> Gestión de Clientes
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-pink-500 border-2 border-white shadow"></span> Prospectos nuevos
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-pink-50 border-2 border-dashed border-pink-500 shadow"></span> Prospecto aproximado
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-gray-400 border-2 border-gray-300 shadow"></span> Sin coordenadas
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {showFormModal && (
        <ProspectFormModal
          prospect={editProspect}
          customers={customers}
          prospects={prospects}
          onSave={handleSave}
          onClose={() => { setShowFormModal(false); setEditProspect(null) }}
        />
      )}

      {showImportModal && (
        <ImportModal
          customers={customers}
          prospects={prospects}
          onImported={handleImported}
          onClose={() => setShowImportModal(false)}
          userId={profile?.id}
        />
      )}

      {showAutoCaptureModal && (
        <ProspectAutoCaptureModal
          onClose={() => setShowAutoCaptureModal(false)}
          onSubmit={handleAutoCapture}
        />
      )}

      {showJobsModal && (
        <ProspectScrapeJobsModal
          jobs={jobs}
          loading={jobsLoading}
          onClose={() => setShowJobsModal(false)}
          onRefresh={loadJobs}
        />
      )}
    </div>
  )
}

// ─── Prospect sidebar card ────────────────────────────────────────────────────

interface ProspectCardProps {
  prospect: Prospect
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}

function ProspectCard({ prospect: p, selected, onSelect, onEdit, onDelete }: ProspectCardProps) {
  return (
    <li
      onClick={onSelect}
      className={`px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50
        ${selected ? 'bg-emerald-50 border-l-4 border-l-emerald-500' : 'border-l-4 border-l-transparent'}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Business name */}
          <div className="font-semibold text-sm text-gray-900 truncate leading-tight">
            {p.business_name}
          </div>

          {/* Category */}
          {p.category && (
            <div className="text-xs text-emerald-600 font-medium mt-0.5">{p.category}</div>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {typeof p.rating === 'number' && (
              <span className="text-[11px] rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                ⭐ {p.rating.toFixed(1)}
              </span>
            )}
            {typeof p.lead_score === 'number' && (
              <span className="text-[11px] rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700">
                Lead {p.lead_score}
              </span>
            )}
          </div>

          {/* Phone */}
          {p.phone && (
            <div className="flex items-center gap-1 mt-1">
              <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
              <a
                href={`tel:${p.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-blue-600 hover:underline"
              >
                {p.phone}
              </a>
            </div>
          )}

          {/* Address */}
          {p.address && (
            <div className="flex items-start gap-1 mt-0.5">
              <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0 mt-0.5" />
              <span className="text-xs text-gray-500 line-clamp-1">{p.address}</span>
            </div>
          )}

          {p.website && (
            <div className="mt-0.5 flex items-center gap-1">
              <Globe className="h-3 w-3 text-gray-400 flex-shrink-0" />
              <a
                href={p.website}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="truncate text-xs text-blue-600 hover:underline"
              >
                {p.website}
              </a>
            </div>
          )}

          {/* City / province */}
          <div className="text-xs text-gray-400 mt-0.5">
            {[p.city, p.province].filter(Boolean).join(' · ')}
          </div>

          {/* Source */}
          {p.source && (
            <div className="text-xs text-gray-400 italic mt-0.5">Fuente: {p.source}</div>
          )}

          {/* Badges row */}
          <div className="flex flex-wrap gap-1 mt-1.5">
            <GeoBadge status={p.geocode_status ?? 'pending'} />
            {p.duplicate_with_existing_client && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                <AlertTriangle className="w-3 h-3" /> Posible duplicado
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          {p.lat != null && p.lng != null && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Navegar"
              className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
            >
              <Navigation className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onEdit() }}
            title="Editar"
            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            title="Eliminar"
            className="p-1.5 text-red-400 hover:bg-red-50 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </li>
  )
}
