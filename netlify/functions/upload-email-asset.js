const { createClient } = require('@supabase/supabase-js')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Supabase credentials are not configured' })
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    const { fileName, contentType, base64, userId } = JSON.parse(event.body || '{}')
    if (!base64 || !fileName || !contentType) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Missing fileName, contentType or base64' }) }
    }
    if (!contentType.startsWith('image/')) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Only image uploads are allowed' }) }
    }

    const bucket = process.env.EMAIL_ASSETS_BUCKET || 'email-assets'

    // Attempt to create bucket if it does not exist (idempotent)
    try {
      const { data: buckets } = await supabase.storage.listBuckets()
      const exists = (buckets || []).some(b => b.name === bucket)
      if (!exists) {
        await supabase.storage.createBucket(bucket, { public: false })
      }
    } catch (e) {
      // Best-effort; continue even if listing/creating fails
      console.warn('Bucket ensure warning:', e?.message || e)
    }

    // Build path
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const ts = now.getTime()
    const rand = Math.random().toString(36).slice(2, 10)
    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${userId || 'anon'}/${y}${m}${d}/${ts}-${rand}-${safeName}`

    const buffer = Buffer.from(base64, 'base64')
    const blob = new Blob([buffer], { type: contentType })

    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, blob, {
      contentType,
      upsert: true
    })

    if (uploadError) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: uploadError.message }) }
    }

    // Generate a short CID
    const cid = 'img_' + Math.random().toString(36).slice(2, 10) + '_' + rand
    // Try to create a signed URL for preview in the editor (1 hour)
    let previewUrl = null
    try {
      const { data: signed, error: signedErr } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60)
      if (!signedErr && signed?.signedUrl) previewUrl = signed.signedUrl
    } catch (e) {
      console.warn('Signed URL creation failed:', e?.message || e)
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, bucket, path, cid, contentType, previewUrl })
    }
  } catch (error) {
    console.error('upload-email-asset error:', error)
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: error.message }) }
  }
}
