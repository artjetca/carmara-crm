# 修復跨裝置路線同步問題

## 🚨 問題根源
saved_routes 資料表不存在於 Supabase 資料庫中，導致：
- 路線只存在 localStorage（無法跨裝置同步）
- 無痕模式下路線消失（localStorage 被清除）

## 🔧 解決步驟

### 1. 登入 Supabase Dashboard
前往：https://supabase.com/dashboard

### 2. 選擇你的專案
找到 Casmara CRM 專案並點擊進入

### 3. 進入 SQL Editor
在左側選單中點擊 "SQL Editor"

### 4. 執行以下 SQL 腳本

```sql
-- 創建 saved_routes 資料表
CREATE TABLE IF NOT EXISTS saved_routes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  route_date DATE,
  route_time TIME,
  customers JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_distance DECIMAL(10,2) DEFAULT 0,
  total_duration INTEGER DEFAULT 0,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 啟用 RLS (Row Level Security)
ALTER TABLE saved_routes ENABLE ROW LEVEL SECURITY;

-- 刪除可能存在的舊政策
DROP POLICY IF EXISTS "Users can view their own routes" ON saved_routes;
DROP POLICY IF EXISTS "Users can insert their own routes" ON saved_routes;
DROP POLICY IF EXISTS "Users can update their own routes" ON saved_routes;
DROP POLICY IF EXISTS "Users can delete their own routes" ON saved_routes;

-- 創建 RLS 政策
CREATE POLICY "Users can view their own routes" ON saved_routes
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can insert their own routes" ON saved_routes
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own routes" ON saved_routes
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own routes" ON saved_routes
  FOR DELETE USING (auth.uid() = created_by);

-- 創建索引提升效能
CREATE INDEX IF NOT EXISTS saved_routes_created_by_idx ON saved_routes(created_by);
CREATE INDEX IF NOT EXISTS saved_routes_created_at_idx ON saved_routes(created_at DESC);

-- 創建更新時間觸發器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_saved_routes_updated_at ON saved_routes;
CREATE TRIGGER update_saved_routes_updated_at 
    BEFORE UPDATE ON saved_routes 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 授予權限
GRANT ALL ON saved_routes TO authenticated;
GRANT ALL ON saved_routes TO service_role;

-- 驗證創建成功
SELECT 'saved_routes table created successfully!' as status;
```

### 5. 點擊 "Run" 執行腳本

### 6. 驗證結果
執行成功後應該看到：`saved_routes table created successfully!`

## ✅ 修復完成後的效果

- ✅ 電腦存檔 → 手機/平板可以看到
- ✅ 手機存檔 → 電腦可以看到  
- ✅ 無痕模式下路線不會消失
- ✅ 真正的跨裝置即時同步

## 🧪 測試方法

1. 在電腦上創建並儲存一條路線
2. 在手機上重新整理頁面
3. 確認路線出現在手機的儲存路線列表中
4. 在無痕模式下測試儲存和載入功能

執行完成後請告訴我結果！
