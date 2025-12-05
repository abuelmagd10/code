"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { FileCheck } from "lucide-react"

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

    const supplierIds: string[] = Array.from(new Set((list || []).map((c: any) => c.supplier_id)))
    if (supplierIds.length) {
      const { data: sups } = await supabase.from("suppliers").select("id, name").in("id", supplierIds)
      const map: Record<string, Supplier> = {};
      (sups || []).forEach((s: any) => { map[s.id] = s; });
      setSuppliers(map)
    }
  }

  const getSupplierName = (id: string) => suppliers[id]?.name || "—"
  const remaining = (vc: VendorCredit) => Number(vc.total_amount || 0) - Number(vc.applied_amount || 0)

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* رأس الصفحة - تحسين للهاتف */}
        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                <FileCheck className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang==='en' ? 'Vendor Credits' : 'إشعارات الموردين'}</h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang==='en' ? 'Credit notes' : 'إشعارات الدائن'}</p>
              </div>
            </div>
            <Link href="/vendor-credits/new"><Button className="h-10 sm:h-11 text-sm sm:text-base">{appLang==='en' ? 'New' : 'جديد'}</Button></Link>
          </div>
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

