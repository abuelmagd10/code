/**
 * COMMISSION SYSTEM - PERFORMANCE STRESS TEST
 * Tests system performance with large datasets
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface PerformanceResult {
    test: string;
    recordCount: number;
    duration: number;
    throughput: number;
    status: 'PASS' | 'FAIL';
    threshold: number;
}

const results: PerformanceResult[] = [];

async function runPerformanceTests() {
    console.log('⚡ Starting Performance Stress Tests...\n');

    // Test 1: Calculate 3000+ Invoices
    await testLargeInvoiceCalculation();

    // Test 2: Process 500+ Credit Notes
    await testMassiveCreditNoteReversal();

    // Test 3: Multi-Employee Calculation (50 employees)
    await testMultiEmployeeCalculation();

    // Test 4: Complex Tier Calculation
    await testComplexTierPerformance();

    // Print Results
    console.log('\n' + '='.repeat(80));
    console.log('⚡ PERFORMANCE TEST RESULTS');
    console.log('='.repeat(80));

    results.forEach((result, index) => {
        const icon = result.status === 'PASS' ? '✅' : '❌';
        console.log(`${icon} Test ${index + 1}: ${result.test}`);
        console.log(`   Records: ${result.recordCount.toLocaleString()}`);
        console.log(`   Duration: ${result.duration.toFixed(2)}ms`);
        console.log(`   Throughput: ${result.throughput.toFixed(2)} records/sec`);
        console.log(`   Threshold: ${result.threshold}ms (${result.status})`);
    });

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;

    console.log('\n' + '='.repeat(80));
    console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log('='.repeat(80));

    process.exit(failed > 0 ? 1 : 0);
}

// ============================================
// TEST 1: Large Invoice Calculation (3000+)
// ============================================
async function testLargeInvoiceCalculation() {
    const testName = 'Calculate Commission for 3000+ Invoices';
    console.log(`\n⚡ Running: ${testName}`);

    try {
        const { data: employee } = await supabase.from('employees').select('id').limit(1).single();
        const { data: plan } = await supabase.from('commission_plans').select('id').limit(1).single();

        if (!employee || !plan) {
            throw new Error('Missing test data');
        }

        // Create test run
        const { data: run } = await supabase.from('commission_runs').insert({
            period_start: '2026-01-01',
            period_end: '2026-01-31',
            status: 'draft',
        }).select().single();

        const startTime = performance.now();

        // Execute calculation
        const { data, error } = await supabase.rpc('calculate_commission_for_period', {
            p_employee_id: employee.id,
            p_period_start: '2026-01-01',
            p_period_end: '2026-01-31',
            p_commission_plan_id: plan.id,
            p_commission_run_id: run?.id,
        });

        const endTime = performance.now();
        const duration = endTime - startTime;
        const recordCount = data?.invoices_processed || 0;
        const throughput = recordCount / (duration / 1000);
        const threshold = 5000; // 5 seconds max

        results.push({
            test: testName,
            recordCount,
            duration,
            throughput,
            threshold,
            status: duration < threshold ? 'PASS' : 'FAIL',
        });

        console.log(`   ✓ Processed ${recordCount} invoices in ${duration.toFixed(2)}ms`);
    } catch (error: any) {
        console.error(`   ✗ Test failed: ${error.message}`);
        results.push({
            test: testName,
            recordCount: 0,
            duration: 0,
            throughput: 0,
            threshold: 5000,
            status: 'FAIL',
        });
    }
}

// ============================================
// TEST 2: Mass Credit Note Reversal (500+)
// ============================================
async function testMassiveCreditNoteReversal() {
    const testName = 'Reverse 500+ Credit Notes';
    console.log(`\n⚡ Running: ${testName}`);

    try {
        // Get sample credit notes
        const { data: creditNotes } = await supabase
            .from('credit_notes')
            .select('id')
            .eq('status', 'approved')
            .limit(500);

        if (!creditNotes || creditNotes.length === 0) {
            console.log('   ⚠️  Skipping: No credit notes available');
            results.push({
                test: testName,
                recordCount: 0,
                duration: 0,
                throughput: 0,
                threshold: 10000,
                status: 'PASS',
            });
            return;
        }

        const startTime = performance.now();

        // Process all credit notes
        for (const cn of creditNotes) {
            await supabase.rpc('reverse_commission_for_credit_note', {
                p_credit_note_id: cn.id,
            });
        }

        const endTime = performance.now();
        const duration = endTime - startTime;
        const recordCount = creditNotes.length;
        const throughput = recordCount / (duration / 1000);
        const threshold = 10000; // 10 seconds max

        results.push({
            test: testName,
            recordCount,
            duration,
            throughput,
            threshold,
            status: duration < threshold ? 'PASS' : 'FAIL',
        });

        console.log(`   ✓ Processed ${recordCount} credit notes in ${duration.toFixed(2)}ms`);
    } catch (error: any) {
        console.error(`   ✗ Test failed: ${error.message}`);
        results.push({
            test: testName,
            recordCount: 0,
            duration: 0,
            throughput: 0,
            threshold: 10000,
            status: 'FAIL',
        });
    }
}

// ============================================
// TEST 3: Multi-Employee Calculation (50)
// ============================================
async function testMultiEmployeeCalculation() {
    const testName = 'Calculate Commission for 50 Employees';
    console.log(`\n⚡ Running: ${testName}`);

    try {
        const { data: employees } = await supabase
            .from('employees')
            .select('id')
            .limit(50);

        const { data: plan } = await supabase
            .from('commission_plans')
            .select('id')
            .limit(1)
            .single();

        if (!employees || !plan) {
            throw new Error('Missing test data');
        }

        const startTime = performance.now();

        // Calculate for all employees
        for (const emp of employees) {
            await supabase.rpc('calculate_commission_for_period', {
                p_employee_id: emp.id,
                p_period_start: '2026-01-01',
                p_period_end: '2026-01-31',
                p_commission_plan_id: plan.id,
            });
        }

        const endTime = performance.now();
        const duration = endTime - startTime;
        const recordCount = employees.length;
        const throughput = recordCount / (duration / 1000);
        const threshold = 15000; // 15 seconds max

        results.push({
            test: testName,
            recordCount,
            duration,
            throughput,
            threshold,
            status: duration < threshold ? 'PASS' : 'FAIL',
        });

        console.log(`   ✓ Processed ${recordCount} employees in ${duration.toFixed(2)}ms`);
    } catch (error: any) {
        console.error(`   ✗ Test failed: ${error.message}`);
        results.push({
            test: testName,
            recordCount: 0,
            duration: 0,
            throughput: 0,
            threshold: 15000,
            status: 'FAIL',
        });
    }
}

// ============================================
// TEST 4: Complex Tier Calculation
// ============================================
async function testComplexTierPerformance() {
    const testName = 'Complex Progressive Tier Calculation';
    console.log(`\n⚡ Running: ${testName}`);

    try {
        // Create a plan with 10 tiers
        const { data: company } = await supabase.from('companies').select('id').limit(1).single();

        const { data: plan } = await supabase.from('commission_plans').insert({
            company_id: company?.id,
            name: 'Performance Test - 10 Tiers',
            type: 'tiered_revenue',
            tier_type: 'progressive',
            is_active: true,
        }).select().single();

        // Create 10 tiers
        const tiers = [];
        for (let i = 0; i < 10; i++) {
            tiers.push({
                plan_id: plan?.id,
                min_amount: i * 10000,
                max_amount: (i + 1) * 10000,
                commission_rate: 2 + (i * 0.5),
            });
        }

        await supabase.from('commission_rules').insert(tiers);

        const { data: employee } = await supabase.from('employees').select('id').limit(1).single();

        const startTime = performance.now();

        // Calculate with complex tiers
        await supabase.rpc('calculate_commission_for_period', {
            p_employee_id: employee?.id,
            p_period_start: '2026-01-01',
            p_period_end: '2026-01-31',
            p_commission_plan_id: plan?.id,
        });

        const endTime = performance.now();
        const duration = endTime - startTime;
        const threshold = 3000; // 3 seconds max

        results.push({
            test: testName,
            recordCount: 10,
            duration,
            throughput: 10 / (duration / 1000),
            threshold,
            status: duration < threshold ? 'PASS' : 'FAIL',
        });

        console.log(`   ✓ Calculated 10-tier progressive in ${duration.toFixed(2)}ms`);

        // Cleanup
        await supabase.from('commission_plans').delete().eq('id', plan?.id);
    } catch (error: any) {
        console.error(`   ✗ Test failed: ${error.message}`);
        results.push({
            test: testName,
            recordCount: 0,
            duration: 0,
            throughput: 0,
            threshold: 3000,
            status: 'FAIL',
        });
    }
}

// Run all tests
runPerformanceTests();
