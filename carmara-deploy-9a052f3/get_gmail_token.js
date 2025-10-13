import { google } from 'googleapis';
import readline from 'readline';

const CLIENT_ID = 'YOUR_GMAIL_CLIENT_ID';
const CLIENT_SECRET = 'YOUR_GMAIL_CLIENT_SECRET';
const REDIRECT_URI = 'http://localhost:3000';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

console.log('🔐 Gmail API Token 獲取工具\n');

// 生成授權 URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent' // 強制顯示同意畫面以獲取 refresh_token
});

console.log('📋 步驟 1: 前往以下 URL 進行授權:');
console.log('\n' + authUrl + '\n');
console.log('📋 步驟 2: 授權後會重定向到 localhost:3000/?code=...');
console.log('📋 步驟 3: 複製 URL 中的 code 參數值\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('請輸入授權碼 (code): ', (code) => {
  oauth2Client.getToken(code, (err, token) => {
    if (err) {
      console.error('❌ 獲取 token 錯誤:', err);
      rl.close();
      return;
    }
    
    console.log('\n✅ 成功獲取 Token!');
    console.log('\n📋 請將以下資訊加入 Netlify 環境變數:');
    console.log('─'.repeat(50));
    console.log(`GMAIL_CLIENT_ID=${CLIENT_ID}`);
    console.log(`GMAIL_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`GMAIL_REFRESH_TOKEN=${token.refresh_token}`);
    console.log('GMAIL_FROM_EMAIL=artjet0805@gmail.com');
    console.log('─'.repeat(50));
    console.log('\n💡 發送郵件將使用 artjet0805@gmail.com');
    
    rl.close();
  });
});

rl.on('close', () => {
  console.log('\n👋 程序結束');
  process.exit(0);
});
