"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { CheckCircle, AlertTriangle } from "lucide-react"

export default function FixINV0001Page() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const { toast } = useToast()

  const handleFix = async () => {
    setIsProcessing(true)
    setResult(null)

    try {
      const response = await fetch("/api/fix-inv0001-foodcana", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "حدث خطأ أثناء التصحيح")
      }

      setResult(data.data)
      toast({
        title: "نجح",
        description: data.data?.message || "تم التصحيح بنجاح"
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: error.message
      })
      setResult({ error: error.message })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card className="border-orange-200 bg-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-orange-800">
            <AlertTriangle className="w-5 h-5" />
            تصحيح الفاتورة INV-0001 - شركة foodcana
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-orange-700 space-y-2">
            <p><strong>الهدف:</strong> تصحيح مرتجع الفاتورة INV-0001 ليتوافق مع النمط المحاسبي الجديد</p>
            <p><strong>العمليات:</strong></p>
            <ul className="list-disc list-inside mr-4 space-y-1">
              <li>حذف قيود sales_return القديمة</li>
              <li>تحديث بيانات الفاتورة بالقيم الصحيحة</li>
              <li>تحديث القيد الأصلي (AR/Revenue/VAT)</li>
              <li>ربط حركات المخزون بالقيد الأصلي</li>
            </ul>
          </div>

          <Button 
            onClick={handleFix} 
            disabled={isProcessing}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            {isProcessing ? "جاري التصحيح..." : "تصحيح الفاتورة INV-0001"}
          </Button>

          <Button 
            onClick={async () => {
              setIsProcessing(true)
              try {
                const response = await fetch("/api/fix-invoice-display", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" }
                })
                const data = await response.json()
                if (response.ok) {
                  setResult(data.data)
                  toast({ title: "نجح", description: "تم تصحيح عرض الفاتورة" })
                } else {
                  throw new Error(data.error)
                }
              } catch (error: any) {
                toast({ variant: "destructive", title: "خطأ", description: error.message })
              } finally {
                setIsProcessing(false)
              }
            }}
            disabled={isProcessing}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            تصحيح عرض المرتجعات
          </Button>

          {result && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-2">
              <h3 className="font-semibold">النتيجة:</h3>
              {result.error ? (
                <p className="text-red-600">{result.error}</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <p><strong>الشركة:</strong> {result.company_name}</p>
                  <p><strong>رقم الفاتورة:</strong> {result.invoice_number}</p>
                  <p><strong>حالة الفاتورة:</strong> {result.invoice_status}</p>
                  
                  {result.steps && result.steps.length > 0 && (
                    <div>
                      <p className="font-semibold text-green-600">الخطوات المنجزة:</p>
                      <ul className="list-disc list-inside mr-4">
                        {result.steps.map((step: string, idx: number) => (
                          <li key={idx} className="text-green-600">{step}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.new_values && (
                    <div className="bg-blue-50 p-3 rounded">
                      <p className="font-semibold">القيم الجديدة:</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>المجموع الفرعي: {Number(result.new_values.subtotal).toFixed(2)}</div>
                        <div>الضريبة: {Number(result.new_values.tax_amount).toFixed(2)}</div>
                        <div>الإجمالي: {Number(result.new_values.total_amount).toFixed(2)}</div>
                        <div>المرتجع: {Number(result.new_values.returned_amount).toFixed(2)}</div>
                      </div>
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