const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim()
      process.env[key] = value.replace(/^["']|["']$/g, '')
    }
  })
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function main() {
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*')
    .eq('invoice_number', 'INV-0041')
    .single()
  
  console.log('Invoice Data:')
  console.log(JSON.stringify(invoice, null, 2))
  
  if (invoice) {
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type')
      .eq('company_id', invoice.company_id)
      .or('account_name.ilike.%ضريبة%,account_name.ilike.%tax%,account_code.ilike.%2120%')
    
    console.log('\nTax Accounts:')
    console.log(JSON.stringify(accounts, null, 2))
  }
}

main()

