import type { Prospect, ScrapeJob, ScrapeJobItem } from '../lib/supabase'

const BASE = '/.netlify/functions/prospect-scrape'

export type ProspectAutoCaptureConfig = {
  keyExists: boolean
  keySource:
    | 'GOOGLE_PLACES_API_KEY'
    | 'GOOGLE_MAPS_SERVER_API_KEY'
    | 'GOOGLE_MAPS_API_KEY'
    | 'VITE_GOOGLE_MAPS_API_KEY'
    | 'none'
}

export type ProspectAutoCapturePayload = {
  province: string
  city?: string
  keyword: string
  limit: number
  created_by?: string
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

  if (/google maps api key not configured/i.test(message)) {
    return 'API key no configurada. Auto captar necesita una server-side key de Google Places. Configura GOOGLE_PLACES_API_KEY o GOOGLE_MAPS_SERVER_API_KEY en Netlify y vuelve a desplegar. 不要使用只有 referer 限制的瀏覽器 key。'
  }

  if (/scrape_jobs/i.test(message) && /schema cache/i.test(message)) {
    return 'La tabla scrape_jobs no está disponible en la schema cache de Supabase. Falta aplicar o refrescar la migration del sistema de captación automática. Revisa la migration de scrape_jobs y vuelve a desplegar.'
  }

  if (/Google Places request failed/i.test(message)) {
    if (/referer restrictions/i.test(message)) {
      return 'Error de Google Places. La key actual tiene restricciones de referer y no puede usarse desde una Netlify Function. Configura una server-side key sin restricciones de referer en GOOGLE_PLACES_API_KEY o GOOGLE_MAPS_SERVER_API_KEY y vuelve a desplegar.'
    }
    return `Error de Google Places. ${message}`
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
