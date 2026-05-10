const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function cleanUp() {
  const orderId = 'b256c1bd-adcc-49ef-8644-d7a727799c92';
  const companyId = '8ef6338c-1713-4202-98ac-863633b76526';

  console.log(`Starting cleanup for order: ${orderId}`);

  // 1. Delete the approvals
  const { data: deletedApprovals, error: delErr } = await supabase
    .from('manufacturing_product_receive_approvals')
    .delete()
    .eq('production_order_id', orderId)
    .eq('company_id', companyId)
    .select('id');

  if (delErr) {
    console.error('Error deleting approvals:', delErr);
    return;
  }
  console.log(`Deleted ${deletedApprovals.length} approvals.`);

  // 2. Reset the order status
  const { data: updatedOrder, error: updErr } = await supabase
    .from('manufacturing_production_orders')
    .update({ product_receive_approval_status: null })
    .eq('id', orderId)
    .eq('company_id', companyId)
    .select('id, product_receive_approval_status');

  if (updErr) {
    console.error('Error updating order:', updErr);
    return;
  }
  console.log('Order updated:', updatedOrder);

  console.log('Cleanup complete.');
}

cleanUp();
