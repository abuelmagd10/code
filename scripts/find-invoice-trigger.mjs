import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  console.log('🔍 Finding triggers on invoices table via get_trigger_definition RPC...')
  
  // Try to find the trigger that's blocking invoice status updates
  // The error says: DIRECT_POST_BLOCKED: Use create_journal_entry_atomic(). [caller=postgres, flag=null]
  
  // Try querying triggers via rpc
  const { data: d1, error: e1 } = await supabase.rpc('get_invoices_trigger_info')
  console.log('get_invoices_trigger_info:', e1 ? e1.message : JSON.stringify(d1))
  
  // Check if there's a function to list triggers 
  const { data: d2, error: e2 } = await supabase.rpc('get_all_triggers')
  console.log('get_all_triggers:', e2 ? e2.message : JSON.stringify(d2))
  
  // Try getting trigger names
  const headers = {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
  
  // Try using the pg meta API
  const pgMetaRes = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/pg/triggers`,
    { headers }
  )
  console.log('pg/triggers status:', pgMetaRes.status)
  if (pgMetaRes.ok) {
    const data = await pgMetaRes.json()
    const invoiceTriggers = data.filter(t => t.table === 'invoices')
    console.log('Invoice triggers:', JSON.stringify(invoiceTriggers, null, 2))
  }
}

main().catch(console.error)
