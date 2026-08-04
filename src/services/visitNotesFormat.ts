/**
 * Pure helpers for the voice visit-note UI.
 *
 * Kept free of Supabase and browser APIs so the stage machine and field
 * normalisation can be unit tested with plain node:test.
 */

export type VisitNoteStage =
  | 'idle'
  | 'recording'
  | 'paused'
  | 'uploading'
  | 'transcribing'
  | 'structuring'
  | 'review'
  | 'saving'
  | 'saved'
  | 'error'

export const PRIORITIES = ['low', 'medium', 'high'] as const
export type FollowUpPriority = (typeof PRIORITIES)[number]

export interface StructuredVisitNote {
  visit_summary: string
  interested_products: string[]
  customer_feedback: string
  customer_issues: string
  next_action: string
  follow_up_date: string | null
  follow_up_priority: FollowUpPriority
  missing_information: string[]
}

export interface VisitNoteRecord extends StructuredVisitNote {
  id: string
  customer_id: string | null
  customer_name: string
  salesperson_id: string
  visit_date: string
  raw_transcript: string
  structuring_status: 'ok' | 'manual' | 'failed'
  created_at: string
  updated_at: string
}

export const EMPTY_STRUCTURED_NOTE: StructuredVisitNote = {
  visit_summary: '',
  interested_products: [],
  customer_feedback: '',
  customer_issues: '',
  next_action: '',
  follow_up_date: null,
  follow_up_priority: 'medium',
  missing_information: [],
}

/** Stages where leaving the screen would throw away unsaved work. */
export function hasUnsavedWork(stage: VisitNoteStage): boolean {
  return ['recording', 'paused', 'uploading', 'transcribing', 'structuring', 'review'].includes(stage)
}

/** The big record button is only offered when nothing is in flight. */
export function canStartRecording(stage: VisitNoteStage): boolean {
  return stage === 'idle' || stage === 'error' || stage === 'saved'
}

export function isBusyStage(stage: VisitNoteStage): boolean {
  return ['uploading', 'transcribing', 'structuring', 'saving'].includes(stage)
}

export function formatDuration(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function normalizePriority(value: unknown): FollowUpPriority {
  const raw = String(value ?? '').toLowerCase()
  return (PRIORITIES as readonly string[]).includes(raw) ? (raw as FollowUpPriority) : 'medium'
}

export function parseProductsInput(value: string): string[] {
  return String(value ?? '')
    .split(/[,\n;、，]/)
    .map(item => item.trim())
    .filter(Boolean)
}

export function formatProductsInput(products: string[] | null | undefined): string {
  return Array.isArray(products) ? products.join(', ') : ''
}

/** Local (not UTC) calendar date, so a late evening visit keeps today's date. */
export function todayIso(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function normalizeStructured(
  input: Partial<StructuredVisitNote> | null | undefined
): StructuredVisitNote {
  if (!input) return { ...EMPTY_STRUCTURED_NOTE }

  return {
    visit_summary: String(input.visit_summary ?? '').trim(),
    interested_products: Array.isArray(input.interested_products)
      ? input.interested_products.map(item => String(item).trim()).filter(Boolean)
      : [],
    customer_feedback: String(input.customer_feedback ?? '').trim(),
    customer_issues: String(input.customer_issues ?? '').trim(),
    next_action: String(input.next_action ?? '').trim(),
    follow_up_date: input.follow_up_date ? String(input.follow_up_date) : null,
    follow_up_priority: normalizePriority(input.follow_up_priority),
    missing_information: Array.isArray(input.missing_information)
      ? input.missing_information.map(item => String(item))
      : [],
  }
}

export interface SaveVisitNoteInput extends StructuredVisitNote {
  customer_id: string | null
  customer_name: string
  visit_date: string
  raw_transcript: string
  structuring_status: 'ok' | 'manual'
  client_request_id: string
}

export function buildSavePayload(input: SaveVisitNoteInput): Record<string, unknown> {
  return {
    customer_id: input.customer_id,
    customer_name: input.customer_name,
    visit_date: input.visit_date,
    raw_transcript: input.raw_transcript,
    visit_summary: input.visit_summary,
    interested_products: input.interested_products,
    customer_feedback: input.customer_feedback,
    customer_issues: input.customer_issues,
    next_action: input.next_action,
    follow_up_date: input.follow_up_date,
    follow_up_priority: normalizePriority(input.follow_up_priority),
    missing_information: input.missing_information,
    structuring_status: input.structuring_status,
    client_request_id: input.client_request_id,
  }
}
