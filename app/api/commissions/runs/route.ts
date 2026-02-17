import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * GET /api/commissions/runs
 * List all commission runs for the current company
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

        // Fetch runs with summary
        const { data: runs, error } = await supabase
            .from('commission_runs')
            .select('*')
            .eq('company_id', employee.company_id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching runs:', error);
            return NextResponse.json({ error: 'Failed to fetch runs' }, { status: 500 });
        }

        return NextResponse.json({ runs });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/commissions/runs/calculate
 * Trigger commission calculation for a period
 * 
 * Security: Admin/Finance can trigger
 */
export async function POST(request: Request) {
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

        // Check role (Admin or Finance)
        const { data: companyMember } = await supabase
            .from('company_members')
            .select('role')
            .eq('company_id', employee.company_id)
            .eq('user_id', user.id)
            .single();

        if (!companyMember || !['owner', 'admin', 'finance'].includes(companyMember.role)) {
            return NextResponse.json(
                { error: 'Forbidden: Only Admin/Finance can trigger calculations' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { period_start, period_end, employee_ids, plan_id } = body;

        if (!period_start || !period_end || !plan_id) {
            return NextResponse.json(
                { error: 'Missing required fields: period_start, period_end, plan_id' },
                { status: 400 }
            );
        }

        // Create commission run
        const { data: run, error: runError } = await supabase
            .from('commission_runs')
            .insert({
                company_id: employee.company_id,
                period_start,
                period_end,
                status: 'draft',
                created_by: user.id,
            })
            .select()
            .single();

        if (runError) {
            console.error('Error creating run:', runError);
            return NextResponse.json({ error: 'Failed to create run' }, { status: 500 });
        }

        // Calculate for each employee
        const results = [];
        const targetEmployees = employee_ids || [];

        // If no specific employees, get all active employees
        if (targetEmployees.length === 0) {
            const { data: allEmployees } = await supabase
                .from('employees')
                .select('id')
                .eq('company_id', employee.company_id)
                .eq('is_active', true);

            if (allEmployees) {
                targetEmployees.push(...allEmployees.map(e => e.id));
            }
        }

        for (const empId of targetEmployees) {
            const { data, error } = await supabase.rpc('calculate_commission_for_period', {
                p_employee_id: empId,
                p_period_start: period_start,
                p_period_end: period_end,
                p_commission_plan_id: plan_id,
                p_commission_run_id: run.id,
            });

            results.push({
                employee_id: empId,
                success: !error,
                data,
                error: error?.message,
            });
        }

        return NextResponse.json({
            run,
            results,
            summary: {
                total_employees: targetEmployees.length,
                successful: results.filter(r => r.success).length,
                failed: results.filter(r => !r.success).length,
            },
        });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
