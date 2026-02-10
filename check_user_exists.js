import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 載入環境變數
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ 缺少 Supabase 配置');
  process.exit(1);
}

// 使用 SERVICE_ROLE_KEY 創建管理員客戶端
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkUserExists() {
  console.log('🔍 檢查用戶是否存在於 Supabase...');
  console.log('==================================================');
  
  const testEmail = 'rosariog.almenglo@gmail.com';
  
  try {
    // 1. 使用 Admin API 查詢用戶
    console.log('1. 使用 Admin API 查詢用戶:');
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.log('   ❌ 查詢用戶列表失敗:', listError.message);
    } else {
      console.log('   ✅ 總用戶數:', users.users.length);
      const targetUser = users.users.find(user => user.email === testEmail);
      
      if (targetUser) {
        console.log('   ✅ 找到目標用戶:');
        console.log('      - ID:', targetUser.id);
        console.log('      - Email:', targetUser.email);
        console.log('      - Email 已確認:', targetUser.email_confirmed_at ? '是' : '否');
        console.log('      - 創建時間:', targetUser.created_at);
        console.log('      - 最後登入:', targetUser.last_sign_in_at || '從未登入');
        console.log('      - 用戶狀態:', targetUser.aud || 'unknown');
      } else {
        console.log('   ❌ 未找到目標用戶:', testEmail);
        console.log('   📋 現有用戶列表:');
        users.users.forEach((user, index) => {
          console.log(`      ${index + 1}. ${user.email} (${user.id})`);
        });
      }
    }
    
    // 2. 嘗試創建用戶（如果不存在）
    console.log('\n2. 嘗試創建測試用戶:');
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: testEmail,
      password: 'admin123',
      email_confirm: true
    });
    
    if (createError) {
      if (createError.message.includes('already registered')) {
        console.log('   ℹ️  用戶已存在，無需創建');
      } else {
        console.log('   ❌ 創建用戶失敗:', createError.message);
      }
    } else {
      console.log('   ✅ 成功創建用戶:', newUser.user.id);
    }
    
    // 3. 再次嘗試使用 ANON_KEY 登入
    console.log('\n3. 使用 ANON_KEY 測試登入:');
    const supabaseAnon = createClient(supabaseUrl, process.env.VITE_SUPABASE_ANON_KEY);
    
    const { data: loginData, error: loginError } = await supabaseAnon.auth.signInWithPassword({
      email: testEmail,
      password: 'admin123'
    });
    
    if (loginError) {
      console.log('   ❌ ANON_KEY 登入失敗:', loginError.message);
      console.log('   📋 錯誤詳情:', JSON.stringify(loginError, null, 2));
    } else {
      console.log('   ✅ ANON_KEY 登入成功!');
      console.log('   👤 用戶 ID:', loginData.user.id);
    }
    
  } catch (error) {
    console.error('❌ 檢查過程中發生錯誤:', error.message);
  }
  
  console.log('\n==================================================');
  console.log('🏁 檢查完成');
}

checkUserExists();