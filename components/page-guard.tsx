"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter, usePathname } from "next/navigation"
import { usePermissions, getResourceFromPath, canAccessPageSync, getCachedPermissions } from "@/lib/permissions-context"
import { useAccess } from "@/lib/access-context"
import { Loader2, ShieldAlert } from "lucide-react"

interface PageGuardProps {
  children: React.ReactNode
  resource?: string // إذا لم يُحدد، سيتم استنتاجه من المسار
  fallbackPath?: string // المسار البديل عند عدم الصلاحية
  showAccessDenied?: boolean // عرض رسالة عدم الصلاحية بدلاً من التوجيه
}

/**
 * مكون حماية الصفحات
 * يمنع عرض المحتوى حتى يتم التحقق من الصلاحيات
 * يمنع الوميض (Flicker) بشكل كامل
 *
 * يستخدم التحقق الفوري من الكاش أولاً (Pre-render check)
 */
export function PageGuard({
  children,
  resource,
  fallbackPath,
  showAccessDenied = false,
}: PageGuardProps) {
  const router = useRouter()
  const pathname = usePathname()
  
  // 🔐 استخدام AccessContext كمصدر أساسي
  const { isReady: accessReady, canAccessPage: canAccessPageFromAccess, getFirstAllowedPage } = useAccess()
  
  // Fallback: استخدام PermissionsContext
  const { isReady: permsReady, isLoading, canAccessPage: canAccessPageFromPerms, role } = usePermissions()
  
  // استخدام AccessContext إذا كان جاهزاً، وإلا PermissionsContext
  const isReady = accessReady || permsReady
  const canAccessPage = accessReady ? canAccessPageFromAccess : canAccessPageFromPerms

  // تحديد المورد من المسار إذا لم يُحدد
  const targetResource = resource || getResourceFromPath(pathname)

  // ========== التحقق الفوري من الكاش (Pre-render) ==========
  const cachedCheck = useRef(getCachedPermissions())
  const initialAccessCheck = useRef<"loading" | "allowed" | "denied">(
    cachedCheck.current.isValid
      ? canAccessPageSync(targetResource)
        ? "allowed"
        : "denied"
      : "loading"
  )

  const [accessState, setAccessState] = useState<"loading" | "allowed" | "denied">(initialAccessCheck.current)
  
  // ✅ Ref لتتبع ما إذا تم التوجيه بالفعل (لمنع التكرار)
  const hasRedirectedRef = useRef(false)
  // ✅ Ref لتتبع ما إذا كان accessReady كان false في البداية (لإعادة التوجيه عند تحميله)
  const wasAccessNotReadyRef = useRef(false)
  // ✅ Ref لتتبع المسار الحالي عند التوجيه الأولي (لمنع إعادة التوجيه إذا تغير المسار)
  const initialRedirectPathRef = useRef<string | null>(null)
  // ✅ Ref لتخزين pathname الحالي (لمنع إعادة تشغيل الـ effect عند تغيير pathname)
  const pathnameRef = useRef(pathname)

  // ✅ تحديث pathnameRef عند تغيير pathname (بدون إعادة تشغيل الـ effect الرئيسي)
  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  // إذا كان الوصول مرفوضاً فوراً من الكاش، قم بالتوجيه مباشرة (ERP Grade - ديناميكي)
  // ✅ Bug Fix: إضافة accessReady و getFirstAllowedPage للـ dependencies لمنع stale closure
  // ✅ Bug Fix: إزالة pathname من dependencies لمنع re-redirect cycle
  useEffect(() => {
    // ✅ فقط إذا كان initialAccessCheck.current === "denied"
    if (initialAccessCheck.current !== "denied" || showAccessDenied) {
      return
    }
    
    // ✅ إذا كان accessReady false، ننتظر حتى يصبح true
    if (!accessReady) {
      wasAccessNotReadyRef.current = true // ✅ تتبع أن accessReady كان false
      // ✅ إذا لم يكن جاهزاً، نستخدم /no-access كـ fallback مؤقت
      if (!hasRedirectedRef.current) {
        hasRedirectedRef.current = true
        const redirectTo = fallbackPath || "/no-access"
        initialRedirectPathRef.current = redirectTo
        router.replace(redirectTo)
      }
      return
    }
    
    // ✅ إذا كان accessReady أصبح true بعد أن كان false، نعيد التوجيه للصفحة الصحيحة
    // ✅ لكن فقط إذا كنا لا نزال في نفس المسار الذي تم التوجيه إليه (لمنع إعادة التوجيه غير المرغوب فيها)
    if (wasAccessNotReadyRef.current && hasRedirectedRef.current) {
      // ✅ استخدام pathnameRef.current بدلاً من pathname مباشرة (لمنع re-run cycle)
      const currentPath = pathnameRef.current
      // ✅ فقط إذا كنا لا نزال في /no-access أو المسار الذي تم التوجيه إليه
      if (initialRedirectPathRef.current && (currentPath === initialRedirectPathRef.current || currentPath === "/no-access")) {
        // ✅ إعادة التوجيه للصفحة الصحيحة الآن بعد أن أصبح accessReady true
        const redirectTo = fallbackPath || getFirstAllowedPage()
        router.replace(redirectTo)
        wasAccessNotReadyRef.current = false // ✅ إعادة تعيين بعد إعادة التوجيه
        initialRedirectPathRef.current = null
      }
      return
    }
    
    // ✅ إذا كان accessReady true من البداية، نستخدم getFirstAllowedPage مباشرة
    if (!hasRedirectedRef.current) {
      const redirectTo = fallbackPath || getFirstAllowedPage()
      hasRedirectedRef.current = true
      initialRedirectPathRef.current = redirectTo
      router.replace(redirectTo)
    }
  }, [accessReady, getFirstAllowedPage, fallbackPath, showAccessDenied, router])

  // Flag لمنع إعادة التوجيه أثناء تحديث الصلاحيات
  const isRefreshingRef = useRef(false)

  useEffect(() => {
    // انتظار تحميل الصلاحيات
    if (!isReady || isLoading) {
      // إذا كان هناك كاش صالح، استخدمه
      if (cachedCheck.current.isValid) {
        const hasAccess = canAccessPageSync(targetResource)
        setAccessState(hasAccess ? "allowed" : "denied")
      } else {
        setAccessState("loading")
      }
      return
    }

    // التحقق من الصلاحية
    const hasAccess = canAccessPage(targetResource)

    if (hasAccess) {
      setAccessState("allowed")
      isRefreshingRef.current = false // إعادة تعيين عند التأكيد من الصلاحية
    } else {
      // إذا كانت الصفحة هي settings/users، لا نعيد التوجيه (قد يكون المستخدم يقوم بتعديل صلاحياته)
      if (pathname === "/settings/users" && isRefreshingRef.current) {
        // نحن في صفحة users ونحدث الصلاحيات - لا نعيد التوجيه
        setAccessState("allowed")
        return
      }

      setAccessState("denied")

      // إذا لم يكن showAccessDenied مفعلاً، قم بالتوجيه
      if (!showAccessDenied) {
        // 🔐 استخدام getFirstAllowedPage من AccessContext (دائماً)
        // لا نستخدم /dashboard كصفحة افتراضية أبداً
        // ✅ Bug Fix: إضافة accessReady و getFirstAllowedPage للـ dependencies
        const redirectTo = fallbackPath || (accessReady ? getFirstAllowedPage() : "/no-access")
        router.replace(redirectTo)
        
        // إظهار رسالة للمستخدم
        if (typeof window !== "undefined") {
          // سيتم إظهار Toast من useGovernanceRealtime
          console.log("🔄 [PageGuard] Redirecting due to permission change")
        }
      }
    }
  }, [isReady, isLoading, canAccessPage, targetResource, router, fallbackPath, showAccessDenied, pathname, accessReady, getFirstAllowedPage])

  // 🔐 الاستماع لتحديثات الصلاحيات من Realtime
  useEffect(() => {
    const handlePermissionsUpdate = () => {
      // إذا كنا في صفحة users، نضع flag لمنع إعادة التوجيه
      if (pathname === "/settings/users") {
        isRefreshingRef.current = true
        // إعادة تعيين بعد 2 ثانية
        setTimeout(() => {
          isRefreshingRef.current = false
        }, 2000)
      } else {
        // 🔐 إعادة فحص الصلاحية عند تحديث الصلاحيات
        // سيتم إعادة فحص الصلاحية في useEffect أعلاه
        console.log("🔄 [PageGuard] Permissions updated, rechecking access...")
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("permissions_updated", handlePermissionsUpdate)
      return () => window.removeEventListener("permissions_updated", handlePermissionsUpdate)
    }
  }, [pathname, canAccessPage, targetResource])

  // حالة التحميل - لا تعرض أي محتوى
  if (accessState === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-500">جاري التحقق من الصلاحيات...</p>
        </div>
      </div>
    )
  }

  // حالة عدم الصلاحية
  if (accessState === "denied") {
    if (showAccessDenied) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-md px-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">
              غير مصرح بالوصول
            </h1>
            <p className="text-gray-500 mb-6">
              ليس لديك صلاحية للوصول إلى هذه الصفحة.
              <br />
              يرجى التواصل مع مدير النظام إذا كنت تعتقد أن هذا خطأ.
            </p>
            <button
              onClick={() => router.back()}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              العودة للخلف
            </button>
          </div>
        </div>
      )
    }
    // التوجيه جاري، لا تعرض شيئاً
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    )
  }

  // حالة السماح - اعرض المحتوى
  return <>{children}</>
}

/**
 * مكون للتحقق من صلاحية عرض عنصر معين (ليس صفحة كاملة)
 */
interface PermissionGateProps {
  children: React.ReactNode
  resource: string
  action?: string
  fallback?: React.ReactNode
}

export function PermissionGate({
  children,
  resource,
  action = "read",
  fallback = null,
}: PermissionGateProps) {
  // 🔐 استخدام AccessContext كمصدر أساسي
  const { isReady: accessReady, canAction: canActionFromAccess } = useAccess()
  const { isReady: permsReady, canAction: canActionFromPerms } = usePermissions()
  
  const isReady = accessReady || permsReady
  const canAction = accessReady ? canActionFromAccess : canActionFromPerms

  // أثناء التحميل، لا تعرض شيئاً
  if (!isReady) return null

  // التحقق من الصلاحية
  if (!canAction(resource, action)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

/**
 * Hook للتحقق من صلاحية الصفحة الحالية
 */
export function usePageAccess(resource?: string) {
  const pathname = usePathname()
  const { isReady, isLoading, canAccessPage, role } = usePermissions()

  const targetResource = resource || getResourceFromPath(pathname)

  return {
    isLoading: !isReady || isLoading,
    hasAccess: isReady ? canAccessPage(targetResource) : false,
    role,
    resource: targetResource,
  }
}

