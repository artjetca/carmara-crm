#!/usr/bin/env node

// 測試後端環境變數載入
import fetch from 'node-fetch';

const BACKEND_URL = 'http://localhost:3031';

console.log('🔍 測試後端環境變數載入...');
console.log('=' .repeat(50));

async function testBackendEnv() {
  try {
    // 創建一個測試端點來檢查後端的環境變數
    console.log('\n1. 測試後端環境變數:');
    
    // 先測試一個簡單的 API 調用來確認後端正在運行
    const healthResponse = await fetch(`${BACKEND_URL}/api/health`);
    console.log(`   健康檢查狀態: ${healthResponse.status}`);
    
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log(`   健康檢查回應: ${JSON.stringify(healthData)}`);
    }

    // 測試登入 API 並檢查詳細錯誤
    console.log('\n2. 詳細測試登入 API:');
    const loginResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email: 'rosariog.almenglo@gmail.com',
        password: 'admin123'
      })
    });

    console.log(`   狀態碼: ${loginResponse.status}`);
    console.log(`   狀態文字: ${loginResponse.statusText}`);
    
    // 檢查回應標頭
    console.log('   回應標頭:');
    for (const [key, value] of loginResponse.headers.entries()) {
      console.log(`     ${key}: ${value}`);
    }
    
    const responseText = await loginResponse.text();
    console.log(`   回應內容: ${responseText}`);
    
    // 嘗試使用錯誤的憑據來比較
    console.log('\n3. 測試錯誤憑據:');
    const wrongResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email: 'wrong@example.com',
        password: 'wrongpassword'
      })
    });

    console.log(`   錯誤憑據狀態碼: ${wrongResponse.status}`);
    const wrongResponseText = await wrongResponse.text();
    console.log(`   錯誤憑據回應: ${wrongResponseText}`);

    // 測試缺少參數的情況
    console.log('\n4. 測試缺少參數:');
    const missingResponse = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        email: 'rosariog.almenglo@gmail.com'
        // 缺少 password
      })
    });

    console.log(`   缺少參數狀態碼: ${missingResponse.status}`);
    const missingResponseText = await missingResponse.text();
    console.log(`   缺少參數回應: ${missingResponseText}`);

  } catch (error) {
    console.log(`\n❌ 測試過程中發生錯誤: ${error.message}`);
    console.log(error.stack);
  }

  console.log('\n' + '=' .repeat(50));
  console.log('🏁 測試完成');
}

// 執行測試
testBackendEnv().catch(console.error);