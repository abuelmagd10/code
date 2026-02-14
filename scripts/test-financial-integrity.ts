import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const colors = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    blue: "\x1b[34m"
}

interface TestResult {
    test: string
    passed: boolean
    details?: string
}

const results: TestResult[] = []

async function log(message: string, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`)
}

async function testFinancialIntegrity() {
    log('\n🧪 FINANCIAL VALIDATION TEST SUITE', colors.cyan)
    log('='.repeat(60), colors.cyan)

    // Get company
    const { data: company } = await supabase.from('companies').select('id').single()
    if (!company) {
        log('❌ No company found', colors.red)
        return
    }

    const companyId = company.id
    log(`\n📌 Testing Company: ${companyId}`, colors.blue)

    // Test Period
    const testPeriod = {
        start: '2025-01-01',
        end: '2025-12-31'
    }

    log(`📅 Test Period: ${testPeriod.start} to ${testPeriod.end}\n`, colors.blue)

    // ============================================
    // TEST 1: TRIAL BALANCE INTEGRITY
    // ============================================
    log('1️⃣ Testing Trial Balance...', colors.yellow)

    const { data: trialBalance, error: tbError } = await supabase.rpc('get_trial_balance', {
        p_company_id: companyId,
        p_start_date: testPeriod.start,
        p_end_date: testPeriod.end
    })

    if (tbError) {
        log(`   ❌ Trial Balance Error: ${tbError.message}`, colors.red)
        results.push({ test: 'Trial Balance Query', passed: false, details: tbError.message })
    } else {
        const totalDebits = trialBalance?.reduce((sum: number, row: any) => sum + parseFloat(row.total_debit || 0), 0) || 0
        const totalCredits = trialBalance?.reduce((sum: number, row: any) => sum + parseFloat(row.total_credit || 0), 0) || 0
        const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01

        log(`   Total Debits:  ${totalDebits.toFixed(2)}`, colors.reset)
        log(`   Total Credits: ${totalCredits.toFixed(2)}`, colors.reset)

        if (isBalanced) {
            log(`   ✅ PASSED: Trial Balance is balanced!`, colors.green)
            results.push({ test: 'Trial Balance', passed: true })
        } else {
            log(`   ❌ FAILED: Trial Balance is NOT balanced (Diff: ${(totalDebits - totalCredits).toFixed(2)})`, colors.red)
            results.push({ test: 'Trial Balance', passed: false, details: `Difference: ${(totalDebits - totalCredits).toFixed(2)}` })
        }
    }

    // ============================================
    // TEST 2: INCOME STATEMENT
    // ============================================
    log('\n2️⃣ Testing Income Statement...', colors.yellow)

    const { data: incomeStmt, error: isError } = await supabase.rpc('get_income_statement', {
        p_company_id: companyId,
        p_start_date: testPeriod.start,
        p_end_date: testPeriod.end
    })

    if (isError) {
        log(`   ❌ Income Statement Error: ${isError.message}`, colors.red)
        results.push({ test: 'Income Statement Query', passed: false, details: isError.message })
    } else {
        const revenue = incomeStmt?.filter((r: any) => r.section === 'Revenue')
            .reduce((sum: number, r: any) => sum + parseFloat(r.amount || 0), 0) || 0
        const cogs = incomeStmt?.filter((r: any) => r.section === 'COGS')
            .reduce((sum: number, r: any) => sum + parseFloat(r.amount || 0), 0) || 0
        const expenses = incomeStmt?.filter((r: any) => r.section === 'Expense')
            .reduce((sum: number, r: any) => sum + parseFloat(r.amount || 0), 0) || 0

        const grossProfit = revenue - cogs
        const netIncome = grossProfit - expenses

        log(`   Revenue:      ${revenue.toFixed(2)}`, colors.reset)
        log(`   COGS:         ${cogs.toFixed(2)}`, colors.reset)
        log(`   Gross Profit: ${grossProfit.toFixed(2)}`, colors.reset)
        log(`   Expenses:     ${expenses.toFixed(2)}`, colors.reset)
        log(`   Net Income:   ${netIncome.toFixed(2)}`, colors.reset)

        log(`   ✅ PASSED: Income Statement generated`, colors.green)
        results.push({ test: 'Income Statement', passed: true, details: `Net Income: ${netIncome.toFixed(2)}` })
    }

    // ============================================
    // TEST 3: BALANCE SHEET
    // ============================================
    log('\n3️⃣ Testing Balance Sheet...', colors.yellow)

    const { data: balanceSheet, error: bsError } = await supabase.rpc('get_balance_sheet', {
        p_company_id: companyId,
        p_as_of_date: testPeriod.end
    })

    if (bsError) {
        log(`   ❌ Balance Sheet Error: ${bsError.message}`, colors.red)
        results.push({ test: 'Balance Sheet Query', passed: false, details: bsError.message })
    } else {
        const assets = balanceSheet?.filter((r: any) => r.section === 'Asset')
            .reduce((sum: number, r: any) => sum + parseFloat(r.balance || 0), 0) || 0
        const liabilities = balanceSheet?.filter((r: any) => r.section === 'Liability')
            .reduce((sum: number, r: any) => sum + parseFloat(r.balance || 0), 0) || 0
        const equity = balanceSheet?.filter((r: any) => r.section === 'Equity')
            .reduce((sum: number, r: any) => sum + parseFloat(r.balance || 0), 0) || 0

        log(`   Assets:      ${assets.toFixed(2)}`, colors.reset)
        log(`   Liabilities: ${liabilities.toFixed(2)}`, colors.reset)
        log(`   Equity:      ${equity.toFixed(2)}`, colors.reset)

        const equation = Math.abs(assets - (liabilities + equity))
        const isBalanced = equation < 0.01

        if (isBalanced) {
            log(`   ✅ PASSED: Accounting Equation is satisfied (A = L + E)`, colors.green)
            results.push({ test: 'Balance Sheet Equation', passed: true })
        } else {
            log(`   ❌ FAILED: Accounting Equation NOT satisfied (Diff: ${equation.toFixed(2)})`, colors.red)
            results.push({ test: 'Balance Sheet Equation', passed: false, details: `Difference: ${equation.toFixed(2)}` })
        }
    }

    // ============================================
    // TEST 4: FINANCIAL SUMMARY
    // ============================================
    log('\n4️⃣ Testing Financial Summary...', colors.yellow)

    const { data: summary, error: summaryError } = await supabase.rpc('get_financial_summary', {
        p_company_id: companyId,
        p_start_date: testPeriod.start,
        p_end_date: testPeriod.end
    })

    if (summaryError) {
        log(`   ❌ Financial Summary Error: ${summaryError.message}`, colors.red)
        results.push({ test: 'Financial Summary Query', passed: false, details: summaryError.message })
    } else if (summary && summary.length > 0) {
        const s = summary[0]
        log(`   Revenue:      ${parseFloat(s.total_revenue).toFixed(2)}`, colors.reset)
        log(`   COGS:         ${parseFloat(s.total_cogs).toFixed(2)}`, colors.reset)
        log(`   Gross Profit: ${parseFloat(s.gross_profit).toFixed(2)}`, colors.reset)
        log(`   Expenses:     ${parseFloat(s.total_expenses).toFixed(2)}`, colors.reset)
        log(`   Net Income:   ${parseFloat(s.net_income).toFixed(2)}`, colors.reset)
        log(`   Assets:       ${parseFloat(s.total_assets).toFixed(2)}`, colors.reset)
        log(`   Liabilities:  ${parseFloat(s.total_liabilities).toFixed(2)}`, colors.reset)
        log(`   Equity:       ${parseFloat(s.total_equity).toFixed(2)}`, colors.reset)

        log(`   ✅ PASSED: Financial Summary generated`, colors.green)
        results.push({ test: 'Financial Summary', passed: true })
    }

    // ============================================
    // FINAL REPORT
    // ============================================
    log('\n' + '='.repeat(60), colors.cyan)
    log('📊 TEST RESULTS SUMMARY', colors.cyan)
    log('='.repeat(60), colors.cyan)

    const passed = results.filter(r => r.passed).length
    const failed = results.filter(r => !r.passed).length

    results.forEach(r => {
        const icon = r.passed ? '✅' : '❌'
        const color = r.passed ? colors.green : colors.red
        log(`${icon} ${r.test}${r.details ? ` - ${r.details}` : ''}`, color)
    })

    log('\n' + '='.repeat(60), colors.cyan)
    log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`, colors.blue)

    if (failed === 0) {
        log('\n🎉 ALL TESTS PASSED! Financial engine is working correctly.', colors.green)
    } else {
        log(`\n⚠️  ${failed} test(s) failed. Review the results above.`, colors.red)
    }
}

testFinancialIntegrity().catch(console.error)
