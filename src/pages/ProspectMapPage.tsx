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
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Filter,
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

// ─── Map helpers ──────────────────────────────────────────────────────────────

const SPAIN_CENTER: [number, number] = [37.0, -5.9]
const CADIZ_CENTER: [number, number] = [36.52, -6.28]

const municipiosByProvince: Record<string, string[]> = {
  Cádiz: [
    'Alcalá de los Gazules','Alcalá del Valle','Algar','Algeciras','Algodonales',
    'Arcos de la Frontera','Barbate','Benalup-Casas Viejas','Benaocaz','Bornos',
    'El Bosque','Cádiz','Castellar de la Frontera','Chiclana de la Frontera','Chipiona',
    'Conil de la Frontera','Espera','El Gastor','Grazalema','Jerez de la Frontera',
    'Jimena de la Frontera','La Línea de la Concepción','Los Barrios','Medina-Sidonia',
    'Olvera','Paterna de Rivera','Prado del Rey','El Puerto de Santa María','Puerto Real',
    'Puerto Serrano','Rota','San Fernando','San José del Valle','San Roque',
    'Sanlúcar de Barrameda','Setenil de las Bodegas','Tarifa','Torre Alháquime',
    'Trebujena','Ubrique','Vejer de la Frontera','Villaluenga del Rosario','Villamartín','Zahara',
  ],
  Huelva: [
    'Alájar','Aljaraque','Almendro','Almonaster la Real','Almonte','Alosno','Aracena',
    'Aroche','Arroyomolinos de León','Ayamonte','Beas','Berrocal','Bollullos Par del Condado',
    'Bonares','Cabezas Rubias','Cala','Calañas','El Campillo','Campofrío','Cañaveral de León',
    'Cartaya','Castaño del Robledo','El Cerro de Andévalo','Chucena','Corteconcepción','Cortegana',
    'Cortelazor','Cumbres de Enmedio','Cumbres de San Bartolomé','Cumbres Mayores','Encinasola',
    'Escacena del Campo','Fuenteheridos','Galaroza','El Granado','La Granada de Río-Tinto',
    'Gibraleón','Higuera de la Sierra','Hinojales','Hinojos','Huelva','Isla Cristina',
    'Jabugo','Lepe','Linares de la Sierra','Lucena del Puerto','Manzanilla','Marines',
    'Minas de Riotinto','Moguer','La Nava','Nerva','Niebla','Palos de la Frontera',
    'La Palma del Condado','Paterna del Campo','Paymogo','Puebla de Guzmán','Puerto Moral',
    'Punta Umbría','Rociana del Condado','Rosal de la Frontera','San Bartolomé de la Torre',
    'San Juan del Puerto','San Silvestre de Guzmán','Sanlúcar de Guadiana','Santa Ana la Real',
    'Santa Bárbara de Casa','Santa Olalla del Cala','Trigueros','Valdelarco','Valverde del Camino',
    'Villablanca','Villalba del Alcor','Villanueva de las Cruces','Villanueva de los Castillejos',
    'Villarrasa','Zalamea la Real','Zufre',
  ],
}

// ─── Marker icons ──────────────────────────────────────────────────────────────

const createProspectIcon = (status: Prospect['geocode_status'], selected: boolean) => {
  const size = selected ? 22 : 18
  let bg = '#10b981'      // valid   → emerald
  let border = '#ffffff'
  let dash = false

  if (status === 'approximate') { bg = '#f8fafc'; border = '#f59e0b'; dash = true }
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
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
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Upload className="w-4 h-4" /> Seleccionar archivo
            </button>
            <button
              onClick={generateImportTemplate}
              className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
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
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
            Cerrar
          </button>
          <button
            onClick={handleImport}
            disabled={!preview || loading || preview.valid === 0}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {loading ? 'Importando…' : `Importar ${preview?.valid ?? 0} prospectos`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProspectMapPage() {
  const { customers, profile } = useStore()

  // ── State ────────────────────────────────────────────────────────────────────
  const [prospects, setProspects]             = useState<Prospect[]>([])
  const [loading, setLoading]                 = useState(true)
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

  // Geocode batch
  const [geocoding, setGeocoding]             = useState(false)
  const [geocodeMsg, setGeocodeMsg]           = useState('')

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

  // ── Derived cities list ──────────────────────────────────────────────────────
  const availableCities = useMemo<string[]>(() => {
    const base = filterProvince ? (municipiosByProvince[filterProvince] ?? []) : [
      ...municipiosByProvince['Cádiz'],
      ...municipiosByProvince['Huelva'],
    ]
    return base.sort()
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

  // Prospects with valid map coordinates
  const mappable = useMemo(
    () => filtered.filter((p) => p.lat != null && p.lng != null && p.geocode_status !== 'invalid'),
    [filtered]
  )

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

  const selectedProspect = useMemo(
    () => prospects.find((p) => p.id === selectedId) ?? null,
    [prospects, selectedId]
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

        <button
          onClick={handleGeocodeAll}
          disabled={geocoding}
          title="Geocodificar pendientes"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${geocoding ? 'animate-spin' : ''}`} />
          Geocodificar
        </button>
        <button
          onClick={() => setShowImportModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50"
        >
          <Upload className="w-3.5 h-3.5" /> Importar Excel
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <Download className="w-3.5 h-3.5" /> Exportar Excel
        </button>
        <button
          onClick={() => { setEditProspect(null); setShowFormModal(true) }}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
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
            {loading ? (
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
                    {p.duplicate_with_existing_client && (
                      <div className="flex items-center gap-1 text-amber-700 text-xs bg-amber-50 rounded px-2 py-1">
                        <AlertTriangle className="w-3 h-3" /> Posible duplicado con cliente existente
                      </div>
                    )}
                    <div className="flex gap-2 pt-1.5 border-t border-gray-100">
                      {p.phone && (
                        <a
                          href={`tel:${p.phone}`}
                          className="flex items-center gap-1 text-xs text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-md"
                        >
                          <Phone className="w-3 h-3" /> Llamar
                        </a>
                      )}
                      {p.lat != null && p.lng != null && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 rounded-md"
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
              <span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow"></span> Geocodificado
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-white border-2 border-dashed border-amber-400 shadow"></span> Aproximado
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
