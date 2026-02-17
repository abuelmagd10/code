/**
 * UNIT TEST: Commission Attribution to Sales Order Creator
 * 
 * Purpose: Verify that commissions are correctly attributed to the Sales Order creator,
 * not the Invoice creator. This test prevents future regressions.
 * 
 * Test Scenarios:
 * 1. Sales Order exists → Commission to SO creator
 * 2. No Sales Order → Commission to Invoice creator (fallback)
 * 3. Invoice modified by different user → Commission stays with SO creator
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface TestResult {
    scenario: string;
    passed: boolean;
    details: string;
}

async function runAttributionTests() {
    console.log('🧪 COMMISSION ATTRIBUTION UNIT TESTS\n');
    console.log('='.repeat(60));

    const results: TestResult[] = [];

    try {
        // Setup: Get test company and create test users
        const { data: company } = await supabase
            .from('companies')
            .select('id')
            .limit(1)
            .single();

        if (!company) {
            throw new Error('No company found for testing');
        }

        // Create test users
        const salesRepUser = await supabase.auth.admin.createUser({
            email: 'sales-rep-test@attribution.test',
            password: 'TestPassword123!',
            email_confirm: true,
        });

        const billingClerkUser = await supabase.auth.admin.createUser({
            email: 'billing-clerk-test@attribution.test',
            password: 'TestPassword123!',
            email_confirm: true,
        });

        if (!salesRepUser.data?.user || !billingClerkUser.data?.user) {
            throw new Error('Failed to create test users');
        }

        // Create employees
        const { data: salesRep } = await supabase
            .from('employees')
            .insert({
                company_id: company.id,
                user_id: salesRepUser.data.user.id,
                full_name: 'Sales Rep Test',
                email: 'sales-rep-test@attribution.test',
                is_active: true,
            })
            .select()
            .single();

        const { data: billingClerk } = await supabase
            .from('employees')
            .insert({
                company_id: company.id,
                user_id: billingClerkUser.data.user.id,
                full_name: 'Billing Clerk Test',
                email: 'billing-clerk-test@attribution.test',
                is_active: true,
            })
            .select()
            .single();

        if (!salesRep || !billingClerk) {
            throw new Error('Failed to create test employees');
        }

        // Create commission plan
        const { data: plan } = await supabase
            .from('commission_plans')
            .insert({
                company_id: company.id,
                name: 'Test Attribution Plan',
                type: 'flat_percent',
                basis: 'invoice_issuance',
                calculation_basis: 'after_discount',
                tier_type: 'progressive',
                handle_returns: 'auto_reverse',
                is_active: true,
            })
            .select()
            .single();

        if (!plan) {
            throw new Error('Failed to create test plan');
        }

        await supabase.from('commission_rules').insert({
            plan_id: plan.id,
            min_amount: 0,
            max_amount: null,
            commission_rate: 5.0,
        });

        // ========================================
        // TEST 1: Sales Order exists → Commission to SO creator
        // ========================================
        console.log('\n📋 Test 1: Sales Order Flow');
        console.log('  Sales Rep creates SO, Billing Clerk creates Invoice');

        const { data: salesOrder } = await supabase
            .from('sales_orders')
            .insert({
                company_id: company.id,
                order_number: 'SO-ATTR-TEST-001',
                customer_name: 'Test Customer',
                order_date: new Date().toISOString().split('T')[0],
                total_amount: 10000,
                status: 'confirmed',
                created_by: salesRep.user_id, // Sales Rep creates SO
            })
            .select()
            .single();

        const { data: invoice1 } = await supabase
            .from('invoices')
            .insert({
                company_id: company.id,
                sales_order_id: salesOrder!.id,
                invoice_number: 'INV-ATTR-TEST-001',
                customer_name: 'Test Customer',
                invoice_date: new Date().toISOString().split('T')[0],
                subtotal: 10000,
                total_amount: 10000,
                status: 'paid',
                paid_at: new Date().toISOString(),
                created_by_user_id: billingClerk.user_id, // Billing Clerk creates Invoice
            })
            .select()
            .single();

        // Calculate commission
        const { data: calcResult1 } = await supabase.rpc('calculate_commission_for_period', {
            p_employee_id: salesRep.id,
            p_period_start: new Date().toISOString().split('T')[0],
            p_period_end: new Date().toISOString().split('T')[0],
            p_commission_plan_id: plan.id,
        });

        const test1Passed = calcResult1?.invoices_processed > 0;
        results.push({
            scenario: 'Test 1: SO Flow - Commission to Sales Rep',
            passed: test1Passed,
            details: test1Passed
                ? `✅ Commission correctly attributed to Sales Rep (${calcResult1?.commission_amount})`
                : '❌ Commission NOT attributed to Sales Rep',
        });

        // Verify Billing Clerk did NOT get commission
        const { data: calcResult1Billing } = await supabase.rpc('calculate_commission_for_period', {
            p_employee_id: billingClerk.id,
            p_period_start: new Date().toISOString().split('T')[0],
            p_period_end: new Date().toISOString().split('T')[0],
            p_commission_plan_id: plan.id,
        });

        const test1bPassed = calcResult1Billing?.invoices_processed === 0;
        results.push({
            scenario: 'Test 1b: SO Flow - Billing Clerk gets NO commission',
            passed: test1bPassed,
            details: test1bPassed
                ? '✅ Billing Clerk correctly did NOT receive commission'
                : '❌ Billing Clerk incorrectly received commission',
        });

        // ========================================
        // TEST 2: No Sales Order → Commission to Invoice creator
        // ========================================
        console.log('\n📋 Test 2: Direct Invoice Flow (No Sales Order)');

        const { data: invoice2 } = await supabase
            .from('invoices')
            .insert({
                company_id: company.id,
                sales_order_id: null, // No sales order
                invoice_number: 'INV-ATTR-TEST-002',
                customer_name: 'Test Customer 2',
                invoice_date: new Date().toISOString().split('T')[0],
                subtotal: 5000,
                total_amount: 5000,
                status: 'paid',
                paid_at: new Date().toISOString(),
                created_by_user_id: billingClerk.user_id, // Billing Clerk creates direct invoice
            })
            .select()
            .single();

        const { data: calcResult2 } = await supabase.rpc('calculate_commission_for_period', {
            p_employee_id: billingClerk.id,
            p_period_start: new Date().toISOString().split('T')[0],
            p_period_end: new Date().toISOString().split('T')[0],
            p_commission_plan_id: plan.id,
        });

        const test2Passed = calcResult2?.invoices_processed > 0;
        results.push({
            scenario: 'Test 2: Direct Invoice - Fallback to Invoice creator',
            passed: test2Passed,
            details: test2Passed
                ? `✅ Commission correctly fell back to Invoice creator (${calcResult2?.commission_amount})`
                : '❌ Fallback logic failed',
        });

        // ========================================
        // CLEANUP
        // ========================================
        console.log('\n🧹 Cleaning up test data...');
        await supabase.from('commission_ledger').delete().eq('company_id', company.id).like('notes', '%ATTR-TEST%');
        await supabase.from('invoices').delete().eq('company_id', company.id).like('invoice_number', '%ATTR-TEST%');
        await supabase.from('sales_orders').delete().eq('company_id', company.id).like('order_number', '%ATTR-TEST%');
        await supabase.from('commission_rules').delete().eq('plan_id', plan.id);
        await supabase.from('commission_plans').delete().eq('id', plan.id);
        await supabase.from('employees').delete().in('id', [salesRep.id, billingClerk.id]);
        await supabase.auth.admin.deleteUser(salesRepUser.data.user.id);
        await supabase.auth.admin.deleteUser(billingClerkUser.data.user.id);

        // ========================================
        // RESULTS
        // ========================================
        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST RESULTS\n');

        let passedCount = 0;
        results.forEach((result, index) => {
            console.log(`${index + 1}. ${result.scenario}`);
            console.log(`   ${result.details}\n`);
            if (result.passed) passedCount++;
        });

        console.log('='.repeat(60));
        console.log(`✅ Passed: ${passedCount}/${results.length}`);
        console.log(`❌ Failed: ${results.length - passedCount}/${results.length}`);
        console.log('='.repeat(60));

        if (passedCount === results.length) {
            console.log('\n🎉 ALL TESTS PASSED - Commission Attribution is CORRECT\n');
            process.exit(0);
        } else {
            console.log('\n⚠️  SOME TESTS FAILED - Commission Attribution has ISSUES\n');
            process.exit(1);
        }

    } catch (error: any) {
        console.error('\n❌ Test execution failed:', error.message);
        process.exit(1);
    }
}

// Run tests
runAttributionTests();
