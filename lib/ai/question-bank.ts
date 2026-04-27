import type { AIDomain, AIPromptCategory, AIQuickPrompt } from "@/lib/ai/contracts"

type QuestionBankModule =
  | "global"
  | "sales"
  | "customers"
  | "procurement"
  | "inventory"
  | "accounting"
  | "fixedAssets"
  | "hr"
  | "governance"
  | "analytics"
  | "manufacturing"
  | "advanced"

interface QuestionBankEntry {
  labelAr: string
  promptAr: string
  labelEn: string
  promptEn: string
  category: AIPromptCategory
}

export const ERP_COPILOT_QUESTION_BANK: Record<QuestionBankModule, QuestionBankEntry[]> = {
  global: [
    entry("ما الذي يمكنني فعله حسب صلاحيتي الحالية؟", "What can I do with my current permissions?", "governance"),
    entry("اشرح لي هذه الصفحة ووظيفتها داخل النظام", "Explain this page and its role in the ERP", "workflow"),
    entry("ما هي الخطوات الصحيحة لتنفيذ العملية الحالية؟", "What are the correct steps for the current process?", "workflow"),
    entry("هل هذه العملية تؤثر محاسبيًا؟", "Does this process have an accounting impact?", "compliance"),
    entry("ما هي الأخطاء الشائعة هنا؟", "What are the common mistakes here?", "compliance"),
  ],
  sales: [
    entry("كيف أنشئ أمر بيع جديد خطوة بخطوة؟", "How do I create a new sales order step by step?", "workflow"),
    entry("ما الفرق بين أمر البيع وفاتورة المبيعات؟", "What is the difference between a sales order and an invoice?", "workflow"),
    entry("متى يتم إنشاء القيد المحاسبي؟", "When is the accounting entry created?", "compliance"),
    entry("هل يمكن تحويل الطلب جزئيًا إلى فاتورة؟", "Can the order be partially converted to an invoice?", "workflow"),
    entry("كيف أتعامل مع مرتجع مبيعات؟", "How do I handle a sales return?", "workflow"),
    entry("لماذا تم رفض هذا الطلب؟", "Why was this request rejected?", "governance"),
  ],
  customers: [
    entry("ما حالة رصيد هذا العميل؟", "What is this customer's balance status?", "analytics"),
    entry("هل العميل عليه مديونية؟", "Does this customer have outstanding receivables?", "analytics"),
    entry("ما آخر العمليات الخاصة بهذا العميل؟", "What are the latest transactions for this customer?", "analytics"),
    entry("هل يمكن إيقاف التعامل مع هذا العميل؟", "Can dealing with this customer be stopped?", "governance"),
  ],
  procurement: [
    entry("كيف أنشئ أمر شراء؟", "How do I create a purchase order?", "workflow"),
    entry("ما الفرق بين أمر الشراء والفاتورة؟", "What is the difference between a purchase order and a bill?", "workflow"),
    entry("متى يتم اعتماد الطلب؟", "When is the request approved?", "governance"),
    entry("كيف يتم تسجيل مرتجع مشتريات؟", "How is a purchase return recorded?", "workflow"),
  ],
  inventory: [
    entry("ما الكمية المتاحة من هذا المنتج؟", "What is the available quantity of this product?", "analytics"),
    entry("هل يوجد عجز أو زيادة في المخزون؟", "Is there a shortage or surplus in stock?", "analytics"),
    entry("كيف يتم صرف المخزون؟", "How is stock issued?", "workflow"),
    entry("كيف يتم جرد المخزون؟", "How is inventory counted?", "workflow"),
    entry("ما تأثير هذه العملية على المخزون؟", "What is this process's impact on inventory?", "compliance"),
  ],
  accounting: [
    entry("هل هذه العملية أنشأت قيد محاسبي؟", "Did this process create an accounting entry?", "compliance"),
    entry("اعرض لي القيد الناتج", "Show me the resulting journal entry", "analytics"),
    entry("كيف يتم تسجيل دفعة؟", "How is a payment recorded?", "workflow"),
    entry("ما الفرق بين مدين ودائن هنا؟", "What is the difference between debit and credit here?", "workflow"),
    entry("لماذا لا يظهر هذا في التقارير؟", "Why does this not appear in reports?", "analytics"),
  ],
  fixedAssets: [
    entry("كيف أضيف أصل جديد؟", "How do I add a new fixed asset?", "workflow"),
    entry("كيف يتم حساب الإهلاك؟", "How is depreciation calculated?", "workflow"),
    entry("ما حالة هذا الأصل؟", "What is this asset's status?", "analytics"),
  ],
  hr: [
    entry("كيف يتم حساب راتب الموظف؟", "How is the employee salary calculated?", "workflow"),
    entry("هل تم صرف المرتب؟", "Has the salary been paid?", "analytics"),
    entry("ما الاستقطاعات؟", "What are the deductions?", "analytics"),
  ],
  governance: [
    entry("ما الصلاحيات الحالية الخاصة بي؟", "What are my current permissions?", "governance"),
    entry("لماذا لا أستطيع تنفيذ هذا الإجراء؟", "Why can I not perform this action?", "governance"),
    entry("من يمكنه اعتماد هذه العملية؟", "Who can approve this process?", "governance"),
    entry("كيف يتم تغيير الصلاحيات؟", "How are permissions changed?", "governance"),
    entry("هل هذه العملية تحتاج اعتماد؟", "Does this process need approval?", "governance"),
    entry("من المسؤول عن الموافقة؟", "Who is responsible for approval?", "governance"),
    entry("هل هناك مخاطرة في تنفيذ هذه العملية؟", "Is there a risk in performing this process?", "compliance"),
    entry("هل هذه العملية مخالفة للسياسات؟", "Does this process violate policies?", "compliance"),
  ],
  analytics: [
    entry("ما ملخص الأداء الحالي؟", "What is the current performance summary?", "analytics"),
    entry("ما أكثر المنتجات مبيعًا؟", "What are the top-selling products?", "analytics"),
    entry("ما العملاء الأكثر نشاطًا؟", "Who are the most active customers?", "analytics"),
    entry("هل هناك مشاكل تحتاج انتباه؟", "Are there issues that need attention?", "compliance"),
  ],
  advanced: [
    entry("ماذا يجب أن أفعل الآن في هذه الصفحة؟", "What should I do now on this page?", "prediction"),
    entry("اقترح لي الخطوة التالية", "Suggest the next step", "prediction"),
    entry("هل هناك خطأ في البيانات الحالية؟", "Is there an error in the current data?", "compliance"),
    entry("كيف أحسن الأداء في هذا القسم؟", "How can I improve performance in this section?", "analytics"),
  ],
  manufacturing: [
    entry("ما وظيفة قائمة المواد (BOM) وكيف أستخدمها؟", "What is the BOM and how do I use it?", "workflow"),
    entry("ما الفرق بين قائمة المواد ومسار التصنيع؟", "What is the difference between BOM and routing?", "workflow"),
    entry("كيف أنشئ أمر إنتاج جديد؟", "How do I create a new production order?", "workflow"),
    entry("كيف أتحقق من توفر المواد قبل بدء الإنتاج؟", "How do I check material availability before starting production?", "workflow"),
    entry("ما معنى حالة 'مسودة' في أمر الإنتاج؟", "What does 'draft' status mean in a production order?", "workflow"),
    entry("متى يمكنني صرف المواد لأمر الإنتاج؟", "When can I issue materials against a production order?", "governance"),
    entry("ما الفرق بين الكمية المطلوبة والكمية المنتجة الفعلية؟", "What is the difference between required and actual produced quantity?", "analytics"),
    entry("كيف تُضاف الكمية المنتجة للمخزون؟", "How is produced quantity added to stock?", "workflow"),
    entry("لماذا لا يمكنني إلغاء أمر الإنتاج؟", "Why can I not cancel the production order?", "governance"),
    entry("ما معنى معاينة التفجير في قائمة المواد؟", "What does the BOM explosion preview mean?", "workflow"),
  ],
}

export function buildERPQuestionBankPrompts(params: {
  language: "ar" | "en"
  domain?: AIDomain | null
  pageKey?: string | null
  includeGlobal?: boolean
  includeAdvanced?: boolean
  limit?: number
}): AIQuickPrompt[] {
  const {
    language,
    domain = null,
    pageKey = null,
    includeGlobal = true,
    includeAdvanced = true,
    limit = 6,
  } = params
  const modules = resolveQuestionBankModules(pageKey, domain, includeGlobal, includeAdvanced)
  const prompts = modules.flatMap((module) =>
    ERP_COPILOT_QUESTION_BANK[module].map((item) => ({
      label: language === "ar" ? item.labelAr : item.labelEn,
      prompt: language === "ar" ? item.promptAr : item.promptEn,
      category: item.category,
    }))
  )

  return dedupePrompts(prompts).slice(0, limit)
}

export function getERPQuestionBankPhrases() {
  return Object.values(ERP_COPILOT_QUESTION_BANK).flatMap((items) =>
    items.flatMap((item) => [item.labelAr, item.promptAr, item.labelEn, item.promptEn])
  )
}

function resolveQuestionBankModules(
  pageKeyValue: string | null | undefined,
  domain: AIDomain | null,
  includeGlobal: boolean,
  includeAdvanced: boolean
): QuestionBankModule[] {
  const pageKey = String(pageKeyValue || "").toLowerCase()
  const modules: QuestionBankModule[] = []

  if (includeGlobal) modules.push("global")

  if (isProcurementPage(pageKey)) {
    modules.push("procurement")
  } else if (isSalesPage(pageKey) || domain === "sales" || domain === "returns") {
    modules.push("sales")
  } else if (isCustomerPage(pageKey) || domain === "receivables") {
    modules.push("customers")
  } else if (isInventoryPage(pageKey) || domain === "inventory") {
    modules.push("inventory")
  } else if (isManufacturingPage(pageKey) || domain === "manufacturing") {
    modules.push("manufacturing")
  } else if (isFixedAssetsPage(pageKey)) {
    modules.push("fixedAssets")
  } else if (isHRPage(pageKey)) {
    modules.push("hr")
  } else if (isGovernancePage(pageKey) || domain === "governance") {
    modules.push("governance")
  } else if (isAnalyticsPage(pageKey) || domain === "dashboard") {
    modules.push("analytics")
  } else if (isAccountingPage(pageKey) || domain === "accounting") {
    modules.push("accounting")
  }

  if (includeAdvanced) modules.push("advanced")

  return dedupeModules(modules)
}

function entry(textAr: string, textEn: string, category: AIPromptCategory): QuestionBankEntry {
  return {
    labelAr: textAr,
    promptAr: textAr,
    labelEn: textEn,
    promptEn: textEn,
    category,
  }
}

function isSalesPage(pageKey: string) {
  return [
    "invoices",
    "sales_orders",
    "sales_returns",
    "sales_return_requests",
    "sent_invoice_returns",
    "estimates",
    "customer_debit_notes",
  ].includes(pageKey)
}

function isCustomerPage(pageKey: string) {
  return ["customers", "customer_credits", "customer_debit_notes"].includes(pageKey)
}

function isProcurementPage(pageKey: string) {
  return ["bills", "purchase_orders", "purchase_returns", "vendor_credits", "suppliers"].includes(pageKey)
}

function isInventoryPage(pageKey: string) {
  return [
    "inventory",
    "products",
    "warehouses",
    "inventory_transfers",
    "product_availability",
    "inventory_goods_receipt",
    "third_party_inventory",
    "write_offs",
  ].includes(pageKey)
}

function isAccountingPage(pageKey: string) {
  return [
    "journal",
    "journal_entries",
    "chart_of_accounts",
    "banking",
    "payments",
    "expenses",
    "drawings",
    "annual_closing",
    "accounting_periods",
    "income_statement",
    "balance_sheet",
    "trial_balance",
    "accounting_validation",
  ].includes(pageKey)
}

function isFixedAssetsPage(pageKey: string) {
  return ["fixed_assets", "asset_categories", "fixed_assets_reports"].includes(pageKey)
}

function isHRPage(pageKey: string) {
  return ["hr", "employees", "attendance", "payroll", "instant_payouts"].includes(pageKey)
}

function isGovernancePage(pageKey: string) {
  return ["settings", "branches", "cost_centers", "users", "permissions"].includes(pageKey)
}

function isManufacturingPage(pageKey: string) {
  return [
    "bom",
    "bom_detail",
    "routing",
    "routing_detail",
    "production_orders",
    "production_order_detail",
  ].includes(pageKey)
}

function isAnalyticsPage(pageKey: string) {
  return ["dashboard", "reports"].includes(pageKey)
}

function dedupePrompts(prompts: AIQuickPrompt[]) {
  const seen = new Set<string>()
  return prompts.filter((item) => {
    const key = item.label.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function dedupeModules(modules: QuestionBankModule[]) {
  return modules.filter((module, index) => modules.indexOf(module) === index)
}
