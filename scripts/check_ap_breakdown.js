const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envLocalStr = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const SUPABASE_URL = envLocalStr.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const SUPABASE_KEY = envLocalStr.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data: lines, error } = await supabase
    .from('journal_entry_lines')
    .select(`
      id, debit_amount, credit_amount,
      journal_entry:journal_entries(description, reference_id, reference_type, status)
    `)
    .eq('account_id', 'a928ba96-a3cf-4fd0-9e2a-89a59797d589');
  
  if (error) {
    console.error('Error fetching lines:', error);
    return;
  }
  
  let totalAP = 0;
  const breakdown = {};
  
  for (const line of lines) {
    if (line.journal_entry?.status === 'posted') {
      const amt = (line.credit_amount || 0) - (line.debit_amount || 0);
      totalAP += amt;
      const ref = line.journal_entry.description; // use description for readability
      breakdown[ref] = (breakdown[ref] || 0) + amt;
    }
  }
  
  const result = { totalAP, breakdown };
  fs.writeFileSync(path.join(__dirname, '..', 'ap_breakdown_clean.json'), JSON.stringify(result, null, 2), 'utf-8');
}

main().catch(console.error);
