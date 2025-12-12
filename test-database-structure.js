// Test script to understand database structure and validate search logic
// This script helps debug the invoice search issue

const { createClient } = require('@supabase/supabase-js');

// Use environment variables or dummy values
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_anon_key_for_build';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testDatabaseConnection() {
  console.log('🔍 Testing Database Connection and Structure');
  console.log('==============================================');
  console.log(`URL: ${supabaseUrl}`);
  console.log(`Key: ${supabaseKey.substring(0, 10)}...`);
  
  try {
    // Test 1: Check if we can connect to the database
    console.log('\n📍 Test 1: Database Connection...');
    const { data, error } = await supabase.from('invoices').select('id').limit(1);
    
    if (error) {
      console.log(`❌ Database connection failed: ${error.message}`);
      console.log(`   Error code: ${error.code}`);
      console.log(`   Error details: ${JSON.stringify(error, null, 2)}`);
      
      // Try to get more information about the error
      if (error.message.includes('fetch')) {
        console.log('\n💡 Suggestion: Check your Supabase URL and network connectivity');
      } else if (error.message.includes('auth')) {
        console.log('\n💡 Suggestion: Check your Supabase anon key');
      }
      
      return false;
    } else {
      console.log('✅ Database connection successful');
      console.log(`   Found ${data ? data.length : 0} rows`);
    }
    
    // Test 2: Check table structure
    console.log('\n📍 Test 2: Table Structure...');
    const { data: structureData, error: structureError } = await supabase
      .from('invoices')
      .select('*')
      .limit(1);
      
    if (structureError) {
      console.log(`❌ Could not get table structure: ${structureError.message}`);
    } else if (structureData && structureData.length > 0) {
      console.log('✅ Table structure retrieved');
      console.log('   Available columns:', Object.keys(structureData[0]).join(', '));
      
      // Show a sample record
      console.log('\n📋 Sample Invoice Record:');
      const sample = structureData[0];
      console.log(`   ID: ${sample.id}`);
      console.log(`   Invoice Number: ${sample.invoice_number}`);
      console.log(`   Invoice Type: ${sample.invoice_type}`);
      console.log(`   Status: ${sample.status}`);
      console.log(`   Company ID: ${sample.company_id}`);
    } else {
      console.log('⚠️  No data found in invoices table');
    }
    
    // Test 3: Search for INV-0028 specifically
    console.log('\n📍 Test 3: Search for INV-0028...');
    
    // Try different search patterns
    const searchPatterns = [
      { type: 'Exact match', query: { invoice_number: 'INV-0028' } },
      { type: 'Case insensitive', query: { invoice_number: 'inv-0028' } },
      { type: 'Contains pattern', query: { invoice_number: '0028' } },
      { type: 'Sales return type', query: { invoice_type: 'sales_return' } }
    ];
    
    for (const pattern of searchPatterns) {
      console.log(`\n🔍 Testing: ${pattern.type}`);
      const { data: searchData, error: searchError } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_type, status, company_id')
        .match(pattern.query)
        .limit(5);
        
      if (searchError) {
        console.log(`   ❌ Error: ${searchError.message}`);
      } else if (searchData && searchData.length > 0) {
        console.log(`   ✅ Found ${searchData.length} results:`);
        searchData.forEach((invoice, index) => {
          console.log(`      ${index + 1}. ${invoice.invoice_number} (${invoice.invoice_type}) - Company: ${invoice.company_id}`);
        });
      } else {
        console.log(`   ⚠️  No results found`);
      }
    }
    
    // Test 4: Check for return invoices
    console.log('\n📍 Test 4: Check for Return Invoices...');
    const { data: returnData, error: returnError } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_type, status')
      .eq('invoice_type', 'sales_return')
      .limit(10);
      
    if (returnError) {
      console.log(`❌ Error checking return invoices: ${returnError.message}`);
    } else if (returnData && returnData.length > 0) {
      console.log(`✅ Found ${returnData.length} return invoices:`);
      returnData.forEach((invoice, index) => {
        console.log(`   ${index + 1}. ${invoice.invoice_number} - Status: ${invoice.status}`);
      });
    } else {
      console.log('⚠️  No return invoices found');
    }
    
    return true;
    
  } catch (error) {
    console.log(`❌ Unexpected error: ${error.message}`);
    console.log(`   Error stack: ${error.stack}`);
    return false;
  }
}

// Run the test
testDatabaseConnection().then(success => {
  console.log('\n' + '='.repeat(50));
  if (success) {
    console.log('✅ Database tests completed successfully');
  } else {
    console.log('❌ Database tests failed');
    console.log('\n💡 Recommendations:');
    console.log('   1. Check your Supabase project URL and anon key');
    console.log('   2. Ensure your database is accessible');
    console.log('   3. Verify network connectivity');
    console.log('   4. Check if the invoices table exists and has data');
  }
}).catch(error => {
  console.log(`❌ Test execution failed: ${error.message}`);
});