const test = require('node:test')
const assert = require('node:assert/strict')

const {
  foldText,
  resolveKnownValue,
  validateMapQuery,
  interpretMapQuery,
  normalizeProspectPriority,
  cleanOpeningLine,
  validateProspectRanking,
  rankProspects,
} = require('./aiAssistCore.cjs')

const PROVINCES = ['Cádiz', 'Huelva', 'Ceuta']
const CITIES = ['Jerez de la Frontera', 'Huelva', 'Aljaraque', 'Almonte', 'Cádiz']

test('text folding ignores accents and case', () => {
  assert.equal(foldText('Cádiz'), 'cadiz')
  assert.equal(foldText('  JEREZ  de la   Frontera '), 'jerez de la frontera')
  assert.equal(foldText(null), '')
})

test('a place name only resolves to a value the CRM knows', () => {
  assert.equal(resolveKnownValue('cadiz', PROVINCES), 'Cádiz')
  assert.equal(resolveKnownValue('HUELVA', PROVINCES), 'Huelva')
  assert.equal(resolveKnownValue('jerez', CITIES), 'Jerez de la Frontera')
  // Madrid is not in our service area, so it must not resolve.
  assert.equal(resolveKnownValue('Madrid', PROVINCES), '')
  assert.equal(resolveKnownValue('', PROVINCES), '')
})

test('an ambiguous prefix resolves to nothing rather than guessing', () => {
  const cities = ['Alcalá de los Gazules', 'Alcalá del Valle']
  assert.equal(resolveKnownValue('Alcalá', cities), '')
})

test('a map query keeps only provinces and cities that exist', () => {
  const result = validateMapQuery(
    {
      intent: 'filter',
      province: 'huelva',
      city: 'aljaraque',
      search_terms: 'clinica',
      only_unmapped: false,
      notes: 'Clientes de Aljaraque',
    },
    { provinces: PROVINCES, cities: CITIES }
  )

  assert.equal(result.ok, true)
  assert.equal(result.value.province, 'Huelva')
  assert.equal(result.value.city, 'Aljaraque')
  assert.equal(result.value.search_terms, 'clinica')
})

test('an invented city is dropped instead of filtering the map to nowhere', () => {
  const result = validateMapQuery(
    { intent: 'filter', province: 'Huelva', city: 'Barcelona', notes: '' },
    { provinces: PROVINCES, cities: CITIES }
  )

  assert.equal(result.value.city, '')
  assert.ok(result.errors.includes('unknown-city'))
  // The valid part of the request still works.
  assert.equal(result.value.province, 'Huelva')
})

test('a request that filters nothing is reported as not understood', () => {
  const result = validateMapQuery(
    { intent: 'filter', province: '', city: '', search_terms: '', only_unmapped: false },
    { provinces: PROVINCES, cities: CITIES }
  )

  assert.equal(result.value.intent, 'unknown')
  assert.ok(result.errors.includes('empty-filter'))
})

test('asking for customers without a location sets the unmapped flag', () => {
  const result = validateMapQuery(
    { intent: 'filter', province: 'Huelva', only_unmapped: true, notes: 'Sin ubicación' },
    { provinces: PROVINCES, cities: CITIES }
  )

  assert.equal(result.value.only_unmapped, true)
  assert.equal(result.value.province, 'Huelva')
})

test('a non-object answer is rejected outright', () => {
  assert.equal(validateMapQuery('texto', { provinces: PROVINCES }).value, null)
  assert.equal(validateMapQuery(['a'], { provinces: PROVINCES }).value, null)
  assert.equal(validateMapQuery(null, { provinces: PROVINCES }).value, null)
})

test('map interpretation retries once on invalid JSON', async () => {
  let calls = 0
  const result = await interpretMapQuery(
    async () => {
      calls += 1
      if (calls === 1) return 'no soy JSON'
      return JSON.stringify({ intent: 'filter', city: 'Almonte', notes: 'Clientes de Almonte' })
    },
    { query: 'clientes de almonte', provinces: PROVINCES, cities: CITIES }
  )

  assert.equal(calls, 2)
  assert.equal(result.status, 'ok')
  assert.equal(result.value.city, 'Almonte')
})

test('map interpretation degrades safely after two bad answers', async () => {
  const result = await interpretMapQuery(async () => 'sigue sin ser JSON', {
    query: 'algo raro',
    provinces: PROVINCES,
    cities: CITIES,
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.value.province, '')
  assert.equal(result.value.city, '')
})

// -- Prospect ranking -------------------------------------------------------

const PROSPECTS = [
  { id: 'p1', business_name: 'Centro Estética Aurora', city: 'Huelva', rating: 4.8, reviews_count: 120 },
  { id: 'p2', business_name: 'Peluquería Marisol', city: 'Almonte', rating: 4.1, reviews_count: 30 },
  { id: 'p3', business_name: 'Spa Bahía', city: 'Cádiz', rating: 4.5, reviews_count: 60 },
]

test('prospect priority falls back to medium', () => {
  assert.equal(normalizeProspectPriority('high'), 'high')
  assert.equal(normalizeProspectPriority('alta'), 'high')
  assert.equal(normalizeProspectPriority('baja'), 'low')
  assert.equal(normalizeProspectPriority('urgentísimo'), 'medium')
})

test('an opening line with fill-in markers is dropped, not handed over', () => {
  // Real answer seen in testing: the model left "[tu nombre]" for the
  // salesperson to fill in, which is useless at the customer's door.
  assert.equal(cleanOpeningLine('Hola, soy [tu nombre] de [tu empresa].'), '')
  assert.equal(cleanOpeningLine('Hola, soy {nombre}.'), '')
  assert.equal(cleanOpeningLine('Hola, soy ____.'), '')
  assert.equal(cleanOpeningLine('Hola, soy <empresa>.'), '')

  // A line that is ready to say out loud survives untouched.
  const usable = 'He visto que tienen muy buenas reseñas y quería enseñarles la gama nueva.'
  assert.equal(cleanOpeningLine(usable), usable)
  assert.equal(cleanOpeningLine(null), '')
})

test('placeholder cleaning is applied to the whole ranking', () => {
  const result = validateProspectRanking(
    {
      ranking: [
        {
          business_name: 'Spa Bahía',
          priority: 'high',
          reason: 'Muy valorado',
          opening_line: 'Hola, soy [tu nombre] de [tu empresa].',
        },
      ],
    },
    PROSPECTS
  )

  // The suggestion is still useful; only the unusable script is removed.
  assert.equal(result.value.ranking[0].opening_line, '')
  assert.equal(result.value.ranking[0].reason, 'Muy valorado')
})

test('a ranking is mapped back onto real prospect ids', () => {
  const result = validateProspectRanking(
    {
      ranking: [
        { business_name: 'Centro Estética Aurora', priority: 'high', reason: 'Muy valorado' },
        { business_name: 'spa bahia', priority: 'media', reason: 'Zona buena' },
      ],
      summary: 'Empieza por Aurora',
    },
    PROSPECTS
  )

  assert.equal(result.ok, true)
  assert.equal(result.value.ranking.length, 2)
  assert.equal(result.value.ranking[0].prospect_id, 'p1')
  assert.equal(result.value.ranking[0].priority, 'high')
  // Accent-insensitive match still resolves to the real row.
  assert.equal(result.value.ranking[1].prospect_id, 'p3')
  assert.equal(result.value.ranking[1].priority, 'medium')
})

test('a business that does not exist is never added to the ranking', () => {
  const result = validateProspectRanking(
    {
      ranking: [
        { business_name: 'Peluquería Fantasma', priority: 'high', reason: 'Inventado' },
        { business_name: 'Peluquería Marisol', priority: 'low', reason: 'Pocas reseñas' },
      ],
    },
    PROSPECTS
  )

  assert.equal(result.value.ranking.length, 1)
  assert.equal(result.value.ranking[0].prospect_id, 'p2')
  assert.ok(result.errors.includes('unknown-prospect'))
})

test('the same prospect listed twice appears once', () => {
  const result = validateProspectRanking(
    {
      ranking: [
        { business_name: 'Spa Bahía', priority: 'high', reason: 'Primera' },
        { business_name: 'spa bahia', priority: 'low', reason: 'Repetida' },
      ],
    },
    PROSPECTS
  )

  assert.equal(result.value.ranking.length, 1)
  assert.equal(result.value.ranking[0].reason, 'Primera')
})

test('an empty ranking is treated as a failure', () => {
  const result = validateProspectRanking({ ranking: [] }, PROSPECTS)
  assert.equal(result.ok, false)
})

test('prospect ranking retries once and then reports failure', async () => {
  let calls = 0
  const result = await rankProspects(
    async () => {
      calls += 1
      return 'esto no es JSON'
    },
    { prospects: PROSPECTS }
  )

  assert.equal(calls, 2)
  assert.equal(result.status, 'failed')
  assert.deepEqual(result.ranking, [])
})

test('prospect ranking succeeds on a valid answer', async () => {
  const answer = JSON.stringify({
    ranking: [{ business_name: 'Centro Estética Aurora', priority: 'high', reason: 'Muy valorado', opening_line: 'Hola' }],
    summary: 'Prioriza Aurora',
  })

  const result = await rankProspects(async () => answer, { prospects: PROSPECTS })

  assert.equal(result.status, 'ok')
  assert.equal(result.ranking[0].prospect_id, 'p1')
  assert.equal(result.summary, 'Prioriza Aurora')
})
