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
  const lastProfileVersionRef = useRef<string | null>(null) // تتبع نسخة profile التي تم معالجتها بنجاح
  const pendingProfileVersionRef = useRef<string | null>(null) // تتبع profile الذي يتم معالجته حالياً (لمنع التكرار)
  const profileRef = useRef(profile) // ✅ Ref لتخزين profile الحالي (يتم تحديثه في useEffect)
  const isReadyRef = useRef(isReady) // ✅ Ref لتخزين isReady الحالي
  const pathnameRef = useRef(pathname) // ✅ Ref لتخزين pathname الحالي

  // ✅ تحديث refs عند تغيير profile أو isReady أو pathname
  useEffect(() => {
    profileRef.current = profile
    isReadyRef.current = isReady
    pathnameRef.current = pathname
  }, [profile, isReady, pathname])

  // 🔐 دالة مركزية لإعادة تقييم الصفحة الحالية بعد تحديث السياق الأمني
  const reevaluateCurrentRoute = useCallback(async () => {
    // منع إعادة التقييم المتعددة المتزامنة
    if (isReevaluatingRef.current) {
      console.log('🔄 [RealtimeRouteGuard] Already reevaluating route, skipping...')
      return
    }

    try {
      isReevaluatingRef.current = true
      console.log('🔄 [RealtimeRouteGuard] Starting route reevaluation...', { pathname: pathnameRef.current })

      // ✅ انتظار حتى يكتمل تحديث profile (بحد أقصى 2 ثانية)
      // ✅ نستخدم profileRef.current بدلاً من profile من closure لقراءة القيمة الحالية
      let attempts = 0
      const maxAttempts = 20 // 20 * 100ms = 2 seconds
      const initialProfile = profileRef.current
      const initialProfileVersion = initialProfile
        ? `${initialProfile.role}-${initialProfile.branch_id}-${initialProfile.allowed_pages.length}-${initialProfile.allowed_branches.length}`
        : null

      // ✅ إذا كان profile موجوداً بالفعل، ننتظر قليلاً فقط لضمان اكتمال التحديثات
      if (initialProfileVersion) {
        // انتظار 200ms لضمان اكتمال refreshUserSecurityContext
        await new Promise(resolve => setTimeout(resolve, 200))
        
        // ✅ بعد الانتظار، نتحقق من أن profile تغير فعلياً
        // ✅ نقرأ من profileRef.current للحصول على القيمة المحدثة
        const currentProfile = profileRef.current
        if (currentProfile) {
          const currentProfileVersion = `${currentProfile.role}-${currentProfile.branch_id}-${currentProfile.allowed_pages.length}-${currentProfile.allowed_branches.length}`
          if (currentProfileVersion !== initialProfileVersion && currentProfileVersion !== lastProfileVersionRef.current) {
            // ✅ Profile تغير - تحديث lastProfileVersionRef
            lastProfileVersionRef.current = currentProfileVersion
          }
        }
      } else {
        // ✅ إذا لم يكن profile موجوداً، ننتظر حتى يظهر
        // ✅ نستخدم profileRef.current للحصول على القيمة المحدثة في كل iteration
        while (attempts < maxAttempts) {
          const currentProfile = profileRef.current
          if (currentProfile) {
            const currentProfileVersion = `${currentProfile.role}-${currentProfile.branch_id}-${currentProfile.allowed_pages.length}-${currentProfile.allowed_branches.length}`
            // ✅ التحقق من أن profile أصبح موجوداً - لا نحدث lastProfileVersionRef هنا
            // ✅ سيتم تحديثه بعد اكتمال المعالجة في نهاية reevaluateCurrentRoute
            // ✅ هذا يمنع التباين بين pendingProfileVersionRef و lastProfileVersionRef
            if (currentProfileVersion !== pendingProfileVersionRef.current) {
              // ✅ Profile محدث - يمكن المتابعة
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
      // ✅ نستخدم profileRef.current و isReadyRef.current و pathnameRef.current للحصول على القيم المحدثة
      const currentProfile = profileRef.current
      const currentIsReady = isReadyRef.current
      const currentPathname = pathnameRef.current
      
      if (!currentIsReady || !currentProfile) {
        console.warn('⚠️ [RealtimeRouteGuard] Access context not ready, skipping reevaluation', {
          isReady: currentIsReady,
          hasProfile: !!currentProfile,
        })
        return
      }

      // ✅ الحصول على النسخة الحالية من profile بعد الانتظار
      const finalProfileVersion = `${currentProfile.role}-${currentProfile.branch_id}-${currentProfile.allowed_pages.length}-${currentProfile.allowed_branches.length}`

      const resource = getResourceFromPath(currentPathname)
      const access = canAccessPage(resource)

      console.log('🔍 [RealtimeRouteGuard] Route evaluation result:', {
        pathname: currentPathname,
        resource,
        access,
        hasProfile: !!currentProfile,
        allowedPages: currentProfile.allowed_pages.length,
      })

      if (access) {
        // ✅ الصفحة الحالية لا تزال مسموحة - لا نعيد التوجيه (ERP Grade Requirement)
        setHasAccess(true)
        console.log(`✅ [RealtimeRouteGuard] Current page ${currentPathname} is still allowed - staying on page (ERP Grade)`)
      } else {
        // ❌ الصفحة الحالية لم تعد مسموحة - إعادة توجيه ديناميكية (ERP Grade Requirement)
        setHasAccess(false)
        
        // ✅ حساب أول صفحة مسموحة ديناميكياً (ERP Grade Requirement - لا redirect ثابت إلى /dashboard)
        // ✅ استخدام getFirstAllowedPage() ديناميكياً - لا hardcoded paths
        const redirectTo = getFirstAllowedPage()
        
        console.log('🔄 [RealtimeRouteGuard] Current page no longer allowed, calculating redirect (ERP Grade)...', {
          currentPath: currentPathname,
          redirectTo,
          allowedPages: currentProfile.allowed_pages,
          role: currentProfile.role,
        })

        // ✅ التحقق من أن الصفحة الهدف صالحة
        if (redirectTo && redirectTo !== "/no-access") {
          console.log(`🔄 [RealtimeRouteGuard] Redirecting from ${currentPathname} to ${redirectTo} (first allowed page - ERP Grade)`)
          router.replace(redirectTo)
        } else {
          console.error(`❌ [RealtimeRouteGuard] No allowed pages found for user - redirecting to /no-access (ERP Grade)`)
          setHasAccess(false)
          router.replace('/no-access')
        }
      }

      // ✅ تحديث lastProfileVersionRef بعد اكتمال المعالجة بنجاح
      lastProfileVersionRef.current = finalProfileVersion
      pendingProfileVersionRef.current = null
    } catch (error) {
      console.error('❌ [RealtimeRouteGuard] Error during route reevaluation:', error)
      setHasAccess(false)
      // ✅ في حالة الخطأ، نزيل pendingProfileVersionRef لكن لا نحدث lastProfileVersionRef
      pendingProfileVersionRef.current = null
    } finally {
      isReevaluatingRef.current = false
    }
  }, [canAccessPage, getFirstAllowedPage, router])

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

  // 🔐 الاستماع لتحديثات profile لإعادة تقييم الصفحة تلقائياً (ERP Grade - لحظي 100%)
  // ✅ هذا useEffect هو النقطة الحرجة - يعيد تقييم الصفحة فوراً عند أي تغيير في profile
  useEffect(() => {
    // ✅ فقط إذا كان AccessContext جاهزاً و profile موجود
    if (!isReady || !profile) {
      return
    }

    // ✅ التحقق من أن profile تغير فعلياً (ليس مجرد mount أولي)
    const currentProfileVersion = `${profile.role}-${profile.branch_id}-${profile.allowed_pages.length}-${profile.allowed_branches.length}`
    
    // ✅ التحقق من أن profile لم يتم معالجته بالفعل
    if (currentProfileVersion === lastProfileVersionRef.current) {
      // ✅ نفس النسخة - تم معالجتها بالفعل
      return
    }

    // ✅ التحقق من أن profile لا يتم معالجته حالياً
    if (currentProfileVersion === pendingProfileVersionRef.current) {
      // ✅ نفس النسخة قيد المعالجة - لا حاجة لإعادة التقييم
      console.log('🔄 [RealtimeRouteGuard] Profile version already being processed, skipping...')
      return
    }

    // ✅ تعيين pendingProfileVersionRef لمنع إعادة التقييم المكررة
    // ✅ لا نحدث lastProfileVersionRef هنا - سيتم تحديثه بعد اكتمال المعالجة في reevaluateCurrentRoute
    pendingProfileVersionRef.current = currentProfileVersion

    // ✅ Profile تغير - إعادة تقييم الصفحة الحالية فوراً (ERP Grade Requirement)
    console.log('🔄 [RealtimeRouteGuard] Profile updated, triggering route reevaluation (ERP Grade)...', {
      role: profile.role,
      branchId: profile.branch_id,
      allowedPagesCount: profile.allowed_pages.length,
      allowedBranchesCount: profile.allowed_branches.length,
      currentPath: pathnameRef.current,
    })

    // ✅ تأخير بسيط لضمان اكتمال refreshUserSecurityContext (200ms كافٍ)
    const timeoutId = setTimeout(() => {
      // ✅ التحقق مرة أخرى من أن reevaluateCurrentRoute لا يعمل حالياً
      if (!isReevaluatingRef.current) {
        reevaluateCurrentRoute()
      } else {
        console.log('🔄 [RealtimeRouteGuard] Skipping reevaluation - already in progress')
      }
    }, 200) // 200ms لضمان اكتمال refreshUserSecurityContext

    return () => {
      clearTimeout(timeoutId)
    }
  }, [profile, isReady, reevaluateCurrentRoute])
  
  // 🔐 الاستماع لـ access_profile_updated event (ERP Grade - لحظي 100%)
  // ✅ هذا يضمن إعادة التقييم حتى لو لم يتغير profile object reference
  useEffect(() => {
    const handleAccessProfileUpdated = (event: CustomEvent) => {
      console.log('🔄 [RealtimeRouteGuard] access_profile_updated event received, triggering reevaluation...', {
        detail: event.detail,
      })
      
      // ✅ إعادة تقييم الصفحة الحالية فوراً
      if (!isReevaluatingRef.current) {
        // ✅ تأخير بسيط لضمان اكتمال جميع التحديثات
        setTimeout(() => {
          reevaluateCurrentRoute()
        }, 100)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('access_profile_updated', handleAccessProfileUpdated as EventListener)
      return () => {
        window.removeEventListener('access_profile_updated', handleAccessProfileUpdated as EventListener)
      }
    }
  }, [reevaluateCurrentRoute])

  // 🔐 فحص الصلاحية عند تحميل الصفحة أو تغيير المسار (الفحص الأولي فقط)
  // ✅ هذا useEffect للفحص الأولي فقط - لا يتعارض مع reevaluateCurrentRoute
  useEffect(() => {
    // ✅ منع الفحص إذا كان reevaluateCurrentRoute يعمل حالياً
    if (isReevaluatingRef.current) {
      return
    }

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
    
    // ✅ فقط عند الفحص الأولي (lastProfileVersionRef.current === null)
    // ✅ إذا كان profile تغير، نترك reevaluateCurrentRoute يتعامل معه
    if (lastProfileVersionRef.current === null) {
      lastProfileVersionRef.current = currentProfileVersion
    } else if (currentProfileVersion !== lastProfileVersionRef.current) {
      // ✅ Profile تغير - لا نتعامل معه هنا، سيتم التعامل معه في useEffect الأول
      return
    }

    const resource = getResourceFromPath(pathname)
    const access = canAccessPage(resource)
    
    setHasAccess(access)
    setIsChecking(false)

    if (!access) {
      // ❌ الصفحة الحالية غير مسموحة - إعادة توجيه ديناميكية (ERP Grade Requirement)
      // ✅ استخدام getFirstAllowedPage() ديناميكياً - لا hardcoded paths
      const redirectTo = getFirstAllowedPage()
      console.log(`🚫 [RealtimeRouteGuard] Initial check: Access denied to ${pathname}, redirecting to: ${redirectTo} (ERP Grade)`)
      
      if (redirectTo && redirectTo !== "/no-access") {
        router.replace(redirectTo)
      } else {
        console.error(`❌ [RealtimeRouteGuard] No allowed pages found for user - redirecting to /no-access (ERP Grade)`)
        router.replace('/no-access')
      }
    } else {
      console.log(`✅ [RealtimeRouteGuard] Initial check: Access granted to ${pathname} (ERP Grade)`)
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