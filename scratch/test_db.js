const { createClient } = require('@supabase/supabase-js');

// These should match the .env.local output
const supabaseUrl = 'https://hfvsbsizokxontflgdyn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmdnNic2l6b2t4b250ZmxnZHluIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUwMDEyMSwiZXhwIjoyMDc4MDc2MTIxfQ.2pITPH3Xeo68u24BSyQawqVIUNSIHvhlWBMls4meTA4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNotifications() {
  console.log("Fetching latest mmia_shortage notifications...");
  const { data, error } = await supabase
    .from('notifications')
    .select('id, title, message, assigned_to_role, branch_id, event_key, created_at')
    .like('event_key', 'mmia_shortage_%')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error fetching:", error);
    return;
  }

  console.log("Latest notifications:");
  console.log(JSON.stringify(data, null, 2));
}

checkNotifications();
