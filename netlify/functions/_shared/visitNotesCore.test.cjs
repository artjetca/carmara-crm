const test = require('node:test')
const assert = require('node:assert/strict')

const {
  isSupervisorRole,
  canReadNote,
  canModifyNote,
  buildListFilter,
  normalizePriority,
  isValidIsoDate,
  extractJson,
  resolveRelativeDate,
  validateStructuredNote,
  structureWithRetry,
  buildRemindAt,
  buildFollowUpTask,
  checkRateLimit,
  resetRateLimits,
  sanitizeForLog,
} = require('./visitNotesCore.cjs')

// 2026-08-04 is a Tuesday; every relative-date case below is anchored to it.
const TUESDAY = '2026-08-04'

test('supervisor roles are recognised, salespeople are not', () => {
  assert.equal(isSupervisorRole('supervisor'), true)
  assert.equal(isSupervisorRole('administrador'), true)
  assert.equal(isSupervisorRole('vendedor'), false)
  assert.equal(isSupervisorRole(undefined), false)
})

test('a salesperson can only read their own notes', () => {
  const own = { id: 'n1', salesperson_id: 'ana' }
  const other = { id: 'n2', salesperson_id: 'luis' }
  const ana = { userId: 'ana', role: 'vendedor' }

  assert.equal(canReadNote(own, ana), true)
  assert.equal(canReadNote(other, ana), false)
})

test('a supervisor can read every note', () => {
  const other = { id: 'n2', salesperson_id: 'luis' }
  const supervisor = { userId: 'charo', role: 'supervisor' }
  const admin = { userId: 'root', role: 'administrador' }

  assert.equal(canReadNote(other, supervisor), true)
  assert.equal(canReadNote(other, admin), true)
})

test('supervisors may read but not rewrite somebody else note', () => {
  const other = { id: 'n2', salesperson_id: 'luis' }
  const supervisor = { userId: 'charo', role: 'supervisor' }

  assert.equal(canReadNote(other, supervisor), true)
  assert.equal(canModifyNote(other, supervisor), false)
  assert.equal(canModifyNote(other, { userId: 'luis', role: 'vendedor' }), true)
})

test('an anonymous caller can neither read nor modify', () => {
  const note = { id: 'n1', salesperson_id: 'ana' }

  assert.equal(canReadNote(note, null), false)
  assert.equal(canReadNote(note, { role: 'supervisor' }), false)
  assert.equal(canModifyNote(note, undefined), false)
  assert.equal(buildListFilter(null), null)
})

test('list filter pins a salesperson to their own notes', () => {
  const ana = { userId: 'ana', role: 'vendedor' }

  // Even when the request asks for another salesperson, the filter stays own.
  const filter = buildListFilter(ana, { salesperson_id: 'luis', customer_id: 'c1' })
  assert.deepEqual(filter, { salesperson_id: 'ana', customer_id: 'c1' })
})

test('list filter lets a supervisor query everyone or one salesperson', () => {
  const supervisor = { userId: 'charo', role: 'supervisor' }

  assert.deepEqual(buildListFilter(supervisor, {}), {})
  assert.deepEqual(buildListFilter(supervisor, { salesperson_id: 'luis' }), {
    salesperson_id: 'luis',
  })
})

test('priority falls back to medium for unknown values', () => {
  assert.equal(normalizePriority('high'), 'high')
  assert.equal(normalizePriority('alta'), 'high')
  assert.equal(normalizePriority('低'), 'low')
  assert.equal(normalizePriority('urgentísimo'), 'medium')
  assert.equal(normalizePriority(null), 'medium')
})

test('ISO date validation rejects impossible calendar dates', () => {
  assert.equal(isValidIsoDate('2026-08-04'), true)
  assert.equal(isValidIsoDate('2026-02-30'), false)
  assert.equal(isValidIsoDate('04/08/2026'), false)
  assert.equal(isValidIsoDate(null), false)
})

test('extractJson survives markdown fences and surrounding prose', () => {
  const fenced = '```json\n{"visit_summary":"ok"}\n```'
  assert.deepEqual(extractJson(fenced), { visit_summary: 'ok' })

  const chatty = 'Claro, aquí tienes:\n{"visit_summary":"ok"}\nEspero que ayude.'
  assert.deepEqual(extractJson(chatty), { visit_summary: 'ok' })

  assert.equal(extractJson('no json at all'), null)
})

test('extractJson handles braces inside strings', () => {
  const tricky = '{"visit_summary":"cliente dijo {muy bien}","next_action":""}'
  assert.deepEqual(extractJson(tricky), {
    visit_summary: 'cliente dijo {muy bien}',
    next_action: '',
  })
})

test('relative dates resolve in Spanish and Chinese', () => {
  assert.equal(resolveRelativeDate('mañana le llamo', TUESDAY), '2026-08-05')
  assert.equal(resolveRelativeDate('明天再聯絡', TUESDAY), '2026-08-05')
  assert.equal(resolveRelativeDate('pasado mañana', TUESDAY), '2026-08-06')
  assert.equal(resolveRelativeDate('hoy mismo', TUESDAY), TUESDAY)
  assert.equal(resolveRelativeDate('en 10 días', TUESDAY), '2026-08-14')
  assert.equal(resolveRelativeDate('3天後回訪', TUESDAY), '2026-08-07')
})

test('weekday references pick the coming occurrence', () => {
  // Tuesday -> this coming Wednesday is the next day.
  assert.equal(resolveRelativeDate('el miércoles paso', TUESDAY), '2026-08-05')
  // Same weekday means a week later, never today.
  assert.equal(resolveRelativeDate('el martes que viene', TUESDAY), '2026-08-11')
})

test('"next week" jumps into the following calendar week', () => {
  // From Tuesday 2026-08-04, next week's Wednesday is 2026-08-12.
  assert.equal(resolveRelativeDate('下星期三再聯絡', TUESDAY), '2026-08-12')
  assert.equal(resolveRelativeDate('la semana que viene el miércoles', TUESDAY), '2026-08-12')
})

test('Spanish attaches "next" to the weekday itself', () => {
  // "el miércoles que viene" means next week's Wednesday, not tomorrow.
  assert.equal(resolveRelativeDate('le llamo el miércoles que viene', TUESDAY), '2026-08-12')
  assert.equal(resolveRelativeDate('le llamo el miercoles que viene', TUESDAY), '2026-08-12')
  assert.equal(resolveRelativeDate('el próximo miércoles', TUESDAY), '2026-08-12')
  assert.equal(resolveRelativeDate('el proximo miercoles', TUESDAY), '2026-08-12')

  // Without the qualifier it is simply the coming Wednesday.
  assert.equal(resolveRelativeDate('le llamo el miércoles', TUESDAY), '2026-08-05')
})

test('a follow-up weekday wins over the "hoy" used to narrate the visit', () => {
  // Transcripts open with "hoy he visitado…" and only later say when to
  // follow up; the follow-up expression must win.
  const spanish = 'Hoy he visitado la clínica. Les llamo el miércoles que viene.'
  assert.equal(resolveRelativeDate(spanish, TUESDAY), '2026-08-12')

  const chinese = '今天拜訪客戶，下星期三再聯絡。'
  assert.equal(resolveRelativeDate(chinese, TUESDAY), '2026-08-12')

  // "Hoy" alone still resolves to today.
  assert.equal(resolveRelativeDate('le llamo hoy mismo', TUESDAY), TUESDAY)
})

test('speech-to-text dropping the tilde still resolves "mañana"', () => {
  assert.equal(resolveRelativeDate('le llamo manana', TUESDAY), '2026-08-05')
  assert.equal(resolveRelativeDate('pasado manana', TUESDAY), '2026-08-06')
})

test('our own date calculation overrides a wrong model date', () => {
  // Real failure seen in testing: the model answered 2026-08-10 (a Monday)
  // for "下星期三". Our deterministic result must win.
  const result = validateStructuredNote(
    { visit_summary: 'Visita', follow_up_date: '2026-08-10' },
    { transcript: '今天拜訪客戶，下星期三再聯絡。', today: TUESDAY }
  )

  assert.equal(result.value.follow_up_date, '2026-08-12')
  assert.ok(result.errors.includes('model-date-overridden'))
})

test('a model date is kept when the transcript has no resolvable expression', () => {
  const result = validateStructuredNote(
    { visit_summary: 'Visita', follow_up_date: '2026-09-01' },
    { transcript: 'Volveré a pasar cuando tengan stock.', today: TUESDAY }
  )

  assert.equal(result.value.follow_up_date, '2026-09-01')
})

test('unparseable dates return null instead of a guess', () => {
  assert.equal(resolveRelativeDate('cuando pueda', TUESDAY), null)
  assert.equal(resolveRelativeDate('', TUESDAY), null)
  assert.equal(resolveRelativeDate('mañana', 'not-a-date'), null)
})

test('schema validation normalises fields and drops unknown keys', () => {
  const result = validateStructuredNote({
    visit_summary: '  Visita correcta  ',
    interested_products: ['Green Mask', '', '  Serum '],
    customer_feedback: 'Contento',
    customer_issues: '',
    next_action: 'Enviar presupuesto',
    follow_up_date: '2026-08-12',
    follow_up_priority: 'HIGH',
    missing_information: [],
    hacked_field: 'ignored',
  })

  assert.equal(result.ok, true)
  assert.equal(result.value.visit_summary, 'Visita correcta')
  assert.deepEqual(result.value.interested_products, ['Green Mask', 'Serum'])
  assert.equal(result.value.follow_up_priority, 'high')
  assert.equal('hacked_field' in result.value, false)
})

test('invalid follow_up_date is nulled and reported', () => {
  const result = validateStructuredNote({
    visit_summary: 'Visita',
    follow_up_date: 'próximo miércoles',
  })

  assert.equal(result.ok, false)
  assert.ok(result.errors.includes('invalid-follow-up-date'))
  assert.equal(result.value.follow_up_date, null)
})

test('follow_up_date is recovered from the transcript when the model omits it', () => {
  const result = validateStructuredNote(
    { visit_summary: 'Visita', next_action: 'Llamar', follow_up_date: null },
    { transcript: '下星期三再聯絡', today: TUESDAY }
  )

  assert.equal(result.value.follow_up_date, '2026-08-12')
})

test('a missing follow-up date is flagged when there is a next action', () => {
  const result = validateStructuredNote({
    visit_summary: 'Visita',
    next_action: 'Enviar presupuesto',
    follow_up_date: null,
  })

  assert.equal(result.value.follow_up_date, null)
  assert.ok(result.value.missing_information.includes('follow_up_date'))
})

test('non-object model output is rejected outright', () => {
  assert.equal(validateStructuredNote('plain text').value, null)
  assert.equal(validateStructuredNote(['array']).value, null)
  assert.equal(validateStructuredNote(null).value, null)
})

test('structureWithRetry accepts a valid first answer', async () => {
  let calls = 0
  const result = await structureWithRetry(
    async () => {
      calls += 1
      return JSON.stringify({ visit_summary: 'Visita correcta', follow_up_priority: 'low' })
    },
    { transcript: 'texto', today: TUESDAY }
  )

  assert.equal(calls, 1)
  assert.equal(result.status, 'ok')
  assert.equal(result.value.visit_summary, 'Visita correcta')
})

test('structureWithRetry retries once when the model returns invalid JSON', async () => {
  let calls = 0
  const result = await structureWithRetry(
    async () => {
      calls += 1
      if (calls === 1) return 'Lo siento, no puedo responder en JSON.'
      return '{"visit_summary":"Segundo intento"}'
    },
    { transcript: 'texto', today: TUESDAY }
  )

  assert.equal(calls, 2)
  assert.equal(result.attempts, 2)
  assert.equal(result.value.visit_summary, 'Segundo intento')
})

test('structureWithRetry gives up gracefully after two invalid answers', async () => {
  let calls = 0
  const result = await structureWithRetry(
    async () => {
      calls += 1
      return 'todavía no es JSON'
    },
    { transcript: 'texto', today: TUESDAY }
  )

  assert.equal(calls, 2)
  assert.equal(result.status, 'manual')
  // The caller keeps the transcript and fills the fields by hand.
  assert.equal(result.value.visit_summary, '')
  assert.ok(result.value.missing_information.includes('ai_structuring_failed'))
})

test('structureWithRetry survives a thrown LLM error', async () => {
  const result = await structureWithRetry(
    async () => {
      throw new Error('network down')
    },
    { transcript: 'texto', today: TUESDAY }
  )

  assert.equal(result.status, 'manual')
  assert.ok(result.errors.some(item => item.includes('network down')))
})

test('reminder defaults to 09:00 Madrid time', () => {
  // August is CEST (UTC+2), so 09:00 local is 07:00 UTC.
  assert.equal(buildRemindAt('2026-08-12'), '2026-08-12T07:00:00.000Z')
  // January is CET (UTC+1), so 09:00 local is 08:00 UTC.
  assert.equal(buildRemindAt('2026-01-12'), '2026-01-12T08:00:00.000Z')
  assert.equal(buildRemindAt('nope'), null)
})

test('follow-up task is only built when there is a valid date', () => {
  const task = buildFollowUpTask({
    id: 'note-1',
    customer_id: 'cust-1',
    customer_name: 'Clínica Rosa',
    salesperson_id: 'user-1',
    next_action: 'Enviar presupuesto',
    follow_up_date: '2026-08-12',
    follow_up_priority: 'high',
  })

  assert.equal(task.due_date, '2026-08-12')
  assert.equal(task.priority, 'high')
  assert.equal(task.status, 'pending')
  assert.equal(task.visit_note_id, 'note-1')

  assert.equal(buildFollowUpTask({ follow_up_date: null }), null)
  assert.equal(buildFollowUpTask(null), null)
})

test('rate limit blocks once the window is full and recovers afterwards', () => {
  resetRateLimits()
  const options = { limit: 2, windowMs: 1000, now: 1000 }

  assert.equal(checkRateLimit('user-1', options).allowed, true)
  assert.equal(checkRateLimit('user-1', options).allowed, true)
  assert.equal(checkRateLimit('user-1', options).allowed, false)

  // A different user has their own bucket.
  assert.equal(checkRateLimit('user-2', options).allowed, true)

  // Once the window has passed the first user is allowed again.
  assert.equal(checkRateLimit('user-1', { ...options, now: 2500 }).allowed, true)
  resetRateLimits()
})

test('log sanitiser never leaks note content', () => {
  const note = 'Cliente muy interesado en Green Mask'
  const logged = sanitizeForLog(note)

  assert.equal(logged, `<${note.length} chars>`)
  assert.ok(!logged.includes('Green Mask'))
  assert.equal(sanitizeForLog(''), '<empty>')
  assert.equal(sanitizeForLog(undefined), '<empty>')
})
