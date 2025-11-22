"use client"
import { useEffect, useState } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Sidebar } from "@/components/sidebar"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default function InventoryAuditPage() {
  const supabase = useSupabase()
  const [companyId, setCompanyId] = useState<string>("")
  const [from, setFrom] = useState<string>(() => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10) })
  const [to, setTo] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [sales, setSales] = useState<any[]>([])
  const [purchases, setPurchases] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { (async () => { const cid = await getActiveCompanyId(supabase); if (cid) { setCompanyId(cid); await runAudit(cid) } })() }, [])

  const runAudit = async (cid: string) => {
    setLoading(true)
    try {
      const url = `/api/inventory-audit?companyId=${encodeURIComponent(cid)}&from=${from}&to=${to}`
      const res = await fetch(url)
      const data = await res.json()
      if (res.ok) { setSummary(data.summary); setSales(data.salesMismatches||[]); setPurchases(data.purchaseMismatches||[]) } else { setSummary({ error: data?.error||'failed' }) }
    } finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">مراجعة المخزون مقابل الفواتير</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">تحقق من مطابقة الحركات مع الفواتير وفواتير الشراء</p>
          </div>

          <Card>
            <CardHeader><CardTitle>المرشحات</CardTitle></CardHeader>
            <CardContent className="grid md:grid-cols-4 gap-4 items-end">
              <div><label className="block mb-1">من</label><Input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} /></div>
              <div><label className="block mb-1">إلى</label><Input type="date" value={to} onChange={(e)=>setTo(e.target.value)} /></div>
              <div className="md:col-span-2"><Button disabled={loading || !companyId} onClick={()=>runAudit(companyId)}>تشغيل المراجعة</Button></div>
              {summary ? (<div className="md:col-span-4 text-sm text-gray-700 dark:text-gray-300">فواتير: {summary.invoices_count} | فواتير شراء: {summary.bills_count} | اختلافات بيع: {summary.sales_mismatches} | اختلافات شراء: {summary.purchase_mismatches}</div>) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>اختلافات البيع</CardTitle></CardHeader>
            <CardContent>
              {sales.length === 0 ? (<p className="text-gray-600 dark:text-gray-300">لا توجد اختلافات.</p>) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b"><tr><th className="p-2 text-right">رقم الفاتورة</th><th className="p-2 text-right">المنتج</th><th className="p-2 text-right">المتوقع</th><th className="p-2 text-right">الفعلي (المخزون)</th><th className="p-2 text-right">الفرق</th></tr></thead>
                    <tbody>
                      {sales.map((r, i) => (<tr key={i} className="border-b"><td className="p-2">{r.invoice_number}</td><td className="p-2">{r.product_name || r.product_id}</td><td className="p-2">{r.expected_qty}</td><td className="p-2">{r.actual_qty}</td><td className="p-2">{r.delta}</td></tr>))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>اختلافات الشراء</CardTitle></CardHeader>
            <CardContent>
              {purchases.length === 0 ? (<p className="text-gray-600 dark:text-gray-300">لا توجد اختلافات.</p>) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b"><tr><th className="p-2 text-right">رقم فاتورة الشراء</th><th className="p-2 text-right">المنتج</th><th className="p-2 text-right">المتوقع</th><th className="p-2 text-right">الفعلي (المخزون)</th><th className="p-2 text-right">الفرق</th></tr></thead>
                    <tbody>
                      {purchases.map((r, i) => (<tr key={i} className="border-b"><td className="p-2">{r.bill_number}</td><td className="p-2">{r.product_name || r.product_id}</td><td className="p-2">{r.expected_qty}</td><td className="p-2">{r.actual_qty}</td><td className="p-2">{r.delta}</td></tr>))}
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
