-- 检查当前权限
SELECT grantee, table_name, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' 
AND table_name IN ('customers', 'visits') 
AND grantee IN ('anon', 'authenticated') 
ORDER BY table_name, grantee;

-- 为customers表授予权限
GRANT SELECT ON customers TO anon;
GRANT ALL PRIVILEGES ON customers TO authenticated;

-- 为visits表授予权限
GRANT SELECT ON visits TO anon;
GRANT ALL PRIVILEGES ON visits TO authenticated;

-- 再次检查权限是否正确设置
SELECT grantee, table_name, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' 
AND table_name IN ('customers', 'visits') 
AND grantee IN ('anon', 'authenticated') 
ORDER BY table_name, grantee;