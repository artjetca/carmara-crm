const crypto = require('crypto')

// Helper to build CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Netlify-Signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

// Timing-safe signature compare
function safeCompare(a, b) {
  try {
    const bufA = Buffer.from(String(a || ''), 'utf8')
    const bufB = Buffer.from(String(b || ''), 'utf8')
    if (bufA.length !== bufB.length) return false
    return crypto.timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders }
  }

  const baseHeaders = { 'Content-Type': 'application/json', ...corsHeaders }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: baseHeaders,
      body: JSON.stringify({ success: false, error: 'Method Not Allowed' })
    }
  }

  const {
    NETLIFY_WEBHOOK_SECRET = '',
    NETLIFY_WEBHOOK_TOKEN = '',
    GITHUB_TOKEN = '',
    GITHUB_REPO = '', // e.g. "artjetca/carmara-crm"
    GITHUB_OWNER = '',
    GITHUB_REPO_NAME = '',
    GH_EVENT_TYPE = 'netlify-deploy-succeeded',
    GH_WORKFLOW_ID = '', // optional: if set, will trigger workflow_dispatch instead
    GH_REF = 'main', // branch/ref for workflow_dispatch
  } = process.env

  if (!GITHUB_TOKEN) {
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ success: false, error: 'Missing GITHUB_TOKEN env' })
    }
  }

  // Parse query for token fallback validation
  const query = new URLSearchParams(event.queryStringParameters || {})
  const tokenFromQuery = query.get('token') || ''

  // Validate Netlify signature if secret is configured
  const webhookSig = (event.headers && (event.headers['x-webhook-signature'] || event.headers['X-Webhook-Signature'])) || ''
  const netlifySig = (event.headers && (event.headers['x-netlify-signature'] || event.headers['X-Netlify-Signature'])) || ''
  const signature = webhookSig || netlifySig
  if (NETLIFY_WEBHOOK_SECRET) {
    if (!signature) {
      return {
        statusCode: 401,
        headers: baseHeaders,
        body: JSON.stringify({ success: false, error: 'Missing Netlify signature' })
      }
    }
    const expectedRaw = crypto
      .createHmac('sha256', NETLIFY_WEBHOOK_SECRET)
      .update(event.body || '', 'utf8')
      .digest('hex')
    const expected = `sha256=${expectedRaw}`
    // Some providers send just the hex, some prefix with "sha256=" — accept both
    const normalizedIncoming = String(signature || '')
    const matches = safeCompare(normalizedIncoming, expected) || safeCompare(normalizedIncoming, expectedRaw)
    if (!matches) {
      return {
        statusCode: 401,
        headers: baseHeaders,
        body: JSON.stringify({ success: false, error: 'Invalid signature' })
      }
    }
  } else if (NETLIFY_WEBHOOK_TOKEN) {
    // Fallback simple token check via query parameter
    if (!tokenFromQuery || !safeCompare(tokenFromQuery, NETLIFY_WEBHOOK_TOKEN)) {
      return {
        statusCode: 401,
        headers: baseHeaders,
        body: JSON.stringify({ success: false, error: 'Unauthorized (token)' })
      }
    }
  }

  // Parse Netlify payload
  let payload = {}
  try {
    payload = event.body ? JSON.parse(event.body) : {}
  } catch (e) {
    return {
      statusCode: 400,
      headers: baseHeaders,
      body: JSON.stringify({ success: false, error: 'Invalid JSON body' })
    }
  }

  const hdrEventRaw = event.headers?.['x-netlify-event'] || event.headers?.['X-Netlify-Event'] || ''
  const netlifyEvent = String(hdrEventRaw || '').toLowerCase()
  const state = String(payload?.state || payload?.deploy_state || '').toLowerCase()
  const isDeploySuccess =
    (netlifyEvent && (netlifyEvent === 'deploy_succeeded' || netlifyEvent === 'deploy_ready')) ||
    state === 'ready' || state === 'success'

  // Only proceed when we are confident it's a successful deploy
  if (!isDeploySuccess) {
    return {
      statusCode: 200,
      headers: baseHeaders,
      body: JSON.stringify({ success: true, message: `Ignored event (${netlifyEvent || 'no-header'} / state=${state || 'n/a'})` })
    }
  }

  // Extract repo owner/name
  let owner = GITHUB_OWNER
  let repo = GITHUB_REPO_NAME
  if ((!owner || !repo) && GITHUB_REPO) {
    const parts = GITHUB_REPO.split('/')
    owner = owner || parts[0]
    repo = repo || parts[1]
  }

  if (!owner || !repo) {
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ success: false, error: 'Missing GITHUB_REPO or GITHUB_OWNER/GITHUB_REPO_NAME' })
    }
  }

  // Prefer repository_dispatch; optionally support workflow_dispatch if GH_WORKFLOW_ID is provided
  const ghHeaders = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json'
  }

  try {
    let ghRes
    if (GH_WORKFLOW_ID) {
      // Trigger a specific workflow that has workflow_dispatch enabled
      ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${GH_WORKFLOW_ID}/dispatches`, {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({
          ref: GH_REF,
          inputs: {
            reason: 'Triggered by Netlify deploy_succeeded',
            deploy_id: payload?.id || '',
            site_id: payload?.site_id || '',
            context: payload?.context || '',
            commit_ref: payload?.commit_ref || ''
          }
        })
      })
      if (!ghRes.ok) {
        const text = await ghRes.text()
        throw new Error(`workflow_dispatch failed: ${ghRes.status} ${text}`)
      }
    } else {
      // Generic repository_dispatch
      ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/dispatches`, {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({
          event_type: GH_EVENT_TYPE,
          client_payload: {
            netlify_event: netlifyEvent || 'deploy_ready',
            deploy_id: payload?.id || '',
            site_id: payload?.site_id || '',
            site_name: payload?.site_name || '',
            state: payload?.state || payload?.deploy_state || '',
            deploy_url: payload?.deploy_url || '',
            deploy_https_url: payload?.deploy_ssl_url || payload?.ssl_url || '',
            commit_ref: payload?.commit_ref || payload?.commit_ref || '',
            branch: payload?.branch || payload?.context || '',
            triggered_at: new Date().toISOString()
          }
        })
      })
      if (!ghRes.ok) {
        const text = await ghRes.text()
        throw new Error(`repository_dispatch failed: ${ghRes.status} ${text}`)
      }
    }

    return {
      statusCode: 200,
      headers: baseHeaders,
      body: JSON.stringify({ success: true, message: 'GitHub dispatch triggered' })
    }
  } catch (e) {
    return {
      statusCode: 500,
      headers: baseHeaders,
      body: JSON.stringify({ success: false, error: e?.message || 'GitHub dispatch failed' })
    }
  }
}
