import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// 标准城市名称 (与下拉选单匹配)
const municipiosByProvince = {
  'Cádiz': [
    'Alcalá de los Gazules', 'Alcalá del Valle', 'Algar', 'Algeciras', 'Algodonales', 'Arcos de la Frontera',
    'Barbate', 'Benalup-Casas Viejas', 'Benaocaz', 'Bornos', 'El Bosque', 'Cádiz', 'Castellar de la Frontera',
    'Chiclana de la Frontera', 'Chipiona', 'Conil de la Frontera', 'Espera', 'El Gastor', 'Grazalema',
    'Jerez de la Frontera', 'Jimena de la Frontera', 'La Línea de la Concepción', 'Los Barrios',
    'Medina-Sidonia', 'Olvera', 'Paterna de Rivera', 'Prado del Rey', 'El Puerto de Santa María',
    'Puerto Real', 'Puerto Serrano', 'Rota', 'San Fernando', 'San José del Valle', 'San Roque',
    'Sanlúcar de Barrameda', 'Setenil de las Bodegas', 'Tarifa', 'Torre Alháquime', 'Trebujena',
    'Ubrique', 'Vejer de la Frontera', 'Villaluenga del Rosario', 'Villamartín', 'Zahara'
  ],
  'Huelva': [
    'Alájar', 'Aljaraque', 'Almendro', 'Almonaster la Real', 'Almonte', 'Alosno', 'Aracena',
    'Aroche', 'Arroyomolinos de León', 'Ayamonte', 'Beas', 'Berrocal', 'Bollullos Par del Condado',
    'Bonares', 'Cabezas Rubias', 'Cala', 'Calañas', 'El Campillo', 'Campofrío', 'Cañaveral de León',
    'Cartaya', 'Castaño del Robledo', 'El Cerro de Andévalo', 'Corteconcepción', 'Cortegana',
    'Cortelazor', 'Cumbres de Enmedio', 'Cumbres de San Bartolomé', 'Cumbres Mayores', 'Encinasola',
    'Escacena del Campo', 'Fuenteheridos', 'Galaroza', 'El Granado', 'La Granada de Río-Tinto',
    'Gibraleón', 'Higuera de la Sierra', 'Hinojales', 'Hinojos', 'Huelva', 'Isla Cristina',
    'Jabugo', 'Lepe', 'Linares de la Sierra', 'Lucena del Puerto', 'Manzanilla', 'Marines',
    'Minas de Riotinto', 'Moguer', 'La Nava', 'Nerva', 'Niebla', 'Palos de la Frontera',
    'La Palma del Condado', 'Paterna del Campo', 'Paymogo', 'Puebla de Guzmán', 'Puerto Moral',
    'Punta Umbría', 'Rociana del Condado', 'Rosal de la Frontera', 'San Bartolomé de la Torre',
    'San Juan del Puerto', 'San Silvestre de Guzmán', 'Sanlúcar de Guadiana', 'Santa Ana la Real',
    'Santa Bárbara de Casa', 'Santa Olalla del Cala', 'Trigueros', 'Valdelarco', 'Valverde del Camino',
    'Villablanca', 'Villalba del Alcor', 'Villanueva de las Cruces', 'Villanueva de los Castillejos',
    'Villarrasa', 'Zalamea la Real', 'Zufre'
  ],
  'Ceuta': ['Ceuta']
}

// 创建所有标准城市名称的映射
const allStandardCities = new Map()
Object.values(municipiosByProvince).flat().forEach(city => {
  allStandardCities.set(city.toLowerCase(), city)
})

async function normalizeCityCase() {
  try {
    console.log('🔧 Normalizing city case to match dropdown options...\n')

    // 1. 获取所有需要修正的客户
    const { data: customers, error: fetchError } = await supabase
      .from('customers')
      .select('id, name, city, province')
      .not('city', 'is', null)

    if (fetchError) {
      console.log('❌ Error fetching customers:', fetchError.message)
      return
    }

    console.log(`📋 Found ${customers.length} customers with city data`)

    let updatedCount = 0
    let errors = 0

    // 2. 检查和修正每个客户的城市名称
    for (const customer of customers) {
      try {
        const currentCity = customer.city.trim()
        const standardCity = allStandardCities.get(currentCity.toLowerCase())

        if (standardCity && standardCity !== currentCity) {
          // Need to update city name
          const { error: updateError } = await supabase
            .from('customers')
            .update({ city: standardCity })
            .eq('id', customer.id)

          if (updateError) {
            console.log(`❌ Error updating ${customer.name}:`, updateError.message)
            errors++
          } else {
            console.log(`✅ Updated: ${customer.name}`)
            console.log(`   "${currentCity}" → "${standardCity}"`)
            updatedCount++
          }
        }
      } catch (error) {
        console.log(`❌ Error processing customer ${customer.name}:`, error.message)
        errors++
      }
    }

    console.log(`\n🎉 City normalization completed!`)
    console.log(`✅ Updated: ${updatedCount} customers`)
    console.log(`❌ Errors: ${errors} customers`)

    // 3. Show remaining unmatched cities
    const unmatchedCities = new Set()
    customers.forEach(customer => {
      const cityLower = customer.city.toLowerCase()
      if (!allStandardCities.has(cityLower)) {
        unmatchedCities.add(customer.city)
      }
    })

    if (unmatchedCities.size > 0) {
      console.log(`\n⚠️  Cities that don't match standard list:`)
      for (const city of unmatchedCities) {
        const count = customers.filter(c => c.city === city).length
        console.log(`   "${city}" - ${count} customers`)
      }
    }

  } catch (error) {
    console.error('❌ Script error:', error)
  }
}

normalizeCityCase()
