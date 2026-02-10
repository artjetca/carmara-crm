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
- **本地專案路徑**: `/Users/macbookpro/Desktop/carmara/`
- **Supabase**: `https://aotpcnwjjpkzxnhvmcvb.supabase.co`

## 專案結構

```
carmara/
├── .git/
├── .gitignore
├── .env                        ← Supabase 連線（不會被 git 追蹤）
├── src/                        ← React + TypeScript 源碼
├── dist/                       ← Vite build 產物（部署用，gitignored）
├── netlify/functions/          ← 16 個 Netlify Serverless Functions
├── netlify.toml                ← Netlify 設定（build command, redirects, headers）
├── package.json
└── node_modules/               ← gitignored
```

## 部署步驟

### 1. 修改源碼

在 `src/` 裡修改 TypeScript/React 檔案。

**重要**：城市列表在以下位置有硬編碼的 `municipiosByProvince`：
- `src/pages/Customers.tsx` — **兩處**（篩選器 + 新增客戶表單）
- `src/pages/Maps.tsx` — **一處**
- `src/lib/translations.ts` — 預定義城市列表

### 2. 重新構建 dist

```bash
cd /Users/macbookpro/Desktop/carmara
npm run build
```

**注意**：`.env` 必須存在且包含 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`，否則 build 出來的 JS 不會嵌入 Supabase 連線 → 白屏。

// turbo
### 3. 部署到 Netlify

```bash
cd /Users/macbookpro/Desktop/carmara
netlify deploy --prod --dir=dist --site=95b55082-1397-492a-9a22-4b3d02967ef6
```

// turbo
### 4. 驗證部署

打開 https://casmara-charo.netlify.app 確認正常運作。

### 5. 推送到 GitHub（可選）

```bash
git add -A
git commit -m "描述修改內容"
git push origin main
```

## 常見問題

| 問題 | 原因 | 解決方法 |
|------|------|----------|
| 白屏 | `.env` 缺失，Supabase URL 沒嵌入 JS | 確認 `.env` 存在後重新 `npm run build` |
| Build 失敗（missing module） | `package.json` 缺依賴 | `npm install <module>` 然後重新 build |
| Functions bundling 失敗 | netlify/functions/ 裡的依賴缺失 | 確認 `googleapis` 等在 package.json 中 |

## Netlify 設定

- **Auto-deploy 已關閉**（`stop_builds: true`）— push 到 GitHub 不會觸發自動 build
- 只用 CLI 手動部署
- 如需重新開啟：Netlify dashboard → Build & deploy → Continuous deployment → 啟用

## Keep Supabase Alive（GitHub Actions）

- **Workflow**: `.github/workflows/keep-alive.yml`
- **頻率**: 每 10 分鐘 cron（`*/10 * * * *`）
- **作用**: ping Supabase REST API + Netlify 網站，防止 Supabase 免費方案休眠
- **GitHub Secret**: `SUPABASE_ANON_KEY`（已設定在 repo secrets）
- **手動觸發**: `gh workflow run keep-alive.yml --repo artjetca/carmara-crm`

## Email Scheduler（GitHub Actions）

- **Workflow**: `.github/workflows/email-scheduler.yml`
- **頻率**: 每 5 分鐘（`*/5 * * * *`）
- **作用**: 呼叫 Netlify function `email-scheduler` 發送排程郵件

## 環境變數（.env）

```
VITE_SUPABASE_URL=https://aotpcnwjjpkzxnhvmcvb.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...（見 .env 檔）
SUPABASE_URL=https://aotpcnwjjpkzxnhvmcvb.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...（見 .env 檔）
PORT=3031
```

## 重要歷史紀錄

- **白屏問題**：build 時缺 `.env` → Supabase URL 沒嵌入 JS → 解決方法：確認 `.env` 存在後重新 build
- **Netlify auto-deploy 失敗**：伺服器端 build 缺依賴 → 改用 CLI 手動部署，已關閉 auto-deploy
- **城市新增（Chucena）**：需在 `Customers.tsx`（兩處）和 `Maps.tsx`（一處）的 `municipiosByProvince` 硬編碼列表中新增
