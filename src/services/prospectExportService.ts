// ============================================================
// prospectExportService.ts
// Exports the current prospect list to an XLSX file
// ============================================================

import * as XLSX from 'xlsx'
import type { Prospect } from '../lib/supabase'

export function exportProspectsToExcel(prospects: Prospect[], fileName?: string): void {
  const headers = [
    'ID',
    'Nombre negocio',
    'Contacto',
    'Teléfono',
    'Dirección',
    'Ciudad',
    'Provincia',
    'C.P.',
    'País',
    'Categoría',
    'Fuente',
    'Web',
    'Notas',
    'Lat',
    'Lng',
    'Estado geocodif.',
    'Posible duplicado cliente',
    'Fecha creación',
    'Fecha actualización',
  ]

  const rows = prospects.map((p) => [
    p.id,
    p.business_name,
    p.contact_name ?? '',
    p.phone ?? '',
    p.address ?? '',
    p.city ?? '',
    p.province ?? '',
    p.postal_code ?? '',
    p.country ?? 'España',
    p.category ?? '',
    p.source ?? '',
    p.website ?? '',
    p.notes ?? '',
    p.lat ?? '',
    p.lng ?? '',
    p.geocode_status ?? 'pending',
    p.duplicate_with_existing_client ? 'Sí' : 'No',
    p.created_at ? new Date(p.created_at).toLocaleString('es-ES') : '',
    p.updated_at ? new Date(p.updated_at).toLocaleString('es-ES') : '',
  ])

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

  // Column widths
  ws['!cols'] = [
    { wch: 38 }, { wch: 30 }, { wch: 22 }, { wch: 14 },
    { wch: 35 }, { wch: 20 }, { wch: 12 }, { wch: 8 },
    { wch: 10 }, { wch: 22 }, { wch: 18 }, { wch: 28 },
    { wch: 35 }, { wch: 10 }, { wch: 10 }, { wch: 16 },
    { wch: 24 }, { wch: 20 }, { wch: 20 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Prospectos')

  const date = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, fileName ?? `prospectos_${date}.xlsx`)
}
