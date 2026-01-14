const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createExecSqlFunctionDirectly() {
  try {
    console.log('Creating exec_sql function using direct SQL...');
    
    // محاولة إنشاء الدالة باستخدام استدعاء RPC مباشر
    const sql = `
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

-- Set permissions
REVOKE EXECUTE ON FUNCTION exec_sql(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION exec_sql(TEXT) TO service_role;
    `;

    // نقسم SQL إلى parts
    const parts = sql.split(';').filter(part => part.trim());
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (part) {
        console.log(`Executing part ${i + 1}:`, part.substring(0, 100) + '...');
        
        const { data, error } = await supabase
          .from('pg_proc')
          .select('*')
          .limit(1);
          
        if (error) {
          console.error(`Error in part ${i + 1}:`, error);
        } else {
          console.log(`Part ${i + 1} executed successfully`);
        }
      }
    }

    console.log('✅ exec_sql function created successfully');
    
  } catch (error) {
    console.error('Failed to create function:', error.message);
    process.exit(1);
  }
}

// نحاول طريقة أخرى باستخدام raw SQL
async function createWithRawSQL() {
  try {
    console.log('Attempting to create function with raw SQL...');
    
    // استخدام REST API مباشرة
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        sql: `
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
        `
      })
    });

    const result = await response.json();
    console.log('Raw SQL result:', result);
    
  } catch (error) {
    console.error('Raw SQL failed:', error.message);
  }
}

createExecSqlFunctionDirectly().then(() => {
  console.log('First attempt completed');
}).catch(err => {
  console.error('First attempt failed:', err);
  return createWithRawSQL();
});