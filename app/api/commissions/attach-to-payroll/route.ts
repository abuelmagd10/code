import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

/**
 * POST /api/commissions/attach-to-payroll
 * Attach a commission run to a payroll run: the commission is added to each
 * employee's payslip as sales_bonus and the net salary is recomputed.
 *
 * Request body: companyId, commissionRunId, payrollRunId
 * Security: Owner/Admin only
 *
 * v3.74.849 — this route had THREE defects and never worked:
 *
 *   1. It read `commission_runs.payroll_run_id`, a column that did not exist,
 *      so the very first SELECT failed and the route answered "Commission run
 *      not found" for a run that was sitting right there.
 *
 *   2. It also selected `commission_plans(payout_mode)`, another phantom - and
 *      nothing in the route ever used the value.
 *
 *   3. Its net-salary formula omitted `commission` and
 *      `commission_advance_deducted`. Even had the reads worked, the payslip it
 *      wrote would not balance, and post_payroll_atomic would then refuse the
 *      whole payroll with PAYSLIP_IMBALANCE.
 *
 * The work now happens inside commission_attach_to_payroll_atomic, in one
 * transaction, for a reason that matters: the old code updated every payslip
 * FIRST and recorded the link LAST. Anything failing in between left the raise
 * applied with nothing to record that it had been - so pressing the button
 * again added the commission a second time. The RPC locks the run, CLAIMS the
 * link, and only then touches payslips; a second call returns idempotent, and a
 * database trigger refuses to re-point the link at a different payroll run.
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

        const { data, error } = await supabase.rpc('commission_attach_to_payroll_atomic', {
            p_company_id: companyId,
            p_commission_run_id: commissionRunId,
            p_payroll_run_id: payrollRunId,
        });

        if (error) {
            const msg = error.message || '';
            // The database speaks in codes; the user is owed a sentence.
            if (msg.includes('RUN_NOT_FOUND')) {
                return NextResponse.json({ error: 'دفعة العمولات غير موجودة' }, { status: 404 });
            }
            if (msg.includes('PAYROLL_NOT_FOUND')) {
                return NextResponse.json({ error: 'دفعة المرتبات غير موجودة' }, { status: 404 });
            }
            if (msg.includes('ALREADY_ATTACHED')) {
                return NextResponse.json({
                    error: 'دفعة العمولات مرتبطة بالفعل بدفعة مرتبات أخرى — لا يمكن ربطها مرتين، فذلك يضيف العمولة إلى المرتب مرة ثانية.',
                }, { status: 400 });
            }
            if (msg.includes('BAD_STATUS')) {
                return NextResponse.json({
                    error: 'يجب ترحيل دفعة العمولات أو صرفها قبل ربطها بالمرتبات.',
                }, { status: 400 });
            }
            console.error('[commissions/attach-to-payroll]', msg);
            return NextResponse.json({ error: 'تعذّر ربط العمولات بالمرتبات', details: msg }, { status: 500 });
        }

        const result = (data || {}) as any;

        return NextResponse.json({
            success: true,
            idempotent: !!result.idempotent,
            employeesUpdated: Number(result.employeesUpdated || 0),
            totalCommissionAdded: Number(result.totalCommissionAdded || 0),
            message: result.message || 'تم ربط دفعة العمولات بالمرتبات',
        });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
