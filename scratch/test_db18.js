const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const s = createClient('https://hfvsbsizokxontflgdyn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4');

async function testFilter() {
  const storeManagerId = '07e580c5-587f-4e78-b417-3db63baa69e8';
  const companyId = '8ef6338c-1713-4202-98ac-863633b76526';
  
  const { data: orig } = await s.from('notifications').select('*').eq('id', '9a4fb3fe-671e-4202-a072-da036d6e1b68').single();
  
  const testId = crypto.randomUUID();
  const copy = { ...orig };
  copy.id = testId;
  copy.event_key = 'test_copy_cb_' + testId;
  copy.created_by = null; // Modify created_by!

  await s.from('notifications').insert(copy);

  const res = await s.rpc('get_user_notifications', {
    p_user_id: storeManagerId,
    p_company_id: companyId,
    p_branch_id: null
  });

  console.log('Copy with created_by=null Found?:', res.data?.some(x => x.id === testId));

  await s.from('notifications').delete().eq('id', testId);
}
testFilter();
