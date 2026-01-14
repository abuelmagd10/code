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
    
    // البحث عن المستخدم foodcana1976
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, username, full_name')
      .eq('email', 'foodcana1976@gmail.com')
      .single();
      
    if (userError || !user) {
      console.log('❌ User foodcana1976 not found');
      return;
    }
    
    console.log('✅ Found user:');
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
    
    // التحقق من القيم الافتراضية باستخدام getBranchDefaults
    console.log('\n🔍 Testing getBranchDefaults function...');
    try {
      const { getBranchDefaults } = require('../lib/governance-branch-defaults');
      const branchDefaults = await getBranchDefaults(supabase, member.branch_id);
      
      console.log('✅ Branch defaults retrieved:');
      console.log('Default Cost Center ID:', branchDefaults.default_cost_center_id);
      console.log('Default Warehouse ID:', branchDefaults.default_warehouse_id);
      
      // التحقق من وجود القيم
      if (!branchDefaults.default_cost_center_id) {
        console.log('❌ Branch has no default cost center!');
      }
      if (!branchDefaults.default_warehouse_id) {
        console.log('❌ Branch has no default warehouse!');
      }
      
      if (branchDefaults.default_cost_center_id && branchDefaults.default_warehouse_id) {
        console.log('✅ Branch has all required defaults!');
      }
      
    } catch (error) {
      console.log('❌ Error calling getBranchDefaults:', error.message);
    }
    
    // التحقق من صلاحيات المستخدم
    console.log('\n🔍 Checking user permissions...');
    const role = member.role?.toLowerCase() || 'staff';
    const isAdmin = ['super_admin', 'admin', 'general_manager', 'gm', 'owner', 'generalmanager', 'superadmin'].includes(role);
    
    console.log('User Role:', role);
    console.log('Is Admin:', isAdmin);
    
    // محاكاة عملية إنشاء أمر البيع
    console.log('\n🔍 Simulating sales order creation process...');
    
    // الخطوة 1: التحقق من وجود سياق الحوكمة
    if (!member.branch_id) {
      console.log('❌ FAILED: No branch context available');
      return;
    }
    
    // الخطوة 2: جلب القيم الافتراضية
    try {
      const { getBranchDefaults } = require('../lib/governance-branch-defaults');
      const branchDefaults = await getBranchDefaults(supabase, member.branch_id);
      
      console.log('✅ Branch defaults would be applied:');
      console.log('Branch ID:', member.branch_id);
      console.log('Cost Center ID:', branchDefaults.default_cost_center_id);
      console.log('Warehouse ID:', branchDefaults.default_warehouse_id);
      
      // الخطوة 3: التحقق من صلاحية القيم
      if (!isAdmin) {
        console.log('✅ Non-admin user - enforcing strict defaults');
        console.log('Cost Center would be set to:', branchDefaults.default_cost_center_id);
        console.log('Warehouse would be set to:', branchDefaults.default_warehouse_id);
      } else {
        console.log('✅ Admin user - can override defaults if needed');
      }
      
      console.log('\n✅ SUCCESS: User context is properly configured for sales order creation!');
      console.log('The system should automatically assign:');
      console.log('- Branch:', branch.name);
      console.log('- Cost Center:', branch.default_cost_center_id);
      console.log('- Warehouse:', branch.default_warehouse_id);
      
    } catch (error) {
      console.log('❌ FAILED to get branch defaults:', error.message);
      console.log('This would prevent sales order creation!');
    }
    
    // التحقق من وجود أوامر بيع سابقة
    console.log('\n🔍 Checking for existing sales orders...');
    const { data: salesOrders, error: soError } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('created_by', user.id)
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
    
  } catch (error) {
    console.error('❌ Error checking user context:', error.message);
  }
}

checkFoodcana1976SalesOrderContext();