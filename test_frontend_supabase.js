#!/usr/bin/env node

/**
 * 測試前端 Supabase 直接登入
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// 載入環境變數
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ 缺少 Supabase 環境變數');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testFrontendLogin() {
  console.log('🧪 測試前端 Supabase 直接登入...');
  console.log('📧 Email: rosariog.almenglo@gmail.com');
  console.log('🔑 Password: admin123');
  console.log('🌐 Supabase URL:', supabaseUrl);
  console.log('🔐 Anon Key:', supabaseAnonKey.substring(0, 20) + '...');
  console.log('=' .repeat(50));
  
  try {
    // 先登出確保乾淨狀態
    await supabase.auth.signOut();
    
    // 嘗試登入
    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'rosariog.almenglo@gmail.com',
      password: 'admin123'
    });
    
    if (error) {
      console.log('❌ 前端登入失敗');
      console.log('錯誤代碼:', error.status || 'N/A');
      console.log('錯誤訊息:', error.message);
      console.log('錯誤類型:', error.name || 'N/A');
      
      if (error.message.includes('Invalid login credentials')) {
        console.log('\n🔍 "Invalid login credentials" 錯誤分析:');
        console.log('- 可能是密碼錯誤');
        console.log('- 可能是用戶不存在');
        console.log('- 可能是郵件未確認');
      }
    } else {
      console.log('✅ 前端登入成功!');
      console.log('👤 用戶 ID:', data.user?.id);
      console.log('📧 Email:', data.user?.email);
      console.log('📅 Email 確認時間:', data.user?.email_confirmed_at);
      console.log('🎫 Session 存在:', !!data.session);
    }
    
  } catch (error) {
    console.error('❌ 網路錯誤:', error.message);
  }
}

testFrontendLogin();