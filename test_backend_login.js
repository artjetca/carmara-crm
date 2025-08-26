#!/usr/bin/env node

/**
 * 測試後端登入 API 端點
 */

async function testBackendLogin() {
  console.log('🧪 測試後端登入 API...');
  
  try {
    const response = await fetch('http://localhost:3031/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'rosariog.almenglo@gmail.com',
        password: 'admin123'
      })
    });
    
    const result = await response.json();
    
    console.log('📊 API 回應狀態:', response.status);
    console.log('📋 API 回應內容:', JSON.stringify(result, null, 2));
    
    if (response.ok && result.success) {
      console.log('✅ 後端登入 API 測試成功!');
      console.log('👤 用戶 ID:', result.data?.user?.id);
      console.log('📧 Email:', result.data?.user?.email);
    } else {
      console.log('❌ 後端登入 API 測試失敗');
      console.log('錯誤:', result.error || '未知錯誤');
    }
    
  } catch (error) {
    console.error('❌ 網路錯誤:', error.message);
  }
}

testBackendLogin();