# 🔍 跨裝置同步診斷指南

## 問題：`supabase is not defined`

這個錯誤說明 Supabase 客戶端沒有暴露到全域範圍，這很常見。讓我們用更好的方法診斷。

## 方法 1: 檢查 React DevTools

1. **安裝 React Developer Tools** (如果還沒有)
2. **打開 Planificación de Visitas 頁面**
3. **按 F12 → React 標籤**
4. **檢查是否能找到 Visits 組件**

## 方法 2: 檢查網路請求

1. **按 F12 → Network 標籤**
2. **重新整理頁面**
3. **嘗試保存一條路線**
4. **查看是否有以下請求:**
   - `POST` 到 `saved_routes` 表
   - 任何 `supabase` 相關的請求
   - 錯誤狀態碼 (400, 404, 500 等)

## 方法 3: 檢查 Console 錯誤

**在 Console 標籤中輸入:**

```javascript
// 檢查 Supabase 配置
console.log('Checking for Supabase...')
console.log('window.supabase:', typeof window.supabase)
console.log('React:', typeof window.React)

// 檢查 localStorage
console.log('localStorage savedRoutes:', localStorage.getItem('savedRoutes'))

// 檢查頁面 URL
console.log('Current URL:', window.location.href)
```

## 方法 4: 直接測試表存在性

**最關鍵的測試 - 在 Supabase Dashboard:**

1. **登入 Supabase Dashboard**
2. **進入 Table Editor**
3. **查看是否有 `saved_routes` 表**

如果沒有，執行這個 SQL:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'saved_routes';
```

## 快速修復步驟

### 如果 `saved_routes` 表不存在:

**在 Supabase SQL Editor 中執行:**

```sql
-- 快速創建 saved_routes 表
CREATE TABLE saved_routes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  route_date DATE,
  route_time TIME,
  customers JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_distance DECIMAL(10,2) DEFAULT 0,
  total_duration INTEGER DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE saved_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their routes" ON saved_routes
  FOR ALL USING (auth.uid() = created_by);

GRANT ALL ON saved_routes TO authenticated;
```

### 如果表存在但仍不同步:

檢查前端是否有錯誤:

1. **Console 標籤中查看紅色錯誤訊息**
2. **Network 標籤中查看失敗的請求**
3. **嘗試硬重新整理: Cmd+Shift+R**

## 預期結果

✅ **成功的話應該看到:**
- Network 中有 POST 請求到 Supabase
- 沒有 Console 錯誤
- 路線出現在不同裝置上

❌ **如果仍然失敗:**
- 截圖 Network 和 Console 標籤
- 告訴我具體的錯誤訊息

**請執行 "方法 4" 檢查表是否存在，這是最關鍵的步驟！**
