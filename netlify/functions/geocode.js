const https = require('https');
const http = require('http');

const googleApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;
const nominatimEmail = process.env.NOMINATIM_EMAIL || process.env.VITE_NOMINATIM_EMAIL;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

const doFetch = async (targetUrl) => {
  const targetUrlObj = new URL(targetUrl);
  return await new Promise((resolve) => {
    const lib = targetUrlObj.protocol === 'http:' ? http : https;
    const req = lib.request(
      targetUrl,
      {
        method: 'GET',
        headers: {
          'User-Agent': 'Casmara-CRM/1.0 (server-proxy)',
          'Accept': 'application/json',
          'Accept-Language': 'es,en;q=0.9',
        },
      },
      (resp) => {
        const status = resp.statusCode || 0;
        const chunks = [];
        resp.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
        resp.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({
            ok: status >= 200 && status < 300,
            status,
            json: async () => {
              try {
                return JSON.parse(body);
              } catch {
                return null;
              }
            },
          });
        });
      }
    );
    req.on('error', () => {
      resolve({ ok: false, status: 500, json: async () => null });
    });
    req.end();
  });
};

const normalizeNominatimResult = (entry) => {
  if (!entry?.lat || !entry?.lon) return null;
  return {
    lat: Number.parseFloat(entry.lat),
    lng: Number.parseFloat(entry.lon),
    display_name: entry.display_name,
    country: entry.address?.country || '',
    province:
      entry.address?.state ||
      entry.address?.province ||
      entry.address?.county ||
      '',
    city:
      entry.address?.city ||
      entry.address?.town ||
      entry.address?.village ||
      entry.address?.municipality ||
      '',
    type: entry.type || '',
    category: entry.class || '',
    source: 'nominatim',
    raw: entry,
  };
};

const normalizeGoogleResult = (entry) => {
  const location = entry?.geometry?.location;
  if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
    return null;
  }

  const addressComponents = Array.isArray(entry.address_components) ? entry.address_components : [];
  const findComponent = (...types) => {
    const match = addressComponents.find((component) =>
      Array.isArray(component.types) && component.types.some((type) => types.includes(type))
    );
    return match?.long_name || '';
  };

  return {
    lat: Number(location.lat),
    lng: Number(location.lng),
    display_name: entry.formatted_address || '',
    country: findComponent('country'),
    province: findComponent('administrative_area_level_1', 'administrative_area_level_2'),
    city: findComponent('locality', 'postal_town', 'administrative_area_level_3'),
    type: Array.isArray(entry.types) ? entry.types.join(',') : '',
    category: Array.isArray(entry.types) ? entry.types[0] || '' : '',
    source: 'google',
    raw: entry,
  };
};

const respond = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return respond(405, { success: false, error: 'Method not allowed' });
  }

  try {
    const { address } = JSON.parse(event.body || '{}');

    if (!address || typeof address !== 'string') {
      return respond(400, { success: false, error: 'Missing address' });
    }

    const cacheKey = String(address).trim().toLowerCase();
    try {
      const hit = cache.get(cacheKey);
      if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
        return respond(200, {
          success: true,
          data: hit.data,
          results: hit.results,
        });
      }
    } catch {}

    let results = [];

    const nominatimUrl = new URL('https://nominatim.openstreetmap.org/search');
    nominatimUrl.searchParams.set('format', 'json');
    nominatimUrl.searchParams.set('q', address);
    nominatimUrl.searchParams.set('limit', '6');
    nominatimUrl.searchParams.set('addressdetails', '1');
    nominatimUrl.searchParams.set('countrycodes', 'es');
    if (nominatimEmail) nominatimUrl.searchParams.set('email', nominatimEmail);

    const nominatimResp = await doFetch(nominatimUrl.toString());
    if (nominatimResp.ok) {
      const nominatimData = await nominatimResp.json();
      if (Array.isArray(nominatimData)) {
        results = nominatimData.map(normalizeNominatimResult).filter(Boolean);
      }
    }

    if (results.length === 0 && googleApiKey) {
      try {
        const googleUrl = new URL('https://maps.googleapis.com/maps/api/geocode/json');
        googleUrl.searchParams.set('address', address);
        googleUrl.searchParams.set('key', googleApiKey);
        googleUrl.searchParams.set('language', 'es');
        googleUrl.searchParams.set('region', 'es');
        googleUrl.searchParams.set('components', 'country:ES');

        const googleResp = await doFetch(googleUrl.toString());
        if (googleResp.ok) {
          const googleData = await googleResp.json();
          if (googleData?.status === 'OK' && Array.isArray(googleData.results)) {
            results = googleData.results
              .slice(0, 6)
              .map(normalizeGoogleResult)
              .filter(Boolean);
          }
        }
      } catch (error) {
        console.warn('[geocode] Google API fallback failed:', error);
      }
    }

    const first = results[0] || null;
    try {
      cache.set(cacheKey, { ts: Date.now(), data: first, results });
    } catch {}

    return respond(200, {
      success: true,
      data: first,
      results,
    });
  } catch (error) {
    return respond(500, {
      success: false,
      error: error?.message || 'Unexpected server error',
    });
  }
};
