const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const { resolve } = require('path');

dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing DB credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log("Checking for 'تست' company...");
  const { data: companies, error } = await supabase.from('companies').select('id, name').ilike('name', '%تست%');
  if (error) return console.error(error);
  if (!companies || companies.length === 0) return console.log("No test companies found.");
  
  const companyId = companies[0].id;
  console.log("Found company:", companies[0].name, companyId);
  
  const { count: invs } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('company_id', companyId);
  const { count: orders } = await supabase.from('sales_orders').select('*', { count: 'exact', head: true }).eq('company_id', companyId);
  const { count: tpi } = await supabase.from('third_party_inventory').select('*', { count: 'exact', head: true }).eq('company_id', companyId);
  
  console.log({ Invoices: invs, SalesOrders: orders, ThirdPartyInventory: tpi });
}
main();
