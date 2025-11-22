"use client"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"

export default function PayrollPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [companyId, setCompanyId] = useState<string>("")
  const [year, setYear] = useState<number>(new Date().getFullYear())
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1)
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { (async () => { const cid = await getActiveCompanyId(supabase); if (cid) setCompanyId(cid) })() }, [supabase])

  const runPayroll = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const res = await fetch('/api/hr/payroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, year, month, adjustments: [] }) })
      const data = await res.json()
      if (res.ok) { setResult(data); toast({ title: 'تم حساب المرتبات' }) } else { toast({ title: 'خطأ', description: data?.error || 'فشل الحساب' }) }
    } catch { toast({ title: 'خطأ الشبكة' }) } finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">إدارة المرتبات</h1>
          <Card>
            <CardHeader><CardTitle>تشغيل المرتبات</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div><Label>السنة</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
              <div><Label>الشهر</Label><Input type="number" value={month} onChange={(e) => setMonth(Number(e.target.value))} /></div>
              <div className="md:col-span-2"><Button disabled={loading} onClick={runPayroll}>تشغيل</Button></div>
              {result ? (<div className="md:col-span-4 text-sm text-gray-700">إجمالي السجلات: {result?.count || 0}</div>) : null}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}