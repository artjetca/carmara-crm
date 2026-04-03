import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildProspectAutoCaptureQuery,
  getCitiesForProvince,
  getAllProspectCities,
} from './prospectLocationOptions'

test('getCitiesForProvince returns province-specific cities only', () => {
  const cadizCities = getCitiesForProvince('Cádiz')
  const huelvaCities = getCitiesForProvince('Huelva')

  assert.ok(cadizCities.includes('Jerez de la Frontera'))
  assert.ok(!cadizCities.includes('Huelva'))
  assert.ok(huelvaCities.includes('Huelva'))
  assert.ok(!huelvaCities.includes('Cádiz'))
})

test('getAllProspectCities returns a stable deduplicated list', () => {
  const allCities = getAllProspectCities()

  assert.ok(allCities.includes('Jerez de la Frontera'))
  assert.ok(allCities.includes('Huelva'))
  assert.equal(allCities.filter(city => city === 'Huelva').length, 1)
})

test('buildProspectAutoCaptureQuery omits city when it is empty', () => {
  assert.equal(
    buildProspectAutoCaptureQuery({
      keyword: 'estética',
      province: 'Cádiz',
      city: '',
    }),
    'estética Cádiz Spain'
  )

  assert.equal(
    buildProspectAutoCaptureQuery({
      keyword: 'estética',
      province: 'Cádiz',
      city: 'Jerez de la Frontera',
    }),
    'estética Jerez de la Frontera Cádiz Spain'
  )
})
