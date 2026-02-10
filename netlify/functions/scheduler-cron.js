// Netlify Scheduled Function: runs every minute to trigger the email scheduler
// This avoids relying on GitHub and uses our existing Supabase-backed queue

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

exports.handler = async () => {
  try {
    const baseUrl = process.env.URL || 'https://casmara-charo.netlify.app'
    const schedulerUrl = `${baseUrl}/.netlify/functions/email-scheduler`

    const res = await fetch(schedulerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })

    const data = await res.json().catch(() => ({}))

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, status: res.status, data })
    }
  } catch (err) {
    console.error('[scheduler-cron] Error triggering email-scheduler:', err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: err?.message || 'Unknown error' })
    }
  }
}

// Run every minute
exports.config = {
  schedule: '*/1 * * * *'
}
