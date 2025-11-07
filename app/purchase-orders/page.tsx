"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"

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
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">أوامر الشراء</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">قائمة أوامر الشراء مع حالة التنفيذ</p>
          </div>

          <Card>
            <CardContent className="pt-6">
              {isLoading ? (
                <p className="py-8 text-center">جاري التحميل...</p>
              ) : rows.length === 0 ? (
                <p className="py-8 text-center text-gray-500">لا توجد أوامر شراء</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-slate-900">
                        <th className="px-3 py-2 text-right">رقم الأمر</th>
                        <th className="px-3 py-2 text-right">التاريخ</th>
                        <th className="px-3 py-2 text-right">المورد</th>
                        <th className="px-3 py-2 text-right">الإجمالي</th>
                        <th className="px-3 py-2 text-right">الحالة</th>
                        <th className="px-3 py-2 text-right">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((po) => (
                        <tr key={po.id} className="border-b">
                          <td className="px-3 py-2">{po.po_number}</td>
                          <td className="px-3 py-2">{new Date(po.po_date).toLocaleDateString("ar")}</td>
                          <td className="px-3 py-2">{po.suppliers?.name}</td>
                          <td className="px-3 py-2">{Number(po.total_amount || 0).toFixed(2)}</td>
                          <td className="px-3 py-2">{po.status}</td>
                          <td className="px-3 py-2">
                            <Link href={`/purchase-orders/${po.id}`}>
                              <Button variant="outline" size="sm">عرض</Button>
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

