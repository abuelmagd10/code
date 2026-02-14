import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Colors for output
const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m"
}

async function runTest() {
    console.log(`${colors.cyan}=============================================${colors.reset}`)
    console.log(`${colors.cyan}🧪 EQUITY MODULE AUDIT: PERIOD LOCKING TEST${colors.reset}`)
    console.log(`${colors.cyan}=============================================${colors.reset}`)

    try {
        // 1. Setup: Get Company
        const { data: companies, error: compError } = await supabase.from('companies').select('id, name').limit(1)
        if (compError || !companies.length) throw new Error('No company found for testing')
        const company = companies[0]
        console.log(`🏢 Testing with Company: ${colors.yellow}${company.name}${colors.reset}`)

        // 2. Setup: Get Accounts (Equity and Liability)
        // We need Retained Earnings (Equity) and Dividends Payable (Liability)
        const { data: accounts } = await supabase
            .from('chart_of_accounts')
            .select('id, account_name, code, account_type')
            .eq('company_id', company.id)

        // Find or fallback (simulated logic)
        const retainedEarnings = accounts?.find(a => a.account_name?.includes('Retained') || a.account_type === 'equity')
        const dividendsPayable = accounts?.find(a => a.account_name?.includes('Payable') || a.account_type === 'liability')
        const bankAccount = accounts?.find(a => a.account_type === 'bank' || a.account_type === 'cash')

        if (!retainedEarnings || !dividendsPayable || !bankAccount) {
            throw new Error('Required accounts (Retained Earnings, Dividends Payable, Bank) not found. Please create them first.')
        }
        console.log(`📚 Accounts: RE=${retainedEarnings.code}, Payable=${dividendsPayable.code}, Bank=${bankAccount.code}`)

        // 3. Setup: Create Dummy Shareholder
        const { data: shareholder, error: shError } = await supabase
            .from('shareholders')
            .insert({
                company_id: company.id,
                name: 'Test Shareholder ' + Date.now(),
                current_ownership_percentage: 100
            })
            .select()
            .single()

        if (shError) throw shError
        console.log(`👤 Created Test Shareholder: ${shareholder.name}`)

        // 4. Setup: Create a CLOSED Period (e.g., Jan 2020)
        const closedDate = '2020-01-15'
        const periodStart = '2020-01-01'
        const periodEnd = '2020-01-31'

        // Ensure period exists and is closed
        const { data: existingPeriod } = await supabase.from('accounting_periods').select('id').eq('company_id', company.id).eq('period_start', periodStart).single()
        if (existingPeriod) {
            await supabase.from('accounting_periods').update({ status: 'closed', is_locked: true }).eq('id', existingPeriod.id)
        } else {
            await supabase.from('accounting_periods').insert({
                company_id: company.id,
                period_name: 'Closed Test Period Jan 2020',
                period_start: periodStart,
                period_end: periodEnd,
                status: 'closed',
                is_locked: true,
                fiscal_year_id: null // Simplified
            })
        }
        console.log(`🔒 Ensure Period ${periodStart} - ${periodEnd} is CLOSED.`)

        // ==========================================
        // TEST CASE 1: Distribute Dividends in Closed Period
        // ==========================================
        console.log(`\n${colors.yellow}👉 Test Case 1: Attempt Distribution in Closed Period (${closedDate})${colors.reset}`)

        const { error: distError } = await supabase.rpc('distribute_dividends_atomic', {
            p_company_id: company.id,
            p_total_amount: 1000,
            p_distribution_date: closedDate,
            p_shareholders: [{ id: shareholder.id, amount: 1000, percentage: 100 }],
            p_retained_earnings_account_id: retainedEarnings.id,
            p_dividends_payable_account_id: dividendsPayable.id,
            p_user_id: null // System
        })

        if (distError && distError.message.includes('CLOSED or LOCKED')) {
            console.log(`${colors.green}✅ PASSED: System correctly blocked distribution in closed period.${colors.reset}`)
            console.log(`   Error: ${distError.message}`)
        } else {
            console.log(`${colors.red}❌ FAILED: System DID NOT block distribution in closed period!${colors.reset}`)
            console.log(`   Result: ${distError ? distError.message : 'Success (Unexpected)'}`)
            return // Stop
        }

        // ==========================================
        // TEST CASE 2: Distribute Dividends in OPEN Period
        // ==========================================
        // Create Open Period (e.g., Today)
        const openDate = new Date().toISOString().split('T')[0]
        console.log(`\n${colors.yellow}👉 Test Case 2: Attempt Distribution in Open Period (${openDate})${colors.reset}`)

        const { data: distData, error: openDistError } = await supabase.rpc('distribute_dividends_atomic', {
            p_company_id: company.id,
            p_total_amount: 5000,
            p_distribution_date: openDate,
            p_shareholders: [{ id: shareholder.id, amount: 5000, percentage: 100 }],
            p_retained_earnings_account_id: retainedEarnings.id,
            p_dividends_payable_account_id: dividendsPayable.id,
            p_user_id: null
        })

        if (openDistError) {
            console.log(`${colors.red}❌ FAILED: Could not distribute in open period.${colors.reset}`)
            console.error(openDistError)
            return
        }

        console.log(`${colors.green}✅ PASSED: Success Distribution ID: ${distData?.distribution_id}${colors.reset}`)
        const distLineId = (await supabase.from('profit_distribution_lines').select('id').eq('distribution_id', distData.distribution_id).single()).data?.id

        // ==========================================
        // TEST CASE 3: Pay Dividend in CLOSED Period
        // ==========================================
        console.log(`\n${colors.yellow}👉 Test Case 3: Attempt Payment in Closed Period (${closedDate})${colors.reset}`)

        const { error: payError } = await supabase.rpc('pay_dividend_atomic', {
            p_company_id: company.id,
            p_distribution_line_id: distLineId,
            p_amount: 1000,
            p_payment_date: closedDate, // CLOSED DATE
            p_payment_account_id: bankAccount.id,
            p_dividends_payable_account_id: dividendsPayable.id
        })

        if (payError && payError.message.includes('CLOSED or LOCKED')) {
            console.log(`${colors.green}✅ PASSED: System correctly blocked payment in closed period.${colors.reset}`)
        } else {
            console.log(`${colors.red}❌ FAILED: System DID NOT block payment in closed period!${colors.reset}`)
        }

        // ==========================================
        // TEST CASE 4: Shareholder Drawing in CLOSED Period
        // ==========================================
        console.log(`\n${colors.yellow}👉 Test Case 4: Attempt Drawing in Closed Period (${closedDate})${colors.reset}`)
        const { error: drawError } = await supabase.rpc('record_shareholder_drawing_atomic', {
            p_company_id: company.id,
            p_shareholder_id: shareholder.id,
            p_amount: 500,
            p_drawing_date: closedDate, // CLOSED
            p_payment_account_id: bankAccount.id,
            p_drawings_account_id: retainedEarnings.id // Using RE as drawings for test
        })

        if (drawError && drawError.message.includes('CLOSED or LOCKED')) {
            console.log(`${colors.green}✅ PASSED: System correctly blocked drawing in closed period.${colors.reset}`)
        } else {
            console.log(`${colors.red}❌ FAILED: System DID NOT block drawing in closed period!${colors.reset}`)
        }

        console.log(`\n${colors.cyan}🎉 ALL AUDIT TESTS COMPLETED.${colors.reset}`)

    } catch (err: any) {
        console.error(`${colors.red}🔥 Critical Error:${colors.reset}`, err.message)
    }
}

runTest()
