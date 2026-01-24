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

  // 🔐 إعادة تهيئة كاملة للسياق الأمني (عند تغيير الفرع)
  // ✅ تحديث البيانات فقط - لا unmount للـ contexts
  const refreshUserSecurityContext = useCallback(async (branchChanged: boolean = false) => {
    // منع التكرار
    if (isRefreshingRef.current) {
      console.log('🔄 [AccessContext] Already refreshing security context, skipping...')
      return
    }

    try {
      isRefreshingRef.current = true
      console.log('🔄 [AccessContext] Refreshing user security context (data only, no redirect)...', { branchChanged })

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
      router.replace('/no-access')
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

  // 🔐 استخدام نظام Realtime للحوكمة
  useGovernanceRealtime({
    onPermissionsChanged: async () => {
      // ✅ تحديث البيانات فقط - لا إعادة توجيه
      console.log('🔄 [AccessContext] Permissions changed via Realtime, reloading profile...')
      // ✅ استخدام refreshUserSecurityContext لإعادة تحميل كامل مع إطلاق الأحداث
      await refreshUserSecurityContext(false)
      // ✅ لا نعيد قيمة - فقط تحديث السياق
      // ✅ إعادة التوجيه يتم التعامل معها في RealtimeRouteGuard
    },
    onRoleChanged: async () => {
      // ✅ تحديث البيانات فقط - لا إعادة توجيه
      console.log('🔄 [AccessContext] Role changed via Realtime, reloading profile...')
      // ✅ استخدام refreshUserSecurityContext لإعادة تحميل كامل مع إطلاق الأحداث
      await refreshUserSecurityContext(false)
      // ✅ لا نعيد قيمة - فقط تحديث السياق
      // ✅ إعادة التوجيه يتم التعامل معها في RealtimeRouteGuard
    },
    onBranchOrWarehouseChanged: async () => {
      // ✅ تحديث البيانات فقط - لا إعادة توجيه
      console.log('🔄 [AccessContext] Branch/Warehouse changed via Realtime, refreshing context...')
      // ✅ استخدام refreshUserSecurityContext مع branchChanged = true لإطلاق user_context_changed event
      await refreshUserSecurityContext(true)
      // ✅ إعادة التوجيه يتم التعامل معها في RealtimeRouteGuard
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
    isBootstrapComplete,
    profile,
    canAccessPage,
    canAction,
    canAccessBranch,
    canAccessWarehouse,
    refreshAccess: async () => {
      await loadAccessProfile()
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