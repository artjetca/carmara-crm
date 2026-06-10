# CASMARA CRM - Mapa de Visitas 距離計算修復

## 修復內容

### 1. 問題診斷
- ✅ VisitsMapModal 已有完整的搜尋過濾功能（搜尋框、省份下拉、城市下拉、清除按鈕）
- ❌ 距離計算常顯示 "Distancia no disponible"，原因不明確
- ❌ 座標驗證不足，導致 NaN/Infinity/null 值無法被正確處理

### 2. 已修復的檔案

#### `src/components/communications/visitsMapUtils.ts`
- **formatDistanceKm()**: 加入 `Number.isFinite()` 檢查，防止 NaN/Infinity
- **formatDistanceAndTime()**: 加入完整的數值驗證，清楚區分：
  - 有路線時間（來自 OSRM API）：顯示 "X.X km · Y min"
  - 正在計算：顯示 "X.X km · calculando..."
  - 只有直線距離：顯示 "X.X km"
  - 無法計算：顯示具體原因
- **getClientDistanceFromUser()**: 
  - 驗證使用者座標：`Number.isFinite(userLocation.lat)` 和 `Number.isFinite(userLocation.lng)`
  - 驗證客戶座標：`Number.isFinite(client.lat)` 和 `Number.isFinite(client.lng)`
  - Cache 只儲存有效的數值
- **buildDistanceAwareClient()**:
  - 驗證 `correctedLat/Lng` 是有效數字
  - 新增 `distanceUnavailableReason` 欄位，提供具體原因：
    - "Sin coordenadas válidas" - 座標驗證失敗
    - "Ubicación en zona de mar" - 檢測到海域
    - "Coordenadas no disponibles" - 無座標資料
    - "Coordenadas inválidas" - NaN/Infinity
    - "Error al calcular distancia" - 其他錯誤
- **DistanceAwareClient 類型**: 新增 `distanceUnavailableReason: string | null` 欄位

#### `src/components/communications/VisitsMapModal.tsx`
更新 4 處 UI 顯示邏輯：
1. 側邊欄客戶列表（第 837-847 行）
2. 城市 Popup（第 989-997 行）
3. 城市展開的客戶列表（第 1014-1024 行）
4. 地圖 Marker Popup（第 1072-1082 行）

所有位置現在都會：
- 檢查 `client.distanceFromUserKm !== null`
- 如果為 null，顯示 `client.distanceUnavailableReason`（琥珀色文字）
- 保持一致的視覺風格

#### `src/components/communications/visitsMapUtils.test.ts`
- 更新測試工具函數 `makeDistanceAwareClient()`，加入 `distanceUnavailableReason` 欄位

### 3. 距離計算來源說明

#### 直線距離（km）
- **來源**: Haversine 公式（`calculateDistanceKm` in `visitsGeocodeUtils.ts`）
- **輸入**: 使用者位置（lat, lng） → 客戶座標（lat, lng）
- **單位**: 公里（km），四捨五入到小數點後 1 位
- **Cache**: Map<string, number> 以座標對為 key

#### 行車時間（min）
- **來源**: OSRM API (`/.netlify/functions/route-time`)
- **API**: `https://router.project-osrm.org/route/v1/driving/`
- **輸入**: from (lng, lat) → to (lng, lat)
- **輸出**: 
  - `route.duration` (秒) → 轉換為分鐘
  - `route.distance` (米) → 轉換為公里
- **Cache**: 30 分鐘 TTL
- **失敗處理**: API 失敗時返回 `status: 'unavailable'`

### 4. 防呆處理

#### 座標驗證層級
1. **isValidCoordinate()**: 基本範圍檢查（-90 ≤ lat ≤ 90, -180 ≤ lng ≤ 180）
2. **isWithinServiceArea()**: 服務區域檢查（Cádiz/Huelva 範圍）
3. **isLikelyInSea()**: 海域檢測（OPEN_WATER_ZONES + 距離城市中心）
4. **Number.isFinite()**: 防止 NaN/Infinity（新增）

#### 錯誤訊息對應
| 狀況 | 顯示訊息 |
|------|---------|
| geocodeStatus === 'invalid' | "Sin coordenadas válidas" |
| geocodeStatus === 'sea_suspect' | "Ubicación en zona de mar" |
| 無 validDistanceCoords | "Coordenadas no disponibles" |
| NaN/Infinity | "Coordenadas inválidas" |
| 其他 | "Error al calcular distancia" |

### 5. 部署指令

```bash
# 1. 驗證 TypeScript
npm run check

# 2. 構建
npm run build

# 3. 部署到 Netlify
npx netlify deploy --prod --dir=dist
```

或使用 Netlify CLI（如果已全局安裝）：
```bash
netlify deploy --prod --dir=dist
```

### 6. 驗證步驟

部署後驗證：
1. 開啟 Mapa de Visitas
2. 檢查距離顯示：
   - 有效座標應顯示 "X.X km" 或 "X.X km · Y min"
   - 無效座標應顯示具體原因（琥珀色文字）
3. 測試搜尋過濾功能
4. 檢查 console 無錯誤

### 7. 技術細節

- **距離計算**: Haversine 公式，地球半徑 6371 km
- **路線 API**: OSRM (Open Source Routing Machine)
- **Geocode 批次**: 4 並發，12 項一批
- **Route Time 批次**: 4 並發
- **優先級**: 前 12 個城市 + 展開的城市 + 選中的客戶

## 測試狀態

✅ TypeScript 檢查通過 (`npm run check`)
✅ 構建成功 (`npm run build`)
⏳ 等待部署到 Netlify

## 相關檔案

- `src/components/communications/visitsMapUtils.ts` - 距離計算核心邏輯
- `src/components/communications/VisitsMapModal.tsx` - UI 組件
- `src/components/communications/visitsGeocodeUtils.ts` - 座標驗證
- `src/components/communications/visitsRoutingUtils.ts` - 路線 API
- `netlify/functions/route-time.js` - OSRM API wrapper
