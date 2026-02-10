import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const supabaseClient = createClient(supabaseUrl, anonKey);

async function testAuthSettings() {
  try {
    console.log('测试认证设置...');
    
    // 使用函数检查用户状态
    const { data: authStatus, error: statusError } = await supabaseAdmin
      .rpc('test_admin_login');
    
    if (statusError) {
      console.log('检查认证状态失败:', statusError);
    } else {
      console.log('认证状态:', authStatus);
    }
    
    // 尝试使用anon key登录
    console.log('\n尝试使用anon key登录...');
    const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({
      email: 'admin@casmara.com',
      password: 'admin123'
    });
    
    if (loginError) {
      console.log('登录失败:', loginError.message);
      console.log('错误详情:', loginError);
    } else {
      console.log('登录成功!');
      console.log('用户信息:', loginData.user);
    }
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testAuthSettings();