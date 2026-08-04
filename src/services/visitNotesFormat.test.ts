import test from 'node:test'
import assert from 'node:assert/strict'

import {
  EMPTY_STRUCTURED_NOTE,
  buildSavePayload,
  canStartRecording,
  countSelectedDrafts,
  findUncoveredStops,
  formatDuration,
  formatProductsInput,
  hasUnsavedWork,
  isBusyStage,
  normalizePriority,
  normalizeStructured,
  parseProductsInput,
  todayIso,
  toRouteDrafts,
  toRouteStops,
} from './visitNotesFormat'

test('stages with unsaved work are guarded before leaving', () => {
  for (const stage of ['recording', 'paused', 'uploading', 'transcribing', 'structuring', 'review'] as const) {
    assert.equal(hasUnsavedWork(stage), true, `${stage} should warn`)
  }
  for (const stage of ['idle', 'saved', 'error', 'saving'] as const) {
    assert.equal(hasUnsavedWork(stage), false, `${stage} should not warn`)
  }
})

test('recording can only start when nothing is in flight', () => {
  assert.equal(canStartRecording('idle'), true)
  assert.equal(canStartRecording('error'), true)
  assert.equal(canStartRecording('saved'), true)
  assert.equal(canStartRecording('recording'), false)
  assert.equal(canStartRecording('transcribing'), false)
  assert.equal(canStartRecording('review'), false)
})

test('busy stages drive the progress indicator', () => {
  assert.equal(isBusyStage('uploading'), true)
  assert.equal(isBusyStage('transcribing'), true)
  assert.equal(isBusyStage('structuring'), true)
  assert.equal(isBusyStage('saving'), true)
  assert.equal(isBusyStage('recording'), false)
  assert.equal(isBusyStage('review'), false)
})

test('recording timer is formatted as mm:ss', () => {
  assert.equal(formatDuration(0), '00:00')
  assert.equal(formatDuration(9), '00:09')
  assert.equal(formatDuration(75), '01:15')
  assert.equal(formatDuration(605), '10:05')
  assert.equal(formatDuration(-3), '00:00')
  assert.equal(formatDuration(Number.NaN), '00:00')
})

test('product input accepts commas typed in either language', () => {
  assert.deepEqual(parseProductsInput('Green Mask, Serum'), ['Green Mask', 'Serum'])
  assert.deepEqual(parseProductsInput('Green Mask，面膜、精華'), ['Green Mask', '面膜', '精華'])
  assert.deepEqual(parseProductsInput('  '), [])
  assert.deepEqual(parseProductsInput('Uno,,Dos'), ['Uno', 'Dos'])
})

test('products round-trip between the array and the text field', () => {
  const products = ['Green Mask', 'Serum']
  assert.deepEqual(parseProductsInput(formatProductsInput(products)), products)
  assert.equal(formatProductsInput(null), '')
})

test('priority never leaves the allowed set', () => {
  assert.equal(normalizePriority('high'), 'high')
  assert.equal(normalizePriority('LOW'), 'low')
  assert.equal(normalizePriority('whatever'), 'medium')
  assert.equal(normalizePriority(undefined), 'medium')
})

test('todayIso uses the local calendar day, not UTC', () => {
  // 23:30 local on 4 August is still 4 August, even though UTC may be the 5th.
  const lateEvening = new Date(2026, 7, 4, 23, 30, 0)
  assert.equal(todayIso(lateEvening), '2026-08-04')
})

test('normalizeStructured tolerates a missing or malformed payload', () => {
  assert.deepEqual(normalizeStructured(null), EMPTY_STRUCTURED_NOTE)

  const cleaned = normalizeStructured({
    visit_summary: '  Resumen  ',
    interested_products: ['  Green Mask ', ''],
    follow_up_date: '',
    follow_up_priority: 'ALTA' as never,
  })

  assert.equal(cleaned.visit_summary, 'Resumen')
  assert.deepEqual(cleaned.interested_products, ['Green Mask'])
  // An empty string must become null, never today's date.
  assert.equal(cleaned.follow_up_date, null)
  assert.equal(cleaned.follow_up_priority, 'medium')
})

test('save payload carries the idempotency key and only known fields', () => {
  const payload = buildSavePayload({
    ...EMPTY_STRUCTURED_NOTE,
    visit_summary: 'Visita',
    interested_products: ['Green Mask'],
    customer_id: 'cust-1',
    customer_name: 'Clínica Rosa',
    visit_date: '2026-08-04',
    raw_transcript: 'texto original',
    structuring_status: 'ok',
    client_request_id: 'req-123',
  })

  assert.equal(payload.client_request_id, 'req-123')
  assert.equal(payload.raw_transcript, 'texto original')
  assert.equal(payload.customer_id, 'cust-1')
  // salesperson_id is assigned server side from the session, never by the client.
  assert.equal('salesperson_id' in payload, false)
})

test('a repeated save reuses one request id so the server can deduplicate', () => {
  const base = {
    ...EMPTY_STRUCTURED_NOTE,
    visit_summary: 'Visita',
    customer_id: 'cust-1',
    customer_name: 'Clínica Rosa',
    visit_date: '2026-08-04',
    raw_transcript: 'texto',
    structuring_status: 'ok' as const,
    client_request_id: 'req-abc',
  }

  const first = buildSavePayload(base)
  const retry = buildSavePayload(base)

  assert.equal(first.client_request_id, retry.client_request_id)
})

test('a failed AI structuring still keeps the transcript in the payload', () => {
  const payload = buildSavePayload({
    ...EMPTY_STRUCTURED_NOTE,
    customer_id: null,
    customer_name: 'Clínica Rosa',
    visit_date: '2026-08-04',
    raw_transcript: 'lo que dijo el comercial',
    structuring_status: 'manual',
    client_request_id: 'req-1',
  })

  assert.equal(payload.structuring_status, 'manual')
  assert.equal(payload.raw_transcript, 'lo que dijo el comercial')
  assert.equal(payload.visit_summary, '')
})

// -- Whole-route dictation --------------------------------------------------

test('route stops drop entries without an id or a name', () => {
  const stops = toRouteStops([
    { id: 'c1', name: 'Clínica Rosa', city: 'Jerez' },
    { id: '', name: 'Sin id' },
    { id: 'c3', name: '   ' },
    { id: 'c4', name: 'Perfumería Luz' },
  ])

  assert.equal(stops.length, 2)
  assert.deepEqual(
    stops.map(stop => stop.id),
    ['c1', 'c4']
  )
})

test('drafts arrive pre-selected and normalised', () => {
  const drafts = toRouteDrafts([
    {
      customer_id: 'c1',
      customer_name: 'Clínica Rosa',
      visit_summary: '  Todo bien  ',
      interested_products: [' Green Mask ', ''],
      follow_up_priority: 'ALTA' as never,
    },
  ])

  assert.equal(drafts.length, 1)
  assert.equal(drafts[0].selected, true)
  assert.equal(drafts[0].visit_summary, 'Todo bien')
  assert.deepEqual(drafts[0].interested_products, ['Green Mask'])
  assert.equal(drafts[0].follow_up_priority, 'medium')
})

test('drafts without a resolved customer are discarded', () => {
  const drafts = toRouteDrafts([
    { customer_name: 'Sin id', visit_summary: 'algo' },
    { customer_id: 'c2', visit_summary: 'sin nombre' },
    { customer_id: 'c3', customer_name: 'Perfumería Luz', visit_summary: 'ok' },
  ])

  assert.equal(drafts.length, 1)
  assert.equal(drafts[0].customer_id, 'c3')
})

test('only ticked drafts are counted for saving', () => {
  const drafts = toRouteDrafts([
    { customer_id: 'c1', customer_name: 'Uno' },
    { customer_id: 'c2', customer_name: 'Dos' },
  ])

  assert.equal(countSelectedDrafts(drafts), 2)

  drafts[0].selected = false
  assert.equal(countSelectedDrafts(drafts), 1)
})

test('stops the salesperson did not mention are reported back', () => {
  const stops = toRouteStops([
    { id: 'c1', name: 'Clínica Rosa' },
    { id: 'c2', name: 'Perfumería Luz' },
    { id: 'c3', name: 'Centro Marina' },
  ])
  const drafts = toRouteDrafts([{ customer_id: 'c1', customer_name: 'Clínica Rosa' }])

  const uncovered = findUncoveredStops(stops, drafts)
  assert.deepEqual(
    uncovered.map(stop => stop.id),
    ['c2', 'c3']
  )
})

test('no stop is reported missing when every one has a note', () => {
  const stops = toRouteStops([{ id: 'c1', name: 'Clínica Rosa' }])
  const drafts = toRouteDrafts([{ customer_id: 'c1', customer_name: 'Clínica Rosa' }])

  assert.deepEqual(findUncoveredStops(stops, drafts), [])
})
