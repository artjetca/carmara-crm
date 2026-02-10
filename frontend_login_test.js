import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ 缺少前端環境變數');
  process.exit(1);
}

// 模擬前端環境的 Supabase 客戶端
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const TARGET_EMAIL = 'rosariog.almenglo@gmail.com';
const TARGET_PASSWORD = 'admin123';

async function testFrontendLogin() {
  console.log('🧪 測試前端登入流程...');
  console.log('Email:', TARGET_EMAIL);
  console.log('Password:', TARGET_PASSWORD);
  console.log('Supabase URL:', supabaseUrl);
  console.log('Anon Key:', supabaseAnonKey.substring(0, 20) + '...');
  console.log('=' .repeat(50));

  try {
    // 1. 測試直接登入
    console.log('\n1️⃣ 測試 signInWithPassword');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: TARGET_EMAIL,
      password: TARGET_PASSWORD
    });

    if (error) {
      console.error('❌ 登入失敗:');
      console.error('錯誤代碼:', error.status);
      console.error('錯誤訊息:', error.message);
      console.error('完整錯誤:', JSON.stringify(error, null, 2));
      
      // 檢查常見錯誤類型
      if (error.message.includes('Invalid login credentials')) {
        console.log('\n🔍 "Invalid login credentials" 錯誤分析:');
        console.log('- 可能是密碼不正確');
        console.log('- 可能是 Email 不存在');
        console.log('- 可能是帳戶被禁用');
      }
      
      if (error.message.includes('Email not confirmed')) {
        console.log('\n🔍 "Email not confirmed" 錯誤分析:');
        console.log('- Email 地址需要確認');
        console.log('- 檢查 Supabase 認證設置中的 Email 確認要求');
      }
      
      if (error.message.includes('Too many requests')) {
        console.log('\n🔍 "Too many requests" 錯誤分析:');
        console.log('- 登入嘗試次數過多');
        console.log('- 需要等待一段時間後再試');
      }
    } else {
      console.log('✅ 登入成功!');
      console.log('用戶 ID:', data.user?.id);
      console.log('Email:', data.user?.email);
      console.log('Session 存在:', !!data.session);
      console.log('Access Token 存在:', !!data.session?.access_token);
    }

    // 2. 測試獲取當前 session
    console.log('\n2️⃣ 測試 getSession');
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      console.error('❌ 獲取 Session 失敗:', sessionError.message);
    } else {
      console.log('Session 狀態:', sessionData.session ? '存在' : '不存在');
      if (sessionData.session) {
        console.log('Session 用戶:', sessionData.session.user?.email);
        console.log('Session 過期時間:', new Date(sessionData.session.expires_at * 1000));
      }
    }

    // 3. 測試獲取用戶資料
    console.log('\n3️⃣ 測試 getUser');
    const { data: userData, error: userError } = await supabase.auth.getUser();
    
    if (userError) {
      console.error('❌ 獲取用戶失敗:', userError.message);
    } else {
      console.log('用戶狀態:', userData.user ? '已登入' : '未登入');
      if (userData.user) {
        console.log('用戶 Email:', userData.user.email);
        console.log('Email 已確認:', userData.user.email_confirmed_at ? '是' : '否');
      }
    }

    // 4. 測試訪問受保護的資源
    console.log('\n4️⃣ 測試訪問 profiles 表');
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('email', TARGET_EMAIL)
      .single();
    
    if (profileError) {
      console.error('❌ 訪問 profiles 失敗:', profileError.message);
    } else {
      console.log('✅ 成功訪問 profiles');
      console.log('Profile 數據:', JSON.stringify(profileData, null, 2));
    }

    // 5. 測試登出
    console.log('\n5️⃣ 測試登出');
    const { error: signOutError } = await supabase.auth.signOut();
    
    if (signOutError) {
      console.error('❌ 登出失敗:', signOutError.message);
    } else {
      console.log('✅ 登出成功');
    }

    // 6. 確認登出後狀態
    console.log('\n6️⃣ 確認登出後狀態');
    const { data: finalSession } = await supabase.auth.getSession();
    console.log('登出後 Session:', finalSession.session ? '仍存在' : '已清除');

  } catch (error) {
    console.error('❌ 測試過程中發生錯誤:', error.message);
    console.error('完整錯誤:', error);
  }

  console.log('\n' + '='.repeat(50));
  console.log('🏁 前端登入測試完成');
  
  console.log('\n💡 如果後端測試成功但前端測試失敗，可能的原因:');
  console.log('1. 前端使用的 Supabase URL 或 Anon Key 不正確');
  console.log('2. 瀏覽器快取問題');
  console.log('3. CORS 設置問題');
  console.log('4. 網路連接問題');
  console.log('5. Supabase 專案設置中的認證配置');
}

testFrontendLogin().catch(console.error);