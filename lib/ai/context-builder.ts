import type { SupabaseClient } from "@supabase/supabase-js"
import type { AIContextScope, AIDomain } from "@/lib/ai/contracts"
import type { AISettings, PageGuide } from "@/lib/page-guides"
import { fetchAISettings, fetchPageGuide } from "@/lib/page-guides"

export interface AIPermissionSnapshot {
  resource: string | null
  canAccess: boolean
  canRead: boolean
  canWrite: boolean
  canUpdate: boolean
  canDelete: boolean
  allAccess: boolean
}

export interface AILiveMetric {
  label: string
  value: string
}

export interface AILiveContext {
  domain: AIDomain
  summary: string
  metrics: AILiveMetric[]
  alerts: string[]
  suggestions: string[]
}

export interface AICopilotContext {
  scope: AIContextScope
  language: "ar" | "en"
  settings: AISettings
  guide: PageGuide | null
  domain: AIDomain
  pageResource: string | null
  governanceSummary: string
  permissionSnapshot: AIPermissionSnapshot
  liveContext: AILiveContext
}

export interface BuildAICopilotContextParams {
  supabase: SupabaseClient
  companyId: string
  userId: string
  role?: string | null
  branchId?: string | null
  costCenterId?: string | null
  warehouseId?: string | null
  pageKey?: string | null
  language: "ar" | "en"
}

export async function buildAICopilotContext(
  params: BuildAICopilotContextParams
): Promise<AICopilotContext> {
  const {
    supabase,
    companyId,
    userId,
    role,
    branchId,
    costCenterId,
    warehouseId,
    pageKey,
    language,
  } = params

  const scope: AIContextScope = {
    companyId,
    userId,
    role: role || null,
    branchId: branchId || null,
    costCenterId: costCenterId || null,
    warehouseId: warehouseId || null,
    pageKey: pageKey || null,
  }

  const domain = inferDomainFromPageKey(pageKey)
  const pageResource = mapPageKeyToResource(pageKey)

  const [settings, guide, permissionSnapshot, liveContext] = await Promise.all([
    fetchAISettings(supabase, companyId),
    pageKey ? fetchPageGuide(supabase, pageKey, language) : Promise.resolve(null),
    loadPermissionSnapshot(supabase, companyId, role || null, pageResource),
    loadLiveContext(supabase, scope, domain, language),
  ])

  return {
    scope,
    language,
    settings,
    guide,
    domain,
    pageResource,
    governanceSummary: buildGovernanceSummary(scope, permissionSnapshot, language),
    permissionSnapshot,
    liveContext,
  }
}

export function buildGuideContextBlock(
  guide: PageGuide | null,
  language: "ar" | "en"
): string {
  if (!guide) {
    return language === "ar"
      ? "لا يوجد دليل صفحة محدد متاح لهذه الصفحة حالياً."
      : "No page-specific guide is available for this page yet."
  }

  const steps =
    guide.steps.length > 0
      ? guide.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")
      : language === "ar"
        ? "لا توجد خطوات محددة."
        : "No specific steps available."

  const tips =
    guide.tips.length > 0
      ? guide.tips.map((tip) => `- ${tip}`).join("\n")
      : language === "ar"
        ? "- لا توجد نصائح إضافية."
        : "- No additional tips."

  const accountingPattern = guide.accounting_pattern
    ? [
        `${language === "ar" ? "الحدث المالي" : "Financial event"}: ${guide.accounting_pattern.event}`,
        `${language === "ar" ? "القيود" : "Entries"}:`,
        ...guide.accounting_pattern.entries.map((entry) => {
          const side =
            entry.side === "debit"
              ? language === "ar"
                ? "مدين"
                : "Dr"
              : language === "ar"
                ? "دائن"
                : "Cr"
          return `- ${side}: ${entry.account}`
        }),
      ].join("\n")
    : language === "ar"
      ? "لا يوجد نمط محاسبي محدد لهذه الصفحة."
      : "No accounting pattern is defined for this page."

  return [
    `${language === "ar" ? "اسم الصفحة" : "Page"}: ${guide.title}`,
    `${language === "ar" ? "الوصف" : "Description"}: ${guide.description}`,
    `${language === "ar" ? "الخطوات" : "Steps"}:\n${steps}`,
    `${language === "ar" ? "النصائح" : "Tips"}:\n${tips}`,
    `${language === "ar" ? "النمط المحاسبي" : "Accounting pattern"}:\n${accountingPattern}`,
  ].join("\n\n")
}

function inferDomainFromPageKey(pageKey?: string | null): AIDomain {
  const key = String(pageKey || "").toLowerCase()

  if (!key || key === "dashboard" || key === "reports") return "dashboard"
  if (["invoices", "sales_orders", "estimates", "customer_debit_notes"].includes(key)) {
    return "sales"
  }
  if (
    [
      "sales_returns",
      "sales_return_requests",
      "sent_invoice_returns",
      "customer_credits",
    ].includes(key)
  ) {
    return "returns"
  }
  if (["customers"].includes(key)) return "receivables"
  if (
    [
      "inventory",
      "products",
      "warehouses",
      "inventory_transfers",
      "product_availability",
      "inventory_goods_receipt",
      "third_party_inventory",
      "write_offs",
    ].includes(key)
  ) {
    return "inventory"
  }
  if (
    [
      "journal",
      "journal_entries",
      "chart_of_accounts",
      "banking",
      "payments",
      "expenses",
      "drawings",
      "annual_closing",
      "accounting_periods",
      "bills",
      "purchase_orders",
      "purchase_returns",
      "vendor_credits",
      "suppliers",
    ].includes(key)
  ) {
    return "accounting"
  }
  if (["fixed_assets", "asset_categories", "fixed_assets_reports"].includes(key)) {
    return "fixed_assets"
  }
  if (["employees", "attendance", "payroll", "instant_payouts", "hr"].includes(key)) return "hr"
  if (["shareholders"].includes(key)) return "support"
  if (["settings", "branches", "cost_centers"].includes(key)) return "governance"
  if (
    [
      "bom",
      "bom_detail",
      "routing",
      "routing_detail",
      "production_orders",
      "production_order_detail",
    ].includes(key)
  ) {
    return "manufacturing"
  }

  return "support"
}

function mapPageKeyToResource(pageKey?: string | null): string | null {
  const key = String(pageKey || "").toLowerCase()
  if (!key) return null

  const map: Record<string, string> = {
    dashboard: "dashboard",
    reports: "reports",
    invoices: "invoices",
    sales_orders: "sales_orders",
    estimates: "estimates",
    sales_returns: "sales_returns",
    sales_return_requests: "sales_return_requests",
    sent_invoice_returns: "sent_invoice_returns",
    customer_debit_notes: "customer_debit_notes",
    customer_credits: "customer_credits",
    customers: "customers",
    inventory: "inventory",
    products: "products",
    warehouses: "warehouses",
    inventory_transfers: "inventory_transfers",
    product_availability: "product_availability",
    inventory_goods_receipt: "inventory_goods_receipt",
    third_party_inventory: "third_party_inventory",
    write_offs: "write_offs",
    journal: "journal_entries",
    journal_entries: "journal_entries",
    chart_of_accounts: "chart_of_accounts",
    banking: "banking",
    payments: "payments",
    expenses: "expenses",
    drawings: "drawings",
    annual_closing: "annual_closing",
    accounting_periods: "accounting_periods",
    bills: "bills",
    purchase_orders: "purchase_orders",
    purchase_returns: "purchase_returns",
    vendor_credits: "vendor_credits",
    suppliers: "suppliers",
    fixed_assets: "fixed_assets",
    asset_categories: "asset_categories",
    fixed_assets_reports: "fixed_assets_reports",
    employees: "employees",
    attendance: "attendance",
    payroll: "payroll",
    instant_payouts: "instant_payouts",
    shareholders: "shareholders",
    settings: "settings",
    branches: "branches",
    cost_centers: "cost_centers",
    bom: "bom",
    bom_detail: "bom",
    routing: "routing",
    routing_detail: "routing",
    production_orders: "production_orders",
    production_order_detail: "production_orders",
  }

  return map[key] || key
}

async function loadPermissionSnapshot(
  supabase: SupabaseClient,
  companyId: string,
  role: string | null,
  resource: string | null
): Promise<AIPermissionSnapshot> {
  const normalizedRole = String(role || "").trim().toLowerCase()
  const isFullAccess = ["owner", "admin", "general_manager"].includes(normalizedRole)

  if (!resource) {
    return {
      resource: null,
      canAccess: isFullAccess,
      canRead: isFullAccess,
      canWrite: isFullAccess,
      canUpdate: isFullAccess,
      canDelete: isFullAccess,
      allAccess: isFullAccess,
    }
  }

  if (isFullAccess) {
    return {
      resource,
      canAccess: true,
      canRead: true,
      canWrite: true,
      canUpdate: true,
      canDelete: true,
      allAccess: true,
    }
  }

  try {
    const { data } = await supabase
      .from("company_role_permissions")
      .select("can_access, can_read, can_write, can_update, can_delete, all_access")
      .eq("company_id", companyId)
      .eq("role", normalizedRole)
      .eq("resource", resource)
      .maybeSingle()

    return {
      resource,
      canAccess: Boolean(data?.can_access ?? false),
      canRead: Boolean(data?.can_read ?? false),
      canWrite: Boolean(data?.can_write ?? false),
      canUpdate: Boolean(data?.can_update ?? false),
      canDelete: Boolean(data?.can_delete ?? false),
      allAccess: Boolean(data?.all_access ?? false),
    }
  } catch {
    return {
      resource,
      canAccess: false,
      canRead: false,
      canWrite: false,
      canUpdate: false,
      canDelete: false,
      allAccess: false,
    }
  }
}

async function loadLiveContext(
  supabase: SupabaseClient,
  scope: AIContextScope,
  domain: AIDomain,
  language: "ar" | "en"
): Promise<AILiveContext> {
  try {
    switch (domain) {
      case "sales":
        return await loadSalesContext(supabase, scope, language)
      case "inventory":
        return await loadInventoryContext(supabase, scope, language)
      case "accounting":
        return await loadAccountingContext(supabase, scope, language)
      case "returns":
        return await loadReturnsContext(supabase, scope, language)
      case "receivables":
        return await loadReceivablesContext(supabase, scope, language)
      case "dashboard":
        return await loadDashboardContext(supabase, scope, language)
      case "governance":
        return await loadGovernanceContext(supabase, scope, language)
      case "manufacturing":
        return await loadManufacturingContext(supabase, scope, language)
      case "fixed_assets":
        return await loadFixedAssetsContext(supabase, scope, language)
      case "hr":
        return await loadHRContext(supabase, scope, language)
      default:
        return await loadSupportContext(supabase, scope, language)
    }
  } catch {
    return {
      domain,
      summary:
        language === "ar"
          ? "السياق الحي المحلي محدود حالياً، لكن دليل الصفحة ما زال متاحاً للإرشاد."
          : "Live local context is limited right now, but the page guide is still available for guidance.",
      metrics: [],
      alerts: [],
      suggestions: [],
    }
  }
}

async function loadDashboardContext(
  supabase: SupabaseClient,
  scope: AIContextScope,
  language: "ar" | "en"
): Promise<AILiveContext> {
  const [invoiceCount, sentInvoices, pendingDispatch, lowStockProducts, pendingReturns] =
    await Promise.all([
      countCompanyRows(supabase, "invoices", scope, { branchColumn: "branch_id" }),
      countCompanyRows(supabase, "invoices", scope, {
        branchColumn: "branch_id",
        mutate: (query) => query.in("status", ["sent", "paid", "partially_paid"]),
      }),
      countCompanyRows(supabase, "invoices", scope, {
        branchColumn: "branch_id",
        warehouseColumn: "warehouse_id",
        mutate: (query) =>
          query.or("approval_status.eq.pending,warehouse_status.eq.pending"),
      }),
      countCompanyRows(supabase, "products", scope, {
        mutate: (query) => query.neq("item_type", "service").lte("quantity_on_hand", 5),
      }),
      countCompanyRows(supabase, "sales_return_requests", scope, {
        warehouseColumn: "warehouse_id",
        mutate: (query) =>
          query.in("status", ["pending_approval_level_1", "pending_warehouse_approval"]),
      }),
    ])

  const alerts: string[] = []
  if (pendingDispatch > 0) {
    alerts.push(
      language === "ar"
        ? `يوجد ${pendingDispatch} عملية تسليم أو اعتماد فاتورة ما زالت معلقة.`
        : `${pendingDispatch} invoice dispatch or approval items are still pending.`
    )
  }
  if (lowStockProducts > 0) {
    alerts.push(
      language === "ar"
        ? `يوجد ${lowStockProducts} منتجاً منخفض المخزون يحتاج مراجعة.`
        : `${lowStockProducts} products are low on stock and need review.`
    )
  }

  return {
    domain: "dashboard",
    summary:
      language === "ar"
        ? "هذه لقطة محلية سريعة لحالة التشغيل الحالية عبر المبيعات والمخزون والمرتجعات."
        : "This is a quick local operating snapshot across sales, inventory, and returns.",
    metrics: [
      metric(language, "إجمالي الفواتير", "Total invoices", invoiceCount),
      metric(language, "فواتير منشورة", "Posted invoices", sentInvoices),
      metric(language, "اعتمادات تسليم معلقة", "Pending dispatch approvals", pendingDispatch),
      metric(language, "منتجات منخفضة المخزون", "Low-stock products", lowStockProducts),
      metric(language, "طلبات مرتجع نشطة", "Active return requests", pendingReturns),
    ],
    alerts,
    suggestions: [
      language === "ar"
        ? "ابدأ بمراجعة الاعتمادات المعلقة ثم المنتجات منخفضة المخزون."
        : "Start with pending approvals, then review low-stock products.",
      language === "ar"
        ? "استخدم صفحة المجال نفسه أو صفحة التقارير للحصول على تفاصيل أعمق."
        : "Use the module page itself or the reports page for deeper detail.",
    ],
  }
}

async function loadSalesContext(
  supabase: SupabaseClient,
  scope: AIContextScope,
  language: "ar" | "en"
): Promise<AILiveContext> {
  const [draftCount, sentCount, paidCount, partialCount, pendingDispatch, approvedDispatch] =
    await Promise.all([
      countCompanyRows(supabase, "invoices", scope, {
        branchColumn: "branch_id",
        mutate: (query) => query.eq("status", "draft"),
      }),
      countCompanyRows(supabase, "invoices", scope, {
        branchColumn: "branch_id",
        mutate: (query) => query.eq("status", "sent"),
      }),
      countCompanyRows(supabase, "invoices", scope, {
        branchColumn: "branch_id",
        mutate: (query) => query.eq("status", "paid"),
      }),
      countCompanyRows(supabase, "invoices", scope, {
        branchColumn: "branch_id",
        mutate: (query) => query.eq("status", "partially_paid"),
      }),
      countCompanyRows(supabase, "invoices", scope, {
        branchColumn: "branch_id",
        warehouseColumn: "warehouse_id",
        mutate: (query) =>
          query.neq("status", "draft").or("approval_status.eq.pending,warehouse_status.eq.pending"),
      }),
      countCompanyRows(supabase, "invoices", scope, {
        branchColumn: "branch_id",
        warehouseColumn: "warehouse_id",
        mutate: (query) =>
          query.or("approval_status.eq.approved,warehouse_status.eq.approved"),
      }),
    ])

  const receivablesAmount = await sumOpenReceivables(supabase, scope)
  const alerts: string[] = []
  if (pendingDispatch > 0) {
    alerts.push(
      language === "ar"
        ? "اعتماد التسليم ما زال معلقًا لبعض الفواتير ويؤثر على اكتمال دورة البيع."
        : "Delivery approval is still pending for some invoices and affects sales-cycle completion."
    )
  }
  if (receivablesAmount > 0) {
    alerts.push(
      language === "ar"
        ? `هناك ذمم مدينة مفتوحة بقيمة ${formatAmount(receivablesAmount, language)} تحتاج متابعة.`
        : `There are open receivables worth ${formatAmount(receivablesAmount, language)} that need follow-up.`
    )
  }

  return {
    domain: "sales",
    summary:
      language === "ar"
        ? "الموديول المحلي يرى دورة المبيعات كسلسلة: أمر بيع -> فاتورة -> اعتماد تسليم -> تحصيل -> مرتجع عند الحاجة."
        : "The local module sees sales as a chain: sales order -> invoice -> delivery approval -> collection -> return when needed.",
    metrics: [
      metric(language, "فواتير مسودة", "Draft invoices", draftCount),
      metric(language, "فواتير مرسلة", "Sent invoices", sentCount),
      metric(language, "فواتير مدفوعة", "Paid invoices", paidCount),
      metric(language, "مدفوعة جزئياً", "Partially paid invoices", partialCount),
      metric(language, "بانتظار اعتماد التسليم", "Pending delivery approval", pendingDispatch),
      metric(language, "تم اعتماد التسليم", "Approved delivery", approvedDispatch),
      metric(language, "ذمم مدينة مفتوحة", "Open receivables", formatAmount(receivablesAmount, language)),
    ],
    alerts,
    suggestions: [
      language === "ar"
        ? "إذا كان سؤالك عن التنفيذ، ابدأ من حالة الفاتورة ثم اعتماد المخزن ثم التحصيل."
        : "For execution questions, start with invoice status, then warehouse approval, then collection.",
      language === "ar"
        ? "إذا كان سؤالك عن الذمم، راقب الفرق بين الإجمالي والمدفوع والمرتجع."
        : "For receivables questions, compare total, paid, and returned values.",
    ],
  }
}

async function loadInventoryContext(
  supabase: SupabaseClient,
  scope: AIContextScope,
  language: "ar" | "en"
): Promise<AILiveContext> {
  const [stockProducts, serviceProducts, lowStock, outOfStock, pendingDispatch] =
    await Promise.all([
      countCompanyRows(supabase, "products", scope, {
        mutate: (query) => query.neq("item_type", "service"),
      }),
      countCompanyRows(supabase, "products", scope, {
        mutate: (query) => query.eq("item_type", "service"),
      }),
      countCompanyRows(supabase, "products", scope, {
        mutate: (query) => query.neq("item_type", "service").gt("quantity_on_hand", 0).lte("quantity_on_hand", 5),
      }),
      countCompanyRows(supabase, "products", scope, {
        mutate: (query) => query.neq("item_type", "service").lte("quantity_on_hand", 0),
      }),
      countCompanyRows(supabase, "invoices", scope, {
        branchColumn: "branch_id",
        warehouseColumn: "warehouse_id",
        mutate: (query) =>
          query.neq("status", "draft").or("approval_status.eq.pending,warehouse_status.eq.pending"),
      }),
    ])

  const alerts: string[] = []
  if (outOfStock > 0) {
    alerts.push(
      language === "ar"
        ? `يوجد ${outOfStock} منتجاً نافد المخزون ويحتاج مراجعة قبل أي تسليم جديد.`
        : `${outOfStock} products are out of stock and should be reviewed before new dispatches.`
    )
  }
  if (pendingDispatch > 0) {
    alerts.push(
      language === "ar"
        ? "هناك فواتير بانتظار اعتماد تسليم، وبالتالي توقيت إخراج المخزون ما زال معلقًا."
        : "Some invoices are still waiting for delivery approval, so stock release timing remains pending."
    )
  }

  return {
    domain: "inventory",
    summary:
      language === "ar"
        ? "المحرك المحلي يربط المخزون بالمبيعات والمرتجعات واعتمادات المخزن دون تنفيذ أي حركة فعلية."
        : "The local engine ties inventory to sales, returns, and warehouse approvals without executing any real stock movement.",
    metrics: [
      metric(language, "منتجات مخزنية", "Stocked products", stockProducts),
      metric(language, "خدمات", "Services", serviceProducts),
      metric(language, "مخزون منخفض", "Low stock", lowStock),
      metric(language, "نفاد مخزون", "Out of stock", outOfStock),
      metric(language, "حركات تسليم معلقة", "Pending dispatch actions", pendingDispatch),
    ],
    alerts,
    suggestions: [
      language === "ar"
        ? "إذا كان السؤال عن منتج محدد، اذكر الاسم أو SKU لتحصل على إرشاد أدق."
        : "If the question is about a specific product, mention the name or SKU for more precise guidance.",
      language === "ar"
        ? "راجع أولاً المنتجات منخفضة المخزون ثم اعتمادات التسليم أو المرتجع المرتبطة بها."
        : "Review low-stock products first, then the delivery or return approvals that affect them.",
    ],
  }
}

async function loadAccountingContext(
  supabase: SupabaseClient,
  scope: AIContextScope,
  language: "ar" | "en"
): Promise<AILiveContext> {
  const [postedEntries, draftEntries, accountsCount, openReceivables] = await Promise.all([
    countCompanyRows(supabase, "journal_entries", scope, {
      branchColumn: "branch_id",
      mutate: (query) => query.eq("status", "posted").neq("is_deleted", true).is("deleted_at", null),
    }),
    countCompanyRows(supabase, "journal_entries", scope, {
      branchColumn: "branch_id",
      mutate: (query) => query.eq("status", "draft").neq("is_deleted", true).is("deleted_at", null),
    }),
    countCompanyRows(supabase, "chart_of_accounts", scope),
    sumOpenReceivables(supabase, scope),
  ])

  const alerts =
    draftEntries > 0
      ? [
          language === "ar"
            ? `يوجد ${draftEntries} قيداً مسودة تحتاج مراجعة قبل الاعتماد النهائي أو الإقفال.`
            : `${draftEntries} draft journal entries still need review before final posting or closing.`,
        ]
      : []

  return {
    domain: "accounting",
    summary: buildAccountingSummary(scope.pageKey, language),
    metrics: [
      metric(language, "قيود مرحّلة", "Posted journal entries", postedEntries),
      metric(language, "قيود مسودة", "Draft journal entries", draftEntries),
      metric(language, "دليل الحسابات", "Chart of accounts", accountsCount),
      metric(language, "ذمم مدينة مفتوحة", "Open receivables", formatAmount(openReceivables, language)),
    ],
    alerts,
    suggestions: buildAccountingSuggestions(scope.pageKey, language),
  }
}

async function loadReturnsContext(
  supabase: SupabaseClient,
  scope: AIContextScope,
  language: "ar" | "en"
): Promise<AILiveContext> {
  const [pendingLevel1, pendingWarehouse, approvedCompleted, rejected, completedReturns] =
    await Promise.all([
      countCompanyRows(supabase, "sales_return_requests", scope, {
        warehouseColumn: "warehouse_id",
        mutate: (query) => query.eq("status", "pending_approval_level_1"),
      }),
      countCompanyRows(supabase, "sales_return_requests", scope, {
        warehouseColumn: "warehouse_id",
        mutate: (query) => query.eq("status", "pending_warehouse_approval"),
      }),
      countCompanyRows(supabase, "sales_return_requests", scope, {
        warehouseColumn: "warehouse_id",
        mutate: (query) => query.eq("status", "approved_completed"),
      }),
      countCompanyRows(supabase, "sales_return_requests", scope, {
        warehouseColumn: "warehouse_id",
        mutate: (query) => query.in("status", ["rejected_level_1", "rejected_warehouse"]),
      }),
      countCompanyRows(supabase, "sales_returns", scope, {
        branchColumn: "branch_id",
      }),
    ])

  const alerts =
    pendingLevel1 > 0 || pendingWarehouse > 0
      ? [
          language === "ar"
            ? "يوجد طلبات مرتجع ما زالت داخل سلسلة الاعتماد متعددة المستويات."
            : "Some return requests are still moving through the multi-level approval chain.",
        ]
      : []

  return {
    domain: "returns",
    summary:
      language === "ar"
        ? "المرتجعات تمر هنا بطلب اعتماد إداري ثم اعتماد مخزن قبل أي أثر مخزني أو محاسبي."
        : "Returns move here through management approval and then warehouse approval before any inventory or accounting effect.",
    metrics: [
      metric(language, "بانتظار الإدارة", "Pending management approval", pendingLevel1),
      metric(language, "بانتظار المخزن", "Pending warehouse approval", pendingWarehouse),
      metric(language, "طلبات مكتملة", "Completed requests", approvedCompleted),
      metric(language, "طلبات مرفوضة", "Rejected requests", rejected),
      metric(language, "مرتجعات منفذة", "Executed sales returns", completedReturns),
    ],
    alerts,
    suggestions: [
      language === "ar"
        ? "إذا كان السؤال عن سبب عدم التنفيذ، راجع المرحلة الحالية: إدارة أم مخزن."
        : "If you are asking why execution did not happen, first check whether it is waiting on management or warehouse.",
      language === "ar"
        ? "اذكر ما إذا كان المرتجع جزئياً أو كاملاً وسأشرح المسار المناسب."
        : "Mention whether the return is partial or full and I will explain the right workflow.",
    ],
  }
}

async function loadReceivablesContext(
  supabase: SupabaseClient,
  scope: AIContextScope,
  language: "ar" | "en"
): Promise<AILiveContext> {
  const [customersCount, postedInvoices, openReceivables] = await Promise.all([
    countCompanyRows(supabase, "customers", scope),
    countCompanyRows(supabase, "invoices", scope, {
      branchColumn: "branch_id",
      mutate: (query) => query.in("status", ["sent", "paid", "partially_paid"]),
    }),
    sumOpenReceivables(supabase, scope),
  ])

  const alerts =
    openReceivables > 0
      ? [
          language === "ar"
            ? "الرصيد المفتوح يتأثر بالدفعات والمرتجعات واعتماداتها، وليس بالمبيعات فقط."
            : "The open balance is shaped by payments, returns, and their approvals, not by sales alone.",
        ]
      : []

  return {
    domain: "receivables",
    summary:
      language === "ar"
        ? "محليًا، يتم تفسير الذمم من الفواتير المنشورة والمدفوعات والمرتجعات المطبقة عليها."
        : "Locally, receivables are interpreted from posted invoices, payments, and applied returns.",
    metrics: [
      metric(language, "عملاء", "Customers", customersCount),
      metric(language, "فواتير منشورة", "Posted invoices", postedInvoices),
      metric(language, "ذمم مفتوحة", "Open receivables", formatAmount(openReceivables, language)),
    ],
    alerts,
    suggestions: [
      language === "ar"
        ? "إذا أردت تقرير عميل، اذكر اسم العميل وسأوجهك لأفضل صفحة وطريقة مراجعة."
        : "If you need a customer report, mention the customer and I will guide you to the best page and review path.",
    ],
  }
}

async function loadGovernanceContext(
  supabase: SupabaseClient,
  scope: AIContextScope,
  language: "ar" | "en"
): Promise<AILiveContext> {
  const [membersCount, permissionsForRole] = await Promise.all([
    countCompanyRows(supabase, "company_members", scope),
    countCompanyRows(supabase, "company_role_permissions", scope, {
      mutate: (query) => query.eq("role", String(scope.role || "").toLowerCase()),
    }),
  ])

  return {
    domain: "governance",
    summary:
      language === "ar"
        ? "الطبقة المحلية تحافظ على نفس الحوكمة الحالية: صلاحيات الدور، نطاق الفرع/المخزن، وسجل مراجعة لكل محادثة."
        : "The local layer preserves the same governance: role permissions, branch/warehouse scope, and an audit trail for every conversation.",
    metrics: [
      metric(language, "أعضاء الشركة", "Company members", membersCount),
      metric(language, "صلاحيات الدور الحالية", "Permission records for current role", permissionsForRole),
      metric(language, "الدور الحالي", "Current role", scope.role || (language === "ar" ? "غير محدد" : "Not set")),
    ],
    alerts: [],
    suggestions: [
      language === "ar"
        ? "لأي سؤال عن من يعتمد ماذا، اذكر العملية وسأشرح التسلسل دون تجاوز الحوكمة."
        : "For any question about who approves what, mention the workflow and I will explain the sequence without bypassing governance.",
    ],
  }
}

async function loadManufacturingContext(
  supabase: SupabaseClient,
  scope: AIContextScope,
  language: "ar" | "en"
): Promise<AILiveContext> {
  const pageKey = String(scope.pageKey || "").toLowerCase()

  const [totalBoms, activeBoms, totalRoutings, openOrders, inProgressOrders] = await Promise.all([
    countCompanyRows(supabase, "boms", scope),
    countCompanyRows(supabase, "boms", scope, {
      mutate: (query) => query.eq("status", "active"),
    }),
    countCompanyRows(supabase, "routings", scope),
    countCompanyRows(supabase, "production_orders", scope, {
      mutate: (query) => query.in("status", ["draft", "confirmed", "released"]),
    }),
    countCompanyRows(supabase, "production_orders", scope, {
      mutate: (query) => query.eq("status", "in_progress"),
    }),
  ])

  const alerts: string[] = []
  if (openOrders > 0) {
    alerts.push(
      language === "ar"
        ? `يوجد ${openOrders} أوامر إنتاج مفتوحة أو معلقة تحتاج متابعة.`
        : `${openOrders} production orders are open or pending and need follow-up.`
    )
  }

  const summaryByPage: Record<string, Record<"ar" | "en", string>> = {
    bom: {
      ar: "قائمة المواد (BOM) تحدد كل مدخلات تصنيع المنتج: الخامات والمكونات والكميات. بدونها لا يمكن إصدار أمر إنتاج.",
      en: "The Bill of Materials (BOM) defines every input needed to manufacture a product: raw materials, components, and quantities. Without it, no production order can be issued.",
    },
    routing: {
      ar: "مسار التصنيع (Routing) يحدد تسلسل العمليات: ماذا يحدث أولاً، وأين، وكم يستغرق. هو خريطة الإنتاج التشغيلية.",
      en: "The Routing defines the sequence of operations: what happens first, where, and how long it takes. It is the operational production map.",
    },
    production_orders: {
      ar: "أوامر الإنتاج هي الأوامر الرسمية لبدء التصنيع الفعلي. يعكس كل أمر حجم الكمية المطلوبة وحالة التقدم والمواد المصروفة.",
      en: "Production orders are the formal instructions to start actual manufacturing. Each order reflects the required quantity, progress state, and materials consumed.",
    },
  }

  const domainKey = pageKey.startsWith("bom")
    ? "bom"
    : pageKey.startsWith("routing")
    ? "routing"
    : "production_orders"

  return {
    domain: "manufacturing",
    summary: summaryByPage[domainKey]?.[language] ?? summaryByPage["production_orders"][language],
    metrics: [
      metric(language, "قوائم مواد إجمالية", "Total BOMs", totalBoms),
      metric(language, "قوائم مواد نشطة", "Active BOMs", activeBoms),
      metric(language, "مسارات التصنيع", "Routings", totalRoutings),
      metric(language, "أوامر إنتاج مفتوحة", "Open production orders", openOrders),
      metric(language, "أوامر قيد التنفيذ", "In-progress orders", inProgressOrders),
    ],
    alerts,
    suggestions: [
      language === "ar"
        ? "ابدأ دائمًا بمراجعة قائمة المواد (BOM) ومسار التصنيع قبل إصدار أمر الإنتاج."
        : "Always review the BOM and routing before issuing a production order.",
      language === "ar"
        ? "إذا كان سؤالك عن أمر إنتاج محدد، اذكر رقمه أو المنتج المصنّع للحصول على شرح أدق."
        : "If your question is about a specific production order, mention its number or product for a more precise answer.",
    ],
  }
}

async function loadSupportContext(
  supabase: SupabaseClient,
  scope: AIContextScope,
  language: "ar" | "en"
): Promise<AILiveContext> {
  const membersCount = await countCompanyRows(supabase, "company_members", scope)

  return {
    domain: "support",
    summary:
      language === "ar"
        ? "هذا مساعد داخلي مجاني يعتمد على دليل الصفحة والسياق الحي للنظام بدلاً من أي مزود خارجي."
        : "This is a free internal assistant built on page guides and live ERP context instead of any external provider.",
    metrics: [
      metric(language, "أعضاء الشركة", "Company members", membersCount),
      metric(language, "الدور الحالي", "Current role", scope.role || (language === "ar" ? "غير محدد" : "Not set")),
    ],
    alerts: [],
    suggestions: [
      language === "ar"
        ? "اسأل بسياق الصفحة الحالية أو اسم العملية لتحصل على إجابة أدق."
        : "Ask with the current page or workflow name for a more precise answer.",
    ],
  }
}

// ─── Fixed Assets Context ─────────────────────────────────────────────────────
async function loadFixedAssetsContext(
  supabase: SupabaseClient,
  scope: AIContextScope,
  language: "ar" | "en"
): Promise<AILiveContext> {
  const [totalAssets, activeAssets, assetCategories, fullyDepreciated] = await Promise.all([
    countCompanyRows(supabase, "fixed_assets", scope),
    countCompanyRows(supabase, "fixed_assets", scope, {
      mutate: (query) => query.eq("status", "active"),
    }),
    countCompanyRows(supabase, "asset_categories", scope),
    countCompanyRows(supabase, "fixed_assets", scope, {
      mutate: (query) => query.eq("status", "fully_depreciated"),
    }),
  ])

  const alerts: string[] = []
  if (fullyDepreciated > 0) {
    alerts.push(
      language === "ar"
        ? `يوجد ${fullyDepreciated} أصل مكتمل الإهلاك — يُستحسن مراجعة قرار الاستبعاد أو الاستمرار.`
        : `${fullyDepreciated} assets are fully depreciated — review whether to dispose of or continue using them.`
    )
  }

  const pageKey = String(scope.pageKey || "").toLowerCase()
  const summary =
    pageKey === "asset_categories"
      ? language === "ar"
        ? "تصنيفات الأصول تحدد طريقة الإهلاك والسياسة المحاسبية لكل مجموعة من الأصول الثابتة."
        : "Asset categories define the depreciation method and accounting policy for each group of fixed assets."
      : pageKey === "fixed_assets_reports"
      ? language === "ar"
        ? "تقارير الأصول الثابتة تعرض ملخص الأصول وقيمها الدفترية وحالة الإهلاك عبر الفترات."
        : "Fixed asset reports show a summary of assets, their book values, and depreciation state across periods."
      : language === "ar"
        ? "الأصول الثابتة تُسجَّل بتكلفتها الأصلية ثم تُهلَّك على مدار عمرها الإنتاجي وفق سياسة الشركة."
        : "Fixed assets are recorded at cost and depreciated over their useful life according to company policy."

  return {
    domain: "fixed_assets",
    summary,
    metrics: [
      metric(language, "إجمالي الأصول", "Total assets", totalAssets),
      metric(language, "أصول نشطة", "Active assets", activeAssets),
      metric(language, "تصنيفات الأصول", "Asset categories", assetCategories),
      metric(language, "أصول مكتملة الإهلاك", "Fully depreciated assets", fullyDepreciated),
    ],
    alerts,
    suggestions: [
      language === "ar"
        ? "إذا كان سؤالك عن الإهلاك، اذكر الأصل أو الفئة وسأشرح طريقة الحساب والأثر المحاسبي."
        : "If your question is about depreciation, mention the asset or category and I will explain the calculation and accounting impact.",
      language === "ar"
        ? "الاستبعاد أو البيع يحتاج مراجعة القيمة الدفترية الحالية ومقارنتها بسعر التصرف."
        : "Disposal or sale requires reviewing the current book value and comparing it with the disposal price.",
    ],
  }
}

// ─── HR / Payroll Context ─────────────────────────────────────────────────────
async function loadHRContext(
  supabase: SupabaseClient,
  scope: AIContextScope,
  language: "ar" | "en"
): Promise<AILiveContext> {
  const [totalEmployees, activeEmployees, payrollRuns, pendingPayroll] = await Promise.all([
    countCompanyRows(supabase, "employees", scope),
    countCompanyRows(supabase, "employees", scope, {
      mutate: (query) => query.eq("status", "active"),
    }),
    countCompanyRows(supabase, "payroll_runs", scope),
    countCompanyRows(supabase, "payroll_runs", scope, {
      mutate: (query) => query.in("status", ["draft", "pending_approval"]),
    }),
  ])

  const alerts: string[] = []
  if (pendingPayroll > 0) {
    alerts.push(
      language === "ar"
        ? `يوجد ${pendingPayroll} مسير رواتب ما زال بانتظار الاعتماد أو الصرف.`
        : `${pendingPayroll} payroll run(s) are still pending approval or payment.`
    )
  }

  const pageKey = String(scope.pageKey || "").toLowerCase()
  const summary =
    pageKey === "payroll" || pageKey === "instant_payouts"
      ? language === "ar"
        ? "مسير الرواتب يحسب صافي الراتب لكل موظف بعد تطبيق البدلات والاستقطاعات، ثم يمر باعتماد قبل الصرف."
        : "The payroll run calculates each employee's net salary after allowances and deductions, then passes through approval before payment."
      : pageKey === "attendance"
      ? language === "ar"
        ? "سجل الحضور والانصراف يؤثر مباشرة على حسابات الراتب والاستقطاعات المرتبطة."
        : "Attendance records directly affect salary calculations and related deductions."
      : language === "ar"
        ? "بيانات الموظفين تشمل الراتب الأساسي والبدلات والدور الوظيفي وتاريخ الانضمام، وهي مدخلات مسير الرواتب."
        : "Employee records include base salary, allowances, job role, and start date — all of which are inputs for the payroll run."

  return {
    domain: "hr",
    summary,
    metrics: [
      metric(language, "إجمالي الموظفين", "Total employees", totalEmployees),
      metric(language, "موظفون نشطون", "Active employees", activeEmployees),
      metric(language, "مسيرات رواتب", "Payroll runs", payrollRuns),
      metric(language, "مسيرات معلقة", "Pending payroll runs", pendingPayroll),
    ],
    alerts,
    suggestions: [
      language === "ar"
        ? "إذا كان السؤال عن الراتب، اذكر اسم الموظف أو الفترة وسأشرح تفاصيل الحساب خطوة بخطوة."
        : "If the question is about salary, mention the employee name or period and I will explain the calculation step by step.",
      language === "ar"
        ? "راجع حالة مسير الرواتب (مسودة/معتمد/مصروف) قبل تفسير أي أرقام راتب."
        : "Review the payroll run status (draft/approved/paid) before interpreting any salary figures.",
    ],
  }
}

function buildGovernanceSummary(
  scope: AIContextScope,
  permissionSnapshot: AIPermissionSnapshot,
  language: "ar" | "en"
): string {
  if (language === "ar") {
    return [
      `الشركة: ${scope.companyId}`,
      `الدور: ${scope.role || "غير محدد"}`,
      `الفرع: ${scope.branchId || "غير محدد"}`,
      `مركز التكلفة: ${scope.costCenterId || "غير محدد"}`,
      `المخزن: ${scope.warehouseId || "غير محدد"}`,
      `المورد/الصفحة: ${permissionSnapshot.resource || "غير محدد"}`,
      `القراءة: ${permissionSnapshot.canRead ? "مسموح" : "غير مسموح"}`,
      `الكتابة: ${permissionSnapshot.canWrite ? "مسموح" : "غير مسموح"}`,
      `التحديث: ${permissionSnapshot.canUpdate ? "مسموح" : "غير مسموح"}`,
      `الحذف: ${permissionSnapshot.canDelete ? "مسموح" : "غير مسموح"}`,
      "يجب احترام الحوكمة الحالية والصلاحيات الفعلية للمستخدم في كل إجابة.",
    ].join("\n")
  }

  return [
    `Company: ${scope.companyId}`,
    `Role: ${scope.role || "unknown"}`,
    `Branch: ${scope.branchId || "not set"}`,
    `Cost center: ${scope.costCenterId || "not set"}`,
    `Warehouse: ${scope.warehouseId || "not set"}`,
    `Resource: ${permissionSnapshot.resource || "unknown"}`,
    `Read: ${permissionSnapshot.canRead ? "allowed" : "not allowed"}`,
    `Write: ${permissionSnapshot.canWrite ? "allowed" : "not allowed"}`,
    `Update: ${permissionSnapshot.canUpdate ? "allowed" : "not allowed"}`,
    `Delete: ${permissionSnapshot.canDelete ? "allowed" : "not allowed"}`,
    "All answers must respect current governance and real user permissions.",
  ].join("\n")
}

function metric(
  language: "ar" | "en",
  labelAr: string,
  labelEn: string,
  value: string | number
): AILiveMetric {
  return {
    label: language === "ar" ? labelAr : labelEn,
    value: String(value),
  }
}

function buildAccountingSummary(
  pageKey: string | null | undefined,
  language: "ar" | "en"
) {
  switch (String(pageKey || "").toLowerCase()) {
    case "bills":
      return language === "ar"
        ? "الموديول المحلي يقرأ دورة الشراء هنا كسلسلة: أمر شراء -> فاتورة مورد -> استلام/تأكيد -> ذمم دائنة -> سداد أو إشعار دائن."
        : "The local module reads the purchasing cycle here as: purchase order -> supplier bill -> receipt/confirmation -> payables -> payment or vendor credit."
    case "purchase_orders":
      return language === "ar"
        ? "الموديول المحلي يشرح دورة أمر الشراء من الطلب مع المورد وحتى التحويل إلى فاتورة مورد أو الاستلام الفعلي."
        : "The local module explains the purchase-order cycle from supplier request through conversion into a supplier bill or physical receipt."
    case "purchase_returns":
      return language === "ar"
        ? "الموديول المحلي يشرح هنا دورة مرتجع المشتريات من طلب الإرجاع وحتى الأثر المالي أو استلام التعويض من المورد."
        : "The local module explains the purchase-return cycle here from return request through financial impact or supplier compensation."
    case "vendor_credits":
      return language === "ar"
        ? "الموديول المحلي يوضح هنا كيف يعمل إشعار دائن المورد كتخفيض على الذمم أو كتعويض مرتبط بمرتجع أو تسوية."
        : "The local module explains how a vendor credit reduces payables or compensates a return or settlement."
    case "payments":
      return language === "ar"
        ? "الموديول المحلي يشرح هنا دورة المدفوعات والتحصيل والربط بين الحركة المالية والمستندات المفتوحة."
        : "The local module explains the payment and collection cycle here, including the link between cash movement and open documents."
    default:
      return language === "ar"
        ? "الموديول المحلي يشرح الأثر المحاسبي والقيود المرتبطة بالعمليات دون إنشاء قيود جديدة."
        : "The local module explains accounting impact and journal behavior without creating new entries."
  }
}

function buildAccountingSuggestions(
  pageKey: string | null | undefined,
  language: "ar" | "en"
) {
  switch (String(pageKey || "").toLowerCase()) {
    case "bills":
      return [
        language === "ar"
          ? "إذا كنت تسأل عن دورة الشراء، ابدأ بحالة الفاتورة ثم الاستلام أو التأكيد ثم الذمم والسداد."
          : "For purchasing-cycle questions, start with bill status, then receipt or confirmation, then payables and payment.",
        language === "ar"
          ? "إذا أردت فهم الاعتمادات، اسأل عن حالة الاستلام أو اعتماد المورد أو الإقفال المحاسبي."
          : "If you need approvals, ask about receipt state, supplier approval, or accounting close constraints.",
      ]
    case "purchase_orders":
      return [
        language === "ar"
          ? "اسأل عن الخطوة التالية بين أمر الشراء والاستلام وفاتورة المورد لتحصل على شرح أدق."
          : "Ask about the next step between purchase order, receipt, and supplier bill for a more precise explanation.",
        language === "ar"
          ? "إذا كان السؤال عن المورد، اذكر المستند أو المرحلة الحالية وسأربطها بالدورة المناسبة."
          : "If the question is about the supplier, mention the document or current stage and I will connect it to the right cycle.",
      ]
    case "purchase_returns":
      return [
        language === "ar"
          ? "إذا كان السؤال عن المرتجع، وضح هل المطلوب إعادة مخزنية أم معالجة مالية أم تسوية مع المورد."
          : "If the question is about the return, clarify whether you need inventory return, financial treatment, or supplier settlement.",
        language === "ar"
          ? "اسأل عن حالة الاعتماد الحالية وسأشرح لك الخطوة الصحيحة التالية."
          : "Ask about the current approval stage and I will explain the correct next step.",
      ]
    case "vendor_credits":
      return [
        language === "ar"
          ? "إذا كان السؤال عن إشعار الدائن، اذكر هل تريد فهم إنشائه أم تطبيقه على فاتورة مورد."
          : "If the question is about the vendor credit, mention whether you want to understand its creation or its application against a supplier bill.",
      ]
    case "payments":
      return [
        language === "ar"
          ? "إذا كان السؤال عن السداد أو التحصيل، اذكر نوع الحركة والمستند المرتبط بها لأشرح الربط الصحيح."
          : "If the question is about payment or collection, mention the movement type and linked document so I can explain the correct linkage.",
        language === "ar"
          ? "راجع دائمًا الفترة المحاسبية وحالة المستند قبل تفسير سبب السماح أو المنع."
          : "Always review the accounting period and document status before interpreting why an action is allowed or blocked.",
      ]
    default:
      return [
        language === "ar"
          ? "إذا كنت تسأل عن قيد عملية، اذكر نوع العملية: فاتورة، دفعة، مرتجع، أو قيد بنكي."
          : "If you are asking about an entry, mention the transaction type: invoice, payment, return, or banking entry.",
        language === "ar"
          ? "للذمم، راقب دائماً الإجمالي والمدفوع والمرتجع قبل تفسير الرصيد."
          : "For receivables, always compare total, paid, and returned values before interpreting the balance.",
      ]
  }
}

function formatAmount(value: number, language: "ar" | "en") {
  return new Intl.NumberFormat(language === "ar" ? "ar-EG" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

async function sumOpenReceivables(
  supabase: SupabaseClient,
  scope: AIContextScope
): Promise<number> {
  try {
    let query: any = supabase
      .from("invoices")
      .select("total_amount, paid_amount, returned_amount, branch_id, warehouse_id")
      .eq("company_id", scope.companyId)
      .in("status", ["sent", "paid", "partially_paid"])

    query = applyScopedFilters(query, scope, {
      branchColumn: "branch_id",
      warehouseColumn: "warehouse_id",
    })

    const { data, error } = await query
    if (error || !Array.isArray(data)) return 0

    return data.reduce((sum: number, row: any) => {
      const total = Number(row.total_amount || 0)
      const paid = Number(row.paid_amount || 0)
      const returned = Number(row.returned_amount || 0)
      return sum + Math.max(0, total - paid - returned)
    }, 0)
  } catch {
    return 0
  }
}

async function countCompanyRows(
  supabase: SupabaseClient,
  table: string,
  scope: AIContextScope,
  options?: {
    branchColumn?: string
    warehouseColumn?: string
    mutate?: (query: any) => any
  }
): Promise<number> {
  try {
    let query: any = supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("company_id", scope.companyId)

    query = applyScopedFilters(query, scope, {
      branchColumn: options?.branchColumn,
      warehouseColumn: options?.warehouseColumn,
    })

    if (options?.mutate) {
      query = options.mutate(query)
    }

    const { count, error } = await query
    if (error) return 0
    return Number(count || 0)
  } catch {
    return 0
  }
}

function applyScopedFilters(
  query: any,
  scope: AIContextScope,
  options?: {
    branchColumn?: string
    warehouseColumn?: string
  }
) {
  if (hasFullScope(scope.role)) return query

  if (options?.branchColumn && scope.branchId) {
    query = query.eq(options.branchColumn, scope.branchId)
  }

  if (options?.warehouseColumn && scope.warehouseId) {
    query = query.eq(options.warehouseColumn, scope.warehouseId)
  }

  return query
}

function hasFullScope(role?: string | null) {
  return ["owner", "admin", "general_manager"].includes(
    String(role || "").trim().toLowerCase()
  )
}
