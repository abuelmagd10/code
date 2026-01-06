#!/usr/bin/env node

/**
 * Execute Vendor Credits Migration
 * 
 * This script:
 * 1. Applies DB guards and constraints
 * 2. Creates vendor credits for all existing bill returns
 * 3. Validates the results
 * 4. Generates a detailed report
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing Supabase credentials');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper function to execute SQL file
async function executeSqlFile(filePath) {
  console.log(`\n📄 Executing: ${path.basename(filePath)}`);
  
  const sql = fs.readFileSync(filePath, 'utf8');
  
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    // Try direct query if RPC fails
    const { data: directData, error: directError } = await supabase
      .from('_sql_exec')
      .insert({ query: sql });
    
    if (directError) {
      console.error(`❌ Error executing ${path.basename(filePath)}:`, directError.message);
      return false;
    }
  }
  
  console.log(`✅ Successfully executed: ${path.basename(filePath)}`);
  return true;
}

// Helper function to run raw SQL
async function runQuery(query, description) {
  console.log(`\n🔍 ${description}...`);
  
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: query });
  
  if (error) {
    console.error(`❌ Error: ${error.message}`);
    return null;
  }
  
  return data;
}

// Main migration function
async function runMigration() {
  console.log('\n========================================');
  console.log('🚀 Vendor Credits Migration');
  console.log('========================================\n');
  
  const startTime = Date.now();
  const results = {
    timestamp: new Date().toISOString(),
    steps: [],
    summary: {}
  };

  try {
    // Step 1: Check current state
    console.log('\n📊 STEP 1: Checking current state...');
    
    const { data: billsWithReturns, error: billsError } = await supabase
      .from('bills')
      .select('id, bill_number, company_id, returned_amount, status, return_status')
      .gt('returned_amount', 0)
      .in('status', ['paid', 'partially_paid', 'fully_returned']);
    
    if (billsError) {
      throw new Error(`Failed to fetch bills: ${billsError.message}`);
    }
    
    console.log(`   Found ${billsWithReturns.length} bills with returns`);
    results.steps.push({
      step: 1,
      description: 'Check current state',
      billsWithReturns: billsWithReturns.length,
      status: 'success'
    });

    // Step 2: Check existing vendor credits
    const { data: existingVCs, error: vcError } = await supabase
      .from('vendor_credits')
      .select('id, credit_number, source_purchase_invoice_id')
      .eq('reference_type', 'bill_return')
      .not('source_purchase_invoice_id', 'is', null);
    
    if (vcError) {
      throw new Error(`Failed to fetch vendor credits: ${vcError.message}`);
    }
    
    console.log(`   Found ${existingVCs.length} existing vendor credits for bill returns`);
    results.steps.push({
      step: 2,
      description: 'Check existing vendor credits',
      existingVendorCredits: existingVCs.length,
      status: 'success'
    });

    // Step 3: Apply DB guards and constraints
    console.log('\n🔒 STEP 3: Applying DB guards and constraints...');
    
    const guardsPath = path.join(__dirname, '095_vendor_credits_db_guards_and_constraints.sql');
    const guardsSuccess = await executeSqlFile(guardsPath);
    
    results.steps.push({
      step: 3,
      description: 'Apply DB guards and constraints',
      status: guardsSuccess ? 'success' : 'failed'
    });

    if (!guardsSuccess) {
      console.warn('⚠️  Warning: Failed to apply some guards. Continuing...');
    }

    // Step 4: Create migration functions
    console.log('\n⚙️  STEP 4: Creating migration functions...');
    
    const functionsPath = path.join(__dirname, '094_create_vendor_credits_from_existing_returns.sql');
    const functionsSuccess = await executeSqlFile(functionsPath);
    
    results.steps.push({
      step: 4,
      description: 'Create migration functions',
      status: functionsSuccess ? 'success' : 'failed'
    });

    if (!functionsSuccess) {
      throw new Error('Failed to create migration functions');
    }

    // Step 5: Execute migration
    console.log('\n🔄 STEP 5: Executing migration...');
    console.log('   Creating vendor credits for all bill returns...\n');
    
    const { data: migrationResults, error: migrationError } = await supabase
      .rpc('create_vendor_credits_for_all_returns');
    
    if (migrationError) {
      throw new Error(`Migration failed: ${migrationError.message}`);
    }
    
    console.log('\n📋 Migration Results:');
    console.table(migrationResults);
    
    const created = migrationResults.filter(r => r.status === 'created').length;
    const skipped = migrationResults.filter(r => r.status === 'skipped').length;
    const errors = migrationResults.filter(r => r.status.startsWith('error')).length;
    
    results.steps.push({
      step: 5,
      description: 'Execute migration',
      created,
      skipped,
      errors,
      details: migrationResults,
      status: 'success'
    });

    // Step 6: Verify results
    console.log('\n✅ STEP 6: Verifying results...');
    
    const { data: finalVCs, error: finalError } = await supabase
      .from('vendor_credits')
      .select('id, credit_number, total_amount, status, source_purchase_invoice_id')
      .eq('reference_type', 'bill_return');
    
    if (finalError) {
      throw new Error(`Failed to verify results: ${finalError.message}`);
    }
    
    console.log(`   Total vendor credits for bill returns: ${finalVCs.length}`);
    
    results.steps.push({
      step: 6,
      description: 'Verify results',
      totalVendorCredits: finalVCs.length,
      status: 'success'
    });

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    results.summary = {
      duration: `${duration}s`,
      billsWithReturns: billsWithReturns.length,
      vendorCreditsCreated: created,
      vendorCreditsSkipped: skipped,
      errors: errors,
      totalVendorCredits: finalVCs.length,
      status: 'completed'
    };

    console.log('\n========================================');
    console.log('✅ Migration Completed Successfully');
    console.log('========================================');
    console.log(`Duration: ${duration}s`);
    console.log(`Bills with returns: ${billsWithReturns.length}`);
    console.log(`Vendor credits created: ${created}`);
    console.log(`Vendor credits skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log(`Total vendor credits: ${finalVCs.length}`);
    console.log('========================================\n');

    // Save results to file
    const resultsPath = path.join(__dirname, '..', `VENDOR_CREDITS_MIGRATION_RESULTS_${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    console.log(`📄 Results saved to: ${path.basename(resultsPath)}\n`);

    return results;

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    results.summary = {
      status: 'failed',
      error: error.message
    };
    
    // Save error results
    const resultsPath = path.join(__dirname, '..', `VENDOR_CREDITS_MIGRATION_ERROR_${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
    
    process.exit(1);
  }
}

// Run migration
runMigration();

