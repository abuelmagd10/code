"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function FixBillReturnPage() {
  const [billNumber, setBillNumber] = useState("BILL-0001")
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFix = async () => {
    if (!billNumber.trim()) {
      setError("يرجى إدخال رقم الفاتورة")
      return
    }

    setIsProcessing(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch("/api/fix-bill-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bill_number: billNumber.trim() })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || data.message || "حدث خطأ")
      }

      setResult(data.data?.results || data)
    } catch (err: any) {
      setError(err.message || "حدث خطأ غير متوقع")
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">🔧 إصلاح مرتجع فاتورة مشتريات</CardTitle>
          <CardDescription>
            حذف القيود المحاسبية وحركات المخزون الخاطئة للمرتجعات وإعادة حالة الفاتورة
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* إدخال رقم الفاتورة */}
          <div className="space-y-2">
            <label className="text-sm font-medium">رقم الفاتورة</label>
            <div className="flex gap-2">
              <Input
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                placeholder="BILL-0001"
                className="flex-1"
                disabled={isProcessing}
              />
              <Button
                onClick={handleFix}
                disabled={isProcessing || !billNumber.trim()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    جاري الإصلاح...
                  </>
                ) : (
                  "إصلاح الفاتورة"
                )}
              </Button>
            </div>
          </div>

          {/* رسالة خطأ */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* النتائج */}
          {result && (
            <div className="space-y-4">
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  تم إصلاح الفاتورة بنجاح!
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-semibold mb-2">معلومات الفاتورة</h3>
                  <p className="text-sm">رقم الفاتورة: {result.bill_number}</p>
                  <p className="text-sm">معرف الفاتورة: {result.bill_id}</p>
                </div>

                {result.deleted_entries && result.deleted_entries.length > 0 && (
                  <div className="p-4 bg-orange-50 rounded-lg">
                    <h3 className="font-semibold mb-2">
                      القيود المحذوفة ({result.deleted_entries.length})
                    </h3>
                    <ul className="text-sm space-y-1">
                      {result.deleted_entries.map((entry: any, idx: number) => (
                        <li key={idx} className="text-gray-700">
                          • {entry.description || entry.id}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.deleted_inventory_transactions && result.deleted_inventory_transactions.length > 0 && (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h3 className="font-semibold mb-2">
                      حركات المخزون المحذوفة ({result.deleted_inventory_transactions.length})
                    </h3>
                    <ul className="text-sm space-y-1">
                      {result.deleted_inventory_transactions.map((tx: any, idx: number) => (
                        <li key={idx} className="text-gray-700">
                          • المنتج: {tx.product_id} | الكمية: {tx.quantity_change}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {result.bill_restored && (
                  <div className="p-4 bg-green-50 rounded-lg">
                    <h3 className="font-semibold mb-2 text-green-800">
                      ✅ تم إعادة حالة الفاتورة بنجاح
                    </h3>
                    <p className="text-sm text-gray-700">
                      تم إعادة تعيين returned_amount إلى 0 وحالة الفاتورة إلى paid
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

