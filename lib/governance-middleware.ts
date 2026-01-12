import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export interface GovernanceContext {
  companyId: string
  branchIds: string[]
  warehouseIds: string[]
  costCenterIds: string[]
  role: string
}

/**
 * Governance Middleware - يطبق قواعد الحوكمة على كل استعلام
 * يجب استخدامه في كل API endpoint
 */
export async function enforceGovernance(
  req: NextRequest,
  options: GovernanceOptions = {}
): Promise<GovernanceContext> {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
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
  } catch {}

  // الحصول على بيانات المستخدم من company_members
  let memberQuery = supabase
    .from('company_members')
    .select('company_id, role, branch_id, warehouse_id, cost_center_id')
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
      .select('company_id, role, branch_id, warehouse_id, cost_center_id')
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

  // بناء سياق الحوكمة حسب الدور
  const context: GovernanceContext = {
    companyId: member.company_id,
    branchIds: [],
    warehouseIds: [],
    costCenterIds: [],
    role: member.role
  }

  // تحديد النطاق حسب الدور
  const role = member.role?.toLowerCase() || 'staff'
  
  switch (role) {
    case 'staff':
    case 'employee':
      // الموظف يرى فقط بياناته
      context.branchIds = member.branch_id ? [member.branch_id] : []
      context.warehouseIds = member.warehouse_id ? [member.warehouse_id] : []
      context.costCenterIds = member.cost_center_id ? [member.cost_center_id] : []
      break

    case 'accountant':
    case 'manager':
      // المحاسب والمدير يرون كل الفرع
      context.branchIds = member.branch_id ? [member.branch_id] : []
      
      // الحصول على جميع المستودعات التابعة للفرع
      if (context.branchIds.length > 0) {
        const { data: warehouses } = await supabase
          .from('warehouses')
          .select('id')
          .in('branch_id', context.branchIds)
        
        context.warehouseIds = warehouses?.map(w => w.id) || []
      }
      
      // الحصول على جميع مراكز التكلفة للشركة
      const { data: costCenters } = await supabase
        .from('cost_centers')
        .select('id')
        .eq('company_id', context.companyId)
      
      context.costCenterIds = costCenters?.map(c => c.id) || []
      break

    case 'admin':
    case 'gm':
    case 'owner':
    case 'general_manager':
      // المدير العام يرى كل الشركة
      const { data: allBranches } = await supabase
        .from('branches')
        .select('id')
        .eq('company_id', context.companyId)
      
      context.branchIds = allBranches?.map(b => b.id) || []
      
      const { data: allWarehouses } = await supabase
        .from('warehouses')
        .select('id')
        .eq('company_id', context.companyId)
      
      context.warehouseIds = allWarehouses?.map(w => w.id) || []
      
      const { data: allCostCenters } = await supabase
        .from('cost_centers')
        .select('id')
        .eq('company_id', context.companyId)
      
      context.costCenterIds = allCostCenters?.map(c => c.id) || []
      break

    default:
      // افتراضياً: نفس صلاحيات المدير
      const { data: allBranches2 } = await supabase
        .from('branches')
        .select('id')
        .eq('company_id', context.companyId)
      
      context.branchIds = allBranches2?.map(b => b.id) || []
      
      const { data: allWarehouses2 } = await supabase
        .from('warehouses')
        .select('id')
        .eq('company_id', context.companyId)
      
      context.warehouseIds = allWarehouses2?.map(w => w.id) || []
      
      const { data: allCostCenters2 } = await supabase
        .from('cost_centers')
        .select('id')
        .eq('company_id', context.companyId)
      
      context.costCenterIds = allCostCenters2?.map(c => c.id) || []
      break
  }

  // التحقق من وجود صلاحيات (إذا لم تكن موجودة، استخدم الافتراضية)
  if (context.branchIds.length === 0) {
    const { data: defaultBranch } = await supabase
      .from('branches')
      .select('id')
      .eq('company_id', context.companyId)
      .limit(1)
      .single()
    
    if (defaultBranch) context.branchIds = [defaultBranch.id]
  }
  
  if (context.warehouseIds.length === 0) {
    const { data: defaultWarehouse } = await supabase
      .from('warehouses')
      .select('id')
      .eq('company_id', context.companyId)
      .limit(1)
      .single()
    
    if (defaultWarehouse) context.warehouseIds = [defaultWarehouse.id]
  }
  
  if (context.costCenterIds.length === 0) {
    const { data: defaultCostCenter } = await supabase
      .from('cost_centers')
      .select('id')
      .eq('company_id', context.companyId)
      .limit(1)
      .single()
    
    if (defaultCostCenter) context.costCenterIds = [defaultCostCenter.id]
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

  // التحقق من warehouse_id
  if (!context.warehouseIds.includes(data.warehouse_id)) {
    throw new Error('Governance Violation: Invalid warehouse_id')
  }

  // التحقق من cost_center_id
  if (!context.costCenterIds.includes(data.cost_center_id)) {
    throw new Error('Governance Violation: Invalid cost_center_id')
  }
}

/**
 * إضافة بيانات الحوكمة تلقائياً
 */
export function addGovernanceData(
  data: any,
  context: GovernanceContext
): any {
  return {
    ...data,
    company_id: context.companyId,
    branch_id: data.branch_id || context.branchIds[0],
    warehouse_id: data.warehouse_id || context.warehouseIds[0],
    cost_center_id: data.cost_center_id || context.costCenterIds[0]
  }
}
