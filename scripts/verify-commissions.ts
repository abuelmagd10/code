import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
const colors = { reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m" }

async function testCommissions() {
    console.log(`${colors.cyan}🧪 COMMISSIONS MODULE AUDIT${colors.reset}`)

    // 1. Setup Data
    const { data: company } = await supabase.from('companies').select('id').single()
    const { data: emp } = await supabase.from('employees').select('id').limit(1).single()

    if (!emp) { console.log('No employee found'); return }

    // 2. Test Double Dipping (Unique Constraint)
    const sourceId = '00000000-0000-0000-0000-000000000001' // Dummy Invoice ID
    const commData = {
        company_id: company!.id,
        employee_id: emp.id,
        source_type: 'invoice',
        source_id: sourceId,
        transaction_date: '2025-02-01',
        amount: 100
    }

    // Insert First Time
    const { error: insError1 } = await supabase.from('commission_ledger').insert(commData)
    if (insError1) {
        console.log(`${colors.red}❌ FAILED: Input 1 failed${colors.reset}`, insError1)
    } else {
        console.log(`${colors.green}✅ Insert 1 Success${colors.reset}`)
    }

    // Insert Second Time (Should Fail)
    const { error: insError2 } = await supabase.from('commission_ledger').insert(commData)
    if (insError2 && insError2.code === '23505') { // Unique Violation
        console.log(`${colors.green}✅ PASSED: Blocked Double Commission (Unique Constraint).${colors.reset}`)
    } else {
        console.log(`${colors.red}❌ FAILED: Duplicate Commission Allowed!${colors.reset}`, insError2)
    }
}

testCommissions()
