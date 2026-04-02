const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envLocalStr = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const SUPABASE_URL = envLocalStr.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const SUPABASE_KEY = envLocalStr.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data: jes, error: err2 } = await supabase
    .from('journal_entries')
    .select('id, description, status, entry_date, reference_type, reference_id, created_at, reversal_of_entry_id')
    .or('description.ilike.%BILL-0001%,description.ilike.%BILL-0002%');
  
  if (err2) {
    console.error('Error fetching jes:', err2);
    return;
  }
  
  const allJes = [];
  if (jes && jes.length > 0) {
    const jeIds = jes.map(j => j.id);
    const { data: rev_jes, error: err3 } = await supabase
      .from('journal_entries')
      .select('id, description, status, entry_date, reference_type, reference_id, created_at, reversal_of_entry_id')
      .in('reversal_of_entry_id', jeIds);
      
    allJes.push({ jes, rev_jes });
  }

  // Write explicit UTF-8 file
  fs.writeFileSync(path.join(__dirname, '..', 'jes_output_clean.json'), JSON.stringify(allJes, null, 2), 'utf-8');
  console.log('Done writing to jes_output_clean.json');
}

main().catch(console.error);
