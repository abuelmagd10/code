"use client"

import { useState, useEffect, useTransition } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Download, BarChart3 } from "lucide-react"
import Link from "next/link"

export default function ReportsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  useEffect(() => {
    setIsLoading(false)
  }, [])
  const [search, setSearch] = useState("")

  // 🚀 تحسين الأداء - استخدام useTransition للبحث
  const [isPending, startTransition] = useTransition()
  const t = (en: string, ar: string) => (appLang === 'en' ? en : ar)
  const groups = [
    {
      title: t('Simple Reports (Non-Accountants)', 'التقارير المبسطة (لغير المحاسبين)'),
      items: [
        { title: t('Financial Summary', 'ملخص النشاط المالي'), description: t('Simple report explaining how money flows in the business', 'تقرير مبسط يشرح كيف تتحرك الأموال في المشروع'), href: "/reports/simple-summary", icon: "📊" },
      ],
    },
    {
      title: t('Financial Reports', 'التقارير المالية'),
      items: [
        { title: t('Income Statement', 'قائمة الدخل'), description: t('Statement of revenues and expenses', 'قائمة الإيرادات والمصروفات'), href: "/reports/income-statement", icon: "📈" },
        { title: t('Balance Sheet', 'الميزانية العمومية'), description: t('Assets, liabilities, and equity', 'الأصول والالتزامات وحقوق الملكية'), href: "/reports/balance-sheet", icon: "📊" },
        { title: t('Statement of Changes in Equity', 'قائمة التغيرات في حقوق الملكية'), description: t('Equity movements analysis', 'تحليل حركات حقوق الملكية'), href: "/reports/equity-changes", icon: "📉" },
        { title: t('Cash Flow Statement', 'التدفقات النقدية'), description: t('Operating/Investing/Financing cash flows', 'التدفقات التشغيلية/الاستثمارية/التمويلية'), href: "/reports/cash-flow", icon: "💧" },
        { title: t('Trial Balance', 'ميزان المراجعة'), description: t('Balances of all accounts', 'أرصدة جميع الحسابات'), href: "/reports/trial-balance", icon: "⚖️" },
        { title: t('General Ledger', 'كشف الحسابات'), description: t('Journal entries by account', 'قيود اليومية حسب الحساب'), href: "/journal-entries", icon: "📚" },
        { title: t('VAT – Output', 'ضريبة المخرجات'), description: t('Sales VAT report', 'تقرير ضريبة المخرجات'), href: "/reports/vat-output", icon: "🧾" },
        { title: t('VAT – Input', 'ضريبة المدخلات'), description: t('Purchases VAT report', 'تقرير ضريبة المدخلات'), href: "/reports/vat-input", icon: "🧾" },
        { title: t('VAT Summary', 'ملخص الضريبة'), description: t('Period VAT summary', 'ملخص الضريبة للفترة'), href: "/reports/vat-summary", icon: "🧮" },
      ],
    },
    {
      title: t('Sales Reports', 'تقارير المبيعات'),
      items: [
        { title: t('Sales by Period', 'تقرير المبيعات اليومي/الأسبوعي/الشهري'), description: t('Sales analysis by period', 'تحليل المبيعات حسب الفترة'), href: "/reports/sales", icon: "💰" },
        { title: t('Sales by Customer', 'تقرير المبيعات حسب العميل'), description: t('Customer-based sales', 'المبيعات حسب العميل'), href: "/reports/sales", icon: "👤" },
        { title: t('Top Customers', 'العملاء الأكثر شراءً'), description: t('Top buyers ranking', 'ترتيب العملاء الأكثر شراءً'), href: "/reports/sales", icon: "🏆" },
        { title: t('Sales by Product', 'تقرير المبيعات حسب المنتج'), description: t('Product-based sales', 'المبيعات حسب المنتج'), href: "/reports/sales-by-product", icon: "📦" },
        { title: t('Top Products', 'الأصناف الأكثر مبيعًا'), description: t('Best selling items', 'الأصناف الأعلى مبيعًا'), href: "/reports/top-products", icon: "⭐" },
        { title: t('Sales Discounts', 'تقرير خصومات المبيعات'), description: t('Discounts analysis', 'تحليل الخصومات'), href: "/reports/sales-discounts", icon: "🏷️" },
        { title: t('Outstanding/Unpaid Invoices', 'تقرير فواتير المبيعات المستحقة وغير المدفوعة'), description: t('Receivables status', 'حالة الذمم المدينة'), href: "/reports/invoices", icon: "🧾" },
        { title: t('Sales Invoices Detail', 'تفصيل فواتير المبيعات'), description: t('Detailed list with filters', 'قائمة تفصيلية مع فلاتر'), href: "/reports/sales-invoices-detail", icon: "🧾" },
      ],
    },
    {
      title: t('Purchase Reports', 'تقارير المشتريات'),
      items: [
        { title: t('Purchases by Supplier', 'تقرير المشتريات حسب المورد'), description: t('Supplier-based purchases', 'المشتريات حسب المورد'), href: "/reports/purchases", icon: "🏪" },
        { title: t('Purchase Prices by Period', 'تقرير أسعار الشراء حسب الفترات'), description: t('Price trends', 'اتجاهات الأسعار'), href: "/reports/purchase-prices-by-period", icon: "📈" },
        { title: t('Supplier Bills Movement', 'حركة فواتير الموردين'), description: t('Bills movement', 'حركة الفواتير'), href: "/reports/purchase-bills-detail", icon: "🔁" },
        { title: t('Outstanding/Unpaid Bills', 'تقرير المشتريات المستحقة وغير المدفوعة'), description: t('Payables status', 'حالة الذمم الدائنة'), href: "/reports/aging-ap", icon: "🧮" },
        { title: t('Supplier Price Comparison', 'تقرير مقارنة أسعار المنتجات بين الموردين'), description: t('Compare supplier prices', 'مقارنة أسعار الموردين'), href: "/reports/supplier-price-comparison", icon: "⚖️" },
        { title: t('Purchase Bills Detail', 'تفصيل فواتير المشتريات'), description: t('Detailed list with filters', 'قائمة تفصيلية مع فلاتر'), href: "/reports/purchase-bills-detail", icon: "🧾" },
        { title: t('Purchase Orders Status', 'حالة أوامر الشراء'), description: t('PO status: unbilled, partial, full', 'حالة الأوامر: غير مفوتر، جزئي، كامل'), href: "/reports/purchase-orders-status", icon: "📋" },
      ],
    },
    {
      title: t('Inventory Reports', 'تقارير المخزون'),
      items: [
        { title: t('Current Stock Quantities', 'تقرير كميات المخزون الحالي'), description: t('Stock quantities', 'كميات المخزون الحالية'), href: "/inventory", icon: "📦" },
        { title: t('Low Stock', 'الأصناف منخفضة الكمية'), description: t('Low stock items', 'الأصناف ذات الكمية المنخفضة'), href: "/inventory", icon: "⚠️" },
        { title: t('Item Movement', 'حركة صنف'), description: t('Item movement by period', 'حركات الصنف حسب الفترة'), href: "/reports/inventory-audit", icon: "🔍" },
        { title: t('Inventory Count', 'تقرير جرد المخزون'), description: t('Count report', 'تقرير الجرد'), href: "/reports/inventory-count", icon: "📝" },
        { title: t('Product Expiry', 'تقرير صلاحيات المنتجات'), description: t('Expiry report', 'تقرير الصلاحيات'), href: "/reports/product-expiry", icon: "⏳" },
        { title: t('Inventory Valuation', 'تقرير تكلفة المخزون'), description: t('FIFO / Weighted Average', 'FIFO / متوسط مرجح'), href: "/reports/inventory-valuation", icon: "🧮" },
      ],
    },
    {
      title: t('HR & Payroll Reports', 'تقارير الموظفين والمرتبات'),
      items: [
        { title: t('Attendance', 'تقرير الحضور والانصراف لكل موظف'), description: t('Employee attendance report', 'تقرير حضور الموظفين'), href: "/hr/attendance", icon: "🗓️" },
        { title: t('Monthly Payroll', 'تقرير الرواتب الشهرية'), description: t('Payroll summary', 'ملخص الرواتب'), href: "/hr/payroll", icon: "💼" },
        { title: t('Sales Bonuses', 'بونصات المبيعات'), description: t('Sales commissions and bonuses report', 'تقرير عمولات وبونصات المبيعات'), href: "/reports/sales-bonuses", icon: "💰" },
        { title: t('Overtime', 'تقرير الساعات الإضافية'), description: t('Overtime details', 'تفاصيل الساعات الإضافية'), href: "/hr/payroll", icon: "⏰" },
        { title: t('Deductions & Allowances', 'تقرير الخصومات والبدلات'), description: t('Deductions/allowances', 'الخصومات والبدلات'), href: "/hr/payroll", icon: "➖➕" },
        { title: t('Employee Cost', 'تقرير تكلفة الموظفين للفترة'), description: t('Employee cost per period', 'تكلفة الموظفين حسب الفترة'), href: "/hr/payroll", icon: "📊" },
      ],
    },
    {
      title: t('Fixed Assets Reports', 'تقارير الأصول الثابتة'),
      items: [
        { title: t('Monthly Depreciation %', 'تقرير نسبة الإهلاك الشهري لكل أصل'), description: t('Depreciation % by asset', 'نسبة الإهلاك لكل أصل'), href: "/fixed-assets/reports?type=monthly_depreciation", icon: "📉" },
        { title: t('Asset Value (Before/After)', 'قيمة الأصل قبل الإهلاك وبعده'), description: t('Value before/after depreciation', 'القيمة قبل/بعد الإهلاك'), href: "/fixed-assets/reports?type=asset_value_before_after", icon: "💎" },
        { title: t('Remaining Useful Life', 'عمر الأصل المتبقي'), description: t('Remaining life', 'العمر المتبقي'), href: "/fixed-assets/reports?type=remaining_useful_life", icon: "⏳" },
        { title: t('Assets Revaluation', 'الزيادة والنقصان في قيمة الأصول'), description: t('Increase/decrease in value', 'زيادة/نقصان قيمة الأصول'), href: "/fixed-assets/reports?type=assets_revaluation", icon: "📈" },
        { title: t('Annual Depreciation Schedule', 'جدول الإهلاك السنوي'), description: t('Annual schedule', 'جدول سنوي'), href: "/fixed-assets/reports?type=annual_depreciation_schedule", icon: "📅" },
      ],
    },
    {
      title: t('Payments & Banking', 'تقارير المدفوعات والبنوك'),
      items: [
        { title: t('Daily Payments & Receipts', 'المدفوعات والمقبوضات اليومية'), description: t('Daily payment and receipt transactions', 'معاملات المدفوعات والمقبوضات اليومية'), href: "/reports/daily-payments-receipts", icon: "💳" },
        { title: t('Bank Reconciliation', 'تسوية الحساب البنكي'), description: t('Reconcile bank accounts', 'تسوية الحساب البنكي'), href: "/reports/bank-reconciliation", icon: "🏦" },
        { title: t('Bank Accounts Movement', 'تقرير حركة الحسابات البنكية'), description: t('Accounts movement', 'حركة الحسابات البنكية'), href: "/banking", icon: "🔁" },
        { title: t('FX Gains & Losses', 'أرباح وخسائر فروق الصرف'), description: t('Foreign exchange gains/losses', 'أرباح وخسائر العملات الأجنبية'), href: "/reports/fx-gains-losses", icon: "💱" },
      ],
    },
    {
      title: t('Shipping Reports', 'تقارير الشحن'),
      items: [
        { title: t('Shipping Report', 'تقرير الشحنات'), description: t('All shipments status and tracking', 'حالة وتتبع جميع الشحنات'), href: "/reports/shipping", icon: "🚚" },
        { title: t('Pending Shipments', 'الشحنات المعلقة'), description: t('Shipments awaiting pickup', 'الشحنات في انتظار الاستلام'), href: "/reports/shipping?status=pending", icon: "⏳" },
        { title: t('Delivered Shipments', 'الشحنات المسلمة'), description: t('Successfully delivered', 'تم التسليم بنجاح'), href: "/reports/shipping?status=delivered", icon: "✅" },
        { title: t('Returned Shipments', 'الشحنات المرتجعة'), description: t('Returned to sender', 'مرتجعة للمرسل'), href: "/reports/shipping?status=returned", icon: "↩️" },
        { title: t('Shipping Costs', 'تكاليف الشحن'), description: t('Shipping cost analysis', 'تحليل تكاليف الشحن'), href: "/reports/shipping-costs", icon: "💰" },
      ],
    },
    {
      title: t('Branch & Cost Center Reports', 'تقارير الفروع ومراكز التكلفة'),
      items: [
        { title: t('Branch & Cost Center Report', 'تقرير الفروع ومراكز التكلفة'), description: t('Financial analysis by branch, cost center, and warehouse', 'تحليل مالي حسب الفرع ومركز التكلفة والمخزن'), href: "/reports/branch-cost-center", icon: "🏢" },
        { title: t('Branch Comparison', 'مقارنة الفروع'), description: t('Compare performance across branches', 'مقارنة الأداء بين الفروع'), href: "/reports/branch-comparison", icon: "📊" },
        { title: t('Cost Center Analysis', 'تحليل مراكز التكلفة'), description: t('Detailed cost center breakdown', 'تفصيل مراكز التكلفة'), href: "/reports/cost-center-analysis", icon: "📈" },
        { title: t('Warehouse Inventory', 'مخزون المخازن'), description: t('Inventory by warehouse', 'المخزون حسب المخزن'), href: "/reports/warehouse-inventory", icon: "📦" },
        { title: t('Bank Accounts by Branch', 'الحسابات البنكية حسب الفرع'), description: t('Bank balances by branch and cost center', 'أرصدة البنوك حسب الفرع ومركز التكلفة'), href: "/reports/bank-accounts-by-branch", icon: "🏦" },
        { title: t('Bank Transactions', 'حركات البنوك'), description: t('Detailed bank transactions report', 'تقرير تفصيلي لحركات البنوك'), href: "/reports/bank-transactions", icon: "💳" },
        { title: t('Bank Reconciliation', 'التسوية البنكية'), description: t('Bank reconciliation report', 'تقرير التسويات البنكية'), href: "/reports/bank-reconciliation", icon: "✅" },
      ],
    },
    {
      title: t('System Reports', 'تقارير النظام'),
      items: [
        { title: t('Financial Trace Explorer', 'مستكشف التتبع المالي'), description: t('Trace lineage across financial commands', 'تتبع سلسلة العمليات المالية عبر الأوامر'), href: "/reports/financial-trace-explorer", icon: "🧭" },
        { title: t('Financial Integrity Checks', 'فحوصات سلامة التنفيذ المالي'), description: t('Find orphan journals and broken trace lineage', 'اكتشاف القيود اليتيمة وروابط التتبع المكسورة'), href: "/reports/financial-integrity-checks", icon: "🧪" },
        { title: t('Financial Replay & Recovery', 'إعادة تشغيل واسترداد العمليات المالية'), description: t('Dry-run replay planning by trace or idempotency key', 'تخطيط dry-run لإعادة التشغيل عبر التتبع أو مفتاح عدم التكرار'), href: "/reports/financial-replay-recovery", icon: "🔁" },
        { title: t('Audit Log', 'سجل العمليات'), description: t('Audit trail', 'سجل التدقيق'), href: "/settings/audit-log", icon: "📝" },
        { title: t('Users & Permissions', 'تقرير المستخدمين وصلاحياتهم'), description: t('Users and roles', 'المستخدمون والصلاحيات'), href: "/settings/users", icon: "👥" },
        { title: t('Login Activity', 'تقرير نشاط الدخول والخروج'), description: t('Login/logout activity', 'نشاط الدخول والخروج'), href: "/reports/login-activity", icon: "🔐" },
      ],
    },
  ]

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-teal-100 dark:bg-teal-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{t('ERP Reports', 'التقارير')}</h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{t('Financial and operational reports hub', 'مركز التقارير المالية والتشغيلية')}</p>
                {/* 🔐 Governance Notice */}
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  {t('👑 Reports show data based on your access level', '👑 التقارير تعرض البيانات حسب مستوى صلاحياتك')}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                const val = e.target.value
                startTransition(() => setSearch(val))
              }}
              placeholder={t('Search reports...', 'بحث في التقارير...')}
              className={`w-full px-3 py-2 border rounded-lg text-sm sm:col-span-2 h-10 sm:h-11 ${isPending ? 'opacity-70' : ''}`}
            />
            <Link href="/reports/update-account-balances">
              <Button variant="outline" className="w-full h-10 sm:h-11 text-xs sm:text-sm">{t('Update Balances', 'حفظ الأرصدة')}</Button>
            </Link>
          </div>

          {groups.map((group) => {
            const items = group.items.filter((it) => {
              const s = search.trim().toLowerCase()
              if (!s) return true
              return it.title.toLowerCase().includes(s) || it.description.toLowerCase().includes(s)
            })
            return (
              <div key={group.title} className="space-y-3">
                <h2 className="text-xl font-bold">{group.title}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {items.map((report) => {
                    const content = (
                      <Card className="h-full hover:shadow-lg transition-shadow">
                        <CardContent className="pt-6">
                          <div className="text-4xl mb-4">{report.icon}</div>
                          <h3 className="text-lg font-semibold mb-2">{report.title}</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{report.description}</p>
                          <div className="mt-4 flex gap-2">
                            <Button variant="outline" size="sm" className="flex-1 bg-transparent" disabled={!report.href}>
                              <FileText className="w-4 h-4 mr-2" />
                              {t('View', 'عرض')}
                            </Button>
                            <Button variant="outline" size="sm">
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                          {!report.href ? (
                            <div className="mt-3 inline-block px-2 py-1 rounded text-xs bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-gray-300">{t('Coming soon', 'قريبًا')}</div>
                          ) : null}
                        </CardContent>
                      </Card>
                    )
                    return report.href ? (
                      <Link key={report.title} href={report.href}>{content}</Link>
                    ) : (
                      <div key={report.title}>{content}</div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}
