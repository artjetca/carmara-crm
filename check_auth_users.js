import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkAuthUsers() {
  try {
    console.log('检查auth.users表...');
    
    // 使用service role查询auth.users表
    const { data: authUsers, error: authError } = await supabaseAdmin
      .from('auth.users')
      .select('*')
      .eq('email', 'admin@casmara.com');
    
    if (authError) {
      console.log('查询auth.users失败:', authError);
      
      // 尝试使用函数查询
      const { data: sqlResult, error: sqlError } = await supabaseAdmin
        .rpc('check_auth_user', { user_email: 'admin@casmara.com' });
      
      if (sqlError) {
        console.log('函数查询也失败:', sqlError);
      } else {
        console.log('Auth用户查询结果:', sqlResult);
      }
    } else {
      console.log('Auth.users表中的用户:', authUsers);
    }
    
    // 检查profiles表
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('email', 'admin@casmara.com');
    
    if (profileError) {
      console.log('查询profiles失败:', profileError);
    } else {
      console.log('Profiles表中的用户:', profiles);
    }
    
  } catch (error) {
    console.error('检查失败:', error);
  }
}

checkAuthUsers();