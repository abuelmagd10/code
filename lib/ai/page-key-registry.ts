import type { AIDomain } from "@/lib/ai/contracts"

export type AIQuestionBankModule =
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

export interface AIPageKeyRegistryEntry {
  key: string
  prefixes: string[]
  domain: AIDomain
  resource: string | null
  questionBankModule: AIQuestionBankModule | null
  fallbackGuideKey?: string | null
  guideRequired: boolean
}

export const AI_EXCLUDED_PREFIXES = [
  "/auth/",
  "/onboarding",
  "/invitations/",
  "/admin/",
  "/no-access",
  "/no-permissions",
  "/system-status",
  "/test-tooltips",
  "/fix-inv",
  "/fix-invoice",
] as const

export const AI_PAGE_KEY_REGISTRY: AIPageKeyRegistryEntry[] = [
  entry("dashboard", ["/dashboard"], "dashboard", "dashboard", "analytics"),

  entry("invoices", ["/invoices"], "sales", "invoices", "sales"),
  entry("sales_orders", ["/sales-orders"], "sales", "sales_orders", "sales"),
  entry("sales_return_requests", ["/sales-return-requests"], "returns", "sales_return_requests", "sales", "sales_returns"),
  entry("sales_returns", ["/sales-returns"], "returns", "sales_returns", "sales"),
  entry("sent_invoice_returns", ["/sent-invoice-returns"], "returns", "sent_invoice_returns", "sales", "sales_returns"),
  entry("estimates", ["/estimates"], "sales", "estimates", "sales"),
  entry("customer_debit_notes", ["/customer-debit-notes"], "sales", "customer_debit_notes", "sales"),
  entry("customer_credits", ["/customer-credits"], "returns", "customer_credits", "customers", "customers"),
  entry("customer_refund_requests", ["/customer-refund-requests"], "returns", "customer_credits", "customers", "customers"),

  entry("bills", ["/bills"], "accounting", "bills", "procurement"),
  entry("purchase_orders", ["/purchase-orders"], "accounting", "purchase_orders", "procurement"),
  entry("purchase_returns", ["/purchase-returns"], "accounting", "purchase_returns", "procurement"),
  entry("vendor_credits", ["/vendor-credits"], "accounting", "vendor_credits", "procurement"),

  entry("customers", ["/customers"], "receivables", "customers", "customers"),
  entry("suppliers", ["/suppliers"], "accounting", "suppliers", "procurement"),
  entry("shareholders", ["/shareholders"], "support", "shareholders", null),

  entry("products", ["/products"], "inventory", "products", "inventory"),
  entry("inventory_transfers", ["/inventory-transfers"], "inventory", "inventory_transfers", "inventory"),
  entry("inventory_goods_receipt", ["/inventory/goods-receipt"], "inventory", "inventory_goods_receipt", "inventory", "inventory"),
  entry("inventory_dispatch_approvals", ["/inventory/dispatch-approvals"], "inventory", "dispatch_approvals", "inventory", "inventory"),
  entry("product_availability", ["/inventory/product-availability"], "inventory", "product_availability", "inventory", "inventory"),
  entry("third_party_inventory", ["/inventory/third-party"], "inventory", "third_party_inventory", "inventory", "inventory"),
  entry("write_offs", ["/inventory/write-offs"], "inventory", "write_offs", "inventory", "inventory"),
  entry("inventory", ["/inventory"], "inventory", "inventory", "inventory"),

  entry("journal", ["/journal-entries"], "accounting", "journal_entries", "accounting"),
  entry("chart_of_accounts", ["/chart-of-accounts"], "accounting", "chart_of_accounts", "accounting"),
  entry("accounting_periods", ["/accounting"], "accounting", "accounting_periods", "accounting"),

  entry("income_statement", ["/reports/income-statement"], "accounting", "reports", "accounting"),
  entry("balance_sheet", ["/reports/balance-sheet-audit", "/reports/balance-sheet"], "accounting", "reports", "accounting"),
  entry("accounting_validation", ["/reports/accounting-validation"], "accounting", "reports", "accounting"),
  entry("trial_balance", ["/reports/trial-balance"], "accounting", "reports", "accounting"),
  entry("banking", ["/reports/bank-reconciliation", "/reports/bank-accounts-by-branch", "/reports/bank-transactions", "/banking"], "accounting", "banking", "accounting"),
  entry("cash_flow", ["/reports/cash-flow"], "accounting", "reports", "accounting", "reports"),
  entry("vat_reports", ["/reports/vat-input", "/reports/vat-output", "/reports/vat-summary"], "accounting", "reports", "accounting", "reports"),
  entry("shipping_reports", ["/reports/shipping-costs", "/reports/shipping"], "dashboard", "reports", "analytics", "reports"),
  entry("financial_trace_reports", ["/reports/financial-trace-explorer", "/reports/financial-replay-recovery", "/reports/financial-integrity-checks"], "accounting", "reports", "accounting", "reports"),
  entry("equity_changes", ["/reports/equity-changes"], "accounting", "reports", "accounting", "reports"),
  entry("aging_ar", ["/reports/aging-ar"], "receivables", "customers", "customers", "customers"),
  entry("aging_ap", ["/reports/aging-ap"], "accounting", "suppliers", "procurement", "suppliers"),
  entry("inventory_reports", ["/reports/inventory-audit", "/reports/inventory-count", "/reports/inventory-valuation", "/reports/warehouse-inventory"], "inventory", "reports", "inventory", "inventory"),
  entry("product_reports", ["/reports/product-expiry", "/reports/top-products", "/reports/sales-by-product"], "inventory", "reports", "inventory", "products"),
  entry("sales_reports", ["/reports/sales", "/reports/sales-invoices-detail", "/reports/sales-discounts", "/reports/invoices"], "sales", "reports", "sales", "invoices"),
  entry("purchase_reports", ["/reports/purchases", "/reports/purchase-bills-detail", "/reports/purchase-orders-status", "/reports/purchase-prices-by-period"], "accounting", "reports", "procurement", "bills"),
  entry("supplier_price_comparison", ["/reports/supplier-price-comparison"], "accounting", "reports", "procurement", "suppliers"),
  entry("daily_payments_receipts", ["/reports/daily-payments-receipts"], "accounting", "payments", "accounting", "payments"),
  entry("dashboard_reports", ["/reports/dashboard"], "dashboard", "dashboard", "analytics", "dashboard"),
  entry("cost_center_reports", ["/reports/branch-cost-center", "/reports/cost-center-analysis", "/reports/branch-comparison"], "governance", "cost_centers", "governance", "cost_centers"),
  entry("sales_bonus_reports", ["/reports/sales-bonuses"], "hr", "payroll", "hr", "payroll"),
  entry("login_activity", ["/reports/login-activity"], "governance", "settings", "governance", "settings"),
  entry("update_account_balances", ["/reports/update-account-balances"], "accounting", "chart_of_accounts", "accounting", "chart_of_accounts"),
  entry("simple_summary_reports", ["/reports/simple-summary"], "dashboard", "reports", "analytics", "reports"),
  entry("reports", ["/reports"], "dashboard", "reports", "analytics"),

  entry("annual_closing", ["/annual-closing"], "accounting", "annual_closing", "accounting"),
  entry("drawings", ["/drawings"], "accounting", "drawings", "accounting"),
  entry("payments", ["/payments"], "accounting", "payments", "accounting"),
  entry("expenses", ["/expenses"], "accounting", "expenses", "accounting"),

  entry("payroll", ["/hr/payroll", "/hr/instant-payouts"], "hr", "payroll", "hr"),
  entry("employees", ["/hr/employees", "/hr"], "hr", "employees", "hr"),
  entry("attendance_daily", ["/hr/attendance/daily"], "hr", "attendance", "hr", "employees"),
  entry("attendance_devices", ["/hr/attendance/devices"], "hr", "attendance", "hr", "employees"),
  entry("attendance_reports", ["/hr/attendance/reports"], "hr", "attendance", "hr", "employees"),
  entry("attendance_settings", ["/hr/attendance/settings"], "hr", "attendance", "hr", "employees"),
  entry("attendance_shifts", ["/hr/attendance/shifts"], "hr", "attendance", "hr", "employees"),
  entry("attendance_anomalies", ["/hr/attendance/anomalies"], "hr", "attendance", "hr", "employees"),
  entry("attendance", ["/hr/attendance"], "hr", "attendance", "hr", "employees"),

  entry("asset_categories", ["/fixed-assets/categories"], "fixed_assets", "asset_categories", "fixedAssets", "fixed_assets"),
  entry("fixed_assets_reports", ["/fixed-assets/reports"], "fixed_assets", "fixed_assets_reports", "fixedAssets", "fixed_assets"),
  entry("fixed_assets", ["/fixed-assets"], "fixed_assets", "fixed_assets", "fixedAssets"),

  entry("branches", ["/branches"], "governance", "branches", "governance"),
  entry("warehouses", ["/warehouses"], "inventory", "warehouses", "inventory"),
  entry("cost_centers", ["/cost-centers"], "governance", "cost_centers", "governance"),
  entry("settings_users", ["/settings/users"], "governance", "users", "governance", "settings"),
  entry("settings_taxes", ["/settings/taxes"], "governance", "taxes", "governance", "settings"),
  entry("settings_exchange_rates", ["/settings/exchange-rates"], "governance", "exchange_rates", "governance", "settings"),
  entry("settings_shipping", ["/settings/shipping"], "governance", "shipping", "governance", "settings"),
  entry("settings_audit_log", ["/settings/audit-log"], "governance", "audit_log", "governance", "settings"),
  entry("settings_backup", ["/settings/backup"], "governance", "backup", "governance", "settings"),
  entry("settings_orders_rules", ["/settings/orders-rules"], "governance", "orders_rules", "governance", "settings"),
  entry("settings_profile", ["/settings/profile"], "governance", "profile", "governance", "settings"),
  entry("settings_tooltips", ["/settings/tooltips"], "governance", "settings", "governance", "settings"),
  entry("settings_commissions", ["/settings/commissions"], "governance", "settings", "governance", "settings"),
  entry("settings_accounting_maintenance", ["/settings/accounting-maintenance"], "governance", "accounting_maintenance", "governance", "settings"),
  entry("settings", ["/settings"], "governance", "settings", "governance"),

  entry("manufacturing_bom_detail", ["/manufacturing/boms/:id"], "manufacturing", "manufacturing_boms", "manufacturing"),
  entry("manufacturing_routing_detail", ["/manufacturing/routings/:id"], "manufacturing", "manufacturing_boms", "manufacturing"),
  entry("manufacturing_production_order_detail", ["/manufacturing/production-orders/:id"], "manufacturing", "manufacturing_boms", "manufacturing"),
  entry("manufacturing_boms", ["/manufacturing/boms"], "manufacturing", "manufacturing_boms", "manufacturing"),
  entry("manufacturing_routings", ["/manufacturing/routings"], "manufacturing", "manufacturing_boms", "manufacturing"),
  entry("manufacturing_production_orders", ["/manufacturing/production-orders"], "manufacturing", "manufacturing_boms", "manufacturing"),
] as const

export const PAGE_KEY_MAP = AI_PAGE_KEY_REGISTRY.flatMap((item) =>
  item.prefixes
    .filter((prefix) => !prefix.includes("/:"))
    .map((prefix) => ({ prefix, key: item.key }))
)

export function isAIExcludedPath(pathname: string): boolean {
  return (
    !pathname ||
    pathname === "/" ||
    AI_EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  )
}

export function getPageKeyFromRegistry(pathname: string): string | null {
  if (isAIExcludedPath(pathname)) return null

  const mfgDetailMatch = pathname.match(
    /^\/manufacturing\/(boms|routings|production-orders)\/[^/]+/
  )
  if (mfgDetailMatch) {
    const detailKeyMap: Record<string, string> = {
      boms: "manufacturing_bom_detail",
      routings: "manufacturing_routing_detail",
      "production-orders": "manufacturing_production_order_detail",
    }
    return detailKeyMap[mfgDetailMatch[1]] ?? null
  }

  const best = PAGE_KEY_MAP
    .filter(
      (entry) =>
        pathname === entry.prefix ||
        pathname.startsWith(`${entry.prefix}/`) ||
        pathname.startsWith(`${entry.prefix}?`)
    )
    .sort((a, b) => b.prefix.length - a.prefix.length)[0]

  return best?.key ?? null
}

export function getPageKeyEntry(pageKey?: string | null): AIPageKeyRegistryEntry | null {
  const key = String(pageKey || "").toLowerCase()
  if (!key) return null
  return AI_PAGE_KEY_REGISTRY.find((entry) => entry.key === key) ?? null
}

export function getGuideKeyForPageKey(pageKey?: string | null): string | null {
  const entry = getPageKeyEntry(pageKey)
  if (!entry) return pageKey || null
  return entry.fallbackGuideKey || entry.key
}

function entry(
  key: string,
  prefixes: string[],
  domain: AIDomain,
  resource: string | null,
  questionBankModule: AIQuestionBankModule | null,
  fallbackGuideKey: string | null = null,
  guideRequired = true
): AIPageKeyRegistryEntry {
  return {
    key,
    prefixes,
    domain,
    resource,
    questionBankModule,
    fallbackGuideKey,
    guideRequired,
  }
}
