# CASMARA Agent Instructions

> Carmara CRM — 西班牙化妝品業務員外勤用的 CRM。與使用者溝通請用**繁體中文**。
> React 18 + Vite + Tailwind + Supabase + Leaflet（**不是 WordPress**；使用者若提 Elementor，請用 Tailwind 的 absolute/fixed、z-index、border-radius、box-shadow、backdrop-filter 等等價手段達成）。

## Deployment Rule

Every completed code change should be deployed to Netlify production before the task is
considered done — UNLESS the user explicitly says to hold (e.g.「先不要部署」「等我確認」).
When the user asks to batch or hold deploys, honour that instruction over this default.

Required sequence for code changes:

1. Run verification:
   - `npm run check`
   - `npm run build`
2. Deploy to production (see toolchain note — must use x64 node):
   - `PATH="/usr/local/bin:$PATH" npx netlify deploy --prod --dir=dist`
   - (or `PATH="/usr/local/bin:$PATH" npx netlify deploy --prod --build`)
3. Report back with: Production URL, Unique deploy URL, Deploy log URL.

## Project Notes

- Netlify site: `casmara-charo`
- Production URL: `https://casmara-charo.netlify.app`
- Keep map-related fixes production-safe; do not leave work only verified locally.

## 環境與路徑

- 工作目錄：`/Users/macbookpro/Library/Mobile Documents/com~apple~CloudDocs/Desktop/桌面 - TAO/carmara`
- Git：改版分支 `mobile-revamp`（已推到 `origin/mobile-revamp`），主分支 `main`。每個階段一個 commit，可隨時回退。
- commit 結尾加上：`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Supabase（關鍵）

- 正式專案 ref：`mddyomibqbmnpexwgkug`（Pro 方案，ACTIVE_HEALTHY，名稱 weie）。
- 舊專案 `aotpcnwjjpkzxnhvmcvb` 已 INACTIVE / DNS 失效 —— 任何引用舊 ref 的金鑰都無效。
- 正確金鑰唯一可靠來源：Netlify 站點 `casmara-charo` 的環境變數（`npx netlify env:get <NAME>`）。已同步到本地 `.env` / `.env.local`，舊檔備份為 `.env*.bak-old-project`。
- `.env.local` 內是**真實金鑰**（已 gitignore）—— 本機可用，但**絕不要 commit**。
- Supabase CLI 已授權，token 在 macOS Keychain：`security find-generic-password -s "Supabase CLI" -w`
- 直接執行 DDL：`POST https://api.supabase.com/v1/projects/mddyomibqbmnpexwgkug/database/query`
  - header 必須帶 `User-Agent: SupabaseCLI/2.105.0`（否則 Cloudflare 回 1010 擋掉）
  - body：`{"query": "<SQL>"}`，Authorization 用上面 Keychain 的 token。
- 資料現況參考：customers 157、prospects 157、saved_routes 5、scheduled_messages 19、visits 0、scrape_jobs 40。
- **資料絕對不能流失**（使用者最在意的前提）。Phase 0 已把 completedVisits / savedRoutes / 客戶座標改成以 Supabase 為唯一真實來源，localStorage 只當快取（因 iOS Safari 7 天會清 localStorage，外勤資料會丟）。

## 工具鏈陷阱（重要）

- `node_modules` 的 esbuild 是 **darwin-x64**（Rosetta 安裝），arm64 node 跑不動。
  跑 vite / netlify dev / tsx / netlify deploy 都要把 x64 node 放前面：
  `PATH="/usr/local/bin:$PATH" npx ...`，或 `/usr/local/bin/node node_modules/.bin/<bin> ...`。
- 本地 `/api/*`：`api/server.ts`（nodemon 入口）不存在，本地直接 `vite` 時 `/api` 是壞的。
  要測 API 必須用：`PATH="/usr/local/bin:$PATH" npx netlify dev`（port 8888，會跑 functions）。
- 型別檢查：`npm run check`（= `tsc --noEmit`，目前通過）。
- 測試：node:test + tsx，package.json 沒有 test script。
  跑法：`/usr/local/bin/node node_modules/.bin/tsx --test src/**/*.test.ts`。

## 已完成（都已 commit；Phase 0 / 1 / 2.1 與海域修復已上正式站，Phase 2.2 已 commit 待使用者確認部署）

- **Phase 0 資料加固**：migration `supabase/migrations/20260611_phase0_data_hardening.sql` 已套用到正式庫。
  customers 加 latitude/longitude/coordinates；visits 加 completed_at/route_id/route_name/customer_company/legacy_id(unique)，customer_id FK 改 ON DELETE SET NULL（可為 NULL，刪客戶不丟拜訪歷史）；saved_routes 加 completed/completed_at/completed_visits。
- **Phase 1 手機導航**（`src/components/Layout.tsx`）：<768px 底部膠囊式 Tab Bar（Inicio/Clientes/Visitas/Mapa/Más），Más 開抽屜；桌面/平板保留側欄。z-index 已調到 Leaflet（200–1000）之上：tab bar 1100、overlay 1150、drawer 1200。
- **Phase 2.1 手機 App 式全螢幕地圖**（`src/pages/Maps.tsx`）：全螢幕地圖、玻璃感圓角搜尋欄（backdrop-blur）、「Buscar en esta zona」依地圖範圍篩客戶、右側圓形浮動按鈕（定位/全覽/導航）、底部摘要膠囊→可展開客戶清單 bottom sheet、手機隱藏 Leaflet +/- 鈕。桌面版不動。
- **海域定位修復**（`src/components/communications/visitsGeocodeUtils.ts`）：移除約略標記的隨機偏移（Cádiz 是半島，偏移會落海），補齊 OPEN_WATER_ZONES 海域矩形。
- **Phase 2.2 Clientes 卡片化**（`src/pages/Customers.tsx`，commit `2757b68`）：<768px 卡片清單（姓名/公司/城市/可撥號 tel: 鈕，44px 觸控），桌面 `hidden md:block` 13 欄表格不變。用既有 `displayCity()` helper，handler 與桌面一致。

## 待辦（優先序）

1. **Phase 2.3 Visits.tsx**（3600+ 行單檔）：建議先拆元件再做手機改造（地圖全螢幕切換、路線清單 bottom sheet）。**風險最高，務必先確保行為不變**（路線儲存、PDF 匯出、完成拜訪寫入 Supabase 等）。
2. **Phase 2.4 ProspectMapPage**：套用和 Maps 一樣的 App 式地圖。
3. **Phase 2.5 Communications / DataImport**：表單堆疊化。
4. **Phase 3（可選）PWA**：加 manifest + service worker。

## 工作準則

- 外科手術式改動，只動該動的，不順手重構無關程式碼。
- 桌面 / 平板版面在做手機改版時**不能被破壞**（手機用 `max-md:` / `md:hidden`，桌面用 `hidden md:block` 之類隔離）。
- 風格沿用已完成頁面：白色半透明玻璃感（`bg-white/85 backdrop-blur`）、藍色重點色、圓角、≥44px 觸控目標。
- 每個階段一個 commit，可隨時回退。
- 完成後驗證：`npm run check` 必過；可觀察的 UI 變更盡量用 `netlify dev` 起本地（port 8888）實機/手機寬度確認。
