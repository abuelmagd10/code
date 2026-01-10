const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testSalesOrderAPI() {
  console.log('🧪 TESTING SALES ORDER API');
  console.log('==========================\n');
  
  try {
    // Test direct API call simulation
    const userId = '949d65e0-2e8f-4566-b820-4778ed149304'; // foodcana1976
    const companyId = 'f0ffc062-1e6e-4324-8be4-f5052e881a67';
    
    console.log('📡 Simulating API call...');
    
    // Get user governance context
    const { data: governance, error: govError } = await supabase
      .from('user_branch_cost_center')
      .select('branch_id, cost_center_id')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .single();
    
    if (govError) {
      console.log('❌ Governance error:', govError.message);
      return;
    }
    
    console.log('✅ Governance context found');
    
    // Get user role
    const { data: member } = await supabase
      .from('company_members')
      .select('role')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .single();
    
    console.log(`👤 User role: ${member?.role}`);
    
    // Build the query like the API does
    let query = supabase
      .from('sales_orders')
      .select(`
        *,
        customers:customer_id (id, name, phone, city)
      `)
      .eq('company_id', companyId);
    
    // Apply role-based filter
    if (member?.role === 'staff' || member?.role === 'sales' || member?.role === 'employee') {
      query = query.eq('created_by_user_id', userId);
    }
    
    // Apply governance filters
    query = query
      .eq('branch_id', governance.branch_id)
      .eq('cost_center_id', governance.cost_center_id);
    
    query = query.order('created_at', { ascending: false });
    
    const { data: orders, error: ordersError } = await query;
    
    if (ordersError) {
      console.log('❌ Orders query error:', ordersError.message);
      return;
    }
    
    console.log(`📋 API would return: ${orders?.length || 0} orders`);
    
    if (orders && orders.length > 0) {
      orders.forEach(order => {
        console.log(`   📄 SO-${order.so_number}:`);
        console.log(`      Status: ${order.status}`);
        console.log(`      Customer: ${order.customers?.name || 'N/A'}`);
        console.log(`      Total: ${order.total_amount || 0}`);
      });
    }
    
    // Test the actual API response format
    const apiResponse = {
      success: true,
      data: orders || [],
      meta: {
        total: (orders || []).length,
        role: member?.role,
        governance: {
          branchId: governance.branch_id,
          costCenterId: governance.cost_center_id
        }
      }
    };
    
    console.log('\n📡 API Response:');
    console.log(JSON.stringify(apiResponse, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testSalesOrderAPI();