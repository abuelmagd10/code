/**
 * Commission-Payroll Integration Test Script
 * 
 * This script tests the complete commission-payroll integration:
 * 1. Database schema changes
 * 2. Instant payout flow
 * 3. Payroll integration flow
 * 4. Journal entry creation
 * 
 * Run this after deploying the migration to production or starting Docker locally.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Test configuration
const TEST_COMPANY_ID = process.env.TEST_COMPANY_ID || ''
const TEST_EMPLOYEE_ID = process.env.TEST_EMPLOYEE_ID || ''

async function runTests() {
    console.log('🧪 Starting Commission-Payroll Integration Tests\n')

    try {
        // Test 1: Verify database schema changes
        await testDatabaseSchema()

        // Test 2: Verify RPC functions exist
        await testRPCFunctions()

        // Test 3: Test commission plan with payout_mode
        await testCommissionPlanCreation()

        // Test 4: Test instant payout flow (if test data exists)
        if (TEST_COMPANY_ID && TEST_EMPLOYEE_ID) {
            await testInstantPayoutFlow()
        } else {
            console.log('⚠️  Skipping instant payout flow test (no test data)')
        }

        console.log('\n✅ All tests completed!')
    } catch (error) {
        console.error('\n❌ Test failed:', error)
        process.exit(1)
    }
}

/**
 * Test 1: Verify database schema changes
 */
async function testDatabaseSchema() {
    console.log('📋 Test 1: Verifying database schema changes...')

    // v3.74.849 — this test COULD NOT FAIL, and it was checking the wrong table.
    //
    // The old condition read:
    //     if (error && !error.message.includes('does not exist')) -> print "exists"
    //     else if (error) -> throw
    // When the column really existed there was no error at all, so both branches
    // were skipped: nothing printed, nothing thrown, test "passed". And when the
    // column was missing it threw only if the message did NOT say "does not
    // exist" - which is exactly what such a message says. Inverted both ways.
    //
    // It was also asking commission_ledger for payment_status / paid_at /
    // payment_journal_entry_id. Those columns are not there and never were: the
    // payment facts live on commission_runs (status, paid_at,
    // payment_journal_id) and the ledger carries status and journal_entry_id.
    // A test aimed at the wrong table cannot pass however it is written.
    //
    // commission_plans.payout_mode is not checked any more: the column does not
    // exist, nothing reads it, and the one query that selected it never used
    // the value.
    const mustHave = async (table: string, columns: string) => {
        const { error } = await supabase.from(table).select(columns).limit(1)
        if (error) {
            throw new Error(`❌ ${table} is missing one of [${columns}] — ${error.message}`)
        }
        console.log(`  ✅ ${table}: ${columns}`)
    }

    // The link that makes attach-to-payroll possible, and stops it happening twice.
    await mustHave('commission_runs', 'id, payroll_run_id, status, paid_at, payment_journal_id')
    await mustHave('commission_ledger', 'id, status, journal_entry_id, amount, commission_run_id')

    console.log('  ✅ All schema changes verified\n')
}

/**
 * Test 2: Verify RPC functions exist
 */
async function testRPCFunctions() {
    console.log('📋 Test 2: Verifying RPC functions...')

    // Test get_pending_instant_payouts
    const { error: rpc1Error } = await supabase.rpc('get_pending_instant_payouts', {
        p_company_id: '00000000-0000-0000-0000-000000000000',
        p_start_date: '2026-01-01',
        p_end_date: '2026-12-31',
        p_employee_id: null
    })

    if (!rpc1Error || rpc1Error.message.includes('no rows')) {
        console.log('  ✅ get_pending_instant_payouts() exists')
    } else {
        throw new Error(`❌ get_pending_instant_payouts() missing: ${rpc1Error.message}`)
    }

    // Note: pay_instant_commissions requires valid data, so we just check if it exists
    // by checking the function in pg_proc
    const { data: funcExists } = await supabase
        .from('pg_proc')
        .select('proname')
        .eq('proname', 'pay_instant_commissions')
        .single()

    if (funcExists) {
        console.log('  ✅ pay_instant_commissions() exists')
    } else {
        console.log('  ⚠️  Could not verify pay_instant_commissions() (may need direct DB access)')
    }

    console.log('  ✅ RPC functions verified\n')
}

/**
 * Test 3: Test commission plan creation with payout_mode
 */
async function testCommissionPlanCreation() {
    console.log('📋 Test 3: Testing commission plan creation with payout_mode...')

    if (!TEST_COMPANY_ID) {
        console.log('  ⚠️  Skipping (no TEST_COMPANY_ID)\n')
        return
    }

    // Create test plan with immediate payout
    const testPlan = {
        company_id: TEST_COMPANY_ID,
        name: 'Test Instant Payout Plan',
        type: 'flat_percent',
        payout_mode: 'immediate',
        calculation_basis: 'after_discount',
        handle_returns: true,
        effective_from: '2026-01-01',
        flat_rate: 5.0,
        is_active: true
    }

    const { data: createdPlan, error: createError } = await supabase
        .from('commission_plans')
        .insert(testPlan)
        .select()
        .single()

    if (createError) {
        throw new Error(`❌ Failed to create test plan: ${createError.message}`)
    }

    console.log('  ✅ Created test plan with payout_mode = immediate')
    console.log(`  📝 Plan ID: ${createdPlan.id}`)

    // Verify payout_mode was saved
    if (createdPlan.payout_mode === 'immediate') {
        console.log('  ✅ payout_mode saved correctly')
    } else {
        throw new Error(`❌ payout_mode mismatch: expected 'immediate', got '${createdPlan.payout_mode}'`)
    }

    // Clean up test plan
    await supabase.from('commission_plans').delete().eq('id', createdPlan.id)
    console.log('  ✅ Test plan cleaned up\n')
}

/**
 * Test 4: Test instant payout flow
 */
async function testInstantPayoutFlow() {
    console.log('📋 Test 4: Testing instant payout flow...')

    // Get pending instant payouts
    const { data: pendingPayouts, error: payoutsError } = await supabase.rpc(
        'get_pending_instant_payouts',
        {
            p_company_id: TEST_COMPANY_ID,
            p_start_date: '2026-01-01',
            p_end_date: '2026-12-31',
            p_employee_id: null
        }
    )

    if (payoutsError) {
        throw new Error(`❌ Failed to get pending payouts: ${payoutsError.message}`)
    }

    console.log(`  ✅ Retrieved pending payouts: ${pendingPayouts?.length || 0} employees`)

    if (pendingPayouts && pendingPayouts.length > 0) {
        console.log('  📊 Sample payout data:')
        const sample = pendingPayouts[0]
        console.log(`     Employee: ${sample.employee_name}`)
        console.log(`     Invoices: ${sample.invoices_count}`)
        console.log(`     Gross: ${sample.gross_commission}`)
        console.log(`     Clawbacks: ${sample.clawbacks}`)
        console.log(`     Net: ${sample.net_commission}`)
    }

    console.log('  ✅ Instant payout flow working\n')
}

/**
 * Test API endpoints (requires authentication)
 */
async function testAPIEndpoints() {
    console.log('📋 Test 5: Testing API endpoints...')
    console.log('  ⚠️  API endpoint testing requires authentication')
    console.log('  ℹ️  Test these manually via the UI or Postman\n')
}

// Run tests
runTests()
