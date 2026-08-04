/**
 * Shared auth/response helpers for the visit-note endpoints.
 *
 * Every endpoint in this feature requires a logged in salesperson, so the
 * token check lives here instead of being copy-pasted per function.
 */

const { createClient } = require('@supabase/supabase-js')
const { isSupervisorRole } = require('./visitNotesCore.cjs')

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Content-Type': 'application/json',
}

function jsonResponse(statusCode, payload, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, ...extraHeaders },
    body: JSON.stringify(payload),
  }
}

function preflightResponse() {
  return { statusCode: 200, headers: CORS_HEADERS, body: '' }
}

function getServiceClient() {
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * Resolve the caller from the Bearer token and load their CRM role.
 * Returns `{ error }` with a ready-to-return response on failure.
 */
async function requireUser(event) {
  if (!supabaseUrl || !serviceRoleKey) {
    return { error: jsonResponse(500, { success: false, error: 'Server not configured' }) }
  }

  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: jsonResponse(401, { success: false, error: 'Authentication required' }) }
  }

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) {
    return { error: jsonResponse(401, { success: false, error: 'Authentication required' }) }
  }

  // Verify against the auth server using the public key; the service client is
  // only used afterwards for data access under our own permission checks.
  const authClient = createClient(supabaseUrl, anonKey || serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await authClient.auth.getUser(token)
  if (error || !data || !data.user) {
    return { error: jsonResponse(401, { success: false, error: 'Invalid or expired session' }) }
  }

  const service = getServiceClient()
  let role = 'vendedor'

  const { data: profile } = await service
    .from('user_profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle()

  if (profile && profile.role) role = profile.role

  return {
    user: data.user,
    role,
    isSupervisor: isSupervisorRole(role),
    supabase: service,
  }
}

module.exports = {
  CORS_HEADERS,
  jsonResponse,
  preflightResponse,
  getServiceClient,
  requireUser,
}
