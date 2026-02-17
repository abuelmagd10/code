import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * GET /api/commissions/reports/ledger
 * Get commission ledger entries
 */
export async function GET(request: Request) {
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

        const { searchParams } = new URL(request.url);
        const runId = searchParams.get('run_id');
        const employeeId = searchParams.get('employee_id');
        const status = searchParams.get('status');

        let query = supabase
            .from('commission_ledger')
            .select(`
        *,
        employee:employees(id, full_name, email),
        commission_plan:commission_plans(id, name, type),
        commission_run:commission_runs(id, period_start, period_end, status)
      `)
            .eq('company_id', employee.company_id)
            .order('transaction_date', { ascending: false });

        if (runId) {
            query = query.eq('commission_run_id', runId);
        }

        if (employeeId) {
            query = query.eq('employee_id', employeeId);
        }

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching ledger:', error);
            return NextResponse.json({ error: 'Failed to fetch ledger' }, { status: 500 });
        }

        return NextResponse.json({ ledger: data });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
