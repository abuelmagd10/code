import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Looking for 'test/تست' company...");
  const { data: companies, error: compErr } = await supabase
    .from('companies')
    .select('id, name')
    .or('name.ilike.%test%,name.ilike.%تست%');

  if (compErr) {
    console.error('Error fetching companies:', compErr);
    return;
  }

  if (!companies || companies.length === 0) {
    console.log('No test company found');
    return;
  }

  const testCompanyId = companies[0].id;
  console.log('Test company found:', companies[0].name, 'ID:', testCompanyId);

  // 1. Delete Invoices first
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id')
    .eq('company_id', testCompanyId);

  if (invoices && invoices.length > 0) {
    const invIds = invoices.map(i => i.id);
    console.log(`Deleting ${invIds.length} invoices...`);
    const { error: invErr } = await supabase
      .from('invoices')
      .delete()
      .in('id', invIds);
    if (invErr) console.error('Error deleting invoices:', invErr);
    else console.log('✅ Invoices deleted successfully');
  } else {
    console.log('No invoices found to delete');
  }

  // 2. Delete Sales Orders
  const { data: orders } = await supabase
    .from('sales_orders')
    .select('id')
    .eq('company_id', testCompanyId);

  if (orders && orders.length > 0) {
    const orderIds = orders.map(o => o.id);
    console.log(`Deleting ${orderIds.length} sales orders...`);
    const { error: orderErr } = await supabase
      .from('sales_orders')
      .delete()
      .in('id', orderIds);
    if (orderErr) console.error('Error deleting sales orders:', orderErr);
    else console.log('✅ Sales orders deleted successfully');
  } else {
    console.log('No sales orders found to delete');
  }

  console.log('Finished cleanup process.');
}

run();
