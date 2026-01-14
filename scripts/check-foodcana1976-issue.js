const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkFoodcana1976SalesOrderContext() {
  try {
    console.log('🔍 Checking foodcana1976 sales order creation context...\n');
    
    // البحث عن المستخدم foodcana1976@gmail.com
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, username, full_name')
      .ilike('email', '%foodcana1976%')
      .single();
      
    if (userError || !user) {
      console.log('❌ User foodcana1976 not found in users table');
      
      // البحث في company_members
      const { data: member, error: memberError } = await supabase
        .from('company_members')
        .select('*')
        .ilike('email', '%foodcana1976%')
        .single();
        
      if (memberError || !member) {
        console.log('❌ Employee foodcana1976 not found in company_members either');
        
        // عرض جميع الموظفين في شركة تست
        const { data: testCompany } = await supabase
          .from('companies')
          .select('id')
          .eq('name', 'تست')
          .single();
          
        if (testCompany) {
          const { data: allMembers } = await supabase
            .from('company_members')
            .select('*')
            .eq('company_id', testCompany.id);
            
          console.log('Available employees in company "تست":');
          allMembers?.forEach((emp, index) => {
            console.log(`${index + 1}. ${emp.email} (${emp.role})`);
          });
        }
        
        return;
      }
      
      console.log('✅ Found employee in company_members:');
      console.log('User ID:', member.user_id);
      console.log('Email:', member.email);
      console.log('Company ID:', member.company_id);
      console.log('Branch ID:', member.branch_id);
      console.log('Cost Center ID:', member.cost_center_id);
      console.log('Warehouse ID:', member.warehouse_id);
      
      await analyzeEmployeeContext(member);
      
    } else {
      console.log('✅ Found user in users table:');
      console.log('User ID:', user.id);
      console.log('Email:', user.email);
      console.log('Username:', user.username);
      console.log('Full Name:', user.full_name);
      
      // الحصول على عضوية الشركة
      const { data: member, error: memberError } = await supabase
        .from('company_members')
        .select('*')
        .eq('user_id', user.id)
        .single();
        
      if (memberError || !member) {
        console.log('❌ User is not a member of any company');
        return;
      }
      
      console.log('\n✅ Company membership:');
      console.log('Company ID:', member.company_id);
      console.log('Branch ID:', member.branch_id);
      console.log('Role:', member.role);
      console.log('Direct Cost Center ID:', member.cost_center_id);
      console.log('Direct Warehouse ID:', member.warehouse_id);
      
      await analyzeEmployeeContext(member);
    }
    
  } catch (error) {
    console.error('❌ Error checking user context:', error.message);
  }
}

async function analyzeEmployeeContext(member) {
  // التحقق من الفرع
  if (!member.branch_id) {
    console.log('❌ CRITICAL: User has no branch assigned!');
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
  
  // التحقق من القيم الافتراضية
  if (!branch.default_cost_center_id) {
    console.log('⚠️  Branch has no default cost center!');
  }
  if (!branch.default_warehouse_id) {
    console.log('⚠️  Branch has no default warehouse!');
  }
  
  // التحقق من صلاحيات المستخدم
  const role = member.role?.toLowerCase() || 'staff';
  const isAdmin = ['super_admin', 'admin', 'general_manager', 'gm', 'owner', 'generalmanager', 'superadmin'].includes(role);
  
  console.log('\n🔍 User permissions:');
  console.log('User Role:', role);
  console.log('Is Admin:', isAdmin);
  
  // محاكاة عملية إنشاء أمر البيع
  console.log('\n🔍 Simulating sales order creation process...');
  
  try {
    const { getBranchDefaults } = require('../lib/governance-branch-defaults');
    const branchDefaults = await getBranchDefaults(supabase, member.branch_id);
    
    console.log('✅ Branch defaults retrieved:');
    console.log('Default Cost Center ID:', branchDefaults.default_cost_center_id);
    console.log('Default Warehouse ID:', branchDefaults.default_warehouse_id);
    
    if (!branchDefaults.default_cost_center_id) {
      console.log('❌ Branch has no default cost center!');
    }
    if (!branchDefaults.default_warehouse_id) {
      console.log('❌ Branch has no default warehouse!');
    }
    
    if (branchDefaults.default_cost_center_id && branchDefaults.default_warehouse_id) {
      console.log('\n✅ SUCCESS: Branch has all required defaults!');
      console.log('The system should automatically assign:');
      console.log('- Branch:', branch.name);
      console.log('- Cost Center:', branchDefaults.default_cost_center_id);
      console.log('- Warehouse:', branchDefaults.default_warehouse_id);
    } else {
      console.log('\n❌ PROBLEM: Branch is missing required defaults!');
      console.log('This would prevent sales order creation!');
    }
    
  } catch (error) {
    console.log('❌ Error getting branch defaults:', error.message);
    console.log('This would prevent sales order creation!');
  }
  
  // التحقق من وجود أوامر بيع سابقة
  console.log('\n🔍 Checking for existing sales orders...');
  const { data: salesOrders, error: soError } = await supabase
    .from('sales_orders')
    .select('*')
    .eq('created_by', member.user_id)
    .order('created_at', { ascending: false })
    .limit(5);
    
  if (soError) {
    console.log('❌ Error fetching sales orders:', soError.message);
  } else if (salesOrders && salesOrders.length > 0) {
    console.log(`✅ Found ${salesOrders.length} existing sales orders:`);
    salesOrders.forEach((order, index) => {
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
  
  // اقتراحات لحل المشكلة
  console.log('\n🔧 Suggestions for fixing the issue:');
  
  if (!branch.default_cost_center_id || !branch.default_warehouse_id) {
    console.log('1. Run the governance script to create branch defaults:');
    console.log('   node scripts/run-sales-order-governance-crud.js');
    console.log('');
    console.log('2. Or manually assign defaults to the branch:');
    console.log('   - Create a cost center for branch:', branch.name);
    console.log('   - Create a warehouse for branch:', branch.name);
    console.log('   - Set them as defaults in the branch settings');
  } else {
    console.log('✅ Branch defaults are properly configured');
    console.log('The issue might be in the frontend code or API calls');
    console.log('Check the browser console for any JavaScript errors');
  }
}

checkFoodcana1976SalesOrderContext();