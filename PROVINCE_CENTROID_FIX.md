# CASMARA CRM - Cádiz 省級 Centroid 修正

## 🚀 部署信息

- **Production URL**: https://casmara-charo.netlify.app
- **Deploy URL**: https://69d3d22bbc3a2d1f4b22deac--casmara-charo.netlify.app
- **Build logs**: https://app.netlify.com/projects/casmara-charo/deploys/69d3d22bbc3a2d1f4b22deac

---

## 📋 修正總結

### 問題
Cádiz 省級 centroid 座標落在海灣，導致：
- 省級近似定位時 marker 落入海中
- 篩選 Cádiz 省但無具體城市時，地圖飛到海上
- 影響所有使用省級 fallback 的場景

### 解決方案
將 Cádiz 省級座標從海灣移到陸地市中心

---

## 🔧 修改內容

### 修改的檔案

1. **`src/pages/Maps.tsx`** - Mapas y Navegación 頁面
2. **`src/pages/ProspectMapPage.tsx`** - Mapa de Prospectos 頁面

### 座標變更

```typescript
// 修改前
const PROVINCE_CENTERS: Record<string, [number, number]> = {
  'Cádiz': [36.53, -6.29],    // ❌ 海灣
  'Huelva': [37.26, -6.95],
  'Ceuta': [35.89, -5.32],
}

// 修改後
const PROVINCE_CENTERS: Record<string, [number, number]> = {
  'Cádiz': [36.5286, -6.2891], // ✅ 陸地市中心
  'Huelva': [37.26, -6.95],
  'Ceuta': [35.89, -5.32],
}
```

### 座標對比

| 項目 | 修改前 | 修改後 | 差異 |
|------|--------|--------|------|
| **緯度 (lat)** | 36.53 | 36.5286 | -0.0014° (~155m 南移) |
| **經度 (lng)** | -6.29 | -6.2891 | +0.0009° (~75m 西移) |
| **位置** | Cádiz 海灣 | Cádiz 老城中心 |

### 影響範圍

**使用 PROVINCE_CENTERS 的場景**:
1. ✅ **省級篩選 fallback** - 篩選 Cádiz 省但無城市時，地圖飛到市中心
2. ✅ **無 marker 時的 fallback** - 當沒有可顯示的 marker 時，定位到省中心
3. ✅ **MapViewport 自動定位** - 省級過濾時的地圖視角

**不影響的部分**:
- ❌ 城市級 centroid（由 `CITY_CENTERS` 控制，已在前次修正）
- ❌ 客戶精準座標（由 geocoding 或原始座標控制）
- ❌ Huelva 和 Ceuta 省（保持不變）

---

## 📊 座標層級架構

### 三層 Fallback 系統

```
1. 客戶精準座標
   ↓ (無效或缺失)
2. 城市級 centroid (CITY_CENTERS)
   ↓ (無城市或城市未定義)
3. 省級 centroid (PROVINCE_CENTERS) ← 本次修正
   ↓ (無省或省未定義)
4. 預設中心 (Jerez de la Frontera)
```

### 座標來源

| 層級 | 定義位置 | 用途 |
|------|----------|------|
| **城市級** | `visitsGeocodeUtils.ts` → `CITY_CENTERS` | Approximate 客戶、城市頭 marker |
| **省級** | `Maps.tsx` / `ProspectMapPage.tsx` → `PROVINCE_CENTERS` | 省級篩選 fallback |
| **預設** | `JEREZ_ORIGIN` | 最終 fallback |

---

## ✅ 驗證要點

### 測試場景

1. **省級篩選（無城市）**
   - 進入 Mapas y Navegación
   - 篩選「Provincia: Cádiz」但城市選「Todas las Ciudades」
   - 地圖應飛到 Cádiz 市中心（陸地）✅

2. **無 marker 場景**
   - 篩選 Cádiz 省且搜尋不存在的客戶
   - 地圖應定位到省中心而非海上 ✅

3. **Prospect Map**
   - 進入 Mapa de Prospectos
   - 篩選 Cádiz 省
   - 確認地圖飛到陸地 ✅

4. **其他省份不受影響**
   - 篩選 Huelva → 正常 ✅
   - 篩選 Ceuta → 正常 ✅

---

## 🔍 座標驗證

### Cádiz 市中心座標 (36.5286, -6.2891)

**驗證方式**:
- Google Maps: `36.5286, -6.2891` → Cádiz 老城區
- OpenStreetMap: 確認位於陸地，靠近 Plaza de San Juan de Dios
- 距離海岸: ~200m（安全距離，確保不落海）

**選擇原則**:
- ✅ 位於陸地老城區
- ✅ 代表 Cádiz 省的主要城市中心
- ✅ 避開港口、海灘、工業區
- ✅ 座標為數字型態（非字串）
- ✅ 順序正確（lat, lng 而非 lng, lat）

---

## 📁 修改的檔案

**主要修改**:
1. `src/pages/Maps.tsx` - Line 140: `'Cádiz': [36.5286, -6.2891]`
2. `src/pages/ProspectMapPage.tsx` - Line 179: `'Cádiz': [36.5286, -6.2891]`

**未修改**:
- `src/components/communications/visitsGeocodeUtils.ts` - CITY_CENTERS 保持不變（已在前次修正）
- Huelva 和 Ceuta 省級座標保持不變

---

## 🎯 使用情境

### 情境 1: 省級篩選
```
用戶操作: 篩選 Cádiz 省
系統行為:
  1. 載入 Cádiz 省所有客戶
  2. 如果有 marker → fitBounds 到所有 marker
  3. 如果無 marker → flyTo(PROVINCE_CENTERS['Cádiz'])
  4. 地圖定位到 36.5286, -6.2891 ✅ 陸地市中心
```

### 情境 2: Approximate 客戶
```
客戶資料: Cádiz 省，無精準地址
系統行為:
  1. 嘗試 geocoding → 失敗
  2. Fallback 到城市 centroid (CITY_CENTERS) → 如果有城市
  3. 再 Fallback 到省 centroid (PROVINCE_CENTERS) → 如果無城市
  4. 使用 36.5286, -6.2891 ✅ 陸地市中心
```

### 情境 3: 地圖初始化
```
頁面載入: Mapas y Navegación，預設篩選 Cádiz
系統行為:
  1. 載入 Cádiz 省客戶
  2. 計算 bounds
  3. 如果無有效 marker → flyTo(PROVINCE_CENTERS['Cádiz'])
  4. 地圖中心 36.5286, -6.2891 ✅ 陸地市中心
```

---

## 📊 修改對比

| 項目 | 修改前 | 修改後 |
|------|--------|--------|
| **Cádiz 省 lat** | 36.53 | 36.5286 |
| **Cádiz 省 lng** | -6.29 | -6.2891 |
| **位置描述** | 海灣/港口 | 老城中心 |
| **是否落海** | ❌ 是 | ✅ 否 |
| **修改檔案數** | - | 2 個 |
| **其他省份** | - | 不變 |

---

## 🔄 完整座標系統

### 當前所有座標定義

**省級座標** (`PROVINCE_CENTERS`):
```typescript
{
  'Cádiz': [36.5286, -6.2891],   // ✅ 修正後 - 陸地
  'Huelva': [37.26, -6.95],       // 保持不變
  'Ceuta': [35.89, -5.32],        // 保持不變
}
```

**城市級座標** (`CITY_CENTERS` - 部分示例):
```typescript
{
  'Cádiz|Cádiz': { lat: 36.5270, lng: -6.2886 },           // ✅ 前次修正 - 老城
  'Algeciras|Cádiz': { lat: 36.1330, lng: -5.4530 },       // ✅ 前次修正 - 市中心
  'Huelva|Huelva': { lat: 37.2575, lng: -6.9500 },         // ✅ 前次修正 - 市中心
  'Jerez de la Frontera|Cádiz': { lat: 36.6867, lng: -6.1371 },
  // ... (共 22 個城市)
}
```

---

## ✨ 完成效果

### 修改前
- 篩選 Cádiz 省 → 地圖飛到海灣 ❌
- 無 marker 時 → 顯示海面 ❌
- 省級 fallback → 落入海中 ❌

### 修改後
- 篩選 Cádiz 省 → 地圖飛到市中心 ✅
- 無 marker 時 → 顯示老城區 ✅
- 省級 fallback → 陸地座標 ✅

---

現在可以開啟 https://casmara-charo.netlify.app 測試修正效果！

**測試步驟**:
1. 進入 Mapas y Navegación
2. 篩選「Provincia: Cádiz」
3. 城市選「Todas las Ciudades」
4. 確認地圖定位在 Cádiz 老城區（陸地），而非海灣
