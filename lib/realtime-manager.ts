/**
 * 🔄 Realtime Manager - نظام التحديث التلقائي المركزي
 * 
 * نظام موحد لإدارة التحديثات اللحظية من Supabase Realtime
 * يدعم جميع الجداول الأساسية مع احترام الصلاحيات والسياق
 */

import { createClient, getClient } from '@/lib/supabase/client'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { getActiveCompanyId } from '@/lib/company'
import { getUserAccessInfo, buildAccessFilter, canAccessRecord, type UserAccessInfo, type AccessFilter } from '@/lib/role-based-access'

// =====================================================
// Types
// =====================================================

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE'
export type RealtimeTable = 
  | 'notifications'
  | 'depreciation'
  | 'inventory_write_offs' // جدول الإهلاك الفعلي
  | 'inventory_transactions'
  | 'purchase_orders'
  | 'sales_orders'
  | 'invoices'
  | 'approvals'

export interface RealtimeEvent<T = any> {
  type: RealtimeEventType
  table: RealtimeTable
  new?: T
  old?: T
  timestamp: number
}

export interface RealtimeSubscription {
  table: RealtimeTable
  channel: RealtimeChannel
  isActive: boolean
}

export interface RealtimeContext {
  companyId: string | null
  branchId: string | null
  warehouseId: string | null
  costCenterId: string | null
  role: string
  userId: string | null
  accessInfo: UserAccessInfo | null
  accessFilter: AccessFilter | null
}

export type RealtimeEventHandler<T = any> = (event: RealtimeEvent<T>) => void | Promise<void>

// =====================================================
// Realtime Manager Class
// =====================================================

class RealtimeManager {
  private supabase = getClient() || createClient()
  private subscriptions: Map<RealtimeTable, RealtimeSubscription> = new Map()
  private eventHandlers: Map<RealtimeTable, Set<RealtimeEventHandler>> = new Map()
  private context: RealtimeContext | null = null
  private isInitialized = false
  private initializationPromise: Promise<void> | null = null
  // ✅ منع التكرار: تتبع الأحداث المعالجة مؤخراً
  private processedEvents: Map<string, number> = new Map() // eventKey -> timestamp
  private readonly EVENT_DEDUP_WINDOW = 5000 // 5 ثواني

  /**
   * تهيئة المدير مع سياق المستخدم
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return
    if (this.initializationPromise) return this.initializationPromise

    this.initializationPromise = this._doInitialize()
    return this.initializationPromise
  }

  private async _doInitialize(): Promise<void> {
    try {
      // جلب سياق المستخدم
      const { data: { user } } = await this.supabase.auth.getUser()
      if (!user) {
        console.warn('⚠️ [RealtimeManager] No authenticated user, skipping initialization')
        return
      }

      const companyId = await getActiveCompanyId(this.supabase)
      if (!companyId) {
        console.warn('⚠️ [RealtimeManager] No active company, skipping initialization')
        return
      }

      const accessInfo = await getUserAccessInfo(this.supabase, user.id)
      if (!accessInfo) {
        console.warn('⚠️ [RealtimeManager] Could not get access info, skipping initialization')
        return
      }

      // بناء فلتر الوصول
      const accessFilter = buildAccessFilter(accessInfo)

      this.context = {
        companyId,
        branchId: accessInfo.branchId || null,
        warehouseId: accessInfo.warehouseId || null,
        costCenterId: accessInfo.costCenterId || null,
        role: accessInfo.role,
        userId: user.id,
        accessInfo,
        accessFilter,
      }

      console.log('✅ [RealtimeManager] Initialized with context:', {
        companyId: this.context.companyId,
        branchId: this.context.branchId,
        role: this.context.role,
      })

      this.isInitialized = true
    } catch (error) {
      console.error('❌ [RealtimeManager] Initialization error:', error)
      throw error
    }
  }

  /**
   * تحديث السياق (عند تغيير الشركة/الفرع)
   */
  async updateContext(): Promise<void> {
    this.isInitialized = false
    await this.initialize()
    
    // إعادة الاشتراك في جميع الجداول
    for (const [table, subscription] of this.subscriptions.entries()) {
      if (subscription.isActive) {
        await this.subscribe(table)
      }
    }
  }

  /**
   * تحويل اسم الجدول المنطقي إلى اسم الجدول الفعلي في Supabase
   */
  private getActualTableName(table: RealtimeTable): string {
    // Mapping للجداول التي لها أسماء مختلفة في Supabase
    const tableMapping: Record<RealtimeTable, string> = {
      'notifications': 'notifications',
      'depreciation': 'inventory_write_offs', // جدول الإهلاك الفعلي
      'inventory_write_offs': 'inventory_write_offs',
      'inventory_transactions': 'inventory_transactions',
      'purchase_orders': 'purchase_orders',
      'sales_orders': 'sales_orders',
      'invoices': 'invoices',
      'approvals': 'approval_workflows', // قد يكون اسم مختلف
    }
    return tableMapping[table] || table
  }

  /**
   * الاشتراك في جدول معين
   */
  async subscribe(table: RealtimeTable): Promise<void> {
    // التأكد من التهيئة
    if (!this.isInitialized) {
      await this.initialize()
    }

    if (!this.context) {
      console.warn(`⚠️ [RealtimeManager] Cannot subscribe to ${table}: no context`)
      return
    }

    // إلغاء الاشتراك السابق إن وجد
    await this.unsubscribe(table)

    try {
      const channelName = `realtime:${table}:${this.context.companyId}`
      const channel = this.supabase.channel(channelName)

      // بناء الفلتر حسب الصلاحيات
      const filter = this.buildFilter(table)

      // الحصول على اسم الجدول الفعلي في Supabase
      const actualTableName = this.getActualTableName(table)

      // الاشتراك في الأحداث
      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: actualTableName, // ✅ استخدام الاسم الفعلي
            filter,
          },
          (payload: RealtimePostgresChangesPayload<any>) => {
            this.handleEvent(table, payload)
          }
        )
        .subscribe((status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => {
          if (status === 'SUBSCRIBED') {
            console.log(`✅ [RealtimeManager] Subscribed to ${table}`)
          } else if (status === 'CHANNEL_ERROR') {
            console.error(`❌ [RealtimeManager] Error subscribing to ${table}`)
          }
        })

      this.subscriptions.set(table, {
        table,
        channel,
        isActive: true,
      })
    } catch (error) {
      console.error(`❌ [RealtimeManager] Error subscribing to ${table}:`, error)
    }
  }

  /**
   * بناء فلتر الوصول حسب الصلاحيات (ERP Standard)
   * يستخدم نظام الصلاحيات الموجود في المشروع
   */
  private buildFilter(table: RealtimeTable): string {
    if (!this.context || !this.context.accessFilter) {
      return ''
    }

    const { companyId, branchId, costCenterId, warehouseId, role, userId, accessFilter } = this.context

    // ✅ قاعدة أساسية: جميع الجداول يجب أن تكون في نفس الشركة
    let filter = `company_id=eq.${companyId}`

    // ✅ Owner/Admin: يرى كل شيء في الشركة (لا قيود إضافية)
    if (role === 'owner' || role === 'admin') {
      return filter
    }

    // ✅ بناء الفلتر حسب نوع الجدول
    switch (table) {
      case 'notifications':
        // الإشعارات: حسب assigned_to_user أو assigned_to_role
        // + فلترة حسب branch/warehouse إذا كان محدداً
        let notifFilter = filter
        if (accessFilter.filterByBranch && branchId) {
          notifFilter += `.and(branch_id.eq.${branchId}.or.branch_id.is.null)`
        }
        if (accessFilter.filterByWarehouse && warehouseId) {
          notifFilter += `.and(warehouse_id.eq.${warehouseId}.or.warehouse_id.is.null)`
        }
        // فلترة حسب المستخدم أو الدور
        notifFilter += `.and(assigned_to_user.eq.${userId}.or.assigned_to_role.eq.${role})`
        return notifFilter

      case 'depreciation':
      case 'inventory_write_offs':
        // الإهلاك: المالك والمدير يروا كل شيء، الباقي حسب warehouse و branch
        // ✅ Owner/Admin: يرى كل شيء (تم التحقق أعلاه)
        // للمستخدمين الآخرين: فلترة حسب warehouse و branch
        let depFilter = filter
        if (accessFilter.filterByBranch && branchId) {
          depFilter += `.and(branch_id.eq.${branchId}`
          if (accessFilter.allowedBranchIds && accessFilter.allowedBranchIds.length > 0) {
            // إذا كان لديه صلاحية لعدة فروع
            const branchIds = [branchId, ...accessFilter.allowedBranchIds].join(',')
            depFilter = filter + `.and.branch_id.in.(${branchIds})`
          } else {
            depFilter += `.or.branch_id.is.null)`
          }
        }
        if (accessFilter.filterByWarehouse && warehouseId) {
          depFilter += `.and.warehouse_id.eq.${warehouseId}`
        }
        if (accessFilter.filterByCreatedBy && userId) {
          depFilter += `.and.created_by_user_id.eq.${userId}`
        }
        return depFilter

      case 'inventory_transactions':
        // حركات المخزون: حسب warehouse و branch
        let invFilter = filter
        if (accessFilter.filterByBranch && branchId) {
          invFilter += `.and(branch_id.eq.${branchId}`
          if (accessFilter.allowedBranchIds && accessFilter.allowedBranchIds.length > 0) {
            // إذا كان لديه صلاحية لعدة فروع
            const branchIds = [branchId, ...accessFilter.allowedBranchIds].join(',')
            invFilter = filter + `.and.branch_id.in.(${branchIds})`
          } else {
            invFilter += `.or.branch_id.is.null)`
          }
        }
        if (accessFilter.filterByWarehouse && warehouseId) {
          invFilter += `.and.warehouse_id.eq.${warehouseId}`
        }
        if (accessFilter.filterByCreatedBy && userId) {
          invFilter += `.and.created_by_user_id.eq.${userId}`
        }
        return invFilter

      case 'purchase_orders':
      case 'sales_orders':
      case 'invoices':
        // الأوامر والفواتير: حسب branch و cost_center
        let orderFilter = filter
        if (accessFilter.filterByBranch && branchId) {
          if (accessFilter.allowedBranchIds && accessFilter.allowedBranchIds.length > 0) {
            const branchIds = [branchId, ...accessFilter.allowedBranchIds].join(',')
            orderFilter = filter + `.and.branch_id.in.(${branchIds})`
          } else {
            orderFilter += `.and(branch_id.eq.${branchId}.or.branch_id.is.null)`
          }
        }
        if (accessFilter.filterByCostCenter && costCenterId) {
          orderFilter += `.and(cost_center_id.eq.${costCenterId}.or.cost_center_id.is.null)`
        }
        if (accessFilter.filterByCreatedBy && userId) {
          orderFilter += `.and.created_by_user_id.eq.${userId}`
        }
        return orderFilter

      case 'approvals':
        // الموافقات: حسب branch و role
        let approvalFilter = filter
        if (accessFilter.filterByBranch && branchId) {
          approvalFilter += `.and(branch_id.eq.${branchId}.or.branch_id.is.null)`
        }
        // الموافقات عادة موجهة لدور معين
        approvalFilter += `.and(assigned_to_role.eq.${role}.or.assigned_to_user.eq.${userId})`
        return approvalFilter

      default:
        // افتراضي: حسب company_id و branch_id
        if (accessFilter.filterByBranch && branchId) {
          if (accessFilter.allowedBranchIds && accessFilter.allowedBranchIds.length > 0) {
            const branchIds = [branchId, ...accessFilter.allowedBranchIds].join(',')
            return filter + `.and.branch_id.in.(${branchIds})`
          }
          return filter + `.and.branch_id.eq.${branchId}`
        }
        return filter
    }
  }

  /**
   * معالجة حدث Realtime مع منع التكرار
   */
  private async handleEvent(
    table: RealtimeTable,
    payload: RealtimePostgresChangesPayload<any>
  ): Promise<void> {
    try {
      // ✅ منع التكرار: إنشاء مفتاح فريد للحدث
      const record = payload.new || payload.old
      if (!record || !record.id) {
        return
      }

      const eventKey = `${table}:${payload.eventType}:${record.id}:${record.updated_at || record.created_at || Date.now()}`
      const now = Date.now()

      // ✅ التحقق من معالجة هذا الحدث مؤخراً
      const lastProcessed = this.processedEvents.get(eventKey)
      if (lastProcessed && (now - lastProcessed) < this.EVENT_DEDUP_WINDOW) {
        console.warn(`⚠️ [RealtimeManager] Duplicate event ignored: ${eventKey} (processed ${now - lastProcessed}ms ago)`)
        return
      }

      // ✅ تسجيل الحدث كمعالج
      this.processedEvents.set(eventKey, now)

      // ✅ تنظيف الأحداث القديمة (أقدم من 30 ثانية)
      const cleanupThreshold = now - 30000
      for (const [key, timestamp] of this.processedEvents.entries()) {
        if (timestamp < cleanupThreshold) {
          this.processedEvents.delete(key)
        }
      }

      // ✅ التحقق من الصلاحيات
      if (!this.shouldProcessEvent(record)) {
        return
      }

      const event: RealtimeEvent = {
        type: payload.eventType as RealtimeEventType,
        table,
        new: payload.new,
        old: payload.old,
        timestamp: now,
      }

      // إرسال الحدث لجميع المعالجات المسجلة
      const handlers = this.eventHandlers.get(table)
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(event)
          } catch (error) {
            console.error(`❌ [RealtimeManager] Error in event handler for ${table}:`, error)
          }
        })
      }

      // إرسال الحدث العام (لجميع الجداول)
      const globalHandlers = this.eventHandlers.get('*' as RealtimeTable)
      if (globalHandlers) {
        globalHandlers.forEach((handler) => {
          try {
            handler(event)
          } catch (error) {
            console.error(`❌ [RealtimeManager] Error in global event handler:`, error)
          }
        })
      }
    } catch (error) {
      console.error(`❌ [RealtimeManager] Error handling event for ${table}:`, error)
    }
  }

  /**
   * التحقق من صلاحية معالجة الحدث (ERP Standard - Multi-layer Security)
   * 
   * طبقات الأمان:
   * 1. التحقق من company_id (إجباري)
   * 2. التحقق من branch_id (حسب الصلاحيات)
   * 3. التحقق من warehouse_id (حسب الصلاحيات)
   * 4. التحقق من cost_center_id (حسب الصلاحيات)
   * 5. التحقق من created_by_user_id (للموظفين)
   * 6. استخدام canAccessRecord من نظام الصلاحيات
   */
  private shouldProcessEvent(record: any): boolean {
    if (!this.context || !record || !this.context.accessInfo || !this.context.accessFilter) {
      return false
    }

    const { companyId, accessInfo, accessFilter } = this.context

    // ✅ طبقة 1: التحقق الإجباري من company_id
    if (record.company_id !== companyId) {
      console.warn(`🚫 [RealtimeManager] Event rejected: different company (${record.company_id} vs ${companyId})`)
      return false
    }

    // ✅ طبقة 2: استخدام نظام الصلاحيات الموجود
    // تحويل السجل إلى التنسيق المتوقع
    const recordForCheck = {
      created_by_user_id: record.created_by_user_id || record.created_by || null,
      branch_id: record.branch_id || null,
      cost_center_id: record.cost_center_id || null,
      warehouse_id: record.warehouse_id || null,
    }

    // ✅ استخدام canAccessRecord للتحقق الشامل
    const hasAccess = canAccessRecord(accessInfo, recordForCheck)
    
    if (!hasAccess) {
      console.warn(`🚫 [RealtimeManager] Event rejected: access denied`, {
        recordId: record.id,
        companyId: record.company_id,
        branchId: record.branch_id,
        userRole: accessInfo.role,
        userBranchId: accessInfo.branchId,
      })
      return false
    }

    // ✅ طبقة 3: فحوصات إضافية حسب نوع الجدول
    // (يمكن إضافة فحوصات خاصة بكل جدول هنا)

    return true
  }

  /**
   * تسجيل معالج أحداث
   */
  on<T = any>(table: RealtimeTable | '*', handler: RealtimeEventHandler<T>): () => void {
    const tableKey = table as RealtimeTable
    if (!this.eventHandlers.has(tableKey)) {
      this.eventHandlers.set(tableKey, new Set())
    }
    this.eventHandlers.get(tableKey)!.add(handler as RealtimeEventHandler)

    // إرجاع دالة إلغاء التسجيل
    return () => {
      const handlers = this.eventHandlers.get(tableKey)
      if (handlers) {
        handlers.delete(handler as RealtimeEventHandler)
      }
    }
  }

  /**
   * إلغاء الاشتراك من جدول
   */
  async unsubscribe(table: RealtimeTable): Promise<void> {
    const subscription = this.subscriptions.get(table)
    if (subscription && subscription.isActive) {
      try {
        await this.supabase.removeChannel(subscription.channel)
        subscription.isActive = false
        console.log(`✅ [RealtimeManager] Unsubscribed from ${table}`)
      } catch (error) {
        console.error(`❌ [RealtimeManager] Error unsubscribing from ${table}:`, error)
      }
    }
    this.subscriptions.delete(table)
  }

  /**
   * إلغاء جميع الاشتراكات
   */
  async unsubscribeAll(): Promise<void> {
    const tables = Array.from(this.subscriptions.keys())
    await Promise.all(tables.map((table) => this.unsubscribe(table)))
  }

  /**
   * الحصول على السياق الحالي
   */
  getContext(): RealtimeContext | null {
    return this.context
  }

  /**
   * التحقق من حالة الاشتراك
   */
  isSubscribed(table: RealtimeTable): boolean {
    return this.subscriptions.get(table)?.isActive || false
  }
}

// =====================================================
// Singleton Instance
// =====================================================

let managerInstance: RealtimeManager | null = null

export function getRealtimeManager(): RealtimeManager {
  if (!managerInstance) {
    managerInstance = new RealtimeManager()
  }
  return managerInstance
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * تهيئة Realtime Manager تلقائياً
 */
export async function initializeRealtime(): Promise<RealtimeManager> {
  const manager = getRealtimeManager()
  await manager.initialize()
  return manager
}

/**
 * الاشتراك في جدول معين
 */
export async function subscribeToTable(
  table: RealtimeTable,
  handler?: RealtimeEventHandler
): Promise<() => Promise<void>> {
  const manager = getRealtimeManager()
  await manager.initialize()
  await manager.subscribe(table)

  let unsubscribeHandler: (() => void) | null = null
  if (handler) {
    unsubscribeHandler = manager.on(table, handler)
  }

  return async () => {
    if (unsubscribeHandler) {
      unsubscribeHandler()
    }
    await manager.unsubscribe(table)
  }
}
