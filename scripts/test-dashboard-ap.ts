import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function test() {
  console.log("Testing fallbackQuery with is_deleted=false...");
  let fallbackQuery = supabase
    .from('journal_entry_lines')
    .select(`
      debit_amount, 
      credit_amount, 
      chart_of_accounts!inner(sub_type), 
      journal_entries!inner(company_id, status, is_deleted)
    `)
    .eq('journal_entries.company_id', '8ef6338c-1713-4202-98ac-863633b76526')
    .eq('journal_entries.status', 'posted')
    .eq('journal_entries.is_deleted', false)
    .in('chart_of_accounts.sub_type', ['accounts_receivable', 'accounts_payable']);
    
  const { data, error } = await fallbackQuery;
  console.log('Error:', error);
  console.log('Data count:', data?.length);
  
  let payables = 0;
  for (const line of data || []) {
      const subType = Array.isArray(line.chart_of_accounts) ? line.chart_of_accounts[0]?.sub_type : line.chart_of_accounts?.sub_type;
      if (subType === 'accounts_payable') {
         payables += (Number(line.credit_amount||0) - Number(line.debit_amount||0));
      }
  }
  console.log('Total Payables (calculated):', payables);
}
test();
