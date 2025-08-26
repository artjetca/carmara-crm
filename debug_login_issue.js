#!/usr/bin/env node

/**
 * 登入問題調試腳本
 * 基於診斷結果提供具體的修復建議
 */

import fs from 'fs';
import path from 'path';

// 顏色輸出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
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

function logFix(message) {
  log(`🔧 ${message}`, 'magenta');
}

// 檢查文件是否存在
function checkFileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

// 讀取文件內容
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return null;
  }
}

// 檢查環境變數文件
function checkEnvFiles() {
  logSection('檢查環境變數文件');
  
  const envFiles = ['.env.local', '.env', '.env.development'];
  let foundEnvFile = false;
  
  for (const envFile of envFiles) {
    if (checkFileExists(envFile)) {
      logSuccess(`找到環境變數文件: ${envFile}`);
      foundEnvFile = true;
      
      const content = readFile(envFile);
      if (content) {
        const hasSupabaseUrl = content.includes('VITE_SUPABASE_URL');
        const hasSupabaseKey = content.includes('VITE_SUPABASE_ANON_KEY');
        
        if (hasSupabaseUrl && hasSupabaseKey) {
          logSuccess('環境變數配置完整');
        } else {
          logWarning('環境變數配置不完整');
          if (!hasSupabaseUrl) logError('缺少 VITE_SUPABASE_URL');
          if (!hasSupabaseKey) logError('缺少 VITE_SUPABASE_ANON_KEY');
        }
      }
    }
  }
  
  if (!foundEnvFile) {
    logError('未找到任何環境變數文件');
    return false;
  }
  
  return true;
}

// 檢查 Vite 配置
function checkViteConfig() {
  logSection('檢查 Vite 配置');
  
  const viteConfigPath = 'vite.config.ts';
  
  if (!checkFileExists(viteConfigPath)) {
    logWarning('未找到 vite.config.ts');
    return false;
  }
  
  const content = readFile(viteConfigPath);
  if (!content) {
    logError('無法讀取 vite.config.ts');
    return false;
  }
  
  logSuccess('找到 vite.config.ts');
  
  // 檢查是否有環境變數相關配置
  if (content.includes('loadEnv') || content.includes('define')) {
    logInfo('發現環境變數相關配置');
  } else {
    logWarning('未發現明確的環境變數配置');
  }
  
  return true;
}

// 檢查前端登入組件
function checkLoginComponents() {
  logSection('檢查前端登入組件');
  
  const componentsToCheck = [
    'src/hooks/useAuth.ts',
    'src/lib/supabase.ts',
    'src/pages/Login.tsx',
    'src/components/LoginForm.tsx'
  ];
  
  let hasIssues = false;
  
  for (const componentPath of componentsToCheck) {
    if (checkFileExists(componentPath)) {
      logSuccess(`找到組件: ${componentPath}`);
      
      const content = readFile(componentPath);
      if (content) {
        // 檢查是否使用了正確的環境變數
        if (content.includes('import.meta.env.VITE_SUPABASE_URL') && 
            content.includes('import.meta.env.VITE_SUPABASE_ANON_KEY')) {
          logSuccess(`${componentPath} 使用正確的環境變數`);
        } else if (content.includes('VITE_SUPABASE')) {
          logWarning(`${componentPath} 環境變數使用可能有問題`);
          hasIssues = true;
        }
        
        // 檢查是否有硬編碼的 URL 或 Key
        if (content.includes('https://') && content.includes('supabase.co')) {
          logWarning(`${componentPath} 可能包含硬編碼的 Supabase URL`);
          hasIssues = true;
        }
      }
    } else {
      logInfo(`組件不存在: ${componentPath}`);
    }
  }
  
  return !hasIssues;
}

// 檢查包管理器和依賴
function checkDependencies() {
  logSection('檢查依賴和包管理器');
  
  if (!checkFileExists('package.json')) {
    logError('未找到 package.json');
    return false;
  }
  
  const packageJson = readFile('package.json');
  if (!packageJson) {
    logError('無法讀取 package.json');
    return false;
  }
  
  try {
    const pkg = JSON.parse(packageJson);
    
    // 檢查 Supabase 依賴
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    
    if (deps['@supabase/supabase-js']) {
      logSuccess(`Supabase 依賴版本: ${deps['@supabase/supabase-js']}`);
    } else {
      logError('未找到 @supabase/supabase-js 依賴');
      return false;
    }
    
    // 檢查 Vite 依賴
    if (deps['vite']) {
      logSuccess(`Vite 版本: ${deps['vite']}`);
    } else {
      logWarning('未找到 Vite 依賴');
    }
    
  } catch (error) {
    logError('package.json 格式錯誤');
    return false;
  }
  
  return true;
}

// 生成修復建議
function generateFixRecommendations() {
  logSection('修復建議');
  
  log('基於診斷結果，以下是可能的解決方案:', 'cyan');
  console.log();
  
  logFix('1. 重新啟動前端開發服務器');
  console.log('   停止當前的 npm run client:dev');
  console.log('   重新運行 npm run client:dev');
  console.log();
  
  logFix('2. 清除瀏覽器緩存和 localStorage');
  console.log('   打開瀏覽器開發者工具 (F12)');
  console.log('   Application > Storage > Clear storage');
  console.log('   或使用無痕模式測試');
  console.log();
  
  logFix('3. 檢查瀏覽器控制台錯誤');
  console.log('   打開 http://localhost:5177/');
  console.log('   按 F12 打開開發者工具');
  console.log('   查看 Console 標籤中的錯誤信息');
  console.log('   查看 Network 標籤中的網路請求');
  console.log();
  
  logFix('4. 驗證環境變數在瀏覽器中的載入');
  console.log('   在瀏覽器控制台中執行:');
  console.log('   console.log(import.meta.env.VITE_SUPABASE_URL)');
  console.log('   console.log(import.meta.env.VITE_SUPABASE_ANON_KEY)');
  console.log();
  
  logFix('5. 測試 Supabase 連接');
  console.log('   訪問 http://localhost:5177/frontend_env_test.html');
  console.log('   點擊 "測試 Supabase 連接" 按鈕');
  console.log('   點擊 "測試登入" 按鈕');
  console.log();
  
  logFix('6. 檢查網路和 CORS 設置');
  console.log('   確認 Supabase 項目設置中的 CORS 配置');
  console.log('   檢查是否有防火牆或代理阻擋請求');
  console.log();
  
  logFix('7. 重新安裝依賴 (如果其他方法都失敗)');
  console.log('   rm -rf node_modules package-lock.json');
  console.log('   npm install');
  console.log();
  
  log('如果問題仍然存在，請提供以下信息:', 'yellow');
  console.log('1. 瀏覽器控制台的完整錯誤信息');
  console.log('2. Network 標籤中失敗的請求詳情');
  console.log('3. 前端環境變數測試頁面的結果');
}

// 主函數
function main() {
  log('登入問題診斷和修復建議', 'cyan');
  log('基於之前的診斷結果，Supabase 後端功能正常，問題可能在前端', 'blue');
  
  try {
    // 執行各項檢查
    const envOk = checkEnvFiles();
    const viteOk = checkViteConfig();
    const componentsOk = checkLoginComponents();
    const depsOk = checkDependencies();
    
    // 生成修復建議
    generateFixRecommendations();
    
    // 總結
    logSection('診斷總結');
    
    if (envOk && viteOk && componentsOk && depsOk) {
      logSuccess('所有配置檢查通過，問題可能在運行時環境');
      logInfo('建議按照上述修復建議逐一嘗試');
    } else {
      logWarning('發現一些配置問題，請先修復這些問題');
    }
    
  } catch (error) {
    logError(`診斷過程中發生錯誤: ${error.message}`);
  }
}

// 執行診斷
main();