/**
 * 🔐 تطبيق حماية branch_id للعملاء
 * Apply Customer Branch Protection Trigger
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌ Error: .env.local file not found');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').trim();
      if (key && value) {
        process.env[key.trim()] = value.replace(/^["']|["']$/g, '');
      }
    }
  });
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function applyMigration() {
  console.log('🔐 تطبيق حماية branch_id للعملاء...\n');

  // Read the migration file
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20250204_protect_customer_branch_id.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  // Split into individual statements
  const statements = migrationSQL
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

  // Try using exec_sql RPC if available
  try {
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql_query: migrationSQL 
    });

    if (!error) {
      console.log('✅ Migration applied successfully via exec_sql RPC!');
      return;
    }
  } catch (e) {
    console.log('ℹ️  exec_sql RPC not available, trying alternative method...\n');
  }

  // Alternative: Execute via REST API
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ sql_query: migrationSQL })
    });

    if (response.ok) {
      console.log('✅ Migration applied successfully via REST API!');
      return;
    }
  } catch (e) {
    console.log('ℹ️  REST API method not available\n');
  }

  // If all else fails, print instructions
  console.log('=' .repeat(60));
  console.log('⚠️  لم يتم العثور على طريقة لتنفيذ SQL تلقائياً');
  console.log('=' .repeat(60));
  console.log('\n📋 يرجى تنفيذ SQL التالي يدوياً من Supabase Dashboard:\n');
  console.log(`🔗 https://supabase.com/dashboard/project/${supabaseUrl.split('//')[1].split('.')[0]}/sql/new\n`);
  console.log('-'.repeat(60));
  console.log(migrationSQL);
  console.log('-'.repeat(60));
  console.log('\n✅ بعد التنفيذ، ستكون حماية branch_id مفعلة!');
}

applyMigration().catch(console.error);

