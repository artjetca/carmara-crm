import test from 'node:test'
import assert from 'node:assert/strict'

import { mapProspectScrapeErrorMessage } from './prospectScrapeService'

test('mapProspectScrapeErrorMessage explains unavailable OSM provider', () => {
  const message = mapProspectScrapeErrorMessage('El proveedor de prospectos OSM no está habilitado.')

  assert.match(message, /OpenStreetMap/i)
  assert.match(message, /deshabilitada/i)
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

test('mapProspectScrapeErrorMessage explains Overpass request failures', () => {
  const message = mapProspectScrapeErrorMessage('Overpass HTTP 429')

  assert.match(message, /OpenStreetMap/i)
  assert.match(message, /429/i)
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
