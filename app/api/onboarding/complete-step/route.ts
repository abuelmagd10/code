import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export type OnboardingStep =
  | 'company_created'
  | 'branch_added'
  | 'first_product'
  | 'first_invoice'
  | 'first_purchase_order'

/**
 * POST /api/onboarding/complete-step
 * Body: { companyId: string, step: OnboardingStep }
 *
 * Marks a step as completed in onboarding_progress.
 * Safe to call multiple times (idempotent).
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, step } = await req.json() as { companyId: string; step: OnboardingStep }

    if (!companyId || !step) {
      return NextResponse.json({ success: false, error: 'companyId and step are required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Upsert: create progress row if not exists, then mark step
    const { error } = await supabase
      .from('onboarding_progress')
      .upsert(
        { company_id: companyId, steps: { [step]: true } },
        {
          onConflict: 'company_id',
          ignoreDuplicates: false,
        }
      )

    // For update existing row — jsonb merge
    if (error) {
      // Row exists, update just the step key via RPC
      await supabase.rpc('complete_onboarding_step', {
        p_company_id: companyId,
        p_step: step,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 })
  }
}
