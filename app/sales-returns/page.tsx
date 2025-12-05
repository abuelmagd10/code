"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import Link from "next/link"
import { Plus, Eye, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"

type SalesReturnEntry = {
  id: string
  entry_date: string
  description: string
  reference_id: string | null
  reference_type: string
  total_amount: number
  invoice_number?: string
  customer_name?: string
}

export default function SalesReturnsPage() {
  const supabase = useSupabase()
  const [returns, setReturns] = useState<SalesReturnEntry[]>([])
  const [loading, setLoading] = useState(true)
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  useEffect(() => {
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }
        const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
        if (!company) {
          setLoading(false)
          return
        }

        // جلب قيود مرتجعات المبيعات من journal_entries
        const { data: journalEntries, error } = await supabase
          .from("journal_entries")
          .select("id, entry_date, description, reference_id, reference_type")
          .eq("company_id", company.id)
          .eq("reference_type", "sales_return")
          .order("entry_date", { ascending: false })

        if (error) {
          console.error("Error fetching sales returns:", error)
          setLoading(false)
          return
        }

        const entries = journalEntries || []

        // إذا لا توجد مرتجعات، انتهي
        if (entries.length === 0) {
          setReturns([])
          setLoading(false)
          return
        }

        // جلب مبالغ القيود من journal_entry_lines
        const entryIds = entries.map((e: { id: string }) => e.id)
        const amountsMap: Record<string, number> = {}
        if (entryIds.length > 0) {
          const linesResult = await supabase
            .from("journal_entry_lines")
            .select("journal_entry_id, debit_amount")
            .in("journal_entry_id", entryIds)

          const lines = linesResult.data || []
          lines.forEach((line: { journal_entry_id: string; debit_amount: number }) => {
            const jid = String(line.journal_entry_id)
            amountsMap[jid] = (amountsMap[jid] || 0) + Number(line.debit_amount || 0)
          })
        }

        // جلب معلومات الفواتير والعملاء
        const invoiceIds = entries.map((e: { reference_id?: string }) => e.reference_id).filter(Boolean) as string[]
        const invoiceMap: Record<string, { invoice_number: string; customer_name: string }> = {}
        if (invoiceIds.length > 0) {
          const invoicesResult = await supabase
            .from("invoices")
            .select("id, invoice_number, customers(name)")
            .in("id", invoiceIds)

          const invoices = invoicesResult.data || []
          invoices.forEach((inv: { id: string; invoice_number?: string; customers?: { name?: string } }) => {
            invoiceMap[String(inv.id)] = {
              invoice_number: inv.invoice_number || "",
              customer_name: inv.customers?.name || ""
            }
          })
        }

        const formatted: SalesReturnEntry[] = entries.map((e: any) => ({
          id: e.id,
          entry_date: e.entry_date,
          description: e.description,
          reference_id: e.reference_id,
          reference_type: e.reference_type,
          total_amount: amountsMap[String(e.id)] || 0,
          invoice_number: e.reference_id ? invoiceMap[String(e.reference_id)]?.invoice_number : "",
          customer_name: e.reference_id ? invoiceMap[String(e.reference_id)]?.customer_name : ""
        }))

        setReturns(formatted)
        setLoading(false)
      } catch (err) {
        console.error("Error in sales returns page:", err)
        setLoading(false)
      }
    })()
  }, [supabase])

  const getStatusBadge = () => {
    return <Badge className="bg-green-100 text-green-800">{appLang === 'en' ? 'Completed' : 'مكتمل'}</Badge>
  }

  if (loading) return <div className="flex min-h-screen"><Sidebar /><main className="flex-1 md:mr-64 p-8">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</main></div>

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* رأس الصفحة - تحسين للهاتف */}
        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang === 'en' ? 'Sales Returns' : 'المرتجعات'}</h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang === 'en' ? 'Returns & refunds' : 'المرتجعات والمستردات'}</p>
              </div>
            </div>
            <Link href="/sales-returns/new">
              <Button className="h-10 sm:h-11 text-sm sm:text-base"><Plus className="w-4 h-4 mr-2" /> {appLang === 'en' ? 'New' : 'جديد'}</Button>
            </Link>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{appLang === 'en' ? 'Returns List' : 'قائمة المرتجعات'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-600 border-b">
                    <th className="text-right p-3">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                    <th className="text-right p-3">{appLang === 'en' ? 'Description' : 'الوصف'}</th>
                    <th className="text-right p-3">{appLang === 'en' ? 'Customer' : 'العميل'}</th>
                    <th className="text-right p-3">{appLang === 'en' ? 'Invoice' : 'الفاتورة'}</th>
                    <th className="text-right p-3">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                    <th className="text-right p-3">{appLang === 'en' ? 'Status' : 'الحالة'}</th>
                    <th className="text-center p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {returns.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-gray-500">{appLang === 'en' ? 'No returns found' : 'لا توجد مرتجعات'}</td></tr>
                  ) : returns.map(ret => (
                    <tr key={ret.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                      <td className="p-3">{ret.entry_date}</td>
                      <td className="p-3 font-medium">{ret.description}</td>
                      <td className="p-3">{ret.customer_name || "—"}</td>
                      <td className="p-3">{ret.invoice_number || "—"}</td>
                      <td className="p-3 text-left font-semibold text-red-600">{Number(ret.total_amount).toLocaleString('ar-EG', { minimumFractionDigits: 2 })}</td>
                      <td className="p-3">{getStatusBadge()}</td>
                      <td className="p-3 text-center">
                        <Link href={`/journal-entries/${ret.id}`}>
                          <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

