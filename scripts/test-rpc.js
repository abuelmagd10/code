const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')

// Load .env.local explicitly
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.log('Missing env vars! Will stop here.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  // Use known valid IDs
  const user_id = '0fadbf26-302f-44ca-91df-953efa310adf'
  const notif_id = '06f807fb-c3a1-40bd-a315-a836398e1050'

  console.log('Testing batch_update_notification_status...')
  const { data, error } = await supabase.rpc('batch_update_notification_status', {
    p_notification_ids: [notif_id],
    p_status: 'archived',
    p_user_id: user_id
  })

  console.log('Data:', data)
  console.log('Error:', error)
}

test()
