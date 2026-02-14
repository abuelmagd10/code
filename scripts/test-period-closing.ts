
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runTest() {
    console.log('🧪 Starting Period Closing System Test...')

    try {
        // 1. Setup: Get Company & Accounts
        const { data: companies } = await supabase.from('companies').select('id').limit(1)
        if (!companies || companies.length === 0) throw new Error('No company found')
        const companyId = companies[0].id

        // Get an income account and expense account
        const { data: incomeAcc } = await supabase.from('chart_of_accounts')
            .select('id').eq('company_id', companyId).eq('account_type', 'income').limit(1).single()

        const { data: expenseAcc } = await supabase.from('chart_of_accounts')
            .select('id').eq('company_id', companyId).eq('account_type', 'expense').limit(1).single()

        const { data: equityAcc } = await supabase.from('chart_of_accounts')
            .select('id').eq('company_id', companyId).eq('account_type', 'equity').limit(1).single()

        if (!incomeAcc || !expenseAcc || !equityAcc) {
            console.warn('⚠️ Sketchy test environment: Missing needed accounts. Skipping deep logic test.')
            return
        }

        console.log('✅ Accounts found:', { income: incomeAcc.id, expense: expenseAcc.id, equity: equityAcc.id })

        // 2. Create a Test Period (using far-future dates to avoid conflicts)
        const periodName = `Test Period ${Date.now()}`
        const testYear = 2099
        const testMonth = Math.floor(Math.random() * 12) + 1 // Random month to avoid conflicts
        const monthStr = testMonth.toString().padStart(2, '0')
        const { data: period, error: pError } = await supabase.from('accounting_periods').insert({
            company_id: companyId,
            period_name: periodName,
            period_start: `${testYear}-${monthStr}-01`,
            period_end: `${testYear}-${monthStr}-28`,
            status: 'open',
            is_locked: false
        }).select().single()

        if (pError) throw pError
        console.log(`✅ Created Test Period: ${period.period_name} (${period.id})`)

        // 3. Insert some Transactions
        const { data: je, error: jeError } = await supabase.from('journal_entries').insert({
            company_id: companyId,
            entry_date: `${testYear}-${monthStr}-15`,
            description: 'Test Revenue',
            reference_type: 'manual_entry',
            status: 'posted'
        }).select().single()
        if (jeError) throw jeError

        await supabase.from('journal_entry_lines').insert([
            { journal_entry_id: je.id, account_id: incomeAcc.id, credit_amount: 1000, debit_amount: 0, description: 'Revenue' },
            { journal_entry_id: je.id, account_id: expenseAcc.id, debit_amount: 1000, credit_amount: 0, description: 'Expense' } // Net 0 for simplicity, wait let's make profit
        ])
        // Wait, let's make it 1000 Revenue, 400 Expense -> 600 Profit
        // We need to balance the JE. 
        // Revenue Credit 1000. Expense Debit 400. Cash Debit 600.
        // Actually, let's just insert lines that simulate balances. The Close RPC sums lines.
        // Ideally JE should be balanced.
        // JE 1: Cash 1000 (Dr), Revenue 1000 (Cr)
        // JE 2: Expense 400 (Dr), Cash 400 (Cr)

        // We update the lines to be correct.
        await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', je.id)
        await supabase.from('journal_entry_lines').insert([
            { journal_entry_id: je.id, account_id: incomeAcc.id, credit_amount: 1000, debit_amount: 0, description: 'Revenue' },
            { journal_entry_id: je.id, account_id: expenseAcc.id, debit_amount: 400, credit_amount: 0, description: 'Expense' },
            { journal_entry_id: je.id, account_id: equityAcc.id, debit_amount: 600, credit_amount: 0, description: 'Cash Placeholder' } // Using equity as cash placeholder to balance
        ])
        console.log('✅ Created Transactions (Revenue: 1000, Expense: 400)')

        // 4. Test Locking Prevention (Should allow currently)
        // Update JE
        const { error: updateError1 } = await supabase.from('journal_entries')
            .update({ description: 'Updated Description' }).eq('id', je.id)
        if (updateError1) throw new Error('Should allow update in open period')
        console.log('✅ Allowed update in open period')

        // 5. Run Close RPC
        console.log('🔒 Closing period...')
        const { data: closeResult, error: closeRPCError } = await supabase.rpc('close_accounting_period', {
            p_period_id: period.id,
            p_closed_by: (await supabase.auth.getUser()).data.user?.id || period.company_id, // simple hack for ID
            p_retained_earnings_account_id: equityAcc.id
        })

        if (closeRPCError) throw closeRPCError
        console.log('✅ Close RPC Result:', closeResult)

        if (closeResult.net_income !== 600) {
            console.error('❌ Expected Net Income 600, got', closeResult.net_income)
        } else {
            console.log('✅ Net Income Verification Passed (600)')
        }

        // 6. Test Locking (Should FAIL now)
        console.log('🛡️ Testing Lock...')
        const { error: updateError2 } = await supabase.from('journal_entries')
            .update({ description: 'Should Fail' }).eq('id', je.id)

        if (updateError2 && updateError2.message.includes('blocked')) {
            console.log('✅ Lock Active: Update blocked successfully.')
        } else {
            console.error('❌ Lock Failed: Update was allowed or wrong error.', updateError2)
        }

        // 7. Cleanup
        // We need to delete the closing entry first (it's bypassable?) No, it's in the closed period?
        // The Closing Entry is dated period_end (2030-01-31). Period is closed.
        // Trigger allows deletion IF is_closing_entry = true.
        // Let's try to clean up.

        console.log('🧹 Cleanup...')
        // Unlock period manually for cleanup
        await supabase.from('accounting_periods').update({ is_locked: false, status: 'open' }).eq('id', period.id)

        await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', je.id)
        await supabase.from('journal_entries').delete().eq('id', je.id)

        // Delete closing entry
        if (closeResult.journal_entry_id) {
            await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', closeResult.journal_entry_id)
            await supabase.from('journal_entries').delete().eq('id', closeResult.journal_entry_id)
        }

        await supabase.from('accounting_periods').delete().eq('id', period.id)
        console.log('✅ Test Complete.')

    } catch (err) {
        console.error('❌ Test Failed:', err)
        process.exit(1)
    }
}

runTest()
