const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envLocalStr = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const SUPABASE_URL = envLocalStr.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const SUPABASE_KEY = envLocalStr.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const idsToReverse = [
    '710199f5-6983-4850-8614-b5fcdd72be79', // Reversal of BILL-0001 Invoice 2
    'a435445b-a7c0-4bca-83b7-1d68754cb111', // Reversal of BILL-0001 Return
    '4a4f40ef-e365-471c-993d-8a56a2586775', // Reversal of BILL-0002 Invoice 2
  ];

  for (const id of idsToReverse) {
    console.log(`Restoring transaction by reversing reversal: ${id}`);
    const { data, error } = await supabase.rpc('create_reversal_entry', {
      p_original_entry_id: id
    });
    
    if (error) {
      console.error(`Error processing ${id}:`, error);
    } else {
      console.log(`Success! New Reversal Entry ID: ${data}`);
    }
  }
}

main().catch(console.error);
