"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { useSupabase } from "@/lib/supabase/hooks"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, CheckCircle } from "lucide-react"

type Invoice = {
  id: string
  invoice_number: string
  customer_id: string
  subtotal: number
  tax_amount: number
  total_amount: number
  returned_amount: number
  status: string
}

type InvoiceItem = {
  id: string
  product_id: string | null
  description: string
  quantity: number
  returned_quantity: number
  unit_price: number
  tax_rate: number
  discount_percent: number
  line_total: number
}

type ReturnItem = {
  item_id: string
  returned_quantity: number
}

export default function SentInvoiceReturnsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()

  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([])
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // البحث عن الفاتورة
  const searchInvoice = async () => {
    if (!invoiceNumber.trim()) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "يرجى إدخال رقم الفاتورة"
      })
      return
    }

    setIsLoading(true)
    try {
      const { getActiveCompanyId } = await import("@/lib/company")
      const companyId = await getActiveCompanyId(supabase)

      // البحث عن الفاتورة
      const { data: invoiceData, error: invoiceErr } = await supabase
        .from("invoices")
        .select("*")
        .eq("company_id", companyId)
        .eq("invoice_number", invoiceNumber.trim())
        .single()

      if (invoiceErr || !invoiceData) {
        toast({
          variant: "destructive",
          title: "خطأ",
          description: "الفاتورة غير موجودة"
        })
        return
      }

      if (invoiceData.status !== 'sent') {
        toast({
          variant: "destructive",
          title: "خطأ",
          description: `هذه الفاتورة ليست في حالة مرسلة. الحالة الحالية: ${invoiceData.status}`
        })
        return
      }

      setInvoice(invoiceData)

      // جلب بنود الفاتورة
      const { data: itemsData, error: itemsErr } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoiceData.id)

      if (itemsErr || !itemsData) {
        toast({
          variant: "destructive",
          title: "خطأ",
          description: "فشل في جلب بنود الفاتورة"
        })
        return
      }

      setInvoiceItems(itemsData)

      // تهيئة بنود المرتجع
      setReturnItems(itemsData.map((item: { id: string }) => ({
        item_id: item.id,
        returned_quantity: 0
      })))

      toast({
        title: "نجح",
        description: "تم العثور على الفاتورة"
      })

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: error.message || "حدث خطأ أثناء البحث"
      })
    } finally {
      setIsLoading(false)
    }
  }

  // تحديث كمية المرتجع لبند معين
  const updateReturnQuantity = (itemId: string, quantity: number) => {
    setReturnItems(prev =>
      prev.map(item =>
        item.item_id === itemId
          ? { ...item, returned_quantity: Math.max(0, quantity) }
          : item
      )
    )
  }

  // حساب إجمالي المرتجع
  const calculateReturnTotal = () => {
    let subtotal = 0
    let tax = 0

    returnItems.forEach(returnItem => {
      const invoiceItem = invoiceItems.find(item => item.id === returnItem.item_id)
      if (!invoiceItem || returnItem.returned_quantity <= 0) return

      const unitPrice = Number(invoiceItem.unit_price || 0)
      const discountPercent = Number(invoiceItem.discount_percent || 0)
      const taxRate = Number(invoiceItem.tax_rate || 0)

      const gross = returnItem.returned_quantity * unitPrice
      const discount = gross * (discountPercent / 100)
      const net = gross - discount
      const itemTax = net * (taxRate / 100)

      subtotal += net
      tax += itemTax
    })

    return { subtotal, tax, total: subtotal + tax }
  }

  // معالجة المرتجع
  const processReturn = async () => {
    if (!invoice) return

    const validReturnItems = returnItems.filter(item => item.returned_quantity > 0)
    if (validReturnItems.length === 0) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "يرجى تحديد كميات المرتجع"
      })
      return
    }

    setIsProcessing(true)
    try {
      const response = await fetch("/api/process-sent-invoice-return", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          invoice_id: invoice.id,
          return_items: validReturnItems,
          return_number: `RET-${invoice.invoice_number}`
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "حدث خطأ أثناء معالجة المرتجع")
      }

      toast({
        title: "نجح",
        description: data.data?.message || "تم معالجة المرتجع بنجاح"
      })

      // إعادة تعيين النموذج
      setInvoice(null)
      setInvoiceItems([])
      setReturnItems([])
      setInvoiceNumber("")

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: error.message || "حدث خطأ أثناء معالجة المرتجع"
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const returnTotals = calculateReturnTotal()

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6">

        {/* تحذير هام */}
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
              <AlertTriangle className="w-5 h-5" />
              تنبيه هام - معالجة مرتجعات الفواتير المرسلة (Sent)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-orange-700 dark:text-orange-300">
            <div className="space-y-2">
              <p><strong>✅ المسموح فقط:</strong></p>
              <ul className="list-disc list-inside space-y-1 mr-4">
                <li>تعديل بيانات الفاتورة نفسها (تحديث الكميات والصافي والإجمالي)</li>
                <li>تحديث ذمم العميل (AR) في القيد الأصلي</li>
                <li>تحديث حركات المخزون</li>
              </ul>
              <p><strong>🚫 ممنوع تماماً:</strong></p>
              <ul className="list-disc list-inside space-y-1 mr-4">
                <li>إنشاء أي قيد مالي جديد</li>
                <li>إنشاء قيد Cash أو COGS أو Revenue إضافي</li>
                <li>المساس بأي فواتير أو قيود أخرى</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* البحث عن الفاتورة */}
        <Card>
          <CardHeader>
            <CardTitle>البحث عن فاتورة مرسلة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="invoice_number">رقم الفاتورة</Label>
                <Input
                  id="invoice_number"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="INV-0001"
                  onKeyPress={(e) => e.key === 'Enter' && searchInvoice()}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={searchInvoice}
                  disabled={isLoading}
                >
                  {isLoading ? "جاري البحث..." : "بحث"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* تفاصيل الفاتورة */}
        {invoice && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>فاتورة {invoice.invoice_number}</span>
                <Badge className="bg-blue-100 text-blue-800">
                  {invoice.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">المجموع الفرعي:</span>
                  <div className="font-medium">{Number(invoice.subtotal).toFixed(2)}</div>
                </div>
                <div>
                  <span className="text-gray-500">الضريبة:</span>
                  <div className="font-medium">{Number(invoice.tax_amount).toFixed(2)}</div>
                </div>
                <div>
                  <span className="text-gray-500">الإجمالي:</span>
                  <div className="font-medium">{Number(invoice.total_amount).toFixed(2)}</div>
                </div>
                <div>
                  <span className="text-gray-500">المرتجع السابق:</span>
                  <div className="font-medium">{Number(invoice.returned_amount || 0).toFixed(2)}</div>
                </div>
              </div>

              {/* بنود الفاتورة */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-600 border-b">
                      <th className="text-right p-3">المنتج</th>
                      <th className="text-right p-3">الكمية الأصلية</th>
                      <th className="text-right p-3">المرتجع السابق</th>
                      <th className="text-right p-3">المتاح للمرتجع</th>
                      <th className="text-right p-3">كمية المرتجع</th>
                      <th className="text-right p-3">السعر</th>
                      <th className="text-right p-3">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceItems.map((item, idx) => {
                      const returnItem = returnItems.find(r => r.item_id === item.id)
                      const availableQty = Number(item.quantity) - Number(item.returned_quantity || 0)
                      const returnQty = returnItem?.returned_quantity || 0

                      // حساب إجمالي هذا البند
                      const unitPrice = Number(item.unit_price || 0)
                      const discountPercent = Number(item.discount_percent || 0)
                      const taxRate = Number(item.tax_rate || 0)
                      const gross = returnQty * unitPrice
                      const discount = gross * (discountPercent / 100)
                      const net = gross - discount
                      const tax = net * (taxRate / 100)
                      const lineTotal = net + tax

                      return (
                        <tr key={item.id} className="border-b">
                          <td className="p-3">{item.description}</td>
                          <td className="p-3 text-center">{item.quantity}</td>
                          <td className="p-3 text-center">{item.returned_quantity || 0}</td>
                          <td className="p-3 text-center font-medium">{availableQty}</td>
                          <td className="p-3">
                            <NumericInput
                              min={0}
                              max={availableQty}
                              value={returnQty}
                              onChange={(val) => updateReturnQuantity(item.id, Math.round(val))}
                              className="w-20"
                              disabled={availableQty <= 0}
                            />
                          </td>
                          <td className="p-3">{unitPrice.toFixed(2)}</td>
                          <td className="p-3 font-medium">
                            {returnQty > 0 ? lineTotal.toFixed(2) : "0.00"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* إجمالي المرتجع */}
              {returnTotals.total > 0 && (
                <div className="border-t pt-4">
                  <div className="flex justify-end">
                    <div className="w-64 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>المجموع الفرعي:</span>
                        <span>{returnTotals.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>الضريبة:</span>
                        <span>{returnTotals.tax.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-lg border-t pt-2">
                        <span>إجمالي المرتجع:</span>
                        <span>{returnTotals.total.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* أزرار العمل */}
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setInvoice(null)
                    setInvoiceItems([])
                    setReturnItems([])
                    setInvoiceNumber("")
                  }}
                >
                  إلغاء
                </Button>
                <Button
                  onClick={processReturn}
                  disabled={isProcessing || returnTotals.total <= 0}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {isProcessing ? "جاري المعالجة..." : "معالجة المرتجع"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}