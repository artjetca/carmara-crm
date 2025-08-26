import { Router, type Request, type Response } from 'express'
import https from 'node:https'
import http from 'node:http'

const router = Router()

// Google Maps API Key (preferred) and Nominatim email (fallback)
const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY
const nominatimEmail = process.env.NOMINATIM_EMAIL || process.env.VITE_NOMINATIM_EMAIL

// POST /api/geocode
// Body: { address: string }
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { address } = req.body as { address?: string }
    if (!address || typeof address !== 'string') {
      res.status(400).json({ success: false, error: 'Missing address' })
      return
    }

    // fetch fallback (Node < 18)
    const doFetch = async (targetUrl: string): Promise<{ ok: boolean; status: number; json: () => Promise<any> }> => {
      const targetUrlObj = new URL(targetUrl)
      if (typeof fetch === 'function') {
        const resp = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Casmara-CRM/1.0 (server-proxy)',
            'Accept': 'application/json',
            'Accept-Language': 'es,en;q=0.9'
          }
        } as any)
        return {
          ok: (resp as any).ok,
          status: (resp as any).status,
          json: () => (resp as any).json()
        }
      }
      // Manual HTTPS request
      return await new Promise((resolve) => {
        const lib = targetUrlObj.protocol === 'http:' ? http : https
        const req2 = lib.request(targetUrl, {
          method: 'GET',
          headers: {
            'User-Agent': 'Casmara-CRM/1.0 (server-proxy)',
            'Accept': 'application/json',
            'Accept-Language': 'es,en;q=0.9'
          }
        }, (resp) => {
          const status = resp.statusCode || 0
          const chunks: Buffer[] = []
          resp.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)))
          resp.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8')
            resolve({
              ok: status >= 200 && status < 300,
              status,
              json: async () => {
                try { return JSON.parse(body) } catch { return null }
              }
            })
          })
        })
        req2.on('error', () => {
          resolve({ ok: false, status: 500, json: async () => null })
        })
        req2.end()
      })
    }

    // Try Google Geocoding first if API key available, fallback to Nominatim
    if (googleApiKey) {
      try {
        const googleUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json')
        googleUrl.searchParams.set('address', address)
        googleUrl.searchParams.set('key', googleApiKey)
        googleUrl.searchParams.set('language', 'es')
        googleUrl.searchParams.set('region', 'es')

        const googleResp = await doFetch(googleUrl.toString())
        if (googleResp.ok) {
          const googleData = await googleResp.json()
          if (googleData?.status === 'OK' && googleData?.results?.[0]?.geometry?.location) {
            const loc = googleData.results[0].geometry.location
            const payload = {
              lat: Number(loc.lat),
              lng: Number(loc.lng),
              display_name: googleData.results[0].formatted_address || address,
            }
            res.json({ success: true, data: payload })
            return
          }
        }
      } catch (error) {
        console.warn('[geocode] Google API failed, trying Nominatim:', error)
      }
    }

    // Fallback to Nominatim
    const url = new URL('https://nominatim.openstreetmap.org/search')
    url.searchParams.set('format', 'json')
    url.searchParams.set('q', address)
    url.searchParams.set('limit', '1')
    if (nominatimEmail) url.searchParams.set('email', nominatimEmail)

    const response = await doFetch(url.toString())

    if (!response.ok) {
      res.status(502).json({ success: false, error: `Upstream error: ${response.status}` })
      return
    }

    const data = await response.json() as any[]
    if (Array.isArray(data) && data[0]?.lat && data[0]?.lon) {
      const payload = {
        lat: Number.parseFloat(data[0].lat),
        lng: Number.parseFloat(data[0].lon),
        display_name: data[0].display_name,
      }
      res.json({ success: true, data: payload })
      return
    }

    res.json({ success: true, data: null })
  } catch (e: any) {
    console.error('[geocode] error:', e)
    res.status(500).json({ success: false, error: e?.message || 'Unexpected server error' })
  }
})

export default router
