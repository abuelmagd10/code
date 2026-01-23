/**
 * 🔐 Access Context - المصدر الوحيد للصلاحيات
 * 
 * Context مركزي يحتوي على جميع معلومات الصلاحيات والوصول
 * يتم تحديثه فقط من:
 * - API رسمي (getUserAccessProfile)
 * - Realtime Governance Events
 */

"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { useGovernanceRealtime } from "@/hooks/use-governance-realtime"
import { useToast } from "@/hooks/use-toast"

// =====================================================
// Types
// =====================================================

export interface AccessProfile {
  user_id: string
  company_id: string
  role: string
  branch_id?: string | null
  warehouse_id?: string | null
  cost_center_id?: string | null
  
  // الصفحات المسموح بها
  allowed_pages: string[]
  
  // العمليات المسموح بها (resource:action)
  allowed_actions: string[]
  
  // الفروع المسموح بها
  allowed_branches: string[]
  
  // المخازن المسموح بها
  allowed_warehouses: string[]
  
  // مراكز التكلفة المسموح بها
  allowed_cost_centers: string[]
  
  // معلومات إضافية
  is_owner: boolean
  is_admin: boolean
  is_manager: boolean
  is_store_manager: boolean
  is_staff: boolean
}

export interface AccessContextType {
  // حالة التحميل
  isLoading: boolean
  isReady: boolean
  
  // Access Profile
  profile: AccessProfile | null
  
  // دوال التحقق
  canAccessPage: (resource: string) => boolean
  canAction: (resource: string, action: string) => boolean
  canAccessBranch: (branchId: string) => boolean
  canAccessWarehouse: (warehouseId: string) => boolean
  
  // إعادة تحميل الصلاحيات
  refreshAccess: () => Promise<void>
  
  // الحصول على أول صفحة مسموحة
  getFirstAllowedPage: () => string
}

const AccessContext = createContext<AccessContextType | null>(null)

// =====================================================
// Helper Functions
// =====================================================

/**
 * 🔐 دالة مركزية لاختيار أول صفحة مسموحة
 * 
 * أولوية الصفحات:
 * 1. dashboard (إذا كان مسموحاً)
 * 2. approvals (إذا كان مسموحاً)
 * 3. invoices (المبيعات)
 * 4. sales_orders
 * 5. customers
 * 6. bills (المشتريات)
 * 7. purchase_orders
 * 8. suppliers
 * 9. products (المخزون)
 * 10. inventory
 * 11. payments (المالية)
 * 12. reports (التقارير)
 * 13. settings (الإعدادات)
 * 
 * @param allowedPages - قائمة الصفحات المسموح بها
 * @returns مسار أول صفحة مسموحة، أو "/no-access" إذا لم توجد صفحات
 */
export function getFirstAllowedRoute(allowedPages: string[]): string {
  // إذا لم توجد صفحات مسموحة
  if (!allowedPages || allowedPages.length === 0) {
    return "/no-access"
  }

  // أولوية الصفحات الرئيسية
  const priorityPages = [
    "dashboard",
    "approvals",
    "invoices",
    "sales_orders",
    "customers",
    "bills",
    "purchase_orders",
    "suppliers",
    "products",
    "inventory",
    "payments",
    "journal_entries",
    "reports",
    "settings",
  ]

  // البحث عن أول صفحة مسموحة حسب الأولوية
  for (const page of priorityPages) {
    if (allowedPages.includes(page)) {
      // تحويل resource إلى route
      return `/${page.replace(/_/g, "-")}`
    }
  }

  // إذا لم توجد صفحة من الأولويات، إرجاع أول صفحة من allowedPages
  const firstPage = allowedPages[0]
  if (firstPage) {
    return `/${firstPage.replace(/_/g, "-")}`
  }

  // إذا لم توجد أي صفحة، إرجاع /no-access
  return "/no-access"
}

/**
 * جلب Access Profile من API
 */
async function fetchAccessProfile(
  supabase: any,
  userId: string,
  companyId: string
): Promise<AccessProfile | null> {
  try {
    // جلب معلومات العضوية
    const { data: member } = await supabase
      .from("company_members")
      .select("role, branch_id, warehouse_id, cost_center_id")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle()

    if (!member) {
      return null
    }

    const role = String(member.role || "").trim().toLowerCase()

    // Owner/Admin/General Manager: كل الصلاحيات
    const isFullAccess = ["owner", "admin", "general_manager"].includes(role)

    let allowed_pages: string[] = []
    let allowed_actions: string[] = []

    if (isFullAccess) {
      // جميع الصفحات والعمليات
      allowed_pages = [
        "dashboard",
        "products",
        "inventory",
        "customers",
        "suppliers",
        "sales_orders",
        "purchase_orders",
        "invoices",
        "bills",
        "payments",
        "journal_entries",
        "banking",
        "reports",
        "chart_of_accounts",
        "shareholders",
        "settings",
        "users",
        "taxes",
        "branches",
        "warehouses",
        "cost_centers",
        // ... إلخ
      ]
      allowed_actions = ["*"] // كل العمليات
    } else {
      // جلب الصلاحيات من company_role_permissions
      const { data: permissions } = await supabase
        .from("company_role_permissions")
        .select("resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions")
        .eq("company_id", companyId)
        .eq("role", role)

      // بناء allowed_pages من الصلاحيات
      permissions?.forEach((perm: any) => {
        // إذا كان can_access = false، لا نضيف الصفحة
        if (perm.can_access === false) {
          return
        }
        
        // إذا كان all_access = true، نضيف الصفحة
        if (perm.all_access === true) {
          allowed_pages.push(perm.resource)
          return
        }
        
        // إذا كان لديه أي صلاحية (read, write, update, delete)، نضيف الصفحة
        if (perm.can_read || perm.can_write || perm.can_update || perm.can_delete || perm.can_access === true) {
          allowed_pages.push(perm.resource)
        }
      })

      // بناء allowed_actions
      permissions?.forEach((perm: any) => {
        if (perm.all_access) {
          allowed_actions.push(`${perm.resource}:*`)
        } else {
          if (perm.can_read) allowed_actions.push(`${perm.resource}:read`)
          if (perm.can_write) allowed_actions.push(`${perm.resource}:write`)
          if (perm.can_update) allowed_actions.push(`${perm.resource}:update`)
          if (perm.can_delete) allowed_actions.push(`${perm.resource}:delete`)
        }
        if (perm.allowed_actions && Array.isArray(perm.allowed_actions)) {
          allowed_actions.push(...perm.allowed_actions)
        }
      })
    }

    // جلب الفروع المسموح بها
    let allowed_branches: string[] = []
    if (!isFullAccess && member.branch_id) {
      allowed_branches = [member.branch_id]
    }

    // جلب المخازن المسموح بها
    let allowed_warehouses: string[] = []
    if (!isFullAccess && member.warehouse_id) {
      allowed_warehouses = [member.warehouse_id]
    }

    // جلب مراكز التكلفة المسموح بها
    let allowed_cost_centers: string[] = []
    if (!isFullAccess && member.cost_center_id) {
      allowed_cost_centers = [member.cost_center_id]
    }

    return {
      user_id: userId,
      company_id: companyId,
      role,
      branch_id: member.branch_id || null,
      warehouse_id: member.warehouse_id || null,
      cost_center_id: member.cost_center_id || null,
      allowed_pages: [...new Set(allowed_pages)], // إزالة التكرار
      allowed_actions: [...new Set(allowed_actions)], // إزالة التكرار
      allowed_branches,
      allowed_warehouses,
      allowed_cost_centers,
      is_owner: role === "owner",
      is_admin: role === "admin",
      is_manager: role === "manager",
      is_store_manager: role === "store_manager",
      is_staff: role === "staff" || role === "employee",
    }
  } catch (error) {
    console.error("[AccessContext] Error fetching access profile:", error)
    return null
  }
}

// =====================================================
// Provider Component
// =====================================================

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [profile, setProfile] = useState<AccessProfile | null>(null)

  // تحميل Access Profile
  const loadAccessProfile = useCallback(async () => {
    try {
      setIsLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setProfile(null)
        setIsReady(true)
        setIsLoading(false)
        return
      }

      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        setProfile(null)
        setIsReady(true)
        setIsLoading(false)
        return
      }

      const accessProfile = await fetchAccessProfile(supabase, user.id, companyId)
      setProfile(accessProfile)
      setIsReady(true)
    } catch (error) {
      console.error("[AccessContext] Error loading access profile:", error)
      setProfile(null)
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  // تحميل Access Profile عند البدء
  useEffect(() => {
    loadAccessProfile()
  }, [loadAccessProfile])

  // 🔐 استخدام نظام Realtime للحوكمة
  useGovernanceRealtime({
    onPermissionsChanged: loadAccessProfile,
    onRoleChanged: loadAccessProfile,
    onBranchOrWarehouseChanged: loadAccessProfile,
    showNotifications: true,
  })

  // دوال التحقق
  const canAccessPage = useCallback((resource: string): boolean => {
    if (!isReady || !profile) return false
    
    // Owner/Admin: كل الصفحات
    if (profile.is_owner || profile.is_admin) return true
    
    // الملف الشخصي متاح للجميع
    if (resource === "profile") return true
    
    // التحقق من allowed_pages
    return profile.allowed_pages.includes(resource)
  }, [isReady, profile])

  const canAction = useCallback((resource: string, action: string): boolean => {
    if (!isReady || !profile) return false
    
    // Owner/Admin: كل العمليات
    if (profile.is_owner || profile.is_admin) return true
    
    // التحقق من allowed_actions
    return profile.allowed_actions.includes(`${resource}:${action}`) ||
           profile.allowed_actions.includes(`${resource}:*`) ||
           profile.allowed_actions.includes("*")
  }, [isReady, profile])

  const canAccessBranch = useCallback((branchId: string): boolean => {
    if (!isReady || !profile) return false
    
    // Owner/Admin: كل الفروع
    if (profile.is_owner || profile.is_admin) return true
    
    // التحقق من allowed_branches
    return profile.allowed_branches.includes(branchId)
  }, [isReady, profile])

  const canAccessWarehouse = useCallback((warehouseId: string): boolean => {
    if (!isReady || !profile) return false
    
    // Owner/Admin: كل المخازن
    if (profile.is_owner || profile.is_admin) return true
    
    // التحقق من allowed_warehouses
    return profile.allowed_warehouses.includes(warehouseId)
  }, [isReady, profile])

  const getFirstAllowedPage = useCallback((): string => {
    if (!profile) {
      // إذا لم يكن هناك profile، إرجاع /no-access
      return "/no-access"
    }
    
    // 🔐 استخدام الدالة المركزية
    // حتى Owner/Admin يجب أن يمر عبر getFirstAllowedRoute
    // لأنهم قد لا يملكون dashboard في بعض الحالات النادرة
    return getFirstAllowedRoute(profile.allowed_pages)
  }, [profile])

  const value = useMemo<AccessContextType>(() => ({
    isLoading,
    isReady,
    profile,
    canAccessPage,
    canAction,
    canAccessBranch,
    canAccessWarehouse,
    refreshAccess: loadAccessProfile,
    getFirstAllowedPage,
  }), [isLoading, isReady, profile, canAccessPage, canAction, canAccessBranch, canAccessWarehouse, loadAccessProfile, getFirstAllowedPage])

  return (
    <AccessContext.Provider value={value}>
      {children}
    </AccessContext.Provider>
  )
}

// =====================================================
// Hook للاستخدام
// =====================================================

export function useAccess(): AccessContextType {
  const context = useContext(AccessContext)
  if (!context) {
    throw new Error("useAccess must be used within an AccessProvider")
  }
  return context
}
