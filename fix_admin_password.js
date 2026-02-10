import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 使用service role key创建管理员客户端
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createNewAdmin() {
  try {
    console.log('创建新的管理员用户...');
    
    // 首先删除现有的admin@casmara.com用户（如果存在）
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingAdmin = existingUsers.users.find(user => user.email === 'admin@casmara.com');
    
    if (existingAdmin) {
      console.log('删除现有的admin@casmara.com用户...');
      await supabaseAdmin.auth.admin.deleteUser(existingAdmin.id);
      
      // 删除对应的profile记录
      await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', existingAdmin.id);
    }
    
    // 创建新的管理员用户
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: 'admin@casmara.com',
      password: 'admin123',
      email_confirm: true,
      user_metadata: {
        full_name: 'Administrador Casmara',
        email_verified: true
      }
    });
    
    if (error) {
      console.error('创建用户失败:', error);
      return;
    }
    
    console.log('用户创建成功!');
    console.log('用户ID:', data.user.id);
    console.log('邮箱:', data.user.email);
    
    // 创建对应的profile记录
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: data.user.id,
        name: 'Administrador Casmara',
        full_name: 'Administrador Casmara',
        email: 'admin@casmara.com',
        role: 'administrador'
      });
    
    if (profileError) {
      console.error('创建profile失败:', profileError);
    } else {
      console.log('Profile创建成功!');
    }
    
    // 等待一下让创建生效
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 测试登录
    console.log('\n测试登录...');
    const supabaseClient = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY);
    
    const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({
      email: 'admin@casmara.com',
      password: 'admin123'
    });
    
    if (loginError) {
      console.error('登录测试失败:', loginError);
    } else {
      console.log('登录测试成功!');
      console.log('登录用户:', loginData.user.email);
      console.log('用户ID:', loginData.user.id);
    }
    
  } catch (err) {
    console.error('创建过程中发生错误:', err);
  }
}

createNewAdmin();