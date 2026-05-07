const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const s = createClient('https://hfvsbsizokxontflgdyn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4');

async function testFilter() {
  const accountantId = '24550790-de26-4904-b900-1b9413edc6df';
  const storeManagerId = '07e580c5-587f-4e78-b417-3db63baa69e8';
  const companyId = '8ef6338c-1713-4202-98ac-863633b76526';
  const branchId = 'a882b22d-d464-4361-b106-84ccdc96a505';

  const testId1 = crypto.randomUUID();
  const testId2 = crypto.randomUUID();

  await s.from('notifications').insert([
    {
      id: testId1,
      company_id: companyId,
      branch_id: branchId,
      reference_type: 'test',
      reference_id: crypto.randomUUID(),
      assigned_to_user: accountantId,
      title: 'Test Accountant',
      event_key: 'test_a_' + testId1
    },
    {
      id: testId2,
      company_id: companyId,
      branch_id: branchId,
      reference_type: 'test',
      reference_id: crypto.randomUUID(),
      assigned_to_user: storeManagerId,
      title: 'Test SM',
      event_key: 'test_sm_' + testId2
    }
  ]);

  const res1 = await s.rpc('get_user_notifications', {
    p_user_id: accountantId,
    p_company_id: companyId,
    p_branch_id: branchId
  });

  const res2 = await s.rpc('get_user_notifications', {
    p_user_id: storeManagerId,
    p_company_id: companyId,
    p_branch_id: branchId
  });

  console.log('Accountant Found:', res1.data?.some(x => x.id === testId1));
  console.log('SM Found:', res2.data?.some(x => x.id === testId2));

  await s.from('notifications').delete().in('id', [testId1, testId2]);
}
testFilter();
