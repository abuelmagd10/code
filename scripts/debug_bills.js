const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envLocalStr = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const SUPABASE_URL = envLocalStr.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const SUPABASE_KEY = envLocalStr.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data: jes, error } = await supabase
    .from('journal_entries')
    .select(`
      id, description, status, entry_date, reference_type, reference_id, created_at, reversal_of_entry_id,
      lines:journal_entry_lines(id, debit_amount, credit_amount, description, account_id)
    `)
    .or('description.ilike.%BILL-0001%,description.ilike.%BILL-0002%')
    .order('created_at', { ascending: true });
    
  if (error) {
    console.error(error);
    return;
  }
  
  fs.writeFileSync(path.join(__dirname, '..', 'bills_gl.json'), JSON.stringify(jes, null, 2));
  console.log('Saved to bills_gl.json');
}

main().catch(console.error);
