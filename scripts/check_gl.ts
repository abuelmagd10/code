import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  const companyId = '8ef6338c-1713-4202-98ac-863633b76526' // or fetch the user's company

  const { data: coa } = await supabase.from('chart_of_accounts').select('id, account_name, sub_type').eq("sub_type", "accounts_payable")
  const apIds = coa?.map(c => c.id) || []

  if(apIds.length > 0) {
    const { data: lines } = await supabase
      .from('journal_entry_lines')
      .select('id, debit_amount, credit_amount, journal_entry_id, description, journal_entries(status, entry_date, description, reference_type, reference_id)')
      .in('account_id', apIds)
      
    console.log("ALL AP GL Lines:")
    console.log(JSON.stringify(lines, null, 2))
  }
}

run()
