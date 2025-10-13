#!/usr/bin/env node

/**
 * 全面的登入問題診斷腳本
 * 檢查 Supabase 整合後的登入功能問題
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// 載入環境變數
dotenv.config({ path: '.env.local' });

const TEST_EMAIL = 'rosariog.almenglo@gmail.com';
const TEST_PASSWORD = 'admin123';
const BACKEND_PORT = 3031;
const FRONTEND_PORT = 5177;

class LoginDiagnostics {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      environment: {},
      supabaseConfig: {},
      frontendTests: {},
      backendTests: {},
      conflicts: {},
      recommendations: []
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = type === 'error' ? '❌' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }

  // 檢查環境變數配置
  checkEnvironmentConfig() {
    this.log('檢查環境變數配置...', 'info');
    
    const requiredVars = [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY'
    ];

    const envConfig = {};
    let allPresent = true;

    requiredVars.forEach(varName => {
      const value = process.env[varName];
      envConfig[varName] = {
        present: !!value,
        length: value ? value.length : 0,
        preview: value ? `${value.substring(0, 10)}...` : 'undefined'
      };
      
      if (!value) {
        this.log(`缺少環境變數: ${varName}`, 'error');
        allPresent = false;
      } else {
        this.log(`環境變數 ${varName}: 已設定 (${value.length} 字符)`, 'success');
      }
    });

    this.results.environment = {
      configComplete: allPresent,
      variables: envConfig,
      dotenvLoaded: fs.existsSync('.env.local')
    };

    return allPresent;
  }

  // 測試 Supabase 連接
  async testSupabaseConnection() {
    this.log('測試 Supabase 連接...', 'info');
    
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase 配置不完整');
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      
      // 測試基本連接
      const { data, error } = await supabase.from('customers').select('count', { count: 'exact', head: true });
      
      if (error && error.code !== 'PGRST116') { // PGRST116 是權限錯誤，但表示連接正常
        throw error;
      }

      this.log('Supabase 連接成功', 'success');
      this.results.supabaseConfig = {
        connectionSuccess: true,
        url: supabaseUrl,
        error: null
      };
      
      return supabase;
    } catch (error) {
      this.log(`Supabase 連接失敗: ${error.message}`, 'error');
      this.results.supabaseConfig = {
        connectionSuccess: false,
        error: error.message
      };
      return null;
    }
  }

  // 測試前端 Supabase 直接登入
  async testFrontendSupabaseLogin(supabase) {
    this.log('測試前端 Supabase 直接登入...', 'info');
    
    if (!supabase) {
      this.results.frontendTests.supabaseDirectLogin = {
        success: false,
        error: 'Supabase 客戶端未初始化'
      };
      return false;
    }

    try {
      // 測試直接登入
      const { data, error } = await supabase.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      });

      if (error) {
        throw error;
      }

      this.log('前端 Supabase 直接登入成功', 'success');
      this.results.frontendTests.supabaseDirectLogin = {
        success: true,
        user: {
          id: data.user?.id,
          email: data.user?.email,
          confirmed: data.user?.email_confirmed_at ? true : false
        },
        session: {
          accessToken: data.session?.access_token ? 'present' : 'missing',
          refreshToken: data.session?.refresh_token ? 'present' : 'missing'
        }
      };

      // 登出以清理狀態
      await supabase.auth.signOut();
      return true;
    } catch (error) {
      this.log(`前端 Supabase 直接登入失敗: ${error.message}`, 'error');
      this.results.frontendTests.supabaseDirectLogin = {
        success: false,
        error: error.message,
        errorCode: error.status || error.code
      };
      return false;
    }
  }

  // 測試後端服務狀態
  async testBackendHealth() {
    this.log('檢查後端服務狀態...', 'info');
    
    try {
      const response = await fetch(`http://localhost:${BACKEND_PORT}/api/health`);
      const data = await response.json();
      
      if (response.ok) {
        this.log('後端健康檢查通過', 'success');
        this.results.backendTests.health = {
          success: true,
          status: response.status,
          data: data
        };
        return true;
      } else {
        throw new Error(`健康檢查失敗: ${response.status}`);
      }
    } catch (error) {
      this.log(`後端健康檢查失敗: ${error.message}`, 'error');
      this.results.backendTests.health = {
        success: false,
        error: error.message
      };
      return false;
    }
  }

  // 測試後端登入 API
  async testBackendLogin() {
    this.log('測試後端登入 API...', 'info');
    
    try {
      const response = await fetch(`http://localhost:${BACKEND_PORT}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: TEST_EMAIL,
          password: TEST_PASSWORD
        })
      });

      const responseText = await response.text();
      let data;
      
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { rawResponse: responseText };
      }

      if (response.ok) {
        this.log('後端登入 API 成功', 'success');
        this.results.backendTests.loginAPI = {
          success: true,
          status: response.status,
          data: data
        };
        return true;
      } else {
        this.log(`後端登入 API 失敗: ${response.status} - ${data.message || responseText}`, 'error');
        this.results.backendTests.loginAPI = {
          success: false,
          status: response.status,
          error: data.message || responseText,
          data: data
        };
        return false;
      }
    } catch (error) {
      this.log(`後端登入 API 請求失敗: ${error.message}`, 'error');
      this.results.backendTests.loginAPI = {
        success: false,
        error: error.message
      };
      return false;
    }
  }

  // 檢查前後端配置衝突
  async checkConfigConflicts() {
    this.log('檢查前後端配置衝突...', 'info');
    
    const conflicts = [];
    
    // 檢查前端配置文件
    try {
      const frontendSupabaseConfig = fs.readFileSync('src/lib/supabase.ts', 'utf8');
      
      // 檢查是否硬編碼了配置
      if (frontendSupabaseConfig.includes('https://') && !frontendSupabaseConfig.includes('import.meta.env')) {
        conflicts.push('前端可能存在硬編碼的 Supabase URL');
      }
      
      if (frontendSupabaseConfig.includes('eyJ') && !frontendSupabaseConfig.includes('import.meta.env')) {
        conflicts.push('前端可能存在硬編碼的 Supabase Key');
      }
    } catch (error) {
      conflicts.push('無法讀取前端 Supabase 配置文件');
    }

    // 檢查後端配置
    try {
      const backendAuthConfig = fs.readFileSync('api/routes/auth.ts', 'utf8');
      
      // 檢查環境變數使用
      if (!backendAuthConfig.includes('process.env.VITE_SUPABASE_URL')) {
        conflicts.push('後端可能未正確使用 VITE_SUPABASE_URL 環境變數');
      }
      
      if (!backendAuthConfig.includes('process.env.VITE_SUPABASE_ANON_KEY')) {
        conflicts.push('後端可能未正確使用 VITE_SUPABASE_ANON_KEY 環境變數');
      }
    } catch (error) {
      conflicts.push('無法讀取後端認證配置文件');
    }

    this.results.conflicts = {
      found: conflicts.length > 0,
      issues: conflicts
    };

    if (conflicts.length > 0) {
      conflicts.forEach(conflict => this.log(conflict, 'warning'));
    } else {
      this.log('未發現明顯的配置衝突', 'success');
    }
  }

  // 生成修復建議
  generateRecommendations() {
    this.log('生成修復建議...', 'info');
    
    const recommendations = [];

    // 環境變數建議
    if (!this.results.environment.configComplete) {
      recommendations.push({
        priority: 'high',
        category: '環境配置',
        issue: '環境變數配置不完整',
        solution: '確保 .env.local 文件包含所有必要的 Supabase 配置變數',
        commands: [
          'cp .env.example .env.local',
          '編輯 .env.local 並填入正確的 Supabase 配置'
        ]
      });
    }

    // Supabase 連接建議
    if (!this.results.supabaseConfig.connectionSuccess) {
      recommendations.push({
        priority: 'high',
        category: 'Supabase 連接',
        issue: 'Supabase 連接失敗',
        solution: '檢查 Supabase URL 和 API Key 是否正確',
        commands: [
          '登入 Supabase Dashboard 確認項目配置',
          '檢查 API Keys 是否有效且未過期'
        ]
      });
    }

    // 前端登入建議
    if (this.results.frontendTests.supabaseDirectLogin && !this.results.frontendTests.supabaseDirectLogin.success) {
      const error = this.results.frontendTests.supabaseDirectLogin.error;
      
      if (error.includes('Invalid login credentials')) {
        recommendations.push({
          priority: 'high',
          category: '用戶認證',
          issue: '登入憑證無效',
          solution: '檢查用戶帳戶是否存在且密碼正確',
          commands: [
            'node check_user_exists.js',
            'node reset_admin_password.js'
          ]
        });
      }
      
      if (error.includes('Email not confirmed')) {
        recommendations.push({
          priority: 'medium',
          category: '用戶認證',
          issue: '用戶郵箱未確認',
          solution: '確認用戶郵箱或在 Supabase Dashboard 中手動確認',
          commands: [
            '在 Supabase Dashboard > Authentication > Users 中確認用戶'
          ]
        });
      }
    }

    // 後端 API 建議
    if (this.results.backendTests.loginAPI && !this.results.backendTests.loginAPI.success) {
      recommendations.push({
        priority: 'high',
        category: '後端 API',
        issue: '後端登入 API 失敗',
        solution: '檢查後端 Supabase 客戶端配置和環境變數載入',
        commands: [
          '檢查 api/app.ts 中的 dotenv 配置',
          '確認後端使用正確的環境變數'
        ]
      });
    }

    // 配置衝突建議
    if (this.results.conflicts.found) {
      recommendations.push({
        priority: 'medium',
        category: '配置衝突',
        issue: '前後端配置可能存在衝突',
        solution: '統一前後端的 Supabase 配置來源',
        commands: [
          '確保前後端都使用相同的環境變數',
          '移除任何硬編碼的配置值'
        ]
      });
    }

    this.results.recommendations = recommendations;
    
    if (recommendations.length === 0) {
      this.log('所有測試通過，未發現問題', 'success');
    } else {
      this.log(`生成了 ${recommendations.length} 個修復建議`, 'info');
    }
  }

  // 生成診斷報告
  generateReport() {
    const reportPath = 'login_diagnosis_report.md';
    
    let report = `# 登入功能診斷報告\n\n`;
    report += `**生成時間**: ${this.results.timestamp}\n\n`;
    
    // 摘要
    report += `## 診斷摘要\n\n`;
    const envOk = this.results.environment.configComplete;
    const supabaseOk = this.results.supabaseConfig.connectionSuccess;
    const frontendOk = this.results.frontendTests.supabaseDirectLogin?.success;
    const backendOk = this.results.backendTests.loginAPI?.success;
    
    report += `- 環境配置: ${envOk ? '✅ 正常' : '❌ 異常'}\n`;
    report += `- Supabase 連接: ${supabaseOk ? '✅ 正常' : '❌ 異常'}\n`;
    report += `- 前端登入: ${frontendOk ? '✅ 正常' : '❌ 異常'}\n`;
    report += `- 後端登入: ${backendOk ? '✅ 正常' : '❌ 異常'}\n\n`;
    
    // 詳細結果
    report += `## 詳細診斷結果\n\n`;
    report += `### 環境配置\n\n`;
    report += `\`\`\`json\n${JSON.stringify(this.results.environment, null, 2)}\n\`\`\`\n\n`;
    
    report += `### Supabase 配置\n\n`;
    report += `\`\`\`json\n${JSON.stringify(this.results.supabaseConfig, null, 2)}\n\`\`\`\n\n`;
    
    report += `### 前端測試\n\n`;
    report += `\`\`\`json\n${JSON.stringify(this.results.frontendTests, null, 2)}\n\`\`\`\n\n`;
    
    report += `### 後端測試\n\n`;
    report += `\`\`\`json\n${JSON.stringify(this.results.backendTests, null, 2)}\n\`\`\`\n\n`;
    
    // 修復建議
    if (this.results.recommendations.length > 0) {
      report += `## 修復建議\n\n`;
      
      this.results.recommendations.forEach((rec, index) => {
        report += `### ${index + 1}. ${rec.category} - ${rec.issue}\n\n`;
        report += `**優先級**: ${rec.priority}\n\n`;
        report += `**解決方案**: ${rec.solution}\n\n`;
        
        if (rec.commands && rec.commands.length > 0) {
          report += `**建議執行的命令**:\n`;
          rec.commands.forEach(cmd => {
            report += `\`\`\`bash\n${cmd}\n\`\`\`\n\n`;
          });
        }
      });
    }
    
    // 完整診斷數據
    report += `## 完整診斷數據\n\n`;
    report += `\`\`\`json\n${JSON.stringify(this.results, null, 2)}\n\`\`\`\n`;
    
    fs.writeFileSync(reportPath, report);
    this.log(`診斷報告已生成: ${reportPath}`, 'success');
  }

  // 執行完整診斷
  async runFullDiagnosis() {
    console.log('🔍 開始執行登入功能全面診斷...\n');
    
    // 1. 檢查環境配置
    const envOk = this.checkEnvironmentConfig();
    console.log('');
    
    // 2. 測試 Supabase 連接
    const supabase = await this.testSupabaseConnection();
    console.log('');
    
    // 3. 測試前端 Supabase 直接登入
    await this.testFrontendSupabaseLogin(supabase);
    console.log('');
    
    // 4. 測試後端服務
    await this.testBackendHealth();
    console.log('');
    
    // 5. 測試後端登入 API
    await this.testBackendLogin();
    console.log('');
    
    // 6. 檢查配置衝突
    await this.checkConfigConflicts();
    console.log('');
    
    // 7. 生成修復建議
    this.generateRecommendations();
    console.log('');
    
    // 8. 生成報告
    this.generateReport();
    
    console.log('\n🎯 診斷完成！請查看生成的報告文件以獲取詳細信息。');
  }
}

// 執行診斷
if (import.meta.url === `file://${process.argv[1]}`) {
  const diagnostics = new LoginDiagnostics();
  diagnostics.runFullDiagnosis().catch(error => {
    console.error('診斷過程中發生錯誤:', error);
    process.exit(1);
  });
}

export default LoginDiagnostics;