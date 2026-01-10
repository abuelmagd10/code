const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function finalTestSalesOrderVisibility() {
  console.log('🧪 FINAL TEST: Sales Order Visibility');
  console.log('====================================\n');
  
  try {
    // Find the user
    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users.users.find(u => u.email?.includes('foodcana1976'));
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log(`👤 Testing for user: ${user.email}`);
    
    // Get user's company membership
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id, role, branch_id, cost_center_id')
      .eq('user_id', user.id)
      .single();
    
    // Get user's governance context
    const { data: governance } = await supabase
      .from('user_branch_cost_center')
      .select('branch_id, cost_center_id')
      .eq('user_id', user.id)
      .eq('company_id', membership.company_id)
      .single();
    
    console.log('🎯 User Context:');
    console.log(`   Company: ${membership.company_id}`);
    console.log(`   Role: ${membership.role}`);
    console.log(`   Governance Branch: ${governance?.branch_id}`);
    console.log(`   Governance Cost Center: ${governance?.cost_center_id}\n`);
    
    // Test the exact API query that would be used
    console.log('🔍 Testing API Query Logic:\n');
    
    // Step 1: Basic company filter
    let query = supabase
      .from('sales_orders')
      .select('id, so_number, status, branch_id, cost_center_id, warehouse_id, created_by_user_id')
      .eq('company_id', membership.company_id);
    
    console.log('1️⃣ Company filter applied');
    
    // Step 2: Role-based filter (staff sees only their orders)
    if (membership.role === 'staff' || membership.role === 'sales' || membership.role === 'employee') {
      query = query.eq('created_by_user_id', user.id);
      console.log('2️⃣ Created by user filter applied (role: staff)');
    }
    
    // Step 3: Governance filters
    if (governance?.branch_id) {
      query = query.eq('branch_id', governance.branch_id);
      console.log('3️⃣ Branch governance filter applied');
    }
    
    if (governance?.cost_center_id) {
      query = query.eq('cost_center_id', governance.cost_center_id);
      console.log('4️⃣ Cost center governance filter applied');
    }
    
    // Execute the query
    const { data: orders, error } = await query;
    
    console.log('\n📋 RESULTS:');
    if (error) {
      console.log(`❌ Query Error: ${error.message}`);
    } else {
      console.log(`✅ Found ${orders?.length || 0} sales orders`);
      
      if (orders && orders.length > 0) {
        orders.forEach(order => {
          console.log(`   📄 SO-${order.so_number}:`);
          console.log(`      Status: ${order.status}`);
          console.log(`      Branch: ${order.branch_id}`);
          console.log(`      Cost Center: ${order.cost_center_id}`);
          console.log(`      Warehouse: ${order.warehouse_id}`);
          console.log(`      Created By: ${order.created_by_user_id}`);
          console.log('');
        });
      }
    }
    
    // Test with warehouse filter too (full governance)
    console.log('🔍 Testing with Full Governance (including warehouse):\n');
    
    const { data: warehouse } = await supabase
      .from('warehouses')
      .select('id')
      .eq('company_id', membership.company_id)
      .eq('branch_id', governance?.branch_id)
      .eq('is_main', true)
      .single();
    
    if (warehouse) {
      const { data: fullGovOrders } = await supabase
        .from('sales_orders')
        .select('id, so_number, status')
        .eq('company_id', membership.company_id)
        .eq('created_by_user_id', user.id)
        .eq('branch_id', governance.branch_id)
        .eq('cost_center_id', governance.cost_center_id)
        .eq('warehouse_id', warehouse.id);
      
      console.log(`✅ Full governance query: ${fullGovOrders?.length || 0} orders`);
      if (fullGovOrders && fullGovOrders.length > 0) {
        fullGovOrders.forEach(order => {
          console.log(`   📄 SO-${order.so_number} | Status: ${order.status}`);
        });
      }
    }
    
    console.log('\n🎯 CONCLUSION:');
    if (orders && orders.length > 0) {
      console.log('✅ SUCCESS: User can now see their sales orders!');
      console.log('✅ The governance system is working correctly.');
      console.log('✅ The API should now return the sales orders to the user.');
    } else {
      console.log('❌ ISSUE: User still cannot see sales orders.');
      console.log('❌ Further investigation needed.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

finalTestSalesOrderVisibility();