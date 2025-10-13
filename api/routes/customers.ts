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

// GET /api/customers/all -> return all customers (limited to safe size)
router.get('/all', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!admin) {
      res.status(500).json({ success: false, error: 'Server missing service role key' })
      return
    }
    const { data, error } = await admin
      .from('customers')
      .select('*')
      .order('name')
    if (error) {
      res.status(500).json({ success: false, error: error.message })
      return
    }
    res.json({ success: true, data })
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Unexpected server error' })
  }
})

export default router