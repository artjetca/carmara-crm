# 修復 scheduled_messages 表架構

## 問題
`scheduled_messages` 表缺少必要欄位：`customer_id`, `type`, `subject`, `user_id`

## 修復步驟

### 方法 1：完整 SQL 修復
1. 登入 Supabase Dashboard: https://supabase.com/dashboard
2. 選擇你的專案
3. 點擊 "SQL Editor"
4. 複製貼上 `fix_scheduled_messages_schema.sql` 內容
5. 點擊 "Run"

### 方法 2：逐步手動修復
如果完整 SQL 失敗，逐一執行：

```sql
-- 1. 添加 customer_id 欄位
ALTER TABLE public.scheduled_messages 
ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- 2. 添加 type 欄位
ALTER TABLE public.scheduled_messages 
ADD COLUMN type TEXT NOT NULL DEFAULT 'sms' CHECK (type IN ('sms','email'));

-- 3. 添加 subject 欄位
ALTER TABLE public.scheduled_messages 
ADD COLUMN subject TEXT;

-- 4. 添加 user_id 欄位
ALTER TABLE public.scheduled_messages 
ADD COLUMN user_id UUID REFERENCES public.profiles(id);

-- 5. 啟用 RLS
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

-- 6. 創建插入政策
CREATE POLICY "scheduled_messages_insert_own"
  ON public.scheduled_messages
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND user_id = auth.uid());
```

## 驗證
執行後在 SQL Editor 測試：
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'scheduled_messages' AND table_schema = 'public';
```

應該看到：id, message, scheduled_for, status, created_at, error_message, customer_id, type, subject, user_id

## 完成後
重新測試 Communications → Programar Mensaje 功能
