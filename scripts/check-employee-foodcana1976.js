const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkEmployeeFoodcana1976() {
  try {
    console.log('🔍 Checking employee foodcana1976 details...\n');
    
    // البحث عن المستخدم foodcana1976
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, username')
      .eq('email', 'foodcana1976@example.com')
      .or('username.eq.foodcana1976')
      .single();

    if (userError || !user) {
      console.log('❌ User foodcana1976 not found in users table');
      
      // البحث في company_members
      const { data: member, error: memberError } = await supabase
        .from('company_members')
        .select('*, users!inner(id, email, username)')
        .or('users.email.eq.foodcana1976@example.com,users.username.eq.foodcana1976')
        .single();
        
      if (memberError || !member) {
        console.log('❌ Employee foodcana1976 not found in company_members either');
        return;
      }
      
      console.log('✅ Found employee in company_members:');
      console.log('User ID:', member.user_id);
      console.log('Company ID:', member.company_id);
      console.log('Branch ID:', member.branch_id);
      console.log('Cost Center ID:', member.cost_center_id);
      console.log('Warehouse ID:', member.warehouse_id);
      
      await checkEmployeeContext(member.user_id, member.company_id, member.branch_id);
      
    } else {
      console.log('✅ Found user in users table:');
      console.log('User ID:', user.id);
      console.log('Email:', user.email);
      console.log('Username:', user.username);
      
      // البحث عن عضوية الشركة
      const { data: member, error: memberError } = await supabase
        .from('company_members')
        .select('*')
        .eq('user_id', user.id)
        .single();
        
      if (memberError || !member) {
        console.log('❌ User is not a member of any company');
        return;
      }
      
      console.log('\n✅ Company membership details:');
      console.log('Company ID:', member.company_id);
      console.log('Branch ID:', member.branch_id);
      console.log('Cost Center ID:', member.cost_center_id);
      console.log('Warehouse ID:', member.warehouse_id);
      
      await checkEmployeeContext(user.id, member.company_id, member.branch_id);
    }
    
  } catch (error) {
    console.error('❌ Error checking employee:', error.message);
  }
}

async function checkEmployeeContext(userId, companyId, branchId) {
  console.log('\n🔍 Checking employee context and branch details...');
  
  if (!branchId) {
    console.log('❌ Employee has no branch assigned!');
    return;
  }
  
  // التحقق من تفاصيل الفرع
  const { data: branch, error: branchError } = await supabase
    .from('branches')
    .select('*')
    .eq('id', branchId)
    .single();
    
  if (branchError || !branch) {
    console.log('❌ Branch not found for branch ID:', branchId);
    return;
  }
  
  console.log('\n✅ Branch details:');
  console.log('Branch ID:', branch.id);
  console.log('Branch Name:', branch.name);
  console.log('Branch Code:', branch.code);
  console.log('Default Cost Center ID:', branch.default_cost_center_id);
  console.log('Default Warehouse ID:', branch.default_warehouse_id);
  
  // التحقق من مركز التكلفة الافتراضي
  if (branch.default_cost_center_id) {
    const { data: costCenter, error: ccError } = await supabase
      .from('cost_centers')
      .select('*')
      .eq('id', branch.default_cost_center_id)
      .single();
      
    if (costCenter) {
      console.log('\n✅ Default Cost Center details:');
      console.log('Cost Center ID:', costCenter.id);
      console.log('Cost Center Name:', costCenter.cost_center_name);
      console.log('Cost Center Code:', costCenter.cost_center_code);
    }
  } else {
    console.log('\n⚠️  Branch has no default cost center!');
  }
  
  // التحقق من المخزن الافتراضي
  if (branch.default_warehouse_id) {
    const { data: warehouse, error: whError } = await supabase
      .from('warehouses')
      .select('*')
      .eq('id', branch.default_warehouse_id)
      .single();
      
    if (warehouse) {
      console.log('\n✅ Default Warehouse details:');
      console.log('Warehouse ID:', warehouse.id);
      console.log('Warehouse Name:', warehouse.name);
      console.log('Warehouse Code:', warehouse.code);
    }
  } else {
    console.log('\n⚠️  Branch has no default warehouse!');
  }
  
  // التحقق من عمليات أمر البيع الأخيرة
  console.log('\n🔍 Checking recent sales orders for this employee...');
  const { data: salesOrders, error: soError } = await supabase
    .from('sales_orders')
    .select('*, cost_centers!inner(*), warehouses!inner(*)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(5);
    
  if (salesOrders && salesOrders.length > 0) {
    console.log(`✅ Found ${salesOrders.length} recent sales orders:`);
    salesOrders.forEach((order, index) => {
      console.log(`\nOrder ${index + 1}:`);
      console.log('Order ID:', order.id);
      console.log('Order Number:', order.order_number);
      console.log('Cost Center ID:', order.cost_center_id);
      console.log('Warehouse ID:', order.warehouse_id);
      console.log('Created At:', order.created_at);
      
      if (order.cost_centers) {
        console.log('Cost Center Name:', order.cost_centers.cost_center_name);
      }
      if (order.warehouses) {
        console.log('Warehouse Name:', order.warehouses.name);
      }
    });
  } else {
    console.log('ℹ️  No sales orders found for this employee');
  }
}

checkEmployeeFoodcana1976();