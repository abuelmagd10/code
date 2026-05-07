const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const s = createClient('https://hfvsbsizokxontflgdyn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4');

async function testFilter() {
  const accountantId = '24550790-de26-4904-b900-1b9413edc6df';
  const companyId = '8ef6338c-1713-4202-98ac-863633b76526';
  const branchId = 'a882b22d-d464-4361-b106-84ccdc96a505';

  const refId = crypto.randomUUID();
  const testId = crypto.randomUUID();

  console.log('Inserting test notification:', testId);
  await s.from('notifications').insert({
    id: testId,
    company_id: companyId,
    branch_id: branchId,
    reference_type: 'test',
    reference_id: refId,
    assigned_to_role: 'accountant',
    title: 'Test',
    message: 'Test message',
    event_key: 'test_' + testId
  });

  const res = await s.rpc('get_user_notifications', {
    p_user_id: accountantId,
    p_company_id: companyId,
    p_branch_id: branchId
  });

  console.log('Found?', res.data?.some(x => x.id === testId));

  await s.from('notifications').delete().eq('id', testId);
}
testFilter();
