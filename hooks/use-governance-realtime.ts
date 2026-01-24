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
          // تغيير في العضوية أو الدور
          const roleChanged = oldRecord?.role !== newRecord?.role
          const branchChanged = oldRecord?.branch_id !== newRecord?.branch_id
          const warehouseChanged = oldRecord?.warehouse_id !== newRecord?.warehouse_id
          
          // ✅ أولوية المعالجة: role > branch/warehouse > permissions
          // ✅ إذا تغير role و branch معاً، نعالج role فقط (لأنه يؤثر على الصلاحيات بشكل أكبر)
          // ✅ هذا يمنع استدعاء handlers متعددة معاً وتحديثات متضاربة للـ state
          
          if (roleChanged) {
            // تغيير الدور (الأولوية الأولى)
            if (showNotifications) {
              toast({
                title: "تم تحديث صلاحياتك",
                description: "تم تحديث دورك بواسطة الإدارة. قد تتغير بعض الصفحات المتاحة لك.",
                variant: "default",
              })
            }

            if (handlersRef.current.onRoleChanged) {
              await handlersRef.current.onRoleChanged()
              // ✅ عند تغيير الدور، لا نستدعي handlers أخرى لأن onRoleChanged يتعامل معه
              return
            }
            
            // ✅ إذا لم يكن onRoleChanged معرّف، نستخدم onPermissionsChanged كـ fallback
            if (handlersRef.current.onPermissionsChanged) {
              await handlersRef.current.onPermissionsChanged()
            }
            return
          }

          if (branchChanged || warehouseChanged) {
            // تغيير الفرع أو المخزن (الأولوية الثانية - فقط إذا لم يتغير role)
            if (showNotifications) {
              toast({
                title: "تم تحديث تعيينك",
                description: "تم تحديث الفرع أو المخزن الخاص بك. سيتم تحديث البيانات المعروضة.",
                variant: "default",
              })
            }

            if (handlersRef.current.onBranchOrWarehouseChanged) {
              await handlersRef.current.onBranchOrWarehouseChanged()
              // ✅ عند تغيير الفرع/المخزن، لا نستدعي onPermissionsChanged لأن onBranchOrWarehouseChanged يتعامل معه
              return
            }
            
            // ✅ إذا لم يكن onBranchOrWarehouseChanged معرّف، نستخدم onPermissionsChanged كـ fallback
            if (handlersRef.current.onPermissionsChanged) {
              await handlersRef.current.onPermissionsChanged()
            }
            return
          }

          // ✅ فقط إذا لم يكن هناك تغيير في role أو branch/warehouse، نستدعي onPermissionsChanged
          // ✅ هذا يحدث عند تغييرات أخرى في company_members (مثل allowed_branches)
          if (handlersRef.current.onPermissionsChanged) {
            await handlersRef.current.onPermissionsChanged()
          }
          return
        } else if (table === 'user_branch_access') {
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
        } else if (table === 'user_security_events') {
          // ✅ معالجة أحداث user_security_events (ERP Grade - لحظي 100%)
          // ✅ هذا هو القناة الرسمية لإعلام جلسة المستخدم أن صلاحياته تغيرت
          const eventType = newRecord?.event_type
          const eventData = newRecord?.event_data || {}
          
          console.log('🔔 [GovernanceRealtime] User security event received:', {
            eventType,
            eventData,
            eventId: newRecord?.id,
          })
          
          // ✅ حسب نوع الحدث، نستدعي الـ handler المناسب
          if (eventType === 'role_changed') {
            if (showNotifications) {
              toast({
                title: "تم تحديث دورك",
                description: `تم تغيير دورك من ${eventData.old_role} إلى ${eventData.new_role}. سيتم تحديث الصلاحيات فوراً.`,
                variant: "default",
              })
            }
            
            if (handlersRef.current.onRoleChanged) {
              await handlersRef.current.onRoleChanged()
              return
            }
            
            // ✅ Fallback إلى onPermissionsChanged
            if (handlersRef.current.onPermissionsChanged) {
              await handlersRef.current.onPermissionsChanged()
            }
          } else if (eventType === 'branch_changed' || eventType === 'allowed_branches_changed') {
            if (showNotifications) {
              toast({
                title: "تم تحديث تعيينك",
                description: "تم تحديث الفرع أو الفروع المسموحة لك. سيتم تحديث البيانات المعروضة.",
                variant: "default",
              })
            }
            
            if (handlersRef.current.onBranchOrWarehouseChanged) {
              await handlersRef.current.onBranchOrWarehouseChanged()
              return
            }
            
            // ✅ Fallback إلى onPermissionsChanged
            if (handlersRef.current.onPermissionsChanged) {
              await handlersRef.current.onPermissionsChanged()
            }
          } else if (eventType === 'access_changed') {
            // ✅ تغيير عام في الصلاحيات
            if (showNotifications) {
              toast({
                title: "تم تحديث صلاحياتك",
                description: "تم تحديث صلاحياتك. قد تتغير بعض الصفحات المتاحة لك.",
                variant: "default",
              })
            }
            
            // ✅ استدعاء onPermissionsChanged أولاً
            if (handlersRef.current.onPermissionsChanged) {
              await handlersRef.current.onPermissionsChanged()
            }
            
            // ✅ إذا كان السبب role_changed أو branch_changed، نستدعي الـ handler المخصص أيضاً
            const reason = eventData.reason
            if (reason === 'role_changed' && handlersRef.current.onRoleChanged) {
              await handlersRef.current.onRoleChanged()
            } else if ((reason === 'branch_changed' || reason === 'allowed_branches_changed') && handlersRef.current.onBranchOrWarehouseChanged) {
              await handlersRef.current.onBranchOrWarehouseChanged()
            }
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
