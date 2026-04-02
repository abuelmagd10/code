const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envLocalStr = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const SUPABASE_URL = envLocalStr.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const SUPABASE_KEY = envLocalStr.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data, error } = await supabase
    .from('journal_entries')
    .select(`
      id, description, status, entry_date, reference_type, reference_id,
      reversal_of_entry_id,
      lines:journal_entry_lines(debit_amount, credit_amount, description, account_id)
    `)
    .in('id', [
      'ad788ec2-fd06-447b-9459-e2b3024d5187', // The payment reversal the user tried to restore
      '1e7ceeb6-06bb-49e0-adcd-eebb6409893d'  // Let's also fetch what it's a reversal OF
    ]);
    
  if (error) {
    console.error(error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);
