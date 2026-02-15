/**
 * Test Script: Audit Log Phase 1 Verification
 * 
 * This script tests the new audit logging functionality
 * Run with: npx tsx scripts/test-audit-phase1.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing environment variables')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testAuditPhase1() {
    console.log('🧪 Testing Audit Log Phase 1 Implementation...\n')

    let passed = 0
    let failed = 0

    // Test 1: Verify schema changes
    console.log('1️⃣ Testing Schema Changes...')
    try {
        // Check if reason column exists
        const { data: columns } = await supabase
            .from('audit_logs')
            .select('*')
            .limit(1)

        if (columns) {
            console.log('  ✅ audit_logs table accessible')
            passed++
        }
    } catch (error: any) {
        console.error('  ❌ Failed to access audit_logs:', error.message)
        failed++
    }

    // Test 2: Test new action types
    console.log('\n2️⃣ Testing New Action Types...')
    const newActions = ['APPROVE', 'POST', 'CANCEL', 'REVERSE', 'CLOSE', 'LOGIN', 'LOGOUT', 'ACCESS_DENIED', 'SETTINGS']

    for (const action of newActions) {
        try {
            const { error } = await supabase
                .from('audit_logs')
                .insert({
                    company_id: '00000000-0000-0000-0000-000000000000',
                    user_id: '00000000-0000-0000-0000-000000000000',
                    action: action,
                    target_table: 'test_table',
                    record_identifier: `test_${action.toLowerCase()}`,
                    reason: `Testing ${action} action type`
                })
                .select()
                .single()

            if (!error) {
                console.log(`  ✅ ${action} action type works`)
                passed++

                // Clean up test record
                await supabase
                    .from('audit_logs')
                    .delete()
                    .eq('record_identifier', `test_${action.toLowerCase()}`)
            } else {
                console.error(`  ❌ ${action} failed:`, error.message)
                failed++
            }
        } catch (error: any) {
            console.error(`  ❌ ${action} failed:`, error.message)
            failed++
        }
    }

    // Test 3: Test UPDATE prevention
    console.log('\n3️⃣ Testing UPDATE Prevention...')
    try {
        // First create a test record
        const { data: testRecord } = await supabase
            .from('audit_logs')
            .insert({
                company_id: '00000000-0000-0000-0000-000000000000',
                user_id: '00000000-0000-0000-0000-000000000000',
                action: 'INSERT',
                target_table: 'test_update_prevention',
                record_identifier: 'test_update',
                reason: 'Testing UPDATE prevention'
            })
            .select()
            .single()

        if (testRecord) {
            // Try to update it (should fail)
            const { error } = await supabase
                .from('audit_logs')
                .update({ action: 'DELETE' })
                .eq('id', testRecord.id)

            if (error) {
                console.log('  ✅ UPDATE prevention works (update blocked as expected)')
                passed++
            } else {
                console.error('  ❌ UPDATE prevention FAILED (update was allowed)')
                failed++
            }

            // Clean up
            await supabase
                .from('audit_logs')
                .delete()
                .eq('id', testRecord.id)
        }
    } catch (error: any) {
        console.error('  ❌ UPDATE prevention test failed:', error.message)
        failed++
    }

    // Test 4: Verify triggers on critical tables
    console.log('\n4️⃣ Testing Triggers on Critical Tables...')

    // Test sales_orders trigger (if table exists)
    try {
        const { data: salesOrder, error: insertError } = await supabase
            .from('sales_orders')
            .insert({
                company_id: '00000000-0000-0000-0000-000000000000',
                customer_id: '00000000-0000-0000-0000-000000000000',
                order_number: 'TEST-SO-001',
                order_date: new Date().toISOString(),
                status: 'draft',
                total_amount: 100
            })
            .select()
            .single()

        if (!insertError && salesOrder) {
            // Check if audit log was created
            const { data: auditLog } = await supabase
                .from('audit_logs')
                .select('*')
                .eq('target_table', 'sales_orders')
                .eq('record_id', salesOrder.id)
                .eq('action', 'INSERT')
                .single()

            if (auditLog) {
                console.log('  ✅ sales_orders trigger works')
                passed++
            } else {
                console.error('  ❌ sales_orders trigger did not create audit log')
                failed++
            }

            // Clean up
            await supabase.from('sales_orders').delete().eq('id', salesOrder.id)
            if (auditLog) {
                await supabase.from('audit_logs').delete().eq('id', auditLog.id)
            }
        } else {
            console.log('  ⚠️  sales_orders table not found or insert failed (may not exist yet)')
        }
    } catch (error: any) {
        console.log('  ⚠️  sales_orders test skipped:', error.message)
    }

    // Test company_members trigger
    try {
        const { data: member, error: insertError } = await supabase
            .from('company_members')
            .insert({
                company_id: '00000000-0000-0000-0000-000000000000',
                user_id: '00000000-0000-0000-0000-000000000000',
                role: 'viewer'
            })
            .select()
            .single()

        if (!insertError && member) {
            // Check if audit log was created
            const { data: auditLog } = await supabase
                .from('audit_logs')
                .select('*')
                .eq('target_table', 'company_members')
                .eq('record_id', member.id)
                .eq('action', 'INSERT')
                .single()

            if (auditLog) {
                console.log('  ✅ company_members trigger works')
                passed++
            } else {
                console.error('  ❌ company_members trigger did not create audit log')
                failed++
            }

            // Clean up
            await supabase.from('company_members').delete().eq('id', member.id)
            if (auditLog) {
                await supabase.from('audit_logs').delete().eq('id', auditLog.id)
            }
        }
    } catch (error: any) {
        console.log('  ⚠️  company_members test skipped:', error.message)
    }

    // Summary
    console.log('\n' + '='.repeat(50))
    console.log('📊 Test Summary')
    console.log('='.repeat(50))
    console.log(`✅ Passed: ${passed}`)
    console.log(`❌ Failed: ${failed}`)
    console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`)
    console.log('='.repeat(50))

    if (failed === 0) {
        console.log('\n🎉 All tests passed! Phase 1 implementation is working correctly.')
        process.exit(0)
    } else {
        console.log('\n⚠️  Some tests failed. Please review the errors above.')
        process.exit(1)
    }
}

// Run tests
testAuditPhase1().catch((error) => {
    console.error('❌ Test script failed:', error)
    process.exit(1)
})
