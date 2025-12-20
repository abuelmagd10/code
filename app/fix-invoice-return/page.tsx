"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"

export default function FixInvoiceReturnPage() {
  const [invoiceNumber, setInvoiceNumber] = useState("INV-0001")
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const { toast } = useToast()

  const handleFix = async () => {
    if (!invoiceNumber.trim()) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "يرجى إدخال رقم الفاتورة"
      })
      return
    }

    setIsProcessing(true)
    setResult(null)

    try {
      const companyId = await getActiveCompanyId()
      if (!companyId) {
        toast({
          variant: "destructive",
          title: "خطأ",
          description: "لم يتم العثور على معرف الشركة"
        })
        return
      }

      const response = await fetch("/api/fix-invoice-return-sent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          invoice_number: invoiceNumber.trim(),
          company_id: companyId
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "حدث خطأ أثناء تصحيح الفاتورة")
      }

      setResult(data.data)
      toast({
        title: "نجح",
        description: data.data?.message || "تم تصحيح الفاتورة بنجاح"
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: error.message || "حدث خطأ أثناء تصحيح الفاتورة"
      })
      setResult({ error: error.message })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>تصحيح مرتجع فاتورة مرسلة (Sent)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invoice_number">رقم الفاتورة</Label>
            <Input
              id="invoice_number"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="INV-0001"
            />
          </div>

          <Button 
            onClick={handleFix} 
            disabled={isProcessing}
            className="w-full"
          >
            {isProcessing ? "جاري المعالجة..." : "تصحيح الفاتورة"}
          </Button>

          {result && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
              <h3 className="font-semibold">النتيجة:</h3>
              {result.error ? (
                <p className="text-red-600">{result.error}</p>
              ) : (
                <div className="space-y-1 text-sm">
                  <p><strong>رقم الفاتورة:</strong> {result.invoice_number}</p>
                  <p><strong>حالة الفاتورة:</strong> {result.invoice_status}</p>
                  <p><strong>قيود مرتجع قديمة موجودة:</strong> {result.old_return_entries_found}</p>
                  <p><strong>قيود مرتجع قديمة محذوفة:</strong> {result.old_return_entries_deleted}</p>
                  <p><strong>سطور قيود محذوفة:</strong> {result.old_return_lines_deleted}</p>
                  <p><strong>القيد الأصلي محدث:</strong> {result.original_entry_updated ? "نعم" : "لا"}</p>
                  <p><strong>حركات مخزون محدثة:</strong> {result.inventory_transactions_updated}</p>
                  {result.errors && result.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="font-semibold text-red-600">أخطاء:</p>
                      <ul className="list-disc list-inside">
                        {result.errors.map((err: string, idx: number) => (
                          <li key={idx} className="text-red-600">{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {result.message && (
                    <p className="mt-2 text-green-600 font-semibold">{result.message}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

