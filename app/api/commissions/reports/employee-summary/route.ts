import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/commissions/reports/employee-summary
 * Get commission summary by employee
 */
export async function GET(request: Request) {
    try {
        const supabase = await createClient();

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

        let query = supabase
            .from('v_commission_summary_by_employee')
            .select('*')
            .eq('company_id', employee.company_id);

        if (runId) {
            query = query.eq('commission_run_id', runId);
        }

        if (employeeId) {
            query = query.eq('employee_id', employeeId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching summary:', error);
            return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
        }

        return NextResponse.json({ summary: data });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
