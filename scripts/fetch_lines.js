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
    .select('id, debit_amount, credit_amount, description, account_id, journal_entry_id')
    .in('journal_entry_id', [
      "70f2c29e-7b15-4687-a354-450b0f3c0085",
      "1370b855-484f-4ac2-81af-cbf0d19accba",
      "9b2b222d-2393-4098-b005-bc09769b4dad",
      "362522f4-ba64-4ea9-82b0-5bc4b9f40667",
      "1197c085-b007-4446-8bf4-9907b3092e7f",
      "6ae3dae1-c594-46cc-a70f-19aa34d5bbb6"
    ]);
  
  if (error) {
    console.error('Error fetching lines:', error);
    return;
  }
  
  fs.writeFileSync(path.join(__dirname, '..', 'lines_output.json'), JSON.stringify(lines, null, 2), 'utf-8');
  console.log('Done writing lines');
}

main().catch(console.error);
