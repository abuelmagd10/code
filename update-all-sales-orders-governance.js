const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateAllSalesOrdersGovernance() {
  console.log('🔧 UPDATING ALL SALES ORDERS FOR GOVERNANCE COMPLIANCE');
  console.log('=====================================================\n');
  
  try {
    // 1. Get all sales orders that need governance updates
    console.log('1️⃣ Finding sales orders that need governance updates...');
    
    const { data: salesOrders, error: fetchError } = await supabase
      .from('sales_orders')
      .select('id, so_number, company_id, branch_id, cost_center_id, warehouse_id, created_by_user_id')
      .order('created_at', { ascending: false });
    
    if (fetchError) {
      console.log('❌ Error fetching sales orders:', fetchError.message);
      return;
    }
    
    console.log(`✅ Found ${salesOrders?.length || 0} sales orders to check\n`);
    
    if (!salesOrders || salesOrders.length === 0) {
      console.log('✅ No sales orders found');
      return;
    }
    
    let updatedCount = 0;
    
    // 2. Process each sales order
    for (const order of salesOrders) {
      console.log(`🔍 Checking SO-${order.so_number}...`);
      
      // Check if governance fields are missing
      const needsUpdate = !order.branch_id || !order.cost_center_id || !order.warehouse_id || !order.created_by_user_id;
      
      if (needsUpdate) {
        console.log('   ⚠️  Missing governance fields - fixing...');
        
        const updateData = {};
        
        // If created_by_user_id is missing, try to find the company owner
        if (!order.created_by_user_id) {
          const { data: owner } = await supabase
            .from('company_members')
            .select('user_id')
            .eq('company_id', order.company_id)
            .eq('role', 'owner')
            .single();
          
          if (owner) {
            updateData.created_by_user_id = owner.user_id;
            console.log('   ✅ Set created_by_user_id to company owner');
          }
        }
        
        // If branch_id is missing, get the main branch
        if (!order.branch_id) {
          const { data: branch } = await supabase
            .from('branches')
            .select('id')
            .eq('company_id', order.company_id)
            .eq('is_main', true)
            .single();
          
          if (branch) {
            updateData.branch_id = branch.id;
            console.log('   ✅ Set branch_id to main branch');
          }
        }
        
        // If cost_center_id is missing, get one from the branch
        if (!order.cost_center_id && (updateData.branch_id || order.branch_id)) {
          const branchId = updateData.branch_id || order.branch_id;
          const { data: costCenter } = await supabase
            .from('cost_centers')
            .select('id')
            .eq('company_id', order.company_id)
            .eq('branch_id', branchId)
            .single();
          
          if (costCenter) {
            updateData.cost_center_id = costCenter.id;
            console.log('   ✅ Set cost_center_id');
          }
        }
        
        // If warehouse_id is missing, get the main warehouse for the branch
        if (!order.warehouse_id && (updateData.branch_id || order.branch_id)) {
          const branchId = updateData.branch_id || order.branch_id;
          const { data: warehouse } = await supabase
            .from('warehouses')
            .select('id')
            .eq('company_id', order.company_id)
            .eq('branch_id', branchId)
            .eq('is_main', true)
            .single();
          
          if (warehouse) {
            updateData.warehouse_id = warehouse.id;
            console.log('   ✅ Set warehouse_id to main warehouse');
          }
        }
        
        // Apply the updates
        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabase
            .from('sales_orders')
            .update(updateData)
            .eq('id', order.id);
          
          if (updateError) {
            console.log(`   ❌ Error updating SO-${order.so_number}:`, updateError.message);
          } else {
            console.log(`   ✅ Updated SO-${order.so_number} with governance fields`);
            updatedCount++;
          }
        }
      } else {
        console.log('   ✅ Already has all governance fields');
      }
      
      console.log('');
    }
    
    console.log(`🎯 SUMMARY:`);
    console.log(`   Total sales orders checked: ${salesOrders.length}`);
    console.log(`   Sales orders updated: ${updatedCount}`);
    console.log(`   Sales orders already compliant: ${salesOrders.length - updatedCount}`);
    
    console.log('\n✅ ALL SALES ORDERS GOVERNANCE UPDATE COMPLETED!');
    console.log('Future sales orders will automatically have proper governance through the updated API.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

updateAllSalesOrdersGovernance();