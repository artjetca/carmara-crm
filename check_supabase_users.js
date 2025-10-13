#!/usr/bin/env node

/**
 * Supabase 用戶檢查和管理腳本
 * 檢查用戶是否存在，如果不存在則創建測試用戶
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// 載入環境變數
dotenv.config({ path: '.env.local' });

// 顏色輸出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(50));
  log(title, 'cyan');
  console.log('='.repeat(50));
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// 初始化 Supabase 客戶端
function initializeSupabase() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  
  logSection('初始化 Supabase 客戶端');
  
  if (!supabaseUrl) {
    logError('VITE_SUPABASE_URL 環境變數未設置');
    return null;
  }
  
  if (!supabaseServiceKey) {
    logWarning('SUPABASE_SERVICE_ROLE_KEY 未設置，將使用 ANON_KEY（功能受限）');
    if (!supabaseAnonKey) {
      logError('VITE_SUPABASE_ANON_KEY 也未設置');
      return null;
    }
  }
  
  logSuccess(`Supabase URL: ${supabaseUrl}`);
  
  // 優先使用 Service Role Key，否則使用 Anon Key
  const key = supabaseServiceKey || supabaseAnonKey;
  const keyType = supabaseServiceKey ? 'Service Role' : 'Anon';
  
  logInfo(`使用 ${keyType} Key: ${key.substring(0, 20)}...`);
  
  try {
    const supabase = createClient(supabaseUrl, key);
    logSuccess('Supabase 客戶端初始化成功');
    return { supabase, hasServiceRole: !!supabaseServiceKey };
  } catch (error) {
    logError(`Supabase 客戶端初始化失敗: ${error.message}`);
    return null;
  }
}

// 檢查用戶是否存在
async function checkUserExists(supabase, email, hasServiceRole) {
  logSection('檢查用戶是否存在');
  
  try {
    if (hasServiceRole) {
      // 使用 Service Role 檢查所有用戶
      logInfo('使用 Service Role 檢查用戶列表...');
      const { data: users, error } = await supabase.auth.admin.listUsers();
      
      if (error) {
        logError(`獲取用戶列表失敗: ${error.message}`);
        return false;
      }
      
      logSuccess(`找到 ${users.users.length} 個用戶`);
      
      const targetUser = users.users.find(user => user.email === email);
      
      if (targetUser) {
        logSuccess(`用戶 ${email} 存在`);
        logInfo(`用戶 ID: ${targetUser.id}`);
        logInfo(`創建時間: ${new Date(targetUser.created_at).toLocaleString()}`);
        logInfo(`最後登入: ${targetUser.last_sign_in_at ? new Date(targetUser.last_sign_in_at).toLocaleString() : '從未登入'}`);
        logInfo(`郵箱驗證: ${targetUser.email_confirmed_at ? '已驗證' : '未驗證'}`);
        return targetUser;
      } else {
        logWarning(`用戶 ${email} 不存在`);
        return false;
      }
    } else {
      // 使用 Anon Key 嘗試登入來檢查用戶
      logInfo('使用 Anon Key 嘗試登入檢查...');
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: 'test-password' // 使用錯誤密碼來檢查用戶是否存在
      });
      
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          logInfo('用戶存在但密碼錯誤（這是預期的）');
          return true;
        } else if (error.message.includes('Email not confirmed')) {
          logWarning('用戶存在但郵箱未驗證');
          return true;
        } else {
          logWarning(`登入錯誤: ${error.message}`);
          return false;
        }
      } else {
        logSuccess('用戶存在且密碼正確');
        // 登出
        await supabase.auth.signOut();
        return true;
      }
    }
  } catch (error) {
    logError(`檢查用戶時發生錯誤: ${error.message}`);
    return false;
  }
}

// 創建測試用戶
async function createTestUser(supabase, email, password, hasServiceRole) {
  logSection('創建測試用戶');
  
  if (!hasServiceRole) {
    logError('需要 Service Role Key 才能創建用戶');
    logInfo('請設置 SUPABASE_SERVICE_ROLE_KEY 環境變數');
    return false;
  }
  
  try {
    logInfo(`創建用戶: ${email}`);
    
    const { data, error } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true // 自動確認郵箱
    });
    
    if (error) {
      logError(`創建用戶失敗: ${error.message}`);
      return false;
    }
    
    logSuccess('用戶創建成功！');
    logInfo(`用戶 ID: ${data.user.id}`);
    logInfo(`郵箱: ${data.user.email}`);
    
    return data.user;
  } catch (error) {
    logError(`創建用戶時發生錯誤: ${error.message}`);
    return false;
  }
}

// 測試登入
async function testLogin(supabase, email, password) {
  logSection('測試登入功能');
  
  try {
    logInfo(`嘗試登入: ${email}`);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (error) {
      logError(`登入失敗: ${error.message}`);
      
      // 提供具體的錯誤分析
      if (error.message.includes('Invalid login credentials')) {
        logWarning('可能的原因:');
        console.log('  1. 密碼錯誤');
        console.log('  2. 用戶不存在');
        console.log('  3. 郵箱未驗證');
      } else if (error.message.includes('Email not confirmed')) {
        logWarning('郵箱未驗證，需要確認郵箱');
      } else if (error.message.includes('Too many requests')) {
        logWarning('請求過於頻繁，請稍後再試');
      }
      
      return false;
    }
    
    logSuccess('登入成功！');
    logInfo(`用戶 ID: ${data.user.id}`);
    logInfo(`郵箱: ${data.user.email}`);
    logInfo(`登入時間: ${new Date(data.user.last_sign_in_at).toLocaleString()}`);
    
    // 登出
    await supabase.auth.signOut();
    logInfo('已登出');
    
    return true;
  } catch (error) {
    logError(`登入測試時發生錯誤: ${error.message}`);
    return false;
  }
}

// 主函數
async function main() {
  log('Supabase 用戶檢查和管理開始', 'cyan');
  
  const testEmail = 'rosariog.almenglo@gmail.com';
  const testPassword = 'admin123';
  
  try {
    // 1. 初始化 Supabase
    const supabaseClient = initializeSupabase();
    if (!supabaseClient) {
      logError('無法初始化 Supabase 客戶端');
      return;
    }
    
    const { supabase, hasServiceRole } = supabaseClient;
    
    // 2. 檢查用戶是否存在
    const userExists = await checkUserExists(supabase, testEmail, hasServiceRole);
    
    // 3. 如果用戶不存在且有 Service Role，創建用戶
    if (!userExists && hasServiceRole) {
      logInfo('用戶不存在，嘗試創建測試用戶...');
      const newUser = await createTestUser(supabase, testEmail, testPassword, hasServiceRole);
      
      if (!newUser) {
        logError('無法創建測試用戶');
        return;
      }
    } else if (!userExists && !hasServiceRole) {
      logError('用戶不存在且無法創建（需要 Service Role Key）');
      logInfo('解決方案:');
      console.log('1. 設置 SUPABASE_SERVICE_ROLE_KEY 環境變數');
      console.log('2. 或在 Supabase Dashboard 中手動創建用戶');
      console.log('3. 或使用 Supabase 的註冊功能');
      return;
    }
    
    // 4. 測試登入
    const loginSuccess = await testLogin(supabase, testEmail, testPassword);
    
    // 5. 總結
    logSection('診斷總結');
    
    if (loginSuccess) {
      logSuccess('所有測試通過！登入功能正常工作');
      logInfo('如果前端仍然無法登入，請檢查:');
      console.log('1. 瀏覽器控制台錯誤');
      console.log('2. 網路連接問題');
      console.log('3. CORS 設置');
      console.log('4. 前端環境變數載入');
    } else {
      logError('登入測試失敗');
      logInfo('請檢查上述錯誤信息並按照建議修復');
    }
    
  } catch (error) {
    logError(`診斷過程中發生錯誤: ${error.message}`);
  }
}

// 執行診斷
main().catch(console.error);