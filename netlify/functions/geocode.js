const https = require('https');
const http = require('http');

const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
const nominatimEmail = process.env.NOMINATIM_EMAIL || process.env.VITE_NOMINATIM_EMAIL;

// Simple in-memory cache (per warm lambda instance)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const cache = new Map(); // key: normalized address -> { ts, data }

const doFetch = async (targetUrl) => {
  const targetUrlObj = new URL(targetUrl);
  return await new Promise((resolve) => {
    const lib = targetUrlObj.protocol === 'http:' ? http : https;
    const req = lib.request(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Casmara-CRM/1.0 (server-proxy)',
        'Accept': 'application/json',
        'Accept-Language': 'es,en;q=0.9'
      }
    }, (resp) => {
      const status = resp.statusCode || 0;
      const chunks = [];
      resp.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
      resp.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({
          ok: status >= 200 && status < 300,
          status,
          json: async () => {
            try { return JSON.parse(body) } catch { return null }
          }
        });
      });
    });
    req.on('error', () => {
      resolve({ ok: false, status: 500, json: async () => null });
    });
    req.end();
  });
};

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };
  }

  try {
    const { address } = JSON.parse(event.body);
    
    if (!address || typeof address !== 'string') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ success: false, error: 'Missing address' })
      };
    }
    // Check cache first
    const cacheKey = String(address).trim().toLowerCase();
    try {
      const hit = cache.get(cacheKey);
      if (hit && (Date.now() - hit.ts) < CACHE_TTL_MS) {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ success: true, data: hit.data })
        };
      }
    } catch {}

    // OSM Nominatim first (free)
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('q', address);
    url.searchParams.set('limit', '1');
    if (nominatimEmail) url.searchParams.set('email', nominatimEmail);

    const response = await doFetch(url.toString());

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data[0]?.lat && data[0]?.lon) {
        const result = {
          lat: Number.parseFloat(data[0].lat),
          lng: Number.parseFloat(data[0].lon),
          display_name: data[0].display_name,
        }
        try { cache.set(cacheKey, { ts: Date.now(), data: result }) } catch {}
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ success: true, data: result })
        };
      }
    }

    // Optional fallback to Google if OSM didn't return a result and key is available
    if (googleApiKey) {
      try {
        const googleUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        googleUrl.searchParams.set('address', address);
        googleUrl.searchParams.set('key', googleApiKey);
        googleUrl.searchParams.set('language', 'es');
        googleUrl.searchParams.set('region', 'es');

        const googleResp = await doFetch(googleUrl.toString());
        if (googleResp.ok) {
          const googleData = await googleResp.json();
          if (googleData?.status === 'OK' && googleData?.results?.[0]?.geometry?.location) {
            const loc = googleData.results[0].geometry.location;
            const result = {
              lat: Number(loc.lat),
              lng: Number(loc.lng),
              display_name: googleData.results[0].formatted_address || address,
            }
            try { cache.set(cacheKey, { ts: Date.now(), data: result }) } catch {}
            return {
              statusCode: 200,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              },
              body: JSON.stringify({ success: true, data: result })
            };
          }
        }
      } catch (error) {
        console.warn('[geocode] Google API fallback failed:', error);
      }
    }

    // No result from providers
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ success: true, data: null })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: false, 
        error: e?.message || 'Unexpected server error' 
      })
    };
  }
};
