const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://hfvsbsizokxontflgdyn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4');

const p_company_id = '8ef6338c-1713-4202-98ac-863633b76526';
const p_user_id = '24550790-de26-4904-b900-1b9413edc6df'; // accountant
const p_branch_id = 'a882b22d-d464-4361-b106-84ccdc96a505';

// What happens if we do a LEFT JOIN with branches manually using Supabase syntax?
// Wait, Supabase js doesn't do raw sql joins easily. Let me use Postgres `select` with joined tables.
s.from('notifications')
  .select(`
    id, 
    assigned_to_role, 
    branch_id,
    branches ( id, name ),
    warehouses ( id, name )
  `)
  .eq('company_id', p_company_id)
  .eq('id', '0754cf8c-dc07-4a06-9237-5bad63c75a28')
  .then(res => console.log('Joined:', JSON.stringify(res.data, null, 2)))
  .catch(console.error);
