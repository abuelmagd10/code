"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Trash2, AlertTriangle } from "lucide-react"

export default function DeleteTransfersPage() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [results, setResults] = useState<any>(null)

  const transferNumbers = [
    "TR-FINAL-260103-0127",
    "TR-TEST-260103-0120",
    "TR-TEST-260103-0113",
    "TR-TEST-260103-0101",
    "TR-TEST-260103-0052",
    "TR-260103-3763",
    "TR-260103-3048"
  ]

  const handleDelete = async () => {
    if (!confirm(`هل أنت متأكد من حذف ${transferNumbers.length} طلب نقل؟\n\nسيتم إرجاع المنتجات للمخازن المصدرة تلقائياً.`)) {
      return
    }

    setIsProcessing(true)
    setResults(null)

    try {
      const response = await fetch("/api/delete-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transfer_numbers: transferNumbers })
      })

      const data = await response.json()
      setResults(data)

    } catch (error: any) {
      setResults({
        success: false,
        error: error.message
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="w-6 h-6 text-red-600" />
            حذف طلبات النقل
          </CardTitle>
          <CardDescription>
            حذف طلبات النقل التجريبية وإرجاع المنتجات للمخازن المصدرة
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* قائمة الطلبات */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-yellow-900">طلبات النقل المراد حذفها:</h3>
                <p className="text-sm text-yellow-700 mt-1">سيتم حذف {transferNumbers.length} طلب نقل</p>
              </div>
            </div>
            
            <ul className="space-y-1 mt-3">
              {transferNumbers.map((num, idx) => (
                <li key={idx} className="text-sm font-mono bg-white px-3 py-1.5 rounded border">
                  {num}
                </li>
              ))}
            </ul>
          </div>

          {/* زر الحذف */}
          <Button
            onClick={handleDelete}
            disabled={isProcessing}
            variant="destructive"
            size="lg"
            className="w-full"
          >
            {isProcessing ? "جاري الحذف..." : "🗑️ حذف جميع الطلبات"}
          </Button>

          {/* النتائج */}
          {results && (
            <div className={`rounded-lg p-4 ${results.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border`}>
              <h3 className="font-semibold mb-3">
                {results.success ? "✅ النتائج" : "❌ خطأ"}
              </h3>

              {results.summary && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-white rounded p-3 text-center">
                    <div className="text-2xl font-bold">{results.summary.total}</div>
                    <div className="text-xs text-gray-600">الإجمالي</div>
                  </div>
                  <div className="bg-green-100 rounded p-3 text-center">
                    <div className="text-2xl font-bold text-green-700">{results.summary.succeeded}</div>
                    <div className="text-xs text-green-700">نجح</div>
                  </div>
                  <div className="bg-red-100 rounded p-3 text-center">
                    <div className="text-2xl font-bold text-red-700">{results.summary.failed}</div>
                    <div className="text-xs text-red-700">فشل</div>
                  </div>
                </div>
              )}

              {results.results && (
                <div className="space-y-2">
                  {results.results.map((result: any, idx: number) => (
                    <div key={idx} className={`p-3 rounded text-sm ${result.status === 'success' ? 'bg-green-100' : 'bg-red-100'}`}>
                      <div className="font-mono font-semibold">{result.transfer_number}</div>
                      <div className="text-xs mt-1">
                        {result.status === 'success' ? (
                          <>
                            ✅ {result.message} ({result.items_count} منتج)
                            {result.was_in_transit && " - تم إرجاع المنتجات"}
                          </>
                        ) : (
                          <>❌ {result.error}</>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {results.error && (
                <div className="text-red-700">{results.error}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

