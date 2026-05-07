const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://hfvsbsizokxontflgdyn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4');

async function run() {
  const payload = {
    p_user_id: '24550790-de26-4904-b900-1b9413edc6df', 
    p_company_id: '8ef6338c-1713-4202-98ac-863633b76526', 
    p_branch_id: 'a882b22d-d464-4361-b106-84ccdc96a505',
    p_warehouse_id: '3939ee6a-848b-497d-a513-ff5333035630',
    p_status: null,
    p_severity: null,
    p_category: null,
    p_search_query: null,
    p_priority: null,
    p_reference_type: null
  };
  
  const res = await s.rpc('get_user_notifications', payload);
  console.log('Result with all params:', res.data?.length, res.error);

  const payload2 = {
    p_user_id: '24550790-de26-4904-b900-1b9413edc6df', 
    p_company_id: '8ef6338c-1713-4202-98ac-863633b76526',
    p_branch_id: null,
    p_warehouse_id: null
  };
  const res2 = await s.rpc('get_user_notifications', payload2);
  console.log('Result with null branch/warehouse:', res2.data?.length, res2.error);
}

run();
