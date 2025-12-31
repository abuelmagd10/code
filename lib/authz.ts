import { getActiveCompanyId } from "@/lib/company"

// أنواع الصلاحيات الأساسية
export type BasicAction = "read" | "write" | "update" | "delete"

// أنواع الصلاحيات المتقدمة (للعمليات الخاصة)
export type AdvancedAction =
  | "access"           // الوصول للصفحة
  | "partial_return"   // مرتجع جزئي
  | "full_return"      // مرتجع كامل
  | "reverse_return"   // عكس المرتجع
  | "void"             // إبطال
  | "cancel"           // إلغاء
  | "send"             // إرسال
  | "print"            // طباعة
  | "download_pdf"     // تنزيل PDF
  | "record_payment"   // تسجيل دفعة
  | "issue_credit_note" // إصدار مذكرة دائن
  | "credit_refund"    // صرف رصيد دائن
  | "convert_to_invoice" // تحويل لفاتورة
  | "convert_to_bill"  // تحويل لفاتورة شراء
  | "apply"            // تطبيق (إشعار دائن)
  | "adjust"           // تسوية المخزون
  | "transfer"         // نقل المخزون
  | "reconcile"        // مطابقة
  | "count"            // جرد
  | "post"             // ترحيل
  | "unpost"           // إلغاء ترحيل
  | "invite"           // دعوة مستخدم
  | "update_role"      // تغيير دور
  | "manage_permissions" // إدارة الصلاحيات
  | "execute"          // تنفيذ (صيانة)
  | "process"          // معالجة (رواتب)
  | "approve"          // اعتماد
  | "post_depreciation" // ترحيل الإهلاك
  | "approve_depreciation" // اعتماد الإهلاك

export type ActionType = BasicAction | AdvancedAction

// واجهة نتيجة التحقق من الصلاحيات
export interface PermissionResult {
  allowed: boolean
  role?: string
  reason?: string
}

// واجهة صلاحيات المورد
export interface ResourcePermissions {
  can_access: boolean
  can_read: boolean
  can_write: boolean
  can_update: boolean
  can_delete: boolean
  all_access: boolean
  allowed_actions: string[]
}

// Cache للصلاحيات لتقليل الاستعلامات
const permissionCache = new Map<string, { data: ResourcePermissions | null; timestamp: number }>()
const CACHE_TTL = 60000 // 1 دقيقة

/**
 * التحقق من صلاحية أساسية (read/write/update/delete)
 * @param supabase - Supabase client
 * @param resource - المورد (مثل: invoices, bills, products)
 * @param action - العملية (read, write, update, delete)
 * @returns boolean
 */
export async function canAction(
  supabase: any,
  resource: string,
  action: BasicAction
): Promise<boolean> {
  const result = await checkPermission(supabase, resource, action)
  return result.allowed
}

/**
 * التحقق من صلاحية متقدمة (مثل: partial_return, void, send)
 * @param supabase - Supabase client
 * @param resource - المورد
 * @param action - العملية المتقدمة
 * @returns boolean
 */
export async function canAdvancedAction(
  supabase: any,
  resource: string,
  action: AdvancedAction
): Promise<boolean> {
  const result = await checkPermission(supabase, resource, action)
  return result.allowed
}

/**
 * التحقق من إمكانية الوصول للصفحة (للـ Sidebar)
 * @param supabase - Supabase client
 * @param resource - المورد/الصفحة
 * @returns boolean
 */
export async function canAccessPage(
  supabase: any,
  resource: string
): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const cid = await getActiveCompanyId(supabase)
  if (!cid) return false

  const { data: myMember } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", cid)
    .eq("user_id", user.id)
    .maybeSingle()

  const role = String(myMember?.role || "")
  if (["owner", "admin"].includes(role)) return true

  const { data: perm } = await supabase
    .from("company_role_permissions")
    .select("can_access, can_read, all_access")
    .eq("company_id", cid)
    .eq("role", role)
    .eq("resource", resource)
    .maybeSingle()

  if (!perm) return true // إذا لم يوجد سجل، نفترض الوصول مسموح
  if (perm.all_access) return true

  // can_access = false يعني إخفاء الصفحة
  if (perm.can_access === false) return false

  // إذا كان can_access = true أو null، نتحقق من can_read
  return perm.can_read !== false
}

/**
 * الحصول على جميع صلاحيات المستخدم لمورد معين
 * @param supabase - Supabase client
 * @param resource - المورد
 * @returns ResourcePermissions | null
 */
export async function getResourcePermissions(
  supabase: any,
  resource: string
): Promise<ResourcePermissions | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const cid = await getActiveCompanyId(supabase)
  if (!cid) return null

  // التحقق من الـ cache
  const cacheKey = `${user.id}:${cid}:${resource}`
  const cached = permissionCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }

  const { data: myMember } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", cid)
    .eq("user_id", user.id)
    .maybeSingle()

  const role = String(myMember?.role || "")

  // owner و admin لديهم كل الصلاحيات
  if (["owner", "admin"].includes(role)) {
    const fullAccess: ResourcePermissions = {
      can_access: true,
      can_read: true,
      can_write: true,
      can_update: true,
      can_delete: true,
      all_access: true,
      allowed_actions: ["*"]
    }
    permissionCache.set(cacheKey, { data: fullAccess, timestamp: Date.now() })
    return fullAccess
  }

  const { data: perm } = await supabase
    .from("company_role_permissions")
    .select("can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions")
    .eq("company_id", cid)
    .eq("role", role)
    .eq("resource", resource)
    .maybeSingle()

  // إذا لم يوجد سجل صلاحيات، نعطي صلاحيات افتراضية (read, write, update مسموح)
  if (!perm) {
    const defaultAccess: ResourcePermissions = {
      can_access: true,
      can_read: true,
      can_write: true,
      can_update: true,
      can_delete: false, // الحذف يحتاج صلاحية صريحة
      all_access: false,
      allowed_actions: []
    }
    permissionCache.set(cacheKey, { data: defaultAccess, timestamp: Date.now() })
    return defaultAccess
  }

  const result: ResourcePermissions = {
    can_access: perm.can_access ?? true,
    can_read: perm.can_read ?? true,
    can_write: perm.can_write ?? true,
    can_update: perm.can_update ?? true,
    can_delete: perm.can_delete ?? false,
    all_access: perm.all_access ?? false,
    allowed_actions: perm.allowed_actions ?? []
  }

  permissionCache.set(cacheKey, { data: result, timestamp: Date.now() })
  return result
}

/**
 * التحقق من صلاحية (أساسية أو متقدمة)
 * @param supabase - Supabase client
 * @param resource - المورد
 * @param action - العملية
 * @returns PermissionResult
 */
export async function checkPermission(
  supabase: any,
  resource: string,
  action: ActionType
): Promise<PermissionResult> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { allowed: false, reason: "not_authenticated" }
  }

  const cid = await getActiveCompanyId(supabase)
  if (!cid) {
    return { allowed: false, reason: "no_company" }
  }

  const { data: myMember } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", cid)
    .eq("user_id", user.id)
    .maybeSingle()

  const role = String(myMember?.role || "")
  if (!role) {
    return { allowed: false, reason: "no_role" }
  }

  // owner و admin لديهم كل الصلاحيات
  if (["owner", "admin"].includes(role)) {
    return { allowed: true, role }
  }

  const { data: perm } = await supabase
    .from("company_role_permissions")
    .select("can_read, can_write, can_update, can_delete, all_access, allowed_actions")
    .eq("company_id", cid)
    .eq("role", role)
    .eq("resource", resource)
    .maybeSingle()

  // إذا لم يوجد سجل صلاحيات، نسمح بالصلاحيات الأساسية افتراضياً
  // هذا يضمن أن الموظفين الجدد يمكنهم العمل حتى لو لم يتم إعداد صلاحياتهم بعد
  if (!perm) {
    // السماح بالصلاحيات الأساسية (read, write, update) افتراضياً
    // لكن الحذف يحتاج صلاحية صريحة
    if (action === "read" || action === "write" || action === "update") {
      return { allowed: true, role, reason: "default_allowed" }
    }
    return { allowed: false, role, reason: "no_permission_record" }
  }

  if (perm.all_access) {
    return { allowed: true, role }
  }

  // التحقق من الصلاحيات الأساسية
  if (action === "read" && perm.can_read !== false) return { allowed: true, role }
  if (action === "write" && perm.can_write !== false) return { allowed: true, role }
  if (action === "update" && perm.can_update !== false) return { allowed: true, role }
  if (action === "delete" && perm.can_delete) return { allowed: true, role }

  // التحقق من الصلاحيات المتقدمة في allowed_actions
  const fullAction = `${resource}:${action}`
  const allowedActions = perm.allowed_actions || []

  if (allowedActions.includes(fullAction) || allowedActions.includes("*")) {
    return { allowed: true, role }
  }

  return { allowed: false, role, reason: "action_not_allowed" }
}

/**
 * الحصول على قائمة الموارد المخفية للمستخدم (للـ Sidebar)
 * @param supabase - Supabase client
 * @returns string[] - قائمة الموارد المخفية
 */
export async function getHiddenResources(supabase: any): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const cid = await getActiveCompanyId(supabase)
  if (!cid) return []

  const { data: myMember } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", cid)
    .eq("user_id", user.id)
    .maybeSingle()

  const role = String(myMember?.role || "")
  if (["owner", "admin"].includes(role)) return []

  const { data: perms } = await supabase
    .from("company_role_permissions")
    .select("resource, can_access, can_read, all_access")
    .eq("company_id", cid)
    .eq("role", role)

  if (!perms) return []

  // الموارد المخفية: can_access = false أو (can_access = null و can_read = false)
  return perms
    .filter((p: any) => p.can_access === false || (!p.all_access && !p.can_read && p.can_access !== true))
    .map((p: any) => String(p.resource))
}

/**
 * مسح الـ cache للصلاحيات
 */
export function clearPermissionCache(): void {
  permissionCache.clear()
}

/**
 * مسح الـ cache لمستخدم معين
 */
export function clearUserPermissionCache(userId: string): void {
  for (const key of permissionCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      permissionCache.delete(key)
    }
  }
}

/**
 * قائمة الصفحات المتاحة بالترتيب (للتوجيه عند عدم الوصول للـ Dashboard)
 * تم تحديثها لتشمل جميع الصفحات الموجودة في التطبيق
 */
const FALLBACK_PAGES = [
  // المبيعات
  { resource: "invoices", path: "/invoices" },
  { resource: "customers", path: "/customers" },
  { resource: "estimates", path: "/estimates" },
  { resource: "sales_orders", path: "/sales-orders" },
  { resource: "sales_returns", path: "/sales-returns" },
  { resource: "sent_invoice_returns", path: "/sent-invoice-returns" },
  // المشتريات
  { resource: "bills", path: "/bills" },
  { resource: "suppliers", path: "/suppliers" },
  { resource: "purchase_orders", path: "/purchase-orders" },
  { resource: "purchase_returns", path: "/purchase-returns" },
  { resource: "vendor_credits", path: "/vendor-credits" },
  // المخزون
  { resource: "products", path: "/products" },
  { resource: "inventory", path: "/inventory" },
  { resource: "write_offs", path: "/inventory/write-offs" },
  { resource: "third_party_inventory", path: "/inventory/third-party" },
  // المالية والمحاسبة
  { resource: "payments", path: "/payments" },
  { resource: "journal_entries", path: "/journal-entries" },
  { resource: "chart_of_accounts", path: "/chart-of-accounts" },
  { resource: "banking", path: "/banking" },
  { resource: "shareholders", path: "/shareholders" },
  { resource: "fixed_assets", path: "/fixed-assets" },
  { resource: "asset_categories", path: "/fixed-assets/categories" },
  { resource: "fixed_assets_reports", path: "/fixed-assets/reports" },
  // الموارد البشرية
  { resource: "hr", path: "/hr" },
  { resource: "employees", path: "/hr/employees" },
  { resource: "attendance", path: "/hr/attendance" },
  { resource: "payroll", path: "/hr/payroll" },
  // التقارير
  { resource: "reports", path: "/reports" },
  // الهيكل التنظيمي
  { resource: "branches", path: "/branches" },
  { resource: "cost_centers", path: "/cost-centers" },
  { resource: "warehouses", path: "/warehouses" },
  // الإعدادات
  { resource: "settings", path: "/settings" },
  { resource: "users", path: "/settings/users" },
  { resource: "taxes", path: "/settings/taxes" },
  { resource: "exchange_rates", path: "/settings/exchange-rates" },
  { resource: "audit_log", path: "/settings/audit-log" },
  { resource: "backup", path: "/settings/backup" },
  { resource: "shipping", path: "/settings/shipping" },
  { resource: "profile", path: "/settings/profile" },
  { resource: "orders_rules", path: "/settings/orders-rules" },
  { resource: "accounting_maintenance", path: "/settings/accounting-maintenance" },
]

/**
 * الحصول على أول صفحة مسموح بها للمستخدم
 * @param supabase - Supabase client
 * @returns مسار الصفحة المسموح بها أو /dashboard كافتراضي
 */
export async function getFirstAllowedPage(supabase: any): Promise<string> {
  // تحقق أولاً من صلاحية الـ Dashboard
  const canAccessDashboard = await canAccessPage(supabase, "dashboard")
  if (canAccessDashboard) {
    return "/dashboard"
  }

  // إذا لم يكن مسموحاً، ابحث عن أول صفحة مسموح بها
  for (const page of FALLBACK_PAGES) {
    const canAccess = await canAccessPage(supabase, page.resource)
    if (canAccess) {
      return page.path
    }
  }

  // إذا لم يوجد أي صفحة مسموح بها، عُد للـ dashboard (سيظهر رسالة خطأ)
  return "/dashboard"
}