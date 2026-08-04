/**
 * Visit notes CRUD.
 *
 *   GET    /api/visit-notes?customer_id=...   list (own notes, or all for supervisors)
 *   GET    /api/visit-notes?id=...            single note
 *   POST   /api/visit-notes                   create (idempotent per client_request_id)
 *   PUT    /api/visit-notes?id=...            update own note
 *   DELETE /api/visit-notes?id=...            delete own note
 *
 * Access rules are enforced here rather than relying on RLS alone, because
 * these handlers use the service role key.
 */

const { jsonResponse, preflightResponse, requireUser } = require('./_shared/visitNotesAuth.cjs')
const {
  validateStructuredNote,
  buildFollowUpTask,
  isValidIsoDate,
  checkRateLimit,
  canReadNote,
  canModifyNote,
  buildListFilter,
} = require('./_shared/visitNotesCore.cjs')

const NOTE_COLUMNS =
  'id, customer_id, customer_name, salesperson_id, visit_date, raw_transcript, visit_summary, ' +
  'interested_products, customer_feedback, customer_issues, next_action, follow_up_date, ' +
  'follow_up_priority, missing_information, structuring_status, created_by, updated_by, ' +
  'created_at, updated_at, review_status, match_method, match_confidence'

const MAX_TRANSCRIPT_CHARS = 8000

function badRequest(message, code) {
  return jsonResponse(400, { success: false, error: message, code })
}

/**
 * Create or update the internal follow-up task attached to a note.
 * Failures here must not roll back the note itself - the visit record is the
 * valuable part, the reminder is a convenience.
 */
async function syncFollowUpTask(supabase, note) {
  try {
    // A draft recorded from the car has not been checked by anyone yet, so we
    // do not create reminders from it. The date is confirmed on review.
    if (note && note.review_status === 'pending_review') return null

    const task = buildFollowUpTask(note)

    if (!task) {
      await supabase.from('sales_follow_up_tasks').delete().eq('visit_note_id', note.id)
      return null
    }

    const { data, error } = await supabase
      .from('sales_follow_up_tasks')
      .upsert({ ...task, updated_at: new Date().toISOString() }, { onConflict: 'visit_note_id' })
      .select('id, due_date, remind_at, priority, status')
      .maybeSingle()

    if (error) {
      console.error('follow-up task sync failed', error.message)
      return null
    }

    return data
  } catch (error) {
    console.error('follow-up task sync error', error && error.message)
    return null
  }
}

async function loadNote(supabase, id) {
  const { data, error } = await supabase
    .from('sales_visit_notes')
    .select(NOTE_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

function actorOf(auth) {
  return { userId: auth.user.id, role: auth.role }
}

exports.handler = async event => {
  if (event.httpMethod === 'OPTIONS') return preflightResponse()

  const auth = await requireUser(event)
  if (auth.error) return auth.error

  const supabase = auth.supabase
  const params = event.queryStringParameters || {}
  const method = event.httpMethod

  try {
    if (method === 'GET') {
      if (params.id) {
        const note = await loadNote(supabase, params.id)
        if (!note) return jsonResponse(404, { success: false, error: 'Nota no encontrada' })
        if (!canReadNote(note, actorOf(auth))) {
          return jsonResponse(403, { success: false, error: 'Sin permiso para ver esta nota' })
        }
        return jsonResponse(200, { success: true, data: note })
      }

      let query = supabase
        .from('sales_visit_notes')
        .select(NOTE_COLUMNS)
        .order('visit_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(Math.min(Number(params.limit) || 50, 200))

      // Salespeople are pinned to their own id whatever the query string says.
      const listFilter = buildListFilter(actorOf(auth), params)
      if (!listFilter) return jsonResponse(403, { success: false, error: 'Sin permiso' })
      for (const [column, value] of Object.entries(listFilter)) {
        query = query.eq(column, value)
      }

      // The review screen asks for the drafts recorded from the car.
      if (params.review_status === 'pending_review' || params.review_status === 'reviewed') {
        query = query.eq('review_status', params.review_status)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)

      return jsonResponse(200, { success: true, data: data || [] })
    }

    if (method === 'POST') {
      const limit = checkRateLimit(`notes-write:${auth.user.id}`, { limit: 30, windowMs: 60000 })
      if (!limit.allowed) {
        return jsonResponse(429, { success: false, error: 'Demasiadas solicitudes.' })
      }

      let body
      try {
        body = JSON.parse(event.body || '{}')
      } catch {
        return badRequest('Invalid JSON body', 'invalid_body')
      }

      const customerName = String(body.customer_name || '').trim()
      const transcript = String(body.raw_transcript || '').trim()

      if (!customerName) return badRequest('Falta el nombre del cliente.', 'missing_customer_name')
      if (!transcript) return badRequest('Falta la transcripción.', 'missing_transcript')
      if (transcript.length > MAX_TRANSCRIPT_CHARS) {
        return badRequest('La transcripción es demasiado larga.', 'transcript_too_large')
      }

      const visitDate = isValidIsoDate(body.visit_date)
        ? body.visit_date
        : new Date().toISOString().slice(0, 10)

      // Re-validate the edited fields: the preview screen is editable, so we
      // cannot trust the client to have kept the schema intact.
      const validated = validateStructuredNote(body, { today: visitDate })
      if (!validated.value) return badRequest('Datos de la nota no válidos.', 'invalid_payload')

      const clientRequestId = String(body.client_request_id || '').trim() || null

      // Idempotency: a repeated save (double tap, retry after timeout) returns
      // the existing row instead of creating a duplicate.
      if (clientRequestId) {
        const { data: existing } = await supabase
          .from('sales_visit_notes')
          .select(NOTE_COLUMNS)
          .eq('salesperson_id', auth.user.id)
          .eq('client_request_id', clientRequestId)
          .maybeSingle()

        if (existing) {
          return jsonResponse(200, { success: true, data: existing, deduplicated: true })
        }
      }

      const now = new Date().toISOString()
      // Notes dictated from the car arrive as drafts; everything confirmed on
      // screen is stored as reviewed.
      const reviewStatus = body.review_status === 'pending_review' ? 'pending_review' : 'reviewed'
      const payload = {
        customer_id: body.customer_id || null,
        customer_name: customerName,
        salesperson_id: auth.user.id,
        visit_date: visitDate,
        raw_transcript: transcript,
        ...validated.value,
        structuring_status: body.structuring_status === 'manual' ? 'manual' : 'ok',
        review_status: reviewStatus,
        match_method: body.match_method || null,
        match_confidence: body.match_confidence || null,
        captured_lat: Number.isFinite(Number(body.captured_lat)) ? Number(body.captured_lat) : null,
        captured_lng: Number.isFinite(Number(body.captured_lng)) ? Number(body.captured_lng) : null,
        client_request_id: clientRequestId,
        created_by: auth.user.id,
        updated_by: auth.user.id,
        created_at: now,
        updated_at: now,
      }

      const { data, error } = await supabase
        .from('sales_visit_notes')
        .insert(payload)
        .select(NOTE_COLUMNS)
        .single()

      if (error) {
        // Unique violation means a concurrent save already stored this note.
        if (error.code === '23505' && clientRequestId) {
          const { data: existing } = await supabase
            .from('sales_visit_notes')
            .select(NOTE_COLUMNS)
            .eq('salesperson_id', auth.user.id)
            .eq('client_request_id', clientRequestId)
            .maybeSingle()

          if (existing) {
            return jsonResponse(200, { success: true, data: existing, deduplicated: true })
          }
        }
        throw new Error(error.message)
      }

      const followUp = await syncFollowUpTask(supabase, data)
      return jsonResponse(201, { success: true, data, follow_up_task: followUp })
    }

    if (method === 'PUT' || method === 'PATCH') {
      if (!params.id) return badRequest('Falta el identificador de la nota.', 'missing_id')

      const existing = await loadNote(supabase, params.id)
      if (!existing) return jsonResponse(404, { success: false, error: 'Nota no encontrada' })

      // Supervisors may read every note but only the author can edit one.
      if (!canModifyNote(existing, actorOf(auth))) {
        return jsonResponse(403, { success: false, error: 'Solo el autor puede modificar la nota' })
      }

      let body
      try {
        body = JSON.parse(event.body || '{}')
      } catch {
        return badRequest('Invalid JSON body', 'invalid_body')
      }

      const visitDate = isValidIsoDate(body.visit_date) ? body.visit_date : existing.visit_date
      const validated = validateStructuredNote({ ...existing, ...body }, { today: visitDate })
      if (!validated.value) return badRequest('Datos de la nota no válidos.', 'invalid_payload')

      const transcript = String(body.raw_transcript ?? existing.raw_transcript).trim()
      if (!transcript) return badRequest('Falta la transcripción.', 'missing_transcript')

      // Confirming a draft is what turns it into a real note and, only then,
      // creates its follow-up reminder.
      const reviewStatus =
        body.review_status === 'reviewed' || body.review_status === 'pending_review'
          ? body.review_status
          : existing.review_status

      const { data, error } = await supabase
        .from('sales_visit_notes')
        .update({
          ...validated.value,
          visit_date: visitDate,
          raw_transcript: transcript,
          customer_name: String(body.customer_name || existing.customer_name).trim(),
          customer_id: body.customer_id !== undefined ? body.customer_id : existing.customer_id,
          review_status: reviewStatus,
          updated_by: auth.user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.id)
        .select(NOTE_COLUMNS)
        .single()

      if (error) throw new Error(error.message)

      const followUp = await syncFollowUpTask(supabase, data)
      return jsonResponse(200, { success: true, data, follow_up_task: followUp })
    }

    if (method === 'DELETE') {
      if (!params.id) return badRequest('Falta el identificador de la nota.', 'missing_id')

      const existing = await loadNote(supabase, params.id)
      if (!existing) return jsonResponse(404, { success: false, error: 'Nota no encontrada' })
      if (!canModifyNote(existing, actorOf(auth))) {
        return jsonResponse(403, { success: false, error: 'Solo el autor puede borrar la nota' })
      }

      const { error } = await supabase.from('sales_visit_notes').delete().eq('id', params.id)
      if (error) throw new Error(error.message)

      return jsonResponse(200, { success: true })
    }

    return jsonResponse(405, { success: false, error: 'Method not allowed' })
  } catch (error) {
    // Never log note content: only the failure itself.
    console.error('visit-notes handler error', error && error.message)
    return jsonResponse(500, { success: false, error: 'Error del servidor. Inténtalo de nuevo.' })
  }
}
