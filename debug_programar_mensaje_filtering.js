import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Helper functions from Communications.tsx
const isProvinceName = (v) => /^(huelva|c(a|á)diz)$/i.test(String(v || '').trim())

const extractFromNotes = (notes, key) => {
  if (!notes) return ''
  const m = notes.match(new RegExp(`${key}:\\s*([^\\n|]+)`, 'i'))
  return m ? m[1].trim() : ''
}

const normalizeProvince = (val) => {
  const s = String(val || '').trim().toLowerCase()
  if (s === 'cadiz' || s === 'cádiz') return 'Cádiz'
  if (s === 'huelva') return 'Huelva'
  return val?.trim() || ''
}

const municipiosByProvince = {
  'Cádiz': ['Cádiz', 'Jerez de la Frontera', 'Algeciras', 'San Fernando', 'El Puerto de Santa María', 'Chiclana de la Frontera', 'Sanlúcar de Barrameda', 'La Línea de la Concepción', 'Puerto Real', 'Barbate'],
  'Huelva': ['Huelva', 'Lepe', 'Almonte', 'Moguer', 'Ayamonte', 'Isla Cristina', 'Valverde del Camino', 'Cartaya', 'Palos de la Frontera', 'Bollullos Par del Condado']
}

const deriveProvince = (c) => {
  const p = String(c.province || '').trim()
  if (p) return normalizeProvince(p)
  const fromNotes = extractFromNotes(c.notes, 'Provincia')
  if (fromNotes) return normalizeProvince(fromNotes)
  const city = String(c.city || '').trim()
  // City equals province
  if (/^huelva$/i.test(city)) return 'Huelva'
  if (/^c(a|á)diz$/i.test(city)) return 'Cádiz'
  // Infer province by municipality membership
  if (municipiosByProvince['Huelva']?.some(m => m.toLowerCase() === city.toLowerCase())) return 'Huelva'
  if (municipiosByProvince['Cádiz']?.some(m => m.toLowerCase() === city.toLowerCase())) return 'Cádiz'
  return ''
}

const deriveCity = (c) => {
  const fromNotes = extractFromNotes(c.notes, 'Ciudad')
  if (fromNotes) return fromNotes
  const city = String(c.city || '').trim()
  if (city) return city
  return ''
}

// Helper functions from other pages (Maps.tsx, Customers.tsx)
const displayProvince = (c) => {
  if (!c) return ''
  try {
    if (c.province && String(c.province).trim().length > 0) {
      const can = toCanonicalProvince(c.province)
      if (can) return can
    }
    if (c.notes) {
      const m = c.notes.match(/Provincia:\s*([^\n]+)/i)
      if (m) {
        const can = toCanonicalProvince(m[1])
        if (can) return can
      }
    }
    if (c.city && isProvinceName(c.city)) {
      const can = toCanonicalProvince(c.city)
      if (can) return can
    }
    return ''
  } catch (error) {
    console.error('[DISPLAY_PROVINCE] Error processing customer:', c, error)
    return ''
  }
}

const toCanonicalProvince = (val) => {
  const s = String(val || '').trim().toLowerCase()
  if (s === 'huelva') return 'Huelva'
  if (s === 'cadiz' || s === 'cádiz') return 'Cádiz'
  return ''
}

const displayCity = (c) => {
  if (!c) return ''
  try {
    const fromNotes = extractCityForDisplay(c.notes)
    if (fromNotes) return fromNotes
    const city = String(c.city || '').trim()
    if (city && !isProvinceName(city)) return city
    return ''
  } catch (error) {
    console.error('[DISPLAY_CITY] Error processing customer:', c, error)
    return ''
  }
}

const extractCityForDisplay = (notes) => {
  if (!notes) return ''
  const m = notes.match(/Ciudad:\s*([^\n]+)/i)
  return m ? m[1].trim() : ''
}

async function debugProgramarMensajeFiltering() {
  try {
    console.log('🔍 Debugging Programar Mensaje filtering logic...\n')

    // Fetch customers directly from Supabase
    const { data: customers, error } = await supabase
      .from('customers')
      .select('*')
      .order('name')

    if (error) {
      throw new Error(`Supabase error: ${error.message}`)
    }
    console.log(`📊 Total customers: ${customers.length}\n`)

    // Test both filtering approaches
    console.log('=== COMPARISON: Communications.tsx vs Other Pages ===\n')

    customers.slice(0, 10).forEach((customer, index) => {
      console.log(`Customer ${index + 1}: ${customer.name}`)
      console.log(`  Raw data: province="${customer.province}", city="${customer.city}"`)
      console.log(`  Notes: ${customer.notes?.substring(0, 100)}...`)
      
      // Communications.tsx approach
      const commProvince = deriveProvince(customer)
      const commCity = deriveCity(customer)
      
      // Other pages approach
      const otherProvince = displayProvince(customer)
      const otherCity = displayCity(customer)
      
      console.log(`  Communications.tsx: Province="${commProvince}", City="${commCity}"`)
      console.log(`  Other pages: Province="${otherProvince}", City="${otherCity}"`)
      
      if (commProvince !== otherProvince || commCity !== otherCity) {
        console.log(`  ⚠️  MISMATCH DETECTED!`)
      }
      console.log('')
    })

    // Test filtering logic
    console.log('=== FILTERING TESTS ===\n')
    
    const testProvinces = ['Huelva', 'Cádiz']
    
    testProvinces.forEach(testProvince => {
      console.log(`Testing province filter: "${testProvince}"`)
      
      // Communications.tsx filtering
      const commFiltered = customers.filter(c => {
        const provinceOk = !testProvince || deriveProvince(c) === testProvince
        return provinceOk
      })
      
      // Other pages filtering
      const otherFiltered = customers.filter(c => {
        const provinceOk = !testProvince || displayProvince(c) === testProvince
        return provinceOk
      })
      
      console.log(`  Communications.tsx: ${commFiltered.length} customers`)
      console.log(`  Other pages: ${otherFiltered.length} customers`)
      
      if (commFiltered.length !== otherFiltered.length) {
        console.log(`  ⚠️  FILTERING MISMATCH!`)
        
        // Find differences
        const commIds = new Set(commFiltered.map(c => c.id))
        const otherIds = new Set(otherFiltered.map(c => c.id))
        
        const onlyInComm = commFiltered.filter(c => !otherIds.has(c.id))
        const onlyInOther = otherFiltered.filter(c => !commIds.has(c.id))
        
        if (onlyInComm.length > 0) {
          console.log(`    Only in Communications.tsx (${onlyInComm.length}):`)
          onlyInComm.forEach(c => {
            console.log(`      - ${c.name}: derive="${deriveProvince(c)}", display="${displayProvince(c)}"`)
          })
        }
        
        if (onlyInOther.length > 0) {
          console.log(`    Only in Other pages (${onlyInOther.length}):`)
          onlyInOther.forEach(c => {
            console.log(`      - ${c.name}: derive="${deriveProvince(c)}", display="${displayProvince(c)}"`)
          })
        }
      }
      console.log('')
    })

    // Test city filtering for Huelva province
    console.log('=== CITY FILTERING TEST (Huelva Province) ===\n')
    
    const huelvaCustomers = customers.filter(c => deriveProvince(c) === 'Huelva')
    console.log(`Customers in Huelva province: ${huelvaCustomers.length}`)
    
    const huelvaCities = Array.from(new Set(huelvaCustomers.map(c => deriveCity(c)).filter(city => city.length > 0))).sort()
    console.log(`Cities in Huelva: ${huelvaCities.join(', ')}`)
    
    // Test filtering by city "Huelva"
    const huelvaCity = huelvaCustomers.filter(c => deriveCity(c) === 'Huelva')
    console.log(`Customers in Huelva city: ${huelvaCity.length}`)
    
    huelvaCity.forEach(c => {
      console.log(`  - ${c.name}: province="${deriveProvince(c)}", city="${deriveCity(c)}"`)
    })

  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

debugProgramarMensajeFiltering()
