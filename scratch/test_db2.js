const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://hfvsbsizokxontflgdyn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4');

const q1 = s.from('notifications')
  .select('*')
  .eq('company_id', '8ef6338c-1713-4202-98ac-863633b76526')
  .eq('id', '0754cf8c-dc07-4a06-9237-5bad63c75a28')
  // condition 1
  .or('assigned_to_user.eq.24550790-de26-4904-b900-1b9413edc6df,and(assigned_to_user.is.null,assigned_to_role.eq.accountant)');

q1.then(res => console.log('Cond1:', res.data));

