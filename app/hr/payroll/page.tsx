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
  const [employees, setEmployees] = useState<any[]>([])
  const [adjustments, setAdjustments] = useState<Record<string, { allowances: number; deductions: number; bonuses: number; advances: number; insurance: number }>>({})
  const [loading, setLoading] = useState(false)
  const [paymentAccounts, setPaymentAccounts] = useState<any[]>([])
  const [paymentAccountId, setPaymentAccountId] = useState<string>("")

  useEffect(() => { (async () => { const cid = await getActiveCompanyId(supabase); if (cid) { setCompanyId(cid); const res = await fetch(`/api/hr/employees?companyId=${encodeURIComponent(cid)}`); const data = res.ok ? await res.json() : []; setEmployees(Array.isArray(data) ? data : []); const { data: accs } = await supabase.from('chart_of_accounts').select('id, account_code, account_name, account_type, sub_type').eq('company_id', cid).order('account_code'); const pays = (accs || []).filter((a: any) => String(a.account_type||'')==='asset' && ['cash','bank'].includes(String((a as any).sub_type||''))); setPaymentAccounts(pays); } })() }, [supabase])

  const runPayroll = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const rows = Object.entries(adjustments).map(([employee_id, v]) => ({ employee_id, ...v }))
      const res = await fetch('/api/hr/payroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, year, month, adjustments: rows }) })
      const data = await res.json()
      if (res.ok) { setResult(data); toast({ title: 'تم حساب المرتبات' }) } else { toast({ title: 'خطأ', description: data?.error || 'فشل الحساب' }) }
    } catch { toast({ title: 'خطأ الشبكة' }) } finally { setLoading(false) }
  }

  const payPayroll = async () => {
    if (!companyId || !paymentAccountId) { toast({ title: 'حدد حساب الدفع (نقد/بنك)' }); return }
    setLoading(true)
    try {
      const res = await fetch('/api/hr/payroll/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, year, month, paymentAccountId }) })
      const data = await res.json()
      if (res.ok) { toast({ title: 'تم صرف المرتبات', description: `الإجمالي: ${Number(data?.total||0).toFixed(2)}` }) } else { toast({ title: 'خطأ', description: data?.error || 'فشل الصرف' }) }
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
              <div>
                <Label>الشهر</Label>
                <select className="w-full px-3 py-2 border rounded" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                  <option value={1}>يناير</option>
                  <option value={2}>فبراير</option>
                  <option value={3}>مارس</option>
                  <option value={4}>أبريل</option>
                  <option value={5}>مايو</option>
                  <option value={6}>يونيو</option>
                  <option value={7}>يوليو</option>
                  <option value={8}>أغسطس</option>
                  <option value={9}>سبتمبر</option>
                  <option value={10}>أكتوبر</option>
                  <option value={11}>نوفمبر</option>
                  <option value={12}>ديسمبر</option>
                </select>
              </div>
              <div><Label>حساب الدفع (نقد/بنك)</Label>
                <select className="w-full px-3 py-2 border rounded" value={paymentAccountId} onChange={(e) => setPaymentAccountId(e.target.value)}>
                  <option value="">اختر حساب</option>
                  {paymentAccounts.map((a) => (<option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>))}
                </select>
              </div>
              <div className="md:col-span-1"><Button disabled={loading} onClick={runPayroll}>تشغيل</Button></div>
              <div className="md:col-span-1"><Button disabled={loading || !paymentAccountId} variant="secondary" onClick={payPayroll}>صرف المرتبات</Button></div>
              {result ? (<div className="md:col-span-4 text-sm text-gray-700">إجمالي السجلات: {result?.count || 0}</div>) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>التعديلات (بدلات/خصومات) لكل موظف</CardTitle></CardHeader>
            <CardContent>
              {employees.length === 0 ? (<p className="text-gray-600">لا يوجد موظفون.</p>) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b">
                      <tr>
                        <th className="p-2 text-right">الموظف</th>
                        <th className="p-2 text-right">بدلات</th>
                        <th className="p-2 text-right">خصومات</th>
                        <th className="p-2 text-right">مكافآت</th>
                        <th className="p-2 text-right">سلف</th>
                        <th className="p-2 text-right">تأمينات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((e) => {
                        const v = adjustments[e.id] || { allowances: 0, deductions: 0, bonuses: 0, advances: 0, insurance: 0 }
                        return (
                          <tr key={e.id} className="border-b">
                            <td className="p-2">{e.full_name}</td>
                            <td className="p-2"><Input type="number" value={v.allowances} onChange={(ev) => setAdjustments({ ...adjustments, [e.id]: { ...v, allowances: Number(ev.target.value) } })} /></td>
                            <td className="p-2"><Input type="number" value={v.deductions} onChange={(ev) => setAdjustments({ ...adjustments, [e.id]: { ...v, deductions: Number(ev.target.value) } })} /></td>
                            <td className="p-2"><Input type="number" value={v.bonuses} onChange={(ev) => setAdjustments({ ...adjustments, [e.id]: { ...v, bonuses: Number(ev.target.value) } })} /></td>
                            <td className="p-2"><Input type="number" value={v.advances} onChange={(ev) => setAdjustments({ ...adjustments, [e.id]: { ...v, advances: Number(ev.target.value) } })} /></td>
                            <td className="p-2"><Input type="number" value={v.insurance} onChange={(ev) => setAdjustments({ ...adjustments, [e.id]: { ...v, insurance: Number(ev.target.value) } })} /></td>
                          </tr>
                        )
                      })}
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