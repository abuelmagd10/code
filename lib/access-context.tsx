/**
 * 🔐 Access Context - المصدر الوحيد للصلاحيات
 * 
 * ⚠️ CRITICAL SECURITY MODULE - DO NOT MODIFY WITHOUT REVIEW
 * 
 * هذا النظام جزء أساسي من نظام الأمان والتحديث الفوري.
 * راجع: docs/SECURITY_REALTIME_SYSTEM.md
 * 
 * ✅ القواعد الإلزامية:
 * 1. Single Source of Truth:
 *    - fetchAccessProfile() يقرأ من company_members مباشرة
 *    - role, branch_id, warehouse_id, cost_center_id من company_members فقط
 *    - لا joins، لا relations، لا جداول أخرى
 * 
 * 2. BLIND REFRESH Pattern:
 *    - refreshUserSecurityContext() يُستدعى عند أي UPDATE على company_members
 *    - بدون شروط، بدون مقارنات - فقط query جديد وتحديث كامل
 * 
 * 3. Realtime Integration:
 *    - يستمع لـ Realtime events من company_members و user_branch_access
 *    - عند affectsCurrentUser = true → refreshUserSecurityContext()
 * 
 * 4. التسلسل الإلزامي:
 *    - Realtime event → refreshUserSecurityContext() → fetchAccessProfile() → تحديث Context → إطلاق Events
 * 
 * ⚠️ تحذير: أي تعديل على هذا الملف يجب مراجعته مع:
 *    - lib/realtime-manager.ts
 *    - hooks/use-governance-realtime.ts
 *    - components/realtime-route-guard.tsx
 *    - docs/SECURITY_REALTIME_SYSTEM.md
 */

"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { useGovernanceRealtime } from "@/hooks/use-governance-realtime"
import { useToast } from "@/hooks/use-toast"
import { getRealtimeManager } from "@/lib/realtime-manager"
import { getResourceFromPath } from "@/lib/permissions-context"

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

  // ✅ Bootstrap state - يمنع redirect أثناء التهيئة
  isBootstrapComplete: boolean

  // Access Profile
  profile: AccessProfile | null

  // دوال التحقق
  canAccessPage: (resource: string) => boolean
  canAction: (resource: string, action: string) => boolean
  canAccessBranch: (branchId: string) => boolean
  canAccessWarehouse: (warehouseId: string) => boolean

  // إعادة تحميل الصلاحيات، وترجيع AccessProfile المحدّث
  refreshAccess: () => Promise<AccessProfile | null>

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
  // إذا لم توجد صفحات مسموحة، نفترض أنه يحتاج وقتاً للتحميل ونعطيه مسار اللوحة مؤقتاً
  if (!allowedPages || allowedPages.length === 0) {
    return "/dashboard"
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

  // إذا لم توجد أي صفحة من القائمة، إرجاع /dashboard لتجنب التوجيه الخاطئ المؤقت
  return "/dashboard"
}

/**
 * 🔐 جلب Access Profile من API (Single Source of Truth)
 * 
 * ⚠️ CRITICAL SECURITY FUNCTION - DO NOT MODIFY WITHOUT REVIEW
 * 
 * هذا الدالة جزء أساسي من نظام الأمان.
 * راجع: docs/SECURITY_REALTIME_SYSTEM.md
 * 
 * ✅ القواعد الإلزامية:
 * 1. Single Source of Truth:
 *    - البيانات تُقرأ دائماً من company_members مباشرة
 *    - لا joins، لا relations، لا جداول أخرى
 *    - role, branch_id, warehouse_id, cost_center_id من company_members فقط
 * 
 * 2. عند تغيير الدور أو الفرع:
 *    - يتم تحديث company_members في الداتابيس
 *    - Realtime event يتم إطلاقه تلقائياً
 *    - refreshUserSecurityContext() يُستدعى تلقائياً
 *    - هذه الدالة تُستدعى من refreshUserSecurityContext()
 * 
 * ⚠️ تحذير: أي تعديل على هذه الدالة يجب مراجعته مع:
 *    - lib/realtime-manager.ts
 *    - hooks/use-governance-realtime.ts
 */
async function fetchAccessProfile(
  supabase: any,
  userId: string,
  companyId: string
): Promise<AccessProfile | null> {
  try {
    // ✅ SINGLE SOURCE OF TRUTH: جلب معلومات العضوية من company_members مباشرة
    // ✅ هذا هو المصدر الوحيد للدور والفرع - لا joins، لا relations، لا جداول أخرى
    console.log(`📊 [AccessContext] fetchAccessProfile: Querying company_members (Single Source of Truth)`, {
      userId,
      companyId,
    })

    // ✅ Validation: التأكد من أن Query صحيح (من company_members فقط)
    const { data: member } = await supabase
      .from("company_members")
      .select("role, branch_id, warehouse_id, cost_center_id")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle()

    // ✅ Validation: التأكد من أن البيانات موجودة
    if (!member) {
      console.warn('⚠️ [AccessContext] fetchAccessProfile: No member found in company_members (Single Source of Truth)', {
        userId,
        companyId,
      })
      return null
    }

    console.log(`📊 [AccessContext] fetchAccessProfile: Member data retrieved`, {
      hasMember: !!member,
      role: member?.role,
      branchId: member?.branch_id,
      warehouseId: member?.warehouse_id,
      costCenterId: member?.cost_center_id,
    })

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

      // Default pages per role, matching the UI
      const defaultRolePages: Record<string, string[]> = {
        manager: [
          'dashboard', 'reports', 'invoices', 'customers', 'estimates', 'sales_orders', 'sales_returns', 'sent_invoice_returns', 'customer_debit_notes', 'bills', 'suppliers', 'purchase_orders', 'purchase_returns', 'vendor_credits', 'products', 'inventory', 'inventory_transfers', 'write_offs', 'third_party_inventory', 'product_availability', 'inventory_goods_receipt', 'payments', 'expenses', 'drawings', 'journal_entries', 'banking', 'chart_of_accounts', 'fixed_assets', 'asset_categories', 'fixed_assets_reports', 'annual_closing', 'hr', 'employees', 'attendance', 'payroll', 'instant_payouts', 'branches', 'cost_centers', 'warehouses'
        ],
        accountant: [
          'dashboard', 'reports', 'invoices', 'customers', 'sales_returns', 'customer_debit_notes', 'bills', 'suppliers', 'purchase_returns', 'vendor_credits', 'payments', 'expenses', 'drawings', 'journal_entries', 'chart_of_accounts', 'banking', 'annual_closing', 'shareholders', 'fixed_assets', 'asset_categories', 'fixed_assets_reports', 'taxes', 'exchange_rates', 'accounting_maintenance', 'products', 'inventory', 'inventory_transfers', 'write_offs', 'third_party_inventory', 'product_availability', 'inventory_goods_receipt'
        ],
        store_manager: [
          'dashboard', 'products', 'inventory', 'product_availability', 'inventory_transfers', 'third_party_inventory', 'write_offs', 'inventory_goods_receipt', 'purchase_orders', 'sales_orders', 'shipping'
        ],
        staff: [
          'dashboard', 'customers', 'estimates', 'sales_orders', 'invoices', 'inventory', 'product_availability', 'attendance'
        ],
        viewer: [
          'dashboard', 'reports'
        ],
      }

      // Initialize with default pages for the role
      allowed_pages = defaultRolePages[role] ? [...defaultRolePages[role]] : []

      // بناء allowed_pages من الصلاحيات (الاعتراضات تتخطى الافتراضيات)
      permissions?.forEach((perm: any) => {
        // إذا كان can_access = false، نحذف الصفحة من الافتراضيات ولا نضيفها
        if (perm.can_access === false) {
          allowed_pages = allowed_pages.filter(p => p !== perm.resource)
          return
        }
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
    // ✅ دعم الفروع المتعددة من user_branch_access (إذا كان موجوداً)
    // ✅ Fallback إلى branch_id من company_members (فرع واحد)
    let allowed_branches: string[] = []
    if (!isFullAccess) {
      // ✅ محاولة جلب الفروع من user_branch_access أولاً (دعم فروع متعددة)
      try {
        const { data: branchAccess } = await supabase
          .from("user_branch_access")
          .select("branch_id")
          .eq("company_id", companyId)
          .eq("user_id", userId)
          .eq("is_active", true)

        if (branchAccess && branchAccess.length > 0) {
          allowed_branches = branchAccess.map((a: any) => a.branch_id).filter(Boolean)
        }
      } catch (error) {
        // ✅ إذا فشل query user_branch_access، نستخدم branch_id من company_members
        console.warn("[AccessContext] Error fetching user_branch_access, falling back to company_members.branch_id:", error)
      }

      // ✅ Fallback: إذا لم يكن هناك فروع من user_branch_access، نستخدم branch_id من company_members
      if (allowed_branches.length === 0 && member.branch_id) {
        allowed_branches = [member.branch_id]
      }
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
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isReady, setIsReady] = useState(false)
  const [isBootstrapComplete, setIsBootstrapComplete] = useState(false)
  const [profile, setProfile] = useState<AccessProfile | null>(null)
  const isRefreshingRef = useRef(false) // منع التكرار أثناء التحديث
  const bootstrapCheckedRef = useRef(false) // منع فحص bootstrap المتكرر

  // تحميل Access Profile
  const loadAccessProfile = useCallback(async (): Promise<AccessProfile | null> => {
    try {
      console.log('🔄 [AccessContext] loadAccessProfile called')
      setIsLoading(true)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.warn('⚠️ [AccessContext] No user found in loadAccessProfile')
        setProfile(null)
        setIsReady(true)
        setIsLoading(false)
        return null
      }

      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        console.warn('⚠️ [AccessContext] No company ID found in loadAccessProfile')
        setProfile(null)
        setIsReady(true)
        setIsLoading(false)
        return null
      }

      console.log('🔄 [AccessContext] Fetching access profile...', { userId: user.id, companyId })
      const accessProfile = await fetchAccessProfile(supabase, user.id, companyId)
      console.log('✅ [AccessContext] Access profile loaded:', {
        branchId: accessProfile?.branch_id,
        role: accessProfile?.role,
        allowedPages: accessProfile?.allowed_pages?.length || 0,
        allowedBranches: accessProfile?.allowed_branches?.length || 0,
      })
      setProfile(accessProfile)
      setIsReady(true)
      return accessProfile
    } catch (error: any) {
      // ✅ معالجة AbortError بشكل صحيح
      if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
        console.warn('⚠️ [AccessContext] Loading access profile aborted (component unmounted)')
        return null
      }
      console.error("[AccessContext] Error loading access profile:", error)
      setProfile(null)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  /**
   * 🔐 إعادة تهيئة كاملة للسياق الأمني (BLIND REFRESH Pattern)
   * 
   * ⚠️ CRITICAL SECURITY FUNCTION - DO NOT MODIFY WITHOUT REVIEW
   * 
   * هذا الدالة جزء أساسي من نظام الأمان والتحديث الفوري.
   * راجع: docs/SECURITY_REALTIME_SYSTEM.md
   * 
   * ✅ القواعد الإلزامية:
   * 1. عند أي UPDATE على company_members أو user_branch_access للمستخدم الحالي:
   *    - يتم استدعاء هذه الدالة تلقائياً من Realtime handler
   *    - بدون أي شروط أو مقارنات (BLIND REFRESH)
   * 
   * 2. التسلسل الإلزامي:
   *    - Query جديد من الداتابيس (fetchAccessProfile)
   *    - تحديث AccessContext state
   *    - إطلاق events: permissions_updated, access_profile_updated, user_context_changed
   *    - إعادة تهيئة Realtime subscriptions
   *    - إعادة فحص الصلاحيات في PageGuard
   *    - إعادة توجيه لأول صفحة مسموحة (إذا لزم الأمر)
   * 
   * 3. Single Source of Truth:
   *    - البيانات تُقرأ دائماً من company_members مباشرة
   *    - لا joins، لا relations، لا جداول أخرى
   * 
   * ⚠️ تحذير: أي تعديل على هذه الدالة يجب مراجعته مع:
   *    - lib/realtime-manager.ts
   *    - hooks/use-governance-realtime.ts
   *    - components/realtime-route-guard.tsx
   */
  const refreshUserSecurityContext = useCallback(async (branchChanged: boolean = false) => {
    // منع التكرار
    if (isRefreshingRef.current) {
      console.log('🔄 [AccessContext] Already refreshing security context, skipping...')
      return
    }

    try {
      isRefreshingRef.current = true
      console.log('🔄 [AccessContext] BLIND REFRESH: Refreshing user security context (full server query, no conditions)...', {
        branchChanged,
        timestamp: new Date().toISOString(),
      })

      // 🔹 1. إعادة تحميل بيانات المستخدم كاملة من السيرفر
      // ✅ هذا يحدث profile فقط - لا unmount للـ context
      const oldBranchId = profile?.branch_id || null
      const freshProfile = await loadAccessProfile()
      if (!freshProfile) {
        console.warn('⚠️ [AccessContext] Failed to load fresh profile')
        return
      }

      // 🔹 1.5. التحقق من تغيير الفرع وتحديثه تلقائياً
      // ✅ نتحقق من تغيير الفرع دائماً (حتى لو لم يتم تمرير branchChanged = true)
      // ✅ لأن branch_id قد يتغير من خلال Realtime حتى لو لم يكن branchChanged معرّف
      const newBranchId = freshProfile.branch_id || null
      const actualBranchChanged = oldBranchId !== newBranchId

      if (actualBranchChanged && newBranchId) {
        console.log(`🔄 [AccessContext] Branch changed from ${oldBranchId} to ${newBranchId}, updating context...`)

        // ✅ إطلاق event لتحديث الفرع في جميع أنحاء التطبيق
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('user_context_changed', {
            detail: {
              oldBranchId,
              newBranchId,
              reason: branchChanged ? 'branch_changed_via_realtime' : 'branch_changed_detected'
            }
          }))
        }
      } else if (actualBranchChanged && !newBranchId) {
        // ✅ إذا تم إزالة الفرع (newBranchId = null)
        console.warn(`⚠️ [AccessContext] Branch was removed (was ${oldBranchId}), user may need to be reassigned`)
      }

      // 🔹 2. تحديث Realtime Manager بسياق الفرع الجديد
      // ✅ تحديث السياق فقط - لا unmount
      try {
        const realtimeManager = getRealtimeManager()
        await realtimeManager.updateContext()
        console.log('✅ [AccessContext] Realtime context updated')
      } catch (realtimeError: any) {
        // ✅ معالجة AbortError بشكل صحيح
        if (realtimeError?.name === 'AbortError' || realtimeError?.message?.includes('aborted')) {
          console.warn('⚠️ [AccessContext] Realtime context update aborted')
          return
        }
        console.error('❌ [AccessContext] Error updating realtime context:', realtimeError)
      }

      // 🔹 3. تحديث البيانات فقط - لا إعادة توجيه ولا unmount
      // ✅ إعادة التوجيه يتم التعامل معها في RealtimeRouteGuard
      // ✅ لا unmount للـ contexts - فقط تحديث state
      const currentResource = getResourceFromPath(pathname)
      const hasAccess = freshProfile.is_owner || freshProfile.is_admin || freshProfile.allowed_pages.includes(currentResource)

      if (!hasAccess) {
        console.log(`⚠️ [AccessContext] Current page ${pathname} is no longer allowed after context update`)
        // ✅ لا نعيد التوجيه هنا - سيتم التعامل معه في RealtimeRouteGuard
        // ✅ لا unmount - فقط تحديث البيانات
      } else {
        console.log(`✅ [AccessContext] Current page ${pathname} is still allowed after context update`)
      }

      // 🔹 4. إطلاق events لتحديث UI والصلاحيات (إلزامي - بدون شروط)
      // ✅ في ERP احترافي: يجب إطلاق الأحداث الثلاثة دائماً عند أي تحديث للسياق الأمني
      // ✅ بدون شروط، بدون فلاتر، بدون تحقق - فقط إطلاق الأحداث دائماً
      if (typeof window !== 'undefined') {
        // ✅ 1. إطلاق event لتحديث UI (Sidebar, Menus, etc.)
        window.dispatchEvent(new Event('access_profile_updated'))
        console.log('✅ [AccessContext] access_profile_updated event dispatched')

        // ✅ 2. إطلاق event للمكونات الأخرى التي تستمع لـ permissions_updated
        // ✅ هذه المكونات لا تستخدم useGovernanceRealtime مباشرة
        window.dispatchEvent(new Event('permissions_updated'))
        console.log('✅ [AccessContext] permissions_updated event dispatched')

        // ✅ 3. إطلاق user_context_changed event إذا تغير الفرع (أو دائماً للتأكد)
        // ✅ هذا يضمن تحديث جميع المكونات التي تعتمد على الفرع
        if (actualBranchChanged) {
          // ✅ تم إطلاقه أعلاه في السطر 410
          console.log('✅ [AccessContext] user_context_changed event already dispatched (branch changed)')
        } else {
          // ✅ حتى لو لم يتغير الفرع، نطلقه للتأكد من تحديث جميع المكونات
          window.dispatchEvent(new CustomEvent('user_context_changed', {
            detail: {
              oldBranchId: oldBranchId,
              newBranchId: newBranchId,
              reason: 'security_context_refreshed'
            }
          }))
          console.log('✅ [AccessContext] user_context_changed event dispatched (security context refreshed)')
        }
      }

      console.log('✅ [AccessContext] Security context refreshed successfully (data only)')
    } catch (error: any) {
      // ✅ معالجة AbortError بشكل صحيح
      if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
        console.warn('⚠️ [AccessContext] Security context refresh aborted (component unmounted)')
        return
      }
      console.error('❌ [AccessContext] Error refreshing security context:', error)
      toast({
        title: "خطأ في تحديث السياق",
        description: "حدث خطأ أثناء تحديث السياق. يرجى تحديث الصفحة.",
        variant: "destructive",
      })
    } finally {
      isRefreshingRef.current = false
    }
  }, [supabase, pathname, loadAccessProfile, toast, profile])

  // 🔐 توجيه تلقائي لأول صفحة مسموحة
  const redirectToFirstAllowedPage = useCallback(() => {
    if (!profile) {
      router.replace('/dashboard')
      return
    }

    const firstPage = getFirstAllowedRoute(profile.allowed_pages)
    console.log(`🔄 [AccessContext] Redirecting to first allowed page: ${firstPage}`)
    router.replace(firstPage)
  }, [profile, router])

  // ✅ فحص اكتمال Bootstrap (Access + Permissions)
  useEffect(() => {
    if (bootstrapCheckedRef.current) return

    // ✅ التحقق من اكتمال Access
    if (!isReady) return

    // ✅ التحقق من اكتمال Permissions عبر event
    // PermissionsContext يطلق 'permissions_ready' event عند اكتمال التحميل
    const handlePermissionsReady = () => {
      if (!bootstrapCheckedRef.current && isReady) {
        bootstrapCheckedRef.current = true
        setIsBootstrapComplete(true)

        // ✅ إطلاق event عند اكتمال bootstrap
        if (typeof window !== 'undefined') {
          console.log('✅ [AccessContext] Bootstrap complete - Access + Permissions loaded')
          window.dispatchEvent(new Event('bootstrap_complete'))
        }
      }
    }

    // ✅ الاستماع لـ permissions_ready event
    if (typeof window !== 'undefined') {
      window.addEventListener('permissions_ready', handlePermissionsReady)

      // ✅ إذا كان Permissions جاهزاً بالفعل (من localStorage cache)
      // نتحقق مباشرة
      const timeoutId = setTimeout(() => {
        // محاولة قراءة من localStorage للتحقق
        const permsLoaded = localStorage.getItem('erp_permissions_loaded')
        if (permsLoaded === 'true' && isReady && !bootstrapCheckedRef.current) {
          handlePermissionsReady()
        }
      }, 100)

      return () => {
        window.removeEventListener('permissions_ready', handlePermissionsReady)
        clearTimeout(timeoutId)
      }
    }
  }, [isReady])

  // تحميل Access Profile عند البدء
  useEffect(() => {
    loadAccessProfile()
  }, [loadAccessProfile])

  // 🔄 تحديث Access Profile عند تغيير الشركة النشطة من الواجهة (Sidebar أو غيره)
  useEffect(() => {
    const handleCompanyUpdated = () => {
      console.log('🔄 [AccessContext] company_updated event received, refreshing security context...')
      // ✅ BLIND REFRESH بناءً على الشركة الجديدة في getActiveCompanyId
      refreshUserSecurityContext(false)
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('company_updated', handleCompanyUpdated)
      return () => {
        window.removeEventListener('company_updated', handleCompanyUpdated)
      }
    }
  }, [refreshUserSecurityContext])

  // 🔐 الاستماع لـ user_context_changed event
  useEffect(() => {
    const handleUserContextChanged = () => {
      console.log('🔄 [AccessContext] user_context_changed event received')
      refreshUserSecurityContext()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('user_context_changed', handleUserContextChanged)
      return () => {
        window.removeEventListener('user_context_changed', handleUserContextChanged)
      }
    }
  }, [refreshUserSecurityContext])

  // 🔐 استخدام نظام Realtime للحوكمة (BLIND REFRESH)
  // ✅ عند أي UPDATE على company_members للمستخدم الحالي:
  // ✅ 1. RealtimeManager يستقبل الحدث من Supabase
  // ✅ 2. useGovernanceRealtime يستدعي onPermissionsChanged مباشرة (بدون شروط)
  // ✅ 3. refreshUserSecurityContext يقوم بـ query جديد من company_members (Single Source of Truth)
  // ✅ 4. يتم تحديث AccessContext كامل وإطلاق الأحداث الثلاثة
  useGovernanceRealtime({
    onPermissionsChanged: async () => {
      // ✅ BLIND REFRESH: استدعاء refreshUserSecurityContext مباشرة بدون أي شروط
      // ✅ هذا يضمن أن أي تغيير في company_members يتم اكتشافه وتحديثه فوراً
      console.log('🔄 [AccessContext] BLIND REFRESH triggered via Realtime (onPermissionsChanged) - calling refreshUserSecurityContext...')
      // ✅ استخدام refreshUserSecurityContext لإعادة تحميل كامل من company_members (Single Source of Truth)
      await refreshUserSecurityContext(false)
      console.log('✅ [AccessContext] BLIND REFRESH completed successfully')
      // ✅ لا نعيد قيمة - فقط تحديث السياق
      // ✅ إعادة التوجيه يتم التعامل معها في RealtimeRouteGuard
    },
    onRoleChanged: async () => {
      // ✅ BLIND REFRESH: نفس المنطق - استدعاء refreshUserSecurityContext مباشرة
      // ✅ (هذا handler لن يُستدعى بعد Blind Refresh، لكن نتركه للتوافق مع الكود القديم)
      console.log('🔄 [AccessContext] BLIND REFRESH triggered via Realtime (onRoleChanged) - calling refreshUserSecurityContext...')
      await refreshUserSecurityContext(false)
      console.log('✅ [AccessContext] BLIND REFRESH completed successfully')
    },
    onBranchOrWarehouseChanged: async () => {
      // ✅ BLIND REFRESH: نفس المنطق - استدعاء refreshUserSecurityContext مباشرة
      // ✅ (هذا handler لن يُستدعى بعد Blind Refresh، لكن نتركه للتوافق مع الكود القديم)
      console.log('🔄 [AccessContext] BLIND REFRESH triggered via Realtime (onBranchOrWarehouseChanged) - calling refreshUserSecurityContext...')
      await refreshUserSecurityContext(true)
      console.log('✅ [AccessContext] BLIND REFRESH completed successfully')
    },
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
      // إذا لم يكن هناك profile، نفترض التوجيه للوحة لتجنب الفلاش المزعج
      return "/dashboard"
    }

    // 🔐 استخدام الدالة المركزية
    // حتى Owner/Admin يجب أن يمر عبر getFirstAllowedRoute
    // لأنهم قد لا يملكون dashboard في بعض الحالات النادرة
    return getFirstAllowedRoute(profile.allowed_pages)
  }, [profile])

  const value = useMemo<AccessContextType>(() => ({
    isLoading,
    isReady,
    isBootstrapComplete,
    profile,
    canAccessPage,
    canAction,
    canAccessBranch,
    canAccessWarehouse,
    refreshAccess: async () => {
      // نستخدم نتيجة loadAccessProfile مباشرة بدلاً من الاعتماد على state في نفس الدورة
      const freshProfile = await loadAccessProfile()
      return freshProfile
    },
    getFirstAllowedPage,
  }), [isLoading, isReady, isBootstrapComplete, profile, canAccessPage, canAction, canAccessBranch, canAccessWarehouse, loadAccessProfile, getFirstAllowedPage])

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