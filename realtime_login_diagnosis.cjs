#!/usr/bin/env node

/**
 * 實時登入診斷腳本
 * 檢查前端登入功能的各個方面
 */

const fs = require('fs');
const path = require('path');

// 顏色輸出
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bright: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

function logSubsection(title) {
  console.log('\n' + '-'.repeat(40));
  log(title, 'cyan');
  console.log('-'.repeat(40));
}

async function checkEnvironmentVariables() {
  logSubsection('檢查環境變數');
  
  const envPath = path.join(process.cwd(), '.env.local');
  
  if (!fs.existsSync(envPath)) {
    log('❌ .env.local 文件不存在', 'red');
    return false;
  }
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
  
  const requiredVars = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
  const foundVars = {};
  
  envLines.forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      foundVars[key.trim()] = value.trim();
    }
  });
  
  let allFound = true;
  requiredVars.forEach(varName => {
    if (foundVars[varName]) {
      log(`✅ ${varName}: ${foundVars[varName].substring(0, 20)}...`, 'green');
    } else {
      log(`❌ ${varName}: 未找到`, 'red');
      allFound = false;
    }
  });
  
  return allFound;
}

async function checkSupabaseConfig() {
  logSubsection('檢查 Supabase 配置文件');
  
  const supabaseConfigPath = path.join(process.cwd(), 'src', 'lib', 'supabase.ts');
  
  if (!fs.existsSync(supabaseConfigPath)) {
    log('❌ supabase.ts 文件不存在', 'red');
    return false;
  }
  
  const configContent = fs.readFileSync(supabaseConfigPath, 'utf8');
  
  // 檢查是否有硬編碼的 fallback 值
  if (configContent.includes('https://') && configContent.includes('eyJ')) {
    log('⚠️  警告：supabase.ts 可能包含硬編碼的配置值', 'yellow');
    log('這可能會覆蓋環境變數設置', 'yellow');
  }
  
  // 檢查環境變數驗證
  if (configContent.includes('throw new Error') && configContent.includes('環境變數未設置')) {
    log('✅ 包含適當的環境變數驗證', 'green');
  } else {
    log('⚠️  缺少環境變數驗證', 'yellow');
  }
  
  return true;
}

async function generateFrontendTest() {
  logSubsection('生成前端測試頁面');
  
  const testHtml = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>登入功能測試</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .container { max-width: 600px; margin: 0 auto; }
        .test-section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .success { background-color: #d4edda; border-color: #c3e6cb; }
        .error { background-color: #f8d7da; border-color: #f5c6cb; }
        .warning { background-color: #fff3cd; border-color: #ffeaa7; }
        button { padding: 10px 20px; margin: 5px; cursor: pointer; }
        input { padding: 8px; margin: 5px; width: 200px; }
        #log { background: #f8f9fa; padding: 10px; border-radius: 5px; height: 300px; overflow-y: auto; font-family: monospace; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Casmara CRM 登入功能測試</h1>
        
        <div class="test-section">
            <h3>環境變數檢查</h3>
            <div id="env-check">檢查中...</div>
        </div>
        
        <div class="test-section">
            <h3>Supabase 連接測試</h3>
            <button onclick="testSupabaseConnection()">測試連接</button>
            <div id="connection-result"></div>
        </div>
        
        <div class="test-section">
            <h3>登入測試</h3>
            <input type="email" id="test-email" placeholder="Email" value="rosariog.almenglo@gmail.com">
            <input type="password" id="test-password" placeholder="Password" value="admin123">
            <button onclick="testLogin()">測試登入</button>
            <div id="login-result"></div>
        </div>
        
        <div class="test-section">
            <h3>實時日誌</h3>
            <div id="log"></div>
        </div>
    </div>

    <script type="module">
        // 日誌函數
        function addLog(message, type = 'info') {
            const log = document.getElementById('log');
            const timestamp = new Date().toLocaleTimeString();
            const color = type === 'error' ? 'red' : type === 'success' ? 'green' : type === 'warning' ? 'orange' : 'black';
            log.innerHTML += \`<div style="color: \${color}">[\${timestamp}] \${message}</div>\`;
            log.scrollTop = log.scrollHeight;
        }

        // 檢查環境變數
        function checkEnvironmentVariables() {
            const envCheck = document.getElementById('env-check');
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
            
            let html = '';
            
            if (supabaseUrl) {
                html += \`<div class="success">✅ VITE_SUPABASE_URL: \${supabaseUrl.substring(0, 30)}...</div>\`;
                addLog(\`環境變數 VITE_SUPABASE_URL 已設置: \${supabaseUrl}\`, 'success');
            } else {
                html += '<div class="error">❌ VITE_SUPABASE_URL 未設置</div>';
                addLog('環境變數 VITE_SUPABASE_URL 未設置', 'error');
            }
            
            if (supabaseKey) {
                html += \`<div class="success">✅ VITE_SUPABASE_ANON_KEY: \${supabaseKey.substring(0, 20)}...</div>\`;
                addLog(\`環境變數 VITE_SUPABASE_ANON_KEY 已設置: \${supabaseKey.substring(0, 20)}...\`, 'success');
            } else {
                html += '<div class="error">❌ VITE_SUPABASE_ANON_KEY 未設置</div>';
                addLog('環境變數 VITE_SUPABASE_ANON_KEY 未設置', 'error');
            }
            
            envCheck.innerHTML = html;
        }

        // 測試 Supabase 連接
        window.testSupabaseConnection = async function() {
            const result = document.getElementById('connection-result');
            result.innerHTML = '測試中...';
            addLog('開始測試 Supabase 連接');
            
            try {
                const { createClient } = await import('@supabase/supabase-js');
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                
                if (!supabaseUrl || !supabaseKey) {
                    throw new Error('環境變數未設置');
                }
                
                const supabase = createClient(supabaseUrl, supabaseKey);
                
                // 測試基本連接
                const { data, error } = await supabase.auth.getSession();
                
                if (error) {
                    throw error;
                }
                
                result.innerHTML = '<div class="success">✅ Supabase 連接成功</div>';
                addLog('Supabase 連接測試成功', 'success');
                
            } catch (error) {
                result.innerHTML = \`<div class="error">❌ 連接失敗: \${error.message}</div>\`;
                addLog(\`Supabase 連接測試失敗: \${error.message}\`, 'error');
            }
        }

        // 測試登入
        window.testLogin = async function() {
            const email = document.getElementById('test-email').value;
            const password = document.getElementById('test-password').value;
            const result = document.getElementById('login-result');
            
            if (!email || !password) {
                result.innerHTML = '<div class="error">請輸入 Email 和密碼</div>';
                return;
            }
            
            result.innerHTML = '登入中...';
            addLog(\`開始測試登入: \${email}\`);
            
            try {
                const { createClient } = await import('@supabase/supabase-js');
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                
                const supabase = createClient(supabaseUrl, supabaseKey);
                
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });
                
                if (error) {
                    throw error;
                }
                
                if (data.user) {
                    result.innerHTML = \`<div class="success">✅ 登入成功！用戶 ID: \${data.user.id}</div>\`;
                    addLog(\`登入成功！用戶: \${data.user.email}, ID: \${data.user.id}\`, 'success');
                    
                    // 登出以便重複測試
                    setTimeout(async () => {
                        await supabase.auth.signOut();
                        addLog('已自動登出以便重複測試', 'info');
                    }, 2000);
                } else {
                    result.innerHTML = '<div class="warning">⚠️ 登入響應無用戶數據</div>';
                    addLog('登入響應無用戶數據', 'warning');
                }
                
            } catch (error) {
                result.innerHTML = \`<div class="error">❌ 登入失敗: \${error.message}</div>\`;
                addLog(\`登入失敗: \${error.message}\`, 'error');
                console.error('登入錯誤詳情:', error);
            }
        }

        // 頁面載入時檢查環境變數
        checkEnvironmentVariables();
        addLog('測試頁面已載入，準備進行診斷');
    </script>
</body>
</html>`;
  
  const testPath = path.join(process.cwd(), 'login_test.html');
  fs.writeFileSync(testPath, testHtml);
  
  log(`✅ 測試頁面已生成: ${testPath}`, 'green');
  log('請在瀏覽器中打開此文件進行測試', 'cyan');
  
  return testPath;
}

async function checkBackendStatus() {
  logSubsection('檢查後端服務狀態');
  
  try {
    const response = await fetch('http://localhost:3031/health');
    if (response.ok) {
      log('✅ 後端服務 (3031) 正常運行', 'green');
    } else {
      log('⚠️  後端服務響應異常', 'yellow');
    }
  } catch (error) {
    try {
      const response = await fetch('http://localhost:3030/health');
      if (response.ok) {
        log('✅ 後端服務 (3030) 正常運行', 'green');
        log('⚠️  注意：服務運行在 3030 而非 3031', 'yellow');
      } else {
        log('❌ 後端服務無響應', 'red');
      }
    } catch (error2) {
      log('❌ 後端服務無法連接', 'red');
    }
  }
}

async function main() {
  logSection('🔍 Casmara CRM 登入問題實時診斷');
  
  log('開始診斷登入功能問題...', 'blue');
  
  // 1. 檢查環境變數
  const envOk = await checkEnvironmentVariables();
  
  // 2. 檢查 Supabase 配置
  const configOk = await checkSupabaseConfig();
  
  // 3. 檢查後端狀態
  await checkBackendStatus();
  
  // 4. 生成前端測試頁面
  const testPath = await generateFrontendTest();
  
  logSection('📋 診斷總結');
  
  if (envOk && configOk) {
    log('✅ 基本配置檢查通過', 'green');
    log('\n🔧 建議的下一步操作:', 'cyan');
    log('1. 在瀏覽器中打開生成的測試頁面', 'blue');
    log(`   文件位置: ${testPath}`, 'blue');
    log('2. 檢查瀏覽器控制台是否有錯誤', 'blue');
    log('3. 測試 Supabase 連接和登入功能', 'blue');
    log('4. 如果測試頁面登入成功但主應用失敗，檢查主應用的路由和狀態管理', 'blue');
  } else {
    log('❌ 發現配置問題，請先修復環境變數和配置', 'red');
  }
  
  log('\n💡 常見問題排查:', 'magenta');
  log('• 確保 .env.local 文件在項目根目錄', 'blue');
  log('• 確保前端服務重新啟動以載入新的環境變數', 'blue');
  log('• 檢查瀏覽器是否緩存了舊的配置', 'blue');
  log('• 嘗試無痕模式或清除瀏覽器緩存', 'blue');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };