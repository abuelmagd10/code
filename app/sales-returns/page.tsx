"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import Link from "next/link"
import { Plus, Eye } from "lucide-react"
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return

      // جلب قيود مرتجعات المبيعات من journal_entries
      const { data: journalEntries } = await supabase
        .from("journal_entries")
        .select("id, entry_date, description, reference_id, reference_type")
        .eq("company_id", company.id)
        .eq("reference_type", "sales_return")
        .order("entry_date", { ascending: false })

      const entries = journalEntries || []

      // جلب مبالغ القيود من journal_entry_lines
      const entryIds = entries.map(e => e.id)
      let amountsMap: Record<string, number> = {}
      if (entryIds.length > 0) {
        const { data: lines } = await supabase
          .from("journal_entry_lines")
          .select("journal_entry_id, debit_amount")
          .in("journal_entry_id", entryIds)

        (lines || []).forEach((line: any) => {
          const jid = String(line.journal_entry_id)
          amountsMap[jid] = (amountsMap[jid] || 0) + Number(line.debit_amount || 0)
        })
      }

      // جلب معلومات الفواتير والعملاء
      const invoiceIds = entries.map(e => e.reference_id).filter(Boolean) as string[]
      let invoiceMap: Record<string, { invoice_number: string; customer_name: string }> = {}
      if (invoiceIds.length > 0) {
        const { data: invoices } = await supabase
          .from("invoices")
          .select("id, invoice_number, customers(name)")
          .in("id", invoiceIds)

        (invoices || []).forEach((inv: any) => {
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
    })()
  }, [supabase])

  const getStatusBadge = () => {
    return <Badge className="bg-green-100 text-green-800">{appLang === 'en' ? 'Completed' : 'مكتمل'}</Badge>
  }

  if (loading) return <div className="flex min-h-screen"><Sidebar /><main className="flex-1 md:mr-64 p-8">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</main></div>

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{appLang === 'en' ? 'Sales Returns' : 'مرتجعات المبيعات'}</h1>
          <Link href="/sales-returns/new">
            <Button><Plus className="w-4 h-4 mr-2" /> {appLang === 'en' ? 'New Return' : 'مرتجع جديد'}</Button>
          </Link>
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

