"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type TaxCode = {
  id: string
  name: string
  rate: number
  scope: "sales" | "purchase" | "both"
}

const STORAGE_KEY = "tax_codes"

export default function TaxSettingsPage() {
  const [codes, setCodes] = useState<TaxCode[]>([])
  const [name, setName] = useState("")
  const [rate, setRate] = useState<number>(5)
  const [scope, setScope] = useState<"sales" | "purchase" | "both">("both")

  // Load presets from localStorage (fallback defaults similar to Zoho VAT presets)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        setCodes(JSON.parse(raw))
      } else {
        const defaults: TaxCode[] = [
          { id: crypto.randomUUID(), name: "بدون ضريبة", rate: 0, scope: "both" },
          { id: crypto.randomUUID(), name: "VAT 5%", rate: 5, scope: "both" },
          { id: crypto.randomUUID(), name: "VAT 15%", rate: 15, scope: "both" },
        ]
        setCodes(defaults)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults))
      }
    } catch {
      // ignore
    }
  }, [])

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(codes))
    } catch {
      // ignore
    }
  }, [codes])

  const addCode = () => {
    if (!name.trim()) return
    const newCode: TaxCode = { id: crypto.randomUUID(), name: name.trim(), rate: Math.max(0, rate), scope }
    setCodes((prev) => [...prev, newCode])
    setName("")
    setRate(5)
    setScope("both")
  }

  const removeCode = (id: string) => {
    setCodes((prev) => prev.filter((c) => c.id !== id))
  }

  const sortedCodes = useMemo(() => {
    return [...codes].sort((a, b) => a.rate - b.rate)
  }, [codes])

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">إعدادات الضرائب</h1>
            <span className="text-sm text-gray-500">تعريف رموز ونِسَب الضريبة مثل Zoho</span>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>إضافة رمز ضريبة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-2">
                  <Label>الاسم</Label>
                  <Input placeholder="مثال: VAT 5%" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>النسبة %</Label>
                  <Input type="number" step="0.01" min={0} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>النطاق</Label>
                  <select className="w-full px-3 py-2 border rounded-lg" value={scope} onChange={(e) => setScope(e.target.value as any)}>
                    <option value="sales">مبيعات</option>
                    <option value="purchase">مشتريات</option>
                    <option value="both">كلاهما</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <Button onClick={addCode}>إضافة</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>الرموز المعرفة</CardTitle>
            </CardHeader>
            <CardContent>
              {sortedCodes.length === 0 ? (
                <p className="py-6 text-center text-gray-500">لا توجد رموز ضريبة بعد</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-slate-900">
                        <th className="px-3 py-2 text-right">الاسم</th>
                        <th className="px-3 py-2 text-right">النسبة</th>
                        <th className="px-3 py-2 text-right">النطاق</th>
                        <th className="px-3 py-2 text-right">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCodes.map((c) => (
                        <tr key={c.id} className="border-b">
                          <td className="px-3 py-2">{c.name}</td>
                          <td className="px-3 py-2">{c.rate}%</td>
                          <td className="px-3 py-2">{c.scope === "sales" ? "مبيعات" : c.scope === "purchase" ? "مشتريات" : "كلاهما"}</td>
                          <td className="px-3 py-2">
                            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => removeCode(c.id)}>حذف</Button>
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

