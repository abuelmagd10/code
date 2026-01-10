const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugSalesOrderVisibility() {
  console.log('🔍 DEBUGGING SALES ORDER VISIBILITY ISSUE');
  console.log('=========================================\n');
  
  try {
    // 1. Find the user
    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users.users.find(u => u.email?.includes('foodcana1976'));
    
    if (!user) {
      console.log('❌ User not found');
      return;
    }
    
    console.log('👤 User Found:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}\n`);
    
    // 2. Get user's company membership
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id, role, branch_id, cost_center_id')
      .eq('user_id', user.id)
      .single();
    
    console.log('🏢 User Membership:');
    console.log(`   Company: ${membership.company_id}`);
    console.log(`   Role: ${membership.role}`);
    console.log(`   Branch: ${membership.branch_id}`);
    console.log(`   Cost Center: ${membership.cost_center_id}\n`);
    
    // 3. Check user_branch_cost_center table
    const { data: userContext } = await supabase
      .from('user_branch_cost_center')
      .select('*')
      .eq('user_id', user.id)
      .eq('company_id', membership.company_id)
      .single();
    
    console.log('🎯 User Governance Context:');
    if (userContext) {
      console.log(`   Branch: ${userContext.branch_id}`);
      console.log(`   Cost Center: ${userContext.cost_center_id}`);
    } else {
      console.log('   ❌ No governance context found!');
    }
    console.log('');
    
    // 4. Get all sales orders by this user
    const { data: userOrders } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('created_by_user_id', user.id)
      .eq('company_id', membership.company_id);
    
    console.log(`📋 Sales Orders Created by User: ${userOrders?.length || 0}`);
    if (userOrders && userOrders.length > 0) {
      userOrders.forEach(order => {
        console.log(`   SO-${order.so_number}:`);
        console.log(`     Branch: ${order.branch_id}`);
        console.log(`     Cost Center: ${order.cost_center_id}`);
        console.log(`     Warehouse: ${order.warehouse_id}`);
        console.log(`     Status: ${order.status}`);
      });
    }
    console.log('');
    
    // 5. Test different query scenarios
    console.log('🧪 Testing Query Scenarios:\n');
    
    // Scenario 1: Basic company filter only
    const { data: companyOrders } = await supabase
      .from('sales_orders')
      .select('id, so_number, branch_id, cost_center_id, created_by_user_id')
      .eq('company_id', membership.company_id)
      .eq('created_by_user_id', user.id);
    
    console.log(`1️⃣ Company + Created By filter: ${companyOrders?.length || 0} orders`);
    
    // Scenario 2: Add branch filter (from membership)
    const { data: branchOrders } = await supabase
      .from('sales_orders')
      .select('id, so_number, branch_id, cost_center_id, created_by_user_id')
      .eq('company_id', membership.company_id)
      .eq('created_by_user_id', user.id)
      .eq('branch_id', membership.branch_id);
    
    console.log(`2️⃣ + Branch filter (membership): ${branchOrders?.length || 0} orders`);
    
    // Scenario 3: Add branch filter (from user_branch_cost_center)
    if (userContext) {
      const { data: contextOrders } = await supabase
        .from('sales_orders')
        .select('id, so_number, branch_id, cost_center_id, created_by_user_id')
        .eq('company_id', membership.company_id)
        .eq('created_by_user_id', user.id)
        .eq('branch_id', userContext.branch_id);
      
      console.log(`3️⃣ + Branch filter (context): ${contextOrders?.length || 0} orders`);
    }
    
    // Scenario 4: Test the exact API query logic
    console.log('\n🔍 Testing Exact API Logic:');
    
    // Simulate the role-based filtering
    let apiQuery = supabase
      .from('sales_orders')
      .select('*')
      .eq('company_id', membership.company_id);
    
    // Apply role-based filtering (staff sees only their orders)
    if (membership.role === 'staff' || membership.role === 'sales' || membership.role === 'employee') {
      apiQuery = apiQuery.eq('created_by_user_id', user.id);
      console.log('   Applied created_by_user_id filter');
    }
    
    // Apply governance filtering (if user has governance context)
    if (userContext) {
      if (userContext.branch_id) {
        apiQuery = apiQuery.eq('branch_id', userContext.branch_id);
        console.log('   Applied branch_id filter');
      }
      if (userContext.cost_center_id) {
        apiQuery = apiQuery.eq('cost_center_id', userContext.cost_center_id);
        console.log('   Applied cost_center_id filter');
      }
    }
    
    const { data: apiResult, error: apiError } = await apiQuery;
    
    if (apiError) {
      console.log(`   ❌ API Query Error: ${apiError.message}`);
    } else {
      console.log(`   ✅ API Query Result: ${apiResult?.length || 0} orders`);
      if (apiResult && apiResult.length > 0) {
        apiResult.forEach(order => {
          console.log(`     SO-${order.so_number} | Status: ${order.status}`);
        });
      }
    }
    
    // 6. Check if there's a mismatch
    console.log('\n🎯 DIAGNOSIS:');
    
    if (!userContext) {
      console.log('❌ PROBLEM: User has no governance context in user_branch_cost_center table');
      console.log('💡 SOLUTION: Create governance context for user');
      
      // Create governance context
      const { error: insertError } = await supabase
        .from('user_branch_cost_center')
        .insert({
          user_id: user.id,
          company_id: membership.company_id,
          branch_id: membership.branch_id,
          cost_center_id: membership.cost_center_id,
          is_default: true
        });
      
      if (insertError) {
        console.log(`❌ Error creating governance context: ${insertError.message}`);
      } else {
        console.log('✅ Created governance context for user');
        
        // Test again
        const { data: finalTest } = await supabase
          .from('sales_orders')
          .select('id, so_number')
          .eq('company_id', membership.company_id)
          .eq('created_by_user_id', user.id)
          .eq('branch_id', membership.branch_id)
          .eq('cost_center_id', membership.cost_center_id);
        
        console.log(`🧪 Final Test: ${finalTest?.length || 0} orders visible`);
      }
    } else {
      console.log('✅ User has governance context');
      
      // Check for branch mismatch
      if (userContext.branch_id !== membership.branch_id) {
        console.log('❌ PROBLEM: Branch mismatch between membership and governance context');
        console.log(`   Membership branch: ${membership.branch_id}`);
        console.log(`   Governance branch: ${userContext.branch_id}`);
      } else {
        console.log('✅ Branch IDs match');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

debugSalesOrderVisibility();