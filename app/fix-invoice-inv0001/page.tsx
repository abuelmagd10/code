"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getActiveCompanyId } from "@/lib/company"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter } from "next/navigation"

export default function FixInvoiceINV0001Page() {
  const supabase = useSupabase()
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleFix = async () => {
    setIsProcessing(true)
    setResult(null)
    setError(null)

    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        setError("لم يتم العثور على معرف الشركة. يرجى التأكد من تسجيل الدخول واختيار شركة نشطة.")
        return
      }

      const response = await fetch("/api/fix-invoice-return-sent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          invoice_number: "INV-0001",
          company_id: companyId
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "حدث خطأ أثناء تصحيح الفاتورة")
      }

      setResult(data.data)
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء تصحيح الفاتورة")
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>تصحيح مرتجع فاتورة INV-0001</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <p className="text-sm">
              <strong>الهدف:</strong> تصحيح الفاتورة INV-0001 التي تم عمل مرتجع جزئي لها قبل التعديلات الجديدة.
            </p>
            <p className="text-sm mt-2">
              <strong>الإجراءات:</strong>
            </p>
            <ul className="list-disc list-inside text-sm mt-1 space-y-1">
              <li>حذف قيود sales_return القديمة</li>
              <li>تحديث القيد الأصلي (invoice) ليعكس القيم الصحيحة بعد المرتجع</li>
              <li>ربط حركات المخزون بالقيد الأصلي</li>
            </ul>
          </div>

          <Button 
            onClick={handleFix} 
            disabled={isProcessing}
            className="w-full"
            size="lg"
          >
            {isProcessing ? "جاري تصحيح الفاتورة..." : "تصحيح الفاتورة INV-0001"}
          </Button>

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <h3 className="font-semibold text-red-600 mb-2">خطأ:</h3>
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {result && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-3">
              <h3 className="font-semibold text-lg">نتيجة التصحيح:</h3>
              
              {result.error ? (
                <p className="text-red-600">{result.error}</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <strong>رقم الفاتورة:</strong> {result.invoice_number}
                    </div>
                    <div>
                      <strong>حالة الفاتورة:</strong> {result.invoice_status}
                    </div>
                  </div>

                  <div className="border-t pt-2 mt-2">
                    <h4 className="font-semibold mb-2">القيود القديمة:</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <strong>قيود مرتجع موجودة:</strong> {result.old_return_entries_found}
                      </div>
                      <div>
                        <strong>قيود مرتجع محذوفة:</strong> {result.old_return_entries_deleted}
                      </div>
                      <div>
                        <strong>سطور قيود محذوفة:</strong> {result.old_return_lines_deleted}
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-2 mt-2">
                    <h4 className="font-semibold mb-2">التحديثات:</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <strong>القيد الأصلي محدث:</strong> {result.original_entry_updated ? "✅ نعم" : "❌ لا"}
                      </div>
                      <div>
                        <strong>حركات مخزون محدثة:</strong> {result.inventory_transactions_updated}
                      </div>
                    </div>
                  </div>

                  {result.errors && result.errors.length > 0 && (
                    <div className="border-t pt-2 mt-2">
                      <h4 className="font-semibold text-red-600 mb-2">أخطاء:</h4>
                      <ul className="list-disc list-inside space-y-1">
                        {result.errors.map((err: string, idx: number) => (
                          <li key={idx} className="text-red-600 text-xs">{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.message && (
                    <div className="border-t pt-2 mt-2">
                      <p className="text-green-600 font-semibold">{result.message}</p>
                    </div>
                  )}

                  {result.success && (
                    <div className="mt-4">
                      <Button 
                        onClick={() => router.push(`/invoices/${result.invoice_id}`)}
                        className="w-full"
                        variant="outline"
                      >
                        عرض الفاتورة
                      </Button>
                    </div>
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

