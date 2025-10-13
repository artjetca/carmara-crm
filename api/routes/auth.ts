/**
 * This is a user authentication API route demo.
 * Handle user registration, login, token management, etc.
 */
import { Router, type Request, type Response } from 'express';
import { createClient } from '@supabase/supabase-js';


const router = Router();

const DEFAULT_SUPABASE_URL = 'https://aotpcnwjjpkzxnhvmcvb.supabase.co';
const supabaseUrl = process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseAnonKey) {
  console.warn('[auth route] Missing VITE_SUPABASE_ANON_KEY: /api/auth endpoints will return 500 until it is set');
}

// 使用 ANON_KEY 進行用戶認證（與前端一致）
const supabase = supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// 如果需要管理員權限，可以使用 SERVICE_ROLE_KEY
const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// Registration route removed - only administrator login is supported

/**
 * User Login
 * POST /api/auth/login
 */
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('[AUTH] Login attempt started');
    console.log('[AUTH] Supabase URL:', supabaseUrl);
    console.log('[AUTH] Supabase Anon Key exists:', !!supabaseAnonKey);
    console.log('[AUTH] Supabase client exists:', !!supabase);
    
    if (!supabase) {
      console.log('[AUTH] ERROR: Supabase client not initialized');
      res.status(500).json({ success: false, error: 'Server missing Supabase configuration' });
      return;
    }

    const { email, password } = req.body;
    console.log('[AUTH] Login request for email:', email);
    console.log('[AUTH] Password provided:', !!password);

    if (!email || !password) {
      console.log('[AUTH] ERROR: Missing email or password');
      res.status(400).json({ success: false, error: 'Email and password are required' });
      return;
    }

    console.log('[AUTH] Attempting Supabase authentication...');
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    console.log('[AUTH] Supabase response - Error:', error?.message || 'None');
    console.log('[AUTH] Supabase response - User exists:', !!data?.user);
    console.log('[AUTH] Supabase response - Session exists:', !!data?.session);

    if (error) {
      console.log('[AUTH] Authentication failed:', error.message);
      console.log('[AUTH] Error details:', JSON.stringify(error, null, 2));
      res.status(401).json({ success: false, error: error.message });
      return;
    }

    if (!data.user) {
      console.log('[AUTH] ERROR: No user data returned');
      res.status(401).json({ success: false, error: 'Authentication failed' });
      return;
    }

    console.log('[AUTH] Authentication successful for user:', data.user.id);
    res.json({
      success: true,
      data: {
        user: data.user,
        session: data.session
      }
    });
  } catch (e: any) {
    console.log('[AUTH] Exception occurred:', e.message);
    console.log('[AUTH] Exception stack:', e.stack);
    res.status(500).json({ success: false, error: e?.message || 'Unexpected server error' });
  }
});

/**
 * User Logout
 * POST /api/auth/logout
 */
router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  // TODO: Implement logout logic
});

export default router;