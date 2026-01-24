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
  | 'inventory_transfers' // ✅ النقل بين المخازن
  // 🔐 جداول الحوكمة (Governance)
  | 'company_members'
  | 'branches'
  | 'warehouses'
  | 'company_role_permissions'
  | 'permissions'

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

// 🔐 Governance Event Handlers
export type GovernanceEventHandler = (event: {
  type: RealtimeEventType
  table: 'company_members' | 'branches' | 'warehouses' | 'company_role_permissions' | 'permissions'
  new?: any
  old?: any
  timestamp: number
  affectsCurrentUser: boolean // هل يؤثر على المستخدم الحالي؟
}) => void | Promise<void>

// =====================================================
// Realtime Manager Class
// =====================================================

class RealtimeManager {
  // ✅ Lazy initialization للـ Supabase client لتجنب مشاكل التهيئة المبكرة
  private _supabase: ReturnType<typeof getClient> | ReturnType<typeof createClient> | null = null
  private get supabase() {
    if (!this._supabase) {
      this._supabase = getClient() || createClient()
    }
    return this._supabase
  }
  private subscriptions: Map<RealtimeTable, RealtimeSubscription> = new Map()
  private eventHandlers: Map<RealtimeTable, Set<RealtimeEventHandler>> = new Map()
  private context: RealtimeContext | null = null
  private isInitialized = false
  private initializationPromise: Promise<void> | null = null
  // ✅ منع التكرار: تتبع الأحداث المعالجة مؤخراً
  private processedEvents: Map<string, number> = new Map() // eventKey -> timestamp
  private readonly EVENT_DEDUP_WINDOW = 5000 // 5 ثواني
  
  // 🔐 Governance Realtime Channel
  private governanceChannel: RealtimeChannel | null = null
  private governanceHandlers: Set<GovernanceEventHandler> = new Set()
  private isGovernanceSubscribed = false
  
  // ✅ منع التكرار: منع استدعاءات متعددة متزامنة لـ updateContext
  private updateContextPromise: Promise<void> | null = null

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
      // ✅ التأكد من أن Supabase client جاهز
      if (!this.supabase) {
        console.warn('⚠️ [RealtimeManager] Supabase client not available, skipping initialization')
        return
      }

      // جلب سياق المستخدم
      const { data: { user }, error: userError } = await this.supabase.auth.getUser()
      
      // ✅ معالجة AbortError بشكل صحيح
      if (userError) {
        // تجاهل AbortError لأنه يحدث عادة عند إلغاء المكون
        if (userError.name === 'AbortError' || userError.message?.includes('aborted')) {
          console.warn('⚠️ [RealtimeManager] Initialization aborted (component unmounted)')
          return
        }
        throw userError
      }
      
      if (!user) {
        console.warn('⚠️ [RealtimeManager] No authenticated user, skipping initialization')
        return
      }

      let companyId: string | null = null
      try {
        companyId = await getActiveCompanyId(this.supabase)
      } catch (error: any) {
        // ✅ تجاهل AbortError
        if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
          console.warn('⚠️ [RealtimeManager] getActiveCompanyId aborted')
          return
        }
        throw error
      }
      
      if (!companyId) {
        console.warn('⚠️ [RealtimeManager] No active company, skipping initialization')
        return
      }

      let accessInfo: UserAccessInfo | null = null
      try {
        accessInfo = await getUserAccessInfo(this.supabase, user.id)
      } catch (error: any) {
        // ✅ تجاهل AbortError
        if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
          console.warn('⚠️ [RealtimeManager] getUserAccessInfo aborted')
          return
        }
        throw error
      }
      
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

      // 🔐 الاشتراك في قناة الحوكمة
      await this.subscribeToGovernance()

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
    // ✅ منع التكرار: إذا كان هناك تحديث قيد التنفيذ، انتظر انتهاءه
    if (this.updateContextPromise) {
      return this.updateContextPromise
    }

    this.updateContextPromise = this._doUpdateContext()
    
    try {
      await this.updateContextPromise
    } finally {
      this.updateContextPromise = null
    }
  }

  private async _doUpdateContext(): Promise<void> {
    // حفظ الجداول المشتركة فيها قبل إعادة التهيئة
    const activeSubscriptions = Array.from(this.subscriptions.entries())
      .filter(([_, subscription]) => subscription.isActive)
      .map(([table]) => table)
    
    this.isInitialized = false
    await this.initialize()
    
    // 🔐 إعادة الاشتراك في قناة الحوكمة
    await this.subscribeToGovernance()
    
    // إعادة الاشتراك في جميع الجداول النشطة (بدون إلغاء الاشتراك أولاً لتجنب التكرار)
    for (const table of activeSubscriptions) {
      // ✅ التحقق من أن الجدول غير مشترك بالفعل قبل إعادة الاشتراك
      if (!this.isSubscribed(table)) {
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
      'inventory_transfers': 'inventory_transfers', // ✅ النقل بين المخازن
      // 🔐 جداول الحوكمة
      'company_members': 'company_members',
      'branches': 'branches',
      'warehouses': 'warehouses',
      'company_role_permissions': 'company_role_permissions',
      'permissions': 'permissions',
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

    // إلغاء الاشتراك السابق إن وجد (بصمت لتجنب التكرار في السجلات عند إعادة الاشتراك)
    await this.unsubscribe(table, true)

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
            // ✅ Logging مؤقت للتحقق من وصول الأحداث
            if (table === 'inventory_write_offs' || table === 'depreciation') {
              const record = payload.new || payload.old
              if (record && typeof record === 'object' && 'id' in record) {
                console.log('[REALTIME] write_off event', {
                  type: payload.eventType,
                  id: (record as any).id,
                  status: (record as any).status,
                  branch: (record as any).branch_id,
                  warehouse: (record as any).warehouse_id,
                  company_id: (record as any).company_id
                })
              }
            }
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
        // ⚠️ مهم: Supabase Postgres Changes لا يدعم OR logic في الفلتر
        // ✅ الحل: نزيل جميع الفلاتر (branch_id, warehouse_id, created_by) من buildFilter
        // ✅ ونعتمد على shouldProcessEvent للفلترة (يدعم OR logic)
        // ✅ هذا يضمن أن المستخدم يستقبل جميع الأحداث المتعلقة بإهلاكاته (حتى لو كانت في فرع/مخزن آخر)
        // ✅ أو إهلاكات في نفس الفرع/المخزن
        // ✅ فقط company_id filter يبقى - الباقي في shouldProcessEvent
        return filter

      case 'inventory_transactions':
        // ✅ حركات المخزون: استخدام company_id فقط
        // ✅ الفلترة التفصيلية تتم في shouldProcessEvent (يدعم OR logic)
        // ✅ هذا يضمن أن المستخدم يستقبل جميع الأحداث المتعلقة بحركاته (حتى لو كانت في فرع/مخزن آخر)
        // ✅ أو حركات في نفس الفرع/المخزن
        return filter

      case 'purchase_orders':
      case 'sales_orders':
      case 'invoices':
        // ✅ الأوامر والفواتير: استخدام company_id فقط
        // ✅ الفلترة التفصيلية تتم في shouldProcessEvent (يدعم OR logic)
        // ✅ هذا يضمن أن المستخدم يستقبل جميع الأحداث المتعلقة بأوامره (حتى لو كانت في فرع آخر)
        // ✅ أو أوامر في نفس الفرع/مركز التكلفة
        return filter

      case 'approvals':
        // ✅ الموافقات: استخدام company_id فقط
        // ✅ الفلترة التفصيلية تتم في shouldProcessEvent (يدعم OR logic)
        // ✅ هذا يضمن أن المستخدم يستقبل جميع الأحداث المتعلقة بموافقاته (حتى لو كانت في فرع آخر)
        // ✅ أو موافقات موجهة لدوره/مستخدمه
        return filter

      case 'inventory_transfers':
        // ✅ النقل بين المخازن: استخدام company_id فقط
        // ✅ الفلترة التفصيلية تتم في shouldProcessEvent (يدعم OR logic)
        // ✅ هذا يضمن أن المستخدم يستقبل جميع الأحداث المتعلقة بنقله (حتى لو كانت في فرع آخر)
        // ✅ أو نقل في نفس الفرع/المخزن
        return filter

      default:
        // ✅ افتراضي: حسب company_id و branch_id (فرع واحد فقط)
        // 🎯 قرار معماري: المستخدم له فرع واحد فقط - لا دعم للفروع المتعددة
        if (accessFilter.filterByBranch && branchId) {
          // ✅ استخدام branch_id واحد فقط (من company_members.branch_id)
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

    const { companyId, accessInfo, accessFilter, userId, role } = this.context

    // ✅ طبقة 1: التحقق الإجباري من company_id
    if (record.company_id !== companyId) {
      console.warn(`🚫 [RealtimeManager] Event rejected: different company (${record.company_id} vs ${companyId})`)
      return false
    }

    // ✅ طبقة 1.5: Owner/Admin يروا كل شيء في الشركة (بغض النظر عن الفرع أو المنشئ)
    // ⚠️ مهم: هذا يجب أن يكون قبل أي فحوصات أخرى
    if (role === 'owner' || role === 'admin' || accessInfo.isUnrestricted) {
      console.log(`✅ [RealtimeManager] Owner/Admin can see all events in company:`, {
        recordId: record.id,
        userRole: role,
        companyId: record.company_id
      })
      return true
    }

    // ✅ طبقة 2: استخدام نظام الصلاحيات الموجود
    // تحويل السجل إلى التنسيق المتوقع
    // ✅ مهم: بعض الجداول تستخدم created_by والبعض created_by_user_id
    const recordForCheck = {
      created_by_user_id: record.created_by_user_id || record.created_by || null,
      branch_id: record.branch_id || null,
      cost_center_id: record.cost_center_id || null,
      warehouse_id: record.warehouse_id || null,
    }
    
    // ✅ استثناء خاص: للمستخدمين الذين أنشأوا السجل، نسمح برؤية تحديثات على سجلاتهم الخاصة
    // حتى لو لم يكونوا هم من عدلوها (مثل حالة رفض/اعتماد من المالك)
    // ⚠️ مهم: نفحص created_by مباشرة بدون الاعتماد على filterByCreatedBy
    // لأن store_manager قد يكون لديه filterByCreatedBy: false لكنه أنشأ السجل
    if (userId && (record.created_by === userId || record.created_by_user_id === userId)) {
      // المستخدم أنشأ هذا السجل → يرى جميع التحديثات عليه
      console.log(`✅ [RealtimeManager] User can see update on their own record:`, {
        recordId: record.id,
        userId,
        createdBy: record.created_by || record.created_by_user_id,
        userRole: accessInfo.role
      })
      return true
    }

    // ✅ استثناء خاص: لمسئول المخزن (store_manager)، نسمح برؤية تحديثات على إهلاكات في مخزنه
    // حتى لو لم يكن هو منشئها (مثل حالة رفض/اعتماد من المالك)
    if (accessFilter.filterByWarehouse && accessInfo.warehouseId && record.warehouse_id === accessInfo.warehouseId) {
      // المستخدم مسئول عن هذا المخزن → يرى جميع التحديثات على إهلاكاته
      console.log(`✅ [RealtimeManager] Store manager can see update on write-off in their warehouse:`, {
        recordId: record.id,
        userId,
        warehouseId: record.warehouse_id,
        userWarehouseId: accessInfo.warehouseId
      })
      return true
    }

    // ✅ استثناء خاص: للمدير (manager)، نسمح برؤية تحديثات على سجلات في فرعه
    // حتى لو لم يكن هو منشئها
    if (accessFilter.filterByBranch && accessInfo.branchId && record.branch_id === accessInfo.branchId) {
      console.log(`✅ [RealtimeManager] Manager can see update on record in their branch:`, {
        recordId: record.id,
        userId,
        branchId: record.branch_id,
        userBranchId: accessInfo.branchId
      })
      return true
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
    // ✅ فحوصات خاصة بكل جدول (للجداول التي تحتاج منطق خاص)
    
    // ✅ notifications: التحقق من assigned_to_user أو assigned_to_role
    if (record.assigned_to_user || record.assigned_to_role) {
      if (record.assigned_to_user === userId || record.assigned_to_role === role) {
        return true
      }
    }

    // ✅ approvals: التحقق من assigned_to_user أو assigned_to_role
    if (record.assigned_to_user || record.assigned_to_role) {
      if (record.assigned_to_user === userId || record.assigned_to_role === role) {
        return true
      }
    }

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
  async unsubscribe(table: RealtimeTable, silent: boolean = false): Promise<void> {
    const subscription = this.subscriptions.get(table)
    if (subscription && subscription.isActive) {
      try {
        await this.supabase.removeChannel(subscription.channel)
        subscription.isActive = false
        if (!silent) {
          console.log(`✅ [RealtimeManager] Unsubscribed from ${table}`)
        }
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

  // =====================================================
  // 🔐 Governance Realtime System
  // =====================================================

  /**
   * الاشتراك في قناة الحوكمة (Governance Channel)
   * تستمع لتغييرات الصلاحيات والأدوار والعضويات
   */
  private async subscribeToGovernance(): Promise<void> {
    console.log('🔐 [RealtimeManager] subscribeToGovernance called', {
      hasContext: !!this.context,
      isGovernanceSubscribed: this.isGovernanceSubscribed,
      context: this.context ? {
        companyId: this.context.companyId,
        userId: this.context.userId
      } : null
    })

    if (!this.context) {
      console.warn('⚠️ [RealtimeManager] Cannot subscribe to governance: no context')
      return
    }

    if (this.isGovernanceSubscribed) {
      console.log('ℹ️ [RealtimeManager] Already subscribed to governance channel')
      return
    }

    try {
      const { companyId, userId, role } = this.context
      if (!companyId || !userId) {
        console.warn('⚠️ [RealtimeManager] Cannot subscribe to governance: missing context', { companyId, userId })
        return
      }

      console.log('🔐 [RealtimeManager] Starting governance subscription...', { companyId, userId, role })

      // إلغاء الاشتراك السابق إن وجد
      await this.unsubscribeFromGovernance()

      const channelName = `governance_realtime_channel:${companyId}:${userId}`
      const channel = this.supabase.channel(channelName)

      // 🔐 الاشتراك في company_members (تغييرات العضوية والدور)
      // ✅ فلترة حسب company_id و user_id - المستخدم يستقبل فقط التغييرات الخاصة به
      // ✅ Owner/Admin يستقبلون جميع التغييرات في الشركة (يتم التعامل معه في handleGovernanceEvent)
      const companyMembersFilter = role === 'owner' || role === 'admin'
        ? `company_id=eq.${companyId}` // Owner/Admin: جميع التغييرات في الشركة
        : `company_id=eq.${companyId}.and.user_id=eq.${userId}` // المستخدمون الآخرون: فقط تغييراتهم
      
      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'company_members',
            filter: companyMembersFilter,
          },
          (payload: RealtimePostgresChangesPayload<any>) => this.handleGovernanceEvent('company_members', payload)
        )

      // 🔐 الاشتراك في branches (تغييرات الفروع)
      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'branches',
            filter: `company_id=eq.${companyId}`,
          },
          (payload: RealtimePostgresChangesPayload<any>) => this.handleGovernanceEvent('branches', payload)
        )

      // 🔐 الاشتراك في warehouses (تغييرات المخازن)
      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'warehouses',
            filter: `company_id=eq.${companyId}`,
          },
          (payload: RealtimePostgresChangesPayload<any>) => this.handleGovernanceEvent('warehouses', payload)
        )

      // 🔐 الاشتراك في company_role_permissions (تغييرات صلاحيات الأدوار)
      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'company_role_permissions',
            filter: `company_id=eq.${companyId}`,
          },
          (payload: RealtimePostgresChangesPayload<any>) => this.handleGovernanceEvent('company_role_permissions', payload)
        )

      // 🔐 الاشتراك في permissions (تغييرات الصلاحيات العامة)
      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'permissions',
          },
          (payload: RealtimePostgresChangesPayload<any>) => this.handleGovernanceEvent('permissions', payload)
        )

      channel.subscribe((status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ [RealtimeManager] Subscribed to Governance Channel')
          this.isGovernanceSubscribed = true
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ [RealtimeManager] Error subscribing to Governance Channel')
          this.isGovernanceSubscribed = false
        }
      })

      this.governanceChannel = channel
    } catch (error) {
      console.error('❌ [RealtimeManager] Error subscribing to governance:', error)
    }
  }

  /**
   * معالجة أحداث الحوكمة
   */
  private async handleGovernanceEvent(
    table: 'company_members' | 'branches' | 'warehouses' | 'company_role_permissions' | 'permissions',
    payload: RealtimePostgresChangesPayload<any>
  ): Promise<void> {
    try {
      if (!this.context) return

      const { userId, companyId, role } = this.context
      const record = payload.new || payload.old

      if (!record) return

      // 🔐 منع التكرار
      const eventKey = `governance:${table}:${payload.eventType}:${record.id}:${Date.now()}`
      const now = Date.now()
      const lastProcessed = this.processedEvents.get(eventKey)
      if (lastProcessed && (now - lastProcessed) < this.EVENT_DEDUP_WINDOW) {
        return
      }
      this.processedEvents.set(eventKey, now)

      // 🔐 التحقق من الصلاحيات: فقط الأحداث في نفس الشركة
      if (record.company_id && record.company_id !== companyId) {
        console.warn(`🚫 [RealtimeManager] Governance event rejected: different company`)
        return
      }

      // 🔐 تحديد إذا كان الحدث يؤثر على المستخدم الحالي
      let affectsCurrentUser = false

      if (table === 'company_members') {
        // إذا كان الحدث يخص المستخدم الحالي
        affectsCurrentUser = record.user_id === userId
      } else if (table === 'branches') {
        // إذا كان الفرع مرتبط بالمستخدم الحالي
        affectsCurrentUser = this.context.branchId === record.id
      } else if (table === 'warehouses') {
        // إذا كان المخزن مرتبط بالمستخدم الحالي
        affectsCurrentUser = this.context.warehouseId === record.id
      } else if (table === 'company_role_permissions') {
        // إذا كان التغيير يخص دور المستخدم الحالي
        affectsCurrentUser = record.role === role
      } else if (table === 'permissions') {
        // الصلاحيات العامة تؤثر على الجميع
        affectsCurrentUser = true
      }

      // 🔐 Owner/Admin: يرى جميع الأحداث (لكن affectsCurrentUser يبقى صحيح فقط إذا كان يخصهم)
      const canSeeEvent = role === 'owner' || role === 'admin' || affectsCurrentUser

      if (!canSeeEvent) {
        // المستخدمون الآخرون لا يرون إلا الأحداث التي تخصهم
        return
      }

      const event = {
        type: payload.eventType as RealtimeEventType,
        table,
        new: payload.new,
        old: payload.old,
        timestamp: now,
        affectsCurrentUser,
      }

      // إرسال الحدث لجميع معالجات الحوكمة
      this.governanceHandlers.forEach((handler) => {
        try {
          handler(event)
        } catch (error) {
          console.error(`❌ [RealtimeManager] Error in governance event handler:`, error)
        }
      })

      // 🔐 إذا كان الحدث يؤثر على المستخدم الحالي، إعادة بناء السياق والاشتراكات
      if (affectsCurrentUser) {
        console.log(`🔄 [RealtimeManager] Governance event affects current user, rebuilding context...`, {
          table,
          eventType: payload.eventType,
        })
        await this.rebuildContextAndSubscriptions()
      }
    } catch (error) {
      console.error(`❌ [RealtimeManager] Error handling governance event for ${table}:`, error)
    }
  }

  /**
   * إعادة بناء السياق والاشتراكات بعد تغيير الصلاحيات
   */
  private async rebuildContextAndSubscriptions(): Promise<void> {
    try {
      console.log('🔄 [RealtimeManager] Rebuilding context and subscriptions...')

      // إلغاء جميع الاشتراكات الحالية
      await this.unsubscribeAll()

      // إعادة تهيئة السياق
      await this.updateContext()

      // إعادة الاشتراك في جميع الجداول
      const tablesToResubscribe: RealtimeTable[] = [
        'notifications',
        'inventory_transactions',
        'purchase_orders',
        'sales_orders',
        'invoices',
        'approvals',
        'inventory_transfers',
      ]

      for (const table of tablesToResubscribe) {
        await this.subscribe(table)
      }

      console.log('✅ [RealtimeManager] Context and subscriptions rebuilt successfully')
    } catch (error) {
      console.error('❌ [RealtimeManager] Error rebuilding context:', error)
    }
  }

  /**
   * إلغاء الاشتراك من قناة الحوكمة
   */
  private async unsubscribeFromGovernance(): Promise<void> {
    if (this.governanceChannel) {
      try {
        await this.supabase.removeChannel(this.governanceChannel)
        this.governanceChannel = null
        this.isGovernanceSubscribed = false
        console.log('✅ [RealtimeManager] Unsubscribed from Governance Channel')
      } catch (error) {
        console.error('❌ [RealtimeManager] Error unsubscribing from governance:', error)
      }
    }
  }

  /**
   * تسجيل معالج أحداث الحوكمة
   */
  onGovernanceChange(handler: GovernanceEventHandler): () => void {
    this.governanceHandlers.add(handler)
    return () => {
      this.governanceHandlers.delete(handler)
    }
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
