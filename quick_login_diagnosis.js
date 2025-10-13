#!/usr/bin/env node

// 快速登入診斷腳本
// 測試前端 Supabase 直接登入功能

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// 從環境變數讀取 Supabase 配置
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

// 測試用戶憑據
const TEST_EMAIL = 'rosariog.almenglo@gmail.com';
const TEST_PASSWORD = 'admin123';

console.log('🔍 開始登入診斷...');
console.log('=' .repeat(50));

async function diagnoseLogin() {
  try {
    // 1. 檢查 Supabase 配置
    console.log('\n1. 檢查 Supabase 配置:');
    console.log(`   URL: ${supabaseUrl ? '✅ 已設定' : '❌ 未設定'}`);
    console.log(`   Anon Key: ${supabaseAnonKey ? '✅ 已設定' : '❌ 未設定'}`);
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.log('❌ Supabase 配置不完整，請檢查 .env.local 文件');
      return;
    }

    // 2. 測試網路連接到 Supabase
    console.log('\n2. 測試網路連接到 Supabase:');
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: {
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`
        }
      });
      console.log(`   連接狀態: ${response.ok ? '✅ 正常' : '❌ 失敗'}`);
      console.log(`   狀態碼: ${response.status}`);
    } catch (error) {
      console.log(`   ❌ 網路連接失敗: ${error.message}`);
      return;
    }

    // 3. 創建 Supabase 客戶端
    console.log('\n3. 創建 Supabase 客戶端:');
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    console.log('   ✅ Supabase 客戶端創建成功');

    // 4. 測試前端 Supabase 直接登入
    console.log('\n4. 測試前端 Supabase 直接登入:');
    console.log(`   測試帳戶: ${TEST_EMAIL}`);
    console.log(`   測試密碼: ${TEST_PASSWORD}`);
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });

    if (error) {
      console.log(`   ❌ 登入失敗: ${error.message}`);
      console.log(`   錯誤代碼: ${error.status || 'N/A'}`);
      
      // 檢查常見錯誤
      if (error.message.includes('Invalid login credentials')) {
        console.log('   💡 可能原因: 帳戶不存在或密碼錯誤');
      } else if (error.message.includes('Email not confirmed')) {
        console.log('   💡 可能原因: 郵箱未確認');
      } else if (error.message.includes('Too many requests')) {
        console.log('   💡 可能原因: 請求過於頻繁，請稍後再試');
      }
    } else {
      console.log('   ✅ 登入成功!');
      console.log(`   用戶 ID: ${data.user?.id}`);
      console.log(`   用戶郵箱: ${data.user?.email}`);
      console.log(`   郵箱已確認: ${data.user?.email_confirmed_at ? '是' : '否'}`);
      console.log(`   最後登入: ${data.user?.last_sign_in_at}`);
    }

    // 5. 檢查當前會話狀態
    console.log('\n5. 檢查當前會話狀態:');
    const { data: session } = await supabase.auth.getSession();
    if (session.session) {
      console.log('   ✅ 會話存在');
      console.log(`   訪問令牌: ${session.session.access_token ? '已獲取' : '未獲取'}`);
      console.log(`   刷新令牌: ${session.session.refresh_token ? '已獲取' : '未獲取'}`);
      console.log(`   過期時間: ${new Date(session.session.expires_at * 1000).toLocaleString()}`);
    } else {
      console.log('   ❌ 無活動會話');
    }

    // 6. 測試前端應用連接
    console.log('\n6. 測試前端應用連接:');
    try {
      const frontendResponse = await fetch('http://localhost:5177/');
      console.log(`   前端狀態: ${frontendResponse.ok ? '✅ 運行中' : '❌ 無法訪問'}`);
    } catch (error) {
      console.log(`   ❌ 前端無法訪問: ${error.message}`);
    }

    // 7. 測試後端 API 連接
    console.log('\n7. 測試後端 API 連接:');
    try {
      const backendResponse = await fetch('http://localhost:3031/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: TEST_PASSWORD
        })
      });
      console.log(`   後端 API 狀態: ${backendResponse.ok ? '✅ 正常' : '❌ 錯誤'}`);
      const backendData = await backendResponse.text();
      console.log(`   後端回應: ${backendData.substring(0, 200)}${backendData.length > 200 ? '...' : ''}`);
    } catch (error) {
      console.log(`   ❌ 後端 API 無法訪問: ${error.message}`);
    }

  } catch (error) {
    console.log(`\n❌ 診斷過程中發生錯誤: ${error.message}`);
    console.log(error.stack);
  }

  console.log('\n' + '=' .repeat(50));
  console.log('🏁 診斷完成');
  
  // 提供修復建議
  console.log('\n💡 修復建議:');
  console.log('1. 如果 Supabase 配置有問題，請檢查 .env.local 文件');
  console.log('2. 如果網路連接失敗，請檢查網路設定和防火牆');
  console.log('3. 如果登入失敗，請確認帳戶存在且密碼正確');
  console.log('4. 如果前端無法訪問，請確認 npm run client:dev 正在運行');
  console.log('5. 如果後端 API 有問題，請確認 npm run server:dev 正在運行');
  console.log('6. 檢查瀏覽器控制台是否有 JavaScript 錯誤');
  console.log('7. 清除瀏覽器快取和 localStorage');
}

// 執行診斷
diagnoseLogin().catch(console.error);