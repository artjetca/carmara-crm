# CASMARA CRM - Algeciras 城市座標修復

## 🚀 部署信息

- **Production URL**: https://casmara-charo.netlify.app
- **Deploy URL**: https://69d3c37484252c2f3dfd7667--casmara-charo.netlify.app
- **Build logs**: https://app.netlify.com/projects/casmara-charo/deploys/69d3c37484252c2f3dfd7667

---

## 問題診斷

### 原始問題
在 Algeciras 看到：
1. 城市頭部 marker 顯示「5」但無法展開/定位到所有客戶
2. 客戶 marker 座標與城市頭部「5」不一致
3. Approximate 客戶使用隨機偏移座標，導致地圖混亂

### 根本原因

#### 1. Approximate 客戶座標有偏移
**位置**: `visitsGeocodeUtils.ts:703-712`

```typescript
// 修改前
const offset = createMarkerOffset(client.id)
return buildAudit(client, {
  markerCoords: {
    lat: center.lat + offset.lat,
    lng: center.lng + offset.lng,
  },
  usesApproximateMarker: true,
})
```

每個 approximate 客戶都被加上隨機偏移（0.006-0.02 度），導致：
- 5 個客戶分散在城市中心周圍
- 無法與城市頭 marker 對齊
- 點擊城市頭時找不到對應的客戶位置

#### 2. 城市頭 marker 座標計算錯誤
**位置**: `visitsMapUtils.ts:441-446`

```typescript
// 修改前
const coords =
  exactMarkerCoords.length > 0
    ? averageCoordinates(exactMarkerCoords)
    : fallbackMarkers.length > 0
      ? averageCoordinates(fallbackMarkers)  // ❌ 平均了所有偏移座標
      : getFallbackCityCoordinates(city, province)
```

當城市只有 approximate 客戶時，城市頭座標會是所有偏移座標的平均值，導致：
- 城市頭 marker 位置偏離真實城市中心
- 與城市 centroid 不一致
- 展開後客戶分散在周圍，視覺混亂

---

## 解決方案

### 修改 1: Approximate 客戶使用城市 centroid

**檔案**: `src/components/communications/visitsGeocodeUtils.ts`
**位置**: 第 692-717 行

```typescript
const buildApproximateFallback = (client: Customer, reason: string) => {
  const center = getCityCenter(client)
  if (!center) {
    return buildAudit(client, {
      geocodeStatus: 'invalid',
      geocodeReason: `${reason}. Localización pendiente de validación manual`,
      markerCoords: null,
      source: 'none',
    })
  }

  // ✅ 修改後：直接使用城市 centroid，不加偏移
  return buildAudit(client, {
    geocodeStatus: 'approximate',
    geocodeReason: `${reason}. Ubicación aproximada por centro urbano`,
    correctedLat: center.lat,
    correctedLng: center.lng,
    markerCoords: center,  // ✅ 使用城市中心，而不是 center + offset
    hasExactCoords: false,
    usesApproximateMarker: true,
    source: 'city_fallback',
  })
}
```

**效果**：
- 所有 approximate 客戶現在都使用城市 centroid 座標
- 在地圖上，這些客戶的 marker 會疊在城市頭 marker 的位置
- 點擊城市頭 marker 時，可以看到所有 approximate 客戶

### 修改 2: 城市頭 marker 優先使用 centroid

**檔案**: `src/components/communications/visitsMapUtils.ts`
**位置**: 第 424-465 行

```typescript
export const buildCityDistanceSummary = ({
  city,
  province,
  clients,
}: CityDistanceInput): DistanceAwareCity => {
  const reachableDistances = clients
    .map(client => client.distanceFromUser)
    .filter((distance): distance is number => distance !== null)

  const exactMarkerCoords = clients
    .filter(client => client.hasExactCoords && client.lat !== null && client.lng !== null)
    .map(client => ({ lat: client.lat as number, lng: client.lng as number }))

  // ✅ 修改後：優先使用城市 centroid
  const cityCentroid = getFallbackCityCoordinates(city, province)

  const coords =
    cityCentroid
      ? cityCentroid  // ✅ 優先使用 CITY_CENTERS 定義的座標
      : exactMarkerCoords.length > 0
        ? averageCoordinates(exactMarkerCoords)  // fallback: 平均精準客戶座標
        : null

  const nearestClient =
    sortClientsByDistance(clients).find(client => client.distanceFromUser !== null) ?? null

  return {
    city,
    province,
    clientCount: clients.length,
    nearestDistanceFromUser: reachableDistances.length > 0 ? Math.min(...reachableDistances) : null,
    nearestDistanceFromUserKm: reachableDistances.length > 0 ? Math.min(...reachableDistances) : null,
    nearestTravelTimeMinutes: nearestClient?.travelTimeMinutes ?? null,
    coords,
    clients: sortClientsByDistance(clients),
    hasReachableClient: reachableDistances.length > 0,
    nearestClientIdFromUser: nearestClient?.id ?? null,
  }
}
```

**效果**：
- 城市頭 marker 現在使用 `CITY_CENTERS` 定義的標準座標
- 與所有 approximate 客戶對齊
- 保證城市位置的一致性和準確性

---

## 城市 Centroid 資料來源

**檔案**: `src/components/communications/visitsGeocodeUtils.ts`
**位置**: 第 208-232 行

### 主要城市座標（CITY_CENTERS）

```typescript
const CITY_CENTERS: Record<string, MapCoordinates> = {
  // Cádiz 省
  [createCityKey('Jerez de la Frontera', 'Cádiz')]: { lat: 36.6867, lng: -6.1371 },
  [createCityKey('Cádiz', 'Cádiz')]: { lat: 36.5297, lng: -6.2925 },
  [createCityKey('El Puerto de Santa María', 'Cádiz')]: { lat: 36.5997, lng: -6.2331 },
  [createCityKey('Sanlúcar de Barrameda', 'Cádiz')]: { lat: 36.7781, lng: -6.3531 },
  [createCityKey('Chipiona', 'Cádiz')]: { lat: 36.7367, lng: -6.4378 },
  [createCityKey('Chiclana de la Frontera', 'Cádiz')]: { lat: 36.4197, lng: -6.1497 },
  [createCityKey('San Fernando', 'Cádiz')]: { lat: 36.4614, lng: -6.1997 },
  [createCityKey('Algeciras', 'Cádiz')]: { lat: 36.1322, lng: -5.4553 },  // ✅ Algeciras centroid
  
  // Huelva 省
  [createCityKey('Huelva', 'Huelva')]: { lat: 37.2614, lng: -6.9447 },
  [createCityKey('Punta Umbría', 'Huelva')]: { lat: 37.1848, lng: -7.0103 },
  [createCityKey('Ayamonte', 'Huelva')]: { lat: 37.2144, lng: -7.4057 },
  [createCityKey('Moguer', 'Huelva')]: { lat: 37.273, lng: -6.8387 },
  [createCityKey('Almonte', 'Huelva')]: { lat: 37.2578, lng: -6.5214 },
  [createCityKey('Palos de la Frontera', 'Huelva')]: { lat: 37.233, lng: -6.8939 },
  [createCityKey('Bollullos Par del Condado', 'Huelva')]: { lat: 37.3441, lng: -6.6913 },
  [createCityKey('Lepe', 'Huelva')]: { lat: 37.2504, lng: -7.201 },
  [createCityKey('Cartaya', 'Huelva')]: { lat: 37.2877, lng: -7.1614 },
  [createCityKey('San Juan del Puerto', 'Huelva')]: { lat: 37.3114, lng: -6.8395 },
  [createCityKey('Lucena del Puerto', 'Huelva')]: { lat: 37.3116, lng: -6.8999 },
  [createCityKey('Trigueros', 'Huelva')]: { lat: 37.3824, lng: -6.8334 },
  [createCityKey('Valverde del Camino', 'Huelva')]: { lat: 37.5673, lng: -6.7499 },
  
  // 其他
  [createCityKey('Ceuta', 'Ceuta')]: { lat: 35.8894, lng: -5.3213 },
}
```

### Fallback 邏輯

```typescript
const getCityCenter = (customerOrCity: Customer | string, provinceArg?: string) => {
  if (typeof customerOrCity === 'string') {
    return CITY_CENTERS[createCityKey(customerOrCity, provinceArg || '')] || null
  }

  const city = deriveCity(customerOrCity)
  const province = deriveProvince(customerOrCity)
  if (!city || !province) return null
  return CITY_CENTERS[createCityKey(city, province)] || null
}

export const getFallbackCityCoordinates = (city: string, province: string) =>
  getCityCenterCoordinates(city, province)
```

**Fallback 流程**：
1. 優先查找 `CITY_CENTERS[city|province]`
2. 如果找不到，返回 `null`
3. 在 `buildCityDistanceSummary` 中，如果 centroid 不存在，fallback 到精準客戶座標的平均值

---

## 驗證要點

### 1. Algeciras 城市頭 marker
- ✅ 座標固定為 `{ lat: 36.1322, lng: -5.4553 }`（來自 CITY_CENTERS）
- ✅ 顯示客戶數量「5」
- ✅ 點擊可展開所有 5 個客戶

### 2. Approximate 客戶 marker
- ✅ 所有 approximate 客戶的 marker 位置與城市頭一致
- ✅ 在地圖上疊在同一個座標點
- ✅ 清單中仍然可以看到每個客戶的完整資訊

### 3. 精準定位的客戶
- ✅ 繼續使用自己的精準座標
- ✅ 不受此修改影響

### 4. 城市頭座標計算優先級
1. **優先使用 CITY_CENTERS** - 保證標準化和一致性
2. Fallback 到精準客戶座標平均值 - 適用於新城市或未定義的城市
3. 最後返回 null - 當城市完全無座標時

---

## 技術細節

### 座標來源優先級（修改後）

#### 城市頭 marker
```
CITY_CENTERS[city|province] (優先)
  ↓ fallback
averageCoordinates(exactMarkerCoords)
  ↓ fallback
null
```

#### 客戶 marker
```
client.lat/lng (精準座標)
  ↓ fallback
CITY_CENTERS[city|province] (approximate 客戶)
  ↓ fallback
null (invalid)
```

### 座標類型定義

```typescript
export type MapCoordinates = {
  lat: number
  lng: number
}

export type ClientCoordinateAudit = {
  geocodeStatus: 'valid' | 'approximate' | 'invalid' | 'sea_suspect'
  geocodeReason: string
  originalLat: number | null
  originalLng: number | null
  correctedLat: number | null
  correctedLng: number | null
  markerCoords: MapCoordinates | null  // ✅ 現在直接指向 CITY_CENTERS
  hasExactCoords: boolean
  usesApproximateMarker: boolean  // ✅ true 時使用城市 centroid
  source: 'original' | 'swapped' | 'geocoded' | 'city_fallback' | 'none'
  // ...
}
```

---

## Modal 高度問題

**注意**: Modal 高度在之前的部署中已修正：
- 使用 `h-screen` 確保填滿視窗
- 加入 `overflow-hidden` 防止內容溢出
- Grid 容器正確處理列表滾動

---

## 相關檔案

- ✅ `src/components/communications/visitsGeocodeUtils.ts` - 座標驗證和 centroid 定義
- ✅ `src/components/communications/visitsMapUtils.ts` - 城市距離摘要和座標計算
- `src/components/communications/VisitsMapModal.tsx` - UI 組件（未修改）

---

## 測試狀態

✅ TypeScript 檢查通過 (`npm run check`)
✅ 構建成功 (`npm run build`)
✅ 部署到 Netlify production 成功

---

## 下一步

1. 開啟 https://casmara-charo.netlify.app
2. 進入 Mapa de Visitas
3. 搜尋或篩選到 Algeciras
4. 驗證：
   - 城市頭 marker 顯示「5」
   - 點擊城市頭可以展開所有 5 個客戶
   - Approximate 客戶的 marker 與城市頭對齊
   - 精準定位的客戶仍在各自的位置
