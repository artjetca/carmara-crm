#!/usr/bin/env node

/**
 * 測試登入修復結果
 * 驗證前端到 Supabase 的連接是否正常
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// 載入環境變數
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ 缺少 Supabase 配置');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testLoginFix() {
    console.log('🔍 測試登入修復結果...');
    console.log(`📡 Supabase URL: ${supabaseUrl}`);
    
    try {
        // 測試 Supabase 連接
        console.log('\n1. 測試 Supabase 連接...');
        const { data, error } = await supabase.auth.getSession();
        if (error) {
            console.log(`⚠️  會話檢查警告: ${error.message}`);
        } else {
            console.log('✅ Supabase 連接正常');
        }
        
        // 測試登入功能
        console.log('\n2. 測試登入功能...');
        const testEmail = 'rosariog.almenglo@gmail.com';
        const testPassword = 'admin123';
        
        console.log(`📧 測試帳號: ${testEmail}`);
        
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email: testEmail,
            password: testPassword
        });
        
        if (loginError) {
            console.log(`❌ 登入失敗: ${loginError.message}`);
            console.log(`🔍 錯誤代碼: ${loginError.status || 'N/A'}`);
            
            // 檢查是否是網路連接問題
            if (loginError.message.includes('fetch') || loginError.message.includes('network')) {
                console.log('🌐 這可能是網路連接問題，請檢查:');
                console.log('   - 後端服務器是否正在運行');
                console.log('   - 防火牆設置');
                console.log('   - 網路連接');
            }
        } else {
            console.log('✅ 登入成功!');
            console.log(`👤 用戶: ${loginData.user?.email}`);
            
            // 登出
            await supabase.auth.signOut();
            console.log('🚪 已登出');
        }
        
        // 測試後端 API 連接
        console.log('\n3. 測試後端 API 連接...');
        try {
            const response = await fetch('http://localhost:3030/api/health');
            if (response.ok) {
                console.log('✅ 後端 API 連接正常');
            } else {
                console.log(`⚠️  後端 API 回應異常: ${response.status}`);
            }
        } catch (fetchError) {
            console.log(`❌ 後端 API 連接失敗: ${fetchError.message}`);
        }
        
    } catch (error) {
        console.error('❌ 測試過程中發生錯誤:', error.message);
    }
    
    console.log('\n🎉 測試完成!');
    console.log('\n📋 如果登入仍有問題，請:');
    console.log('   1. 檢查瀏覽器開發者工具的網路標籤');
    console.log('   2. 清除瀏覽器快取和 localStorage');
    console.log('   3. 嘗試使用無痕模式');
    console.log('   4. 檢查 backend.log 日誌文件');
}

testLoginFix().catch(console.error);