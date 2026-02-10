import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// 清除備註中的 "Provincia: ..." 與 "Ciudad: ..." 標籤
const stripLocationTags = (notes) => {
  if (!notes) return ''
  let s = notes
  // 移除以管線拼接的片段，例如 " | Provincia: Huelva" 或 "| Ciudad: Bonares"
  s = s.replace(/\s*\|\s*Provincia:\s*[^|\n]+/gi, '')
       .replace(/\s*\|\s*Ciudad:\s*[^|\n]+/gi, '')
  // 移除獨立行的片段
  s = s.replace(/(^|\n)\s*Provincia:\s*[^\n]+/gi, '')
       .replace(/(^|\n)\s*Ciudad:\s*[^\n]+/gi, '')
  // 清理多餘的分隔符與空白
  s = s.replace(/\s*\|\s*/g, ' | ').replace(/^(\s*\|\s*)+|(\s*\|\s*)+$/g, '')
  return s.trim()
}

// 从备注中提取"Ciudad: xxx"作为city值
const extractMunicipality = (notes) => {
  if (!notes) return ''
  const match = notes.match(/Ciudad:\s*([^\n]+)/i)
  return match ? match[1].trim() : ''
}

// 从备注中提取"Provincia: xxx"作为province值
const extractProvince = (notes) => {
  if (!notes) return ''
  const match = notes.match(/Provincia:\s*([^\n]+)/i)
  return match ? match[1].trim() : ''
}

async function cleanNotesData() {
  try {
    console.log('🧹 Cleaning notes data and migrating to city/province fields...\n')

    // 1. 获取所有有notes的客户
    const { data: customers, error: fetchError } = await supabase
      .from('customers')
      .select('id, name, notes, city, province')
      .not('notes', 'is', null)

    if (fetchError) {
      console.log('❌ Error fetching customers:', fetchError.message)
      return
    }

    console.log(`📋 Found ${customers.length} customers with notes`)

    let updatedCount = 0
    let errors = 0

    // 2. 处理每个客户
    for (const customer of customers) {
      try {
        const originalNotes = customer.notes
        const cleanNotes = stripLocationTags(originalNotes)
        const extractedCity = extractMunicipality(originalNotes)
        const extractedProvince = extractProvince(originalNotes)

        // 准备更新数据
        const updateData = {
          notes: cleanNotes || null
        }

        // 如果没有city但notes中有Ciudad信息，则迁移
        if (!customer.city && extractedCity) {
          updateData.city = extractedCity
        }

        // 如果没有province但notes中有Provincia信息，则迁移
        if (!customer.province && extractedProvince) {
          updateData.province = extractedProvince
        }

        // 只有当notes发生变化或需要迁移city/province时才更新
        if (cleanNotes !== originalNotes || updateData.city || updateData.province) {
          const { error: updateError } = await supabase
            .from('customers')
            .update(updateData)
            .eq('id', customer.id)

          if (updateError) {
            console.log(`❌ Error updating customer ${customer.name}:`, updateError.message)
            errors++
          } else {
            console.log(`✅ Updated: ${customer.name}`)
            if (updateData.city) console.log(`   Migrated city: ${updateData.city}`)
            if (updateData.province) console.log(`   Migrated province: ${updateData.province}`)
            if (cleanNotes !== originalNotes) console.log(`   Cleaned notes`)
            updatedCount++
          }
        }
      } catch (error) {
        console.log(`❌ Error processing customer ${customer.name}:`, error.message)
        errors++
      }
    }

    console.log(`\n🎉 Cleanup completed!`)
    console.log(`✅ Updated: ${updatedCount} customers`)
    console.log(`❌ Errors: ${errors} customers`)

  } catch (error) {
    console.error('❌ Script error:', error)
  }
}

cleanNotesData()
