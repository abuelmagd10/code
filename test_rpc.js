const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testRPC() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing credentials');
    return;
  }
  
  const admin = createClient(url, key, { auth: { persistSession: false } });
  
  // Get a random company ID to test
  const { data: company } = await admin.from('companies').select('id').limit(1).single();
  if (!company) {
    console.error('No company found');
    return;
  }
  
  console.log('Testing with company:', company.id);
  const { data, error } = await admin.rpc('get_seat_status', { p_company_id: company.id });
  
  console.log('RPC Error:', error);
  console.log('RPC Data:', data);
}

testRPC();
