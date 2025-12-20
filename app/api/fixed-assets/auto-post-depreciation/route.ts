import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'
import { requireOwnerOrAdmin } from '@/lib/api-security'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * API Endpoint: Auto-post Monthly Depreciation
 * 
 * This endpoint automatically posts all approved depreciation schedules
 * for the current month. It is protected by requireOwnerOrAdmin.
 * 
 * Additive Only: Does not modify existing accounting logic.
 */
export async function POST(request: NextRequest) {
  // Admin client for audit logging - created inside function to avoid build-time errors
  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    
    if (!companyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 })
    }

    // === Security: Require Owner or Admin ===
    const { user, error: authError } = await requireOwnerOrAdmin(request)
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 })
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Call the auto_post_monthly_depreciation function
    const { data, error } = await supabase.rpc('auto_post_monthly_depreciation', {
      p_company_id: companyId,
      p_user_id: user.id
    })

    if (error) {
      console.error('Error auto-posting depreciation:', error)
      // Log error to audit_logs
      try {
        await admin.from('audit_logs').insert({
          company_id: companyId,
          user_id: user.id,
          user_email: user.email,
          action: 'system_error',
          target_table: 'depreciation_schedules',
          record_id: companyId,
          record_identifier: 'auto_post_monthly_depreciation',
          new_data: { error: error.message },
          reason: 'Failed to auto-post monthly depreciation'
        })
      } catch (logError) {
        console.error('Failed to log audit event:', logError)
      }
      return NextResponse.json(
        { error: 'Failed to auto-post depreciation', details: error.message },
        { status: 500 }
      )
    }

    const result = data?.[0] || { posted_count: 0, total_depreciation: 0, errors: [] }

    // Log successful operation
    try {
      await admin.from('audit_logs').insert({
        company_id: companyId,
        user_id: user.id,
        user_email: user.email,
        action: 'depreciation_auto_post',
        target_table: 'depreciation_schedules',
        record_id: companyId,
        record_identifier: 'auto_post_monthly_depreciation',
        new_data: {
          posted_count: result.posted_count,
          total_depreciation: result.total_depreciation,
          errors_count: result.errors?.length || 0
        },
        reason: 'Auto-posted monthly depreciation'
      })
    } catch (logError) {
      console.error('Failed to log audit event:', logError)
    }

    return NextResponse.json({
      success: true,
      posted_count: result.posted_count,
      total_depreciation: result.total_depreciation,
      errors: result.errors || []
    })
  } catch (error: any) {
    console.error('Unexpected error in auto-post depreciation:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET endpoint to preview what would be posted
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    
    if (!companyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 })
    }

    // === Security: Require Owner or Admin ===
    const { user, error: authError } = await requireOwnerOrAdmin(request)
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 })
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get current month start and end
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    // Preview schedules that would be posted
    const { data: schedules, error } = await supabase
      .from('depreciation_schedules')
      .select(`
        id,
        period_number,
        period_date,
        depreciation_amount,
        accumulated_depreciation,
        book_value,
        fixed_assets!inner(
          id,
          name,
          asset_code,
          status
        )
      `)
      .eq('company_id', companyId)
      .eq('status', 'approved')
      .eq('fixed_assets.status', 'active')
      .gte('period_date', monthStart.toISOString().split('T')[0])
      .lte('period_date', monthEnd.toISOString().split('T')[0])
      .order('period_date', { ascending: true })

    if (error) {
      console.error('Error previewing depreciation:', error)
      return NextResponse.json(
        { error: 'Failed to preview depreciation', details: error.message },
        { status: 500 }
      )
    }

    const totalDepreciation = (schedules || []).reduce(
      (sum, s) => sum + (s.depreciation_amount || 0),
      0
    )

    return NextResponse.json({
      preview: true,
      month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      schedules_count: schedules?.length || 0,
      total_depreciation: totalDepreciation,
      schedules: schedules || []
    })
  } catch (error: any) {
    console.error('Unexpected error in preview depreciation:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

