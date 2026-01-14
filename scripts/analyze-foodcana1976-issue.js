const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function analyzeFoodcana1976Issue() {
  try {
    console.log('🔍 Analyzing foodcana1976 sales order creation issue...\n');
    
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
    console.log('Company ID:', member.company_id);
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
    console.log('Default Cost Center ID:', branch.default_cost_center_id);
    console.log('Default Warehouse ID:', branch.default_warehouse_id);
    
    // التحقق من القيم الافتراضية
    if (!branch.default_cost_center_id) {
      console.log('❌ Branch has no default cost center!');
    }
    if (!branch.default_warehouse_id) {
      console.log('❌ Branch has no default warehouse!');
    }
    
    // محاكاة عملية إنشاء أمر البيع كما يحدث في الواجهة
    console.log('\n🔍 Simulating sales order creation process...');
    
    try {
      // محاكاة ما يحدث في useEffect في صفحة أمر البيع
      console.log('1. Loading user branch context...');
      const userBranchId = member.branch_id;
      console.log('   User Branch ID:', userBranchId);
      
      console.log('2. Fetching branch defaults...');
      
      // هذا هو الكود المستخدم في الصفحة
      const { data: branchData, error: branchDataError } = await supabase
        .from('branches')
        .select('default_warehouse_id, default_cost_center_id')
        .eq('id', userBranchId)
        .single();
        
      if (branchDataError || !branchData) {
        console.log('   ❌ Failed to fetch branch defaults:', branchDataError?.message);
        throw new Error('Branch defaults not found');
      }
      
      console.log('   ✅ Branch defaults retrieved:');
      console.log('   Default Warehouse ID:', branchData.default_warehouse_id);
      console.log('   Default Cost Center ID:', branchData.default_cost_center_id);
      
      console.log('3. Validating defaults...');
      
      // التحقق من صلاحية القيم
      if (!branchData.default_warehouse_id || !branchData.default_cost_center_id) {
        console.log('   ❌ Branch missing required defaults!');
        console.log('   Warehouse:', branchData.default_warehouse_id || 'NULL');
        console.log('   Cost Center:', branchData.default_cost_center_id || 'NULL');
        throw new Error('Branch missing required defaults');
      }
      
      console.log('4. Setting form values...');
      console.log('   ✅ Branch ID would be set to:', userBranchId);
      console.log('   ✅ Warehouse ID would be set to:', branchData.default_warehouse_id);
      console.log('   ✅ Cost Center ID would be set to:', branchData.default_cost_center_id);
      
      console.log('\n🎉 SUCCESS: Sales order form would load correctly!');
      console.log('All required fields would be automatically populated.');
      
    } catch (error) {
      console.log('\n❌ FAILED: Sales order creation would fail!');
      console.log('Error:', error.message);
      
      if (error.message.includes('Branch missing required defaults')) {
        console.log('\n🔧 SOLUTION:');
        console.log('The branch needs to have default cost center and warehouse assigned.');
        console.log('Run the governance script to fix this:');
        console.log('node scripts/run-sales-order-governance-crud.js');
      }
    }
    
    // التحقق من وجود أوامر بيع سابقة
    console.log('\n🔍 Checking for existing sales orders...');
    
    // التحقق من عمود created_by أو user_id
    const { data: salesOrders1 } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('user_id', member.user_id)
      .order('created_at', { ascending: false })
      .limit(5);
      
    const { data: salesOrders2 } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('created_by', member.user_id)
      .order('created_at', { ascending: false })
      .limit(5);
      
    const allOrders = [...(salesOrders1 || []), ...(salesOrders2 || [])];
    
    if (allOrders.length > 0) {
      console.log(`✅ Found ${allOrders.length} existing sales orders:`);
      allOrders.forEach((order, index) => {
        console.log(`\nOrder ${index + 1}:`);
        console.log('ID:', order.id);
        console.log('Number:', order.order_number);
        console.log('Cost Center ID:', order.cost_center_id);
        console.log('Warehouse ID:', order.warehouse_id);
        console.log('Status:', order.status);
        console.log('Created At:', order.created_at);
        
        if (!order.cost_center_id) {
          console.log('❌ This order has NO COST CENTER assigned!');
        }
        if (!order.warehouse_id) {
          console.log('❌ This order has NO WAREHOUSE assigned!');
        }
      });
    } else {
      console.log('ℹ️  No existing sales orders found for this user');
    }
    
    // التحقق النهائي
    console.log('\n📋 FINAL ANALYSIS:');
    console.log('Employee:', member.email);
    console.log('Branch:', branch.name);
    console.log('Has Default Cost Center:', !!branch.default_cost_center_id);
    console.log('Has Default Warehouse:', !!branch.default_warehouse_id);
    
    if (branch.default_cost_center_id && branch.default_warehouse_id) {
      console.log('\n✅ CONCLUSION: Employee context is properly configured!');
      console.log('The system should automatically assign branch defaults.');
      console.log('If sales orders are not getting cost center/warehouse,');
      console.log('the issue is likely in the frontend JavaScript code.');
    } else {
      console.log('\n❌ CONCLUSION: Branch is missing required defaults!');
      console.log('This would prevent automatic assignment.');
    }
    
  } catch (error) {
    console.error('❌ Error analyzing issue:', error.message);
  }
}

analyzeFoodcana1976Issue();