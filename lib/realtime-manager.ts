/**
 * 🔐 Realtime Manager - نظام التحديث التلقائي المركزي
 * 
 * ⚠️ CRITICAL SECURITY MODULE - DO NOT MODIFY WITHOUT REVIEW
 * 
 * هذا النظام جزء أساسي من نظام الأمان والتحديث الفوري.
 * راجع: docs/SECURITY_REALTIME_SYSTEM.md
 * 
 * ✅ القواعد الإلزامية:
 * 1. Single Source of Truth:
 *    - الدور والفرع من company_members فقط
 *    - لا joins، لا relations، لا جداول أخرى
 * 
 * 2. Realtime Subscriptions:
 *    - company_members: company_id=eq.${companyId} (بدون user_id filter)
 *    - user_branch_access: company_id=eq.${companyId} (بدون user_id filter)
 *    - الفلترة التفصيلية في handleGovernanceEvent
 * 
 * 3. BLIND REFRESH Pattern:
 *    - عند أي UPDATE على company_members أو user_branch_access:
 *      → affectsCurrentUser = true
 *      → refreshUserSecurityContext() بدون شروط
 * 
 * 4. التسلسل الإلزامي:
 *    - تحديث الداتابيس → Realtime event → refreshUserSecurityContext() → تحديث UI
 * 
 * ⚠️ تحذير: أي تعديل على هذا الملف يجب مراجعته مع:
 *    - lib/access-context.tsx
 *    - hooks/use-governance-realtime.ts
 *    - components/realtime-route-guard.tsx
 *    - docs/SECURITY_REALTIME_SYSTEM.md
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
  | 'bills' // ✅ فواتير المشتريات
  | 'approvals'
  | 'inventory_transfers' // ✅ النقل بين المخازن
  // 🔄 جداول البيانات الأساسية (Master Data)
  | 'customers' // ✅ العملاء
  | 'suppliers' // ✅ الموردين
  | 'products' // ✅ المنتجات
  // 🔄 جداول المعاملات المالية
  | 'payments' // ✅ المدفوعات
  | 'journal_entries' // ✅ القيود المحاسبية
  | 'purchase_returns' // ✅ مرتجعات المشتريات
  | 'purchase_return_warehouse_allocations' // ✅ تخصيصات مخازن مرتجعات المشتريات
  | 'sales_returns' // ✅ مرتجعات المبيعات
  | 'vendor_credits' // ✅ أرصدة الموردين
  | 'customer_debit_notes' // ✅ إشعارات مدين العملاء
  | 'expenses' // ✅ المصروفات
  // 🔐 جداول الحوكمة (Governance)
  | 'company_members'
  | 'user_branch_access' // ✅ الفروع المسموحة للمستخدم (دعم فروع متعددة)
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
  table: 'company_members' | 'user_branch_access' | 'branches' | 'warehouses' | 'company_role_permissions' | 'permissions'
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
      console.log('🔐 [RealtimeManager] Subscribing to governance channel...')
      await this.subscribeToGovernance()
      console.log('✅ [RealtimeManager] Governance subscription completed')

      this.isInitialized = true
      console.log('✅ [RealtimeManager] Initialization completed successfully')
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
      'bills': 'bills', // ✅ فواتير المشتريات
      'approvals': 'approval_workflows', // قد يكون اسم مختلف
      'inventory_transfers': 'inventory_transfers', // ✅ النقل بين المخازن
      // 🔄 جداول البيانات الأساسية
      'customers': 'customers',
      'suppliers': 'suppliers',
      'products': 'products',
      // 🔄 جداول المعاملات المالية
      'payments': 'payments',
      'journal_entries': 'journal_entries',
      'purchase_returns': 'purchase_returns',
      'purchase_return_warehouse_allocations': 'purchase_return_warehouse_allocations',
      'sales_returns': 'sales_returns',
      'vendor_credits': 'vendor_credits',
      'customer_debit_notes': 'customer_debit_notes',
      'expenses': 'expenses',
      // 🔐 جداول الحوكمة
      'company_members': 'company_members',
      'user_branch_access': 'user_branch_access',
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
        // ✅ استخدام company_id فقط كفلتر في Realtime channel
        // ⚠️ Supabase Realtime لا يدعم OR conditions في الفلاتر (مثل branch_id.is.null)
        // ✅ الفلترة التفصيلية (assigned_to_user, assigned_to_role, branch_id, warehouse_id)
        //    تتم في shouldProcessEvent (يدعم OR logic في الكود)
        return filter

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
      case 'bills': // ✅ فواتير المشتريات - يجب أن تكون مرئية لجميع المستخدمين في الشركة
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

      // 🔄 جداول البيانات الأساسية والمعاملات المالية - مرئية لجميع المستخدمين في الشركة
      case 'customers':
      case 'suppliers':
      case 'products':
      case 'payments':
      case 'journal_entries':
      case 'purchase_returns':
      case 'purchase_return_warehouse_allocations':
      case 'sales_returns':
      case 'vendor_credits':
      case 'customer_debit_notes':
      case 'expenses':
        // ✅ استخدام company_id فقط - الفلترة التفصيلية في shouldProcessEvent
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
      if (!this.shouldProcessEvent(table, record)) {
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
  private shouldProcessEvent(table: RealtimeTable, record: any): boolean {
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

    // ✅ طبقة 3: فحوصات إضافية حسب نوع الجدول
    // ✅ فحوصات خاصة بكل جدول (للجداول التي تحتاج منطق خاص)

    // ✅ notifications/approvals: التحقق من assigned_to_user أو assigned_to_role
    // ⚠️ مهم: هذا فحص إضافي للسماح بالوصول، وليس للرفض
    // إذا كان السجل موجه للمستخدم/الدور الحالي، نسمح بالوصول
    if (record.assigned_to_user || record.assigned_to_role) {
      if (record.assigned_to_user === userId || record.assigned_to_role === role) {
        console.log(`✅ [RealtimeManager] Event approved: assigned to current user/role`, {
          recordId: record.id,
          assignedToUser: record.assigned_to_user,
          assignedToRole: record.assigned_to_role,
          currentUserId: userId,
          currentRole: role,
        })
        return true
      }
      // ⚠️ لا نرفض هنا - نترك canAccessRecord يقرر
      // لأن المستخدم قد يكون له صلاحية أخرى (مثل manager في نفس الفرع)
    }

    // ✅ جداول البيانات الأساسية (Master Data) - مرئية لجميع المستخدمين في الشركة
    // هذه الجداول لا تحتاج فحص created_by_user_id لأنها بيانات مشتركة
    const masterDataTables: RealtimeTable[] = ['customers', 'suppliers', 'products']
    if (masterDataTables.includes(table)) {
      console.log(`✅ [RealtimeManager] Event approved: master data table (${table}) visible to all`, {
        recordId: record.id,
        userRole: accessInfo.role,
      })
      return true
    }

    // ✅ استثناء خاص: inventory_transfers - يستخدم source/destination بدلاً من branch_id/warehouse_id
    // المستخدم يرى طلبات النقل إذا كان:
    // 1. أنشأها (تم فحصه أعلاه)
    // 2. مسؤول عن المخزن المصدر أو الوجهة
    // 3. مدير الفرع المصدر أو الوجهة
    if (table === 'inventory_transfers') {
      const sourceWarehouseId = record.source_warehouse_id
      const destWarehouseId = record.destination_warehouse_id
      const sourceBranchId = record.source_branch_id
      const destBranchId = record.destination_branch_id

      // مسؤول المخزن يرى طلبات النقل من/إلى مخزنه
      if (accessFilter.filterByWarehouse && accessInfo.warehouseId) {
        if (sourceWarehouseId === accessInfo.warehouseId || destWarehouseId === accessInfo.warehouseId) {
          console.log(`✅ [RealtimeManager] Store manager can see transfer involving their warehouse:`, {
            recordId: record.id,
            sourceWarehouseId,
            destWarehouseId,
            userWarehouseId: accessInfo.warehouseId
          })
          return true
        }
      }

      // مدير الفرع يرى طلبات النقل من/إلى فرعه
      if (accessFilter.filterByBranch && accessInfo.branchId) {
        if (sourceBranchId === accessInfo.branchId || destBranchId === accessInfo.branchId) {
          console.log(`✅ [RealtimeManager] Manager can see transfer involving their branch:`, {
            recordId: record.id,
            sourceBranchId,
            destBranchId,
            userBranchId: accessInfo.branchId
          })
          return true
        }
      }

      // المحاسب يرى طلبات النقل من/إلى فرعه فقط
      if (role === 'accountant' && accessInfo.branchId) {
        if (sourceBranchId === accessInfo.branchId || destBranchId === accessInfo.branchId) {
          console.log(`✅ [RealtimeManager] Accountant can see transfer involving their branch:`, {
            recordId: record.id,
            sourceBranchId,
            destBranchId,
            userBranchId: accessInfo.branchId,
            userRole: role
          })
          return true
        }
      }

      // إذا لم يتطابق أي شرط، نرفض
      console.warn(`🚫 [RealtimeManager] Transfer event rejected: no access to source/dest warehouse/branch`, {
        recordId: record.id,
        sourceWarehouseId,
        destWarehouseId,
        sourceBranchId,
        destBranchId,
        userWarehouseId: accessInfo.warehouseId,
        userBranchId: accessInfo.branchId,
        userRole: role
      })
      return false
    }

    // ✅ استخدام canAccessRecord للتحقق الشامل
    // ⚠️ مهم: canAccessRecord يرفض الوصول للموظف إذا كان created_by_user_id غير موجود أو لا يتطابق
    const hasAccess = canAccessRecord(accessInfo, recordForCheck)

    if (!hasAccess) {
      console.warn(`🚫 [RealtimeManager] Event rejected: access denied by canAccessRecord`, {
        recordId: record.id,
        table,
        companyId: record.company_id,
        branchId: record.branch_id,
        createdBy: recordForCheck.created_by_user_id,
        userRole: accessInfo.role,
        userId: accessInfo.userId,
        userBranchId: accessInfo.branchId,
      })
      return false
    }

    // ✅ إذا وصلنا هنا، canAccessRecord أعطى الموافقة
    console.log(`✅ [RealtimeManager] Event approved by canAccessRecord:`, {
      recordId: record.id,
      table,
      userRole: accessInfo.role,
      userId: accessInfo.userId,
    })
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
   * 🔐 الاشتراك في قناة الحوكمة (Governance Channel)
   * 
   * ⚠️ CRITICAL SECURITY FUNCTION - DO NOT MODIFY WITHOUT REVIEW
   * 
   * هذا الدالة جزء أساسي من نظام الأمان والتحديث الفوري.
   * راجع: docs/SECURITY_REALTIME_SYSTEM.md
   * 
   * ✅ القواعد الإلزامية:
   * 1. الجداول المشتركة:
   *    - company_members (حرج - أساسي)
   *    - user_branch_access (حرج - للفروع المتعددة)
   *    - company_role_permissions (مهم)
   *    - branches, warehouses (مهم)
   * 
   * 2. الفلترة:
   *    - على مستوى Supabase: company_id=eq.${companyId} فقط
   *    - على مستوى Client: affectsCurrentUser في handleGovernanceEvent
   *    - ⚠️ لا تستخدم user_id filter في Supabase subscription
   * 
   * 3. عند استقبال UPDATE على company_members أو user_branch_access:
   *    - يتم استدعاء handleGovernanceEvent()
   *    - إذا affectsCurrentUser = true:
   *      → استدعاء refreshUserSecurityContext() (BLIND REFRESH)
   * 
   * ⚠️ تحذير: أي تعديل على هذه الدالة يجب مراجعته مع:
   *    - lib/access-context.tsx
   *    - hooks/use-governance-realtime.ts
   */
  private async subscribeToGovernance(): Promise<void> {
    console.log('🔐 [RealtimeManager] subscribeToGovernance called', {
      hasContext: !!this.context,
      isGovernanceSubscribed: this.isGovernanceSubscribed,
      context: this.context ? {
        companyId: this.context.companyId,
        userId: this.context.userId,
        role: this.context.role
      } : null
    })

    if (!this.context) {
      console.warn('⚠️ [RealtimeManager] Cannot subscribe to governance: no context')
      return
    }

    if (this.isGovernanceSubscribed) {
      console.log('ℹ️ [RealtimeManager] Already subscribed to governance channel - unsubscribing first to ensure fresh subscription')
      await this.unsubscribeFromGovernance()
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
      // ✅ فلترة حسب company_id فقط - الفلترة التفصيلية تتم في handleGovernanceEvent
      // ⚠️ ملاحظة مهمة: Supabase Realtime قد لا يرسل user_id في payload.old في UPDATE events
      // ✅ لذلك نستخدم filter بسيط (company_id فقط) ونعتمد على affectsCurrentUser في handleGovernanceEvent
      // ✅ هذا يضمن أن جميع المستخدمين يستقبلون الأحداث، لكن handleGovernanceEvent يفلترها حسب user_id
      const companyMembersFilter = `company_id=eq.${companyId}` // جميع التغييرات في الشركة - الفلترة في handleGovernanceEvent
      
      // ⚠️ Validation: التأكد من أن الفلتر صحيح (لا يحتوي على user_id filter)
      if (companyMembersFilter.includes(`user_id=eq.${userId}`)) {
        console.error('❌ [RealtimeManager] CRITICAL: companyMembersFilter contains user_id filter! This will prevent receiving events for other users.', {
          filter: companyMembersFilter,
          expectedFilter: `company_id=eq.${companyId}`,
        })
      }
      
      const isFilterValid = !companyMembersFilter.includes(`user_id=eq.${userId}`)
      if (!isFilterValid) {
        console.error('❌❌❌ [RealtimeManager] CRITICAL ERROR: Invalid filter detected!', {
          actualFilter: companyMembersFilter,
          expectedFilter: `company_id=eq.${companyId}`,
          reason: 'Filter contains user_id which will prevent receiving events for other users',
          action: 'Please hard refresh the browser (Ctrl+Shift+R) to load the latest code',
        })
      }
      
      console.log('🔐 [RealtimeManager] Setting up company_members subscription', {
        companyId,
        userId,
        role,
        filter: companyMembersFilter,
        filterValid: isFilterValid,
        ...(isFilterValid ? {} : { 
          ERROR: 'INVALID FILTER - Hard refresh required!',
          expectedFilter: `company_id=eq.${companyId}` 
        }),
      })
      
      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'company_members',
            filter: companyMembersFilter,
          },
          (payload: RealtimePostgresChangesPayload<any>) => {
            const newRecord = payload.new as any
            const oldRecord = payload.old as any
            console.log('🔐 [RealtimeManager] company_members event received from Supabase Realtime', {
              eventType: payload.eventType,
              new: newRecord ? { id: newRecord.id, user_id: newRecord.user_id, role: newRecord.role, branch_id: newRecord.branch_id } : null,
              old: oldRecord ? { id: oldRecord.id, user_id: oldRecord.user_id, role: oldRecord.role, branch_id: oldRecord.branch_id } : null,
              currentUserId: this.context?.userId,
              currentRole: this.context?.role,
              filter: companyMembersFilter,
            })
            this.handleGovernanceEvent('company_members', payload)
          }
        )

      // 🔐 الاشتراك في user_branch_access (تغييرات الفروع المسموحة للمستخدم)
      // ✅ فلترة حسب company_id فقط - الفلترة التفصيلية تتم في handleGovernanceEvent
      // ⚠️ ملاحظة مهمة: Supabase Realtime قد لا يرسل user_id في payload.old في UPDATE events
      // ✅ لذلك نستخدم filter بسيط (company_id فقط) ونعتمد على affectsCurrentUser في handleGovernanceEvent
      // ✅ هذا يضمن أن جميع المستخدمين يستقبلون الأحداث، لكن handleGovernanceEvent يفلترها حسب user_id
      // ✅ هذا ضروري لـ BLIND REFRESH mechanism عند تغيير allowed_branches
      const userBranchAccessFilter = `company_id=eq.${companyId}` // جميع التغييرات في الشركة - الفلترة في handleGovernanceEvent
      
      // ⚠️ Validation: التأكد من أن الفلتر صحيح (لا يحتوي على user_id filter)
      if (userBranchAccessFilter.includes(`user_id=eq.${userId}`)) {
        console.error('❌ [RealtimeManager] CRITICAL: userBranchAccessFilter contains user_id filter! This will prevent receiving events for other users.', {
          filter: userBranchAccessFilter,
          expectedFilter: `company_id=eq.${companyId}`,
        })
      }
      
      const isUserBranchAccessFilterValid = !userBranchAccessFilter.includes(`user_id=eq.${userId}`)
      if (!isUserBranchAccessFilterValid) {
        console.error('❌❌❌ [RealtimeManager] CRITICAL ERROR: Invalid filter detected!', {
          actualFilter: userBranchAccessFilter,
          expectedFilter: `company_id=eq.${companyId}`,
          reason: 'Filter contains user_id which will prevent receiving events for other users',
          action: 'Please hard refresh the browser (Ctrl+Shift+R) to load the latest code',
        })
      }
      
      console.log('🔐 [RealtimeManager] Subscribing to user_branch_access', {
        companyId,
        userId,
        role,
        filter: userBranchAccessFilter,
        filterValid: isUserBranchAccessFilterValid,
        ...(isUserBranchAccessFilterValid ? {} : { 
          ERROR: 'INVALID FILTER - Hard refresh required!',
          expectedFilter: `company_id=eq.${companyId}` 
        }),
      })
      
      channel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_branch_access',
            filter: userBranchAccessFilter,
          },
          (payload: RealtimePostgresChangesPayload<any>) => {
            console.log('🔐 [RealtimeManager] user_branch_access event received', {
              eventType: payload.eventType,
              new: payload.new ? Object.keys(payload.new) : null,
              old: payload.old ? Object.keys(payload.old) : null,
            })
            this.handleGovernanceEvent('user_branch_access', payload)
          }
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

      
      // ✅ Validation: التأكد من أن الفلاتر صحيحة قبل الاشتراك
      // ✅ استخدام المتغيرات المعرفة سابقاً (isFilterValid و isUserBranchAccessFilterValid)
      const isCompanyMembersFilterValidFinal = isFilterValid
      const isUserBranchAccessFilterValidFinal = isUserBranchAccessFilterValid
      
      if (!isCompanyMembersFilterValidFinal || !isUserBranchAccessFilterValidFinal) {
        console.error('❌❌❌ [RealtimeManager] CRITICAL: Invalid filters detected before subscription!', {
          companyMembersFilterValid: isCompanyMembersFilterValidFinal,
          userBranchAccessFilterValid: isUserBranchAccessFilterValidFinal,
          companyMembersFilter,
          userBranchAccessFilter,
          expectedFilter: `company_id=eq.${companyId}`,
          action: 'This will prevent receiving Realtime events for other users. Please check the code.',
        })
        // ⚠️ لا نمنع الاشتراك، لكن ننبه للمشكلة
      }
      
      channel.subscribe((status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR') => {
        console.log('🔐 [RealtimeManager] Governance Channel subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ [RealtimeManager] Successfully subscribed to Governance Channel', {
            channelName,
            companyId,
            userId,
            role,
            tables: ['company_members', 'user_branch_access', 'branches', 'warehouses', 'company_role_permissions', 'permissions'],
            handlersRegistered: this.governanceHandlers.size,
            companyMembersFilter,
            userBranchAccessFilter,
            // ✅ Validation: التأكد من أن الفلاتر صحيحة
            companyMembersFilterValid: isCompanyMembersFilterValidFinal,
            userBranchAccessFilterValid: isUserBranchAccessFilterValidFinal,
            // ✅ Single Source of Truth: التأكد من أن الاشتراك على الجداول الصحيحة
            subscribedToCompanyMembers: true,
            subscribedToUserBranchAccess: true,
          })
          this.isGovernanceSubscribed = true
          
          // ✅ تحذير إذا لم تكن هناك handlers مسجلة بعد
          if (this.governanceHandlers.size === 0) {
            console.warn('⚠️ [RealtimeManager] Governance channel subscribed but NO handlers registered yet!')
            console.warn('⚠️ [RealtimeManager] This may mean use-governance-realtime hook is not mounted yet.')
            console.warn('⚠️ [RealtimeManager] Events will be lost until handlers are registered.')
          } else {
            console.log('✅ [RealtimeManager] Governance handlers are registered and ready', {
              handlersCount: this.governanceHandlers.size,
            })
          }
        } else if (status === 'TIMED_OUT') {
          console.error('❌ [RealtimeManager] Governance Channel subscription TIMED_OUT - Realtime may not work!')
          console.error('❌ [RealtimeManager] This usually means Supabase Realtime is not enabled or network issue.')
          this.isGovernanceSubscribed = false
        } else if (status === 'CLOSED') {
          console.warn('⚠️ [RealtimeManager] Governance Channel CLOSED')
          this.isGovernanceSubscribed = false
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ [RealtimeManager] Error subscribing to Governance Channel - Realtime will not work!')
          console.error('❌ [RealtimeManager] Check Supabase Realtime configuration and network connection.')
          this.isGovernanceSubscribed = false
        }
      })
      
      // ✅ Logging إضافي للتأكد من أن channel تم تعيينه
      console.log('🔐 [RealtimeManager] Governance channel created and subscription initiated', {
        channelName,
        hasChannel: !!channel,
      })

      this.governanceChannel = channel
    } catch (error) {
      console.error('❌ [RealtimeManager] Error subscribing to governance:', error)
    }
  }

  /**
   * 🔐 معالجة أحداث الحوكمة (Governance Events Handler)
   * 
   * ⚠️ CRITICAL SECURITY FUNCTION - DO NOT MODIFY WITHOUT REVIEW
   * 
   * هذا الدالة جزء أساسي من نظام الأمان والتحديث الفوري.
   * راجع: docs/SECURITY_REALTIME_SYSTEM.md
   * 
   * ✅ القواعد الإلزامية:
   * 1. BLIND REFRESH Pattern:
   *    - عند أي UPDATE على company_members أو user_branch_access للمستخدم الحالي:
   *      → affectsCurrentUser = true
   *      → استدعاء refreshUserSecurityContext() بدون شروط
   * 
   * 2. Single Source of Truth:
   *    - التحقق من أن الحدث من company_members table
   *    - user_id من newRecord أو oldRecord
   * 
   * 3. التسلسل الإلزامي:
   *    - التحقق من affectsCurrentUser
   *    - إطلاق event إلى governanceHandlers
   *    - refreshUserSecurityContext() يُستدعى من useGovernanceRealtime
   * 
   * ⚠️ تحذير: أي تعديل على هذه الدالة يجب مراجعته مع:
   *    - lib/access-context.tsx
   *    - hooks/use-governance-realtime.ts
   */
  private async handleGovernanceEvent(
    table: 'company_members' | 'user_branch_access' | 'branches' | 'warehouses' | 'company_role_permissions' | 'permissions',
    payload: RealtimePostgresChangesPayload<any>
  ): Promise<void> {
    try {
      if (!this.context) {
        console.warn('⚠️ [RealtimeManager] handleGovernanceEvent: no context')
        return
      }

      const { userId, companyId, role } = this.context
      const newRecord = payload.new as any
      const oldRecord = payload.old as any
      const record = newRecord || oldRecord

      if (!record) {
        console.warn('⚠️ [RealtimeManager] handleGovernanceEvent: no record in payload')
        return
      }

      // ✅ BLIND REFRESH: في UPDATE، قد لا يحتوي payload على user_id في record مباشرة
      // ✅ لذلك نستخدم newRecord.user_id أو oldRecord.user_id
      const recordUserId = newRecord?.user_id || oldRecord?.user_id
      const recordCompanyId = newRecord?.company_id || oldRecord?.company_id

      console.log(`🔐 [RealtimeManager] Governance event received:`, {
        table,
        eventType: payload.eventType,
        recordId: record.id,
        recordUserId,
        recordCompanyId,
        newRecordUserId: newRecord?.user_id,
        oldRecordUserId: oldRecord?.user_id,
        newRecordCompanyId: newRecord?.company_id,
        oldRecordCompanyId: oldRecord?.company_id,
        currentUserId: userId,
        currentCompanyId: companyId,
        currentRole: role,
        // ✅ SINGLE SOURCE OF TRUTH: التأكد من أن الحدث من company_members table
        isCompanyMembersTable: table === 'company_members',
        payloadNewKeys: payload.new ? Object.keys(payload.new) : null,
        payloadOldKeys: payload.old ? Object.keys(payload.old) : null,
      })

      // 🔐 منع التكرار
      const eventKey = `governance:${table}:${payload.eventType}:${record.id}:${Date.now()}`
      const now = Date.now()
      const lastProcessed = this.processedEvents.get(eventKey)
      if (lastProcessed && (now - lastProcessed) < this.EVENT_DEDUP_WINDOW) {
        console.warn(`⚠️ [RealtimeManager] Duplicate governance event ignored: ${eventKey}`)
        return
      }
      this.processedEvents.set(eventKey, now)

      // 🔐 التحقق من الصلاحيات: فقط الأحداث في نفس الشركة
      // ✅ استخدام recordCompanyId من newRecord أو oldRecord
      if (recordCompanyId && recordCompanyId !== companyId) {
        console.warn(`🚫 [RealtimeManager] Governance event rejected: different company`, {
          recordCompanyId,
          currentCompanyId: companyId,
        })
        return
      }

      // 🔐 تحديد إذا كان الحدث يؤثر على المستخدم الحالي
      // ✅ BLIND REFRESH: عند أي UPDATE على company_members، نعتبره يؤثر على المستخدم إذا كان user_id يطابق
      // ✅ حتى لو لم يكن role أو branch_id في payload.old (Supabase قد لا يرسل جميع الحقول)
      let affectsCurrentUser = false

      if (table === 'company_members') {
        // ✅ BLIND REFRESH: إذا كان الحدث يخص المستخدم الحالي (من newRecord أو oldRecord)
        // ✅ في UPDATE، قد يكون user_id في newRecord فقط أو oldRecord فقط
        // ✅ لذلك نتحقق من كليهما
        // ⚠️ ملاحظة مهمة: Supabase Realtime قد لا يرسل user_id في payload.old في UPDATE events
        // ✅ لذلك نعتمد على newRecord.user_id أولاً (لأنه موجود دائماً في UPDATE)
        const newRecordUserId = newRecord?.user_id
        const oldRecordUserId = oldRecord?.user_id
        const recordUserId = newRecordUserId || oldRecordUserId
        
        // ✅ إذا كان user_id في أي من newRecord أو oldRecord يطابق userId الحالي، يؤثر على المستخدم
        // ✅ نعطي الأولوية لـ newRecord لأن Supabase قد لا يرسل oldRecord.user_id في UPDATE
        affectsCurrentUser = (newRecordUserId === userId) || (oldRecordUserId === userId)
        
        // ✅ تحسين اكتشاف التغييرات: في UPDATE، قد لا يحتوي payload.old على role إذا لم يكن ضمن الحقول المحدّثة
        // ✅ لذلك نتحقق من وجود role في payload.new أولاً
        const roleChanged = newRecord?.role && oldRecord?.role !== newRecord?.role
        const branchChanged = newRecord?.branch_id && oldRecord?.branch_id !== newRecord?.branch_id
        const warehouseChanged = newRecord?.warehouse_id && oldRecord?.warehouse_id !== newRecord?.warehouse_id
        
        console.log(`🔐 [RealtimeManager] company_members event check (BLIND REFRESH):`, {
          recordUserId,
          newRecordUserId,
          oldRecordUserId,
          currentUserId: userId,
          affectsCurrentUser,
          eventType: payload.eventType,
          roleChanged,
          branchChanged,
          warehouseChanged,
          oldRole: oldRecord?.role,
          newRole: newRecord?.role,
          oldBranchId: oldRecord?.branch_id,
          newBranchId: newRecord?.branch_id,
          oldWarehouseId: oldRecord?.warehouse_id,
          newWarehouseId: newRecord?.warehouse_id,
          payloadOld: payload.old ? Object.keys(payload.old) : null,
          payloadNew: payload.new ? Object.keys(payload.new) : null,
        })
      } else if (table === 'user_branch_access') {
        // ✅ إذا كان الحدث يخص المستخدم الحالي (تم الفلترة مسبقاً في subscription)
        // ✅ لكن نتحقق مرة أخرى للأمان
        affectsCurrentUser = record.user_id === userId
        console.log(`🔐 [RealtimeManager] user_branch_access event check:`, {
          recordUserId: record.user_id,
          currentUserId: userId,
          affectsCurrentUser,
          branchId: record.branch_id,
          isActive: record.is_active,
          eventType: payload.eventType,
        })
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

      // 🔐 Owner/Admin: يرى جميع الأحداث في الشركة (لكن affectsCurrentUser يبقى صحيح فقط إذا كان يخصهم)
      // ✅ BLIND REFRESH: عند UPDATE على company_members، نرسل الحدث دائماً إذا كان يؤثر على المستخدم
      // ✅ حتى لو كان المستخدم ليس owner/admin (لأنه يحتاج لتحديث صلاحياته)
      const canSeeEvent = role === 'owner' || role === 'admin' || affectsCurrentUser

      if (!canSeeEvent) {
        // المستخدمون الآخرون لا يرون إلا الأحداث التي تخصهم
        console.warn(`🚫 [RealtimeManager] Governance event rejected: user not affected`, {
          table,
          recordUserId: newRecord?.user_id || oldRecord?.user_id,
          currentUserId: userId,
          role,
          affectsCurrentUser,
        })
        return
      }
      
      // ✅ BLIND REFRESH: تأكيد إضافي - إذا كان UPDATE على company_members للمستخدم الحالي، نرسل الحدث دائماً
      if (table === 'company_members' && payload.eventType === 'UPDATE' && affectsCurrentUser) {
        console.log(`✅ [RealtimeManager] BLIND REFRESH: company_members UPDATE for current user - forcing event dispatch`, {
          recordUserId: newRecord?.user_id || oldRecord?.user_id,
          currentUserId: userId,
        })
      }

      const event: Parameters<GovernanceEventHandler>[0] = {
        type: payload.eventType as RealtimeEventType,
        table: table as 'company_members' | 'user_branch_access' | 'branches' | 'warehouses' | 'company_role_permissions' | 'permissions',
        new: payload.new,
        old: payload.old,
        timestamp: now,
        affectsCurrentUser,
      }

      console.log(`✅ [RealtimeManager] Dispatching governance event to handlers:`, {
        table,
        eventType: payload.eventType,
        affectsCurrentUser,
        handlersCount: this.governanceHandlers.size,
        recordUserId: newRecord?.user_id || oldRecord?.user_id,
        currentUserId: userId,
      })

      // ✅ BLIND REFRESH: إرسال الحدث لجميع معالجات الحوكمة
      // ✅ إذا كان affectsCurrentUser = true، يجب أن يستقبل use-governance-realtime الحدث ويستدعي refreshUserSecurityContext
      if (this.governanceHandlers.size === 0) {
        console.warn(`⚠️ [RealtimeManager] No governance handlers registered! Event will be lost.`, {
          table,
          affectsCurrentUser,
          eventType: payload.eventType,
          recordUserId: newRecord?.user_id || oldRecord?.user_id,
        })
        console.warn(`⚠️ [RealtimeManager] This means use-governance-realtime hook is not registered or not mounted!`)
      }

      // إرسال الحدث لجميع معالجات الحوكمة
      const handlersArray: GovernanceEventHandler[] = Array.from(this.governanceHandlers)
      const handlersCount = handlersArray.length
      
      console.log(`🔄 [RealtimeManager] Dispatching governance event to ${handlersCount} handler(s)...`, {
        table,
        eventType: payload.eventType,
        affectsCurrentUser,
        recordUserId: newRecord?.user_id || oldRecord?.user_id,
        currentUserId: userId,
      })
      
      handlersArray.forEach((handler, index) => {
        const handlerNumber = index + 1
        try {
          console.log(`🔄 [RealtimeManager] Calling governance handler ${handlerNumber}/${handlersCount}...`)
          // ✅ استدعاء handler بشكل async للتأكد من أنه يتم تنفيذه
          Promise.resolve(handler(event)).then(() => {
            console.log(`✅ [RealtimeManager] Governance handler ${handlerNumber} completed successfully`)
          }).catch((error) => {
            console.error(`❌ [RealtimeManager] Error in governance event handler ${handlerNumber}:`, error)
          })
        } catch (error) {
          console.error(`❌ [RealtimeManager] Synchronous error in governance event handler ${handlerNumber}:`, error)
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
        'bills',
        'approvals',
        'inventory_transfers',
        'expenses', // ✅ المصروفات
        'payments',
        'journal_entries',
        'customers',
        'suppliers',
        'products',
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