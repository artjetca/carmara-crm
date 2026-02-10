#!/usr/bin/env node

// 調試 Supabase 認證問題
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 載入環境變數
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_EMAIL = 'rosariog.almenglo@gmail.com';
const TEST_PASSWORD = 'admin123';

console.log('🔍 調試 Supabase 認證問題...');
console.log('=' .repeat(60));

async function debugSupabaseAuth() {
  try {
    console.log('\n1. 環境變數檢查:');
    console.log(`   VITE_SUPABASE_URL: ${supabaseUrl}`);
    console.log(`   VITE_SUPABASE_ANON_KEY: ${supabaseAnonKey ? supabaseAnonKey.substring(0, 20) + '...' : '未設定'}`);
    console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? supabaseServiceKey.substring(0, 20) + '...' : '未設定'}`);

    if (!supabaseUrl || !supabaseAnonKey) {
      console.log('❌ Supabase 配置不完整');
      return;
    }

    // 2. 使用 ANON_KEY 測試（前端方式）
    console.log('\n2. 使用 ANON_KEY 測試（前端方式）:');
    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);
    
    try {
      const { data: anonData, error: anonError } = await supabaseAnon.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      });

      if (anonError) {
        console.log(`   ❌ ANON_KEY 認證失敗: ${anonError.message}`);
        console.log(`   錯誤詳情: ${JSON.stringify(anonError, null, 2)}`);
      } else {
        console.log(`   ✅ ANON_KEY 認證成功`);
        console.log(`   用戶 ID: ${anonData.user?.id}`);
        console.log(`   用戶郵箱: ${anonData.user?.email}`);
        console.log(`   會話存在: ${anonData.session ? '是' : '否'}`);
      }
    } catch (anonException) {
      console.log(`   ❌ ANON_KEY 認證異常: ${anonException.message}`);
    }

    // 3. 使用 SERVICE_ROLE_KEY 測試（後端方式）
    if (supabaseServiceKey) {
      console.log('\n3. 使用 SERVICE_ROLE_KEY 測試（後端方式）:');
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      
      try {
        const { data: adminData, error: adminError } = await supabaseAdmin.auth.signInWithPassword({
          email: TEST_EMAIL,
          password: TEST_PASSWORD
        });

        if (adminError) {
          console.log(`   ❌ SERVICE_ROLE_KEY 認證失敗: ${adminError.message}`);
          console.log(`   錯誤詳情: ${JSON.stringify(adminError, null, 2)}`);
        } else {
          console.log(`   ✅ SERVICE_ROLE_KEY 認證成功`);
          console.log(`   用戶 ID: ${adminData.user?.id}`);
          console.log(`   用戶郵箱: ${adminData.user?.email}`);
          console.log(`   會話存在: ${adminData.session ? '是' : '否'}`);
        }
      } catch (adminException) {
        console.log(`   ❌ SERVICE_ROLE_KEY 認證異常: ${adminException.message}`);
      }
    }

    // 4. 檢查用戶是否存在
    console.log('\n4. 檢查用戶是否存在:');
    if (supabaseServiceKey) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      
      try {
        const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
        
        if (usersError) {
          console.log(`   ❌ 無法獲取用戶列表: ${usersError.message}`);
        } else {
          const targetUser = users.users.find(user => user.email === TEST_EMAIL);
          if (targetUser) {
            console.log(`   ✅ 用戶存在`);
            console.log(`   用戶 ID: ${targetUser.id}`);
            console.log(`   郵箱確認: ${targetUser.email_confirmed_at ? '已確認' : '未確認'}`);
            console.log(`   最後登入: ${targetUser.last_sign_in_at || '從未登入'}`);
            console.log(`   創建時間: ${targetUser.created_at}`);
          } else {
            console.log(`   ❌ 用戶不存在`);
          }
        }
      } catch (usersException) {
        console.log(`   ❌ 檢查用戶異常: ${usersException.message}`);
      }
    }

    // 5. 測試不同的認證方法
    console.log('\n5. 測試不同的認證方法:');
    
    // 5.1 測試 Admin API
    if (supabaseServiceKey) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      
      try {
        console.log('   5.1 使用 Admin API 驗證用戶:');
        const { data: adminSignIn, error: adminSignInError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: TEST_EMAIL
        });
        
        if (adminSignInError) {
          console.log(`   ❌ Admin API 失敗: ${adminSignInError.message}`);
        } else {
          console.log(`   ✅ Admin API 成功生成魔法連結`);
        }
      } catch (adminSignInException) {
        console.log(`   ❌ Admin API 異常: ${adminSignInException.message}`);
      }
    }

  } catch (error) {
    console.log(`\n❌ 調試過程中發生錯誤: ${error.message}`);
    console.log(error.stack);
  }

  console.log('\n' + '=' .repeat(60));
  console.log('🏁 調試完成');
  
  console.log('\n💡 可能的解決方案:');
  console.log('1. 確認用戶帳戶在 Supabase 中存在且已確認');
  console.log('2. 檢查 Supabase 項目的認證設定');
  console.log('3. 確認 RLS (Row Level Security) 政策設定正確');
  console.log('4. 檢查 Supabase 項目是否暫停或有其他限制');
  console.log('5. 嘗試重新創建用戶帳戶');
}

// 執行調試
debugSupabaseAuth().catch(console.error);