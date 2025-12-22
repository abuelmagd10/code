"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter } from "next/navigation"
import { Plus, Search, RotateCcw, Eye } from "lucide-react"
import { getActiveCompanyId } from "@/lib/company"
import { TableSkeleton } from "@/components/ui/skeleton"

type PurchaseReturn = {
  id: string
  return_number: string
  return_date: string
  total_amount: number
  status: string
  reason: string
  suppliers?: { name: string }
  bills?: { bill_number: string }
}

export default function PurchaseReturnsPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  const [returns, setReturns] = useState<PurchaseReturn[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  const [appCurrency, setAppCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ'
  }
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  useEffect(() => {
    loadReturns()
  }, [])

  const loadReturns = async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // ===== 🔧 إصلاح: جلب المرتجعات من الفواتير مباشرة =====
      const { data, error } = await supabase
        .from("bills")
        .select("id, bill_number, bill_date, returned_amount, return_status, supplier_id, suppliers(name)")
        .eq("company_id", companyId)
        .not("return_status", "is", null)
        .gt("returned_amount", 0)
        .order("bill_date", { ascending: false })

      if (!error && data) {
        // تحويل البيانات إلى تنسيق PurchaseReturn
        const formattedReturns: PurchaseReturn[] = data.map((bill: any) => ({
          id: bill.id,
          return_number: bill.bill_number,
          return_date: bill.bill_date,
          total_amount: Number(bill.returned_amount || 0),
          status: 'completed', // المرتجعات المكتملة
          reason: bill.return_status === 'full' ? (appLang === 'en' ? 'Full Return' : 'مرتجع كامل') : (appLang === 'en' ? 'Partial Return' : 'مرتجع جزئي'),
          suppliers: bill.suppliers ? { name: bill.suppliers.name } : undefined,
          bills: { bill_number: bill.bill_number }
        }))
        setReturns(formattedReturns)
      }
    } catch (error) {
      console.error("Error loading purchase returns:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredReturns = returns.filter(r =>
    r.return_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.suppliers?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.bills?.bill_number?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
      cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
    }
    const labels: Record<string, Record<string, string>> = {
      completed: { en: "Completed", ar: "مكتمل" },
      pending: { en: "Pending", ar: "معلق" },
      cancelled: { en: "Cancelled", ar: "ملغي" }
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
        {labels[status]?.[appLang] || status}
      </span>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* Header */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {appLang === 'en' ? 'Purchase Returns' : 'مرتجعات المشتريات'}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {appLang === 'en' ? 'Manage purchase returns' : 'إدارة مرتجعات المشتريات'}
                  </p>
                </div>
              </div>
              <Button onClick={() => router.push("/purchase-returns/new")} className="h-10 sm:h-11 text-sm sm:text-base px-3 sm:px-4">
                <Plus className="w-4 h-4 ml-1 sm:ml-2" />
                {appLang === 'en' ? 'New Return' : 'مرتجع جديد'}
              </Button>
            </div>
          </div>

          {/* Search */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <Input
                  placeholder={appLang === 'en' ? 'Search returns...' : 'البحث في المرتجعات...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Returns List */}
          <Card>
            <CardHeader>
              <CardTitle>{appLang === 'en' ? 'Returns List' : 'قائمة المرتجعات'}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <TableSkeleton cols={6} rows={8} className="mt-4" />
              ) : filteredReturns.length === 0 ? (
                <p className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {appLang === 'en' ? 'No purchase returns yet' : 'لا توجد مرتجعات مشتريات حتى الآن'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[500px] w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Return #' : 'رقم المرتجع'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Supplier' : 'المورد'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden sm:table-cell">{appLang === 'en' ? 'Bill #' : 'رقم الفاتورة'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden md:table-cell">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Status' : 'الحالة'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Actions' : 'إجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReturns.map((ret) => (
                        <tr key={ret.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                          <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">{ret.return_number}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{ret.suppliers?.name || '-'}</td>
                          <td className="px-3 py-3 text-gray-600 dark:text-gray-400 hidden sm:table-cell">{ret.bills?.bill_number || '-'}</td>
                          <td className="px-3 py-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">{ret.return_date}</td>
                          <td className="px-3 py-3 font-semibold text-purple-600 dark:text-purple-400">
                            {currencySymbol} {Number(ret.total_amount || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3 py-3">{getStatusBadge(ret.status)}</td>
                          <td className="px-3 py-3">
                            <Button variant="outline" size="sm" onClick={() => router.push(`/bills/${ret.id}`)} title={appLang === 'en' ? 'View Bill' : 'عرض الفاتورة'}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

