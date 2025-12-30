"use client"

import { useEffect, useState, useMemo, useTransition } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter } from "next/navigation"
import { Plus, Search, RotateCcw, Eye } from "lucide-react"
import { getActiveCompanyId } from "@/lib/company"
import { TableSkeleton } from "@/components/ui/skeleton"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { StatusBadge } from "@/components/DataTableFormatters"

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

  // 🚀 تحسين الأداء - استخدام useTransition للفلاتر
  const [isPending, startTransition] = useTransition()

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

  // ===== DataTable Columns Definition =====
  const tableColumns: DataTableColumn<PurchaseReturn>[] = useMemo(() => [
    {
      key: 'return_number',
      header: appLang === 'en' ? 'Return #' : 'رقم المرتجع',
      type: 'text',
      align: 'left',
      width: 'w-32',
      format: (value) => (
        <span className="font-medium text-gray-900 dark:text-white">{value}</span>
      )
    },
    {
      key: 'suppliers',
      header: appLang === 'en' ? 'Supplier' : 'المورد',
      type: 'text',
      align: 'left',
      width: 'flex-1 min-w-[150px]',
      format: (value) => value?.name || '—'
    },
    {
      key: 'bills',
      header: appLang === 'en' ? 'Bill #' : 'رقم الفاتورة',
      type: 'text',
      align: 'left',
      width: 'w-32',
      hidden: 'sm',
      format: (value) => value?.bill_number || '—'
    },
    {
      key: 'return_date',
      header: appLang === 'en' ? 'Date' : 'التاريخ',
      type: 'date',
      align: 'right',
      width: 'w-32',
      hidden: 'md',
      format: (value) => value
    },
    {
      key: 'total_amount',
      header: appLang === 'en' ? 'Amount' : 'المبلغ',
      type: 'currency',
      align: 'right',
      width: 'w-32',
      format: (value) => (
        <span className="font-semibold text-purple-600 dark:text-purple-400">
          {currencySymbol} {Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'status',
      header: appLang === 'en' ? 'Status' : 'الحالة',
      type: 'status',
      align: 'center',
      width: 'w-28',
      format: (value) => (
        <StatusBadge
          status={value === 'completed' ? 'completed' : value === 'pending' ? 'pending' : 'cancelled'}
          label={value === 'completed' ? (appLang === 'en' ? 'Completed' : 'مكتمل') : value === 'pending' ? (appLang === 'en' ? 'Pending' : 'معلق') : (appLang === 'en' ? 'Cancelled' : 'ملغي')}
          variant={value === 'completed' ? 'success' : value === 'pending' ? 'warning' : 'danger'}
        />
      )
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Actions' : 'إجراءات',
      type: 'actions',
      align: 'center',
      width: 'w-24',
      format: (value) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/bills/${value}`)}
          title={appLang === 'en' ? 'View Bill' : 'عرض الفاتورة'}
        >
          <Eye className="w-4 h-4" />
        </Button>
      )
    }
  ], [appLang, currencySymbol, router])

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
                  onChange={(e) => {
                    const val = e.target.value
                    startTransition(() => setSearchTerm(val))
                  }}
                  className={`flex-1 ${isPending ? 'opacity-70' : ''}`}
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
              ) : (
                <DataTable
                  columns={tableColumns}
                  data={filteredReturns}
                  keyField="id"
                  lang={appLang}
                  minWidth="min-w-[500px]"
                  emptyMessage={appLang === 'en' ? 'No purchase returns yet' : 'لا توجد مرتجعات مشتريات حتى الآن'}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

