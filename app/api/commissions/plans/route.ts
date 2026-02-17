import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * GET /api/commissions/plans
 * List all commission plans for the current company
 * 
 * Security: All authenticated users can view
 */
export async function GET(request: Request) {
    try {
        const supabase = await createClient();

        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user's company
        const { data: employee } = await supabase
            .from('employees')
            .select('company_id')
            .eq('user_id', user.id)
            .single();

        if (!employee) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        // Fetch commission plans with rules
        const { data: plans, error } = await supabase
            .from('commission_plans')
            .select(`
        *,
        commission_rules (
          id,
          min_amount,
          max_amount,
          commission_rate,
          fixed_amount,
          created_at
        )
      `)
            .eq('company_id', employee.company_id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching commission plans:', error);
            return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 });
        }

        return NextResponse.json({ plans });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/commissions/plans
 * Create or update a commission plan
 * 
 * Security: OWNER ONLY
 */
export async function POST(request: Request) {
    try {
        const supabase = await createClient();

        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user's company and role
        const { data: employee } = await supabase
            .from('employees')
            .select('company_id, user_id')
            .eq('user_id', user.id)
            .single();

        if (!employee) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        // Check if user is owner
        const { data: companyMember } = await supabase
            .from('company_members')
            .select('role')
            .eq('company_id', employee.company_id)
            .eq('user_id', user.id)
            .single();

        if (!companyMember || companyMember.role !== 'owner') {
            return NextResponse.json(
                { error: 'Forbidden: Only owners can create/modify commission plans' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { id, name, type, basis, calculation_basis, tier_type, handle_returns, description, is_active, rules } = body;

        // Validate required fields
        if (!name || !type || !basis) {
            return NextResponse.json(
                { error: 'Missing required fields: name, type, basis' },
                { status: 400 }
            );
        }

        let planId = id;

        if (id) {
            // UPDATE existing plan
            const { error: updateError } = await supabase
                .from('commission_plans')
                .update({
                    name,
                    type,
                    basis,
                    calculation_basis,
                    tier_type,
                    handle_returns,
                    description,
                    is_active,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id)
                .eq('company_id', employee.company_id);

            if (updateError) {
                console.error('Error updating plan:', updateError);
                return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
            }

            // Delete old rules
            await supabase
                .from('commission_rules')
                .delete()
                .eq('plan_id', id);
        } else {
            // CREATE new plan
            const { data: newPlan, error: createError } = await supabase
                .from('commission_plans')
                .insert({
                    company_id: employee.company_id,
                    name,
                    type,
                    basis,
                    calculation_basis,
                    tier_type,
                    handle_returns,
                    description,
                    is_active,
                })
                .select()
                .single();

            if (createError) {
                console.error('Error creating plan:', createError);
                return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 });
            }

            planId = newPlan.id;
        }

        // Insert new rules
        if (rules && rules.length > 0) {
            const rulesData = rules.map((rule: any) => ({
                plan_id: planId,
                min_amount: rule.min_amount,
                max_amount: rule.max_amount,
                commission_rate: rule.commission_rate,
                fixed_amount: rule.fixed_amount || 0,
            }));

            const { error: rulesError } = await supabase
                .from('commission_rules')
                .insert(rulesData);

            if (rulesError) {
                console.error('Error creating rules:', rulesError);
                return NextResponse.json({ error: 'Failed to create rules' }, { status: 500 });
            }
        }

        // Fetch the complete plan with rules
        const { data: completePlan } = await supabase
            .from('commission_plans')
            .select(`
        *,
        commission_rules (*)
      `)
            .eq('id', planId)
            .single();

        return NextResponse.json({ plan: completePlan }, { status: id ? 200 : 201 });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/commissions/plans
 * Soft delete a commission plan
 * 
 * Security: OWNER ONLY
 */
export async function DELETE(request: Request) {
    try {
        const supabase = await createClient();

        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get user's company and role
        const { data: employee } = await supabase
            .from('employees')
            .select('company_id')
            .eq('user_id', user.id)
            .single();

        if (!employee) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        // Check if user is owner
        const { data: companyMember } = await supabase
            .from('company_members')
            .select('role')
            .eq('company_id', employee.company_id)
            .eq('user_id', user.id)
            .single();

        if (!companyMember || companyMember.role !== 'owner') {
            return NextResponse.json(
                { error: 'Forbidden: Only owners can delete commission plans' },
                { status: 403 }
            );
        }

        const { searchParams } = new URL(request.url);
        const planId = searchParams.get('id');

        if (!planId) {
            return NextResponse.json({ error: 'Missing plan ID' }, { status: 400 });
        }

        // Soft delete (set is_active to false)
        const { error } = await supabase
            .from('commission_plans')
            .update({ is_active: false })
            .eq('id', planId)
            .eq('company_id', employee.company_id);

        if (error) {
            console.error('Error deleting plan:', error);
            return NextResponse.json({ error: 'Failed to delete plan' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
