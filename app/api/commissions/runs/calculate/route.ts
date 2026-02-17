import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'

/**
 * POST /api/commissions/runs/calculate
 * 
 * Calculate commission for a period
 * Creates a new commission run in "draft" status
 * 
 * CRITICAL: All calculations happen in backend RPC
 */

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()

        // Check authentication
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Get active company
        const companyId = await getActiveCompanyId(supabase)
        if (!companyId) {
            return NextResponse.json(
                { error: 'No active company' },
                { status: 400 }
            )
        }

        // Parse request body
        const body = await request.json()
        const { period_start, period_end, plan_ids } = body

        // Validate inputs
        if (!period_start || !period_end || !plan_ids || !Array.isArray(plan_ids) || plan_ids.length === 0) {
            return NextResponse.json(
                { error: 'Missing required fields: period_start, period_end, plan_ids' },
                { status: 400 }
            )
        }

        // Validate period
        if (period_end < period_start) {
            return NextResponse.json(
                { error: 'Period end must be after period start' },
                { status: 400 }
            )
        }

        // Validate period is not in future
        const today = new Date().toISOString().split('T')[0]
        if (period_end > today) {
            return NextResponse.json(
                { error: 'Period cannot be in the future' },
                { status: 400 }
            )
        }

        // Check for overlapping runs
        const { data: existingRuns, error: overlapError } = await supabase
            .from('commission_runs')
            .select('id')
            .eq('company_id', companyId)
            .or(`and(period_start.lte.${period_end},period_end.gte.${period_start})`)
            .neq('status', 'cancelled')

        if (overlapError) {
            console.error('Error checking overlapping runs:', overlapError)
            return NextResponse.json(
                { error: 'Failed to validate period' },
                { status: 500 }
            )
        }

        if (existingRuns && existingRuns.length > 0) {
            return NextResponse.json(
                { error: 'A commission run already exists for this period' },
                { status: 400 }
            )
        }

        // Validate all plans exist and are active
        const { data: plans, error: plansError } = await supabase
            .from('commission_plans')
            .select('id, name, is_active')
            .eq('company_id', companyId)
            .in('id', plan_ids)

        if (plansError) {
            console.error('Error fetching plans:', plansError)
            return NextResponse.json(
                { error: 'Failed to validate plans' },
                { status: 500 }
            )
        }

        if (!plans || plans.length !== plan_ids.length) {
            return NextResponse.json(
                { error: 'One or more plans not found' },
                { status: 400 }
            )
        }

        const inactivePlans = plans.filter(p => !p.is_active)
        if (inactivePlans.length > 0) {
            return NextResponse.json(
                { error: `Inactive plans cannot be used: ${inactivePlans.map(p => p.name).join(', ')}` },
                { status: 400 }
            )
        }

        // Create commission run
        const { data: run, error: runError } = await supabase
            .from('commission_runs')
            .insert({
                company_id: companyId,
                period_start,
                period_end,
                status: 'draft',
                created_by: user.id,
                total_commission: 0,
                total_clawbacks: 0,
                net_commission: 0
            })
            .select()
            .single()

        if (runError) {
            console.error('Error creating run:', runError)
            return NextResponse.json(
                { error: 'Failed to create commission run' },
                { status: 500 }
            )
        }

        // Call RPC to calculate commissions for each plan
        // This will populate commission_ledger entries
        let totalCommission = 0
        let totalClawbacks = 0

        for (const planId of plan_ids) {
            // Get all employees
            const { data: employees, error: empError } = await supabase
                .from('employees')
                .select('id')
                .eq('company_id', companyId)
                .eq('is_active', true)

            if (empError) {
                console.error('Error fetching employees:', empError)
                continue
            }

            // Calculate commission for each employee
            for (const employee of employees || []) {
                try {
                    const { data: result, error: calcError } = await supabase.rpc(
                        'calculate_commission_for_period',
                        {
                            p_employee_id: employee.id,
                            p_period_start: period_start,
                            p_period_end: period_end,
                            p_commission_plan_id: planId,
                            p_commission_run_id: run.id
                        }
                    )

                    if (calcError) {
                        console.error('Calculation error:', calcError)
                        continue
                    }

                    if (result) {
                        totalCommission += Number(result.total_commission || 0)
                        totalClawbacks += Number(result.total_clawbacks || 0)
                    }
                } catch (err) {
                    console.error('Error calculating commission:', err)
                }
            }
        }

        // Update run totals
        const netCommission = totalCommission - totalClawbacks

        const { error: updateError } = await supabase
            .from('commission_runs')
            .update({
                total_commission: totalCommission,
                total_clawbacks: totalClawbacks,
                net_commission: netCommission
            })
            .eq('id', run.id)

        if (updateError) {
            console.error('Error updating run totals:', updateError)
        }

        return NextResponse.json({
            success: true,
            run_id: run.id,
            total_commission: totalCommission,
            total_clawbacks: totalClawbacks,
            net_commission: netCommission
        })
    } catch (error: any) {
        console.error('Unexpected error:', error)
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}
