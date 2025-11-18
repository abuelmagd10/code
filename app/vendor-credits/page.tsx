"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"

type VendorCredit = {
  id: string
  supplier_id: string
  credit_number: string
  credit_date: string
  total_amount: number
  applied_amount: number
  status: string
}

type Supplier = { id: string; name: string }

export default function VendorCreditsPage() {
  const supabase = useSupabase()
  const [credits, setCredits] = useState<VendorCredit[]>([])
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({})
  const [companyId, setCompanyId] = useState<string | null>(null)
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
    if (!company) return
    setCompanyId(company.id)

    const { data: list } = await supabase.from("vendor_credits").select("id, supplier_id, credit_number, credit_date, total_amount, applied_amount, status").eq("company_id", company.id)
    setCredits((list || []) as any)

    const supplierIds = Array.from(new Set((list || []).map((c: any) => c.supplier_id)))
    if (supplierIds.length) {
      const { data: sups } = await supabase.from("suppliers").select("id, name").in("id", supplierIds)
      const map: Record<string, Supplier> = {}
      (sups || []).forEach((s: any) => { map[s.id] = s })
      setSuppliers(map)
    }
  }

  const getSupplierName = (id: string) => suppliers[id]?.name || "—"
  const remaining = (vc: VendorCredit) => Number(vc.total_amount || 0) - Number(vc.applied_amount || 0)

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{appLang==='en' ? 'Vendor Credits' : 'إشعارات دائن الموردين'}</h1>
          <Link href="/vendor-credits/new"><Button>{appLang==='en' ? 'Create Credit Note' : 'إنشاء إشعار دائن'}</Button></Link>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-600">
                    <th className="text-right p-2">{appLang==='en' ? 'Credit No.' : 'رقم الإشعار'}</th>
                    <th className="text-right p-2">{appLang==='en' ? 'Date' : 'التاريخ'}</th>
                    <th className="text-right p-2">{appLang==='en' ? 'Supplier' : 'المورد'}</th>
                    <th className="text-right p-2">{appLang==='en' ? 'Total' : 'الإجمالي'}</th>
                    <th className="text-right p-2">{appLang==='en' ? 'Applied' : 'المطبّق'}</th>
                    <th className="text-right p-2">{appLang==='en' ? 'Remaining' : 'المتبقي'}</th>
                    <th className="text-right p-2">{appLang==='en' ? 'Status' : 'الحالة'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {credits.map(vc => (
                    <tr key={vc.id} className="border-t">
                      <td className="p-2">{vc.credit_number}</td>
                      <td className="p-2">{vc.credit_date}</td>
                      <td className="p-2">{getSupplierName(vc.supplier_id)}</td>
                      <td className="p-2 text-right">{Number(vc.total_amount || 0).toFixed(2)}</td>
                      <td className="p-2 text-right">{Number(vc.applied_amount || 0).toFixed(2)}</td>
                      <td className="p-2 text-right">{remaining(vc).toFixed(2)}</td>
                      <td className="p-2">{vc.status}</td>
                      <td className="p-2"><Link className="text-blue-600" href={`/vendor-credits/${vc.id}`}>{appLang==='en' ? 'View' : 'عرض'}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

