const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const s = createClient('https://hfvsbsizokxontflgdyn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4');

async function testFilter() {
  const storeManagerId = '07e580c5-587f-4e78-b417-3db63baa69e8';
  const accountantId = '24550790-de26-4904-b900-1b9413edc6df';
  const companyId = '8ef6338c-1713-4202-98ac-863633b76526';
  
  const { data: orig } = await s.from('notifications').select('*').eq('id', '9a4fb3fe-671e-4202-a072-da036d6e1b68').single();
  
  async function testField(fieldName, val, expected, userId = storeManagerId) {
    const testId = crypto.randomUUID();
    const copy = { ...orig };
    copy.id = testId;
    copy.event_key = 'test_' + fieldName + '_' + testId;
    copy[fieldName] = val;
    
    // if testing accountant, we also need to change assigned_to_role
    if (userId === accountantId) {
       copy.assigned_to_role = 'accountant';
    }

    await s.from('notifications').insert(copy);
    const res = await s.rpc('get_user_notifications', { p_user_id: userId, p_company_id: companyId, p_branch_id: null });
    const found = res.data?.some(x => x.id === testId);
    console.log(`Testing ${fieldName}=${val} for user ${userId === storeManagerId ? 'SM' : 'ACC'} => Found: ${found}`);
    await s.from('notifications').delete().eq('id', testId);
  }

  await testField('branch_id', null, false); // Is branch_id required?
  await testField('warehouse_id', null, false); // Is warehouse_id required?
  await testField('assigned_to_role', 'accountant', false, accountantId); // Does accountant work?
  
}
testFilter();
