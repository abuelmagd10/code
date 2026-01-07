#!/usr/bin/env node

/**
 * 🧪 RUN TESTS - Accounting Compliance
 * =====================================
 * Tests the accounting compliance implementation on Supabase
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

async function runTests() {
  console.log('🧪 Running Accounting Compliance Tests');
  console.log('='.repeat(60));
  console.log('');

  let passedTests = 0;
  let failedTests = 0;

  // Test 1: Verify schema changes
  console.log('Test 1: Verify Schema Changes');
  console.log('-'.repeat(60));
  
  try {
    const { data: debitNoteColumns } = await supabase.rpc('exec_sql', {
      sql_query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'customer_debit_notes' 
          AND column_name IN ('approval_status', 'approved_by', 'approved_at', 'created_by')
        ORDER BY column_name;
      `
    });

    const requiredColumns = ['approval_status', 'approved_at', 'approved_by', 'created_by'];
    const foundColumns = debitNoteColumns?.map(c => c.column_name) || [];
    
    if (requiredColumns.every(col => foundColumns.includes(col))) {
      console.log('✅ PASSED: All required columns exist in customer_debit_notes');
      passedTests++;
    } else {
      console.log('❌ FAILED: Missing columns in customer_debit_notes');
      console.log('   Required:', requiredColumns);
      console.log('   Found:', foundColumns);
      failedTests++;
    }
  } catch (error) {
    console.log('❌ FAILED: Error checking schema:', error.message);
    failedTests++;
  }

  console.log('');

  // Test 2: Verify application columns
  console.log('Test 2: Verify Application Table Columns');
  console.log('-'.repeat(60));
  
  try {
    const { data: appColumns } = await supabase.rpc('exec_sql', {
      sql_query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'customer_debit_note_applications' 
          AND column_name IN ('journal_entry_id', 'applied_by', 'application_method')
        ORDER BY column_name;
      `
    });

    const requiredAppColumns = ['application_method', 'applied_by', 'journal_entry_id'];
    const foundAppColumns = appColumns?.map(c => c.column_name) || [];
    
    if (requiredAppColumns.every(col => foundAppColumns.includes(col))) {
      console.log('✅ PASSED: All required columns exist in customer_debit_note_applications');
      passedTests++;
    } else {
      console.log('❌ FAILED: Missing columns in customer_debit_note_applications');
      console.log('   Required:', requiredAppColumns);
      console.log('   Found:', foundAppColumns);
      failedTests++;
    }
  } catch (error) {
    console.log('❌ FAILED: Error checking application schema:', error.message);
    failedTests++;
  }

  console.log('');

  // Test 3: Check default values
  console.log('Test 3: Check Default Values');
  console.log('-'.repeat(60));
  
  try {
    const { data: defaults } = await supabase.rpc('exec_sql', {
      sql_query: `
        SELECT column_name, column_default 
        FROM information_schema.columns 
        WHERE table_name = 'customer_debit_notes' 
          AND column_name = 'approval_status';
      `
    });

    if (defaults && defaults[0]?.column_default?.includes('draft')) {
      console.log('✅ PASSED: approval_status has correct default value (draft)');
      passedTests++;
    } else {
      console.log('❌ FAILED: approval_status default value is incorrect');
      console.log('   Found:', defaults?.[0]?.column_default);
      failedTests++;
    }
  } catch (error) {
    console.log('❌ FAILED: Error checking defaults:', error.message);
    failedTests++;
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('📊 Test Summary:');
  console.log(`   ✅ Passed: ${passedTests}`);
  console.log(`   ❌ Failed: ${failedTests}`);
  console.log(`   📝 Total: ${passedTests + failedTests}`);
  console.log('');

  if (failedTests === 0) {
    console.log('✅ All tests passed! Migration successful!');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests failed. Please review the errors above.');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});

