"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { ClipboardList } from "lucide-react"

interface Supplier { id: string; name: string }
interface PO {
  id: string
  po_number: string
  po_date: string
  due_date: string | null
  total_amount: number
  status: string
  suppliers?: Supplier
}

export default function PurchaseOrdersPage() {
  const supabase = useSupabase()
  const [rows, setRows] = useState<PO[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar'|'en'>('ar')
  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        setIsLoading(true)
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
        if (!company) return
        const { data } = await supabase
          .from("purchase_orders")
          .select("*, suppliers(id, name)")
          .eq("company_id", company.id)
          .order("po_date", { ascending: false })
        setRows(data || [])
      } catch (err) {
        console.error("Error loading purchase orders:", err)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang==='en' ? 'Purchase Orders' : 'أوامر الشراء'}</h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang==='en' ? 'Order list' : 'قائمة الأوامر'}</p>
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              {isLoading ? (
                <p className="py-8 text-center">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</p>
              ) : rows.length === 0 ? (
                <p className="py-8 text-center text-gray-500 dark:text-gray-400">{appLang==='en' ? 'No purchase orders' : 'لا توجد أوامر شراء'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-slate-900">
                        <th className="px-3 py-2 text-right">{appLang==='en' ? 'PO No.' : 'رقم الأمر'}</th>
                        <th className="px-3 py-2 text-right">{appLang==='en' ? 'Date' : 'التاريخ'}</th>
                        <th className="px-3 py-2 text-right">{appLang==='en' ? 'Supplier' : 'المورد'}</th>
                        <th className="px-3 py-2 text-right">{appLang==='en' ? 'Total' : 'الإجمالي'}</th>
                        <th className="px-3 py-2 text-right">{appLang==='en' ? 'Status' : 'الحالة'}</th>
                        <th className="px-3 py-2 text-right">{appLang==='en' ? 'Actions' : 'إجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((po) => (
                        <tr key={po.id} className="border-b">
                          <td className="px-3 py-2">{po.po_number}</td>
                          <td className="px-3 py-2">{new Date(po.po_date).toLocaleDateString(appLang==='en' ? 'en' : 'ar')}</td>
                          <td className="px-3 py-2">{po.suppliers?.name}</td>
                          <td className="px-3 py-2">{Number(po.total_amount || 0).toFixed(2)}</td>
                          <td className="px-3 py-2">{po.status}</td>
                          <td className="px-3 py-2">
                            <Link href={`/purchase-orders/${po.id}`}>
                              <Button variant="outline" size="sm">{appLang==='en' ? 'View' : 'عرض'}</Button>
                            </Link>
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

