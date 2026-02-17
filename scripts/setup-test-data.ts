/**
 * COMMISSION SYSTEM - TEST DATA SETUP
 * Creates realistic test data for comprehensive testing
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface TestDataSummary {
    companies: number;
    employees: number;
    plans: number;
    invoices: number;
    creditNotes: number;
    accounts: number;
}

async function setupTestData() {
    console.log('🔧 Setting up test data for Commission System...\n');

    const summary: TestDataSummary = {
        companies: 0,
        employees: 0,
        plans: 0,
        invoices: 0,
        creditNotes: 0,
        accounts: 0,
    };

    try {
        // Get existing company
        const { data: company } = await supabase
            .from('companies')
            .select('id')
            .limit(1)
            .single();

        if (!company) {
            throw new Error('No company found. Please create a company first.');
        }

        console.log(`✓ Using company: ${company.id}`);
        summary.companies = 1;

        // Create test employees (50 for stress testing)
        console.log('\n📝 Creating test employees...');
        const employees = [];
        for (let i = 1; i <= 50; i++) {
            const { data: user } = await supabase.auth.admin.createUser({
                email: `test-employee-${i}@commission-test.local`,
                password: 'TestPassword123!',
                email_confirm: true,
            });

            if (user?.user) {
                const { data: employee } = await supabase
                    .from('employees')
                    .insert({
                        company_id: company.id,
                        user_id: user.user.id,
                        full_name: `Test Employee ${i}`,
                        email: `test-employee-${i}@commission-test.local`,
                        is_active: true,
                    })
                    .select()
                    .single();

                if (employee) {
                    employees.push(employee);
                    summary.employees++;
                }
            }
        }
        console.log(`✓ Created ${employees.length} test employees`);

        // Create commission plans
        console.log('\n📋 Creating commission plans...');

        // Plan 1: Flat 5%
        const { data: flatPlan } = await supabase
            .from('commission_plans')
            .insert({
                company_id: company.id,
                name: 'Test Plan - Flat 5%',
                type: 'flat_percent',
                basis: 'invoice_issuance',
                calculation_basis: 'after_discount',
                tier_type: 'progressive',
                handle_returns: 'auto_reverse',
                is_active: true,
            })
            .select()
            .single();

        if (flatPlan) {
            await supabase.from('commission_rules').insert({
                plan_id: flatPlan.id,
                min_amount: 0,
                max_amount: null,
                commission_rate: 5.0,
                fixed_amount: 0,
            });
            summary.plans++;
        }

        // Plan 2: Progressive Tiers
        const { data: progressivePlan } = await supabase
            .from('commission_plans')
            .insert({
                company_id: company.id,
                name: 'Test Plan - Progressive Tiers',
                type: 'tiered_revenue',
                basis: 'invoice_issuance',
                calculation_basis: 'after_discount',
                tier_type: 'progressive',
                handle_returns: 'auto_reverse',
                is_active: true,
            })
            .select()
            .single();

        if (progressivePlan) {
            await supabase.from('commission_rules').insert([
                { plan_id: progressivePlan.id, min_amount: 0, max_amount: 10000, commission_rate: 2.0 },
                { plan_id: progressivePlan.id, min_amount: 10000, max_amount: 25000, commission_rate: 3.5 },
                { plan_id: progressivePlan.id, min_amount: 25000, max_amount: 50000, commission_rate: 5.0 },
                { plan_id: progressivePlan.id, min_amount: 50000, max_amount: null, commission_rate: 7.0 },
            ]);
            summary.plans++;
        }

        // Plan 3: Slab Tiers
        const { data: slabPlan } = await supabase
            .from('commission_plans')
            .insert({
                company_id: company.id,
                name: 'Test Plan - Slab Tiers',
                type: 'tiered_revenue',
                basis: 'invoice_issuance',
                calculation_basis: 'after_discount',
                tier_type: 'slab',
                handle_returns: 'auto_reverse',
                is_active: true,
            })
            .select()
            .single();

        if (slabPlan) {
            await supabase.from('commission_rules').insert([
                { plan_id: slabPlan.id, min_amount: 0, max_amount: 10000, commission_rate: 2.0 },
                { plan_id: slabPlan.id, min_amount: 10000, max_amount: 25000, commission_rate: 4.0 },
                { plan_id: slabPlan.id, min_amount: 25000, max_amount: null, commission_rate: 6.0 },
            ]);
            summary.plans++;
        }

        console.log(`✓ Created ${summary.plans} commission plans`);

        // Create chart of accounts (if not exists)
        console.log('\n💰 Setting up chart of accounts...');
        const accounts = [
            { code: '6210', name: 'Commission Expense', type: 'expense' },
            { code: '2110', name: 'Commission Payable', type: 'liability' },
            { code: '1010', name: 'Bank Account', type: 'asset' },
        ];

        for (const acc of accounts) {
            const { error } = await supabase.from('chart_of_accounts').upsert({
                company_id: company.id,
                account_code: acc.code,
                account_name: acc.name,
                account_type: acc.type,
                is_active: true,
            }, { onConflict: 'company_id,account_code' });

            if (!error) summary.accounts++;
        }
        console.log(`✓ Created/verified ${summary.accounts} accounts`);

        // Create test invoices (3000+ for stress testing)
        console.log('\n📄 Creating test invoices (this may take a while)...');
        const invoiceBatches = 30; // 30 batches of 100 = 3000 invoices
        const invoicesPerBatch = 100;

        for (let batch = 0; batch < invoiceBatches; batch++) {
            const invoices = [];
            for (let i = 0; i < invoicesPerBatch; i++) {
                const employeeIndex = Math.floor(Math.random() * employees.length);
                const amount = Math.floor(Math.random() * 50000) + 1000; // 1000-51000
                const discount = Math.floor(amount * 0.1); // 10% discount
                const vat = Math.floor((amount - discount) * 0.15); // 15% VAT

                invoices.push({
                    company_id: company.id,
                    invoice_number: `INV-TEST-${batch * invoicesPerBatch + i + 1}`,
                    customer_name: `Test Customer ${i + 1}`,
                    invoice_date: new Date(2026, 0, Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
                    subtotal: amount,
                    discount_amount: discount,
                    vat_amount: vat,
                    total_amount: amount - discount + vat,
                    status: 'paid',
                    paid_at: new Date(2026, 0, Math.floor(Math.random() * 28) + 1).toISOString(),
                    created_by_user_id: employees[employeeIndex].user_id,
                });
            }

            const { error } = await supabase.from('invoices').insert(invoices);
            if (!error) {
                summary.invoices += invoices.length;
                console.log(`  ✓ Batch ${batch + 1}/${invoiceBatches} (${summary.invoices} invoices created)`);
            }
        }

        // Create credit notes (500+ for testing)
        console.log('\n📋 Creating test credit notes...');
        const { data: invoicesSample } = await supabase
            .from('invoices')
            .select('id, total_amount, company_id')
            .eq('company_id', company.id)
            .limit(500);

        if (invoicesSample) {
            const creditNotes = invoicesSample.map((inv, i) => ({
                company_id: inv.company_id,
                credit_note_number: `CN-TEST-${i + 1}`,
                invoice_id: inv.id,
                issue_date: new Date(2026, 0, Math.floor(Math.random() * 28) + 1).toISOString().split('T')[0],
                total_amount: Math.floor(inv.total_amount * (Math.random() * 0.5 + 0.1)), // 10-60% return
                status: 'approved',
            }));

            const { error } = await supabase.from('credit_notes').insert(creditNotes);
            if (!error) {
                summary.creditNotes = creditNotes.length;
            }
        }
        console.log(`✓ Created ${summary.creditNotes} credit notes`);

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('✅ TEST DATA SETUP COMPLETE');
        console.log('='.repeat(60));
        console.log(`Companies:     ${summary.companies}`);
        console.log(`Employees:     ${summary.employees}`);
        console.log(`Plans:         ${summary.plans}`);
        console.log(`Invoices:      ${summary.invoices}`);
        console.log(`Credit Notes:  ${summary.creditNotes}`);
        console.log(`Accounts:      ${summary.accounts}`);
        console.log('='.repeat(60));

        return summary;
    } catch (error: any) {
        console.error('❌ Error setting up test data:', error.message);
        throw error;
    }
}

// Run setup
setupTestData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
