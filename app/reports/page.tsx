"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Download } from "lucide-react"
import Link from "next/link"

export default function ReportsPage() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(false)
  }, [])

  const reports = [
    {
      title: "الميزانية العمومية",
      description: "قائمة بأصول والتزامات وحقوق الملكية",
      href: "/reports/balance-sheet",
      icon: "📊",
    },
    {
      title: "قائمة الدخل",
      description: "قائمة الإيرادات والمصروفات",
      href: "/reports/income-statement",
      icon: "📈",
    },
    {
      title: "الأرصدة المحاسبية",
      description: "أرصدة جميع الحسابات",
      href: "/reports/trial-balance",
      icon: "⚖️",
    },
    {
      title: "تقرير الفواتير",
      description: "تفاصيل الفواتير والمبالغ المستحقة",
      href: "/reports/invoices",
      icon: "📄",
    },
    {
      title: "تقرير المبيعات",
      description: "تحليل المبيعات حسب الفترة الزمنية",
      href: "/reports/sales",
      icon: "💰",
    },
    {
      title: "تقرير المشتريات",
      description: "تحليل المشتريات حسب الفترة الزمنية",
      href: "/reports/purchases",
      icon: "📦",
    },
    {
      title: "تقادم الذمم المدينة",
      description: "توزيع أرصدة العملاء حسب فترات الاستحقاق",
      href: "/reports/aging-ar",
      icon: "🧭",
    },
    {
      title: "تقادم الذمم الدائنة",
      description: "توزيع أرصدة الموردين حسب فترات الاستحقاق",
      href: "/reports/aging-ap",
      icon: "🧭",
    },
    {
      title: "تسوية البنك",
      description: "مراجعة المدفوعات وتحديد ما تمّت تسويته",
      href: "/reports/bank-reconciliation",
      icon: "🏦",
    },
    {
      title: "حفظ أرصدة الحسابات",
      description: "إنشاء لقطة أرصدة حتى تاريخ محدد",
      href: "/reports/update-account-balances",
      icon: "💾",
    },
  ]

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">التقارير المالية</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">عرض وتحليل التقارير المالية الشاملة</p>
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
                        عرض
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
