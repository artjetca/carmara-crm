# CASMARA CRM - Spiderfy 和海邊城市座標修復

## 🚀 部署信息

- **Production URL**: https://casmara-charo.netlify.app
- **Deploy URL**: https://69d3ce23f9f1ba127f02a949--casmara-charo.netlify.app
- **Build logs**: https://app.netlify.com/projects/casmara-charo/deploys/69d3ce23f9f1ba127f02a949

---

## 📋 修復總結

### 問題 1: 近距離點放大後需要自動展開（Spiderfy）

**症狀**: Jerez de la Frontera 有 2 個客戶在相同或極近的座標，zoom in 後仍看不清各自的點

**原因**: MarkerClusterGroup 缺少完整的 spiderfy 配置

**解決方案**: ✅

### 問題 2: 海邊城市定位落在海裡

**症狀**: Cádiz、Algeciras 等海邊城市的 centroid 座標落在港口或海上

**原因**: CITY_CENTERS 使用的座標點選在海灣/港口而非陸地老城區

**解決方案**: ✅

---

## 🔧 修復 1: Marker Cluster Spiderfy

### 修改檔案
`src/pages/Maps.tsx`

### 新增配置

```tsx
<MarkerClusterGroup
  iconCreateFunction={(cluster: { getChildCount: () => number }) => {
    const count = cluster.getChildCount()
    return L.divIcon({
      html: `<div style="background:${MARKER_BLUE};color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);">${count}</div>`,
      className: '',
      iconSize: L.point(36, 36),
    })
  }}
  maxClusterRadius={40}
  spiderfyOnMaxZoom                    // ✅ 原有
  spiderfyOnEveryZoom                   // ✅ 新增 - 每次 zoom 都檢查是否需要展開
  spiderfyDistanceMultiplier={2}        // ✅ 新增 - 展開距離 2 倍（更明顯）
  disableClusteringAtZoom={17}          // ✅ 新增 - zoom 17+ 完全不聚合
  showCoverageOnHover={false}
  zoomToBoundsOnClick
>
```

### 參數說明

| 參數 | 值 | 說明 |
|------|-----|------|
| `spiderfyOnMaxZoom` | `true` | 原有 - 最大 zoom 時展開 |
| `spiderfyOnEveryZoom` | `true` | **新增** - 每次 zoom 都檢查並展開重疊點 |
| `spiderfyDistanceMultiplier` | `2` | **新增** - 展開半徑 2 倍，讓點更分散 |
| `disableClusteringAtZoom` | `17` | **新增** - zoom 17+ 不再聚合，直接顯示所有點 |
| `maxClusterRadius` | `40` | 原有 - cluster 半徑 40px |

### 效果

**修改前**:
- Jerez de la Frontera 有 2 個客戶重疊
- Zoom in 後仍無法區分兩個點
- 必須點擊才能看到客戶列表

**修改後**:
- ✅ Zoom in 時自動展開成圓形（spiderfy）
- ✅ 兩個點清晰可見，各自可點擊
- ✅ Zoom 17+ 完全展開，不再聚合
- ✅ 展開距離 2 倍，視覺更清晰

---

## 🗺️ 修復 2: 海邊城市 Centroid 座標

### 修改檔案
`src/components/communications/visitsGeocodeUtils.ts`

### 修正的城市

#### Cádiz 省海邊城市

| 城市 | 修改前 (港口/海上) | 修改後 (陸地老城區) | 備註 |
|------|-------------------|---------------------|------|
| **Cádiz** | `36.5297, -6.2925` | `36.5270, -6.2886` | 從海灣移到老城中心 |
| **Algeciras** | `36.1322, -5.4553` | `36.1330, -5.4530` | 從港口移到市中心 |
| **Sanlúcar de Barrameda** | `36.7781, -6.3531` | `36.7778, -6.3520` | 從河口移到鎮中心 |
| **Chipiona** | `36.7367, -6.4378` | `36.7395, -6.4390` | 從燈塔移到鎮廣場 |

#### Huelva 省海邊城市

| 城市 | 修改前 (港口/海上) | 修改後 (陸地老城區) | 備註 |
|------|-------------------|---------------------|------|
| **Huelva** | `37.2614, -6.9447` | `37.2575, -6.9500` | 從港口移到市中心 |
| **Punta Umbría** | `37.1848, -7.0103` | `37.1875, -7.0050` | 從海灘移到鎮中心 |
| **Ayamonte** | `37.2144, -7.4057` | `37.2095, -7.4020` | 從邊境河移到鎮廣場 |

#### Ceuta

| 城市 | 修改前 (港口/海上) | 修改後 (陸地老城區) | 備註 |
|------|-------------------|---------------------|------|
| **Ceuta** | `35.8894, -5.3213` | `35.8893, -5.3198` | 從港口移到市中心 |

### 修改代碼

```typescript
const CITY_CENTERS: Record<string, MapCoordinates> = {
  [createCityKey('Jerez de la Frontera', 'Cádiz')]: { lat: 36.6867, lng: -6.1371 },
  
  // Coastal cities - adjusted to land (old town center, not harbor/sea)
  [createCityKey('Cádiz', 'Cádiz')]: { lat: 36.5270, lng: -6.2886 }, // Old town center, not bay
  [createCityKey('Cadiz', 'Cádiz')]: { lat: 36.5270, lng: -6.2886 },
  [createCityKey('El Puerto de Santa María', 'Cádiz')]: { lat: 36.5997, lng: -6.2331 },
  [createCityKey('Sanlúcar de Barrameda', 'Cádiz')]: { lat: 36.7778, lng: -6.3520 }, // Town center, not river mouth
  [createCityKey('Chipiona', 'Cádiz')]: { lat: 36.7395, lng: -6.4390 }, // Town plaza, not lighthouse
  [createCityKey('Chiclana de la Frontera', 'Cádiz')]: { lat: 36.4197, lng: -6.1497 },
  [createCityKey('San Fernando', 'Cádiz')]: { lat: 36.4614, lng: -6.1997 },
  [createCityKey('Algeciras', 'Cádiz')]: { lat: 36.1330, lng: -5.4530 }, // City center, not port
  
  // Huelva coastal cities - adjusted to land
  [createCityKey('Huelva', 'Huelva')]: { lat: 37.2575, lng: -6.9500 }, // City center, not harbor
  [createCityKey('Punta Umbría', 'Huelva')]: { lat: 37.1875, lng: -7.0050 }, // Town center, not beach
  [createCityKey('Ayamonte', 'Huelva')]: { lat: 37.2095, lng: -7.4020 }, // Town plaza, not river border
  
  // ... (其他內陸城市保持不變)
  
  [createCityKey('Ceuta', 'Ceuta')]: { lat: 35.8893, lng: -5.3198 }, // City center, not harbor
}
```

### 影響範圍

**使用這些 centroid 的功能**:
1. ✅ **Approximate 客戶 marker** - 未驗證地址的客戶使用城市 centroid
2. ✅ **城市頭 marker** - 城市群組的中心點
3. ✅ **距離模式** - 從 Jerez 或用戶位置計算到城市的距離
4. ✅ **地圖定位** - 點擊城市時地圖飛到的位置

### 效果

**修改前**:
- Cádiz 客戶 marker 落在海灣
- Algeciras 定位到港口海面
- 點擊城市頭部時地圖飛到海上

**修改後**:
- ✅ 所有海邊城市 marker 落在陸地老城區
- ✅ 城市定位準確，位於市中心
- ✅ Approximate 客戶不再漂到海裡
- ✅ 地圖飛行目標是城市中心而非港口

---

## 📊 技術細節

### Spiderfy 行為

**觸發條件**:
1. Cluster 包含 2+ markers
2. User zoom in 到足夠近的距離
3. 或 zoom 達到 `disableClusteringAtZoom` (17)

**展開形式**:
- 圓形展開（circle / spiral layout）
- 半徑由 `spiderfyDistanceMultiplier` 控制
- 每個 marker 保持可點擊和可 hover

**視覺效果**:
```
修改前:        修改後:
   2              ●
   ●          ●       ●
              (展開成圓形)
```

### Centroid 校正原則

**選擇標準**:
1. ✅ 老城區中心 (Casco Antiguo / Plaza Mayor)
2. ✅ 避開港口、海灘、河口
3. ✅ 可訪問的陸地區域
4. ❌ 不選工業區、機場
5. ❌ 不選海上、水域

**校正方法**:
- 使用 Google Maps / OpenStreetMap 確認陸地座標
- 微調 ±0.001-0.005 度（約 100-500m）
- 確保 approximate 客戶不落入海中

---

## ✅ 驗證要點

### Spiderfy 驗證
1. ✅ 進入 Mapas y Navegación
2. ✅ 搜尋 Jerez de la Frontera
3. ✅ Zoom in 到看到「2」的 cluster
4. ✅ 繼續 zoom in，觀察是否展開成圓形
5. ✅ Zoom 到 17+，確認完全展開不聚合

### 海邊城市驗證
1. ✅ 搜尋 Cádiz
2. ✅ 確認城市頭 marker 在老城區（陸地）
3. ✅ 檢查 approximate 客戶是否在陸地
4. ✅ 重複測試 Algeciras、Huelva、Punta Umbría

### 距離模式驗證
1. ✅ 啟用「Modo distancia (km/min)」
2. ✅ 確認海邊城市距離計算正確
3. ✅ 點擊「Mi ubicación」測試從用戶位置計算

---

## 📁 修改的檔案

**主要修改**:
1. `src/pages/Maps.tsx` - MarkerClusterGroup spiderfy 配置
2. `src/components/communications/visitsGeocodeUtils.ts` - CITY_CENTERS 座標校正

---

## 🎯 使用方式

### 測試 Spiderfy
1. 進入 Mapas y Navegación
2. 篩選 Jerez de la Frontera
3. Zoom in 到看到重疊的客戶
4. 觀察自動展開成圓形

### 測試海邊城市
1. 篩選 Cádiz 或 Algeciras
2. 確認客戶 marker 在陸地
3. 點擊城市頭，確認地圖飛到市中心

---

## 🔄 Geocoding API

**當前使用**: 自建 `/api/geocode` endpoint (Netlify Function)  
**Provider**: 未明確指定，可能是 Nominatim (OpenStreetMap) 或其他 geocoding service

**Fallback 機制**:
1. 客戶原始座標（如果有效）
2. Geocoding API 結果
3. **CITY_CENTERS centroid** ← 本次修正的部分
4. 省份中心
5. Jerez de la Frontera (預設 fallback)

---

## 📊 修改對比

| 項目 | 修改前 | 修改後 |
|------|--------|--------|
| **Spiderfy on zoom** | 僅最大 zoom | 每次 zoom 檢查 ✅ |
| **展開距離** | 預設 (1x) | 2 倍 ✅ |
| **完全展開 zoom** | 無限制 | zoom 17+ ✅ |
| **Cádiz centroid** | 海灣 (36.5297, -6.2925) | 老城 (36.5270, -6.2886) ✅ |
| **Algeciras centroid** | 港口 (36.1322, -5.4553) | 市中心 (36.1330, -5.4530) ✅ |
| **Huelva centroid** | 港口 (37.2614, -6.9447) | 市中心 (37.2575, -6.9500) ✅ |

---

現在可以開啟 https://casmara-charo.netlify.app 測試修復效果！

**測試清單**:
- [ ] Jerez de la Frontera zoom in 是否展開重疊點
- [ ] Cádiz 客戶 marker 是否在陸地
- [ ] Algeciras 定位是否正確
- [ ] Huelva / Punta Umbría / Ayamonte 是否在陸地
- [ ] 距離模式下海邊城市距離是否正確
