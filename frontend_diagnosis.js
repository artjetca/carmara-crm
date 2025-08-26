#!/usr/bin/env node

/**
 * 前端 Supabase 配置診斷腳本
 * 檢查前端環境變數、Supabase 配置和登入功能
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// 檢查環境變數文件
function checkEnvironmentFiles() {
  logSection('檢查環境變數文件');
  
  const envFiles = ['.env.local', '.env', '.env.development'];
  let foundEnvFile = false;
  let envConfig = {};
  
  for (const envFile of envFiles) {
    const envPath = path.join(__dirname, envFile);
    if (fs.existsSync(envPath)) {
      logSuccess(`找到環境變數文件: ${envFile}`);
      foundEnvFile = true;
      
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        logInfo(`${envFile} 內容:`);
        
        // 解析環境變數
        const lines = envContent.split('\n');
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine && !trimmedLine.startsWith('#')) {
            const [key, ...valueParts] = trimmedLine.split('=');
            if (key && valueParts.length > 0) {
              const value = valueParts.join('=');
              envConfig[key] = value;
              
              if (key.includes('SUPABASE')) {
                if (key.includes('KEY')) {
                  log(`  ${key}=${value.substring(0, 20)}...`, 'blue');
                } else {
                  log(`  ${key}=${value}`, 'blue');
                }
              }
            }
          }
        }
      } catch (error) {
        logError(`讀取 ${envFile} 失敗: ${error.message}`);
      }
    }
  }
  
  if (!foundEnvFile) {
    logError('未找到任何環境變數文件');
    logInfo('建議創建 .env.local 文件並添加 Supabase 配置');
  }
  
  return envConfig;
}

// 檢查前端 Supabase 配置文件
function checkSupabaseConfig() {
  logSection('檢查前端 Supabase 配置');
  
  const supabaseConfigPath = path.join(__dirname, 'src', 'lib', 'supabase.ts');
  
  if (!fs.existsSync(supabaseConfigPath)) {
    logError('未找到 src/lib/supabase.ts 配置文件');
    return false;
  }
  
  logSuccess('找到 Supabase 配置文件');
  
  try {
    const configContent = fs.readFileSync(supabaseConfigPath, 'utf8');
    
    // 檢查是否使用了正確的環境變數
    if (configContent.includes('VITE_SUPABASE_URL')) {
      logSuccess('配置使用 VITE_SUPABASE_URL 環境變數');
    } else {
      logWarning('配置未使用 VITE_SUPABASE_URL 環境變數');
    }
    
    if (configContent.includes('VITE_SUPABASE_ANON_KEY')) {
      logSuccess('配置使用 VITE_SUPABASE_ANON_KEY 環境變數');
    } else {
      logWarning('配置未使用 VITE_SUPABASE_ANON_KEY 環境變數');
    }
    
    // 檢查是否有硬編碼的默認值
    if (configContent.includes('your-project.supabase.co')) {
      logWarning('發現硬編碼的默認 URL');
    }
    
    if (configContent.includes('your-anon-key')) {
      logWarning('發現硬編碼的默認 Anon Key');
    }
    
    logInfo('Supabase 配置文件內容:');
    console.log(configContent);
    
    return true;
  } catch (error) {
    logError(`讀取 Supabase 配置失敗: ${error.message}`);
    return false;
  }
}

// 檢查 Vite 配置
function checkViteConfig() {
  logSection('檢查 Vite 配置');
  
  const viteConfigPath = path.join(__dirname, 'vite.config.ts');
  
  if (!fs.existsSync(viteConfigPath)) {
    logWarning('未找到 vite.config.ts');
    return;
  }
  
  try {
    const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
    
    if (viteConfig.includes('envDir')) {
      logInfo('Vite 配置包含 envDir 設置');
    }
    
    if (viteConfig.includes('envPrefix')) {
      logInfo('Vite 配置包含 envPrefix 設置');
    }
    
    logInfo('Vite 配置內容:');
    console.log(viteConfig);
  } catch (error) {
    logError(`讀取 Vite 配置失敗: ${error.message}`);
  }
}

// 檢查 useAuth hook
function checkAuthHook() {
  logSection('檢查 useAuth Hook');
  
  const authHookPath = path.join(__dirname, 'src', 'hooks', 'useAuth.ts');
  
  if (!fs.existsSync(authHookPath)) {
    logError('未找到 src/hooks/useAuth.ts');
    return false;
  }
  
  logSuccess('找到 useAuth hook');
  
  try {
    const authContent = fs.readFileSync(authHookPath, 'utf8');
    
    if (authContent.includes('signInWithPassword')) {
      logSuccess('useAuth 包含 signInWithPassword 方法');
    } else {
      logWarning('useAuth 未包含 signInWithPassword 方法');
    }
    
    if (authContent.includes('supabase.auth')) {
      logSuccess('useAuth 使用 Supabase Auth');
    } else {
      logWarning('useAuth 未使用 Supabase Auth');
    }
    
    return true;
  } catch (error) {
    logError(`讀取 useAuth hook 失敗: ${error.message}`);
    return false;
  }
}

// 生成修復建議
function generateFixRecommendations(envConfig) {
  logSection('修復建議');
  
  const hasSupabaseUrl = envConfig['VITE_SUPABASE_URL'];
  const hasSupabaseKey = envConfig['VITE_SUPABASE_ANON_KEY'];
  
  if (!hasSupabaseUrl || !hasSupabaseKey) {
    logError('缺少必要的 Supabase 環境變數');
    logInfo('請在 .env.local 文件中添加:');
    console.log('VITE_SUPABASE_URL=https://your-project.supabase.co');
    console.log('VITE_SUPABASE_ANON_KEY=your-anon-key');
  }
  
  if (hasSupabaseUrl && hasSupabaseKey) {
    logSuccess('Supabase 環境變數配置完整');
    
    // 檢查是否使用了默認值
    if (envConfig['VITE_SUPABASE_URL'].includes('your-project')) {
      logWarning('VITE_SUPABASE_URL 使用默認值，請替換為實際的 Supabase URL');
    }
    
    if (envConfig['VITE_SUPABASE_ANON_KEY'].includes('your-anon-key')) {
      logWarning('VITE_SUPABASE_ANON_KEY 使用默認值，請替換為實際的 Anon Key');
    }
  }
  
  logInfo('其他建議:');
  console.log('1. 確保前端開發服務器正在運行 (npm run client:dev)');
  console.log('2. 檢查瀏覽器控制台是否有錯誤信息');
  console.log('3. 驗證 Supabase 項目設置和用戶權限');
  console.log('4. 確認測試用戶 rosariog.almenglo@gmail.com 存在於 Supabase Auth 中');
}

// 主函數
async function main() {
  log('前端 Supabase 配置診斷開始', 'cyan');
  
  try {
    // 1. 檢查環境變數文件
    const envConfig = checkEnvironmentFiles();
    
    // 2. 檢查 Supabase 配置
    checkSupabaseConfig();
    
    // 3. 檢查 Vite 配置
    checkViteConfig();
    
    // 4. 檢查 Auth Hook
    checkAuthHook();
    
    // 5. 生成修復建議
    generateFixRecommendations(envConfig);
    
    logSection('診斷完成');
    logInfo('請查看上述檢查結果和修復建議');
    logInfo('如果問題仍然存在，請檢查瀏覽器控制台錯誤信息');
    
  } catch (error) {
    logError(`診斷過程中發生錯誤: ${error.message}`);
  }
}

// 執行診斷
main().catch(console.error);