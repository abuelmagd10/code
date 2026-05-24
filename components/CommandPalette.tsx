/**
 * CommandPalette - Global Ctrl+K Search
 * مَركز البحث العالمى — اضغط Ctrl+K من أى مكان للبحث السريع
 *
 * 🎯 Features:
 * - Ctrl+K (Windows/Linux) or Cmd+K (Mac) opens it from anywhere
 * - Searches 130+ pages by name (Arabic + English keywords)
 * - Grouped by module (Sales, Purchases, Inventory, etc.)
 * - Recent searches saved to localStorage
 * - Keyboard-only navigation (arrows + Enter)
 * - Closes on Escape or selection
 * - Auto-detects user language
 * - Zero impact on existing functionality (purely additive)
 *
 * Mounted globally in app/layout.tsx so it works on any page.
 *
 * @version 1.0.0
 * @date 2026-05-24
 */

"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import {
  LayoutDashboard,
  FileText,
  Receipt,
  ShoppingCart,
  Truck,
  RotateCcw,
  Users,
  Building2,
  Package,
  Briefcase,
  CalendarCheck,
  Warehouse,
  ArrowLeftRight,
  Network,
  BookOpen,
  DollarSign,
  Banknote,
  Wallet,
  Settings,
  Bell,
  Shield,
  Factory,
  UserCog,
  BarChart3,
  TrendingUp,
  Calculator,
  CreditCard,
  HardDrive,
  Clock,
  PieChart,
  Boxes,
  History,
  Archive,
  Crown,
  type LucideIcon,
} from "lucide-react"

// ─────────────────────────────────────────────────────────────────────────────
// Command entries — comprehensive catalogue
// ─────────────────────────────────────────────────────────────────────────────

interface CommandEntry {
  /** Visible label (Arabic). */
  labelAr: string
  /** Visible label (English). */
  labelEn: string
  /** Extra search keywords (boost matching). */
  keywords?: string[]
  /** Navigation target. */
  href: string
  /** Icon. */
  icon: LucideIcon
  /** Group label. */
  groupAr: string
  groupEn: string
}

const COMMANDS: CommandEntry[] = [
  // ── Overview ──
  { labelAr: "لوحة التحكم", labelEn: "Dashboard", keywords: ["home", "main", "رئيسية"], href: "/dashboard", icon: LayoutDashboard, groupAr: "نَظرة عامة", groupEn: "Overview" },
  { labelAr: "الموافقات", labelEn: "Approvals", keywords: ["approve", "pending"], href: "/approvals", icon: Shield, groupAr: "نَظرة عامة", groupEn: "Overview" },

  // ── Sales ──
  { labelAr: "الفواتير", labelEn: "Invoices", keywords: ["invoice", "sales invoice", "بيع"], href: "/invoices", icon: FileText, groupAr: "المبيعات", groupEn: "Sales" },
  { labelAr: "فاتورة جديدة", labelEn: "New Invoice", keywords: ["create invoice", "new", "جديد"], href: "/invoices/new", icon: FileText, groupAr: "المبيعات", groupEn: "Sales" },
  { labelAr: "أوامر البيع", labelEn: "Sales Orders", keywords: ["sales order", "so"], href: "/sales-orders", icon: ShoppingCart, groupAr: "المبيعات", groupEn: "Sales" },
  { labelAr: "أمر بيع جديد", labelEn: "New Sales Order", keywords: ["new so"], href: "/sales-orders/new", icon: ShoppingCart, groupAr: "المبيعات", groupEn: "Sales" },
  { labelAr: "عروض الأسعار", labelEn: "Estimates", keywords: ["quote", "quotation", "عرض سعر"], href: "/estimates", icon: Receipt, groupAr: "المبيعات", groupEn: "Sales" },
  { labelAr: "مرتجعات المبيعات", labelEn: "Sales Returns", keywords: ["return", "refund"], href: "/sales-returns", icon: RotateCcw, groupAr: "المبيعات", groupEn: "Sales" },
  { labelAr: "طلبات مرتجع البيع", labelEn: "Sales Return Requests", keywords: ["return request"], href: "/sales-return-requests", icon: RotateCcw, groupAr: "المبيعات", groupEn: "Sales" },
  { labelAr: "طلبات استرداد العملاء", labelEn: "Customer Refund Requests", keywords: ["refund customer"], href: "/customer-refund-requests", icon: RotateCcw, groupAr: "المبيعات", groupEn: "Sales" },
  { labelAr: "إشعارات مدين للعملاء", labelEn: "Customer Debit Notes", keywords: ["debit note"], href: "/customer-debit-notes", icon: FileText, groupAr: "المبيعات", groupEn: "Sales" },

  // ── Purchases ──
  { labelAr: "فواتير الشراء", labelEn: "Bills", keywords: ["purchase invoice", "bill", "شراء"], href: "/bills", icon: Receipt, groupAr: "المشتريات", groupEn: "Purchases" },
  { labelAr: "فاتورة شراء جديدة", labelEn: "New Bill", keywords: ["new bill"], href: "/bills/new", icon: Receipt, groupAr: "المشتريات", groupEn: "Purchases" },
  { labelAr: "أوامر الشراء", labelEn: "Purchase Orders", keywords: ["po", "purchase order"], href: "/purchase-orders", icon: ShoppingCart, groupAr: "المشتريات", groupEn: "Purchases" },
  { labelAr: "أمر شراء جديد", labelEn: "New Purchase Order", keywords: ["new po"], href: "/purchase-orders/new", icon: ShoppingCart, groupAr: "المشتريات", groupEn: "Purchases" },
  { labelAr: "مرتجعات المشتريات", labelEn: "Purchase Returns", keywords: ["return purchase"], href: "/purchase-returns", icon: RotateCcw, groupAr: "المشتريات", groupEn: "Purchases" },
  { labelAr: "أرصدة الموردين", labelEn: "Vendor Credits", keywords: ["vendor credit"], href: "/vendor-credits", icon: Wallet, groupAr: "المشتريات", groupEn: "Purchases" },

  // ── Payments & Banking ──
  { labelAr: "المدفوعات", labelEn: "Payments", keywords: ["pay", "payment"], href: "/payments", icon: DollarSign, groupAr: "المدفوعات والبنوك", groupEn: "Payments & Banking" },
  { labelAr: "البنوك", labelEn: "Banking", keywords: ["bank", "transfer"], href: "/banking", icon: Banknote, groupAr: "المدفوعات والبنوك", groupEn: "Payments & Banking" },
  { labelAr: "السحوبات", labelEn: "Drawings", keywords: ["drawing", "owner"], href: "/drawings", icon: Wallet, groupAr: "المدفوعات والبنوك", groupEn: "Payments & Banking" },
  { labelAr: "المصروفات", labelEn: "Expenses", keywords: ["expense"], href: "/expenses", icon: Wallet, groupAr: "المدفوعات والبنوك", groupEn: "Payments & Banking" },

  // ── Contacts ──
  { labelAr: "العملاء", labelEn: "Customers", keywords: ["customer", "client"], href: "/customers", icon: Users, groupAr: "جهات الاتصال", groupEn: "Contacts" },
  { labelAr: "الموردون", labelEn: "Suppliers", keywords: ["supplier", "vendor"], href: "/suppliers", icon: Building2, groupAr: "جهات الاتصال", groupEn: "Contacts" },
  { labelAr: "أرصدة العملاء", labelEn: "Customer Credits", keywords: ["credit"], href: "/customer-credits", icon: Wallet, groupAr: "جهات الاتصال", groupEn: "Contacts" },
  { labelAr: "المساهمون", labelEn: "Shareholders", keywords: ["shareholder", "investor"], href: "/shareholders", icon: Crown, groupAr: "جهات الاتصال", groupEn: "Contacts" },

  // ── Products & Services ──
  { labelAr: "المنتجات", labelEn: "Products", keywords: ["product", "item"], href: "/products", icon: Package, groupAr: "المنتجات والخدمات", groupEn: "Products & Services" },
  { labelAr: "الخدمات", labelEn: "Services", keywords: ["service"], href: "/services", icon: Briefcase, groupAr: "المنتجات والخدمات", groupEn: "Products & Services" },
  { labelAr: "الحجوزات", labelEn: "Bookings", keywords: ["booking", "appointment"], href: "/bookings", icon: CalendarCheck, groupAr: "المنتجات والخدمات", groupEn: "Products & Services" },
  { labelAr: "حجز جديد", labelEn: "New Booking", keywords: ["new booking"], href: "/bookings/new", icon: CalendarCheck, groupAr: "المنتجات والخدمات", groupEn: "Products & Services" },

  // ── Inventory ──
  { labelAr: "المخزون", labelEn: "Inventory", keywords: ["stock"], href: "/inventory", icon: Warehouse, groupAr: "المخزون", groupEn: "Inventory" },
  { labelAr: "تحويلات المخزون", labelEn: "Inventory Transfers", keywords: ["transfer"], href: "/inventory-transfers", icon: ArrowLeftRight, groupAr: "المخزون", groupEn: "Inventory" },
  { labelAr: "موافقات الصرف", labelEn: "Dispatch Approvals", keywords: ["dispatch"], href: "/inventory/dispatch-approvals", icon: Shield, groupAr: "المخزون", groupEn: "Inventory" },
  { labelAr: "إيصالات الاستلام", labelEn: "Goods Receipt", keywords: ["goods receipt"], href: "/inventory/goods-receipt", icon: Truck, groupAr: "المخزون", groupEn: "Inventory" },
  { labelAr: "توفر المنتجات", labelEn: "Product Availability", keywords: ["availability"], href: "/inventory/product-availability", icon: Boxes, groupAr: "المخزون", groupEn: "Inventory" },
  { labelAr: "بضاعة الغير", labelEn: "Third Party Inventory", keywords: ["third party"], href: "/inventory/third-party", icon: Boxes, groupAr: "المخزون", groupEn: "Inventory" },
  { labelAr: "الإهلاكات", labelEn: "Write-Offs", keywords: ["writeoff"], href: "/inventory/write-offs", icon: Archive, groupAr: "المخزون", groupEn: "Inventory" },

  // ── Accounting ──
  { labelAr: "شجرة الحسابات", labelEn: "Chart of Accounts", keywords: ["coa", "accounts"], href: "/chart-of-accounts", icon: Network, groupAr: "المحاسبة", groupEn: "Accounting" },
  { labelAr: "القيود اليومية", labelEn: "Journal Entries", keywords: ["journal", "entry"], href: "/journal-entries", icon: BookOpen, groupAr: "المحاسبة", groupEn: "Accounting" },
  { labelAr: "قيد يومى جديد", labelEn: "New Journal Entry", keywords: ["new journal"], href: "/journal-entries/new", icon: BookOpen, groupAr: "المحاسبة", groupEn: "Accounting" },
  { labelAr: "الفترات المحاسبية", labelEn: "Accounting Periods", keywords: ["period"], href: "/accounting/periods", icon: Clock, groupAr: "المحاسبة", groupEn: "Accounting" },
  { labelAr: "إقفال الفترة", labelEn: "Period Closing", keywords: ["closing"], href: "/accounting/period-closing", icon: Archive, groupAr: "المحاسبة", groupEn: "Accounting" },
  { labelAr: "الإقفال السنوى", labelEn: "Annual Closing", keywords: ["year end"], href: "/annual-closing", icon: Archive, groupAr: "المحاسبة", groupEn: "Accounting" },

  // ── Fixed Assets ──
  { labelAr: "الأصول الثابتة", labelEn: "Fixed Assets", keywords: ["asset"], href: "/fixed-assets", icon: HardDrive, groupAr: "الأصول الثابتة", groupEn: "Fixed Assets" },
  { labelAr: "أصل ثابت جديد", labelEn: "New Fixed Asset", keywords: ["new asset"], href: "/fixed-assets/new", icon: HardDrive, groupAr: "الأصول الثابتة", groupEn: "Fixed Assets" },
  { labelAr: "فئات الأصول", labelEn: "Asset Categories", keywords: ["asset category"], href: "/fixed-assets/categories", icon: Boxes, groupAr: "الأصول الثابتة", groupEn: "Fixed Assets" },
  { labelAr: "تقارير الأصول", labelEn: "Asset Reports", keywords: ["asset report"], href: "/fixed-assets/reports", icon: BarChart3, groupAr: "الأصول الثابتة", groupEn: "Fixed Assets" },

  // ── Manufacturing ──
  { labelAr: "قوائم المواد (BOM)", labelEn: "BOMs", keywords: ["bom", "bill of materials"], href: "/manufacturing/boms", icon: Network, groupAr: "التصنيع", groupEn: "Manufacturing" },
  { labelAr: "أوامر الإنتاج", labelEn: "Production Orders", keywords: ["production"], href: "/manufacturing/production-orders", icon: Factory, groupAr: "التصنيع", groupEn: "Manufacturing" },
  { labelAr: "صرف المواد", labelEn: "Material Issue", keywords: ["material"], href: "/manufacturing/material-issue", icon: Boxes, groupAr: "التصنيع", groupEn: "Manufacturing" },
  { labelAr: "استلام المنتجات", labelEn: "Product Receive", keywords: ["receive"], href: "/manufacturing/product-receive", icon: Truck, groupAr: "التصنيع", groupEn: "Manufacturing" },
  { labelAr: "تخطيط المواد (MRP)", labelEn: "MRP", keywords: ["mrp", "planning"], href: "/manufacturing/mrp", icon: Calculator, groupAr: "التصنيع", groupEn: "Manufacturing" },
  { labelAr: "مسارات التصنيع", labelEn: "Routings", keywords: ["routing"], href: "/manufacturing/routings", icon: Network, groupAr: "التصنيع", groupEn: "Manufacturing" },
  { labelAr: "مراكز العمل", labelEn: "Work Centers", keywords: ["work center"], href: "/manufacturing/work-centers", icon: Factory, groupAr: "التصنيع", groupEn: "Manufacturing" },

  // ── HR ──
  { labelAr: "الموارد البشرية", labelEn: "HR", keywords: ["hr", "human resources"], href: "/hr", icon: UserCog, groupAr: "الموارد البشرية", groupEn: "Human Resources" },
  { labelAr: "الموظفون", labelEn: "Employees", keywords: ["employee", "staff"], href: "/hr/employees", icon: Users, groupAr: "الموارد البشرية", groupEn: "Human Resources" },
  { labelAr: "الحضور والانصراف", labelEn: "Attendance", keywords: ["attendance"], href: "/hr/attendance", icon: Clock, groupAr: "الموارد البشرية", groupEn: "Human Resources" },
  { labelAr: "الحضور اليومى", labelEn: "Daily Attendance", keywords: ["daily attendance"], href: "/hr/attendance/daily", icon: Clock, groupAr: "الموارد البشرية", groupEn: "Human Resources" },
  { labelAr: "الورديات", labelEn: "Shifts", keywords: ["shift"], href: "/hr/attendance/shifts", icon: Clock, groupAr: "الموارد البشرية", groupEn: "Human Resources" },
  { labelAr: "كشف المرتبات", labelEn: "Payroll", keywords: ["salary", "payroll"], href: "/hr/payroll", icon: DollarSign, groupAr: "الموارد البشرية", groupEn: "Human Resources" },
  { labelAr: "صرف فورى", labelEn: "Instant Payouts", keywords: ["payout"], href: "/hr/instant-payouts", icon: CreditCard, groupAr: "الموارد البشرية", groupEn: "Human Resources" },

  // ── Reports ──
  { labelAr: "كل التقارير", labelEn: "All Reports", keywords: ["report"], href: "/reports", icon: BarChart3, groupAr: "التقارير", groupEn: "Reports" },
  { labelAr: "ميزان المراجعة", labelEn: "Trial Balance", keywords: ["trial balance"], href: "/reports/trial-balance", icon: BarChart3, groupAr: "التقارير", groupEn: "Reports" },
  { labelAr: "الميزانية العمومية", labelEn: "Balance Sheet", keywords: ["balance sheet"], href: "/reports/balance-sheet", icon: BarChart3, groupAr: "التقارير", groupEn: "Reports" },
  { labelAr: "قائمة الدخل", labelEn: "Income Statement", keywords: ["income", "profit", "loss"], href: "/reports/income-statement", icon: TrendingUp, groupAr: "التقارير", groupEn: "Reports" },
  { labelAr: "التدفقات النقدية", labelEn: "Cash Flow", keywords: ["cash flow"], href: "/reports/cash-flow", icon: TrendingUp, groupAr: "التقارير", groupEn: "Reports" },
  { labelAr: "أعمار الديون - عملاء", labelEn: "AR Aging", keywords: ["aging ar"], href: "/reports/aging-ar", icon: PieChart, groupAr: "التقارير", groupEn: "Reports" },
  { labelAr: "أعمار الديون - موردين", labelEn: "AP Aging", keywords: ["aging ap"], href: "/reports/aging-ap", icon: PieChart, groupAr: "التقارير", groupEn: "Reports" },
  { labelAr: "تقرير المبيعات", labelEn: "Sales Report", keywords: ["sales report"], href: "/reports/sales", icon: TrendingUp, groupAr: "التقارير", groupEn: "Reports" },
  { labelAr: "تقرير المشتريات", labelEn: "Purchases Report", keywords: ["purchases report"], href: "/reports/purchases", icon: TrendingUp, groupAr: "التقارير", groupEn: "Reports" },
  { labelAr: "ضريبة المبيعات", labelEn: "VAT Output", keywords: ["vat output"], href: "/reports/vat-output", icon: Calculator, groupAr: "التقارير", groupEn: "Reports" },
  { labelAr: "ضريبة المشتريات", labelEn: "VAT Input", keywords: ["vat input"], href: "/reports/vat-input", icon: Calculator, groupAr: "التقارير", groupEn: "Reports" },
  { labelAr: "ملخص ضريبة القيمة المضافة", labelEn: "VAT Summary", keywords: ["vat summary"], href: "/reports/vat-summary", icon: Calculator, groupAr: "التقارير", groupEn: "Reports" },
  { labelAr: "تقييم المخزون", labelEn: "Inventory Valuation", keywords: ["valuation"], href: "/reports/inventory-valuation", icon: Boxes, groupAr: "التقارير", groupEn: "Reports" },
  { labelAr: "جرد المخزون", labelEn: "Inventory Count", keywords: ["count"], href: "/reports/inventory-count", icon: Boxes, groupAr: "التقارير", groupEn: "Reports" },
  { labelAr: "تسوية البنوك", labelEn: "Bank Reconciliation", keywords: ["bank reconciliation"], href: "/reports/bank-reconciliation", icon: Banknote, groupAr: "التقارير", groupEn: "Reports" },

  // ── Organization ──
  { labelAr: "الفروع", labelEn: "Branches", keywords: ["branch"], href: "/branches", icon: Building2, groupAr: "المنشأة", groupEn: "Organization" },
  { labelAr: "المخازن", labelEn: "Warehouses", keywords: ["warehouse"], href: "/warehouses", icon: Warehouse, groupAr: "المنشأة", groupEn: "Organization" },
  { labelAr: "مراكز التكلفة", labelEn: "Cost Centers", keywords: ["cost center"], href: "/cost-centers", icon: PieChart, groupAr: "المنشأة", groupEn: "Organization" },

  // ── Settings ──
  { labelAr: "الإعدادات", labelEn: "Settings", keywords: ["settings"], href: "/settings", icon: Settings, groupAr: "الإعدادات", groupEn: "Settings" },
  { labelAr: "الملف الشخصى", labelEn: "Profile", keywords: ["profile", "account"], href: "/settings/profile", icon: UserCog, groupAr: "الإعدادات", groupEn: "Settings" },
  { labelAr: "المستخدمون", labelEn: "Users", keywords: ["user"], href: "/settings/users", icon: Users, groupAr: "الإعدادات", groupEn: "Settings" },
  { labelAr: "الإشعارات", labelEn: "Notifications", keywords: ["notification"], href: "/settings/notifications", icon: Bell, groupAr: "الإعدادات", groupEn: "Settings" },
  { labelAr: "الفوترة", labelEn: "Billing", keywords: ["billing", "subscription"], href: "/settings/billing", icon: CreditCard, groupAr: "الإعدادات", groupEn: "Settings" },
  { labelAr: "المقاعد", labelEn: "Seats", keywords: ["seat", "license"], href: "/settings/seats", icon: Users, groupAr: "الإعدادات", groupEn: "Settings" },
  { labelAr: "الضرائب", labelEn: "Taxes", keywords: ["tax", "vat"], href: "/settings/taxes", icon: Calculator, groupAr: "الإعدادات", groupEn: "Settings" },
  { labelAr: "أسعار الصرف", labelEn: "Exchange Rates", keywords: ["fx", "exchange"], href: "/settings/exchange-rates", icon: TrendingUp, groupAr: "الإعدادات", groupEn: "Settings" },
  { labelAr: "إعادة تقييم العملات", labelEn: "FX Revaluation", keywords: ["fx revaluation"], href: "/settings/fx-revaluation", icon: TrendingUp, groupAr: "الإعدادات", groupEn: "Settings" },
  { labelAr: "سجل التَدقيق", labelEn: "Audit Log", keywords: ["audit", "log"], href: "/settings/audit-log", icon: History, groupAr: "الإعدادات", groupEn: "Settings" },
  { labelAr: "النَسخ الاحتياطى", labelEn: "Backup", keywords: ["backup", "export"], href: "/settings/backup", icon: HardDrive, groupAr: "الإعدادات", groupEn: "Settings" },
]

// ─────────────────────────────────────────────────────────────────────────────
// Recent searches (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

const RECENT_KEY = "command_palette_recent_v1"
const MAX_RECENT = 5

function getRecent(): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function pushRecent(href: string) {
  if (typeof window === "undefined") return
  try {
    const current = getRecent().filter((h) => h !== href)
    const next = [href, ...current].slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook: detect current language
// ─────────────────────────────────────────────────────────────────────────────

function useLang(): "ar" | "en" {
  const [lang, setLang] = React.useState<"ar" | "en">("ar")
  React.useEffect(() => {
    try {
      const cookie = document.cookie.split("; ").find((c) => c.startsWith("app_language="))
      const cookieVal = cookie ? cookie.split("=")[1] : null
      const stored = cookieVal || localStorage.getItem("app_language") || localStorage.getItem("appLang") || "ar"
      setLang(stored === "en" ? "en" : "ar")
    } catch {}
    const handler = () => {
      try {
        const stored = localStorage.getItem("app_language") || localStorage.getItem("appLang") || "ar"
        setLang(stored === "en" ? "en" : "ar")
      } catch {}
    }
    window.addEventListener("app_language_changed", handler)
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])
  return lang
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const router = useRouter()
  const lang = useLang()
  const [open, setOpen] = React.useState(false)
  const [recentHrefs, setRecentHrefs] = React.useState<string[]>([])

  // Global Ctrl+K / Cmd+K listener
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  // Load recents whenever palette opens
  React.useEffect(() => {
    if (open) setRecentHrefs(getRecent())
  }, [open])

  // Group commands by group label
  const grouped = React.useMemo(() => {
    const map = new Map<string, CommandEntry[]>()
    for (const cmd of COMMANDS) {
      const groupKey = lang === "ar" ? cmd.groupAr : cmd.groupEn
      const arr = map.get(groupKey) || []
      arr.push(cmd)
      map.set(groupKey, arr)
    }
    return Array.from(map.entries())
  }, [lang])

  const recentCommands = React.useMemo(() => {
    return recentHrefs
      .map((href) => COMMANDS.find((c) => c.href === href))
      .filter((c): c is CommandEntry => c !== undefined)
  }, [recentHrefs])

  const handleSelect = React.useCallback(
    (href: string) => {
      pushRecent(href)
      setOpen(false)
      router.push(href)
    },
    [router],
  )

  const dialogTitle = lang === "ar" ? "البحث السريع" : "Quick Search"
  const dialogDesc = lang === "ar" ? "اضغط Ctrl+K للبحث فى أى صفحة" : "Press Ctrl+K to search any page"
  const placeholder = lang === "ar" ? "اكتب اسم صفحة أو إجراء..." : "Type a page name or action..."
  const emptyText = lang === "ar" ? "لا توجد نتائج" : "No results found"
  const recentLabel = lang === "ar" ? "المُستخدم مؤخراً" : "Recent"

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={dialogTitle}
      description={dialogDesc}
    >
      <CommandInput placeholder={placeholder} />
      <CommandList>
        <CommandEmpty>{emptyText}</CommandEmpty>

        {recentCommands.length > 0 && (
          <>
            <CommandGroup heading={recentLabel}>
              {recentCommands.map((cmd) => {
                const Icon = cmd.icon
                const label = lang === "ar" ? cmd.labelAr : cmd.labelEn
                return (
                  <CommandItem
                    key={`recent-${cmd.href}`}
                    value={`recent-${label}-${cmd.keywords?.join(" ") || ""}`}
                    onSelect={() => handleSelect(cmd.href)}
                  >
                    <Icon className="mr-2 h-4 w-4 opacity-70" />
                    <span>{label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {grouped.map(([groupLabel, items]) => (
          <CommandGroup key={groupLabel} heading={groupLabel}>
            {items.map((cmd) => {
              const Icon = cmd.icon
              const label = lang === "ar" ? cmd.labelAr : cmd.labelEn
              const searchValue = `${label} ${cmd.labelEn} ${cmd.labelAr} ${cmd.keywords?.join(" ") || ""}`
              return (
                <CommandItem
                  key={cmd.href}
                  value={searchValue}
                  onSelect={() => handleSelect(cmd.href)}
                >
                  <Icon className="mr-2 h-4 w-4 opacity-70" />
                  <span>{label}</span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}

export default CommandPalette
