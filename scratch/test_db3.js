const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://hfvsbsizokxontflgdyn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4');

// We can bypass get_user_notifications and see exactly which clause fails
const testQuery = async () => {
  const p_company_id = '8ef6338c-1713-4202-98ac-863633b76526';
  const p_user_id = '24550790-de26-4904-b900-1b9413edc6df'; // accountant
  const p_branch_id = 'a882b22d-d464-4361-b106-84ccdc96a505';
  
  // Test 1: Just basic properties
  let { data: d1 } = await s.from('notifications')
    .select('id, assigned_to_user, assigned_to_role, branch_id, expires_at')
    .eq('company_id', p_company_id)
    .eq('assigned_to_role', 'accountant');
    
  console.log("Accountant notifications in DB:", d1.length);
  console.log(d1);
};

testQuery();
