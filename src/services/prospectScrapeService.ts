import type { Prospect, ScrapeJob, ScrapeJobItem } from '../lib/supabase'

const BASE = '/.netlify/functions/prospect-scrape'

export type ProspectAutoCaptureConfig = {
  keyExists: boolean
  keySource: string
}

export type ProspectAutoCapturePayload = {
  province: string
  city?: string
  keyword: string
  keywords?: string[] // Batch mode: multiple keywords
  limit: number
  created_by?: string
  mode?: 'single' | 'batch'
}

export type BatchKeywordProgress = {
  currentKeywordIndex: number
  totalKeywords: number
  currentKeyword: string
  processed: number
  total: number
}

export type ProspectScrapeResponse = {
  job: ScrapeJob
  items: ScrapeJobItem[]
  prospects: Prospect[]
  summary?: {
    nuevos_anadidos: number
    omitidos_por_existente_en_clientes: number
    duplicados_internos: number
    errores: number
  }
}

export function mapProspectScrapeErrorMessage(message?: string) {
  if (!message) {
    return 'No se pudo iniciar la captación automática.'
  }

  if (/proveedor de prospectos osm no está habilitado/i.test(message)) {
    return 'La captación automática usa OpenStreetMap/Overpass y está deshabilitada en la configuración del servidor.'
  }

  if (/scrape_jobs/i.test(message) && /schema cache/i.test(message)) {
    return 'La tabla scrape_jobs no está disponible en la schema cache de Supabase. Falta aplicar o refrescar la migration del sistema de captación automática. Revisa la migration de scrape_jobs y vuelve a desplegar.'
  }

  if (/Overpass HTTP/i.test(message)) {
    return `El servicio público de OpenStreetMap no respondió. Puedes volver a intentarlo más tarde. ${message}`
  }

  if (/scrape_jobs insert failed/i.test(message)) {
    if (/scrape_jobs_status_check/i.test(message)) {
      return 'No se pudo crear el job de captación porque el estado del job no coincide con la restricción actual de la base de datos. Actualiza la migration de scrape_jobs o ajusta el estado inicial del job.'
    }
    return `No se pudo crear el job de captación. ${message}`
  }

  if (/scrape_job_items insert failed/i.test(message)) {
    return `No se pudieron guardar los resultados del job. ${message}`
  }

  if (/prospects insert failed/i.test(message)) {
    return `No se pudieron importar los prospectos. ${message}`
  }

  if (/DB connection error/i.test(message)) {
    return `Error de conexión con la base de datos. ${message}`
  }

  return message
}

async function readJsonSafely(response: Response) {
  try {
    return await response.json()
  } catch {
    return { success: false, error: `HTTP ${response.status}` }
  }
}

export async function runProspectAutoCapture(
  payload: ProspectAutoCapturePayload
): Promise<ProspectScrapeResponse> {
  console.info('[Auto captar] starting request', {
    province: payload.province,
    city: payload.city || null,
    keyword: payload.keyword,
    limit: payload.limit,
  })

  const response = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const json = await readJsonSafely(response)
  if (!json.success) {
    throw new Error(mapProspectScrapeErrorMessage(json.error || 'Error running auto capture'))
  }

  return json.data as ProspectScrapeResponse
}

export async function fetchProspectAutoCaptureConfig(): Promise<ProspectAutoCaptureConfig> {
  const response = await fetch(`${BASE}?config=1`)
  const json = await readJsonSafely(response)
  if (!json.success) {
    throw new Error(mapProspectScrapeErrorMessage(json.error || 'Error fetching auto capture config'))
  }

  return (json.data || {
    keyExists: false,
    keySource: 'none',
  }) as ProspectAutoCaptureConfig
}

export async function fetchScrapeJobs(createdBy?: string, jobId?: string) {
  const params = new URLSearchParams()
  if (createdBy) params.set('created_by', createdBy)
  if (jobId) params.set('job_id', jobId)

  const response = await fetch(params.toString() ? `${BASE}?${params}` : BASE)
  const json = await readJsonSafely(response)
  if (!json.success) {
    throw new Error(mapProspectScrapeErrorMessage(json.error || 'Error fetching scrape jobs'))
  }

  return {
    jobs: (json.data || []) as ScrapeJob[],
    items: (json.items || []) as ScrapeJobItem[],
  }
}
