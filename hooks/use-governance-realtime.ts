/**
 * 🔐 Governance Realtime Hook
 * 
 * Hook لربط نظام Realtime للحوكمة مع UserContext و PermissionsContext
 * يحدث الصلاحيات والسياق تلقائياً عند أي تغيير في الحوكمة
 */

"use client"

import { useEffect, useCallback, useRef } from "react"
import { getRealtimeManager, type GovernanceEventHandler } from "@/lib/realtime-manager"
import { useToast } from "@/hooks/use-toast"

interface UseGovernanceRealtimeOptions {
  /**
   * دالة يتم استدعاؤها عند تغيير صلاحيات المستخدم الحالي
   */
  onPermissionsChanged?: () => void | Promise<void>
  
  /**
   * دالة يتم استدعاؤها عند تغيير دور المستخدم
   */
  onRoleChanged?: () => void | Promise<void>
  
  /**
   * دالة يتم استدعاؤها عند تغيير الفرع/المخزن
   */
  onBranchOrWarehouseChanged?: () => void | Promise<void>
  
  /**
   * إظهار رسائل Toast عند التغييرات
   */
  showNotifications?: boolean
}

/**
 * Hook لاستخدام نظام Realtime للحوكمة
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { refreshUserContext } = useUserContext()
 *   const { refreshPermissions } = usePermissions()
 *   
 *   useGovernanceRealtime({
 *     onPermissionsChanged: async () => {
 *       await refreshPermissions()
 *       await refreshUserContext()
 *     },
 *     showNotifications: true
 *   })
 *   
 *   return <div>...</div>
 * }
 * ```
 */
export function useGovernanceRealtime(options: UseGovernanceRealtimeOptions = {}) {
  const { toast } = useToast()
  const {
    onPermissionsChanged,
    onRoleChanged,
    onBranchOrWarehouseChanged,
    showNotifications = true,
  } = options

  const handlersRef = useRef<{
    onPermissionsChanged?: () => void | Promise<void>
    onRoleChanged?: () => void | Promise<void>
    onBranchOrWarehouseChanged?: () => void | Promise<void>
  }>({})

  // تحديث الـ refs عند تغيير الدوال
  useEffect(() => {
    handlersRef.current = {
      onPermissionsChanged,
      onRoleChanged,
      onBranchOrWarehouseChanged,
    }
  }, [onPermissionsChanged, onRoleChanged, onBranchOrWarehouseChanged])

  useEffect(() => {
    console.log('🔐 [GovernanceRealtime] Setting up governance realtime hook', {
      hasOnPermissionsChanged: !!onPermissionsChanged,
      hasOnRoleChanged: !!onRoleChanged,
      hasOnBranchOrWarehouseChanged: !!onBranchOrWarehouseChanged,
    })
    const manager = getRealtimeManager()

    const handler: GovernanceEventHandler = async (event) => {
      console.log('🔐 [GovernanceRealtime] Event received:', {
        table: event.table,
        type: event.type,
        affectsCurrentUser: event.affectsCurrentUser,
        hasNew: !!event.new,
        hasOld: !!event.old,
      })
      try {
        const { table, type, affectsCurrentUser, new: newRecord, old: oldRecord } = event

        if (!affectsCurrentUser) {
          // الحدث لا يؤثر على المستخدم الحالي
          console.log('⚠️ [GovernanceRealtime] Event does not affect current user, skipping')
          return
        }

        console.log(`🔄 [GovernanceRealtime] Processing event that affects current user:`, {
          table,
          type,
          affectsCurrentUser,
          newRecord: newRecord ? { id: newRecord.id, user_id: newRecord.user_id, role: newRecord.role, branch_id: newRecord.branch_id } : null,
          oldRecord: oldRecord ? { id: oldRecord.id, user_id: oldRecord.user_id, role: oldRecord.role, branch_id: oldRecord.branch_id } : null,
        })

        // 🔐 معالجة الأحداث حسب نوع الجدول
        if (table === 'company_members') {
          // ✅ BLIND REFRESH: في ERP احترافي، عند أي UPDATE على company_members للمستخدم الحالي
          // ✅ نستدعي refreshUserSecurityContext مباشرة بدون أي تحليل أو مقارنة
          // ✅ هذا يضمن أن أي تغيير (role, branch, warehouse, permissions) يتم اكتشافه وتحديثه فوراً
          // ✅ بدون شروط، بدون فلاتر، بدون تحقق - فقط تحديث كامل من السيرفر
          
          console.log(`🔄 [GovernanceRealtime] company_members UPDATE detected - performing blind refresh (no analysis, no comparison)`, {
            type,
            eventType: type,
            userId: newRecord?.user_id || oldRecord?.user_id,
            hasNewRecord: !!newRecord,
            hasOldRecord: !!oldRecord,
          })

          // ✅ إشعار المستخدم (اختياري)
          if (showNotifications && type === 'UPDATE') {
            toast({
              title: "تم تحديث صلاحياتك",
              description: "تم تحديث بياناتك بواسطة الإدارة. سيتم تحديث الصفحات المتاحة لك.",
              variant: "default",
            })
          }

          // ✅ BLIND REFRESH: استدعاء refreshUserSecurityContext مباشرة - بدون أي شروط
          // ✅ refreshUserSecurityContext سيقوم بـ:
          // ✅ 1. Query جديد من السيرفر (company_members.role, company_members.branch_id, user_branch_access, permissions)
          // ✅ 2. تحديث AccessContext كامل (setProfile)
          // ✅ 3. إطلاق الأحداث الثلاثة (permissions_updated, access_profile_updated, user_context_changed)
          // ✅ بدون تحليل، بدون مقارنة، بدون شروط - فقط تحديث كامل من Single Source of Truth
          console.log(`🔄 [GovernanceRealtime] Calling onPermissionsChanged handler (triggers refreshUserSecurityContext)...`)
          if (handlersRef.current.onPermissionsChanged) {
            await handlersRef.current.onPermissionsChanged()
            console.log(`✅ [GovernanceRealtime] onPermissionsChanged handler completed successfully`)
          } else {
            console.warn(`⚠️ [GovernanceRealtime] onPermissionsChanged handler not defined - refreshUserSecurityContext will not be called!`)
          }
          return
        }
        
        if (table === 'user_branch_access') {
          // ✅ تغيير في الفروع المسموحة للمستخدم (allowed_branches)
          // ✅ هذا يؤثر على الصلاحيات والفرع الحالي
          if (showNotifications) {
            toast({
              title: "تم تحديث الفروع المسموحة",
              description: "تم تحديث الفروع المسموحة لك. سيتم تحديث البيانات المعروضة.",
              variant: "default",
            })
          }

          // ✅ استدعاء onBranchOrWarehouseChanged لأن تغيير allowed_branches يؤثر على الفرع
          if (handlersRef.current.onBranchOrWarehouseChanged) {
            await handlersRef.current.onBranchOrWarehouseChanged()
            return
          }
          
          // ✅ إذا لم يكن onBranchOrWarehouseChanged معرّف، نستخدم onPermissionsChanged كـ fallback
          if (handlersRef.current.onPermissionsChanged) {
            await handlersRef.current.onPermissionsChanged()
          }
          return
        } else if (table === 'company_role_permissions') {
          // تغيير في صلاحيات الدور
          if (showNotifications) {
            toast({
              title: "تم تحديث صلاحيات الدور",
              description: "تم تحديث صلاحيات دورك. قد تتغير بعض الصفحات المتاحة لك.",
              variant: "default",
            })
          }

          if (handlersRef.current.onPermissionsChanged) {
            await handlersRef.current.onPermissionsChanged()
          }
        } else if (table === 'branches' || table === 'warehouses') {
          // تغيير في الفروع أو المخازن
          if (showNotifications) {
            toast({
              title: "تم تحديث البيانات",
              description: `تم تحديث ${table === 'branches' ? 'الفروع' : 'المخازن'}. سيتم تحديث البيانات المعروضة.`,
              variant: "default",
            })
          }

          if (handlersRef.current.onBranchOrWarehouseChanged) {
            await handlersRef.current.onBranchOrWarehouseChanged()
          }
        } else if (table === 'permissions') {
          // تغيير في الصلاحيات العامة
          if (showNotifications) {
            toast({
              title: "تم تحديث الصلاحيات",
              description: "تم تحديث نظام الصلاحيات. سيتم تحديث الصفحات المتاحة لك.",
              variant: "default",
            })
          }

          if (handlersRef.current.onPermissionsChanged) {
            await handlersRef.current.onPermissionsChanged()
          }
        }
      } catch (error) {
        console.error('❌ [GovernanceRealtime] Error handling governance event:', error)
        if (showNotifications) {
          toast({
            title: "خطأ في تحديث الصلاحيات",
            description: "حدث خطأ أثناء تحديث الصلاحيات. يرجى تحديث الصفحة.",
            variant: "destructive",
          })
        }
      }
    }

    // تسجيل المعالج
    const unsubscribe = manager.onGovernanceChange(handler)

    return () => {
      unsubscribe()
    }
  }, [showNotifications, toast])
}
