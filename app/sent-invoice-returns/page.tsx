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
import { ERPPageHeader } from "@/components/erp-page-header"

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
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  useEffect(() => {
    const handler = () => {
      try {
        setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

  const t = (en: string, ar: string) => appLang === 'en' ? en : ar

  // البحث عن الفاتورة
  const searchInvoice = async () => {
    if (!invoiceNumber.trim()) {
      toast({
        variant: "destructive",
        title: t("Error", "خطأ"),
        description: t("Please enter the invoice number", "يرجى إدخال رقم الفاتورة")
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
          title: t("Error", "خطأ"),
          description: t("Invoice not found", "الفاتورة غير موجودة")
        })
        return
      }

      if (invoiceData.status !== 'sent') {
        toast({
          variant: "destructive",
          title: t("Error", "خطأ"),
          description: appLang === 'en' ? `This invoice is not in Sent status. Current status: ${invoiceData.status}` : `هذه الفاتورة ليست في حالة مرسلة. الحالة الحالية: ${invoiceData.status}`
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
          title: t("Error", "خطأ"),
          description: t("Failed to load invoice items", "فشل في جلب بنود الفاتورة")
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
        title: t("Success", "نجح"),
        description: t("Invoice found", "تم العثور على الفاتورة")
      })

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("Error", "خطأ"),
        description: error.message || t("An error occurred while searching", "حدث خطأ أثناء البحث")
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
        title: t("Error", "خطأ"),
        description: t("Please specify the return quantities", "يرجى تحديد كميات المرتجع")
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
        throw new Error(data.error || t("An error occurred while processing the return", "حدث خطأ أثناء معالجة المرتجع"))
      }

      toast({
        title: t("Success", "نجح"),
        description: data.data?.message || t("Return processed successfully", "تم معالجة المرتجع بنجاح")
      })

      // إعادة تعيين النموذج
      setInvoice(null)
      setInvoiceItems([])
      setReturnItems([])
      setInvoiceNumber("")

    } catch (error: any) {
      toast({
        variant: "destructive",
        title: t("Error", "خطأ"),
        description: error.message || t("An error occurred while processing the return", "حدث خطأ أثناء معالجة المرتجع")
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const returnTotals = calculateReturnTotal()

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6">

        {/* Header — Added ERPPageHeader (v3.55.0) */}
        <ERPPageHeader
          title={t("Sent Invoice Returns", "مرتجعات الفواتير المُرسَلة")}
          description={t("Process returns for invoices in Sent status (without new financial entries)", "معالجة مرتجعات الفواتير في حالة Sent (دون قيود مالية جديدة)")}
          variant="list"
          lang={appLang}
        />

        {/* تحذير هام */}
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
              <AlertTriangle className="w-5 h-5" />
              {t("Important Notice - Processing Returns for Sent Invoices", "تنبيه هام - معالجة مرتجعات الفواتير المرسلة (Sent)")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-orange-700 dark:text-orange-300">
            <div className="space-y-2">
              <p><strong>{t("✅ Allowed only:", "✅ المسموح فقط:")}</strong></p>
              <ul className="list-disc list-inside space-y-1 mr-4">
                <li>{t("Editing the invoice data itself (updating quantities, net, and total)", "تعديل بيانات الفاتورة نفسها (تحديث الكميات والصافي والإجمالي)")}</li>
                <li>{t("Updating customer receivables (AR) in the original journal entry", "تحديث ذمم العميل (AR) في القيد الأصلي")}</li>
                <li>{t("Updating inventory movements", "تحديث حركات المخزون")}</li>
              </ul>
              <p><strong>{t("🚫 Strictly forbidden:", "🚫 ممنوع تماماً:")}</strong></p>
              <ul className="list-disc list-inside space-y-1 mr-4">
                <li>{t("Creating any new financial entry", "إنشاء أي قيد مالي جديد")}</li>
                <li>{t("Creating an additional Cash, COGS, or Revenue entry", "إنشاء قيد Cash أو COGS أو Revenue إضافي")}</li>
                <li>{t("Touching any other invoices or journal entries", "المساس بأي فواتير أو قيود أخرى")}</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* البحث عن الفاتورة */}
        <Card>
          <CardHeader>
            <CardTitle>{t("Search for a Sent Invoice", "البحث عن فاتورة مرسلة")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="invoice_number">{t("Invoice Number", "رقم الفاتورة")}</Label>
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
                  {isLoading ? t("Searching...", "جاري البحث...") : t("Search", "بحث")}
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
                <span>{t("Invoice", "فاتورة")} {invoice.invoice_number}</span>
                <Badge className="bg-blue-100 text-blue-800">
                  {invoice.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">{t("Subtotal:", "المجموع الفرعي:")}</span>
                  <div className="font-medium">{Number(invoice.subtotal).toFixed(2)}</div>
                </div>
                <div>
                  <span className="text-gray-500">{t("Tax:", "الضريبة:")}</span>
                  <div className="font-medium">{Number(invoice.tax_amount).toFixed(2)}</div>
                </div>
                <div>
                  <span className="text-gray-500">{t("Total:", "الإجمالي:")}</span>
                  <div className="font-medium">{Number(invoice.total_amount).toFixed(2)}</div>
                </div>
                <div>
                  <span className="text-gray-500">{t("Previously Returned:", "المرتجع السابق:")}</span>
                  <div className="font-medium">{Number(invoice.returned_amount || 0).toFixed(2)}</div>
                </div>
              </div>

              {/* بنود الفاتورة */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-600 border-b">
                      <th className="text-right p-3">{t("Product", "المنتج")}</th>
                      <th className="text-right p-3">{t("Original Quantity", "الكمية الأصلية")}</th>
                      <th className="text-right p-3">{t("Previously Returned", "المرتجع السابق")}</th>
                      <th className="text-right p-3">{t("Available for Return", "المتاح للمرتجع")}</th>
                      <th className="text-right p-3">{t("Return Quantity", "كمية المرتجع")}</th>
                      <th className="text-right p-3">{t("Price", "السعر")}</th>
                      <th className="text-right p-3">{t("Total", "الإجمالي")}</th>
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
                        <span>{t("Subtotal:", "المجموع الفرعي:")}</span>
                        <span>{returnTotals.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t("Tax:", "الضريبة:")}</span>
                        <span>{returnTotals.tax.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-lg border-t pt-2">
                        <span>{t("Return Total:", "إجمالي المرتجع:")}</span>
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
                  {t("Cancel", "إلغاء")}
                </Button>
                <Button
                  onClick={processReturn}
                  disabled={isProcessing || returnTotals.total <= 0}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {isProcessing ? t("Processing...", "جاري المعالجة...") : t("Process Return", "معالجة المرتجع")}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}