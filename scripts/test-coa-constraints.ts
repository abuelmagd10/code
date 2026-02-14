
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runTests() {
    console.log('--- Starting Chart of Accounts Constraint Tests ---')

    // 1. Get a test company
    const { data: companies } = await supabase.from('companies').select('id, name').limit(1)
    if (!companies || companies.length === 0) {
        console.error('No companies found')
        return
    }
    const companyId = companies[0].id
    console.log(`Using Company: ${companies[0].name} (${companyId})`)

    // 2. Test Cyclic Dependency
    console.log('\n--- 2. Testing Cyclic Dependency ---')
    const uniqueId = Date.now()
    // Create Parent A
    const { data: accountA, error: errA } = await supabase.from('chart_of_accounts').insert({
        company_id: companyId,
        account_code: `TEST-A-${uniqueId}`,
        account_name: 'Test Account A',
        account_type: 'asset',
        sub_type: 'current_assets',
        normal_balance: 'debit',
        level: 1
    }).select().single()

    if (errA) { console.error('Error creating A:', errA); return }
    console.log('Created Account A:', accountA.id)

    // Create Child B (Parent = A)
    const { data: accountB, error: errB } = await supabase.from('chart_of_accounts').insert({
        company_id: companyId,
        account_code: `TEST-B-${uniqueId}`,
        account_name: 'Test Account B',
        account_type: 'asset',
        sub_type: 'current_assets',
        normal_balance: 'debit',
        parent_id: accountA.id,
        level: 2
    }).select().single()

    if (errB) { console.error('Error creating B:', errB); return }
    console.log('Created Account B (Child of A):', accountB.id)

    // Try to set A's parent to B (Cycle!)
    const { error: errCycle } = await supabase.from('chart_of_accounts')
        .update({ parent_id: accountB.id })
        .eq('id', accountA.id)

    if (errCycle) {
        console.log('✅ Cycle Prevented:', errCycle.message)
    } else {
        console.error('❌ Cycle Allowed! (Major Gap)')
    }

    // 3. Test Deletion with Transactions
    console.log('\n--- 3. Testing Deletion Validation ---')
    // Create Journal Entry using B
    const { data: je, error: errJe } = await supabase.from('journal_entries').insert({
        company_id: companyId,
        entry_date: '2024-01-01',
        description: 'Test Entry',
        reference_type: 'manual',
        status: 'posted'
    }).select().single()

    if (errJe) { console.error('Error creating JE:', errJe); return }

    const { error: errLine } = await supabase.from('journal_entry_lines').insert({
        journal_entry_id: je.id,
        account_id: accountB.id,
        debit_amount: 100,
        credit_amount: 0
    })

    if (errLine) { console.error('Error creating Line:', errLine); return }
    console.log('Created Transaction for Account B')

    // Try to delete B
    const { error: errDelete } = await supabase.from('chart_of_accounts')
        .delete()
        .eq('id', accountB.id)

    if (errDelete) {
        console.log('✅ Deletion Prevented:', errDelete.message)
    } else {
        console.error('❌ Deletion Allowed! (Or failed silently if RLS prevented)')
        // Check if it still exists
        const { data: check } = await supabase.from('chart_of_accounts').select('id').eq('id', accountB.id).single()
        if (!check) console.error('❌ CRITICAL: Account B was deleted despite having transactions!')
        else console.log('✅ Account B still exists (likely RLS or FK protected).')
    }

    // 4. Test Type Change with Transactions
    console.log('\n--- 4. Testing Type Change Validation ---')
    const { error: errType } = await supabase.from('chart_of_accounts')
        .update({ account_type: 'liability' })
        .eq('id', accountB.id)

    if (errType) {
        console.log('✅ Type Change Prevented:', errType.message)
    } else {
        console.log('⚠️ Type Change Allowed (Is this intended? Usually bad if it breaks reporting logic)')
    }

    // Cleanup
    console.log('\n--- Cleanup ---')
    await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', je.id)
    await supabase.from('journal_entries').delete().eq('id', je.id)
    await supabase.from('chart_of_accounts').delete().eq('id', accountB.id)
    await supabase.from('chart_of_accounts').delete().eq('id', accountA.id)
}

runTests().catch(console.error)
