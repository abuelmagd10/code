"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Bell, X, CheckCircle, Archive, Search, Filter, AlertCircle, Info, AlertTriangle, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import { getUserNotifications, markNotificationAsRead, type Notification, type NotificationStatus, type NotificationPriority, type NotificationSeverity, type NotificationCategory } from "@/lib/governance-layer"
import { getActiveCompanyId } from "@/lib/company"
import { formatDistanceToNow } from "date-fns"
import { ar } from "date-fns/locale/ar"

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
  const supabase = useSupabase()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<NotificationStatus | "all">("all")
  const [filterPriority, setFilterPriority] = useState<NotificationPriority | "all">("all")
  const [filterSeverity, setFilterSeverity] = useState<NotificationSeverity | "all">("all")
  const [filterCategory, setFilterCategory] = useState<NotificationCategory | "all">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      if (typeof window !== 'undefined') {
        const lang = localStorage.getItem('app_language') || 'ar'
        setAppLang(lang === 'en' ? 'en' : 'ar')
      }
    } catch { }
  }, [])

  const loadNotifications = useCallback(async () => {
    if (!companyId || !userId) {
      console.warn('⚠️ [NOTIFICATION_CENTER] Missing companyId or userId:', { companyId, userId })
      return
    }

    try {
      setLoading(true)
      console.log('🔄 [NOTIFICATION_CENTER] Loading notifications for:', {
        userId,
        companyId,
        branchId: branchId || 'null',
        warehouseId: warehouseId || 'null',
        userRole,
        filterStatus,
        filterPriority,
        filterSeverity,
        filterCategory
      })

      const status = filterStatus === "all" ? undefined : filterStatus
      const data = await getUserNotifications({
        userId,
        companyId,
        branchId,
        warehouseId,
        status,
        severity: filterSeverity !== "all" ? filterSeverity : undefined,
        category: filterCategory !== "all" ? filterCategory : undefined
      })

      console.log(`📊 [NOTIFICATION_CENTER] Received ${data?.length || 0} notifications from database`)

      // Filter by priority and search
      let filtered = data || []
      
      if (filterPriority !== "all") {
        const beforePriority = filtered.length
        filtered = filtered.filter(n => n.priority === filterPriority)
        console.log(`🔍 [NOTIFICATION_CENTER] After priority filter (${filterPriority}): ${beforePriority} → ${filtered.length}`)
      }

      if (searchQuery.trim()) {
        const beforeSearch = filtered.length
        const query = searchQuery.toLowerCase()
        filtered = filtered.filter(n => 
          n.title.toLowerCase().includes(query) ||
          n.message.toLowerCase().includes(query)
        )
        console.log(`🔍 [NOTIFICATION_CENTER] After search filter: ${beforeSearch} → ${filtered.length}`)
      }

      // Sort by priority and date
      filtered.sort((a, b) => {
        const priorityOrder = { urgent: 1, high: 2, normal: 3, low: 4 }
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
        if (priorityDiff !== 0) return priorityDiff
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })

      console.log(`✅ [NOTIFICATION_CENTER] Setting ${filtered.length} notifications to state`)
      setNotifications(filtered)
    } catch (error: any) {
      console.error("❌ [NOTIFICATION_CENTER] Error loading notifications:", error)
      console.error("❌ [NOTIFICATION_CENTER] Error details:", {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint
      })
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }, [userId, companyId, branchId, warehouseId, userRole, filterStatus, filterPriority, filterSeverity, filterCategory, searchQuery])

  // ✅ استخدام useRef لتخزين أحدث إصدار من loadNotifications لتجنب infinite loop
  const loadNotificationsRef = useRef(loadNotifications)
  useEffect(() => {
    loadNotificationsRef.current = loadNotifications
  }, [loadNotifications])

  useEffect(() => {
    if (open) {
      loadNotifications()
    }
  }, [open, loadNotifications])

  // 🔔 Real-Time: الاستماع للإشعارات الجديدة والمحدثة
  useEffect(() => {
    if (!companyId || !userId || !mounted) return

    console.log('🔔 [REALTIME] Setting up notification subscription...', {
      companyId,
      userId,
      branchId: branchId || 'null',
      warehouseId: warehouseId || 'null',
      userRole
    })

    // إنشاء Realtime channel للإشعارات
    const channel = supabase
      .channel(`notifications:${companyId}:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'notifications',
          filter: `company_id=eq.${companyId}` // فلترة حسب الشركة
        },
        async (payload: any) => {
          console.log('🔔 [REALTIME] Notification event received:', {
            eventType: payload.eventType,
            new: payload.new,
            old: payload.old
          })

          // التحقق من أن الإشعار ينطبق على المستخدم الحالي
          // (سيتم الفلترة في getUserNotifications)
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const notification = payload.new as any
            
            // ✅ التحقق من أن الإشعار ينطبق على المستخدم
            // (سيتم التحقق الكامل في loadNotifications)
            console.log('🔄 [REALTIME] Reloading notifications after event...')
            // استخدام ref لتجنب infinite loop
            await loadNotificationsRef.current()
          } else if (payload.eventType === 'DELETE') {
            // إزالة الإشعار المحذوف من القائمة
            setNotifications(prev => prev.filter(n => n.id !== payload.old.id))
          }
        }
      )
      .subscribe((status: any) => {
        console.log('🔔 [REALTIME] Subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ [REALTIME] Successfully subscribed to notifications')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ [REALTIME] Channel error - check Supabase Realtime configuration')
        }
      })

    // تنظيف الاشتراك عند إلغاء التثبيت
    return () => {
      console.log('🔕 [REALTIME] Unsubscribing from notifications...')
      supabase.removeChannel(channel)
    }
  }, [companyId, userId, branchId, warehouseId, userRole, supabase, mounted])

  const handleNotificationClick = async (notification: Notification) => {
    if (notification.status === "unread") {
      try {
        await markNotificationAsRead(notification.id, userId)
        
        // تسجيل في audit_log
        try {
          await supabase.from('audit_logs').insert({
            company_id: companyId,
            user_id: userId,
            action: 'UPDATE',
            target_table: 'notifications',
            record_id: notification.id,
            old_data: { status: 'unread' },
            new_data: { status: 'read', read_at: new Date().toISOString() },
            changed_fields: ['status', 'read_at']
          })
        } catch (auditError) {
          console.error("Error logging to audit:", auditError)
          // لا نوقف العملية إذا فشل تسجيل audit
        }
        
        setNotifications(prev => 
          prev.map(n => 
            n.id === notification.id 
              ? { ...n, status: "read" as NotificationStatus, read_at: new Date().toISOString() }
              : n
          )
        )
        // Dispatch event to update badge count
        window.dispatchEvent(new Event('notifications_updated'))
      } catch (error) {
        console.error("Error marking notification as read:", error)
      }
    }
  }

  const handleMarkAsActioned = async (notificationId: string) => {
    try {
      // جلب الإشعار الحالي لتسجيل الحالة القديمة
      const notification = notifications.find(n => n.id === notificationId)
      const oldStatus = notification?.status || 'unread'

      const { error } = await supabase
        .from('notifications')
        .update({ 
          status: 'actioned',
          actioned_at: new Date().toISOString()
        })
        .eq('id', notificationId)

      if (error) throw error

      // تسجيل في audit_log
      try {
        await supabase.from('audit_logs').insert({
          company_id: companyId,
          user_id: userId,
          action: 'UPDATE',
          target_table: 'notifications',
          record_id: notificationId,
          old_data: { status: oldStatus },
          new_data: { status: 'actioned', actioned_at: new Date().toISOString() },
          changed_fields: ['status', 'actioned_at']
        })
      } catch (auditError) {
        console.error("Error logging to audit:", auditError)
        // لا نوقف العملية إذا فشل تسجيل audit
      }

      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId 
            ? { ...n, status: "actioned" as NotificationStatus, actioned_at: new Date().toISOString() }
            : n
        )
      )
      window.dispatchEvent(new Event('notifications_updated'))
    } catch (error) {
      console.error("Error marking as actioned:", error)
    }
  }

  const handleArchive = async (notificationId: string) => {
    try {
      // جلب الإشعار الحالي لتسجيل الحالة القديمة
      const notification = notifications.find(n => n.id === notificationId)
      const oldStatus = notification?.status || 'unread'

      const { error } = await supabase
        .from('notifications')
        .update({ status: 'archived' })
        .eq('id', notificationId)

      if (error) throw error

      // تسجيل في audit_log
      try {
        await supabase.from('audit_logs').insert({
          company_id: companyId,
          user_id: userId,
          action: 'UPDATE',
          target_table: 'notifications',
          record_id: notificationId,
          old_data: { status: oldStatus },
          new_data: { status: 'archived' },
          changed_fields: ['status']
        })
      } catch (auditError) {
        console.error("Error logging to audit:", auditError)
        // لا نوقف العملية إذا فشل تسجيل audit
      }

      setNotifications(prev => prev.filter(n => n.id !== notificationId))
      window.dispatchEvent(new Event('notifications_updated'))
    } catch (error) {
      console.error("Error archiving notification:", error)
    }
  }

  const getPriorityIcon = (priority: NotificationPriority) => {
    switch (priority) {
      case 'urgent':
        return <Zap className="w-4 h-4 text-red-500" />
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />
      case 'normal':
        return <Info className="w-4 h-4 text-blue-500" />
      case 'low':
        return <AlertCircle className="w-4 h-4 text-gray-500" />
    }
  }

  const getPriorityColor = (priority: NotificationPriority) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-500/10 text-red-500 border-red-500/20'
      case 'high':
        return 'bg-orange-500/10 text-orange-500 border-orange-500/20'
      case 'normal':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
      case 'low':
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20'
    }
  }

  const getStatusLabel = (status: NotificationStatus) => {
    const labels = {
      ar: { unread: 'غير مقروء', read: 'مقروء', actioned: 'تم التنفيذ', archived: 'مؤرشف' },
      en: { unread: 'Unread', read: 'Read', actioned: 'Actioned', archived: 'Archived' }
    }
    return labels[appLang][status]
  }

  const getPriorityLabel = (priority: NotificationPriority) => {
    const labels = {
      ar: { urgent: 'عاجل', high: 'عالي', normal: 'عادي', low: 'منخفض' },
      en: { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' }
    }
    return labels[appLang][priority]
  }

  // ✅ تجنب مشاكل hydration - عرض محتوى بسيط أثناء التحميل
  if (!mounted) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent 
          className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden"
          aria-describedby="notifications-loading-description"
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <DialogTitle className="text-xl font-bold">
              {appLang === 'en' ? 'Notifications' : 'الإشعارات'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center min-h-[200px] flex-1">
            <p className="text-gray-500 dark:text-gray-400">
              {appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}
            </p>
          </div>
          <span id="notifications-loading-description" className="sr-only">
            {appLang === 'en' ? 'Loading notifications' : 'جاري تحميل الإشعارات'}
          </span>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden"
        aria-describedby="notifications-description"
      >
        <span id="notifications-description" className="sr-only">
          {appLang === 'en' ? 'Notifications center with filters and search functionality' : 'مركز الإشعارات مع إمكانية الفلترة والبحث'}
        </span>
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold">
              {appLang === 'en' ? 'Notifications' : 'الإشعارات'}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        {/* Filters */}
        <div className="px-6 py-4 border-b space-y-3 bg-gray-50 dark:bg-slate-900 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-500" />
            <Input
              placeholder={appLang === 'en' ? 'Search notifications...' : 'بحث في الإشعارات...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
              <SelectTrigger className="w-[140px]">
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
              <SelectTrigger className="w-[140px]">
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

            <Select value={filterSeverity} onValueChange={(v) => setFilterSeverity(v as any)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={appLang === 'en' ? 'Severity' : 'الأهمية'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{appLang === 'en' ? 'All' : 'الكل'}</SelectItem>
                <SelectItem value="critical">{appLang === 'en' ? 'Critical' : 'حرج'}</SelectItem>
                <SelectItem value="error">{appLang === 'en' ? 'Error' : 'خطأ'}</SelectItem>
                <SelectItem value="warning">{appLang === 'en' ? 'Warning' : 'تحذير'}</SelectItem>
                <SelectItem value="info">{appLang === 'en' ? 'Info' : 'معلومات'}</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as any)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={appLang === 'en' ? 'Category' : 'الفئة'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{appLang === 'en' ? 'All' : 'الكل'}</SelectItem>
                <SelectItem value="finance">{appLang === 'en' ? 'Finance' : 'مالية'}</SelectItem>
                <SelectItem value="inventory">{appLang === 'en' ? 'Inventory' : 'مخزون'}</SelectItem>
                <SelectItem value="sales">{appLang === 'en' ? 'Sales' : 'مبيعات'}</SelectItem>
                <SelectItem value="approvals">{appLang === 'en' ? 'Approvals' : 'موافقات'}</SelectItem>
                <SelectItem value="system">{appLang === 'en' ? 'System' : 'نظام'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 notification-scrollbar">
          {loading ? (
            <div className="py-8 text-center text-gray-500">
              {appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              {appLang === 'en' ? 'No notifications' : 'لا توجد إشعارات'}
            </div>
          ) : (
            <div className="space-y-2 py-4">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    notification.status === 'unread'
                      ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'
                      : 'bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700'
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-1">
                      {getPriorityIcon(notification.priority)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="font-semibold text-sm">{notification.title}</h4>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge
                            variant="outline"
                            className={`text-xs ${getPriorityColor(notification.priority)}`}
                          >
                            {getPriorityLabel(notification.priority)}
                          </Badge>
                          {notification.severity && (
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                notification.severity === 'critical' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                notification.severity === 'error' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                                notification.severity === 'warning' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                                'bg-blue-500/10 text-blue-500 border-blue-500/20'
                              }`}
                            >
                              {notification.severity === 'critical' ? (appLang === 'en' ? 'Critical' : 'حرج') :
                               notification.severity === 'error' ? (appLang === 'en' ? 'Error' : 'خطأ') :
                               notification.severity === 'warning' ? (appLang === 'en' ? 'Warning' : 'تحذير') :
                               (appLang === 'en' ? 'Info' : 'معلومات')}
                            </Badge>
                          )}
                          {notification.category && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-gray-500/10 text-gray-500 border-gray-500/20"
                            >
                              {notification.category === 'finance' ? (appLang === 'en' ? 'Finance' : 'مالية') :
                               notification.category === 'inventory' ? (appLang === 'en' ? 'Inventory' : 'مخزون') :
                               notification.category === 'sales' ? (appLang === 'en' ? 'Sales' : 'مبيعات') :
                               notification.category === 'approvals' ? (appLang === 'en' ? 'Approvals' : 'موافقات') :
                               (appLang === 'en' ? 'System' : 'نظام')}
                            </Badge>
                          )}
                          {notification.status === 'unread' && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
                          {typeof window !== 'undefined' ? formatDistanceToNow(new Date(notification.created_at), {
                            addSuffix: true,
                            locale: appLang === 'ar' ? ar : undefined
                          }) : new Date(notification.created_at).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-2">
                          {notification.status !== 'actioned' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleMarkAsActioned(notification.id)
                              }}
                            >
                              <CheckCircle className="w-3 h-3 ml-1" />
                              {appLang === 'en' ? 'Actioned' : 'تم التنفيذ'}
                            </Button>
                          )}
                          {notification.status !== 'archived' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleArchive(notification.id)
                              }}
                            >
                              <Archive className="w-3 h-3 ml-1" />
                              {appLang === 'en' ? 'Archive' : 'أرشف'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
