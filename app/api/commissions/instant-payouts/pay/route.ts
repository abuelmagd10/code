import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

/**
 * POST /api/commissions/instant-payouts/pay
 * Pay instant commissions for selected employees
 * 
 * Request body:
 * - companyId: UUID
 * - employeeIds: UUID[]
 * - paymentAccountId: UUID
 * - paymentDate: DATE
 * - startDate: DATE
 * - endDate: DATE
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
        const {
            companyId,
            employeeIds,
            paymentAccountId,
            paymentDate,
            startDate,
            endDate
        } = body;

        if (!companyId || !employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
            return NextResponse.json(
                { error: 'Missing required parameters: companyId, employeeIds' },
                { status: 400 }
            );
        }

        if (!paymentAccountId || !paymentDate || !startDate || !endDate) {
            return NextResponse.json(
                { error: 'Missing required parameters: paymentAccountId, paymentDate, startDate, endDate' },
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
                { error: 'Forbidden: Only Owner/Admin can pay commissions' },
                { status: 403 }
            );
        }

        // Validate payment account exists and is cash/bank
        const { data: paymentAccount, error: accountError } = await supabase
            .from('chart_of_accounts')
            .select('id, account_type, sub_type')
            .eq('id', paymentAccountId)
            .eq('company_id', companyId)
            .single();

        if (accountError || !paymentAccount) {
            return NextResponse.json(
                { error: 'Invalid payment account' },
                { status: 400 }
            );
        }

        if (paymentAccount.account_type !== 'asset' || !['cash', 'bank'].includes(paymentAccount.sub_type)) {
            return NextResponse.json(
                { error: 'Payment account must be cash or bank account' },
                { status: 400 }
            );
        }

        // v3.74.45 — Enterprise rule: prevent cash overdraft on instant commission payout.
        // Sum scheduled commissions for selected employees in the period, then validate
        // against the cash/bank payment account.
        try {
            const { data: ledgerRows } = await supabase
                .from('commission_ledger')
                .select('commission_amount')
                .eq('company_id', companyId)
                .in('employee_id', employeeIds)
                .eq('payment_status', 'scheduled')
                .gte('created_at', startDate)
                .lte('created_at', `${endDate}T23:59:59`)
            const totalAmount = (ledgerRows || []).reduce((s: number, r: any) => s + Number(r.commission_amount || 0), 0)
            if (totalAmount > 0) {
                const { assertCashOutflowAllowed, CashOverdraftError } = await import("@/lib/accounting/cash-balance-validator")
                try {
                    await assertCashOutflowAllowed(supabase, {
                        accountId: paymentAccountId,
                        amount: totalAmount,
                        companyId,
                        description: `Instant commission payout for ${employeeIds.length} employee(s)`,
                    })
                } catch (e: any) {
                    if (e instanceof CashOverdraftError) {
                        return NextResponse.json({ error: e.message }, { status: 400 })
                    }
                    throw e
                }
            }
        } catch (ovErr: any) {
            if (ovErr?.name === "CashOverdraftError") {
                return NextResponse.json({ error: ovErr.message }, { status: 400 })
            }
            console.warn("[INSTANT_PAYOUTS] overdraft check warning:", ovErr?.message)
        }

        // Call RPC function to pay commissions
        const { data: paymentResults, error: payError } = await supabase
            .rpc('pay_instant_commissions', {
                p_company_id: companyId,
                p_employee_ids: employeeIds,
                p_payment_account_id: paymentAccountId,
                p_payment_date: paymentDate,
                p_start_date: startDate,
                p_end_date: endDate,
                p_user_id: user.id
            });

        if (payError) {
            console.error('Error paying commissions:', payError);
            return NextResponse.json(
                { error: 'Failed to pay commissions', details: payError.message },
                { status: 500 }
            );
        }

        const results = paymentResults || [];
        const totalAmount = results.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
        const totalCommissions = results.reduce((sum: number, r: any) => sum + Number(r.commissions_paid || 0), 0);

        return NextResponse.json({
            success: true,
            employeesPaid: results.length,
            totalAmount,
            totalCommissions,
            journalEntries: results.map((r: any) => ({
                employee_id: r.employee_id,
                amount: r.amount,
                journal_entry_id: r.journal_entry_id,
                commissions_paid: r.commissions_paid
            }))
        });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
