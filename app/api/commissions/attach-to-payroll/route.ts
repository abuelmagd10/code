import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

/**
 * POST /api/commissions/attach-to-payroll
 * Attach commission run to payroll run (for payroll mode only)
 * 
 * Request body:
 * - companyId: UUID
 * - commissionRunId: UUID
 * - payrollRunId: UUID
 * 
 * Security: Owner/Admin only
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { companyId, commissionRunId, payrollRunId } = body;

        if (!companyId || !commissionRunId || !payrollRunId) {
            return NextResponse.json(
                { error: 'Missing required parameters: companyId, commissionRunId, payrollRunId' },
                { status: 400 }
            );
        }

        // Check role (Owner/Admin only)
        const { data: companyMember } = await supabase
            .from('company_members')
            .select('role')
            .eq('company_id', companyId)
            .eq('user_id', user.id)
            .single();

        if (!companyMember || !['owner', 'admin'].includes(companyMember.role)) {
            return NextResponse.json(
                { error: 'Forbidden: Only Owner/Admin can attach commissions to payroll' },
                { status: 403 }
            );
        }

        // Validate commission run
        const { data: commissionRun, error: runError } = await supabase
            .from('commission_runs')
            .select('id, status, payroll_run_id, commission_plans(payout_mode)')
            .eq('id', commissionRunId)
            .eq('company_id', companyId)
            .single();

        if (runError || !commissionRun) {
            return NextResponse.json(
                { error: 'Commission run not found' },
                { status: 404 }
            );
        }

        // Validate status
        if (!['posted', 'paid'].includes(commissionRun.status)) {
            return NextResponse.json(
                { error: 'Commission run must be posted or paid before attaching to payroll' },
                { status: 400 }
            );
        }

        // Check if already attached
        if (commissionRun.payroll_run_id) {
            return NextResponse.json(
                { error: 'Commission run already attached to payroll' },
                { status: 400 }
            );
        }

        // Validate payroll run exists
        const { data: payrollRun, error: payrollError } = await supabase
            .from('payroll_runs')
            .select('id')
            .eq('id', payrollRunId)
            .eq('company_id', companyId)
            .single();

        if (payrollError || !payrollRun) {
            return NextResponse.json(
                { error: 'Payroll run not found' },
                { status: 404 }
            );
        }

        // Get commission ledger entries for this run
        const { data: ledgerEntries, error: ledgerError } = await supabase
            .from('commission_ledger')
            .select('employee_id, commission_amount')
            .eq('commission_run_id', commissionRunId)
            .eq('company_id', companyId);

        if (ledgerError) {
            console.error('Error fetching ledger entries:', ledgerError);
            return NextResponse.json(
                { error: 'Failed to fetch commission ledger' },
                { status: 500 }
            );
        }

        // Aggregate commissions by employee
        const employeeCommissions = (ledgerEntries || []).reduce((acc: any, entry: any) => {
            const empId = entry.employee_id;
            if (!acc[empId]) {
                acc[empId] = 0;
            }
            acc[empId] += Number(entry.commission_amount || 0);
            return acc;
        }, {});

        // Update payslips
        let employeesUpdated = 0;
        let totalCommissionAdded = 0;

        for (const [employeeId, commissionAmount] of Object.entries(employeeCommissions)) {
            const amount = Number(commissionAmount);
            if (amount === 0) continue;

            // Get current payslip
            const { data: payslip } = await supabase
                .from('payslips')
                .select('sales_bonus, base_salary, allowances, bonuses, advances, insurance, deductions')
                .eq('payroll_run_id', payrollRunId)
                .eq('employee_id', employeeId)
                .single();

            if (payslip) {
                const newSalesBonus = Number(payslip.sales_bonus || 0) + amount;
                const newNetSalary = Number(payslip.base_salary || 0)
                    + Number(payslip.allowances || 0)
                    + Number(payslip.bonuses || 0)
                    + newSalesBonus
                    - Number(payslip.advances || 0)
                    - Number(payslip.insurance || 0)
                    - Number(payslip.deductions || 0);

                await supabase
                    .from('payslips')
                    .update({
                        sales_bonus: newSalesBonus,
                        net_salary: newNetSalary
                    })
                    .eq('payroll_run_id', payrollRunId)
                    .eq('employee_id', employeeId);

                employeesUpdated++;
                totalCommissionAdded += amount;
            }
        }

        // Link commission run to payroll run
        await supabase
            .from('commission_runs')
            .update({ payroll_run_id: payrollRunId })
            .eq('id', commissionRunId);

        return NextResponse.json({
            success: true,
            employeesUpdated,
            totalCommissionAdded,
            message: `Successfully attached commission run to payroll`
        });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
