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
                <div className="text-2xl font-bold">50,000 ر.س</div>
                <p className="text-xs text-green-600 mt-1">↑ 20% من الشهر الماضي</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">إجمالي المشتريات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">30,000 ر.س</div>
                <p className="text-xs text-red-600 mt-1">↑ 10% من الشهر الماضي</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">الأرباح المتوقعة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">20,000 ر.س</div>
                <p className="text-xs text-green-600 mt-1">↑ 15% من الشهر الماضي</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">عدد الفواتير</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">125</div>
                <p className="text-xs text-blue-600 mt-1">15 فاتورة جديدة هذا الشهر</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <DashboardCharts />
        </div>
      </main>
    </div>
  )
}
