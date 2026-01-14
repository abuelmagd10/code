const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const createFunctionSQL = `
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
AS \$\$
BEGIN
  -- تنفيذ SQL statement
  EXECUTE sql_query;
  RETURN 'OK';
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'ERROR: ' || SQLERRM;
END;
\$\$;

-- منح الصلاحية للخدمات فقط (وليس للمستخدمين العاديين)
-- Grant permission only to service role (not regular users)
REVOKE EXECUTE ON FUNCTION exec_sql(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION exec_sql(TEXT) TO service_role;
`;

async function createExecSqlFunction() {
  try {
    console.log('Creating exec_sql function...');
    
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: createFunctionSQL
    });

    if (error) {
      console.error('Error creating function:', error);
      throw error;
    }

    console.log('Function created successfully:', data);
    console.log('✅ exec_sql function created with security restrictions');
    
  } catch (error) {
    console.error('Failed to create function:', error.message);
    process.exit(1);
  }
}

createExecSqlFunction();