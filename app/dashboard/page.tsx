import { Sidebar } from "@/components/sidebar"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import DashboardCharts from "@/components/charts/DashboardCharts"


export default async function DashboardPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data?.user) {
    redirect("/auth/login")
  }

  // Load company
  const { data: company } = await supabase
    .from("companies")
    .select("id, currency")
    .eq("user_id", data.user.id)
    .single()

  // Default stats
  let totalSales = 0
  let totalPurchases = 0
  let expectedProfit = 0
  let invoicesCount = 0
  let hasData = false

  if (company) {
    // Invoices count
    const { count: invCount } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("company_id", company.id)

    invoicesCount = invCount ?? 0

    // Sum invoices total_amount
    const { data: invoices } = await supabase
      .from("invoices")
      .select("total_amount")
      .eq("company_id", company.id)

    if (invoices && invoices.length > 0) {
      totalSales = invoices.reduce((sum, i) => sum + Number(i.total_amount ?? 0), 0)
    }

    // Sum purchase orders total_amount
    const { data: purchases } = await supabase
      .from("purchase_orders")
      .select("total_amount")
      .eq("company_id", company.id)

    if (purchases && purchases.length > 0) {
      totalPurchases = purchases.reduce((sum, p) => sum + Number(p.total_amount ?? 0), 0)
    }

    expectedProfit = totalSales - totalPurchases
    hasData = invoicesCount > 0 || (purchases?.length ?? 0) > 0
  }

  const formatNumber = (n: number) => n.toLocaleString("ar")

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">لوحة التحكم</h1>
            <p className="text-gray-600 dark:text-gray-400">مرحباً بك في تطبيق إدارة المحاسبة</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">إجمالي المبيعات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(totalSales)}</div>
                <p className="text-xs text-gray-500 mt-1">{hasData ? "" : "لا توجد بيانات بعد"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">إجمالي المشتريات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(totalPurchases)}</div>
                <p className="text-xs text-gray-500 mt-1">{hasData ? "" : "لا توجد بيانات بعد"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">الأرباح المتوقعة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(expectedProfit)}</div>
                <p className="text-xs text-gray-500 mt-1">{hasData ? "" : "لا توجد بيانات بعد"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">عدد الفواتير</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatNumber(invoicesCount)}</div>
                <p className="text-xs text-gray-500 mt-1">{invoicesCount > 0 ? "" : "لا توجد فواتير بعد"}</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          {hasData ? (
            <DashboardCharts />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>الرسوم البيانية</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 dark:text-gray-400">لا توجد بيانات لعرض الرسوم حالياً.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
