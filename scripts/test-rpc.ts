import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const user_id = '0fadbf26-302f-44ca-91df-953efa310adf'
  const notif_id = '02e5469d-6895-4faa-b003-df01c7921059' // Unread notification I found in DB earlier

  console.log('Sending RPC...')
  const { data, error } = await supabase.rpc('batch_mark_notifications_as_read', {
    p_notification_ids: [notif_id],
    p_user_id: user_id
  })

  console.log('Data:', data)
  console.log('Error:', error)
}

test()
