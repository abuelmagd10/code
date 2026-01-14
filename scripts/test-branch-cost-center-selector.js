const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testBranchCostCenterSelector() {
  try {
    console.log('🔍 Testing BranchCostCenterSelector functionality...\n');
    
    // البحث عن المستخدم foodcana1976@gmail.com
    const { data: member, error: memberError } = await supabase
      .from('company_members')
      .select('*')
      .ilike('email', '%foodcana1976%')
      .single();
      
    if (memberError || !member) {
      console.log('❌ Employee foodcana1976 not found');
      return;
    }
    
    console.log('✅ Found employee:');
    console.log('User ID:', member.user_id);
    console.log('Email:', member.email);
    console.log('Branch ID:', member.branch_id);
    console.log('Role:', member.role);
    
    // التحقق من الفرع
    if (!member.branch_id) {
      console.log('❌ CRITICAL: Employee has no branch assigned!');
      return;
    }
    
    // الحصول على تفاصيل الفرع
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('*')
      .eq('id', member.branch_id)
      .single();
      
    if (branchError || !branch) {
      console.log('❌ Branch not found for branch ID:', member.branch_id);
      return;
    }
    
    console.log('\n✅ Branch details:');
    console.log('Branch ID:', branch.id);
    console.log('Branch Name:', branch.name);
    console.log('Branch Code:', branch.code);
    console.log('Default Cost Center ID:', branch.default_cost_center_id);
    console.log('Default Warehouse ID:', branch.default_warehouse_id);
    
    // اختبار getBranchDefaults
    console.log('\n🔍 Testing getBranchDefaults function...');
    try {
      const { getBranchDefaults } = require('../lib/governance-branch-defaults');
      const branchDefaults = await getBranchDefaults(supabase, member.branch_id);
      
      console.log('✅ Branch defaults retrieved:');
      console.log('Default Cost Center ID:', branchDefaults.default_cost_center_id);
      console.log('Default Warehouse ID:', branchDefaults.default_warehouse_id);
      
      if (branchDefaults.default_cost_center_id && branchDefaults.default_warehouse_id) {
        console.log('✅ Branch has all required defaults!');
      } else {
        console.log('❌ Branch is missing required defaults!');
      }
      
    } catch (error) {
      console.log('❌ Error calling getBranchDefaults:', error.message);
    }
    
    // اختبار تحميل البيانات المرتبطة
    console.log('\n🔍 Testing data loading for BranchCostCenterSelector...');
    
    // جلب مراكز التكلفة للفرع
    const { data: costCenters, error: ccError } = await supabase
      .from('cost_centers')
      .select('*')
      .eq('branch_id', member.branch_id)
      .eq('is_active', true);
      
    if (ccError) {
      console.log('❌ Error loading cost centers:', ccError.message);
    } else {
      console.log(`✅ Found ${costCenters?.length || 0} cost centers for branch`);
      costCenters?.forEach(cc => {
        console.log(`  - ${cc.cost_center_name} (${cc.cost_center_code}) [ID: ${cc.id}]`);
      });
    }
    
    // جلب المخازن للفرع
    const { data: warehouses, error: whError } = await supabase
      .from('warehouses')
      .select('*')
      .eq('branch_id', member.branch_id)
      .eq('is_active', true);
      
    if (whError) {
      console.log('❌ Error loading warehouses:', whError.message);
    } else {
      console.log(`✅ Found ${warehouses?.length || 0} warehouses for branch`);
      warehouses?.forEach(wh => {
        console.log(`  - ${wh.name} (${wh.code}) [ID: ${wh.id}]`);
      });
    }
    
    // التحقق من صلاحية القيم الافتراضية
    console.log('\n🔍 Validating default values...');
    
    const defaultCCValid = branch.default_cost_center_id && 
      costCenters?.some(cc => cc.id === branch.default_cost_center_id);
    const defaultWHValid = branch.default_warehouse_id && 
      warehouses?.some(wh => wh.id === branch.default_warehouse_id);
    
    console.log('Default Cost Center Valid:', defaultCCValid);
    console.log('Default Warehouse Valid:', defaultWHValid);
    
    // اختبار منطق التعيين الافتراضي
    console.log('\n🔍 Testing default assignment logic...');
    
    if (defaultCCValid && defaultWHValid) {
      console.log('✅ SUCCESS: All conditions met for automatic assignment!');
      console.log('Expected behavior:');
      console.log('  - Branch: مصر الجديدة will be auto-selected');
      console.log('  - Cost Center: Default cost center will be auto-selected');
      console.log('  - Warehouse: Default warehouse will be auto-selected');
      console.log('  - UI will show selected values with "(افتراضي)" label');
    } else {
      console.log('⚠️  WARNING: Some defaults may not be applied correctly');
      if (!defaultCCValid) console.log('  - Default cost center is invalid or missing');
      if (!defaultWHValid) console.log('  - Default warehouse is invalid or missing');
    }
    
    // اقتراحات
    console.log('\n🔧 Recommendations:');
    if (!defaultCCValid) {
      console.log('  1. Create a cost center for this branch');
      console.log('  2. Set it as default in branch settings');
    }
    if (!defaultWHValid) {
      console.log('  3. Create a warehouse for this branch');
      console.log('  4. Set it as default in branch settings');
    }
    if (defaultCCValid && defaultWHValid) {
      console.log('  ✅ System is properly configured!');
      console.log('  ✅ The enhanced BranchCostCenterSelector should work correctly');
    }
    
  } catch (error) {
    console.error('❌ Error testing BranchCostCenterSelector:', error.message);
  }
}

testBranchCostCenterSelector();