import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * POST /api/commissions/runs/[id]/approve
 * Approve a commission run (transition: draft/reviewed → approved)
 * 
 * Security: Admin/Finance only
 */
export async function POST(
    request: Request,
    { params }: { params: { id: string } }
) {
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

        // Check role
        const { data: companyMember } = await supabase
            .from('company_members')
            .select('role')
            .eq('company_id', employee.company_id)
            .eq('user_id', user.id)
            .single();

        if (!companyMember || !['owner', 'admin', 'finance'].includes(companyMember.role)) {
            return NextResponse.json(
                { error: 'Forbidden: Only Admin/Finance can approve runs' },
                { status: 403 }
            );
        }

        // Update run status
        const { data: run, error } = await supabase
            .from('commission_runs')
            .update({
                status: 'approved',
                approved_by: user.id,
                approved_at: new Date().toISOString(),
            })
            .eq('id', params.id)
            .eq('company_id', employee.company_id)
            .select()
            .single();

        if (error) {
            console.error('Error approving run:', error);
            return NextResponse.json({ error: 'Failed to approve run' }, { status: 500 });
        }

        return NextResponse.json({ run });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
