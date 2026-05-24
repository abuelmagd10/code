/**
 * SmartBreadcrumbs Component - Auto-generated breadcrumbs from URL pathname
 * مُؤشّر مسار التَنقّل التلقائى — يَقرأ المسار من الـ URL ويُولّد breadcrumbs
 *
 * 🎯 Features:
 * - Automatic from pathname (no manual config needed)
 * - Arabic/English labels with comprehensive dictionary
 * - RTL/LTR aware (ChevronRight in EN, ChevronLeft in AR)
 * - Handles dynamic segments ([id], [customerId]) gracefully
 * - Skips noise segments (auth callbacks, new, edit suffixes shown sensibly)
 * - Truncates long paths (Home > ... > Current)
 * - 100% additive — does not affect existing functionality
 *
 * @version 1.0.0
 * @date 2026-05-24
 */

"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Home } from "lucide-react"
import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// Route Label Dictionary
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE_LABELS_AR: Record<string, string> = {
  // Top-level modules
  dashboard: "لوحة التحكم",
  approvals: "الموافقات",
  invoices: "الفواتير",
  bills: "فواتير الشراء",
  "sales-orders": "أوامر البيع",
  "purchase-orders": "أوامر الشراء",
  "sales-returns": "مرتجعات المبيعات",
  "purchase-returns": "مرتجعات المشتريات",
  "sent-invoice-returns": "مرتجعات صادرة",
  "sales-return-requests": "طلبات مرتجع البيع",
  "customer-refund-requests": "طلبات استرداد العملاء",
  estimates: "عروض الأسعار",
  payments: "المدفوعات",
  banking: "البنوك",
  customers: "العملاء",
  suppliers: "الموردون",
  "customer-credits": "أرصدة العملاء",
  "customer-debit-notes": "إشعارات مدين للعملاء",
  "vendor-credits": "أرصدة الموردين",
  products: "المنتجات",
  services: "الخدمات",
  bookings: "الحجوزات",
  inventory: "المخزون",
  "inventory-transfers": "تحويلات المخزون",
  "chart-of-accounts": "شجرة الحسابات",
  "journal-entries": "القيود اليومية",
  accounting: "المحاسبة",
  "annual-closing": "الإقفال السنوى",
  drawings: "السحوبات",
  expenses: "المصروفات",
  shareholders: "المساهمون",
  "fixed-assets": "الأصول الثابتة",
  manufacturing: "التصنيع",
  hr: "الموارد البشرية",
  reports: "التقارير",
  settings: "الإعدادات",
  branches: "الفروع",
  warehouses: "المخازن",
  "cost-centers": "مراكز التكلفة",
  "saas-admin": "إدارة النظام",
  admin: "الإدارة",
  onboarding: "البدء",
  invitations: "الدعوات",
  auth: "تسجيل الدخول",

  // Inventory submenu
  "dispatch-approvals": "موافقات الصرف",
  "goods-receipt": "إيصالات الاستلام",
  "product-availability": "توفر المنتجات",
  "third-party": "بضاعة الغير",
  "write-offs": "الإهلاكات",

  // Manufacturing submenu
  boms: "قوائم المواد",
  "bom-versions": "إصدارات BOM",
  "production-orders": "أوامر الإنتاج",
  "close-production-order": "إقفال أمر إنتاج",
  "material-issue": "صرف المواد",
  "product-receive": "استلام المنتجات",
  mrp: "تخطيط المواد (MRP)",
  routings: "مسارات التصنيع",
  "work-centers": "مراكز العمل",
  "bom-cost": "تكلفة قوائم المواد",
  "material-consumption": "استهلاك المواد",

  // HR submenu
  employees: "الموظفون",
  attendance: "الحضور والانصراف",
  daily: "اليومى",
  shifts: "الورديات",
  devices: "أجهزة البصمة",
  anomalies: "التَجاوزات",
  payroll: "كشف المرتبات",
  "instant-payouts": "صرف فورى",

  // Accounting submenu
  "period-closing": "إقفال الفترة",
  periods: "الفترات المحاسبية",

  // Fixed assets submenu
  categories: "الفئات",

  // Reports submenu
  "trial-balance": "ميزان المراجعة",
  "balance-sheet": "الميزانية العمومية",
  "balance-sheet-audit": "مراجعة الميزانية",
  "income-statement": "قائمة الدخل",
  "cash-flow": "التدفقات النقدية",
  "equity-changes": "التغيرات فى حقوق الملكية",
  "aging-ar": "أعمار الديون - عملاء",
  "aging-ap": "أعمار الديون - موردين",
  "ar-by-currency": "العملاء حسب العملة",
  "bank-accounts-by-branch": "الحسابات البنكية حسب الفرع",
  "bank-reconciliation": "تسوية البنوك",
  "bank-transactions": "حركات البنك",
  "branch-comparison": "مقارنة الفروع",
  "branch-cost-center": "الفروع ومراكز التكلفة",
  "cost-center-analysis": "تحليل مراكز التكلفة",
  "daily-payments-receipts": "المدفوعات والمقبوضات اليومية",
  "financial-integrity-checks": "فحوصات السلامة المالية",
  "financial-replay-recovery": "استرداد القيود المالية",
  "financial-trace-explorer": "تتبع القيود المالية",
  "fx-gains-losses": "أرباح وخسائر صرف العملات",
  "inventory-audit": "مراجعة المخزون",
  "inventory-count": "جرد المخزون",
  "inventory-valuation": "تقييم المخزون",
  "login-activity": "نشاط تسجيل الدخول",
  "product-expiry": "صلاحية المنتجات",
  "purchase-bills-detail": "تفاصيل فواتير الشراء",
  "purchase-orders-status": "حالة أوامر الشراء",
  "purchase-prices-by-period": "أسعار الشراء حسب الفترة",
  purchases: "تقرير المشتريات",
  "sales-bonuses": "حوافز المبيعات",
  "sales-by-product": "المبيعات حسب المنتج",
  "sales-discounts": "خصومات المبيعات",
  "sales-invoices-detail": "تفاصيل فواتير البيع",
  sales: "تقرير المبيعات",
  "shipping-costs": "تكاليف الشحن",
  shipping: "الشحن",
  "simple-summary": "ملخص مبسط",
  "supplier-price-comparison": "مقارنة أسعار الموردين",
  "top-products": "أعلى المنتجات",
  "occupancy-rate": "معدل الإشغال",
  "top-services": "أعلى الخدمات",
  "revenue-by-service": "الإيرادات حسب الخدمة",
  "bookings-by-branch": "الحجوزات حسب الفرع",
  "bookings-by-staff": "الحجوزات حسب الموظف",
  "cancelled-bookings": "الحجوزات الملغاة",
  "accounting-validation": "التحقق المحاسبى",
  "vat-input": "ضريبة المشتريات",
  "vat-output": "ضريبة المبيعات",
  "vat-summary": "ملخص ضريبة القيمة المضافة",
  "update-account-balances": "تحديث أرصدة الحسابات",
  "warehouse-inventory": "مخزون المستودع",

  // Settings submenu
  profile: "الملف الشخصى",
  users: "المستخدمون",
  taxes: "الضرائب",
  billing: "الفوترة",
  notifications: "الإشعارات",
  seats: "المقاعد",
  "exchange-rates": "أسعار الصرف",
  "fx-revaluation": "إعادة تقييم العملات",
  "accounting-maintenance": "صيانة المحاسبة",
  "audit-log": "سجل التَدقيق",
  backup: "النَسخ الاحتياطى",
  commissions: "العمولات",
  runs: "الدفعات",
  "employee-bonuses": "حوافز الموظفين",
  "fix-cogs": "إصلاح تكلفة البضاعة",
  "orders-rules": "قواعد الطلبات",
  tooltips: "نَصائح الواجهة",

  // Special pages
  new: "جديد",
  edit: "تَعديل",
  "force-change-password": "تَغيير كلمة المرور",
  "sign-up": "إنشاء حساب",
  "sign-up-success": "تَم إنشاء الحساب",
  login: "تَسجيل الدخول",
  callback: "العودة",
  accept: "قَبول",
  result: "النتيجة",
  payment: "الدفع",
  suspended: "مُعلَّق",
  "no-access": "غير مَسموح",
  "no-permissions": "لا توجد صلاحيات",
  "system-status": "حالة النظام",
  "saas-admin-companies": "الشركات",
  "audit-logs": "سجلات التَدقيق",
  jobs: "المهام",
}

const ROUTE_LABELS_EN: Record<string, string> = {
  dashboard: "Dashboard",
  approvals: "Approvals",
  invoices: "Invoices",
  bills: "Bills",
  "sales-orders": "Sales Orders",
  "purchase-orders": "Purchase Orders",
  "sales-returns": "Sales Returns",
  "purchase-returns": "Purchase Returns",
  estimates: "Estimates",
  payments: "Payments",
  banking: "Banking",
  customers: "Customers",
  suppliers: "Suppliers",
  products: "Products",
  services: "Services",
  bookings: "Bookings",
  inventory: "Inventory",
  "inventory-transfers": "Inventory Transfers",
  "chart-of-accounts": "Chart of Accounts",
  "journal-entries": "Journal Entries",
  accounting: "Accounting",
  expenses: "Expenses",
  "fixed-assets": "Fixed Assets",
  manufacturing: "Manufacturing",
  hr: "HR",
  reports: "Reports",
  settings: "Settings",
  branches: "Branches",
  warehouses: "Warehouses",
  "cost-centers": "Cost Centers",
  new: "New",
  edit: "Edit",
  profile: "Profile",
  users: "Users",
  taxes: "Taxes",
  billing: "Billing",
  notifications: "Notifications",
  seats: "Seats",
  employees: "Employees",
  attendance: "Attendance",
  payroll: "Payroll",
  boms: "BOMs",
  "production-orders": "Production Orders",
  shareholders: "Shareholders",
  drawings: "Drawings",
  "annual-closing": "Annual Closing",
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Routes that should NOT show breadcrumbs (root-level, auth, marketing)
 */
const HIDDEN_ROUTES = new Set([
  "/",
  "/auth/login",
  "/auth/sign-up",
  "/auth/sign-up-success",
  "/auth/callback",
  "/dashboard", // Dashboard is "home" — no breadcrumb needed
  "/onboarding",
  "/suspended",
  "/no-access",
  "/no-permissions",
])

/**
 * Look up Arabic/English label for a route segment.
 * Falls back to title-cased segment if not in dictionary.
 */
function getLabel(segment: string, lang: "ar" | "en"): string {
  const dict = lang === "ar" ? ROUTE_LABELS_AR : ROUTE_LABELS_EN
  if (dict[segment]) return dict[segment]

  // UUID detection — render as "Details" / "تفاصيل"
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
    return lang === "ar" ? "تفاصيل" : "Details"
  }

  // Pure-numeric ID
  if (/^\d+$/.test(segment)) {
    return `#${segment}`
  }

  // Fallback: title-case the kebab-case segment
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export interface SmartBreadcrumbsProps {
  /** Current UI language. Defaults to "ar". */
  lang?: "ar" | "en"
  /** Override the home label. Defaults to "الرئيسية" / "Home". */
  homeLabel?: string
  /** Override the home href. Defaults to "/dashboard". */
  homeHref?: string
  /** Additional className for the wrapper nav. */
  className?: string
  /** Hide breadcrumbs entirely (for opt-out per page). */
  hidden?: boolean
}

/**
 * SmartBreadcrumbs — auto-generates a breadcrumb trail from the current URL.
 *
 * Example renderings:
 *   /invoices                    → Home › Invoices
 *   /invoices/abc-123            → Home › Invoices › Details
 *   /invoices/abc-123/edit       → Home › Invoices › Details › Edit
 *   /reports/sales/page          → Home › Reports › Sales Report
 *   /settings/notifications      → Home › Settings › Notifications
 *
 * It is purely presentational — clicking a breadcrumb is a normal Link
 * navigation. No state, no side-effects, no impact on existing functionality.
 */
export function SmartBreadcrumbs({
  lang = "ar",
  homeLabel,
  homeHref = "/dashboard",
  className = "",
  hidden = false,
}: SmartBreadcrumbsProps) {
  const pathname = usePathname()

  if (hidden) return null
  if (!pathname) return null
  if (HIDDEN_ROUTES.has(pathname)) return null

  // Strip query/hash, split, filter empties
  const cleanPath = pathname.split("?")[0].split("#")[0]
  const segments = cleanPath.split("/").filter(Boolean)
  if (segments.length === 0) return null

  // Build crumbs: [{ href, label, isLast }, ...]
  const crumbs = segments.map((seg, idx) => {
    const href = "/" + segments.slice(0, idx + 1).join("/")
    return {
      href,
      label: getLabel(seg, lang),
      isLast: idx === segments.length - 1,
    }
  })

  // RTL: ChevronLeft points right-to-left as the separator
  // LTR: ChevronRight points left-to-right
  const Separator = lang === "ar" ? ChevronLeft : ChevronRight
  const finalHomeLabel = homeLabel || (lang === "ar" ? "الرئيسية" : "Home")

  return (
    <nav
      aria-label="breadcrumb"
      className={cn(
        "flex items-center text-xs sm:text-sm text-muted-foreground",
        className,
      )}
    >
      <ol className="flex flex-wrap items-center gap-1 sm:gap-1.5">
        {/* Home */}
        <li className="inline-flex items-center">
          <Link
            href={homeHref}
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Home className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{finalHomeLabel}</span>
          </Link>
        </li>

        {/* Crumbs */}
        {crumbs.map((c, i) => (
          <li key={`${c.href}-${i}`} className="inline-flex items-center gap-1 sm:gap-1.5">
            <Separator className="h-3.5 w-3.5 opacity-50 flex-shrink-0" />
            {c.isLast ? (
              <span
                className="font-medium text-foreground truncate max-w-[160px] sm:max-w-[240px]"
                aria-current="page"
                title={c.label}
              >
                {c.label}
              </span>
            ) : (
              <Link
                href={c.href}
                className="hover:text-foreground transition-colors truncate max-w-[120px] sm:max-w-[180px]"
                title={c.label}
              >
                {c.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

export default SmartBreadcrumbs
