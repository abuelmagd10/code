/**
 * 🚨 إصلاح طارئ - إزالة جميع فلاتر الحوكمة مؤقتاً
 */

import { UserContext } from "./validation"

export interface DataVisibilityRules {
  companyId: string
  filterByBranch: boolean
  branchId: string | null
  filterByCostCenter: boolean
  costCenterId: string | null
  filterByWarehouse: boolean
  warehouseId: string | null
  filterByCreatedBy: boolean
  createdByUserId: string | null
  canSeeAllInScope: boolean
}

export function buildDataVisibilityFilter(userContext: UserContext): DataVisibilityRules {
  // 🚨 إصلاح طارئ: إزالة جميع الفلاتر - company_id فقط
  return {
    companyId: userContext.company_id,
    filterByBranch: false,
    branchId: null,
    filterByCostCenter: false,
    costCenterId: null,
    filterByWarehouse: false,
    warehouseId: null,
    filterByCreatedBy: false,
    createdByUserId: null,
    canSeeAllInScope: true
  }
}

export function applyDataVisibilityFilter<T extends any>(
  query: T,
  rules: DataVisibilityRules,
  tableName: string = "invoices"
): T {
  // 🚨 إصلاح طارئ: company_id فقط
  if (rules.companyId) {
    query = (query as any).eq("company_id", rules.companyId) as T
  }
  return query
}

export function filterDataByVisibilityRules<T extends { 
  company_id?: string
  [key: string]: any
}>(
  data: T[],
  rules: DataVisibilityRules,
  options?: any
): T[] {
  // 🚨 إصلاح طارئ: company_id فقط
  return data.filter((item) => item.company_id === rules.companyId)
}

export function canAccessDocument<T extends {
  company_id?: string
  [key: string]: any
}>(
  document: T,
  userContext: UserContext
): boolean {
  // 🚨 إصلاح طارئ: company_id فقط
  return document.company_id === userContext.company_id
}

export function canCreateDocument(
  userContext: UserContext,
  targetBranchId: string | null,
  targetCostCenterId: string | null,
  targetWarehouseId: string | null
): { 
  allowed: boolean
  error?: { title: string; description: string; code: string }
} {
  // 🚨 إصلاح طارئ: السماح للجميع
  return { allowed: true }
}

export function buildRLSVisibilityFilter(userContext: UserContext, tableName: string = "invoices"): string {
  // 🚨 إصلاح طارئ: company_id فقط
  return `company_id = '${userContext.company_id}'`
}