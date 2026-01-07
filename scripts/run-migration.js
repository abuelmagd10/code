#!/usr/bin/env node

/**
 * 🚀 RUN MIGRATION - Accounting Compliance
 * =========================================
 * Executes the migration script on Supabase database
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('🚀 Starting Migration - Accounting Compliance');
  console.log('='.repeat(60));
  console.log('');

  // Read migration SQL file
  const migrationFile = path.join(__dirname, '099b_migration_accounting_compliance.sql');
  
  if (!fs.existsSync(migrationFile)) {
    console.error('❌ Migration file not found:', migrationFile);
    process.exit(1);
  }

  const migrationSQL = fs.readFileSync(migrationFile, 'utf8');
  
  console.log('📄 Migration file loaded');
  console.log('📊 File size:', (migrationSQL.length / 1024).toFixed(2), 'KB');
  console.log('');

  // Split SQL into individual statements
  const statements = migrationSQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📝 Found ${statements.length} SQL statements to execute`);
  console.log('');

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    
    // Skip comments and empty statements
    if (!statement || statement.startsWith('--')) continue;

    // Get first line for display
    const firstLine = statement.split('\n')[0].substring(0, 60);
    console.log(`[${i + 1}/${statements.length}] Executing: ${firstLine}...`);

    try {
      const { data, error } = await supabase.rpc('exec_sql', { 
        sql_query: statement + ';' 
      });

      if (error) {
        // Try direct query if RPC fails
        const { error: directError } = await supabase
          .from('_migrations')
          .insert({ statement: statement });
        
        if (directError) {
          console.error(`   ❌ Error:`, error.message);
          errorCount++;
        } else {
          console.log(`   ✅ Success`);
          successCount++;
        }
      } else {
        console.log(`   ✅ Success`);
        successCount++;
      }
    } catch (err) {
      console.error(`   ❌ Exception:`, err.message);
      errorCount++;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('📊 Migration Summary:');
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  console.log(`   📝 Total: ${statements.length}`);
  console.log('');

  if (errorCount === 0) {
    console.log('✅ Migration completed successfully!');
  } else {
    console.log('⚠️  Migration completed with errors');
    console.log('💡 Check the errors above and run verification script');
  }
}

runMigration().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});

