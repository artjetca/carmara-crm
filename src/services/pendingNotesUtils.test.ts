import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildReviewSummary,
  formatMeters,
  isReadyToConfirm,
  nearbySuggestions,
  needsAttention,
  normalizeConfidence,
  previewText,
  sortForReview,
  type ReviewNote,
} from './pendingNotesUtils'

const base: ReviewNote = {
  id: 'n0',
  customer_id: 'c1',
  customer_name: 'Clínica Rosa',
  visit_summary: 'Todo bien',
  raw_transcript: 'lo que dijo el comercial',
  visit_date: '2026-08-04',
  match_confidence: 'high',
  created_at: '2026-08-04T10:00:00Z',
}

const note = (patch: Partial<ReviewNote>): ReviewNote => ({ ...base, ...patch })

test('confidence falls back to none for anything unexpected', () => {
  assert.equal(normalizeConfidence('high'), 'high')
  assert.equal(normalizeConfidence('LOW'), 'low')
  assert.equal(normalizeConfidence('inventado'), 'none')
  assert.equal(normalizeConfidence(null), 'none')
})

test('only a confidently matched note is safe to confirm in bulk', () => {
  assert.equal(isReadyToConfirm(note({ id: 'a' })), true)
  // Medium confidence still deserves a human look.
  assert.equal(isReadyToConfirm(note({ id: 'b', match_confidence: 'medium' })), false)
  // A note with no customer can never be confirmed blindly.
  assert.equal(isReadyToConfirm(note({ id: 'c', customer_id: null })), false)
})

test('unassigned or weak notes are flagged for attention', () => {
  assert.equal(needsAttention(note({ customer_id: null })), true)
  assert.equal(needsAttention(note({ match_confidence: 'low' })), true)
  assert.equal(needsAttention(note({ match_confidence: 'high' })), false)
})

test('notes that block the salesperson are listed first', () => {
  const ordered = sortForReview([
    note({ id: 'sure', match_confidence: 'high' }),
    note({ id: 'unassigned', customer_id: null, match_confidence: 'none' }),
    note({ id: 'weak', match_confidence: 'low' }),
    note({ id: 'probable', match_confidence: 'medium' }),
  ])

  assert.deepEqual(
    ordered.map(item => item.id),
    ['unassigned', 'weak', 'probable', 'sure']
  )
})

test('notes of the same rank keep the newest first', () => {
  const ordered = sortForReview([
    note({ id: 'older', created_at: '2026-08-04T08:00:00Z' }),
    note({ id: 'newer', created_at: '2026-08-04T12:00:00Z' }),
  ])

  assert.deepEqual(
    ordered.map(item => item.id),
    ['newer', 'older']
  )
})

test('the header summarises what is left to do', () => {
  const summary = buildReviewSummary([
    note({ id: 'a', match_confidence: 'high' }),
    note({ id: 'b', match_confidence: 'high' }),
    note({ id: 'c', customer_id: null, match_confidence: 'none' }),
  ])

  assert.equal(summary.total, 3)
  assert.equal(summary.ready, 2)
  assert.equal(summary.attention, 1)
  assert.equal(summary.text, '3 por revisar · 2 listas para confirmar · 1 necesita atención')
})

test('singular wording is used for a single note', () => {
  const summary = buildReviewSummary([note({ id: 'a', match_confidence: 'high' })])
  assert.equal(summary.text, '1 por revisar · 1 lista para confirmar')
})

test('an empty list produces no extra clauses', () => {
  assert.equal(buildReviewSummary([]).text, '0 por revisar')
})

// Two shops in Jerez, ~65 m apart, and one far away in Huelva.
const CUSTOMERS = [
  { id: 'c1', name: 'Clínica Rosa', latitude: 36.6866, longitude: -6.1367 },
  { id: 'c2', name: 'Perfumería Luz', latitude: 36.6871, longitude: -6.1372 },
  { id: 'c3', name: 'Centro Marina', latitude: 37.2614, longitude: -6.9447 },
  { id: 'c4', name: 'Sin coordenadas' },
]

test('nearby customers are suggested closest first', () => {
  const suggestions = nearbySuggestions(
    note({ captured_lat: 36.6866, captured_lng: -6.1367 }),
    CUSTOMERS
  )

  assert.equal(suggestions[0].id, 'c1')
  assert.equal(suggestions[1].id, 'c2')
  // The Huelva shop is 70 km away and must not be offered.
  assert.ok(!suggestions.some(item => item.id === 'c3'))
  // Neither is a customer without coordinates.
  assert.ok(!suggestions.some(item => item.id === 'c4'))
})

test('a note recorded without GPS gets no suggestions', () => {
  assert.deepEqual(nearbySuggestions(note({ captured_lat: null, captured_lng: null }), CUSTOMERS), [])
  assert.deepEqual(nearbySuggestions(note({}), CUSTOMERS), [])
})

test('distances read naturally in metres and kilometres', () => {
  assert.equal(formatMeters(65), '65 m')
  assert.equal(formatMeters(999), '999 m')
  assert.equal(formatMeters(1500), '1.5 km')
})

test('the collapsed preview falls back to the transcript', () => {
  assert.equal(previewText(note({ visit_summary: 'Resumen corto' })), 'Resumen corto')
  // A note the AI could not structure still shows what was said.
  assert.equal(
    previewText(note({ visit_summary: '', raw_transcript: 'lo que dijo' })),
    'lo que dijo'
  )
  assert.equal(previewText(note({ visit_summary: '', raw_transcript: '' })), 'Sin contenido')
})
