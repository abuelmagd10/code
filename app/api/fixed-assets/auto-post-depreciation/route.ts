import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'
import { requireOwnerOrAdmin } from '@/lib/api-security'
import { auditLog } from '@/lib/audit-log'
import { createClient as createAdminClient } from '@supabase/supabase-js'

// Admin client for audit logging
const admin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * API Endpoint: Auto-post Monthly Depreciation
 * 
 * This endpoint automatically posts all approved depreciation schedules
 * for the current month. It is protected by requireOwnerOrAdmin.
 * 
 * Additive Only: Does not modify existing accounting logic.
 */
export async function POST(request: NextRequest) {
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
      await auditLog(
        admin,
        user.id,
        companyId,
        'system_error',
        'Failed to auto-post monthly depreciation',
        { error: error.message }
      )
      return NextResponse.json(
        { error: 'Failed to auto-post depreciation', details: error.message },
        { status: 500 }
      )
    }

    const result = data?.[0] || { posted_count: 0, total_depreciation: 0, errors: [] }

    // Log successful operation
    await auditLog(
      admin,
      user.id,
      companyId,
      'depreciation_auto_post',
      'Auto-posted monthly depreciation',
      {
        posted_count: result.posted_count,
        total_depreciation: result.total_depreciation,
        errors_count: result.errors?.length || 0
      }
    )

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

