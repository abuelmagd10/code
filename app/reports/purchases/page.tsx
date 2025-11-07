"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

interface PurchasesData {
  supplier_name: string
  total_purchases: number
  po_count: number
}

export default function PurchasesReportPage() {
  const supabase = useSupabase()
  const [purchasesData, setPurchasesData] = useState<PurchasesData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    loadPurchasesData()
  }, [])

  const loadPurchasesData = async () => {
    try {
      setIsLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return

      const { data } = await supabase
        .from("purchase_orders")
        .select("total_amount, suppliers(name)")
        .eq("company_id", companyData.id)

      if (data) {
        const grouped = data.reduce((acc: Record<string, any>, po: any) => {
          const supplier = (po.suppliers as any)?.name || "Unknown"
          if (!acc[supplier]) {
            acc[supplier] = { total: 0, count: 0 }
          }
          acc[supplier].total += po.total_amount
          acc[supplier].count += 1
          return acc
        }, {})

        setPurchasesData(
          Object.entries(grouped).map(([name, data]: any) => ({
            supplier_name: name,
            total_purchases: data.total,
            po_count: data.count,
          })),
        )
      }
    } catch (error) {
      console.error("Error loading purchases data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const totalPurchases = purchasesData.reduce((sum, p) => sum + p.total_purchases, 0)

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <div className="flex justify-between items-center print:hidden">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">تقرير المشتريات</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">{new Date().toLocaleDateString("ar")}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePrint}>
                <Download className="w-4 h-4 mr-2" />
                طباعة
              </Button>
              <Button variant="outline" onClick={() => router.push("/reports")}>
                <ArrowRight className="w-4 h-4 mr-2" />
                العودة
              </Button>
            </div>
          </div>

          {isLoading ? (
            <p className="text-center py-8">جاري التحميل...</p>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">المورد</th>
                        <th className="px-4 py-3 text-right">إجمالي المشتريات</th>
                        <th className="px-4 py-3 text-right">عدد أوامر الشراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchasesData.map((purchase, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3">{purchase.supplier_name}</td>
                          <td className="px-4 py-3 font-semibold">{purchase.total_purchases.toFixed(2)}</td>
                          <td className="px-4 py-3">{purchase.po_count}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-gray-100 dark:bg-slate-800">
                        <td className="px-4 py-3">الإجمالي</td>
                        <td colSpan={2} className="px-4 py-3">
                          {totalPurchases.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
