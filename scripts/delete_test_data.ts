import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  console.log("Searching for test companies...")
  const { data: companies, error: companiesError } = await supabase
    .from('companies')
    .select('id, name')
    // Matches names containing 'تست' or 'test' (case-insensitive)
    .or('name.ilike.%تست%,name.ilike.%test%')

  if (companiesError) {
    console.error("Error fetching companies:", companiesError)
    return
  }

  if (!companies || companies.length === 0) {
    console.log("No test companies found matching 'تست' or 'test'")
    return
  }

  console.log("Found test companies:", companies.map(c => c.name).join(", "))

  for (const company of companies) {
    console.log(`\nProcessing company: ${company.name} (${company.id})`)

    // 1. Delete Sales Orders (items will cascade)
    console.log("Deleting sales orders...")
    const { error: soError } = await supabase
      .from('sales_orders')
      .delete()
      .eq('company_id', company.id)
    
    if (soError) {
      console.error("Error deleting sales orders:", soError)
    } else {
      console.log(`✅ Deleted sales orders for company ${company.name}`)
    }

    // 2. Delete Sales Invoices (items will cascade)
    console.log("Deleting sales invoices...")
    const { error: invError } = await supabase
      .from('invoices')
      .delete()
      .eq('company_id', company.id)
    
    if (invError) {
      console.error("Error deleting invoices:", invError)
    } else {
      console.log(`✅ Deleted invoices for company ${company.name}`)
    }
  }

  console.log("\nData cleanup is complete! You can now re-test your sales cycle.")
}

main().catch(console.error)
