import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * POST /api/commissions/runs/[id]/pay
 * Record commission payment
 * 
 * Security: Owner/Finance only
 */
export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = createRouteHandlerClient({ cookies });

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: employee } = await supabase
            .from('employees')
            .select('company_id')
            .eq('user_id', user.id)
            .single();

        if (!employee) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        // Check role - OWNER/FINANCE ONLY
        const { data: companyMember } = await supabase
            .from('company_members')
            .select('role')
            .eq('company_id', employee.company_id)
            .eq('user_id', user.id)
            .single();

        if (!companyMember || !['owner', 'finance'].includes(companyMember.role)) {
            return NextResponse.json(
                { error: 'Forbidden: Only Owner/Finance can record commission payments' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { payment_date, payment_method, payment_account_id, reference_number, notes } = body;

        if (!payment_date || !payment_method || !payment_account_id) {
            return NextResponse.json(
                { error: 'Missing required fields: payment_date, payment_method, payment_account_id' },
                { status: 400 }
            );
        }

        // Get run details
        const { data: run, error: runError } = await supabase
            .from('commission_runs')
            .select('*')
            .eq('id', params.id)
            .eq('company_id', employee.company_id)
            .single();

        if (runError || !run) {
            return NextResponse.json({ error: 'Commission run not found' }, { status: 404 });
        }

        // Validate state
        if (run.status !== 'posted') {
            return NextResponse.json(
                { error: `Cannot pay run in ${run.status} status. Run must be posted first.` },
                { status: 400 }
            );
        }

        // Update run status
        const { error: updateError } = await supabase
            .from('commission_runs')
            .update({
                status: 'paid',
                paid_by: user.id,
                paid_at: new Date().toISOString(),
                notes: notes || run.notes
            })
            .eq('id', params.id);

        if (updateError) {
            console.error('Error updating run:', updateError);
            return NextResponse.json({ error: 'Failed to update run status' }, { status: 500 });
        }

        // TODO: Create payment journal entry
        // This should debit Commission Payable and credit Bank/Cash
        // For now, we just update the status

        return NextResponse.json({
            success: true,
            message: 'Payment recorded successfully'
        });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

