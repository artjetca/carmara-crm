#!/usr/bin/env node

// 測試後端 API 登入功能
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// 載入環境變數
dotenv.config({ path: '.env.local' });

const TEST_EMAIL = 'rosariog.almenglo@gmail.com';
const TEST_PASSWORD = 'admin123';
const BACKEND_URL = 'http://localhost:3031';

console.log('🧪 測試後端 API 登入功能...');
console.log('=' .repeat(50));

async function testBackendAPI() {
  try {
    console.log('\n1. 測試後端服務器連接:');
    const healthResponse = await fetch(`${BACKEND_URL}/`);
    console.log(`   狀態: ${healthResponse.ok ? '✅ 正常' : '❌ 失敗'}`);
    console.log(`   狀態碼: ${healthResponse.status}`);
    
    if (healthResponse.ok) {
      const healthText = await healthResponse.text();
      console.log(`   回應: ${healthText.substring(0, 100)}`);
    }

    console.log('\n2. 測試後端登入 API:');
    console.log(`   URL: ${BACKEND_URL}/api/auth/login`);
    console.log(`   測試帳戶: ${TEST_EMAIL}`);
    console.log(`   測試密碼: ${TEST_PASSWORD}`);
    
    const loginResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      })
    });

    console.log(`   狀態碼: ${loginResponse.status}`);
    console.log(`   狀態: ${loginResponse.ok ? '✅ 成功' : '❌ 失敗'}`);
    
    const responseText = await loginResponse.text();
    console.log(`   回應內容: ${responseText}`);
    
    // 嘗試解析 JSON
    try {
      const responseJson = JSON.parse(responseText);
      console.log(`   解析後的回應:`);
      console.log(`     成功: ${responseJson.success}`);
      console.log(`     錯誤: ${responseJson.error || '無'}`);
      if (responseJson.data) {
        console.log(`     用戶 ID: ${responseJson.data.user?.id || '無'}`);
        console.log(`     用戶郵箱: ${responseJson.data.user?.email || '無'}`);
      }
    } catch (parseError) {
      console.log(`   ❌ JSON 解析失敗: ${parseError.message}`);
    }

    console.log('\n3. 檢查環境變數:');
    console.log(`   VITE_SUPABASE_URL: ${process.env.VITE_SUPABASE_URL ? '✅ 已設定' : '❌ 未設定'}`);
    console.log(`   VITE_SUPABASE_ANON_KEY: ${process.env.VITE_SUPABASE_ANON_KEY ? '✅ 已設定' : '❌ 未設定'}`);
    console.log(`   SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ 已設定' : '❌ 未設定'}`);

    console.log('\n4. 測試其他 API 端點:');
    try {
      const apiResponse = await fetch(`${BACKEND_URL}/api`);
      console.log(`   /api 端點狀態: ${apiResponse.status}`);
    } catch (error) {
      console.log(`   /api 端點錯誤: ${error.message}`);
    }

  } catch (error) {
    console.log(`\n❌ 測試過程中發生錯誤: ${error.message}`);
    console.log(error.stack);
  }

  console.log('\n' + '=' .repeat(50));
  console.log('🏁 測試完成');
}

// 執行測試
testBackendAPI().catch(console.error);