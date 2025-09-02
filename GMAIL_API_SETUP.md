# Gmail API 設定指南

## 步驟 1: Google Cloud Console 設定

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 創建新專案或選擇現有專案
3. 啟用 Gmail API:
   - 導航到 "APIs & Services" > "Library"
   - 搜尋 "Gmail API"
   - 點擊 "Enable"

## 步驟 2: 創建 OAuth 2.0 憑證

1. 前往 "APIs & Services" > "Credentials"
2. 點擊 "Create Credentials" > "OAuth 2.0 Client IDs"
3. 選擇 "Web application"
4. 設定重定向 URI: `http://localhost:3000` (用於獲取 refresh token)
5. 下載 JSON 憑證檔案

## 步驟 3: 獲取 Refresh Token

使用以下 Node.js 腳本獲取 refresh token:

```javascript
const { google } = require('googleapis');
const readline = require('readline');

const CLIENT_ID = 'your-client-id';
const CLIENT_SECRET = 'your-client-secret';
const REDIRECT_URI = 'http://localhost:3000';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
});

console.log('前往此 URL 授權應用程式:', authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('輸入授權碼: ', (code) => {
  oauth2Client.getToken(code, (err, token) => {
    if (err) return console.error('獲取 token 錯誤:', err);
    console.log('Refresh Token:', token.refresh_token);
    rl.close();
  });
});
```

## 步驟 4: Netlify 環境變數設定

在 Netlify Dashboard 設定以下環境變數:

```
GMAIL_CLIENT_ID=your-client-id
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
GMAIL_FROM_EMAIL=your-gmail@gmail.com
```

## 步驟 5: 安裝依賴

```bash
npm install googleapis
```

## 注意事項

- Gmail API 每日配額: 1,000,000,000 配額單位
- 每封郵件約消耗 5-25 配額單位
- Netlify Free Plan: 每月 125,000 次 Function 調用
- 建議啟用 2FA 並使用應用程式專用密碼
