"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"
import { type TaxCode as TaxCodeModel, listTaxCodes, createTaxCode, deleteTaxCode, ensureDefaultsIfEmpty } from "@/lib/taxes"
import { Percent, Plus, Trash2, ChevronRight, ShoppingCart, Package, ArrowLeftRight } from "lucide-react"

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

  const scopeConfig: Record<string, { icon: any; color: string; label: { ar: string; en: string } }> = {
    sales: { icon: ShoppingCart, color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: { ar: 'مبيعات', en: 'Sales' } },
    purchase: { icon: Package, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', label: { ar: 'مشتريات', en: 'Purchase' } },
    both: { icon: ArrowLeftRight, color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', label: { ar: 'كلاهما', en: 'Both' } },
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* رأس الصفحة - تحسين للهاتف */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardContent className="py-4 sm:py-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="p-2 sm:p-3 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg sm:rounded-xl shadow-lg shadow-green-500/20 flex-shrink-0">
                    <Percent className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Tax Settings' : 'الضرائب'}</h1>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Tax codes & rates' : 'رموز ونِسَب الضريبة'}</p>
                  </div>
                </div>
                <Link href="/settings">
                  <Button variant="outline" className="gap-2">
                    <ChevronRight className="w-4 h-4 rotate-180" />
                    {(hydrated && appLang==='en') ? 'Back to Settings' : 'العودة للإعدادات'}
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* إضافة رمز ضريبة */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <Plus className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle className="text-base" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Add Tax Code' : 'إضافة رمز ضريبة'}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Name' : 'الاسم'}</Label>
                  <Input placeholder={(hydrated && appLang==='en') ? 'e.g. VAT 5%' : 'مثال: VAT 5%'} value={name} onChange={(e) => setName(e.target.value)} className="bg-gray-50 dark:bg-slate-800" suppressHydrationWarning />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Rate %' : 'النسبة %'}</Label>
                  <Input type="number" step="0.01" min={0} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="bg-gray-50 dark:bg-slate-800" />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Scope' : 'النطاق'}</Label>
                  <Select value={scope} onValueChange={(v) => setScope(v as any)}>
                    <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sales">{(hydrated && appLang==='en') ? 'Sales' : 'مبيعات'}</SelectItem>
                      <SelectItem value="purchase">{(hydrated && appLang==='en') ? 'Purchase' : 'مشتريات'}</SelectItem>
                      <SelectItem value="both">{(hydrated && appLang==='en') ? 'Both' : 'كلاهما'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Button onClick={addCode} disabled={loading || !companyId} className="w-full gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600">
                    <Plus className="w-4 h-4" />
                    {(hydrated && appLang==='en') ? 'Add' : 'إضافة'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* الرموز المعرفة */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <Percent className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <CardTitle className="text-base" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Defined Codes' : 'الرموز المعرفة'}</CardTitle>
                </div>
                <Badge variant="outline" className="gap-1">
                  {sortedCodes.length} {(hydrated && appLang==='en') ? 'codes' : 'رمز'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {loading ? (
                <div className="py-12 text-center">
                  <div className="animate-spin w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                  <p className="text-gray-500" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Loading...' : 'جاري التحميل...'}</p>
                </div>
              ) : sortedCodes.length === 0 ? (
                <div className="py-12 text-center">
                  <Percent className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'No tax codes yet' : 'لا توجد رموز ضريبة بعد'}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedCodes.map((c) => {
                    const scopeInfo = scopeConfig[c.scope] || scopeConfig.both
                    const ScopeIcon = scopeInfo.icon
                    return (
                      <div key={c.id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold">
                            {c.rate}%
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{c.name}</p>
                            <Badge className={`text-[10px] mt-1 ${scopeInfo.color}`}>
                              <ScopeIcon className="w-3 h-3 mr-1" />
                              {(hydrated && appLang==='en') ? scopeInfo.label.en : scopeInfo.label.ar}
                            </Badge>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 gap-1" onClick={() => removeCode(c.id)} disabled={loading}>
                          <Trash2 className="w-4 h-4" />
                          {(hydrated && appLang==='en') ? 'Delete' : 'حذف'}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

