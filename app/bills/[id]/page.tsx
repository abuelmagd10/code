"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"
import { Button } from "@/components/ui/button"
import { useParams } from "next/navigation"
import { Pencil } from "lucide-react"

type Bill = {
  id: string
  supplier_id: string
  bill_number: string
  bill_date: string
  due_date: string
  subtotal: number
  tax_amount: number
  total_amount: number
  discount_type: "amount" | "percent"
  discount_value: number
  discount_position: "before_tax" | "after_tax"
  tax_inclusive: boolean
  shipping: number
  shipping_tax_rate: number
  adjustment: number
  status: string
}

type Supplier = { id: string; name: string }
type BillItem = { id: string; product_id: string; description: string | null; quantity: number; unit_price: number; tax_rate: number; discount_percent: number; line_total: number }
type Product = { id: string; name: string; sku: string }
type Payment = { id: string; bill_id: string | null; amount: number }

export default function BillViewPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id as string
  const supabase = useSupabase()
  const [loading, setLoading] = useState(true)
  const [bill, setBill] = useState<Bill | null>(null)
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [items, setItems] = useState<BillItem[]>([])
  const [products, setProducts] = useState<Record<string, Product>>({})
  const [payments, setPayments] = useState<Payment[]>([])

  useEffect(() => { loadData() }, [id])

  const loadData = async () => {
    try {
      setLoading(true)
      const { data: billData } = await supabase.from("bills").select("*").eq("id", id).single()
      setBill(billData as any)
      if (!billData) return
      const { data: supplierData } = await supabase.from("suppliers").select("id, name").eq("id", billData.supplier_id).single()
      setSupplier(supplierData as any)
      const { data: itemData } = await supabase.from("bill_items").select("*").eq("bill_id", id)
      setItems((itemData || []) as any)
      const productIds = Array.from(new Set((itemData || []).map((it: any) => it.product_id)))
      if (productIds.length) {
        const { data: prodData } = await supabase.from("products").select("id, name, sku").in("id", productIds)
        const map: Record<string, Product> = {}
        ;(prodData || []).forEach((p: any) => map[p.id] = p)
        setProducts(map)
      }
      const { data: payData } = await supabase.from("payments").select("id, bill_id, amount").eq("bill_id", id)
      setPayments((payData || []) as any)
    } finally { setLoading(false) }
  }

  const paidTotal = useMemo(() => payments.reduce((sum, p) => sum + (p.amount || 0), 0), [payments])

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        {loading ? (
          <div className="text-gray-600 dark:text-gray-400">جاري التحميل...</div>
        ) : !bill ? (
          <div className="text-red-600">لم يتم العثور على الفاتورة</div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">فاتورة شراء #{bill.bill_number}</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">المورد: {supplier?.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/bills/${bill.id}/edit`} className="px-3 py-2 bg-gray-100 dark:bg-slate-800 rounded hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center gap-2">
                  <Pencil className="w-4 h-4" /> تعديل
                </Link>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>تفاصيل الفاتورة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-gray-600 dark:text-gray-400">تاريخ الفاتورة:</span> {new Date(bill.bill_date).toLocaleDateString("ar")}</div>
                  <div><span className="text-gray-600 dark:text-gray-400">تاريخ الاستحقاق:</span> {new Date(bill.due_date).toLocaleDateString("ar")}</div>
                  <div><span className="text-gray-600 dark:text-gray-400">الحالة:</span> {bill.status}</div>
                  <div><span className="text-gray-600 dark:text-gray-400">أسعار شاملة ضريبة:</span> {bill.tax_inclusive ? "نعم" : "لا"}</div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="p-2">المنتج</th>
                        <th className="p-2">الوصف</th>
                        <th className="p-2">الكمية</th>
                        <th className="p-2">سعر الوحدة</th>
                        <th className="p-2">خصم %</th>
                        <th className="p-2">نسبة الضريبة</th>
                        <th className="p-2">الإجمالي (صافي)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.id} className="border-t">
                          <td className="p-2">{products[it.product_id]?.name || it.product_id}</td>
                          <td className="p-2">{it.description || ""}</td>
                          <td className="p-2">{it.quantity}</td>
                          <td className="p-2">{it.unit_price.toFixed(2)}</td>
                          <td className="p-2">{(it.discount_percent || 0).toFixed(2)}%</td>
                          <td className="p-2">{it.tax_rate.toFixed(2)}%</td>
                          <td className="p-2">{it.line_total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">ملخص</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between"><span>الإجمالي الفرعي</span><span>{bill.subtotal.toFixed(2)}</span></div>
                      <div className="flex items-center justify-between"><span>الضريبة</span><span>{bill.tax_amount.toFixed(2)} {bill.tax_inclusive ? "(أسعار شاملة)" : ""}</span></div>
                      <div className="flex items-center justify-between"><span>الشحن</span><span>{(bill.shipping || 0).toFixed(2)} (+ضريبة {Number(bill.shipping_tax_rate || 0).toFixed(2)}%)</span></div>
                      <div className="flex items-center justify-between"><span>التعديل</span><span>{(bill.adjustment || 0).toFixed(2)}</span></div>
                      <div className="flex items-center justify-between font-semibold"><span>الإجمالي</span><span>{bill.total_amount.toFixed(2)}</span></div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">الخصم</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between"><span>النوع</span><span>{bill.discount_type === "percent" ? "نسبة" : "قيمة"}</span></div>
                      <div className="flex items-center justify-between"><span>القيمة</span><span>{Number(bill.discount_value || 0).toFixed(2)}{bill.discount_type === "percent" ? "%" : ""}</span></div>
                      <div className="flex items-center justify-between"><span>الموضع</span><span>{bill.discount_position === "after_tax" ? "بعد الضريبة" : "قبل الضريبة"}</span></div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">المدفوعات</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between"><span>المدفوع</span><span>{paidTotal.toFixed(2)}</span></div>
                      <div className="flex items-center justify-between"><span>المتبقي</span><span className="font-semibold">{Math.max((bill.total_amount || 0) - paidTotal, 0).toFixed(2)}</span></div>
                      <div>
                        <Link href={`/payments?bill_id=${bill.id}`} className="text-blue-600 hover:underline">سجل/ادفع</Link>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}

