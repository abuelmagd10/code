import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'
import { secureApiRequest } from '@/lib/api-security'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { writeAuditLog } from "@/lib/audit-log-write"

/**
 * API Endpoint: Auto-post Monthly Depreciation
 * 
 * This endpoint automatically posts all approved depreciation schedules
 * for the current month. It is protected by secureApiRequest with post_depreciation permission.
 * Filters schedules by branch, cost center, warehouse, and user role.
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

    // === Security: Require permission to post depreciation ===
    const { user, companyId: verifiedCompanyId, member, error: authError } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "fixed_assets", action: "post_depreciation" },
      allowRoles: ['owner', 'admin', 'accountant', 'manager']
    })

    if (authError) {
      return authError
    }

    if (!user || !verifiedCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 🔐 ERP Access Control - جلب سياق المستخدم للفلترة
    const role = member?.role || "staff"
    const isCanOverride = ["owner", "admin"].includes(role)
    const isAccountantOrManager = ["accountant", "manager"].includes(role)
    
    // Get full member data including branch, cost_center, warehouse
    const { data: fullMemberData } = await supabase
      .from("company_members")
      .select("role, branch_id, cost_center_id, warehouse_id")
      .eq("company_id", verifiedCompanyId)
      .eq("user_id", user.id)
      .maybeSingle()

    const userBranchId = fullMemberData?.branch_id || null
    const userCostCenterId = fullMemberData?.cost_center_id || null
    const userWarehouseId = fullMemberData?.warehouse_id || null

    // جلب المخازن في الفرع للمحاسب/المدير
    let allowedWarehouseIds: string[] = []
    if (isAccountantOrManager && userBranchId) {
      const { data: branchWarehouses } = await supabase
        .from("warehouses")
        .select("id")
        .eq("company_id", verifiedCompanyId)
        .eq("branch_id", userBranchId)
        .eq("is_active", true)
      
      allowedWarehouseIds = (branchWarehouses || []).map((w: any) => w.id)
    }

    // Get current month start and end
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    // 🔐 فلترة depreciation_schedules حسب الفرع ومركز التكلفة والمخزن والدور
    let schedulesQuery = supabase
      .from('depreciation_schedules')
      .select(`
        id,
        asset_id,
        depreciation_amount,
        fixed_assets!inner(
          id,
          branch_id,
          cost_center_id,
          warehouse_id,
          status
        )
      `)
      .eq('company_id', verifiedCompanyId)
      .eq('status', 'approved')
      .eq('fixed_assets.status', 'active')
      .gte('period_date', monthStart.toISOString().split('T')[0])
      .lte('period_date', monthEnd.toISOString().split('T')[0])
      .lte('period_date', now.toISOString().split('T')[0])

    // Apply filters based on user context
    if (!isCanOverride) {
      if (isAccountantOrManager && userBranchId) {
        schedulesQuery = schedulesQuery.eq('fixed_assets.branch_id', userBranchId)
        if (userWarehouseId && allowedWarehouseIds.length > 0 && allowedWarehouseIds.includes(userWarehouseId)) {
          schedulesQuery = schedulesQuery.eq('fixed_assets.warehouse_id', userWarehouseId)
        } else if (allowedWarehouseIds.length > 0) {
          schedulesQuery = schedulesQuery.in('fixed_assets.warehouse_id', allowedWarehouseIds)
        }
      } else if (userBranchId) {
        schedulesQuery = schedulesQuery.eq('fixed_assets.branch_id', userBranchId)
        if (userWarehouseId) {
          schedulesQuery = schedulesQuery.eq('fixed_assets.warehouse_id', userWarehouseId)
        }
      }

      if (userCostCenterId) {
        schedulesQuery = schedulesQuery.eq('fixed_assets.cost_center_id', userCostCenterId)
      }
    }

    const { data: filteredSchedules, error: filterError } = await schedulesQuery

    if (filterError) {
      console.error('Error filtering depreciation schedules:', filterError)
      return NextResponse.json(
        { error: 'Failed to filter depreciation schedules', details: filterError.message },
        { status: 500 }
      )
    }

    if (!filteredSchedules || filteredSchedules.length === 0) {
      return NextResponse.json({
        success: true,
        posted_count: 0,
        total_depreciation: 0,
        errors: []
      })
    }

    // Post each filtered schedule individually
    let postedCount = 0
    let totalDepreciation = 0
    const errors: string[] = []

    for (const schedule of filteredSchedules) {
      try {
        const { error: postError } = await supabase.rpc('post_depreciation', {
          p_schedule_id: schedule.id,
          p_user_id: user.id
        })

        if (postError) {
          errors.push(`Error posting schedule ${schedule.id}: ${postError.message}`)
          continue
        }

        postedCount++
        totalDepreciation += Number(schedule.depreciation_amount || 0)
      } catch (err: any) {
        errors.push(`Error posting schedule ${schedule.id}: ${err.message}`)
      }
    }

    const result = {
      posted_count: postedCount,
      total_depreciation: totalDepreciation,
      errors: errors
    }

    // Log successful operation
    try {
      await writeAuditLog(admin, {
        company_id: verifiedCompanyId,
        user_id: user.id,
        user_email: user.email,
        action: 'depreciation_auto_post',
        target_table: 'depreciation_schedules',
        record_id: verifiedCompanyId,
        record_identifier: 'auto_post_monthly_depreciation',
        new_data: {
          posted_count: result.posted_count,
          total_depreciation: result.total_depreciation,
          errors_count: result.errors?.length || 0
        },
        reason: 'Auto-posted monthly depreciation'
      }, "auto-post-depreciation/route")
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

    // === Security: Require permission to view depreciation ===
    const { user, companyId: verifiedCompanyId, member, error: authError } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "fixed_assets", action: "read" },
      allowRoles: ['owner', 'admin', 'accountant', 'manager', 'viewer']
    })

    if (authError) {
      return authError
    }

    if (!user || !verifiedCompanyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 🔐 ERP Access Control - جلب سياق المستخدم للفلترة
    const role = member?.role || "staff"
    const isCanOverride = ["owner", "admin"].includes(role)
    const isAccountantOrManager = ["accountant", "manager"].includes(role)
    
    // Get full member data including branch, cost_center, warehouse
    const { data: fullMemberData } = await supabase
      .from("company_members")
      .select("role, branch_id, cost_center_id, warehouse_id")
      .eq("company_id", verifiedCompanyId)
      .eq("user_id", user.id)
      .maybeSingle()

    const userBranchId = fullMemberData?.branch_id || null
    const userCostCenterId = fullMemberData?.cost_center_id || null
    const userWarehouseId = fullMemberData?.warehouse_id || null

    // جلب المخازن في الفرع للمحاسب/المدير
    let allowedWarehouseIds: string[] = []
    if (isAccountantOrManager && userBranchId) {
      const { data: branchWarehouses } = await supabase
        .from("warehouses")
        .select("id")
        .eq("company_id", verifiedCompanyId)
        .eq("branch_id", userBranchId)
        .eq("is_active", true)
      
      allowedWarehouseIds = (branchWarehouses || []).map((w: any) => w.id)
    }

    // Get current month start and end
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    // Preview schedules that would be posted with filtering
    let schedulesQuery = supabase
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
          status,
          branch_id,
          cost_center_id,
          warehouse_id
        )
      `)
      .eq('company_id', verifiedCompanyId)
      .eq('status', 'approved')
      .eq('fixed_assets.status', 'active')
      .gte('period_date', monthStart.toISOString().split('T')[0])
      .lte('period_date', monthEnd.toISOString().split('T')[0])

    // 🔐 فلترة حسب الفرع ومركز التكلفة والمخزن والدور
    if (!isCanOverride) {
      if (isAccountantOrManager && userBranchId) {
        // للمحاسب والمدير: فلترة حسب الفرع أولاً
        schedulesQuery = schedulesQuery.eq('fixed_assets.branch_id', userBranchId)
        
        // فلترة حسب المخزن إذا كان محدداً أو حسب المخازن في الفرع
        if (userWarehouseId && allowedWarehouseIds.length > 0 && allowedWarehouseIds.includes(userWarehouseId)) {
          schedulesQuery = schedulesQuery.eq('fixed_assets.warehouse_id', userWarehouseId)
        } else if (allowedWarehouseIds.length > 0) {
          schedulesQuery = schedulesQuery.in('fixed_assets.warehouse_id', allowedWarehouseIds)
        }
      } else if (userBranchId) {
        // للموظف: فلترة حسب الفرع والمخزن
        schedulesQuery = schedulesQuery.eq('fixed_assets.branch_id', userBranchId)
        if (userWarehouseId) {
          schedulesQuery = schedulesQuery.eq('fixed_assets.warehouse_id', userWarehouseId)
        }
      }

      // فلترة حسب مركز التكلفة إذا كان محدداً
      if (userCostCenterId) {
        schedulesQuery = schedulesQuery.eq('fixed_assets.cost_center_id', userCostCenterId)
      }
    }

    const { data: schedules, error } = await schedulesQuery
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

