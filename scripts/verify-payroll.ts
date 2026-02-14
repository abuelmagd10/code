import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
const colors = { reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m" }

async function testPayroll() {
    console.log(`${colors.cyan}🧪 PAYROLL MODULE V2 AUDIT${colors.reset}`)

    // 1. Setup Data
    const { data: company } = await supabase.from('companies').select('id').single()
    const { data: costCenter } = await supabase.from('cost_centers').select('id').eq('company_id', company!.id).single()

    // Create Employee
    const { data: emp } = await supabase.from('employees').insert({
        company_id: company!.id,
        name: 'Test Employee Payroll',
        joined_date: '2025-01-01',
        basic_salary: 5000,
        cost_center_id: costCenter?.id
    }).select().single()

    // 2. Create Payroll Run (Draft)
    const runDate = new Date().toISOString().split('T')[0]
    const { data: run } = await supabase.from('payroll_runs').insert({
        company_id: company!.id,
        period_start: '2025-02-01',
        period_end: '2025-02-28',
        pay_date: runDate,
        status: 'draft',
        total_net: 5000
    }).select().single()

    // Create Item
    await supabase.from('payroll_items').insert({
        payroll_run_id: run!.id,
        employee_id: emp!.id,
        amount: 5000,
        type: 'earning',
        cost_center_id: costCenter?.id
    })

    console.log(`${colors.yellow}👉 Step 1: Created Draft Run ${run!.id}${colors.reset}`)

    // 3. Approve
    await supabase.from('payroll_runs').update({ status: 'approved' }).eq('id', run!.id)
    console.log(`${colors.yellow}👉 Step 2: Approved Run${colors.reset}`)

    // 4. Test Period Locking (Force Closed Date)
    // Assume 2020-01-01 is closed
    const closedDate = '2020-01-01'

    // Attempt Post with Closed Date (Simulating parameter override or bad data)
    // We need to update pay_date to closed first to test the RPC validation
    await supabase.from('payroll_runs').update({ pay_date: closedDate }).eq('id', run!.id)

    const { error: lockError } = await supabase.rpc('post_payroll_run_atomic', {
        p_payroll_run_id: run!.id,
        p_expense_account_id: company!.id, // Dummy ID for test
        p_payable_account_id: company!.id,
        p_user_id: null
    })

    if (lockError && lockError.message.includes('CLOSED or LOCKED')) {
        console.log(`${colors.green}✅ PASSED: Blocked Posting in Closed Period.${colors.reset}`)
    } else {
        console.log(`${colors.red}❌ FAILED: Did not block Closed Period posting!${colors.reset}`, lockError)
    }
}

testPayroll()
