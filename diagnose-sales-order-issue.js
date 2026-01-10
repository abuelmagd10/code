const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function diagnoseSalesOrderIssue() {
  console.log('🔍 DIAGNOSING SALES ORDER VISIBILITY ISSUE');
  console.log('==========================================\n');
  
  try {
    // 1. Find the user
    console.log('1️⃣ Finding user foodcana1976...');
    const { data: users, error: userError } = await supabase.auth.admin.listUsers();
    
    if (userError) {
      console.log('❌ Error fetching users:', userError.message);
      return;
    }
    
    const user = users.users.find(u => u.email?.includes('foodcana1976') || u.user_metadata?.email?.includes('foodcana1976'));
    
    if (!user) {
      console.log('❌ User foodcana1976 not found');
      return;
    }
    
    console.log('✅ Found user:', user.id, user.email);
    
    // 2. Find user's company
    console.log('\n2️⃣ Finding user\'s company...');
    const { data: membership, error: memberError } = await supabase
      .from('company_members')
      .select('company_id, role, branch_id, cost_center_id')
      .eq('user_id', user.id)
      .single();
    
    if (memberError) {
      console.log('❌ Error finding company membership:', memberError.message);
      return;
    }
    
    console.log('✅ User company:', membership.company_id);
    console.log('✅ User role:', membership.role);
    console.log('✅ User branch:', membership.branch_id);
    console.log('✅ User cost center:', membership.cost_center_id);
    
    // 3. Check sales orders created by this user
    console.log('\n3️⃣ Checking sales orders created by user...');
    const { data: salesOrders, error: soError } = await supabase
      .from('sales_orders')
      .select('*')
      .eq('company_id', membership.company_id)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (soError) {
      console.log('❌ Error fetching sales orders:', soError.message);
      return;
    }
    
    console.log(`✅ Found ${salesOrders?.length || 0} sales orders in company`);
    
    if (salesOrders && salesOrders.length > 0) {
      console.log('\n📋 Recent Sales Orders:');
      salesOrders.forEach((so, index) => {
        console.log(`${index + 1}. SO-${so.so_number} | Status: ${so.status} | Created: ${so.created_at}`);
        console.log(`   Customer: ${so.customer_id} | Total: ${so.total_amount}`);
        console.log(`   Branch: ${so.branch_id} | Cost Center: ${so.cost_center_id} | Warehouse: ${so.warehouse_id}`);
        console.log(`   Created by: ${so.created_by_user_id}`);
        console.log('');
      });
      
      // Check if any were created by this user
      const userOrders = salesOrders.filter(so => so.created_by_user_id === user.id);
      console.log(`🎯 Orders created by this user: ${userOrders.length}`);
      
      if (userOrders.length > 0) {
        console.log('\n✅ User HAS created sales orders. Issue might be in the API filtering.');
        
        // Check governance fields
        const missingGovernance = userOrders.filter(so => 
          !so.branch_id || !so.cost_center_id || !so.warehouse_id
        );
        
        if (missingGovernance.length > 0) {
          console.log(`⚠️  ${missingGovernance.length} orders missing governance fields`);
          
          // Fix missing governance fields
          console.log('\n🔧 Fixing missing governance fields...');
          
          for (const order of missingGovernance) {
            const updateData = {};
            
            if (!order.branch_id && membership.branch_id) {
              updateData.branch_id = membership.branch_id;
            }
            if (!order.cost_center_id && membership.cost_center_id) {
              updateData.cost_center_id = membership.cost_center_id;
            }
            if (!order.warehouse_id) {
              // Get main warehouse for the branch
              const { data: warehouse } = await supabase
                .from('warehouses')
                .select('id')
                .eq('company_id', membership.company_id)
                .eq('branch_id', membership.branch_id || order.branch_id)
                .eq('is_main', true)
                .single();
              
              if (warehouse) {
                updateData.warehouse_id = warehouse.id;
              }
            }
            
            if (Object.keys(updateData).length > 0) {
              const { error: updateError } = await supabase
                .from('sales_orders')
                .update(updateData)
                .eq('id', order.id);
              
              if (updateError) {
                console.log(`❌ Error updating order ${order.so_number}:`, updateError.message);
              } else {
                console.log(`✅ Updated order ${order.so_number} with governance fields`);
              }
            }
          }
        }
      } else {
        console.log('\n❌ No orders found created by this user');
      }
    }
    
    // 4. Check if sales_orders API exists and test it
    console.log('\n4️⃣ Testing sales orders API access...');
    
    // Simulate API call with user context
    let query = supabase
      .from('sales_orders')
      .select('*')
      .eq('company_id', membership.company_id);
    
    // Apply role-based filtering
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
    
    const { data: filteredOrders, error: filterError } = await query;
    
    if (filterError) {
      console.log('❌ Error with filtered query:', filterError.message);
    } else {
      console.log(`✅ Filtered query returns ${filteredOrders?.length || 0} orders`);
      
      if (filteredOrders && filteredOrders.length > 0) {
        console.log('\n📋 Orders visible to user:');
        filteredOrders.forEach((so, index) => {
          console.log(`${index + 1}. SO-${so.so_number} | Status: ${so.status} | Total: ${so.total_amount}`);
        });
      }
    }
    
    // 5. Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('===================');
    
    if (!membership.branch_id) {
      console.log('⚠️  User has no branch assigned - assign a branch');
    }
    if (!membership.cost_center_id) {
      console.log('⚠️  User has no cost center assigned - assign a cost center');
    }
    
    console.log('✅ Check sales orders API route for proper governance implementation');
    console.log('✅ Ensure frontend uses the same filtering logic as backend');
    console.log('✅ Verify user permissions and role-based access');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

diagnoseSalesOrderIssue();