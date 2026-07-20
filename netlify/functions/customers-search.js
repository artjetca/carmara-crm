const { createClient } = require('@supabase/supabase-js')

const respond = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify(body),
})

exports.handler = async event => {
  if (event.httpMethod !== 'GET') return respond(405, { success: false, error: 'Método no permitido' })
  const q = String(event.queryStringParameters?.q || '').trim()
  if (q.length < 2) return respond(400, { success: false, error: 'Introduce al menos 2 caracteres.' })

  const client = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
  const params = event.queryStringParameters || {}
  const limit = Math.min(Math.max(Number(params.limit) || 30, 1), 30)
  const { data, error } = await client.rpc('search_customers', {
    search_query: q,
    search_province: params.province || null,
    search_city: params.city || null,
    search_has_coordinates: params.hasCoordinates === undefined ? null : params.hasCoordinates === 'true',
    result_limit: limit,
    result_offset: Math.max(Number(params.page || 0) * limit, 0),
  })
  if (error) return respond(500, { success: false, error: 'No se pudo buscar clientes. Inténtalo de nuevo.' })
  return respond(200, { success: true, data: data || [] })
}
