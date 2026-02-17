import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * POST /api/commissions/runs/[id]/post
 * Post commission run to General Ledger
 * 
 * Security: Finance only
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

        // Check role - FINANCE ONLY
        const { data: companyMember } = await supabase
            .from('company_members')
            .select('role')
            .eq('company_id', employee.company_id)
            .eq('user_id', user.id)
            .single();

        if (!companyMember || !['owner', 'finance'].includes(companyMember.role)) {
            return NextResponse.json(
                { error: 'Forbidden: Only Finance can post commission runs' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { expense_account_id, payable_account_id } = body;

        if (!expense_account_id || !payable_account_id) {
            return NextResponse.json(
                { error: 'Missing required fields: expense_account_id, payable_account_id' },
                { status: 400 }
            );
        }

        // Call RPC function
        const { data, error } = await supabase.rpc('post_commission_run_atomic', {
            p_commission_run_id: params.id,
            p_expense_account_id: expense_account_id,
            p_payable_account_id: payable_account_id,
            p_user_id: user.id,
        });

        if (error) {
            console.error('Error posting run:', error);
            return NextResponse.json(
                { error: error.message || 'Failed to post run' },
                { status: 500 }
            );
        }

        return NextResponse.json({ result: data });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
