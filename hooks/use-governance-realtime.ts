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
          // ✅ تحسين اكتشاف التغييرات: في UPDATE، قد لا يحتوي payload.old على role إذا لم يكن ضمن الحقول المحدّثة
          // ✅ لذلك نتحقق من وجود role في payload.new أولاً
          // ✅ استخدام 'in' operator للتحقق من وجود الحقل حتى لو كانت القيمة falsy (null, "", 0, false)
          // ✅ هذا يضمن اكتشاف التغييرات حتى عند تعيين القيم إلى null أو empty string
          const roleChanged = type === 'UPDATE' && ('role' in (newRecord || {}))
            ? (oldRecord?.role !== newRecord?.role || !('role' in (oldRecord || {}))) // ✅ إذا لم يكن role في oldRecord، نعتبره تغيير
            : (oldRecord?.role !== newRecord?.role)
          const branchChanged = type === 'UPDATE' && ('branch_id' in (newRecord || {}))
            ? (oldRecord?.branch_id !== newRecord?.branch_id || !('branch_id' in (oldRecord || {})))
            : (oldRecord?.branch_id !== newRecord?.branch_id)
          const warehouseChanged = type === 'UPDATE' && ('warehouse_id' in (newRecord || {}))
            ? (oldRecord?.warehouse_id !== newRecord?.warehouse_id || !('warehouse_id' in (oldRecord || {})))
            : (oldRecord?.warehouse_id !== newRecord?.warehouse_id)
          
          console.log(`🔍 [GovernanceRealtime] company_members change detection:`, {
            type,
            roleChanged,
            branchChanged,
            warehouseChanged,
            oldRole: oldRecord?.role,
            newRole: newRecord?.role,
            oldBranchId: oldRecord?.branch_id,
            newBranchId: newRecord?.branch_id,
            hasOldRecord: !!oldRecord,
            hasNewRecord: !!newRecord,
          })
          
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
          
          // ✅ FALLBACK CRITICAL: إذا كان type = UPDATE ولم يتم اكتشاف أي تغيير محدد
          // ✅ نستدعي refreshUserSecurityContext على أي حال لضمان التحديث
          // ✅ هذا يضمن أن أي UPDATE على company_members سيؤدي إلى تحديث السياق حتى لو لم نتمكن من اكتشاف التغيير المحدد
          if (type === 'UPDATE' && !roleChanged && !branchChanged && !warehouseChanged) {
            console.warn(`⚠️ [GovernanceRealtime] UPDATE on company_members but no specific change detected (role/branch/warehouse), refreshUserSecurityContext already called above`)
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
