// ============================================================
// prospectImportService.ts
// Parses an Excel / CSV file and returns Prospect-ready records.
// Supported column name aliases (case-insensitive, accent-tolerant):
//   businessName / business_name / nombre / empresa / negocio
//   contactName  / contact_name  / contacto
//   phone        / telefono / teléfono / tel
//   address      / direccion / dirección / dir
//   city         / ciudad / municipio / localidad
//   province     / provincia
//   postalCode   / postal_code / cp / codigoPostal / código postal
//   category     / categoria / categoría / tipo
//   source       / fuente / origen
//   website      / web / sitio
//   notes        / notas / observaciones
// ============================================================

import * as XLSX from 'xlsx'
import type { Prospect } from '../lib/supabase'

export interface ImportRow {
  business_name:   string
  contact_name?:   string
  phone?:          string
  address?:        string
  city?:           string
  province?:       string
  postal_code?:    string
  country?:        string
  category?:       string
  source?:         string
  website?:        string
  notes?:          string
  lat?:            number | null
  lng?:            number | null
  geocode_status?: Prospect['geocode_status']
}

export interface ImportResult {
  rows:        ImportRow[]
  errors:      string[]
  totalParsed: number
  valid:       number
  skipped:     number
}

// ─── Column alias map ─────────────────────────────────────────────────────────

const ALIASES: Record<string, keyof ImportRow> = {
  businessname: 'business_name', business_name: 'business_name',
  nombre: 'business_name', empresa: 'business_name', negocio: 'business_name',
  contactname: 'contact_name', contact_name: 'contact_name', contacto: 'contact_name',
  phone: 'phone', telefono: 'phone', tel: 'phone',
  address: 'address', direccion: 'address', dir: 'address',
  city: 'city', ciudad: 'city', municipio: 'city', localidad: 'city',
  province: 'province', provincia: 'province',
  postalcode: 'postal_code', postal_code: 'postal_code', cp: 'postal_code',
  codigopostal: 'postal_code',
  category: 'category', categoria: 'category', tipo: 'category',
  source: 'source', fuente: 'source', origen: 'source',
  website: 'website', web: 'website', sitio: 'website',
  notes: 'notes', notas: 'notes', observaciones: 'notes',
  lat: 'lat', lng: 'lng', lon: 'lng', longitude: 'lng', latitude: 'lat',
}

function normKey(k: string): string {
  return k
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_\-]+/g, '')
}

function normaliseProvince(raw?: string): string | undefined {
  if (!raw) return undefined
  const s = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (s.includes('cadiz') || s.includes('ca') || s === 'ca') return 'Cádiz'
  if (s.includes('huelva') || s === 'hu') return 'Huelva'
  return raw.trim()  // keep original, validation will mark it unsupported
}

function cleanPhone(p?: string): string | undefined {
  if (!p) return undefined
  const digits = String(p).replace(/\D/g, '')
  return digits.length >= 6 ? digits : undefined
}

// ─── Parse file buffer → ImportResult ────────────────────────────────────────

export function parseProspectFile(buffer: ArrayBuffer, fileName: string): ImportResult {
  const errors: string[] = []
  const rows: ImportRow[] = []

  let rawData: unknown[][]
  try {
    const wb = XLSX.read(buffer, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  } catch (e) {
    return {
      rows: [],
      errors: [`Error al leer el archivo: ${(e as Error).message}`],
      totalParsed: 0,
      valid: 0,
      skipped: 0,
    }
  }

  if (rawData.length < 2) {
    return {
      rows: [],
      errors: ['El archivo está vacío o no tiene datos.'],
      totalParsed: 0,
      valid: 0,
      skipped: 0,
    }
  }

  // First row = headers
  const headers = (rawData[0] as string[]).map((h) => normKey(String(h || '')))

  let skipped = 0

  for (let i = 1; i < rawData.length; i++) {
    const rawRow = rawData[i] as string[]
    const mapped: Record<string, string> = {}

    headers.forEach((h, idx) => {
      const field = ALIASES[h]
      if (field) {
        mapped[field] = String(rawRow[idx] ?? '').trim()
      }
    })

    const businessName = mapped['business_name']
    if (!businessName) {
      skipped++
      continue
    }

    const row: ImportRow = {
      business_name:   businessName,
      contact_name:    mapped['contact_name']  || undefined,
      phone:           cleanPhone(mapped['phone']),
      address:         mapped['address']       || undefined,
      city:            mapped['city']          || undefined,
      province:        normaliseProvince(mapped['province']),
      postal_code:     mapped['postal_code']   || undefined,
      country:         mapped['country']       || 'España',
      category:        mapped['category']      || undefined,
      source:          mapped['source']        || 'Excel import',
      website:         mapped['website']       || undefined,
      notes:           mapped['notes']         || undefined,
      lat:             mapped['lat']  ? parseFloat(mapped['lat'])  : null,
      lng:             mapped['lng']  ? parseFloat(mapped['lng'])  : null,
    }

    // Derive geocode_status from lat/lng if provided
    if (row.lat != null && row.lng != null && !isNaN(row.lat) && !isNaN(row.lng)) {
      row.geocode_status = 'valid'
    } else {
      row.lat = null
      row.lng = null
      row.geocode_status = 'pending'
    }

    rows.push(row)
  }

  return {
    rows,
    errors,
    totalParsed: rawData.length - 1,
    valid: rows.length,
    skipped,
  }
}

// ─── Generate a blank import template ────────────────────────────────────────

export function generateImportTemplate(): void {
  const wb = XLSX.utils.book_new()
  const headers = [
    'businessName', 'contactName', 'phone', 'address', 'city',
    'province', 'postalCode', 'category', 'source', 'website', 'notes',
  ]
  const example = [
    'Clínica Estética Sol', 'María García', '956123456',
    'Calle Real 12', 'Cádiz', 'Cádiz', '11001',
    'clínica estética', 'Google Maps', 'www.ejemplo.es',
    'Posible nueva clienta',
  ]
  const ws = XLSX.utils.aoa_to_sheet([headers, example])
  XLSX.utils.book_append_sheet(wb, ws, 'Prospectos')
  XLSX.writeFile(wb, 'plantilla_prospectos.xlsx')
}
