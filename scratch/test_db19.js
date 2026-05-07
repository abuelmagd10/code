const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://hfvsbsizokxontflgdyn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4');

async function getDef() {
  const { data, error } = await s.rpc('execute_sql', { query: "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'get_user_notifications';" });
  console.log(error || data);
}
getDef();
