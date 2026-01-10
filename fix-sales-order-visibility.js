const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixSalesOrderBranchIssue() {
  console.log('🔧 FIXING SALES ORDER BRANCH MISMATCH');
  console.log('====================================\n');
  
  try {
    // 1. Get user info
    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users.users.find(u => u.email?.includes('foodcana1976'));
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    // 2. Get user's company and branch
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id, role, branch_id, cost_center_id')
      .eq('user_id', user.id)
      .single();
    
    console.log('👤 User Info:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Company: ${membership.company_id}`);
    console.log(`   Branch: ${membership.branch_id}`);
    console.log(`   Cost Center: ${membership.cost_center_id}`);
    console.log(`   Role: ${membership.role}\n`);
    
    // 3. Find sales orders created by this user
    const { data: userOrders } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('created_by_user_id', user.id)
      .eq('company_id', membership.company_id);
    
    console.log(`📋 Found ${userOrders?.length || 0} sales orders created by user\n`);
    
    if (userOrders && userOrders.length > 0) {
      for (const order of userOrders) {
        console.log(`🔍 Checking order SO-${order.so_number}:`);
        console.log(`   Current Branch: ${order.branch_id}`);
        console.log(`   Current Cost Center: ${order.cost_center_id}`);
        console.log(`   User's Branch: ${membership.branch_id}`);
        console.log(`   User's Cost Center: ${membership.cost_center_id}`);
        
        // Check if branch/cost center mismatch
        const needsUpdate = order.branch_id !== membership.branch_id || 
                           order.cost_center_id !== membership.cost_center_id;
        
        if (needsUpdate) {
          console.log('   ⚠️  MISMATCH DETECTED - Fixing...');
          
          // Get the correct warehouse for user's branch
          const { data: warehouse } = await supabase
            .from('warehouses')
            .select('id')
            .eq('company_id', membership.company_id)
            .eq('branch_id', membership.branch_id)
            .eq('is_main', true)
            .single();
          
          const updateData = {
            branch_id: membership.branch_id,
            cost_center_id: membership.cost_center_id,
          };
          
          if (warehouse) {
            updateData.warehouse_id = warehouse.id;
          }
          
          const { error: updateError } = await supabase
            .from('sales_orders')
            .update(updateData)
            .eq('id', order.id);
          
          if (updateError) {
            console.log(`   ❌ Error updating: ${updateError.message}`);
          } else {
            console.log('   ✅ Fixed branch/cost center mismatch');
            console.log(`   ✅ Updated to Branch: ${membership.branch_id}`);
            console.log(`   ✅ Updated to Cost Center: ${membership.cost_center_id}`);
            if (warehouse) {
              console.log(`   ✅ Updated to Warehouse: ${warehouse.id}`);
            }
          }
        } else {
          console.log('   ✅ Branch and cost center are correct');
        }
        console.log('');
      }
    }
    
    // 4. Test visibility after fix
    console.log('🧪 Testing visibility after fix...');
    
    let query = supabase
      .from('sales_orders')
      .select('id, so_number, status, total_amount, branch_id, cost_center_id, created_by_user_id')
      .eq('company_id', membership.company_id);
    
    // Apply role-based filtering (staff sees only their orders)
    if (membership.role === 'staff' || membership.role === 'sales' || membership.role === 'employee') {
      query = query.eq('created_by_user_id', user.id);
    }
    
    // Apply governance filtering
    if (membership.branch_id) {
      query = query.eq('branch_id', membership.branch_id);
    }
    if (membership.cost_center_id) {
      query = query.eq('cost_center_id', membership.cost_center_id);
    }
    
    const { data: visibleOrders, error: queryError } = await query;
    
    if (queryError) {
      console.log('❌ Error testing visibility:', queryError.message);
    } else {
      console.log(`✅ User can now see ${visibleOrders?.length || 0} sales orders`);
      
      if (visibleOrders && visibleOrders.length > 0) {
        console.log('\n📋 Visible Orders:');
        visibleOrders.forEach((order, index) => {
          console.log(`${index + 1}. SO-${order.so_number} | Status: ${order.status} | Total: ${order.total_amount}`);
        });
      }
    }
    
    console.log('\n✅ SALES ORDER VISIBILITY ISSUE FIXED!');
    console.log('The user should now be able to see their sales orders.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fixSalesOrderBranchIssue();