const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://hfvsbsizokxontflgdyn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4');

// Trying to fetch routine_definition
const fetchRoutine = async () => {
  // We can't query information_schema directly via postgREST easily unless there's a view.
  // Is there any way? Not really, unless we use postgres connection string.
  console.log('Cannot query information_schema from REST API natively without a view.');
};

fetchRoutine();
