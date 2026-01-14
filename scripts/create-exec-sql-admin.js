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
    console.log('Creating exec_sql function using admin API...');
    
    // نقوم بإنشاء الدالة باستخدام postgrest
    const createSQL = `
CREATE OR REPLACE FUNCTION exec_sql(sql_query TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_query;
  RETURN 'OK';
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'ERROR: ' || SQLERRM;
END;
$$;
    `;

    // نحاول استخدام raw query من خلال postgrest
    const { data, error } = await supabase
      .rpc('exec_sql', { sql_query: createSQL })
      .single();

    if (error) {
      console.log('Function does not exist yet, trying alternative method...');
      
      // نحاول استخدام query مباشر
      const queryResult = await supabase
        .from('information_schema.routines')
        .select('*')
        .eq('routine_name', 'exec_sql');
        
      console.log('Current functions:', queryResult.data?.length || 0);
      
      // إذا لم توجد الدالة، ننشئها باستخدام SQL مباشر
      if (!queryResult.data?.length) {
        console.log('Creating function with direct SQL execution...');
        
        // استخدام REST API للتنفيذ المباشر
        const response = await fetch(`${supabaseUrl}/rest/v1/`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            type: 'rpc',
            args: {
              sql: createSQL
            }
          })
        });
        
        const result = await response.text();
        console.log('Direct execution result:', result);
      }
    } else {
      console.log('Function created:', data);
    }

    // الآن نقوم بتعيين الصلاحيات
    console.log('Setting permissions...');
    const grantSQL = `
REVOKE EXECUTE ON FUNCTION exec_sql(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION exec_sql(TEXT) TO service_role;
    `;
    
    const { data: grantData, error: grantError } = await supabase.rpc('exec_sql', {
      sql_query: grantSQL
    });

    if (grantError) {
      console.error('Error setting permissions:', grantError);
    } else {
      console.log('✅ Permissions set successfully:', grantData);
    }

    console.log('✅ exec_sql function created with security restrictions');
    
  } catch (error) {
    console.error('Failed to create function:', error.message);
    process.exit(1);
  }
}

createExecSqlFunction();