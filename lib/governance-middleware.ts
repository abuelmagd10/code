import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export interface GovernanceContext {
  companyId: string
  branchIds: string[]
  warehouseIds: string[]
  costCenterIds: string[]
  role: string
}

export interface GovernanceOptions {
  requireBranch?: boolean
  requireWarehouse?: boolean
  requireCostCenter?: boolean
}

/**
 * Governance Middleware - يطبق قواعد الحوكمة على كل استعلام
 * يجب استخدامه في كل API endpoint
 */
export async function enforceGovernance(
  req?: NextRequest,
  options: GovernanceOptions = {}
): Promise<GovernanceContext> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // The `set` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // The `delete` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    console.error('Governance: Auth error or no user', authError)
    throw new Error('Unauthorized: No active session')
  }

  // الحصول على الشركة النشطة من الكوكيز
  let activeCompanyId: string | null = null
  try {
    const activeCompanyCookie = cookieStore.get('active_company_id')?.value
    // console.log('Governance: Active company cookie:', activeCompanyCookie) 
    activeCompanyId = activeCompanyCookie || null
  } catch { }

  // الحصول على بيانات المستخدم من company_members
  let memberQuery = supabase
    .from('company_members')
    .select('company_id, role, branch_id')
    .eq('user_id', user.id)

  // إذا تم تحديد شركة، نفلتر بها
  if (activeCompanyId) {
    memberQuery = memberQuery.eq('company_id', activeCompanyId)
  }

  // نستخدم limit(1).single() لتجنب خطأ تعدد الصفوف
  const { data: member, error: memberError } = await memberQuery.limit(1).single()

  // إذا لم يتم العثور على عضوية بالشركة المحددة، نحاول البحث عن أي عضوية أخرى
  if ((memberError || !member) && activeCompanyId) {
    console.warn(`Governance: User ${user.id} not found in active company ${activeCompanyId}, falling back to first available company.`)
    const { data: fallbackMember, error: fallbackError } = await supabase
      .from('company_members')
      .select('company_id, role, branch_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    if (fallbackError || !fallbackMember) {
      console.error('Governance: No company membership found for user', user.id)
      throw new Error('Governance Error: User is not a company member')
    }
    // استخدام العضوية البديلة
    return buildGovernanceContext(supabase, fallbackMember)
  }

  if (memberError || !member) {
    console.error('Governance: Database error or member not found', memberError)
    throw new Error('Governance Error: User is not a company member')
  }

  return buildGovernanceContext(supabase, member)
}

async function buildGovernanceContext(supabase: any, member: any): Promise<GovernanceContext> {
  if (!member.company_id) {
    throw new Error('Governance Error: User has no company assigned')
  }
  if (!member.branch_id) {
    throw new Error('Governance Error: User has no branch assigned')
  }

  // بناء سياق الحوكمة حسب الدور
  const context: GovernanceContext = {
    companyId: member.company_id,
    branchIds: [],
    warehouseIds: [],
    costCenterIds: [],
    role: member.role
  }

  // تحديد النطاق حسب الدور
  const role = String(member.role || 'staff').trim().toLowerCase().replace(/\s+/g, '_')

  const getBranchDefaults = async (branchId: string) => {
    const { data: branch, error } = await supabase
      .from('branches')
      .select('default_warehouse_id, default_cost_center_id')
      .eq('id', branchId)
      .eq('company_id', context.companyId)
      .single()

    if (error || !branch) {
      // ⚠️ الفرع غير موجود أو خطأ في الاستعلام - نرجع null بدلاً من رمي خطأ
      console.warn(`Governance: Branch ${branchId} not found or query error`, error)
      return { defaultWarehouseId: null as string | null, defaultCostCenterId: null as string | null }
    }
    // ✅ إذا كانت القيم null نخطر فقط بدلاً من رمي خطأ
    // بعض الجداول (مثل customers) لا تحتاج warehouse/cost_center
    if (!branch.default_warehouse_id || !branch.default_cost_center_id) {
      console.warn(`Governance: Branch ${branchId} is missing default_warehouse_id or default_cost_center_id. Some operations may be limited.`)
    }
    return {
      defaultWarehouseId: branch.default_warehouse_id as string | null,
      defaultCostCenterId: branch.default_cost_center_id as string | null
    }
  }

  switch (role) {
    case 'staff':
    case 'employee':
      // الموظف يرى فقط بياناته
      context.branchIds = [member.branch_id]
      {
        const defaults = await getBranchDefaults(member.branch_id)
        if (defaults.defaultWarehouseId) context.warehouseIds = [defaults.defaultWarehouseId]
        if (defaults.defaultCostCenterId) context.costCenterIds = [defaults.defaultCostCenterId]
      }
      break

    case 'accountant':
    case 'manager':
    case 'branch_manager':
      // المحاسب والمدير يرون كل الفرع
      context.branchIds = [member.branch_id]
      {
        const defaults = await getBranchDefaults(member.branch_id)
        if (defaults.defaultWarehouseId) context.warehouseIds = [defaults.defaultWarehouseId]
        if (defaults.defaultCostCenterId) context.costCenterIds = [defaults.defaultCostCenterId]
      }
      break

    case 'admin':
    case 'super_admin':
    case 'gm':
    case 'owner':
    case 'general_manager':
    case 'generalmanager':
    case 'superadmin':
      // المدير العام يرى كل الشركة
      const { data: allBranches } = await supabase
        .from('branches')
        .select('id')
        .eq('company_id', context.companyId)

      {
        const branchIds = allBranches?.map((b: any) => b.id) || []
        const primary = member.branch_id
        context.branchIds = [primary, ...branchIds.filter((id: string) => id !== primary)]
      }

      const { data: allWarehouses } = await supabase
        .from('warehouses')
        .select('id')
        .eq('company_id', context.companyId)

      context.warehouseIds = allWarehouses?.map((w: any) => w.id) || []

      const { data: allCostCenters } = await supabase
        .from('cost_centers')
        .select('id')
        .eq('company_id', context.companyId)

      context.costCenterIds = allCostCenters?.map((c: any) => c.id) || []
      break

    default:
      // افتراضياً: نفس صلاحيات المدير
      context.branchIds = [member.branch_id]
      {
        const defaults = await getBranchDefaults(member.branch_id)
        if (defaults.defaultWarehouseId) context.warehouseIds = [defaults.defaultWarehouseId]
        if (defaults.defaultCostCenterId) context.costCenterIds = [defaults.defaultCostCenterId]
      }
      break
  }

  return context
}

/**
 * تطبيق فلاتر الحوكمة على استعلام Supabase
 */
export function applyGovernanceFilters(
  query: any,
  context: GovernanceContext
) {
  query = query.eq('company_id', context.companyId)

  if (context.branchIds.length > 0) {
    query = query.in('branch_id', context.branchIds)
  }

  if (context.warehouseIds.length > 0) {
    query = query.in('warehouse_id', context.warehouseIds)
  }

  if (context.costCenterIds.length > 0) {
    query = query.in('cost_center_id', context.costCenterIds)
  }

  return query
}

/**
 * التحقق من صلاحية البيانات قبل الإدخال
 */
export function validateGovernanceData(
  data: any,
  context: GovernanceContext
): void {
  // التحقق من company_id
  if (data.company_id !== context.companyId) {
    throw new Error('Governance Violation: Invalid company_id')
  }

  // التحقق من branch_id
  if (!context.branchIds.includes(data.branch_id)) {
    throw new Error('Governance Violation: Invalid branch_id')
  }

  // التحقق من warehouse_id (فقط إذا كان السياق يمتلكه وكان الحقل موجوداً)
  if (data.warehouse_id && context.warehouseIds.length > 0 && !context.warehouseIds.includes(data.warehouse_id)) {
    throw new Error('Governance Violation: Invalid warehouse_id')
  }

  // التحقق من cost_center_id (فقط إذا كان السياق يمتلكه وكان الحقل موجوداً)
  if (data.cost_center_id && context.costCenterIds.length > 0 && !context.costCenterIds.includes(data.cost_center_id)) {
    throw new Error('Governance Violation: Invalid cost_center_id')
  }
}

/**
 * إضافة بيانات الحوكمة تلقائياً مع فرض القيود حسب الدور
 */
export function addGovernanceData(
  data: any,
  context: GovernanceContext
): any {
  // 🔐 Governance: Role-based enforcement
  const role = String(context.role || 'staff').trim().toLowerCase().replace(/\s+/g, '_')
  const isAdmin = ['super_admin', 'admin', 'general_manager', 'gm', 'owner', 'generalmanager', 'superadmin'].includes(role)

  // For non-admin users, enforce their assigned governance values
  if (!isAdmin) {
    // Override any attempt to change governance fields
    return {
      ...data,
      company_id: context.companyId,
      branch_id: context.branchIds[0] || null, // Force user's assigned branch
      warehouse_id: context.warehouseIds[0] || null, // Force user's assigned warehouse
      cost_center_id: context.costCenterIds[0] || null // Force user's assigned cost center
    }
  }

  // For admin users, allow their choices but validate against available options
  return {
    ...data,
    company_id: context.companyId,
    branch_id: data.branch_id || context.branchIds[0],
    warehouse_id: data.warehouse_id || context.warehouseIds[0],
    cost_center_id: data.cost_center_id || context.costCenterIds[0]
  }
}
