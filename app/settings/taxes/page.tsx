"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"
import { type TaxCode as TaxCodeModel, listTaxCodes, createTaxCode, deleteTaxCode, ensureDefaultsIfEmpty } from "@/lib/taxes"

export default function TaxSettingsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar'|'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try {
      const docLang = document.documentElement?.lang
      if (docLang === 'en') return 'en'
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      const v = fromCookie || localStorage.getItem('app_language') || 'ar'
      return v === 'en' ? 'en' : 'ar'
    } catch { return 'ar' }
  })
  const [hydrated, setHydrated] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [codes, setCodes] = useState<TaxCodeModel[]>([])
  const [name, setName] = useState("")
  const [rate, setRate] = useState<number>(5)
  const [scope, setScope] = useState<"sales" | "purchase" | "both">("both")

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const cid = await getActiveCompanyId(supabase)
        setCompanyId(cid)
        if (!cid) return
        await ensureDefaultsIfEmpty(supabase, cid)
        const data = await listTaxCodes(supabase, cid)
        setCodes(data)
      } catch (err: any) {
        const msg = err?.message || (typeof err === 'object' ? JSON.stringify(err) : String(err))
        console.error(msg)
        toastActionError(toast, appLang==='en' ? 'Load' : 'التحميل', appLang==='en' ? 'Taxes' : 'الضرائب', msg)
      } finally {
        setLoading(false)
      }
    }
    load()
    setHydrated(true)
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang
        if (docLang === 'en') { setAppLang('en'); return }
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        const v = fromCookie || localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    window.addEventListener('app_language_changed', handler)
    window.addEventListener('storage', (e: any) => { if (e?.key === 'app_language') handler() })
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [supabase])

  const addCode = async () => {
    try {
      if (!name.trim()) return
      const created = await createTaxCode(supabase, { name: name.trim(), rate: Math.max(0, rate), scope })
      setCodes((prev) => [...prev, created])
      setName("")
      setRate(5)
      setScope("both")
      toastActionSuccess(toast, "الإضافة", "رمز الضريبة")
    } catch (err: any) {
      console.error(err)
      toastActionError(toast, "الإضافة", "رمز الضريبة", err?.message)
    }
  }

  const removeCode = async (id: string) => {
    try {
      await deleteTaxCode(supabase, id)
      setCodes((prev) => prev.filter((c) => c.id !== id))
      toastActionSuccess(toast, "الحذف", "رمز الضريبة")
    } catch (err: any) {
      console.error(err)
      toastActionError(toast, "الحذف", "رمز الضريبة", err?.message)
    }
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
            <h1 className="text-2xl font-bold" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Tax Settings' : 'إعدادات الضرائب'}</h1>
            <span className="text-sm text-gray-500" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Define tax codes and rates' : 'تعريف رموز ونِسَب الضريبة'}</span>
          </div>

          <Card>
            <CardHeader>
              <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Add Tax Code' : 'إضافة رمز ضريبة'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="space-y-2">
                  <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Name' : 'الاسم'}</Label>
                  <Input placeholder={(hydrated && appLang==='en') ? 'e.g. VAT 5%' : 'مثال: VAT 5%'} value={name} onChange={(e) => setName(e.target.value)} suppressHydrationWarning />
                </div>
                <div className="space-y-2">
                  <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Rate %' : 'النسبة %'}</Label>
                  <Input type="number" step="0.01" min={0} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Scope' : 'النطاق'}</Label>
                  <select className="w-full px-3 py-2 border rounded-lg" value={scope} onChange={(e) => setScope(e.target.value as any)}>
                    <option value="sales" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Sales' : 'مبيعات'}</option>
                    <option value="purchase" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Purchase' : 'مشتريات'}</option>
                    <option value="both" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Both' : 'كلاهما'}</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <Button onClick={addCode} disabled={loading || !companyId}>{(hydrated && appLang==='en') ? 'Add' : 'إضافة'}</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Defined Codes' : 'الرموز المعرفة'}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-6 text-center text-gray-500" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Loading...' : 'جاري التحميل...'}</p>
              ) : sortedCodes.length === 0 ? (
                <p className="py-6 text-center text-gray-500" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'No tax codes yet' : 'لا توجد رموز ضريبة بعد'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-slate-900">
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Name' : 'الاسم'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Rate' : 'النسبة'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Scope' : 'النطاق'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Actions' : 'إجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedCodes.map((c) => (
                        <tr key={c.id} className="border-b">
                          <td className="px-3 py-2">{c.name}</td>
                          <td className="px-3 py-2">{c.rate}%</td>
                          <td className="px-3 py-2" suppressHydrationWarning>{c.scope === 'sales' ? ((hydrated && appLang==='en') ? 'Sales' : 'مبيعات') : c.scope === 'purchase' ? ((hydrated && appLang==='en') ? 'Purchase' : 'مشتريات') : ((hydrated && appLang==='en') ? 'Both' : 'كلاهما')}</td>
                          <td className="px-3 py-2">
                            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => removeCode(c.id)} disabled={loading}>{(hydrated && appLang==='en') ? 'Delete' : 'حذف'}</Button>
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

