const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envLocalStr = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const SUPABASE_URL = envLocalStr.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const SUPABASE_KEY = envLocalStr.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data: bills, error: e1 } = await supabase
    .from('purchase_bills')
    .select('id, number, total_amount, paid_amount, status')
    .in('number', ['BILL-0001', 'BILL-0002']);

  console.log('Bills in table:', bills);

  // find all entries referencing these bills
  const billIds = bills.map(b => b.id);
  const { data: jes } = await supabase
    .from('journal_entries')
    .select('id, description, status, entry_date, reference_type, reference_id, is_closing_entry')
    .or(`reference_id.in.(${billIds.join(',')}),description.ilike.%BILL-0001%,description.ilike.%BILL-0002%`)
    .eq('status', 'posted');

  const jeIds = jes.map(j => j.id);

  const { data: lines } = await supabase
    .from('journal_entry_lines')
    .select(`
      id, debit_amount, credit_amount, description, account_id,
      account:accounts(id, name, type)
    `)
    .in('journal_entry_id', jeIds);

  // group lines by account
  const byAccount = {};
  for (const l of lines) {
    const accName = l.account ? l.account.name : l.account_id;
    if (!byAccount[accName]) byAccount[accName] = { debits: 0, credits: 0, balance: 0 };
    byAccount[accName].debits += (l.debit_amount || 0);
    byAccount[accName].credits += (l.credit_amount || 0);
    
    // For Liability (AP), credit increases, debit decreases
    // For Asset (Advance), debit increases, credit decreases
    if (l.account?.type === 'liability') {
      byAccount[accName].balance += (l.credit_amount || 0) - (l.debit_amount || 0);
    } else {
      byAccount[accName].balance += (l.debit_amount || 0) - (l.credit_amount || 0);
    }
  }

  console.log('--- GL Balances for BILL-0001 and BILL-0002 ---');
  console.log(byAccount);
}

main().catch(console.error);
