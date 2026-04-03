// ============================================================
// Netlify Function: /api/prospects
// CRUD for the prospects table (Cádiz / Huelva only)
// ============================================================

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://aotpcnwjjpkzxnhvmcvb.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

const respond = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  body: JSON.stringify(body),
});

const ALLOWED_PROVINCES = ['Cádiz', 'Huelva'];

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(event.httpMethod)) {
    return respond(405, { success: false, error: 'Method not allowed' });
  }

  if (!serviceRoleKey) {
    return respond(500, { success: false, error: 'Server missing service role key' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // ─── GET: list all prospects (with optional filters) ─────────────────────
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      let query = admin.from('prospects').select('*').order('business_name');

      if (params.province && ALLOWED_PROVINCES.includes(params.province)) {
        query = query.eq('province', params.province);
      }
      if (params.city) {
        query = query.ilike('city', `%${params.city}%`);
      }
      if (params.geocode_status) {
        query = query.eq('geocode_status', params.geocode_status);
      }
      if (params.search) {
        query = query.or(
          `business_name.ilike.%${params.search}%,phone.ilike.%${params.search}%,address.ilike.%${params.search}%`
        );
      }

      const { data, error } = await query;
      if (error) return respond(500, { success: false, error: error.message });
      return respond(200, { success: true, data });
    }

    // ─── POST: create one or many prospects ──────────────────────────────────
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const records = Array.isArray(body) ? body : [body];

      const valid = [];
      const skipped = [];

      for (const raw of records) {
        const province = normalizeProvince(raw.province);
        if (!province) {
          skipped.push({ ...raw, _reason: 'unsupported_province' });
          continue;
        }
        if (!raw.business_name || String(raw.business_name).trim() === '') {
          skipped.push({ ...raw, _reason: 'missing_business_name' });
          continue;
        }
        valid.push(buildRecord(raw, province));
      }

      if (valid.length === 0) {
        return respond(200, {
          success: true,
          data: [],
          skipped,
          inserted: 0,
          skippedCount: skipped.length,
        });
      }

      const { data, error } = await admin
        .from('prospects')
        .insert(valid)
        .select();

      if (error) return respond(500, { success: false, error: error.message });

      return respond(201, {
        success: true,
        data,
        skipped,
        inserted: data.length,
        skippedCount: skipped.length,
      });
    }

    // ─── PUT: full update ─────────────────────────────────────────────────────
    if (event.httpMethod === 'PUT') {
      const { id, ...updates } = JSON.parse(event.body || '{}');
      if (!id) return respond(400, { success: false, error: 'Missing id' });

      if (updates.province) {
        const province = normalizeProvince(updates.province);
        if (!province) {
          return respond(400, { success: false, error: 'Unsupported province. Only Cádiz / Huelva.' });
        }
        updates.province = province;
      }

      const { data, error } = await admin
        .from('prospects')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) return respond(500, { success: false, error: error.message });
      return respond(200, { success: true, data });
    }

    // ─── PATCH: partial update (e.g. geocode result) ──────────────────────────
    if (event.httpMethod === 'PATCH') {
      const { id, ...updates } = JSON.parse(event.body || '{}');
      if (!id) return respond(400, { success: false, error: 'Missing id' });

      const { data, error } = await admin
        .from('prospects')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) return respond(500, { success: false, error: error.message });
      return respond(200, { success: true, data });
    }

    // ─── DELETE ───────────────────────────────────────────────────────────────
    if (event.httpMethod === 'DELETE') {
      const params = event.queryStringParameters || {};
      const id = params.id;
      if (!id) return respond(400, { success: false, error: 'Missing id' });

      const { error } = await admin.from('prospects').delete().eq('id', id);
      if (error) return respond(500, { success: false, error: error.message });
      return respond(200, { success: true });
    }
  } catch (err) {
    return respond(500, { success: false, error: err?.message || 'Unexpected error' });
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeProvince(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (s.includes('c') && s.includes('diz')) return 'Cádiz';   // cadiz / cádiz
  if (s.includes('huelva')) return 'Huelva';
  if (s === 'ca') return 'Cádiz';
  if (s === 'hu') return 'Huelva';
  return null;
}

function buildRecord(raw, province) {
  return {
    business_name:   String(raw.business_name || raw.businessName || '').trim(),
    contact_name:    raw.contact_name    || raw.contactName    || null,
    phone:           raw.phone           || null,
    address:         raw.address         || null,
    city:            raw.city            || null,
    province,
    postal_code:     raw.postal_code     || raw.postalCode     || null,
    country:         raw.country         || 'España',
    category:        raw.category        || null,
    source:          raw.source          || 'manual',
    website:         raw.website         || null,
    instagram:       raw.instagram       || null,
    notes:           raw.notes           || null,
    lat:             raw.lat != null ? Number(raw.lat) : null,
    lng:             raw.lng != null ? Number(raw.lng) : null,
    rating:          raw.rating != null ? Number(raw.rating) : null,
    reviews_count:   raw.reviews_count != null ? Number(raw.reviews_count) : null,
    status:          raw.status          || null,
    interest:        raw.interest        || null,
    lead_score:      raw.lead_score != null ? Number(raw.lead_score) : 0,
    place_id:        raw.place_id        || null,
    hash_dedupe:     raw.hash_dedupe     || null,
    geocode_status:
      raw.lat != null && raw.lng != null
        ? (raw.geocode_status || 'valid')
        : 'pending',
    duplicate_with_existing_client: raw.duplicate_with_existing_client || false,
    created_by:      raw.created_by      || null,
  };
}
