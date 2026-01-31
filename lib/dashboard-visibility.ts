/**
 * 🔐 Dashboard Visibility Control
 * 
 * نظام حوكمة لوحة التحكم متعدد الفروع ومراكز التكلفة
 * 
 * القواعد:
 * - Owner / General Manager: يرون كل الشركة مع إمكانية التبديل للفرع
 * - Admin: يرى كل الشركة مع إمكانية التبديل للفرع
 * - باقي الأدوار: يرون فرعهم فقط
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { getRoleAccessLevel } from "@/lib/validation"

export type DashboardScope = 'company' | 'branch'

export interface DashboardUserContext {
  user_id: string
  company_id: string
  role: string
  branch_id: string | null
  cost_center_id: string | null
  warehouse_id: string | null
}

export interface DashboardVisibilityRules {
  /** نطاق العرض الحالي */
  scope: DashboardScope
  /** معرف الشركة */
  companyId: string
  /** معرف الفرع (إذا كان النطاق branch) */
  branchId: string | null
  /** معرف مركز التكلفة (إذا كان النطاق branch) */
  costCenterId: string | null
  /** هل يمكن للمستخدم التبديل بين Company/Branch */
  canSwitchScope: boolean
  /** هل يمكن للمستخدم رؤية كل الفروع */
  canSeeAllBranches: boolean
  /** الأدوار المسموح لها بالتبديل */
  privilegedRoles: string[]
}

/** الأدوار المسموح لها برؤية كل الشركة والتبديل */
const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']

/**
 * بناء قواعد رؤية لوحة التحكم
 */
export function buildDashboardVisibilityRules(
  context: DashboardUserContext,
  selectedScope?: DashboardScope,
  selectedBranchId?: string | null
): DashboardVisibilityRules {
  const accessLevel = getRoleAccessLevel(context.role)
  const isPrivileged = PRIVILEGED_ROLES.includes(context.role)
  
  // تحديد النطاق الفعلي
  let effectiveScope: DashboardScope = 'branch'
  let effectiveBranchId: string | null = context.branch_id
  let effectiveCostCenterId: string | null = context.cost_center_id
  
  if (isPrivileged) {
    // المستخدمون المميزون يمكنهم اختيار النطاق
    if (selectedScope === 'company') {
      effectiveScope = 'company'
      effectiveBranchId = null
      effectiveCostCenterId = null
    } else if (selectedScope === 'branch' && selectedBranchId) {
      effectiveScope = 'branch'
      effectiveBranchId = selectedBranchId
      // سيتم جلب cost_center_id الافتراضي للفرع لاحقاً
    } else {
      // الافتراضي للمميزين: Company View
      effectiveScope = 'company'
      effectiveBranchId = null
      effectiveCostCenterId = null
    }
  } else {
    // المستخدمون العاديون: فرعهم فقط
    effectiveScope = 'branch'
    effectiveBranchId = context.branch_id
    effectiveCostCenterId = context.cost_center_id
  }
  
  return {
    scope: effectiveScope,
    companyId: context.company_id,
    branchId: effectiveBranchId,
    costCenterId: effectiveCostCenterId,
    canSwitchScope: isPrivileged,
    canSeeAllBranches: isPrivileged,
    privilegedRoles: PRIVILEGED_ROLES
  }
}

/**
 * تطبيق فلترة لوحة التحكم على استعلام Supabase
 */
export function applyDashboardFilter<T extends { eq: Function }>(
  query: T,
  rules: DashboardVisibilityRules,
  options?: {
    branchField?: string
    costCenterField?: string
  }
): T {
  const branchField = options?.branchField || 'branch_id'
  const costCenterField = options?.costCenterField || 'cost_center_id'
  
  // دائماً نفلتر بالشركة
  query = query.eq('company_id', rules.companyId)
  
  // إذا كان النطاق branch، نفلتر بالفرع
  if (rules.scope === 'branch' && rules.branchId) {
    query = query.eq(branchField, rules.branchId)
  }
  
  return query
}

/**
 * تطبيق فلترة على القيود المحاسبية (journal_entries)
 * للنقد والبنك: نفلتر الحركات وليس الحسابات
 */
export function applyJournalEntriesFilter<T extends { eq: Function }>(
  query: T,
  rules: DashboardVisibilityRules
): T {
  // دائماً نفلتر بالشركة
  query = query.eq('company_id', rules.companyId)
  
  // إذا كان النطاق branch، نفلتر بالفرع ومركز التكلفة
  if (rules.scope === 'branch' && rules.branchId) {
    query = query.eq('branch_id', rules.branchId)
    if (rules.costCenterId) {
      query = query.eq('cost_center_id', rules.costCenterId)
    }
  }
  
  return query
}

/**
 * التحقق من صلاحية التبديل
 */
export function canSwitchDashboardScope(role: string): boolean {
  return PRIVILEGED_ROLES.includes(role)
}

/**
 * الحصول على النطاق الافتراضي للمستخدم
 */
export function getDefaultDashboardScope(role: string): DashboardScope {
  return PRIVILEGED_ROLES.includes(role) ? 'company' : 'branch'
}

/**
 * جلب مركز التكلفة الافتراضي للفرع
 */
export async function getBranchDefaultCostCenter(
  supabase: SupabaseClient,
  branchId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('branches')
    .select('default_cost_center_id')
    .eq('id', branchId)
    .maybeSingle()
  
  return data?.default_cost_center_id || null
}

