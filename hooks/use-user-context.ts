"use client"

import { useEffect, useState, useCallback } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import type { UserContext, ValidationResult } from "@/lib/validation"
import {
  validateUserDocumentAccess,
  validateFinancialTransaction,
  validateInventoryTransaction,
  validateBankAccountAccess,
  createDocumentContextFromUser,
  ERP_ACCESS_CONTROL_RULES
} from "@/lib/validation"

interface UseUserContextReturn {
  userContext: UserContext | null
  loading: boolean
  error: string | null
  // Validation helpers
  canAccessDocument: (documentContext: { company_id: string; branch_id?: string | null; cost_center_id?: string | null; warehouse_id?: string | null }) => ValidationResult
  canCreateFinancialTransaction: (branchId: string | null, costCenterId: string | null) => ValidationResult
  canAccessInventory: (warehouseId: string, warehouseBranchId: string, transactionType: 'stock_in' | 'stock_out' | 'transfer' | 'adjustment') => ValidationResult
  canAccessBankAccount: (accountBranchId: string | null, accountCostCenterId: string | null) => ValidationResult
  createDocumentContext: (overrides?: Partial<{ company_id: string; branch_id: string | null; cost_center_id: string | null; warehouse_id: string | null }>) => ReturnType<typeof createDocumentContextFromUser> | null
  canOverrideContext: boolean
  refresh: () => Promise<void>
}

/**
 * Hook لجلب سياق المستخدم الكامل (الشركة، الفرع، مركز التكلفة، المخزن)
 * والتحقق من صلاحيات الوصول للعمليات المختلفة
 *
 * @example
 * const { userContext, canAccessDocument, canCreateFinancialTransaction } = useUserContext()
 *
 * // التحقق من صلاحية الوصول لفاتورة
 * const result = canAccessDocument({ company_id: invoice.company_id, branch_id: invoice.branch_id })
 * if (!result.isValid) {
 *   toast.error(result.error?.description)
 * }
 */
export function useUserContext(): UseUserContextReturn {
  const supabase = useSupabase()
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadUserContext = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setUserContext(null)
        return
      }

      // Get active company
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        setError("لم يتم تحديد شركة نشطة")
        setUserContext(null)
        return
      }

      // Get user's membership with branch, cost center, warehouse
      const { data: member, error: memberError } = await supabase
        .from("company_members")
        .select("role, branch_id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle()

      if (memberError) {
        setError(memberError.message)
        return
      }

      // Check if user is company owner (has access to everything)
      const { data: company } = await supabase
        .from("companies")
        .select("user_id")
        .eq("id", companyId)
        .single()

      const isOwner = company?.user_id === user.id

      const memberBranchId = member?.branch_id || null
      if (!memberBranchId) {
        setError("المستخدم بدون فرع")
        setUserContext(null)
        return
      }

      const { data: branchDefaults, error: branchErr } = await supabase
        .from("branches")
        .select("default_cost_center_id, default_warehouse_id")
        .eq("company_id", companyId)
        .eq("id", memberBranchId)
        .single()

      if (branchErr) {
        setError(branchErr.message)
        setUserContext(null)
        return
      }

      const defaultCostCenterId = branchDefaults?.default_cost_center_id || null
      const defaultWarehouseId = branchDefaults?.default_warehouse_id || null

      setUserContext({
        user_id: user.id,
        company_id: companyId,
        branch_id: memberBranchId,
        cost_center_id: defaultCostCenterId,
        warehouse_id: defaultWarehouseId,
        role: isOwner ? "owner" : (member?.role || "viewer"),
      })
    } catch (e: any) {
      setError(e?.message || "خطأ في جلب بيانات المستخدم")
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadUserContext()
  }, [loadUserContext])

  // Check if user can override context restrictions
  const canOverrideContext = userContext
    ? ERP_ACCESS_CONTROL_RULES.OVERRIDE_ALLOWED_ROLES.includes(userContext.role as any)
    : false

  // Validation helper functions
  const canAccessDocument = useCallback((documentContext: { company_id: string; branch_id?: string | null; cost_center_id?: string | null; warehouse_id?: string | null }): ValidationResult => {
    if (!userContext) return { isValid: false, error: { title: "خطأ", description: "لم يتم تحميل بيانات المستخدم", code: "NO_USER_CONTEXT" } }
    return validateUserDocumentAccess(userContext, documentContext)
  }, [userContext])

  const canCreateFinancialTransaction = useCallback((branchId: string | null, costCenterId: string | null): ValidationResult => {
    if (!userContext) return { isValid: false, error: { title: "خطأ", description: "لم يتم تحميل بيانات المستخدم", code: "NO_USER_CONTEXT" } }
    return validateFinancialTransaction(userContext, branchId, costCenterId, canOverrideContext)
  }, [userContext, canOverrideContext])

  const canAccessInventory = useCallback((warehouseId: string, warehouseBranchId: string, transactionType: 'stock_in' | 'stock_out' | 'transfer' | 'adjustment'): ValidationResult => {
    if (!userContext) return { isValid: false, error: { title: "خطأ", description: "لم يتم تحميل بيانات المستخدم", code: "NO_USER_CONTEXT" } }
    return validateInventoryTransaction(userContext, warehouseBranchId, warehouseId, canOverrideContext)
  }, [userContext, canOverrideContext])

  const canAccessBankAccount = useCallback((accountBranchId: string | null, accountCostCenterId: string | null): ValidationResult => {
    if (!userContext) return { isValid: false, error: { title: "خطأ", description: "لم يتم تحميل بيانات المستخدم", code: "NO_USER_CONTEXT" } }
    return validateBankAccountAccess(userContext, accountBranchId, accountCostCenterId)
  }, [userContext])

  const createDocumentContext = useCallback((overrides?: Partial<{ company_id: string; branch_id: string | null; cost_center_id: string | null; warehouse_id: string | null }>) => {
    if (!userContext) return null
    return createDocumentContextFromUser(userContext, overrides)
  }, [userContext])

  return {
    userContext,
    loading,
    error,
    canAccessDocument,
    canCreateFinancialTransaction,
    canAccessInventory,
    canAccessBankAccount,
    createDocumentContext,
    canOverrideContext,
    refresh: loadUserContext,
  }
}
