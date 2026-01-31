// Check for triggers on expenses table that might send duplicate notifications
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkExpenseTriggers() {
  console.log('🔍 Checking triggers on expenses table...\n')
  
  // Query to get all triggers on expenses table
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_query: `
      SELECT 
        trigger_name,
        event_manipulation,
        action_timing,
        action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'expenses'
      ORDER BY trigger_name;
    `
  })
  
  if (error) {
    console.error('❌ Error:', error)
    return
  }
  
  console.log('📋 Triggers found:')
  console.log(JSON.stringify(data, null, 2))
  
  // Check for notification-related triggers
  console.log('\n🔔 Checking for notification triggers...')
  const notificationTriggers = data?.filter(t => 
    t.action_statement?.toLowerCase().includes('notification') ||
    t.action_statement?.toLowerCase().includes('notify')
  )
  
  if (notificationTriggers && notificationTriggers.length > 0) {
    console.log('⚠️ Found notification triggers:')
    console.log(JSON.stringify(notificationTriggers, null, 2))
  } else {
    console.log('✅ No automatic notification triggers found')
  }
}

checkExpenseTriggers()

