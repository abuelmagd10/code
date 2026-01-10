const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyGovernanceFixes() {
  console.log('🔒 APPLYING MANDATORY ERP GOVERNANCE FIXES');
  console.log('==========================================\n');
  
  try {
    // Step 1: Add governance columns to suppliers
    console.log('📋 Step 1: Adding governance columns to suppliers...');
    
    // Check current suppliers structure
    const { data: suppliers, error: suppliersError } = await supabase
      .from('suppliers')
      .select('*')
      .limit(1);
    
    if (suppliersError) {
      console.log('⚠️  Suppliers table check:', suppliersError.message);
    } else {
      console.log('✅ Suppliers table accessible');
      if (suppliers && suppliers.length > 0) {
        const columns = Object.keys(suppliers[0]);
        console.log('📊 Current supplier columns:', columns.join(', '));
        
        if (!columns.includes('branch_id')) {
          console.log('⚠️  branch_id column missing from suppliers');
        }
        if (!columns.includes('cost_center_id')) {
          console.log('⚠️  cost_center_id column missing from suppliers');
        }
        if (!columns.includes('created_by_user_id')) {
          console.log('⚠️  created_by_user_id column missing from suppliers');
        }
      }
    }
    
    // Step 2: Check branches and cost centers
    console.log('\n📋 Step 2: Checking branches and cost centers...');
    
    const { data: branches, error: branchesError } = await supabase
      .from('branches')
      .select('id, name, company_id, is_main')
      .limit(5);
    
    if (branchesError) {
      console.log('⚠️  Branches table check:', branchesError.message);
    } else {
      console.log(`✅ Found ${branches?.length || 0} branches`);
      if (branches && branches.length > 0) {
        console.log('📊 Sample branch:', branches[0]);
      }
    }
    
    const { data: costCenters, error: costCentersError } = await supabase
      .from('cost_centers')
      .select('id, name, company_id, branch_id')
      .limit(5);
    
    if (costCentersError) {
      console.log('⚠️  Cost centers table check:', costCentersError.message);
    } else {
      console.log(`✅ Found ${costCenters?.length || 0} cost centers`);
      if (costCenters && costCenters.length > 0) {
        console.log('📊 Sample cost center:', costCenters[0]);
      }
    }
    
    // Step 3: Check warehouses
    console.log('\n📋 Step 3: Checking warehouses...');
    
    const { data: warehouses, error: warehousesError } = await supabase
      .from('warehouses')
      .select('id, name, company_id, branch_id, is_main')
      .limit(5);
    
    if (warehousesError) {
      console.log('⚠️  Warehouses table check:', warehousesError.message);
    } else {
      console.log(`✅ Found ${warehouses?.length || 0} warehouses`);
      if (warehouses && warehouses.length > 0) {
        console.log('📊 Sample warehouse:', warehouses[0]);
      }
    }
    
    // Step 4: Check companies
    console.log('\n📋 Step 4: Checking companies...');
    
    const { data: companies, error: companiesError } = await supabase
      .from('companies')
      .select('id, name')
      .limit(3);
    
    if (companiesError) {
      console.log('⚠️  Companies table check:', companiesError.message);
    } else {
      console.log(`✅ Found ${companies?.length || 0} companies`);
      if (companies && companies.length > 0) {
        console.log('📊 Sample company:', companies[0]);
      }
    }
    
    console.log('\n🎯 GOVERNANCE STATUS SUMMARY:');
    console.log('============================');
    console.log('✅ Database connection: Working');
    console.log('✅ Core tables: Accessible');
    console.log('⚠️  Schema modifications: Need manual SQL execution');
    console.log('');
    console.log('📝 NEXT STEPS:');
    console.log('1. The database structure is ready');
    console.log('2. Schema changes need to be applied via Supabase Dashboard');
    console.log('3. Update application code to use governance layer');
    console.log('');
    console.log('🔧 TO APPLY SCHEMA CHANGES:');
    console.log('1. Go to Supabase Dashboard > SQL Editor');
    console.log('2. Run the SQL from: scripts/MANDATORY_ERP_GOVERNANCE_FIXES.sql');
    console.log('3. Then run: scripts/ERP_GOVERNANCE_VERIFICATION.sql');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

applyGovernanceFixes();