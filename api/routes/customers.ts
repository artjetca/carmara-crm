/**
 * Customers API routes (server-side Supabase via Service Role)
 */
import { Router, type Request, type Response } from 'express'
import { createClient } from '@supabase/supabase-js'

const router = Router()

const DEFAULT_SUPABASE_URL = 'https://aotpcnwjjpkzxnhvmcvb.supabase.co'
const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Basic safeties: do not start without service role key
if (!serviceRoleKey) {
  // We don't throw at module init to keep server running; requests will get 500
  console.warn('[customers route] Missing SUPABASE_SERVICE_ROLE_KEY: /api/customers endpoints will return 500 until it is set')
}

const admin = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null

// Helpers
const normalizeCity = (v: any): string | null => {
  if (v === undefined || v === null) return null
  const s = String(v)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (s === 'huelva') return 'Huelva'
  if (s === 'cadiz') return 'Cádiz'
  return String(v).trim() || null
}
const sanitizePhone = (val: any): string | null => {
  if (val === undefined || val === null) return null
  const digits = String(val).replace(/\D+/g, '')
  if (digits.length === 0) return null
  return /^[6789][0-9]{8}$/.test(digits) ? digits : null
}

// Customer type helpers
const sanitizeCustomerType = (val: any): 'formal' | 'potential' | null => {
  if (val === undefined || val === null) return null
  const s = String(val).trim().toLowerCase()
  if (s === 'formal') return 'formal'
  if (s === 'potential') return 'potential'
  return null
}
const deriveCustomerTypeFromContrato = (val: any): 'formal' | 'potential' | null => {
  if (val === undefined || val === null) return null
  const s = String(val)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (s.includes('sin facturacion')) return 'potential'
  if (s.length > 0) return 'formal'
  return null
}

// GET /api/customers -> list
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!admin) { res.status(500).json({ success: false, error: 'Server missing service role key' }); return }
    const { data, error } = await admin
      .from('customers')
      .select('*')
      .order('name')
    if (error) { res.status(500).json({ success: false, error: error.message }); return }
    res.json({ success: true, data })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Unexpected server error' })
  }
})

// GET /api/customers/all -> alias of list
router.get('/all', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!admin) { res.status(500).json({ success: false, error: 'Server missing service role key' }); return }
    const { data, error } = await admin
      .from('customers')
      .select('*')
      .order('name')
    if (error) { res.status(500).json({ success: false, error: error.message }); return }
    res.json({ success: true, data })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Unexpected server error' })
  }
})

// POST /api/customers -> create
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!admin) { res.status(500).json({ success: false, error: 'Server missing service role key' }); return }
    const body = { ...req.body }
    const incomingNumero = Object.prototype.hasOwnProperty.call(body, 'num')
      ? body.num
      : (Object.prototype.hasOwnProperty.call(body, 'numero') ? body.numero : undefined)
    // Prepare insert body (avoid num/numero directly)
    delete body.num
    delete body.numero
    if (Object.prototype.hasOwnProperty.call(body, 'city')) {
      body.city = normalizeCity(body.city)
    }
    if (Object.prototype.hasOwnProperty.call(body, 'phone')) body.phone = sanitizePhone(body.phone)
    if (Object.prototype.hasOwnProperty.call(body, 'mobile_phone')) body.mobile_phone = sanitizePhone(body.mobile_phone)

    // Customer type: sanitize or derive from contrato; default to 'formal' on create (暫時註解直到 schema 更新)
    // if (Object.prototype.hasOwnProperty.call(body, 'customer_type')) {
    //   body.customer_type = sanitizeCustomerType(body.customer_type)
    // }
    // if (!body.customer_type) {
    //   const derived = deriveCustomerTypeFromContrato((body as any).contrato)
    //   body.customer_type = derived || 'formal'
    // }

    let { data: created, error } = await admin.from('customers').insert(body).select('*').single()
    if (error) {
      // retry without created_by if FK fails
      const msg = (error.message || '').toLowerCase()
      if (Object.prototype.hasOwnProperty.call(body, 'created_by') && (msg.includes('foreign key') || msg.includes('violates'))) {
        const retryBody = { ...body }
        delete retryBody.created_by
        const retry = await admin.from('customers').insert(retryBody).select('*').single()
        created = retry.data
        error = retry.error || null
      }
    }
    if (error) { res.status(500).json({ success: false, error: error.message }); return }

    const warnings: string[] = []
    if (created && created.id && typeof incomingNumero !== 'undefined' && incomingNumero !== null) {
      const tryNum = await admin.from('customers').update({ num: incomingNumero }).eq('id', created.id)
      if (tryNum.error) {
        const m = (tryNum.error.message || '').toLowerCase()
        const missingNum = m.includes("'num' column") || (m.includes('num') && m.includes('schema'))
        if (missingNum) {
          const tryNumero = await admin.from('customers').update({ numero: incomingNumero }).eq('id', created.id)
          if (tryNumero.error) {
            const m2 = (tryNumero.error.message || '').toLowerCase()
            const missingNumero = m2.includes("'numero' column") || (m2.includes('numero') && m2.includes('schema'))
            if (missingNumero) warnings.push('Número 未持久化：schema cache 未暴露 num/numero，其他欄位已保存')
            else { res.status(500).json({ success: false, error: tryNumero.error.message }); return }
          }
        } else { res.status(500).json({ success: false, error: tryNum.error.message }); return }
      }
    }

    const final = await admin.from('customers').select('*').eq('id', created!.id).single()
    if (final.error) { res.status(500).json({ success: false, error: final.error.message }); return }
    res.status(201).json({ success: true, data: final.data, warnings })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Unexpected server error' })
  }
})

// PUT/PATCH /api/customers -> update
router.put('/', async (req: Request, res: Response): Promise<void> => {
  await updateHandler(req, res)
})
router.patch('/', async (req: Request, res: Response): Promise<void> => {
  await updateHandler(req, res)
})

async function updateHandler(req: Request, res: Response): Promise<void> {
  try {
    if (!admin) { res.status(500).json({ success: false, error: 'Server missing service role key' }); return }
    const { id, ...updateData } = req.body || {}
    if (!id) { res.status(400).json({ success: false, error: 'Customer ID is required' }); return }

    // City normalization
    if (Object.prototype.hasOwnProperty.call(updateData, 'city')) {
      updateData.city = normalizeCity(updateData.city)
    }
    // Phone constraints
    if (Object.prototype.hasOwnProperty.call(updateData, 'phone')) updateData.phone = sanitizePhone(updateData.phone)
    if (Object.prototype.hasOwnProperty.call(updateData, 'mobile_phone')) updateData.mobile_phone = sanitizePhone(updateData.mobile_phone)

    // Customer type sanitize/derive on update (暫時註解直到 schema 更新)
    // if (Object.prototype.hasOwnProperty.call(updateData, 'customer_type')) {
    //   updateData.customer_type = sanitizeCustomerType(updateData.customer_type)
    // } else if (Object.prototype.hasOwnProperty.call(updateData, 'contrato')) {
    //   const derived = deriveCustomerTypeFromContrato(updateData.contrato)
    //   if (derived) updateData.customer_type = derived
    // }

    const normalFields: any = { ...updateData }
    delete normalFields.num
    delete normalFields.numero
    delete normalFields.customer_number
    delete normalFields.postal_code

    if (Object.keys(normalFields).length > 0) {
      const up = await admin.from('customers').update(normalFields).eq('id', id)
      if (up.error) { res.status(500).json({ success: false, error: up.error.message }); return }
    }

    // Optional postal_code
    if (Object.prototype.hasOwnProperty.call(updateData, 'postal_code')) {
      const pc = await admin.from('customers').update({ postal_code: updateData.postal_code }).eq('id', id)
      if (pc.error) { res.status(500).json({ success: false, error: pc.error.message }); return }
    }

    // Dual write número
    if (Object.prototype.hasOwnProperty.call(updateData, 'num')) {
      const tryNum = await admin.from('customers').update({ num: updateData.num }).eq('id', id)
      if (tryNum.error) {
        const m = (tryNum.error.message || '').toLowerCase()
        const missingNum = m.includes("'num' column") || (m.includes('num') && m.includes('schema'))
        if (missingNum) {
          const tryNumero = await admin.from('customers').update({ numero: updateData.num }).eq('id', id)
          if (tryNumero.error) {
            const m2 = (tryNumero.error.message || '').toLowerCase()
            const missingNumero = m2.includes("'numero' column") || (m2.includes('numero') && m2.includes('schema'))
            if (!missingNumero) { res.status(500).json({ success: false, error: tryNumero.error.message }); return }
          }
        } else { res.status(500).json({ success: false, error: tryNum.error.message }); return }
      }
    }

    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Unexpected server error' })
  }
}

// DELETE /api/customers -> delete by id
router.delete('/', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!admin) { res.status(500).json({ success: false, error: 'Server missing service role key' }); return }
    const { id } = req.body || {}
    if (!id) { res.status(400).json({ success: false, error: 'Customer ID is required' }); return }
    const del = await admin.from('customers').delete().eq('id', id)
    if (del.error) { res.status(500).json({ success: false, error: del.error.message }); return }
    res.json({ success: true })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Unexpected server error' })
  }
})

export default router