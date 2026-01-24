/**
 * 🔐 Realtime Route Guard - حماية المسارات لحظياً
 * 
 * مكون مركزي يحمي جميع المسارات ويحدثها فوراً عند تغيير الصلاحيات
 * 
 * 🎯 المعيار المعتمد في ERP:
 * 1. إعادة تحميل السياق الأمني أولاً (refreshUserSecurityContext)
 * 2. إعادة تقييم الصفحة الحالية
 * 3. إذا كانت مسموحة → ابقَ فيها
 * 4. إذا لم تعد مسموحة → انتقل لأول صفحة مسموحة ديناميكياً
 */

"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useAccess } from "@/lib/access-context"
import { getResourceFromPath } from "@/lib/permissions-context"
import { useGovernanceRealtime } from "@/hooks/use-governance-realtime"
import { Loader2, ShieldAlert } from "lucide-react"

/**
 * Realtime Route Guard Component
 * 
 * يحمي المسارات ويحدثها فوراً عند تغيير الصلاحيات
 */
export function RealtimeRouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { isReady, canAccessPage, getFirstAllowedPage, profile } = useAccess()
  const [isChecking, setIsChecking] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)
  const isReevaluatingRef = useRef(false) // منع إعادة التقييم المتعددة المتزامنة
  const lastProfileVersionRef = useRef<string | null>(null) // تتبع نسخة profile لتجنب إعادة التقييم المكررة

  // 🔐 دالة مركزية لإعادة تقييم الصفحة الحالية بعد تحديث السياق الأمني
  const reevaluateCurrentRoute = useCallback(async () => {
    // منع إعادة التقييم المتعددة المتزامنة
    if (isReevaluatingRef.current) {
      console.log('🔄 [RealtimeRouteGuard] Already reevaluating route, skipping...')
      return
    }

    try {
      isReevaluatingRef.current = true
      console.log('🔄 [RealtimeRouteGuard] Starting route reevaluation...', { pathname })

      // ✅ انتظار حتى يكتمل تحديث profile (بحد أقصى 2 ثانية)
      // ✅ نتحقق من أن profile موجود وجاهز قبل المتابعة
      let attempts = 0
      const maxAttempts = 20 // 20 * 100ms = 2 seconds
      const initialProfileVersion = profile 
        ? `${profile.role}-${profile.branch_id}-${profile.allowed_pages.length}-${profile.allowed_branches.length}`
        : null

      // ✅ إذا كان profile موجوداً بالفعل، ننتظر قليلاً فقط لضمان اكتمال التحديثات
      if (initialProfileVersion) {
        // انتظار 200ms لضمان اكتمال refreshUserSecurityContext
        await new Promise(resolve => setTimeout(resolve, 200))
      } else {
        // ✅ إذا لم يكن profile موجوداً، ننتظر حتى يظهر
        while (attempts < maxAttempts) {
          // التحقق من أن profile أصبح موجوداً
          if (profile) {
            const currentProfileVersion = `${profile.role}-${profile.branch_id}-${profile.allowed_pages.length}-${profile.allowed_branches.length}`
            if (currentProfileVersion !== lastProfileVersionRef.current) {
              // ✅ Profile محدث - يمكن المتابعة
              lastProfileVersionRef.current = currentProfileVersion
              break
            }
          }

          // انتظار 100ms قبل المحاولة التالية
          await new Promise(resolve => setTimeout(resolve, 100))
          attempts++
        }

        if (attempts >= maxAttempts) {
          console.warn('⚠️ [RealtimeRouteGuard] Timeout waiting for profile update, proceeding anyway...')
        }
      }

      // ✅ إعادة فحص الصلاحية للصفحة الحالية
      if (!isReady || !profile) {
        console.warn('⚠️ [RealtimeRouteGuard] Access context not ready, skipping reevaluation')
        return
      }

      const resource = getResourceFromPath(pathname)
      const access = canAccessPage(resource)

      console.log('🔍 [RealtimeRouteGuard] Route evaluation result:', {
        pathname,
        resource,
        access,
        hasProfile: !!profile,
        allowedPages: profile.allowed_pages.length,
      })

      if (access) {
        // ✅ الصفحة الحالية لا تزال مسموحة - لا نعيد التوجيه
        setHasAccess(true)
        console.log(`✅ [RealtimeRouteGuard] Current page ${pathname} is still allowed - staying on page`)
      } else {
        // ❌ الصفحة الحالية لم تعد مسموحة - إعادة توجيه ديناميكية
        setHasAccess(false)
        
        // ✅ حساب أول صفحة مسموحة ديناميكياً (ليست dashboard ثابتة)
        const redirectTo = getFirstAllowedPage()
        
        console.log('🔄 [RealtimeRouteGuard] Current page no longer allowed, calculating redirect...', {
          currentPath: pathname,
          redirectTo,
          allowedPages: profile.allowed_pages,
        })

        // ✅ التحقق من أن الصفحة الهدف صالحة
        if (redirectTo && redirectTo !== "/no-access") {
          console.log(`🔄 [RealtimeRouteGuard] Redirecting from ${pathname} to ${redirectTo} (first allowed page)`)
          router.replace(redirectTo)
        } else {
          console.error(`❌ [RealtimeRouteGuard] No allowed pages found for user - redirecting to /no-access`)
          setHasAccess(false)
          router.replace('/no-access')
        }
      }
    } catch (error) {
      console.error('❌ [RealtimeRouteGuard] Error during route reevaluation:', error)
      setHasAccess(false)
    } finally {
      isReevaluatingRef.current = false
    }
  }, [pathname, isReady, profile, canAccessPage, getFirstAllowedPage, router])

  // 🔐 الاستماع لتحديثات الصلاحيات من Realtime
  useGovernanceRealtime({
    onRoleChanged: async () => {
      // ✅ عند تغيير الدور، إعادة تقييم الصفحة الحالية
      console.log("🔄 [RealtimeRouteGuard] Role changed via Realtime, will reevaluate route after context update...")
      // ✅ لا نستدعي reevaluateCurrentRoute مباشرة - ننتظر حتى يكتمل refreshUserSecurityContext
      // ✅ سيتم استدعاؤها تلقائياً عند تحديث profile (في useEffect أدناه)
    },
    onPermissionsChanged: async () => {
      // ✅ عند تغيير الصلاحيات، إعادة تقييم الصفحة الحالية
      console.log("🔄 [RealtimeRouteGuard] Permissions changed via Realtime, will reevaluate route after context update...")
      // ✅ لا نستدعي reevaluateCurrentRoute مباشرة - ننتظر حتى يكتمل refreshUserSecurityContext
      // ✅ سيتم استدعاؤها تلقائياً عند تحديث profile (في useEffect أدناه)
    },
    onBranchOrWarehouseChanged: async () => {
      // ✅ عند تغيير الفرع/المخزن، إعادة تقييم الصفحة الحالية
      console.log("🔄 [RealtimeRouteGuard] Branch/Warehouse changed via Realtime, will reevaluate route after context update...")
      // ✅ لا نستدعي reevaluateCurrentRoute مباشرة - ننتظر حتى يكتمل refreshUserSecurityContext
      // ✅ سيتم استدعاؤها تلقائياً عند تحديث profile (في useEffect أدناه)
    },
    showNotifications: true,
  })

  // 🔐 الاستماع لتحديثات profile لإعادة تقييم الصفحة تلقائياً
  useEffect(() => {
    // ✅ فقط إذا كان AccessContext جاهزاً و profile موجود
    if (!isReady || !profile) {
      return
    }

    // ✅ التحقق من أن profile تغير فعلياً (ليس مجرد mount أولي)
    const currentProfileVersion = `${profile.role}-${profile.branch_id}-${profile.allowed_pages.length}-${profile.allowed_branches.length}`
    
    if (currentProfileVersion === lastProfileVersionRef.current) {
      // ✅ نفس النسخة - لا حاجة لإعادة التقييم
      return
    }

    // ✅ Profile تغير - إعادة تقييم الصفحة الحالية
    console.log('🔄 [RealtimeRouteGuard] Profile updated, triggering route reevaluation...', {
      role: profile.role,
      branchId: profile.branch_id,
      allowedPagesCount: profile.allowed_pages.length,
    })

    // ✅ تأخير بسيط لضمان اكتمال جميع التحديثات
    const timeoutId = setTimeout(() => {
      reevaluateCurrentRoute()
    }, 150) // 150ms لضمان اكتمال refreshUserSecurityContext

    return () => {
      clearTimeout(timeoutId)
    }
  }, [profile, isReady, reevaluateCurrentRoute])

  // 🔐 فحص الصلاحية عند تحميل الصفحة أو تغيير المسار (الفحص الأولي فقط)
  useEffect(() => {
    if (!isReady) {
      setIsChecking(true)
      return
    }

    // ✅ فقط إذا لم يكن هناك profile محدث بعد، نستخدم الفحص الأولي
    // ✅ بعد ذلك، سيتم التعامل مع التحديثات عبر reevaluateCurrentRoute
    if (!profile) {
      setIsChecking(true)
      return
    }

    // ✅ تحديث lastProfileVersionRef للفحص الأولي
    const currentProfileVersion = `${profile.role}-${profile.branch_id}-${profile.allowed_pages.length}-${profile.allowed_branches.length}`
    if (!lastProfileVersionRef.current) {
      lastProfileVersionRef.current = currentProfileVersion
    }

    const resource = getResourceFromPath(pathname)
    const access = canAccessPage(resource)
    
    setHasAccess(access)
    setIsChecking(false)

    if (!access) {
      // ❌ الصفحة الحالية غير مسموحة - إعادة توجيه ديناميكية
      const redirectTo = getFirstAllowedPage()
      console.log(`🚫 [RealtimeRouteGuard] Initial check: Access denied to ${pathname}, redirecting to: ${redirectTo}`)
      
      if (redirectTo && redirectTo !== "/no-access") {
        router.replace(redirectTo)
      } else {
        console.error(`❌ [RealtimeRouteGuard] No allowed pages found for user - redirecting to /no-access`)
        router.replace('/no-access')
      }
    } else {
      console.log(`✅ [RealtimeRouteGuard] Initial check: Access granted to ${pathname}`)
    }
  }, [isReady, pathname, canAccessPage, getFirstAllowedPage, router, profile])

  // حالة التحميل
  if (isChecking || !isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">جاري التحقق من الصلاحيات...</p>
        </div>
      </div>
    )
  }

  // حالة عدم الصلاحية
  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center max-w-md px-4">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            غير مصرح بالوصول
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            تم تحديث صلاحياتك بواسطة الإدارة.
            <br />
            لم يعد مسموح لك الوصول إلى هذه الصفحة.
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            سيتم توجيهك تلقائياً إلى صفحة مسموحة...
          </p>
        </div>
      </div>
    )
  }

  // حالة السماح - اعرض المحتوى
  return <>{children}</>
}
