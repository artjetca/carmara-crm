import test from 'node:test'
import assert from 'node:assert/strict'

import { mapProspectScrapeErrorMessage } from './prospectScrapeService'

test('mapProspectScrapeErrorMessage expands missing key guidance', () => {
  const message = mapProspectScrapeErrorMessage('Google Maps API key not configured')

  assert.match(message, /API key no configurada/i)
  assert.match(message, /GOOGLE_PLACES_API_KEY/)
  assert.match(message, /Netlify/i)
})

test('mapProspectScrapeErrorMessage passes through unrelated errors', () => {
  const message = mapProspectScrapeErrorMessage('Unexpected scrape error')
  assert.equal(message, 'Unexpected scrape error')
})

test('mapProspectScrapeErrorMessage explains missing scrape_jobs table', () => {
  const message = mapProspectScrapeErrorMessage(
    "Could not find the table 'public.scrape_jobs' in the schema cache"
  )

  assert.match(message, /scrape_jobs/i)
  assert.match(message, /schema cache/i)
  assert.match(message, /migration/i)
})

test('mapProspectScrapeErrorMessage explains Google request failures', () => {
  const message = mapProspectScrapeErrorMessage('Google Places request failed: REQUEST_DENIED')

  assert.match(message, /Google Places/i)
  assert.match(message, /REQUEST_DENIED/i)
})

test('mapProspectScrapeErrorMessage explains referer-restricted Google key failures', () => {
  const message = mapProspectScrapeErrorMessage(
    'Google Places request failed. API keys with referer restrictions cannot be used with this API.'
  )

  assert.match(message, /server/i)
  assert.match(message, /GOOGLE_PLACES_API_KEY/i)
})

test('mapProspectScrapeErrorMessage explains scrape_jobs insert failures', () => {
  const message = mapProspectScrapeErrorMessage('scrape_jobs insert failed: null value in column "province"')

  assert.match(message, /job/i)
  assert.match(message, /province/i)
})

test('mapProspectScrapeErrorMessage explains scrape_jobs status constraint failures', () => {
  const message = mapProspectScrapeErrorMessage(
    'scrape_jobs insert failed. new row for relation "scrape_jobs" violates check constraint "scrape_jobs_status_check"'
  )

  assert.match(message, /job/i)
  assert.match(message, /estado/i)
})
