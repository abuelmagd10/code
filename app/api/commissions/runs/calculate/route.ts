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
        //
        // v3.75.83 — **حسابٌ لم يقعْ لا يُكتَبُ صفراً ويُسمّى نجاحاً.**
        // قِيسَ يومَ ٢٢ أغسطس ٢٠٢٦ أنَّ `calculate_commission_for_period`
        // **لا وجودَ لها فى قاعدةِ الإنتاجِ أصلاً** — لا بهذا الاسمِ ولا بغيرِه من
        // أسماءِ العمولات. فكلُّ نداءٍ هنا كان يفشلُ، ويُقفَزُ عنه بـ`continue`،
        // ثمّ تُكتَبُ فى `commission_runs` مبالغُ **صفر** وتعودُ الاستجابةُ
        // `success: true`. أى أنَّ الشاشةَ تقولُ «حُسبت العمولات» ورقمُها صفرٌ
        // مكتوبٌ فى جدولِ مال. **ورقمٌ كاذبٌ فى جدولِ مالٍ أسوأُ من خطأٍ ظاهر.**
        //
        // فيُعَدُّ الآنَ ما نجحَ وما سقط:
        //   • سقطَ الكلُّ ولم ينجحْ شىء ⇐ **تُمحى دورةُ العمولةِ التى أُنشئت فى هذا
        //     الطلبِ نفسِه** (ولم يُكتَبْ لها سطرٌ واحدٌ فى الدفتر)، ويعودُ الخطأُ
        //     صريحاً. ولولا المحوُ لبقيتْ دورةٌ فارغةٌ تمنعُ كلَّ محاولةٍ تالية
        //     بحجّةِ «توجد دورةٌ لهذه الفترة» — فيصيرُ الفشلُ حاجزاً دائماً.
        //   • نجحَ بعضٌ وسقطَ بعضٌ ⇐ يُكتَبُ ما نجحَ **ولا يُقالُ نجاح**، ويُسمّى
        //     العددُ الساقطُ وأوّلُ سببٍ له.
        //
        // ولم يُبْنَ محرّكُ الحسابِ هنا: بناءُ دالّةِ عمولاتٍ تكتبُ فى الدفترِ دفعةٌ
        // تُقاسُ بذاتِها. وهو مُسمّىً ومعدودٌ فى حارسِ check-every-rpc-call-has-a-door.
        let totalCommission = 0
        let totalClawbacks = 0
        let calculated = 0
        let failed = 0
        let firstFailure = ''

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
                        failed++
                        if (!firstFailure) firstFailure = calcError.message || String(calcError)
                        continue
                    }

                    calculated++
                    if (result) {
                        totalCommission += Number(result.total_commission || 0)
                        totalClawbacks += Number(result.total_clawbacks || 0)
                    }
                } catch (err: any) {
                    console.error('Error calculating commission:', err)
                    failed++
                    if (!firstFailure) firstFailure = err?.message || String(err)
                }
            }
        }

        // لم ينجحْ حسابٌ واحد: تُمحى الدورةُ الفارغةُ التى أُنشئت قبلَ قليل، ويُقالُ الحقّ.
        if (calculated === 0 && failed > 0) {
            // **والمحوُ نفسُه يُقرَأُ خطؤُه**: لو سقطَ المحوُ صامتاً لبقيتْ دورةٌ فارغةٌ
            // تمنعُ كلَّ محاولةٍ تاليةٍ بحجّةِ «توجد دورةٌ لهذه الفترة»، فيصيرُ العلاجُ
            // حاجزاً. فيُقالُ للمستخدِمِ صراحةً إن بقيتْ، ليعرفَ لماذا تُرفَضُ إعادتُه.
            const { error: rollbackError } = await supabase
                .from('commission_runs')
                .delete()
                .eq('id', run.id)
            if (rollbackError) console.error('Error rolling back empty run:', rollbackError)

            return NextResponse.json(
                {
                    error: 'Commission calculation is not available: the database function calculate_commission_for_period is not deployed',
                    error_ar: 'حساب العمولات غير متاح: دالة الحساب calculate_commission_for_period غير منشورة في قاعدة البيانات',
                    attempted: failed,
                    calculated: 0,
                    details: firstFailure,
                    ...(rollbackError
                        ? {
                            stale_run_id: run.id,
                            warning_ar: 'تعذّر حذف دورة العمولة الفارغة — قد تمنع محاولة جديدة لنفس الفترة'
                        }
                        : {})
                },
                { status: 503 }
            )
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
            success: failed === 0,
            run_id: run.id,
            calculated,
            failed,
            ...(failed > 0 ? { error_ar: `تعذّر حساب ${failed} من العمولات — والمبالغ أدناه ناقصة`, details: firstFailure } : {}),
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
