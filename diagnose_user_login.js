#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Supabase 配置
const supabaseUrl = 'https://aotpcnwjjpkzxnhvmcvb.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvdHBjbndqanBrenhuaHZtY3ZiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjEyNTM3NiwiZXhwIjoyMDU3NzAxMzc2fQ.3IGYDKYFpCEV_20keoUZg-FZJzDbWMNjulzSo456b1I';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvdHBjbndqanBrenhuaHZtY3ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDIxMjUzNzYsImV4cCI6MjA1NzcwMTM3Nn0.utizL25OINRgojrwcrzIstf9BvvlQq0EKwj5aVht4Js';

// 創建 Supabase 客戶端（使用 service role 進行管理操作）
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
// 創建 Supabase 客戶端（使用 anon key 進行登入測試）
const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// 目標用戶信息
const TARGET_EMAIL = 'rosariog.almenglo@gmail.com';
const TARGET_PASSWORD = 'admin123';

async function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

async function checkUserExists() {
  try {
    log(`檢查用戶 ${TARGET_EMAIL} 是否存在...`);
    
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();
    
    if (error) {
      log(`獲取用戶列表失敗: ${error.message}`, 'error');
      return null;
    }
    
    const user = users.users.find(u => u.email === TARGET_EMAIL);
    
    if (user) {
      log(`用戶存在! ID: ${user.id}`, 'success');
      log(`用戶狀態:`);
      log(`  - Email: ${user.email}`);
      log(`  - Email 已確認: ${user.email_confirmed_at ? '是' : '否'}`);
      log(`  - 創建時間: ${user.created_at}`);
      log(`  - 最後登入: ${user.last_sign_in_at || '從未登入'}`);
      log(`  - 用戶元數據: ${JSON.stringify(user.user_metadata, null, 2)}`);
      return user;
    } else {
      log(`用戶不存在`, 'warning');
      return null;
    }
  } catch (error) {
    log(`檢查用戶時發生錯誤: ${error.message}`, 'error');
    return null;
  }
}

async function createUser() {
  try {
    log(`創建用戶 ${TARGET_EMAIL}...`);
    
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: TARGET_EMAIL,
      password: TARGET_PASSWORD,
      email_confirm: true // 自動確認 email
    });
    
    if (error) {
      log(`創建用戶失敗: ${error.message}`, 'error');
      return false;
    }
    
    log(`用戶創建成功! ID: ${data.user.id}`, 'success');
    return true;
  } catch (error) {
    log(`創建用戶時發生錯誤: ${error.message}`, 'error');
    return false;
  }
}

async function updateUserPassword() {
  try {
    log(`更新用戶密碼...`);
    
    // 先獲取用戶
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      log(`獲取用戶列表失敗: ${listError.message}`, 'error');
      return false;
    }
    
    const user = users.users.find(u => u.email === TARGET_EMAIL);
    if (!user) {
      log(`找不到用戶`, 'error');
      return false;
    }
    
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        password: TARGET_PASSWORD,
        email_confirm: true
      }
    );
    
    if (error) {
      log(`更新密碼失敗: ${error.message}`, 'error');
      return false;
    }
    
    log(`密碼更新成功!`, 'success');
    return true;
  } catch (error) {
    log(`更新密碼時發生錯誤: ${error.message}`, 'error');
    return false;
  }
}

async function testLogin() {
  try {
    log(`測試登入 ${TARGET_EMAIL}...`);
    
    // 先登出任何現有會話
    await supabaseClient.auth.signOut();
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: TARGET_EMAIL,
      password: TARGET_PASSWORD
    });
    
    if (error) {
      log(`登入失敗: ${error.message}`, 'error');
      log(`錯誤詳情:`);
      log(`  - 錯誤代碼: ${error.status || 'N/A'}`);
      log(`  - 錯誤類型: ${error.name || 'N/A'}`);
      
      if (error.message.includes('Invalid login credentials')) {
        log(`  - 可能原因: 密碼錯誤或帳戶不存在`, 'warning');
      } else if (error.message.includes('Email not confirmed')) {
        log(`  - 可能原因: Email 未確認`, 'warning');
      }
      
      return false;
    }
    
    log(`登入成功!`, 'success');
    log(`會話信息:`);
    log(`  - 用戶 ID: ${data.user.id}`);
    log(`  - Email: ${data.user.email}`);
    log(`  - Access Token: ${data.session.access_token.substring(0, 20)}...`);
    
    return true;
  } catch (error) {
    log(`測試登入時發生錯誤: ${error.message}`, 'error');
    return false;
  }
}

async function main() {
  log('=== 開始診斷用戶登入問題 ===');
  log(`目標用戶: ${TARGET_EMAIL}`);
  log(`目標密碼: ${TARGET_PASSWORD}`);
  log('');
  
  // 1. 檢查用戶是否存在
  const user = await checkUserExists();
  log('');
  
  // 2. 如果用戶不存在，創建用戶
  if (!user) {
    const created = await createUser();
    if (!created) {
      log('無法創建用戶，診斷結束', 'error');
      return;
    }
    log('');
  } else {
    // 3. 如果用戶存在但可能密碼不對，更新密碼
    log('用戶已存在，更新密碼以確保正確...');
    await updateUserPassword();
    log('');
  }
  
  // 4. 測試登入
  const loginSuccess = await testLogin();
  log('');
  
  if (loginSuccess) {
    log('=== 診斷完成：登入問題已解決 ===', 'success');
    log(`用戶 ${TARGET_EMAIL} 現在可以使用密碼 ${TARGET_PASSWORD} 登入`);
  } else {
    log('=== 診斷完成：登入問題仍然存在 ===', 'error');
    log('請檢查以下可能的問題:');
    log('1. Supabase 項目配置');
    log('2. 網絡連接');
    log('3. 前端應用配置');
  }
}

// 執行診斷
main().catch(error => {
  log(`診斷過程中發生未預期的錯誤: ${error.message}`, 'error');
  console.error(error);
});