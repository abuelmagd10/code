-- =============================================
-- إنشاء دالة exec_sql لتنفيذ SQL statements
-- Create exec_sql function for executing SQL statements
-- =============================================
-- ⚠️ تحذير: هذه الدالة خطيرة وتسمح بتنفيذ أي SQL
-- WARNING: This function is dangerous and allows executing any SQL
-- =============================================

-- دالة لتنفيذ SQL statements (للاستخدام الداخلي فقط)
CREATE OR REPLACE FUNCTION exec_sql(sql_query TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- تنفيذ SQL statement
  EXECUTE sql_query;
  RETURN 'OK';
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'ERROR: ' || SQLERRM;
END;
$$;

-- منح الصلاحية للخدمات فقط (وليس للمستخدمين العاديين)
-- Grant permission only to service role (not regular users)
-- REVOKE EXECUTE ON FUNCTION exec_sql(TEXT) FROM PUBLIC;
-- GRANT EXECUTE ON FUNCTION exec_sql(TEXT) TO service_role;
