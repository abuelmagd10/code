"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"

// واجهات البيانات
export interface PermissionData {
  resource: string
  can_access: boolean
  can_read: boolean
  can_write: boolean
  can_update: boolean
  can_delete: boolean
  all_access: boolean
  allowed_actions: string[]
}

export interface PermissionsContextType {
  // حالة التحميل
  isLoading: boolean
  isReady: boolean

  // بيانات المستخدم
  userId: string | null
  companyId: string | null
  role: string

  // الموارد المحجوبة
  deniedResources: string[]

  // دوال التحقق
  canAccessPage: (resource: string) => boolean
  canAction: (resource: string, action: string) => boolean

  // إعادة تحميل الصلاحيات
  refreshPermissions: () => Promise<void>
}

const PermissionsContext = createContext<PermissionsContextType | null>(null)

// خريطة المسارات للموارد
const PATH_TO_RESOURCE: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/customers': 'customers',
  '/invoices': 'invoices',
  '/sales-orders': 'sales_orders',
  '/sales-returns': 'sales_returns',
  '/sent-invoice-returns': 'sent_invoice_returns',
  '/suppliers': 'suppliers',
  '/bills': 'bills',
  '/purchase-orders': 'purchase_orders',
  '/purchase-returns': 'purchase_returns',
  '/vendor-credits': 'vendor_credits',
  '/products': 'products',
  '/inventory': 'inventory',
  '/inventory/third-party': 'third_party_inventory',
  '/inventory/write-offs': 'write_offs',
  '/payments': 'payments',
  '/journal-entries': 'journal_entries',
  '/chart-of-accounts': 'chart_of_accounts',
  '/banking': 'banking',
  '/shareholders': 'shareholders',
  '/fixed-assets': 'fixed_assets',
  '/fixed-assets/categories': 'asset_categories',
  '/fixed-assets/reports': 'fixed_assets_reports',
  '/reports': 'reports',
  '/hr': 'hr',
  '/hr/employees': 'employees',
  '/hr/attendance': 'attendance',
  '/hr/payroll': 'payroll',
  '/branches': 'branches',
  '/cost-centers': 'cost_centers',
  '/warehouses': 'warehouses',
  '/settings': 'settings',
  '/settings/users': 'users',
  '/settings/taxes': 'taxes',
  '/settings/exchange-rates': 'exchange_rates',
  '/settings/audit-log': 'audit_log',
  '/settings/backup': 'backup',
  '/settings/shipping': 'shipping',
  '/settings/profile': 'profile',
  '/settings/orders-rules': 'orders_rules',
  '/settings/accounting-maintenance': 'accounting_maintenance',
  '/estimates': 'estimates',
}

export function getResourceFromPath(path: string): string {
  // إزالة query params
  const cleanPath = path.split('?')[0]

  // البحث عن تطابق مباشر أولاً
  if (PATH_TO_RESOURCE[cleanPath]) {
    return PATH_TO_RESOURCE[cleanPath]
  }

  // البحث عن تطابق جزئي (للمسارات الديناميكية مثل /invoices/123)
  for (const [pattern, resource] of Object.entries(PATH_TO_RESOURCE)) {
    if (cleanPath.startsWith(pattern + '/') || cleanPath === pattern) {
      return resource
    }
  }

  // إرجاع المسار كما هو إذا لم يوجد تطابق
  return cleanPath.replace(/^\//, '').replace(/-/g, '_').split('/')[0] || 'dashboard'
}

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const supabase = useSupabase()
  const [isLoading, setIsLoading] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [role, setRole] = useState<string>("")
  const [permissions, setPermissions] = useState<PermissionData[]>([])
  const [deniedResources, setDeniedResources] = useState<string[]>([])

  // تحميل الصلاحيات
  const loadPermissions = useCallback(async () => {
    setIsLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setIsReady(true)
        setIsLoading(false)
        return
      }
      setUserId(user.id)

      const cid = await getActiveCompanyId(supabase)
      if (!cid) {
        setIsReady(true)
        setIsLoading(false)
        return
      }
      setCompanyId(cid)

      // جلب الدور
      const { data: member } = await supabase
        .from("company_members")
        .select("role")
        .eq("company_id", cid)
        .eq("user_id", user.id)
        .maybeSingle()

      const userRole = String(member?.role || "")
      setRole(userRole)

      // owner و admin لديهم كل الصلاحيات
      if (["owner", "admin"].includes(userRole)) {
        setDeniedResources([])
        setPermissions([])
        setIsReady(true)
        setIsLoading(false)
        return
      }

      // جلب الصلاحيات من قاعدة البيانات
      const { data: perms } = await supabase
        .from("company_role_permissions")
        .select("resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions")
        .eq("company_id", cid)
        .eq("role", userRole)

      setPermissions(perms || [])

      // حساب الموارد المحجوبة
      const denied = (perms || [])
        .filter((p: any) => {
          if (p.can_access === false) return true
          if (!p.all_access && !p.can_read && !p.can_write && !p.can_update && !p.can_delete && p.can_access !== true) return true
          return false
        })
        .map((p: any) => String(p.resource || ""))

      setDeniedResources(denied)
    } catch (error) {
      console.error("Error loading permissions:", error)
    } finally {
      setIsReady(true)
      setIsLoading(false)
    }
  }, [supabase])

  // التحقق من إمكانية الوصول للصفحة
  const canAccessPage = useCallback((resource: string): boolean => {
    // أثناء التحميل، نعود false لمنع الوميض
    if (!isReady) return false

    // owner و admin لديهم كل الصلاحيات
    if (["owner", "admin"].includes(role)) return true

    // الملف الشخصي متاح للجميع
    if (resource === "profile") return true

    // التحقق من الموارد المحجوبة
    return !deniedResources.includes(resource)
  }, [isReady, role, deniedResources])

  // التحقق من صلاحية عملية معينة
  const canAction = useCallback((resource: string, action: string): boolean => {
    if (!isReady) return false
    if (["owner", "admin"].includes(role)) return true

    const perm = permissions.find(p => p.resource === resource)
    if (!perm) return ["read", "write", "update"].includes(action) // افتراضي
    if (perm.all_access) return true

    switch (action) {
      case "read": return perm.can_read !== false
      case "write": return perm.can_write !== false
      case "update": return perm.can_update !== false
      case "delete": return perm.can_delete === true
      default:
        return (perm.allowed_actions || []).includes(`${resource}:${action}`)
    }
  }, [isReady, role, permissions])

  // تحميل الصلاحيات عند البدء
  useEffect(() => {
    loadPermissions()
  }, [loadPermissions])

  // الاستماع لتغييرات الصلاحيات
  useEffect(() => {
    const handlePermissionsUpdate = () => {
      loadPermissions()
    }

    if (typeof window !== "undefined") {
      window.addEventListener("permissions_updated", handlePermissionsUpdate)
      return () => window.removeEventListener("permissions_updated", handlePermissionsUpdate)
    }
  }, [loadPermissions])

  const value = useMemo<PermissionsContextType>(() => ({
    isLoading,
    isReady,
    userId,
    companyId,
    role,
    deniedResources,
    canAccessPage,
    canAction,
    refreshPermissions: loadPermissions,
  }), [isLoading, isReady, userId, companyId, role, deniedResources, canAccessPage, canAction, loadPermissions])

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions(): PermissionsContextType {
  const context = useContext(PermissionsContext)
  if (!context) {
    throw new Error("usePermissions must be used within a PermissionsProvider")
  }
  return context
}

// Hook للتحقق السريع
export function useCanAccessPage(resource: string): { canAccess: boolean; isLoading: boolean } {
  const { canAccessPage, isLoading, isReady } = usePermissions()
  return {
    canAccess: canAccessPage(resource),
    isLoading: !isReady || isLoading,
  }
}

