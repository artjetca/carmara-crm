import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function checkCityCaseIssues() {
  try {
    console.log('🔍 Checking city case sensitivity issues...\n')

    // 1. 获取所有unique cities from database
    const { data: customers, error: fetchError } = await supabase
      .from('customers')
      .select('id, name, city, province')
      .not('city', 'is', null)

    if (fetchError) {
      console.log('❌ Error fetching customers:', fetchError.message)
      return
    }

    console.log(`📋 Found ${customers.length} customers with city data`)

    // 2. Analyze city formats
    const cityStats = new Map()
    const duplicateCities = new Map()

    customers.forEach(customer => {
      const city = customer.city.trim()
      const cityLower = city.toLowerCase()
      
      if (!cityStats.has(city)) {
        cityStats.set(city, { count: 0, customers: [] })
      }
      cityStats.get(city).count++
      cityStats.get(city).customers.push(customer.name)

      // Check for potential duplicates (same city different case)
      if (!duplicateCities.has(cityLower)) {
        duplicateCities.set(cityLower, new Set())
      }
      duplicateCities.get(cityLower).add(city)
    })

    console.log('\n📊 City Format Analysis:')
    console.log('=' .repeat(50))

    // Show case variations
    let caseIssues = 0
    for (const [cityLower, variations] of duplicateCities.entries()) {
      if (variations.size > 1) {
        caseIssues++
        console.log(`\n⚠️  Case variations for "${cityLower}":`)
        for (const variation of variations) {
          const count = cityStats.get(variation).count
          console.log(`   "${variation}" - ${count} customers`)
        }
      }
    }

    console.log(`\n🔢 Summary:`)
    console.log(`Total unique cities: ${cityStats.size}`)
    console.log(`Cities with case variations: ${caseIssues}`)

    // 3. Check specific problematic cities
    const problemCities = ['MOGUER', 'moguer', 'Moguer', 'TRIGUEROS', 'trigueros', 'Trigueros']
    console.log(`\n🎯 Checking specific cities:`)
    
    for (const city of problemCities) {
      const customers_with_city = customers.filter(c => 
        c.city.toLowerCase() === city.toLowerCase()
      )
      if (customers_with_city.length > 0) {
        console.log(`"${city}": ${customers_with_city.length} customers`)
        customers_with_city.slice(0, 3).forEach(c => 
          console.log(`  - ${c.name} (stored as: "${c.city}")`)
        )
      }
    }

    // 4. Check municipiosByProvince matching
    const municipiosByProvince = {
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
      ]
    }

    console.log(`\n🔍 Checking dropdown vs database matching:`)
    const huelvaCustomers = customers.filter(c => c.province?.toLowerCase() === 'huelva')
    console.log(`Customers with Huelva province: ${huelvaCustomers.length}`)
    
    const huelvaDropdownCities = municipiosByProvince['Huelva']
    const unmatchedCities = new Set()
    
    huelvaCustomers.forEach(customer => {
      const customerCity = customer.city
      const foundMatch = huelvaDropdownCities.find(dropdownCity => 
        dropdownCity.toLowerCase() === customerCity.toLowerCase()
      )
      
      if (!foundMatch) {
        unmatchedCities.add(customerCity)
      }
    })

    if (unmatchedCities.size > 0) {
      console.log(`\n⚠️  Cities in database that don't match dropdown options:`)
      for (const city of unmatchedCities) {
        const count = customers.filter(c => c.city === city).length
        console.log(`   "${city}" - ${count} customers`)
      }
    }

  } catch (error) {
    console.error('❌ Script error:', error)
  }
}

checkCityCaseIssues()
