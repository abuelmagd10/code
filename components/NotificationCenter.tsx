/**
 * 🔔 Notification Center - ERP-Grade Professional Design
 * 
 * مركز إشعارات احترافي متعدد الشركات والفروع
 * يدعم الحوكمة والموافقات
 */

"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Bell, X, CheckCircle, Archive, Search, Filter, AlertCircle, Info, AlertTriangle, Zap,
  RefreshCw, CheckCircle2, Eye, ExternalLink, MapPin, Building2, Package, User, Clock,
  FileText, ShoppingCart, DollarSign, Shield, TrendingUp, Settings
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useSupabase } from "@/lib/supabase/hooks"
import { getUserNotifications, markNotificationAsRead, updateNotificationStatus, batchMarkNotificationsAsRead, batchUpdateNotificationStatus, type Notification, type NotificationStatus, type NotificationPriority, type NotificationSeverity, type NotificationCategory } from "@/lib/governance-layer"
import { formatDistanceToNow } from "date-fns"
import { ar } from "date-fns/locale/ar"
import { useRealtimeTable } from "@/hooks/use-realtime-table"
import { getNotificationRoute } from "@/lib/notification-routing"
import { useAccess } from "@/lib/access-context"
import { useToast } from "@/hooks/use-toast"

interface NotificationCenterProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  companyId: string
  branchId?: string
  warehouseId?: string
  userRole: string
}

export function NotificationCenter({
  open,
  onOpenChange,
  userId,
  companyId,
  branchId,
  warehouseId,
  userRole
}: NotificationCenterProps) {
  const router = useRouter()
  const supabase = useSupabase()
  const { toast } = useToast()
  const { canAction } = useAccess()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [mounted, setMounted] = useState(false)

  // 🔹 Advanced Filters
  const [filterStatus, setFilterStatus] = useState<NotificationStatus | "all">("all")
  const [filterPriority, setFilterPriority] = useState<NotificationPriority | "all">("all")
  const [filterSeverity, setFilterSeverity] = useState<NotificationSeverity | "all">("all")
  const [filterCategory, setFilterCategory] = useState<NotificationCategory | "all">("all")
  const [filterReferenceType, setFilterReferenceType] = useState<string>("all")
  const [filterBranch, setFilterBranch] = useState<string>("all")
  const [filterWarehouse, setFilterWarehouse] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  // 🔹 Branches & Warehouses for filters
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([])
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([])
  const [createdByUsers, setCreatedByUsers] = useState<Map<string, { name: string; email?: string }>>(new Map())

  // ✅ Deduplication
  const displayNotifications = useMemo(() => {
    const seen = new Set<string>()
    return notifications.filter(n => {
      if (seen.has(n.id)) return false
      seen.add(n.id)
      return true
    })
  }, [notifications])

  // 🔹 Statistics
  const stats = useMemo(() => {
    const unread = displayNotifications.filter(n => n.status === 'unread').length
    const highPriority = displayNotifications.filter(n => n.priority === 'urgent' || n.priority === 'high').length
    return { unread, highPriority, total: displayNotifications.length }
  }, [displayNotifications])

  useEffect(() => {
    setMounted(true)
    try {
      if (typeof window !== 'undefined') {
        const lang = localStorage.getItem('app_language') || 'ar'
        setAppLang(lang === 'en' ? 'en' : 'ar')
      }
    } catch { }
  }, [])

  // 🔹 Load branches and warehouses for filters
  useEffect(() => {
    if (!companyId) return

    const loadBranchesAndWarehouses = async () => {
      try {
        // Load branches
        const { data: branchesData } = await supabase
          .from('branches')
          .select('id, name')
          .eq('company_id', companyId)
          .order('name')

        if (branchesData) {
          setBranches(branchesData)
        }

        // Load warehouses
        const { data: warehousesData } = await supabase
          .from('warehouses')
          .select('id, name')
          .eq('company_id', companyId)
          .order('name')

        if (warehousesData) {
          setWarehouses(warehousesData)
        }
      } catch (error) {
        console.error('Error loading branches/warehouses:', error)
      }
    }

    loadBranchesAndWarehouses()
  }, [companyId, supabase])

  // 🔹 Load user names for created_by
  useEffect(() => {
    const loadUserNames = async () => {
      if (!supabase || displayNotifications.length === 0) return

      // ✅ فلترة صارمة: إزالة undefined, null, القيم الفارغة, والسلسلة "undefined"
      const allCreatedByIds = displayNotifications.map(n => n.created_by)
      console.log('📋 [NotificationCenter] All created_by IDs:', allCreatedByIds)

      const userIds = new Set(
        allCreatedByIds
          .filter((id): id is string => {
            // فلترة صارمة: فقط UUIDs صالحة
            if (!id) return false
            if (typeof id !== 'string') return false
            if (id === 'undefined' || id === 'null' || id.trim() === '') return false
            // التحقق من أن القيمة تبدو كـ UUID
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            return uuidRegex.test(id)
          })
      )

      console.log('✅ [NotificationCenter] Valid user IDs after filtering:', Array.from(userIds))

      const missingIds = Array.from(userIds).filter(id => !createdByUsers.has(id))
      console.log('🔍 [NotificationCenter] Missing user IDs to fetch:', missingIds)

      if (missingIds.length === 0) {
        console.log('✅ [NotificationCenter] All user names already loaded')
        return
      }

      // ✅ التحقق الإضافي: التأكد من أن جميع IDs صالحة قبل الاستعلام
      const validIds = missingIds.filter(id => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        return uuidRegex.test(id)
      })

      if (validIds.length === 0) {
        console.warn('⚠️ [NotificationCenter] No valid UUIDs to fetch')
        return
      }

      console.log('📥 [NotificationCenter] Fetching user profiles for:', validIds)

      try {
        const { data: usersData, error } = await supabase
          .from('user_profiles')
          .select('user_id, display_name')
          .in('user_id', validIds)

        if (error) {
          console.error('❌ [NotificationCenter] Error loading user profiles:', error)
          // Set default values for missing users
          setCreatedByUsers(prev => {
            const newMap = new Map(prev)
            validIds.forEach(id => {
              if (!newMap.has(id)) {
                newMap.set(id, { name: 'Unknown', email: undefined })
              }
            })
            return newMap
          })
          return
        }

        console.log('✅ [NotificationCenter] Fetched user profiles:', usersData)

        if (usersData && usersData.length > 0) {
          setCreatedByUsers(prev => {
            const newMap = new Map(prev)
            usersData.forEach((user: { user_id: string; display_name?: string | null }) => {
              // ✅ معالجة أفضل للـ display_name
              let displayName = 'Unknown'
              if (user.display_name) {
                const trimmed = user.display_name.trim()
                if (trimmed.length > 0) {
                  displayName = trimmed
                }
              }
              console.log(`📝 [NotificationCenter] Setting user ${user.user_id}: "${displayName}"`)
              newMap.set(user.user_id, {
                name: displayName,
                email: undefined
              })
            })
            // Set default for any missing IDs (validIds فقط)
            validIds.forEach(id => {
              if (!newMap.has(id)) {
                console.warn(`⚠️ [NotificationCenter] User ${id} not found in database, setting to Unknown`)
                newMap.set(id, { name: 'Unknown', email: undefined })
              }
            })
            console.log('✅ [NotificationCenter] Updated createdByUsers map:', Array.from(newMap.entries()).map(([k, v]) => `${k}: ${v.name}`))
            return newMap
          })
        } else {
          console.warn('⚠️ [NotificationCenter] No user profiles returned from query for IDs:', validIds)
          // Set default values if no data returned
          setCreatedByUsers(prev => {
            const newMap = new Map(prev)
            validIds.forEach(id => {
              if (!newMap.has(id)) {
                newMap.set(id, { name: 'Unknown', email: undefined })
              }
            })
            return newMap
          })
        }
      } catch (error) {
        console.error('❌ [NotificationCenter] Error loading user names:', error)
        // Set default values on error (validIds فقط)
        setCreatedByUsers(prev => {
          const newMap = new Map(prev)
          validIds.forEach(id => {
            if (!newMap.has(id)) {
              newMap.set(id, { name: 'Unknown', email: undefined })
            }
          })
          return newMap
        })
      }
    }

    if (displayNotifications.length > 0 && supabase) {
      loadUserNames()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayNotifications, supabase])

  const loadNotifications = useCallback(async () => {
    if (!companyId || !userId) {
      console.warn('⚠️ [NOTIFICATION_CENTER] Missing companyId or userId:', { companyId, userId })
      return
    }

    try {
      setLoading(true)

      // ✅ إصلاح منطق الفلترة: 
      // - "all" → undefined (يعرض unread, read, actioned لكن يستبعد archived)
      // - "archived" → "archived" (يعرض المؤرشفة فقط)
      // - "actioned" → "actioned" (يعرض actioned فقط)
      // - أي حالة أخرى → الحالة المطلوبة
      const status = filterStatus === "all" ? undefined : filterStatus
      const data = await getUserNotifications({
        userId,
        companyId,
        branchId,
        warehouseId,
        status,
        severity: filterSeverity !== "all" ? filterSeverity : undefined,
        category: filterCategory !== "all" ? filterCategory : undefined,
        searchQuery: searchQuery.trim() ? searchQuery : undefined,
        priority: filterPriority !== "all" ? filterPriority : undefined,
        referenceType: filterReferenceType !== "all" ? filterReferenceType : undefined
      })

      // 🔹 Client-side filtering for branch/warehouse (Owner/Admin filters)
      let filtered = data || []

      // ✅ Filter by branch - عند اختيار فرع معين، نعرض فقط إشعارات ذلك الفرع
      if (filterBranch !== "all") {
        filtered = filtered.filter(n => n.branch_id === filterBranch)
      }

      // ✅ Filter by warehouse - عند اختيار مخزن معين، نعرض فقط إشعارات ذلك المخزن
      if (filterWarehouse !== "all") {
        filtered = filtered.filter(n => n.warehouse_id === filterWarehouse)
      }

      // 🔹 Enrich with branch/warehouse names if not present
      const enriched = await Promise.all(filtered.map(async (n) => {
        if (!n.branch_name && n.branch_id) {
          const { data: branch } = await supabase
            .from('branches')
            .select('name')
            .eq('id', n.branch_id)
            .maybeSingle()
          if (branch) {
            n.branch_name = branch.name
          }
        }
        if (!n.warehouse_name && n.warehouse_id) {
          const { data: warehouse } = await supabase
            .from('warehouses')
            .select('name')
            .eq('id', n.warehouse_id)
            .maybeSingle()
          if (warehouse) {
            n.warehouse_name = warehouse.name
          }
        }
        return n
      }))

      // Sort by priority and date
      enriched.sort((a, b) => {
        const priorityOrder = { urgent: 1, high: 2, normal: 3, low: 4 }
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
        if (priorityDiff !== 0) return priorityDiff
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })

      setNotifications(enriched)
    } catch (error: any) {
      console.error("❌ [NOTIFICATION_CENTER] Error loading notifications:", error)
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }, [userId, companyId, branchId, warehouseId, userRole, filterStatus, filterPriority, filterSeverity, filterCategory, filterReferenceType, filterBranch, filterWarehouse, searchQuery, supabase])

  useEffect(() => {
    if (open) {
      loadNotifications()
    }
  }, [open, loadNotifications])

  // 🔔 Realtime Updates - التحقق من جميع الفلاتر
  const shouldShowNotification = useCallback((notification: any): boolean => {
    // 1. التحقق من الشركة
    if (notification.company_id !== companyId) return false

    // 2. التحقق من المستخدم المخصص له
    if (notification.assigned_to_user && notification.assigned_to_user !== userId) {
      if (!['owner', 'admin', 'general_manager'].includes(userRole)) return false
    }

    // 3. التحقق من الدور المخصص له
    if (notification.assigned_to_role && notification.assigned_to_role !== userRole) {
      // الأدوار العليا (owner/admin/general_manager) يمكنها رؤية إشعارات بعضها البعض
      const upperRoles = ['owner', 'admin', 'general_manager']
      const isUpperRole = upperRoles.includes(userRole)
      const targetIsUpperRole = upperRoles.includes(notification.assigned_to_role)

      if (isUpperRole && targetIsUpperRole) {
        // الأدوار العليا ترى إشعارات الأدوار العليا الأخرى ✅
      } else if (notification.assigned_to_role === 'admin' && userRole === 'owner') {
        // المالك يرى إشعارات admin ✅ (كان موجوداً من قبل)
      } else {
        return false
      }
    }

    // 4. التحقق من الفرع (للمستخدمين غير Owner/Admin)
    if (branchId && userRole !== 'owner' && userRole !== 'admin') {
      if (notification.branch_id && notification.branch_id !== branchId) return false
    }

    // 5. التحقق من المخزن (للمستخدمين غير Owner/Admin)
    if (warehouseId && userRole !== 'owner' && userRole !== 'admin') {
      if (notification.warehouse_id && notification.warehouse_id !== warehouseId) return false
    }

    // 6. التحقق من انتهاء الصلاحية
    if (notification.expires_at && new Date(notification.expires_at) <= new Date()) return false

    // 7. ✅ التحقق من فلتر الحالة
    if (filterStatus !== 'all') {
      if (notification.status !== filterStatus) return false
    } else {
      // عند اختيار "الكل"، نستبعد المؤرشفة
      if (notification.status === 'archived') return false
    }

    // 8. ✅ التحقق من فلتر الأولوية
    if (filterPriority !== 'all' && notification.priority !== filterPriority) return false

    // 9. ✅ التحقق من فلتر التصنيف
    if (filterCategory !== 'all' && notification.category !== filterCategory) return false

    // 10. ✅ التحقق من فلتر النوع
    if (filterReferenceType !== 'all' && notification.reference_type !== filterReferenceType) return false

    // 11. ✅ التحقق من فلتر الفرع (للـ Owner/Admin)
    if (filterBranch !== 'all' && notification.branch_id !== filterBranch) return false

    // 12. ✅ التحقق من فلتر المخزن (للـ Owner/Admin)
    if (filterWarehouse !== 'all' && notification.warehouse_id !== filterWarehouse) return false

    // 13. ✅ التحقق من البحث
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      const matchesSearch =
        notification.title?.toLowerCase().includes(query) ||
        notification.message?.toLowerCase().includes(query) ||
        notification.reference_id?.toLowerCase().includes(query)
      if (!matchesSearch) return false
    }

    return true
  }, [companyId, userId, branchId, warehouseId, userRole, filterStatus, filterPriority, filterCategory, filterReferenceType, filterBranch, filterWarehouse, searchQuery])

  const addOrUpdateNotification = useCallback((notification: Notification) => {
    if (!notification || !notification.id) return

    // ✅ التحقق من جميع الفلاتر قبل إضافة/تحديث الإشعار
    if (!shouldShowNotification(notification)) {
      // إزالة الإشعار من القائمة إذا لم يعد يطابق الفلاتر
      setNotifications(prev => prev.filter(n => n.id !== notification.id))
      window.dispatchEvent(new Event('notifications_updated'))
      return
    }

    setNotifications(prev => {
      const map = new Map<string, Notification>()
      prev.forEach(n => map.set(n.id, n))
      map.set(notification.id, notification)
      const updated = Array.from(map.values())
      updated.sort((a, b) => {
        const priorityOrder = { urgent: 1, high: 2, normal: 3, low: 4 }
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
        if (priorityDiff !== 0) return priorityDiff
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
      return updated
    })

    window.dispatchEvent(new Event('notifications_updated'))
  }, [shouldShowNotification])

  useRealtimeTable<Notification>({
    table: 'notifications',
    enabled: mounted && !!companyId && !!userId,
    filter: (event) => {
      const notification = event.new || event.old
      return notification ? shouldShowNotification(notification) : false
    },
    onInsert: (notification) => {
      if (shouldShowNotification(notification)) {
        addOrUpdateNotification(notification)
      }
    },
    onUpdate: (newNotification) => {
      if (shouldShowNotification(newNotification)) {
        addOrUpdateNotification(newNotification)
      }
    },
    onDelete: (oldNotification) => {
      setNotifications(prev => prev.filter(n => n.id !== oldNotification.id))
      window.dispatchEvent(new Event('notifications_updated'))
    },
  })

  // 🔹 Mark all as read (Batch Optimized)
  const handleMarkAllAsRead = async () => {
    try {
      const unreadIds = displayNotifications.filter(n => n.status === 'unread').map(n => n.id)
      if (unreadIds.length === 0) return

      // ✅ استبدال Promise.all باستدعاء جماعي واحد لزيادة الأداء
      await batchMarkNotificationsAsRead(unreadIds, userId)

      setNotifications(prev => prev.map(n =>
        unreadIds.includes(n.id)
          ? { ...n, status: "read" as NotificationStatus, read_at: new Date().toISOString() }
          : n
      ))

      window.dispatchEvent(new Event('notifications_updated'))
      toast({
        title: appLang === 'en' ? 'Success' : 'نجح',
        description: appLang === 'en' ? 'All notifications marked as read' : 'تم تحديد جميع الإشعارات كمقروءة',
      })
    } catch (error) {
      console.error("Error marking all as read:", error)
    }
  }

  // 🔹 Archive all read (Batch Optimized)
  const handleArchiveAllRead = async () => {
    try {
      const readIds = displayNotifications.filter(n => n.status === 'read').map(n => n.id)
      if (readIds.length === 0) return

      // ✅ استبدال Promise.all باستدعاء جماعي واحد لزيادة الأداء
      // للحفاظ على عزل حالة المستخدم الفردية
      await batchUpdateNotificationStatus(readIds, 'archived', userId)

      // ✅ إذا كان المستخدم يريد رؤية المؤرشفة، نحدث status بدلاً من الإزالة
      if (filterStatus === 'archived') {
        setNotifications(prev =>
          prev.map(n =>
            readIds.includes(n.id)
              ? { ...n, status: "archived" as NotificationStatus }
              : n
          )
        )
      } else {
        // ✅ إذا لم يكن يريد رؤية المؤرشفة، نزيلها من القائمة
        setNotifications(prev => prev.filter(n => !readIds.includes(n.id)))
      }

      window.dispatchEvent(new Event('notifications_updated'))
      toast({
        title: appLang === 'en' ? 'Success' : 'نجح',
        description: appLang === 'en' ? 'All read notifications archived' : 'تم أرشفة جميع الإشعارات المقروءة',
      })
    } catch (error) {
      console.error("Error archiving all read:", error)
      toast({
        title: appLang === 'en' ? 'Error' : 'خطأ',
        description: appLang === 'en' ? 'Failed to archive notifications' : 'فشل في أرشفة الإشعارات',
        variant: "destructive"
      })
    }
  }

  // 🔹 Handle notification click with Deep Linking
  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read if unread
    if (notification.status === "unread") {
      try {
        await markNotificationAsRead(notification.id, userId)
        setNotifications(prev =>
          prev.map(n =>
            n.id === notification.id
              ? { ...n, status: "read" as NotificationStatus, read_at: new Date().toISOString() }
              : n
          )
        )
        window.dispatchEvent(new Event('notifications_updated'))
      } catch (error) {
        console.error("Error marking notification as read:", error)
      }
    }

    // 🔗 Deep Link to reference
    const route = getNotificationRoute(
      notification.reference_type,
      notification.reference_id,
      notification.event_key || undefined,
      notification.category || undefined
    )
    if (route) {
      onOpenChange(false) // Close notification center
      router.push(route)
    } else {
      toast({
        title: appLang === 'en' ? 'Info' : 'معلومات',
        description: appLang === 'en' ? 'Cannot navigate to this notification' : 'لا يمكن التنقل إلى هذا الإشعار',
        variant: "default"
      })
    }
  }

  const handleMarkAsActioned = async (notificationId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      const result = await updateNotificationStatus(notificationId, 'actioned', userId)

      if (!result.success) {
        throw new Error(result.error || 'Failed to update notification status')
      }

      // ✅ تحديث الحالة محليًا
      setNotifications(prev =>
        prev.map(n => {
          if (n.id === notificationId) {
            const updated = { ...n, status: "actioned" as NotificationStatus }
            if (!updated.actioned_at) {
              updated.actioned_at = new Date().toISOString()
            }
            return updated
          }
          return n
        })
      )

      // ✅ إذا كان الفلتر لا يسمح بعرض actioned، نزيله من القائمة
      if (filterStatus !== 'actioned' && filterStatus !== 'all') {
        setNotifications(prev => prev.filter(n => n.id !== notificationId))
      }

      window.dispatchEvent(new Event('notifications_updated'))
      toast({
        title: appLang === 'en' ? 'Success' : 'نجح',
        description: appLang === 'en' ? 'Notification marked as actioned' : 'تم تحديد الإشعار كتم التنفيذ',
      })
    } catch (error) {
      console.error("Error marking as actioned:", error)
      toast({
        title: appLang === 'en' ? 'Error' : 'خطأ',
        description: appLang === 'en' ? 'Failed to update notification status' : 'فشل في تحديث حالة الإشعار',
        variant: "destructive"
      })
    }
  }

  const handleArchive = async (notificationId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      const result = await updateNotificationStatus(notificationId, 'archived', userId)

      if (!result.success) {
        throw new Error(result.error || 'Failed to archive notification')
      }

      // ✅ إذا كان المستخدم يريد رؤية المؤرشفة، نحدث status بدلاً من الإزالة
      if (filterStatus === 'archived') {
        setNotifications(prev =>
          prev.map(n =>
            n.id === notificationId
              ? { ...n, status: "archived" as NotificationStatus }
              : n
          )
        )
      } else {
        // ✅ إذا لم يكن يريد رؤية المؤرشفة، نزيلها من القائمة
        setNotifications(prev => prev.filter(n => n.id !== notificationId))
      }

      window.dispatchEvent(new Event('notifications_updated'))
      toast({
        title: appLang === 'en' ? 'Success' : 'نجح',
        description: appLang === 'en' ? 'Notification archived' : 'تم أرشفة الإشعار',
      })
    } catch (error) {
      console.error("Error archiving notification:", error)
      toast({
        title: appLang === 'en' ? 'Error' : 'خطأ',
        description: appLang === 'en' ? 'Failed to archive notification' : 'فشل في أرشفة الإشعار',
        variant: "destructive"
      })
    }
  }

  // 🔹 Get category icon
  const getCategoryIcon = (category?: NotificationCategory) => {
    switch (category) {
      case 'approvals':
        return <Shield className="w-5 h-5 text-amber-500" />
      case 'inventory':
        return <Package className="w-5 h-5 text-blue-500" />
      case 'finance':
        return <DollarSign className="w-5 h-5 text-green-500" />
      case 'sales':
        return <TrendingUp className="w-5 h-5 text-purple-500" />
      default:
        return <Bell className="w-5 h-5 text-gray-500" />
    }
  }

  // 🔹 Get priority styling
  const getPriorityStyles = (priority: NotificationPriority) => {
    switch (priority) {
      case 'urgent':
        return {
          bg: 'bg-red-50 dark:bg-red-950/20',
          border: 'border-red-200 dark:border-red-800',
          icon: <Zap className="w-5 h-5 text-red-600 dark:text-red-400" />,
          badge: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
        }
      case 'high':
        return {
          bg: 'bg-orange-50 dark:bg-orange-950/20',
          border: 'border-orange-200 dark:border-orange-800',
          icon: <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />,
          badge: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
        }
      case 'normal':
        return {
          bg: 'bg-blue-50 dark:bg-blue-950/20',
          border: 'border-blue-200 dark:border-blue-800',
          icon: <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />,
          badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
        }
      case 'low':
        return {
          bg: 'bg-gray-50 dark:bg-gray-900/50',
          border: 'border-gray-200 dark:border-gray-700',
          icon: <AlertCircle className="w-5 h-5 text-gray-500" />,
          badge: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20'
        }
    }
  }

  // 🔹 Get status styling
  const getStatusStyles = (status: NotificationStatus) => {
    switch (status) {
      case 'unread':
        return 'bg-blue-50 dark:bg-blue-950/30 border-l-4 border-l-blue-500'
      case 'read':
        return 'bg-white dark:bg-slate-800'
      case 'actioned':
        return 'bg-green-50 dark:bg-green-950/20 border-l-4 border-l-green-500'
      case 'archived':
        return 'bg-gray-50 dark:bg-gray-900/50 opacity-60'
      default:
        return 'bg-white dark:bg-slate-800'
    }
  }

  // 🔹 Get reference type label
  const getReferenceTypeLabel = (type: string) => {
    const labels: Record<string, { ar: string; en: string }> = {
      'write_off': { ar: 'إهلاك', en: 'Write Off' },
      'invoice': { ar: 'فاتورة مبيعات', en: 'Sales Invoice' },
      'bill': { ar: 'فاتورة مشتريات', en: 'Purchase Bill' },
      'purchase_order': { ar: 'أمر شراء', en: 'Purchase Order' },
      'sales_order': { ar: 'أمر بيع', en: 'Sales Order' },
      'inventory_transfer': { ar: 'نقل مخزون', en: 'Inventory Transfer' },
      'approval_request': { ar: 'طلب اعتماد', en: 'Approval Request' },
      'refund_request': { ar: 'طلب استرداد', en: 'Refund Request' },
      'vendor_refund_request': { ar: 'طلب استرداد سلفة مورد', en: 'Vendor Refund Request' },
      'depreciation': { ar: 'إهلاك', en: 'Depreciation' },
      'journal_entry': { ar: 'قيد يومي', en: 'Journal Entry' },
      'payment': { ar: 'دفعة', en: 'Payment' },
      'expense': { ar: 'مصروف', en: 'Expense' },
    }
    return labels[type]?.[appLang] || type
  }

  // 🔹 Get priority label
  const getPriorityLabel = (priority: NotificationPriority) => {
    const labels = {
      ar: { urgent: 'عاجل', high: 'عالي', normal: 'عادي', low: 'منخفض' },
      en: { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' }
    }
    return labels[appLang][priority]
  }

  // 🔹 Get status label
  const getStatusLabel = (status: NotificationStatus) => {
    const labels = {
      ar: { unread: 'غير مقروء', read: 'مقروء', actioned: 'تم التنفيذ', archived: 'مؤرشف' },
      en: { unread: 'Unread', read: 'Read', actioned: 'Actioned', archived: 'Archived' }
    }
    return labels[appLang][status]
  }

  // 🔹 Get unique reference types for filter
  const uniqueReferenceTypes = useMemo(() => {
    const types = new Set(displayNotifications.map(n => n.reference_type))
    return Array.from(types).sort()
  }, [displayNotifications])

  if (!mounted) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden"
        >
          <DialogDescription className="sr-only">
            {appLang === 'en' ? 'Loading notification center' : 'جاري تحميل مركز الإشعارات'}
          </DialogDescription>
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <DialogTitle className="text-xl font-bold">
              {appLang === 'en' ? 'Notifications' : 'مركز الإشعارات'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center min-h-[200px] flex-1">
            <p className="text-gray-500 dark:text-gray-400">
              {appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden"
      >
        <DialogDescription className="sr-only">
          {appLang === 'en' ? 'Notification center with filters and actions' : 'مركز الإشعارات مع الفلاتر والإجراءات'}
        </DialogDescription>
        {/* 🔹 A. Header Bar */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <DialogTitle className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {appLang === 'en' ? 'Notification Center' : 'مركز الإشعارات'}
              </DialogTitle>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 dark:text-gray-400">
                    {appLang === 'en' ? 'Unread' : 'غير مقروء'}:
                  </span>
                  <Badge variant="outline" className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-blue-300">
                    {stats.unread}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 dark:text-gray-400">
                    {appLang === 'en' ? 'High Priority' : 'عالي الأولوية'}:
                  </span>
                  <Badge variant="outline" className="bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300 border-orange-300">
                    {stats.highPriority}
                  </Badge>
                </div>
                <div className="text-gray-500 dark:text-gray-400">
                  {appLang === 'en' ? 'Total' : 'الإجمالي'}: {stats.total}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleMarkAllAsRead}
                disabled={stats.unread === 0}
                title={appLang === 'en' ? 'Mark all as read' : 'تحديد الكل كمقروء'}
              >
                <CheckCircle2 className="w-4 h-4 ml-2" />
                {appLang === 'en' ? 'Mark All Read' : 'تحديد الكل'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleArchiveAllRead}
                disabled={displayNotifications.filter(n => n.status === 'read').length === 0}
                title={appLang === 'en' ? 'Archive all read' : 'أرشفة الكل المقروء'}
              >
                <Archive className="w-4 h-4 ml-2" />
                {appLang === 'en' ? 'Archive Read' : 'أرشف المقروء'}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => loadNotifications()}
                title={appLang === 'en' ? 'Refresh' : 'تحديث'}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* 🔹 B. Advanced Filters */}
        <div className="px-6 py-4 border-b space-y-3 bg-gray-50 dark:bg-slate-900 flex-shrink-0">
          {/* Search */}
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-500" />
            <Input
              placeholder={appLang === 'en' ? 'Search in title, message, or reference ID...' : 'بحث في العنوان، الرسالة، أو رقم المرجع...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
          </div>

          {/* Filter Row 1 */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={appLang === 'en' ? 'Status' : 'الحالة'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{appLang === 'en' ? 'All' : 'الكل'}</SelectItem>
                <SelectItem value="unread">{appLang === 'en' ? 'Unread' : 'غير مقروء'}</SelectItem>
                <SelectItem value="read">{appLang === 'en' ? 'Read' : 'مقروء'}</SelectItem>
                <SelectItem value="actioned">{appLang === 'en' ? 'Actioned' : 'تم التنفيذ'}</SelectItem>
                <SelectItem value="archived">{appLang === 'en' ? 'Archived' : 'مؤرشف'}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v as any)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={appLang === 'en' ? 'Priority' : 'الأولوية'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{appLang === 'en' ? 'All' : 'الكل'}</SelectItem>
                <SelectItem value="urgent">{appLang === 'en' ? 'Urgent' : 'عاجل'}</SelectItem>
                <SelectItem value="high">{appLang === 'en' ? 'High' : 'عالي'}</SelectItem>
                <SelectItem value="normal">{appLang === 'en' ? 'Normal' : 'عادي'}</SelectItem>
                <SelectItem value="low">{appLang === 'en' ? 'Low' : 'منخفض'}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as any)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={appLang === 'en' ? 'Category' : 'التصنيف'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{appLang === 'en' ? 'All' : 'الكل'}</SelectItem>
                <SelectItem value="approvals">{appLang === 'en' ? 'Approvals' : 'موافقات'}</SelectItem>
                <SelectItem value="inventory">{appLang === 'en' ? 'Inventory' : 'مخزون'}</SelectItem>
                <SelectItem value="finance">{appLang === 'en' ? 'Finance' : 'مالية'}</SelectItem>
                <SelectItem value="sales">{appLang === 'en' ? 'Sales' : 'مبيعات'}</SelectItem>
                <SelectItem value="system">{appLang === 'en' ? 'System' : 'نظام'}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterReferenceType} onValueChange={setFilterReferenceType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={appLang === 'en' ? 'Type' : 'النوع'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{appLang === 'en' ? 'All' : 'الكل'}</SelectItem>
                {uniqueReferenceTypes.map(type => (
                  <SelectItem key={type} value={type}>
                    {getReferenceTypeLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(userRole === 'owner' || userRole === 'admin') && branches.length > 0 && (
              <Select value={filterBranch} onValueChange={setFilterBranch}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={appLang === 'en' ? 'Branch' : 'الفرع'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{appLang === 'en' ? 'All' : 'الكل'}</SelectItem>
                  {branches.map(branch => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {(userRole === 'owner' || userRole === 'admin') && warehouses.length > 0 && (
              <Select value={filterWarehouse} onValueChange={setFilterWarehouse}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={appLang === 'en' ? 'Warehouse' : 'المخزن'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{appLang === 'en' ? 'All' : 'الكل'}</SelectItem>
                  {warehouses.map(warehouse => (
                    <SelectItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* 🔹 C. Notifications List */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 py-4">
          {loading ? (
            // 🔹 Skeleton Loader
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="p-4 rounded-lg border bg-white dark:bg-slate-800">
                  <div className="flex items-start gap-3">
                    <Skeleton className="w-5 h-5 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : displayNotifications.length === 0 ? (
            // 🔹 Empty State
            <div className="flex flex-col items-center justify-center min-h-[300px] text-center">
              <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <Bell className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {appLang === 'en' ? 'No notifications' : 'لا توجد إشعارات حالياً'}
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {appLang === 'en' ? 'Everything is under control 👌' : 'كل شيء تحت السيطرة 👌'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {displayNotifications.map((notification) => {
                const priorityStyles = getPriorityStyles(notification.priority)
                const statusStyles = getStatusStyles(notification.status)
                const createdBy = createdByUsers.get(notification.created_by)
                const isApproval = notification.category === 'approvals' && (userRole === 'owner' || userRole === 'admin')

                // 🔍 Debug: Log created_by lookup
                if (!createdBy && notification.created_by) {
                  console.log(`⚠️ [NotificationCenter] No user found for created_by: ${notification.created_by}`, {
                    notificationId: notification.id,
                    createdByUsersSize: createdByUsers.size,
                    createdByUsersKeys: Array.from(createdByUsers.keys())
                  })
                }

                return (
                  <div
                    key={notification.id}
                    className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${statusStyles} ${priorityStyles.border}`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    {/* 🔹 Row 1: Icon, Title, Badges */}
                    <div className="flex items-start gap-3 mb-2">
                      <div className="mt-1 flex-shrink-0">
                        {getCategoryIcon(notification.category)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="font-bold text-base text-gray-900 dark:text-white">
                            {notification.title}
                          </h4>
                          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                            <Badge variant="outline" className={`text-xs ${priorityStyles.badge}`}>
                              {getPriorityLabel(notification.priority)}
                            </Badge>
                            {notification.status === 'unread' && (
                              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                            )}
                            {notification.status === 'actioned' && (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            )}
                          </div>
                        </div>

                        {/* 🔹 Row 2: Message */}
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                          {notification.message}
                        </p>

                        {/* 🔹 Row 3: Meta Info */}
                        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mb-3">
                          {notification.branch_name && (
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              <span>{notification.branch_name}</span>
                            </div>
                          )}
                          {notification.warehouse_name && (
                            <div className="flex items-center gap-1">
                              <Package className="w-3 h-3" />
                              <span>{notification.warehouse_name}</span>
                            </div>
                          )}
                          {notification.created_by && (
                            <div className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              <span>{createdBy?.name || 'Unknown'}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>
                              {formatDistanceToNow(new Date(notification.created_at), {
                                addSuffix: true,
                                locale: appLang === 'ar' ? ar : undefined
                              })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            <span>{getReferenceTypeLabel(notification.reference_type)}</span>
                          </div>
                        </div>

                        {/* 🔹 Row 4: Actions */}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                          <div className="flex items-center gap-2">
                            {isApproval && notification.status !== 'actioned' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    // TODO: Implement approval action
                                    handleMarkAsActioned(notification.id, e)
                                  }}
                                >
                                  <CheckCircle className="w-3 h-3 ml-1" />
                                  {appLang === 'en' ? 'Approve' : 'اعتماد'}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs text-red-600 hover:text-red-700"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    // ✅ الانتقال للصفحة المرتبطة لاتخاذ إجراء الرفض
                                    const route = getNotificationRoute(
                                      notification.reference_type,
                                      notification.reference_id,
                                      notification.event_key || undefined,
                                      notification.category || undefined
                                    )
                                    if (route) {
                                      onOpenChange(false)
                                      router.push(route)
                                    } else {
                                      toast({
                                        title: appLang === 'en' ? 'Info' : 'معلومات',
                                        description: appLang === 'en' ? 'Please navigate to the item page to reject' : 'الرجاء الانتقال لصفحة العنصر للرفض',
                                      })
                                    }
                                  }}
                                >
                                  <X className="w-3 h-3 ml-1" />
                                  {appLang === 'en' ? 'Reject' : 'رفض'}
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={async (e) => {
                                e.stopPropagation()
                                const route = getNotificationRoute(
                                  notification.reference_type,
                                  notification.reference_id,
                                  notification.event_key || undefined,
                                  notification.category || undefined
                                )
                                if (route) {
                                  // أرشفة الإشعار تلقائياً عند فتح المرجع
                                  if (notification.status !== 'archived') {
                                    try {
                                      await updateNotificationStatus(notification.id, 'archived', userId)
                                      setNotifications(prev => prev.filter(n => n.id !== notification.id))
                                      window.dispatchEvent(new Event('notifications_updated'))
                                    } catch (error) {
                                      console.error("Error archiving notification:", error)
                                    }
                                  }
                                  onOpenChange(false)
                                  router.push(route)
                                }
                              }}
                            >
                              <ExternalLink className="w-3 h-3 ml-1" />
                              {appLang === 'en' ? 'Open Reference' : 'فتح المرجع'}
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            {notification.status !== 'actioned' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={(e) => handleMarkAsActioned(notification.id, e)}
                              >
                                <CheckCircle className="w-3 h-3 ml-1" />
                                {appLang === 'en' ? 'Actioned' : 'تم التنفيذ'}
                              </Button>
                            )}
                            {notification.status !== 'archived' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={(e) => handleArchive(notification.id, e)}
                              >
                                <Archive className="w-3 h-3 ml-1" />
                                {appLang === 'en' ? 'Archive' : 'أرشف'}
                              </Button>
                            )}
                            {notification.status === 'read' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleNotificationClick(notification)
                                }}
                              >
                                <Eye className="w-3 h-3 ml-1" />
                                {appLang === 'en' ? 'View' : 'عرض'}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
