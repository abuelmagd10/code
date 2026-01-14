const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createExecSqlFunction() {
  try {
    console.log('Creating exec_sql function directly...');
    
    // إنشاء الدالة مباشرة باستخدام SQL
    const createFunctionSQL = `
CREATE OR REPLACE FUNCTION exec_sql(sql_query TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS \$\$
BEGIN
  EXECUTE sql_query;
  RETURN 'OK';
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'ERROR: ' || SQLERRM;
END;
\$\$;
    `;

    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: createFunctionSQL
    });

    if (error) {
      console.error('Error creating function:', error);
      throw error;
    }

    console.log('Function created successfully:', data);
    
    // الآن نقوم بتقييد الصلاحيات
    console.log('Setting security restrictions...');
    const grantSQL = `
REVOKE EXECUTE ON FUNCTION exec_sql(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION exec_sql(TEXT) TO service_role;
    `;
    
    const { data: grantData, error: grantError } = await supabase.rpc('exec_sql', {
      sql_query: grantSQL
    });

    if (grantError) {
      console.error('Error setting permissions:', grantError);
      throw grantError;
    }

    console.log('✅ exec_sql function created with security restrictions');
    console.log('Permissions set:', grantData);
    
  } catch (error) {
    console.error('Failed to create function:', error.message);
    process.exit(1);
  }
}

createExecSqlFunction();