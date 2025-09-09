-- 清理CSV導入測試數據的SQL腳本
-- 使用前請確認這些是測試數據而非真實客戶數據

-- 1. 查看所有測試數據（執行前先檢查）
SELECT id, name, company, email, notes, created_at 
FROM customers 
WHERE created_by = (SELECT id FROM auth.users WHERE email = '你的帳號email')
  AND (
    email LIKE '%@csvtest.com' 
    OR company LIKE 'TEST-CSV-%' 
    OR notes LIKE '%測試數據%'
    OR name LIKE 'TEST %'
  )
ORDER BY created_at DESC;

-- 2. 刪除測試數據（確認無誤後執行）
DELETE FROM customers 
WHERE created_by = (SELECT id FROM auth.users WHERE email = '你的帳號email')
  AND (
    email LIKE '%@csvtest.com' 
    OR company LIKE 'TEST-CSV-%' 
    OR notes LIKE '%測試數據%'
    OR name LIKE 'TEST %'
  );

-- 3. 根據時間範圍刪除（替代方案，請調整時間）
-- DELETE FROM customers 
-- WHERE created_by = (SELECT id FROM auth.users WHERE email = '你的帳號email')
--   AND created_at >= '2025-01-09 06:00:00+00:00'  -- 調整為測試開始時間
--   AND created_at <= '2025-01-09 10:00:00+00:00'; -- 調整為測試結束時間
