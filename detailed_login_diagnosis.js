#!/usr/bin/env node

/**
 * 詳細登入診斷腳本
 * 用於診斷 rosariog.almenglo@gmail.com 登入失敗的具體原因
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  console.error('❌ 缺少必要的環境變數');
  console.error('需要: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

// 使用 Service Role 進行管理操作
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
// 使用 Anon Key 模擬前端登入
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

const TARGET_EMAIL = 'rosariog.almenglo@gmail.com';
const TARGET_PASSWORD = 'admin123';

async function runDiagnosis() {
  console.log('🔍 開始詳細登入診斷...');
  console.log('=' .repeat(60));
  
  try {
    // 1. 檢查用戶是否存在於 auth.users 表中
    console.log('\n1️⃣ 檢查用戶是否存在於 auth.users 表中...');
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (authError) {
      console.error('❌ 無法獲取用戶列表:', authError.message);
      return;
    }
    
    const targetUser = authUsers.users.find(user => user.email === TARGET_EMAIL);
    
    if (!targetUser) {
      console.error(`❌ 用戶 ${TARGET_EMAIL} 不存在於 auth.users 表中`);
      console.log('\n🔧 解決方案:');
      console.log('1. 重新創建用戶帳戶');
      console.log('2. 檢查 email 拼寫是否正確');
      return;
    }
    
    console.log('✅ 用戶存在於 auth.users 表中');
    console.log('用戶詳情:');
    console.log(`  - ID: ${targetUser.id}`);
    console.log(`  - Email: ${targetUser.email}`);
    console.log(`  - Email Confirmed: ${targetUser.email_confirmed_at ? '是' : '否'}`);
    console.log(`  - 創建時間: ${targetUser.created_at}`);
    console.log(`  - 最後登入: ${targetUser.last_sign_in_at || '從未登入'}`);
    console.log(`  - 用戶狀態: ${targetUser.banned_until ? '被禁用' : '正常'}`);
    
    // 2. 檢查用戶狀態
    console.log('\n2️⃣ 檢查用戶狀態...');
    
    if (targetUser.banned_until) {
      console.error('❌ 用戶帳戶被禁用');
      console.log(`禁用到期時間: ${targetUser.banned_until}`);
      console.log('\n🔧 解決方案: 解除用戶禁用狀態');
      return;
    }
    
    if (!targetUser.email_confirmed_at) {
      console.warn('⚠️  用戶 email 未確認');
      console.log('\n🔧 可能的解決方案:');
      console.log('1. 確認 email 驗證');
      console.log('2. 檢查 Supabase 設置是否要求 email 確認');
    } else {
      console.log('✅ 用戶狀態正常');
    }
    
    // 3. 檢查 Supabase 認證設置
    console.log('\n3️⃣ 檢查 Supabase 認證設置...');
    
    // 檢查是否啟用了 email 確認
    try {
      const { data: settings, error: settingsError } = await supabaseAdmin
        .from('auth.config')
        .select('*');
      
      if (settingsError) {
        console.log('⚠️  無法獲取認證設置 (這是正常的)');
      }
    } catch (err) {
      console.log('⚠️  無法檢查認證設置');
    }
    
    // 4. 測試密碼登入 (使用 anon key)
    console.log('\n4️⃣ 測試前端登入流程...');
    
    const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
      email: TARGET_EMAIL,
      password: TARGET_PASSWORD
    });
    
    if (signInError) {
      console.error('❌ 登入失敗');
      console.error('錯誤詳情:');
      console.error(`  - 錯誤代碼: ${signInError.status || 'N/A'}`);
      console.error(`  - 錯誤訊息: ${signInError.message}`);
      console.error(`  - 錯誤類型: ${signInError.name || 'N/A'}`);
      
      // 分析常見錯誤
      if (signInError.message.includes('Invalid login credentials')) {
        console.log('\n🔍 錯誤分析: "Invalid login credentials"');
        console.log('可能原因:');
        console.log('1. 密碼不正確');
        console.log('2. Email 未確認且 Supabase 要求確認');
        console.log('3. 用戶帳戶被禁用或刪除');
        console.log('4. RLS 政策阻止登入');
      }
      
      if (signInError.message.includes('Email not confirmed')) {
        console.log('\n🔍 錯誤分析: Email 未確認');
        console.log('需要確認 email 後才能登入');
      }
      
    } else {
      console.log('✅ 登入成功!');
      console.log('用戶資訊:');
      console.log(`  - 用戶 ID: ${signInData.user.id}`);
      console.log(`  - Email: ${signInData.user.email}`);
      console.log(`  - 登入時間: ${new Date().toISOString()}`);
      
      // 登出
      await supabaseClient.auth.signOut();
    }
    
    // 5. 檢查 RLS 政策
    console.log('\n5️⃣ 檢查相關的 RLS 政策...');
    
    try {
      const { data: policies, error: policiesError } = await supabaseAdmin
        .from('pg_policies')
        .select('*')
        .eq('schemaname', 'public');
      
      if (policiesError) {
        console.log('⚠️  無法獲取 RLS 政策信息');
      } else {
        console.log(`✅ 找到 ${policies.length} 個 RLS 政策`);
        
        // 檢查是否有可能影響認證的政策
        const authRelatedPolicies = policies.filter(p => 
          p.tablename.includes('user') || 
          p.tablename.includes('auth') ||
          p.cmd === 'SELECT'
        );
        
        if (authRelatedPolicies.length > 0) {
          console.log('相關的 RLS 政策:');
          authRelatedPolicies.forEach(policy => {
            console.log(`  - ${policy.tablename}.${policy.policyname}: ${policy.cmd}`);
          });
        }
      }
    } catch (err) {
      console.log('⚠️  無法檢查 RLS 政策');
    }
    
    // 6. 測試密碼重置功能
    console.log('\n6️⃣ 測試密碼重置功能...');
    
    const { data: resetData, error: resetError } = await supabaseClient.auth.resetPasswordForEmail(
      TARGET_EMAIL,
      { redirectTo: 'http://localhost:5176/reset-password' }
    );
    
    if (resetError) {
      console.error('❌ 密碼重置失敗:', resetError.message);
    } else {
      console.log('✅ 密碼重置郵件發送成功');
    }
    
    // 7. 提供解決方案建議
    console.log('\n' + '=' .repeat(60));
    console.log('🔧 解決方案建議:');
    console.log('\n如果登入仍然失敗，請嘗試以下步驟:');
    console.log('\n1. 瀏覽器相關:');
    console.log('   - 清除瀏覽器快取和 Cookie');
    console.log('   - 使用無痕模式');
    console.log('   - 嘗試不同的瀏覽器');
    console.log('\n2. 帳戶相關:');
    console.log('   - 確認 email 地址拼寫正確');
    console.log('   - 確認密碼正確');
    console.log('   - 檢查 email 確認狀態');
    console.log('\n3. 系統相關:');
    console.log('   - 檢查網路連線');
    console.log('   - 確認 Supabase 服務狀態');
    console.log('   - 檢查前端控制台錯誤');
    console.log('\n4. 開發者工具:');
    console.log('   - 打開瀏覽器開發者工具');
    console.log('   - 檢查 Network 標籤頁的請求');
    console.log('   - 檢查 Console 標籤頁的錯誤');
    
  } catch (error) {
    console.error('❌ 診斷過程中發生錯誤:', error.message);
    console.error('完整錯誤:', error);
  }
}

// 執行診斷
runDiagnosis().then(() => {
  console.log('\n🏁 診斷完成');
}).catch(error => {
  console.error('❌ 診斷失敗:', error.message);
  process.exit(1);
});