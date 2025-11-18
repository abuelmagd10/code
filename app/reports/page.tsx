"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Download } from "lucide-react"
import Link from "next/link"

export default function ReportsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  useEffect(() => {
    setIsLoading(false)
  }, [])

  const reports = [
    {
      title: appLang==='en' ? 'Balance Sheet' : "الميزانية العمومية",
      description: appLang==='en' ? 'Statement of assets, liabilities, and equity' : "قائمة بأصول والتزامات وحقوق الملكية",
      href: "/reports/balance-sheet",
      icon: "📊",
    },
    {
      title: appLang==='en' ? 'Income Statement' : "قائمة الدخل",
      description: appLang==='en' ? 'Statement of revenues and expenses' : "قائمة الإيرادات والمصروفات",
      href: "/reports/income-statement",
      icon: "📈",
    },
    {
      title: appLang==='en' ? 'Trial Balance' : "الأرصدة المحاسبية",
      description: appLang==='en' ? 'Balances of all accounts' : "أرصدة جميع الحسابات",
      href: "/reports/trial-balance",
      icon: "⚖️",
    },
    {
      title: appLang==='en' ? 'Invoices Report' : "تقرير الفواتير",
      description: appLang==='en' ? 'Invoice details and outstanding amounts' : "تفاصيل الفواتير والمبالغ المستحقة",
      href: "/reports/invoices",
      icon: "📄",
    },
    {
      title: appLang==='en' ? 'Sales Report' : "تقرير المبيعات",
      description: appLang==='en' ? 'Sales analysis by period' : "تحليل المبيعات حسب الفترة الزمنية",
      href: "/reports/sales",
      icon: "💰",
    },
    {
      title: appLang==='en' ? 'Purchases Report' : "تقرير المشتريات",
      description: appLang==='en' ? 'Purchases analysis by period' : "تحليل المشتريات حسب الفترة الزمنية",
      href: "/reports/purchases",
      icon: "📦",
    },
    {
      title: appLang==='en' ? 'AR Aging' : "تقادم الذمم المدينة",
      description: appLang==='en' ? 'Customer balances distribution by aging buckets' : "توزيع أرصدة العملاء حسب فترات الاستحقاق",
      href: "/reports/aging-ar",
      icon: "🧭",
    },
    {
      title: appLang==='en' ? 'AP Aging' : "تقادم الذمم الدائنة",
      description: appLang==='en' ? 'Supplier balances distribution by aging buckets' : "توزيع أرصدة الموردين حسب فترات الاستحقاق",
      href: "/reports/aging-ap",
      icon: "🧭",
    },
    {
      title: appLang==='en' ? 'Bank Reconciliation' : "تسوية البنك",
      description: appLang==='en' ? 'Review payments and mark reconciled items' : "مراجعة المدفوعات وتحديد ما تمّت تسويته",
      href: "/reports/bank-reconciliation",
      icon: "🏦",
    },
    {
      title: appLang==='en' ? 'Snapshot Account Balances' : "حفظ أرصدة الحسابات",
      description: appLang==='en' ? 'Create balances snapshot up to a date' : "إنشاء لقطة أرصدة حتى تاريخ محدد",
      href: "/reports/update-account-balances",
      icon: "💾",
    },
    {
      title: appLang==='en' ? 'Inventory Valuation' : "تقييم المخزون",
      description: appLang==='en' ? 'Average cost valuation up to date' : "حساب تقييم المخزون بتكلفة متوسطة حتى التاريخ",
      href: "/reports/inventory-valuation",
      icon: "🧮",
    },
    {
      title: appLang==='en' ? 'Sales Invoices Detail' : "تفصيل فواتير المبيعات",
      description: appLang==='en' ? 'Detailed list with filters' : "قائمة تفصيلية مع فلاتر",
      href: "/reports/sales-invoices-detail",
      icon: "🧾",
    },
    {
      title: appLang==='en' ? 'Purchase Bills Detail' : "تفصيل فواتير المشتريات",
      description: appLang==='en' ? 'Detailed list with filters' : "قائمة تفصيلية مع فلاتر",
      href: "/reports/purchase-bills-detail",
      icon: "🧾",
    },
  ]

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{appLang==='en' ? 'Financial Reports' : 'التقارير المالية'}</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">{appLang==='en' ? 'View and analyze comprehensive financial reports' : 'عرض وتحليل التقارير المالية الشاملة'}</p>
          </div>

          {/* Reports Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reports.map((report) => (
              <Link key={report.href} href={report.href}>
                <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="pt-6">
                    <div className="text-4xl mb-4">{report.icon}</div>
                    <h3 className="text-lg font-semibold mb-2">{report.title}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{report.description}</p>
                    <div className="mt-4 flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 bg-transparent">
                        <FileText className="w-4 h-4 mr-2" />
                        {appLang==='en' ? 'View' : 'عرض'}
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
