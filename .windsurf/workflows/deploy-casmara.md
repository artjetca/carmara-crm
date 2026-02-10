---
description: How to deploy casmara-charo (Carmara CRM) to Netlify
---

# Casmara CRM 部署流程

## 專案資訊

- **Netlify 站點**: casmara-charo
- **Netlify Site ID**: `95b55082-1397-492a-9a22-4b3d02967ef6`
- **URL**: https://casmara-charo.netlify.app
- **GitHub Repo**: https://github.com/artjetca/carmara-crm (branch: main)
- **Netlify 帳號**: info@weie.es (GitHub: artjetca)
- **本地專案路徑**: `/Users/macbookpro/Desktop/carmara/carmara-deploy-9a052f3/`
- **Supabase**: `https://aotpcnwjjpkzxnhvmcvb.supabase.co`

## 專案結構

```
carmara/
├── .git/
├── .gitignore
├── README.md
└── carmara-deploy-9a052f3/     ← 唯一的工作目錄
    ├── .env                    ← Supabase 連線（VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY）
    ├── src/                    ← React + TypeScript 源碼
    ├── dist/                   ← Vite build 產物（部署用）
    ├── netlify/functions/      ← 16 個 Netlify Serverless Functions
    ├── netlify.toml            ← Netlify 設定（build command, redirects, headers）
    ├── package.json
    └── node_modules/
```

## 部署步驟

### 1. 修改源碼

在 `carmara-deploy-9a052f3/src/` 裡修改 TypeScript/React 檔案。

**重要**：城市列表在以下位置有硬編碼的 `municipiosByProvince`：
- `src/pages/Customers.tsx` — **兩處**（篩選器 + 新增客戶表單）
- `src/pages/Maps.tsx` — **一處**
- `src/lib/translations.ts` — 預定義城市列表

### 2. 重新構建 dist

```bash
cd /Users/macbookpro/Desktop/carmara/carmara-deploy-9a052f3
npm run build
```

**注意**：`.env` 必須存在且包含 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`，否則 build 出來的 JS 不會嵌入 Supabase 連線 → 白屏。

### 3. 部署到 Netlify

```bash
netlify deploy --prod \
  --dir=/Users/macbookpro/Desktop/carmara/carmara-deploy-9a052f3/dist \
  --site=95b55082-1397-492a-9a22-4b3d02967ef6
```

**重要**：必須從 `carmara-deploy-9a052f3/` 目錄執行，這樣 Netlify CLI 會讀取該目錄的 `netlify.toml` 和 `netlify/functions/`。

// turbo
### 4. 驗證部署

打開 https://casmara-charo.netlify.app 確認正常運作。

## 常見問題

| 問題 | 原因 | 解決方法 |
|------|------|----------|
| 白屏 | `.env` 缺失，Supabase URL 沒嵌入 JS | 確認 `.env` 存在後重新 `npm run build` |
| Build 失敗（missing module） | `package.json` 缺依賴 | `npm install <module>` 然後重新 build |
| Functions bundling 失敗 | 從錯誤目錄執行 deploy | 確保從 `carmara-deploy-9a052f3/` 目錄執行 |
| GitHub auto-deploy 失敗 | 主 repo 的 package.json 缺依賴 | 手動 CLI 部署更可靠 |

## 環境變數（.env）

```
VITE_SUPABASE_URL=https://aotpcnwjjpkzxnhvmcvb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...（見 .env 檔）
SUPABASE_URL=https://aotpcnwjjpkzxnhvmcvb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...（見 .env 檔）
PORT=3031
```
