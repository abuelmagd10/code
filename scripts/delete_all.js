const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { resolve } = require('path');

dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log("Searching for test companies...");
  const { data: companies } = await supabase.from('companies').select('id, name').ilike('name', '%تست%');
  if (!companies || companies.length === 0) return;
  
  const companyId = companies[0].id;
  console.log("Cleaning up company:", companyId);

  // 1. Delete all invoices
  const { data: invoices } = await supabase.from('invoices').select('id').eq('company_id', companyId);
  const invIds = invoices?.map(i => i.id) || [];
  
  if (invIds.length > 0) {
     // delete customer transactions for invoices
     await supabase.from('customer_transactions').delete().in('reference_id', invIds);
     // delete payments for invoices
     await supabase.from('payments').delete().in('invoice_id', invIds);
     // delete journal entries (lines cascade usually, but just in case)
     await supabase.from('journal_entries').delete().in('reference_id', invIds);
     // delete invoice items
     await supabase.from('invoice_items').delete().in('invoice_id', invIds);
     
     const { error: invErr } = await supabase.from('invoices').delete().in('id', invIds);
     if(invErr) console.log("Inv Err", invErr);
  }

  // 2. Delete all sales orders
  const { data: orders } = await supabase.from('sales_orders').select('id').eq('company_id', companyId);
  const orderIds = orders?.map(o => o.id) || [];
  
  if (orderIds.length > 0) {
    await supabase.from('sales_order_items').delete().in('sales_order_id', orderIds);
    await supabase.from('inventory_allocations').delete().in('sales_order_id', orderIds);
    await supabase.from('inventory_transactions').delete().in('document_id', orderIds);
    const { error: soErr } = await supabase.from('sales_orders').delete().in('id', orderIds);
    if(soErr) console.log("SO Err", soErr);
  }

  // 3. Delete third party inventory
  await supabase.from('third_party_inventory').delete().eq('company_id', companyId);

  console.log("Cleanup complete.");
}
main().catch(console.log);
