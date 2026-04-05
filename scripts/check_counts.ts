import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '', { auth: { autoRefreshToken: false, persistSession: false } });

async function check() {
  const { data: companies } = await supabase.from('companies').select('id').ilike('name', '%تست%');
  if(!companies || companies.length === 0) return;
  const companyId = companies[0].id;
  
  const { count: invoices } = await supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('company_id', companyId);
  const { count: orders } = await supabase.from('sales_orders').select('*', { count: 'exact', head: true }).eq('company_id', companyId);
  const { count: tpi } = await supabase.from('third_party_inventory').select('*', { count: 'exact', head: true }).eq('company_id', companyId);
  
  console.log({ invoices, orders, tpi });
}
check().catch(console.error);
