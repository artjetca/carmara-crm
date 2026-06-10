export const PROSPECT_PROVINCES = ['Cádiz', 'Huelva', 'Ceuta'] as const

export type ProspectProvince = (typeof PROSPECT_PROVINCES)[number]

export const MUNICIPIOS_BY_PROVINCE: Record<string, string[]> = {
  Cádiz: [
    'Alcalá de los Gazules','Alcalá del Valle','Algar','Algeciras','Algodonales',
    'Arcos de la Frontera','Barbate','Benalup-Casas Viejas','Benaocaz','Bornos',
    'El Bosque','Cádiz','Castellar de la Frontera','Chiclana de la Frontera','Chipiona',
    'Conil de la Frontera','Espera','El Gastor','Grazalema','Jerez de la Frontera',
    'Jimena de la Frontera','La Línea de la Concepción','Los Barrios','Medina-Sidonia',
    'Olvera','Paterna de Rivera','Prado del Rey','El Puerto de Santa María','Puerto Real',
    'Puerto Serrano','Rota','San Fernando','San José del Valle','San Roque',
    'Sanlúcar de Barrameda','Setenil de las Bodegas','Tarifa','Torre Alháquime',
    'Trebujena','Ubrique','Vejer de la Frontera','Villaluenga del Rosario','Villamartín','Zahara',
  ],
  Huelva: [
    'Alájar','Aljaraque','Almendro','Almonaster la Real','Almonte','Alosno','Aracena',
    'Aroche','Arroyomolinos de León','Ayamonte','Beas','Berrocal','Bollullos Par del Condado',
    'Bonares','Cabezas Rubias','Cala','Calañas','El Campillo','Campofrío','Cañaveral de León',
    'Cartaya','Castaño del Robledo','El Cerro de Andévalo','Chucena','Corteconcepción','Cortegana',
    'Cortelazor','Cumbres de Enmedio','Cumbres de San Bartolomé','Cumbres Mayores','Encinasola',
    'Escacena del Campo','Fuenteheridos','Galaroza','El Granado','La Granada de Río-Tinto',
    'Gibraleón','Higuera de la Sierra','Hinojales','Hinojos','Huelva','Isla Cristina',
    'Jabugo','Lepe','Linares de la Sierra','Lucena del Puerto','Manzanilla','Marines',
    'Minas de Riotinto','Moguer','La Nava','Nerva','Niebla','Palos de la Frontera',
    'La Palma del Condado','Paterna del Campo','Paymogo','Puebla de Guzmán','Puerto Moral',
    'Punta Umbría','Rociana del Condado','Rosal de la Frontera','San Bartolomé de la Torre',
    'San Juan del Puerto','San Silvestre de Guzmán','Sanlúcar de Guadiana','Santa Ana la Real',
    'Santa Bárbara de Casa','Santa Olalla del Cala','Trigueros','Valdelarco','Valverde del Camino',
    'Villablanca','Villalba del Alcor','Villanueva de las Cruces','Villanueva de los Castillejos',
    'Villarrasa','Zalamea la Real','Zufre',
  ],
  Ceuta: [
    'Ceuta', // Ceuta is a single autonomous city with no municipalities
  ],
}

export function getCitiesForProvince(province?: string) {
  if (!province) return []

  return [...(MUNICIPIOS_BY_PROVINCE[province] || [])].sort((left, right) =>
    left.localeCompare(right, 'es')
  )
}

export function getAllProspectCities() {
  return Array.from(
    new Set(Object.values(MUNICIPIOS_BY_PROVINCE).flat())
  ).sort((left, right) => left.localeCompare(right, 'es'))
}

export function getAllProspectProvinces() {
  return [...PROSPECT_PROVINCES]
}

export function buildProspectAutoCaptureQuery(input: {
  keyword: string
  province: string
  city?: string
}) {
  return [input.keyword.trim() || 'estética', input.city?.trim(), input.province, 'Spain']
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Keyword Presets for Auto Captar ─────────────────────────────────────────

export const KEYWORD_PRESETS = [
  'estética',
  'centro de estética',
  'estética avanzada',
  'medicina estética',
  'clínica estética',
  'centro médico estético',
  'depilación láser',
  'micropigmentación',
  'salón de belleza',
  'belleza',
  'uñas',
  'manicura',
  'pedicura',
  'nail salon',
  'maquillaje',
  'spa',
  'masajes',
  'quiromasaje',
  'tratamiento facial',
  'cosmética',
  'cejas',
  'pestañas',
  'maderoterapia',
  'presoterapia',
  'cavitación',
  'radiofrecuencia estética',
] as const

export type KeywordPreset = (typeof KEYWORD_PRESETS)[number]

export interface KeywordPresetGroup {
  id: string
  name: string
  description: string
  keywords: KeywordPreset[]
}

export const KEYWORD_PRESET_GROUPS: KeywordPresetGroup[] = [
  {
    id: 'estetica-general',
    name: 'Estética general',
    description: 'Búsqueda amplia de centros de estética',
    keywords: ['estética', 'centro de estética', 'estética avanzada', 'salón de belleza'],
  },
  {
    id: 'medicina-estetica',
    name: 'Medicina estética',
    description: 'Clínicas y centros médicos estéticos',
    keywords: ['medicina estética', 'clínica estética', 'centro médico estético'],
  },
  {
    id: 'unas-manicura',
    name: 'Uñas y manicura',
    description: 'Salones de uñas y servicios de manicura/pedicura',
    keywords: ['uñas', 'manicura', 'pedicura', 'nail salon'],
  },
  {
    id: 'spa-bienestar',
    name: 'Spa y bienestar',
    description: 'Spas, masajes y tratamientos de relajación',
    keywords: ['spa', 'masajes', 'quiromasaje', 'tratamiento facial'],
  },
  {
    id: 'tratamientos-especificos',
    name: 'Tratamientos específicos',
    description: 'Tratamientos corporales y faciales específicos',
    keywords: ['depilación láser', 'micropigmentación', 'maderoterapia', 'presoterapia', 'cavitación', 'radiofrecuencia estética'],
  },
  {
    id: 'belleza-completa',
    name: 'Belleza completa',
    description: 'Maquillaje, cejas, pestañas y cosmética',
    keywords: ['maquillaje', 'cejas', 'pestañas', 'cosmética', 'belleza'],
  },
]
