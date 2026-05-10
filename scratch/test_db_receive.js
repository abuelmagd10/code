const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data: company, error: companyErr } = await supabase
    .from('companies')
    .select('id, name')
    .ilike('name', '%تست%')
    .single();

  if (companyErr) {
    console.error('Company fetch error:', companyErr);
    return;
  }
  console.log('Company:', company);

  const { data: branch, error: branchErr } = await supabase
    .from('branches')
    .select('id, name')
    .eq('company_id', company.id)
    .ilike('name', '%الرئيسي%')
    .single();

  if (branchErr) {
    console.error('Branch fetch error:', branchErr);
    return;
  }
  console.log('Branch:', branch);

  const { data: approvals, error: approvalsErr } = await supabase
    .from('manufacturing_product_receive_approvals')
    .select('id, production_order_id, status, created_at')
    .eq('company_id', company.id)
    .eq('branch_id', branch.id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (approvalsErr) {
    console.error('Approvals fetch error:', approvalsErr);
    return;
  }
  console.log('Recent Approvals:', approvals);

  if (approvals.length > 0) {
      const orderId = approvals[0].production_order_id;
      const { data: order, error: orderErr } = await supabase
        .from('manufacturing_production_orders')
        .select('*')
        .eq('id', orderId)
        .single();
      if (orderErr) console.error('Order Err:', orderErr);
      console.log('Related Order:', order);

      const { data: transactions, error: txErr } = await supabase
        .from('inventory_transactions')
        .select('*')
        .eq('reference_id', orderId)
        .eq('company_id', company.id);
      if (txErr) console.error('Tx Err:', txErr);
      console.log('Inventory Transactions:', transactions);

      const { data: receiptLines, error: rErr } = await supabase
        .from('production_order_receipt_lines')
        .select('*')
        .eq('production_order_id', orderId);
      if (rErr) console.error('Receipt Err:', rErr);
      console.log('Receipt Lines:', receiptLines);
  }
}

main();
