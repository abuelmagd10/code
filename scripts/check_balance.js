const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envLocalStr = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const SUPABASE_URL = envLocalStr.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
const SUPABASE_KEY = envLocalStr.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data, error } = await supabase.rpc('get_ap_summary_new');
  if (error) {
    console.error('RPC Error:', error);
  } else {
    console.log('Supplier Balance:', JSON.stringify(data.filter(d => d.supplier_name === 'Foodcana'), null, 2));
  }
}

main().catch(console.error);
