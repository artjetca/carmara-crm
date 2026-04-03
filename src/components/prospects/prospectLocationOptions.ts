export const PROSPECT_PROVINCES = ['Cádiz', 'Huelva'] as const

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
