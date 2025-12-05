"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter } from "next/navigation"
import { Trash2, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { filterLeafAccounts } from "@/lib/accounts"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"

interface Account {
  id: string
  account_code: string
  account_name: string
  parent_id?: string | null
}

interface EntryLine {
  account_id: string
  debit_amount: number
  credit_amount: number
  description: string
}

export default function NewJournalEntryPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [entryLines, setEntryLines] = useState<EntryLine[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const router = useRouter()
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

  const [formData, setFormData] = useState({
    entry_date: new Date().toISOString().split("T")[0],
    description: "",
  })

  // Currency support - using CurrencyService
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [entryCurrency, setEntryCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const [baseCurrency, setBaseCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const [exchangeRateId, setExchangeRateId] = useState<string | undefined>(undefined)
  const [rateSource, setRateSource] = useState<string>('api')
  const [fetchingRate, setFetchingRate] = useState<boolean>(false)

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  useEffect(() => {
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
  }, [])

  const loadAccounts = async () => {
    try {
      setIsLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return
      setCompanyId(companyData.id)

      const { data: accountsData } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, parent_id")
        .eq("company_id", companyData.id)
        .order("account_code")

      const list = accountsData || []
      setAccounts(filterLeafAccounts(list as any) as any)

      // Load currencies from database
      const dbCurrencies = await getActiveCurrencies(supabase, companyData.id)
      if (dbCurrencies.length > 0) {
        setCurrencies(dbCurrencies)
        const base = dbCurrencies.find(c => c.is_base)
        if (base) setBaseCurrency(base.code)
      }
    } catch (error) {
      console.error("Error loading accounts:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Helper: ensure shareholder capital accounts exist and are visible
  const ensureShareholderCapitalAccounts = async () => {
    try {
      if (!companyId) {
        toast({ title: "شركة غير محددة", description: "يرجى تحديد الشركة أولاً" })
        return
      }

      const { data: sh } = await supabase
        .from("shareholders")
        .select("name")
        .eq("company_id", companyId)

      const { data: allAcc } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name")
        .eq("company_id", companyId)

      const existingNames = new Set((allAcc || []).map((a: any) => String(a.account_name || "")))
      const existingCodes = new Set((allAcc || []).map((a: any) => String(a.account_code || "")))

      const toCreate = (sh || [])
        .filter((s: any) => !existingNames.has(`رأس مال - ${s.name}`))
        .map((s: any) => ({
          company_id: companyId,
          account_code: "", // سيُحدّد لاحقًا لضمان عدم التعارض
          account_name: `رأس مال - ${s.name}`,
          account_type: "equity",
          description: appLang==='en' ? "Shareholder capital account" : "حساب رأس مال خاص بالمساهم",
          opening_balance: 0,
        }))

      // توليد أكواد ضمن نطاق حقوق الملكية بدون تعارض (بدءًا من 3001)
      let nextCode = 3001
      for (const acc of toCreate) {
        while (existingCodes.has(String(nextCode))) {
          nextCode++
        }
        acc.account_code = String(nextCode)
        existingCodes.add(String(nextCode))
        nextCode++
      }

      if (toCreate.length === 0) {
        toast({ title: appLang==='en' ? "Nothing to create" : "لا شيء مطلوب", description: appLang==='en' ? "All shareholder capital accounts already exist" : "جميع حسابات رأس المال للمساهمين موجودة بالفعل" })
        return
      }

      const { error } = await supabase.from("chart_of_accounts").insert(toCreate)
      if (error) throw error

      await loadAccounts()
      toastActionSuccess(toast, appLang==='en' ? "Create" : "الإنشاء", appLang==='en' ? "Shareholder capital accounts" : "حسابات رأس المال للمساهمين")
    } catch (err) {
      console.error("Error ensuring shareholder capital accounts:", err)
      toastActionError(toast, appLang==='en' ? "Create" : "الإنشاء", appLang==='en' ? "Shareholder capital accounts" : "حسابات رأس المال للمساهمين")
    }
  }

  const addEntryLine = () => {
    setEntryLines([
      ...entryLines,
      {
        account_id: "",
        debit_amount: 0,
        credit_amount: 0,
        description: "",
      },
    ])
  }

  const removeEntryLine = (index: number) => {
    setEntryLines(entryLines.filter((_, i) => i !== index))
  }

  const updateEntryLine = (index: number, field: string, value: any) => {
    const newLines = [...entryLines]
    ;(newLines[index] as any)[field] = value
    setEntryLines(newLines)
  }

  const calculateTotals = () => {
    let totalDebit = 0
    let totalCredit = 0

    entryLines.forEach((line) => {
      totalDebit += line.debit_amount
      totalCredit += line.credit_amount
    })

    return { totalDebit, totalCredit }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (entryLines.length === 0) {
      toast({ title: "بيانات غير مكتملة", description: "يرجى إضافة عناصر للقيد", variant: "destructive" })
      return
    }

    const { totalDebit, totalCredit } = calculateTotals()
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      toast({ title: "القيد غير متوازن", description: "الديون والدائنين غير متوازنة", variant: "destructive" })
      return
    }

    try {
      setIsSaving(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return

      // Create journal entry
      const { data: entryData, error: entryError } = await supabase
        .from("journal_entries")
        .insert([
          {
            company_id: companyData.id,
            entry_date: formData.entry_date,
            description: formData.description,
            reference_type: "manual_entry",
          },
        ])
        .select()
        .single()

      if (entryError) throw entryError

      // Create journal entry lines with multi-currency support
      // If entry currency differs from base, convert amounts for accounting
      const linesToInsert = entryLines.map((line) => {
        // Original values are what user entered (in entry currency)
        const originalDebit = line.debit_amount
        const originalCredit = line.credit_amount

        // Convert to base currency for accounting if different
        const convertedDebit = entryCurrency !== baseCurrency ? originalDebit * exchangeRate : originalDebit
        const convertedCredit = entryCurrency !== baseCurrency ? originalCredit * exchangeRate : originalCredit

        return {
          journal_entry_id: entryData.id,
          account_id: line.account_id,
          // Amounts stored for accounting (in base currency)
          debit_amount: convertedDebit,
          credit_amount: convertedCredit,
          description: line.description,
          // Store original values (in entry currency) for audit trail
          original_debit: originalDebit,
          original_credit: originalCredit,
          original_currency: entryCurrency,
          exchange_rate_used: exchangeRate,
          // Professional multi-currency fields
          exchange_rate_id: exchangeRateId || null,
        }
      })

      const { error: linesError } = await supabase.from("journal_entry_lines").insert(linesToInsert)

      if (linesError) throw linesError

      toastActionSuccess(toast, "الإنشاء", "القيد")
      router.push("/journal-entries")
    } catch (error) {
      console.error("Error creating entry:", error)
      toastActionError(toast, "الحفظ", "القيد", "خطأ في إنشاء القيد")
    } finally {
      setIsSaving(false)
    }
  }

  const { totalDebit, totalCredit } = calculateTotals()
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-8 max-w-full">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'New Entry' : 'قيد جديد'}</h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Add journal entry' : 'إضافة قيد يومي'}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Entry Details' : 'بيانات القيد'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="entry_date" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Date' : 'التاريخ'}</Label>
                    <Input
                      id="entry_date"
                      type="date"
                      value={formData.entry_date}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          entry_date: e.target.value,
                        })
                      }
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Description' : 'الوصف'}</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      placeholder={(hydrated && appLang==='en') ? 'Entry description' : 'وصف القيد'}
                      suppressHydrationWarning
                    />
                  </div>

                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Currency' : 'العملة'}</Label>
                    <div className="flex gap-2 items-center">
                      <select
                        className="border rounded px-3 py-2 text-sm"
                        value={entryCurrency}
                        onChange={async (e) => {
                          const v = e.target.value
                          setEntryCurrency(v)
                          if (v === baseCurrency) {
                            setExchangeRate(1)
                            setExchangeRateId(undefined)
                            setRateSource('same_currency')
                          } else {
                            setFetchingRate(true)
                            try {
                              // Use CurrencyService for rate lookup
                              const result = await getExchangeRate(supabase, v, baseCurrency)
                              setExchangeRate(result.rate)
                              setExchangeRateId(result.rateId)
                              setRateSource(result.source)
                            } catch {
                              // Fallback to direct API
                              try {
                                const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${v}`)
                                const data = await res.json()
                                setExchangeRate(data.rates?.[baseCurrency] || 1)
                                setRateSource('api_fallback')
                              } catch { setExchangeRate(1) }
                            }
                            setFetchingRate(false)
                          }
                        }}
                      >
                        {currencies.length > 0 ? (
                          currencies.map((c) => (
                            <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                          ))
                        ) : (
                          Object.entries(currencySymbols).map(([code, symbol]) => (
                            <option key={code} value={code}>{symbol} {code}</option>
                          ))
                        )}
                      </select>
                      {entryCurrency !== baseCurrency && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {fetchingRate ? (appLang === 'en' ? 'Loading...' : 'جاري...') : (
                            <>
                              1 {entryCurrency} = {exchangeRate.toFixed(4)} {baseCurrency}
                              <span className="text-blue-500 ml-1">({rateSource})</span>
                            </>
                          )}
                        </span>
                      )}
                    </div>
                    {entryCurrency !== baseCurrency && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {appLang === 'en'
                          ? 'Amounts will be converted to base currency for accounting'
                          : 'سيتم تحويل المبالغ إلى العملة الأساسية للمحاسبة'}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex justify_between items-center">
                  <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Entry Lines' : 'عناصر القيد'}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={ensureShareholderCapitalAccounts}>
                      {(hydrated && appLang==='en') ? 'Create shareholder capital accounts' : 'إنشاء حسابات رأس المال للمساهمين'}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={addEntryLine}>
                      <Plus className="w-4 h-4 mr-2" />
                      {(hydrated && appLang==='en') ? 'Add Line' : 'إضافة عنصر'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                  {appLang==='en' ? (
                    <>
                      <p>• Debit: Select the cash/bank account that received the amount (e.g., cash account or the specific bank account) with the contribution value.</p>
                      <p>• Credit: Select the capital account – {"{shareholder name}"} (Equity) with the same contribution value.</p>
                    </>
                  ) : (
                    <>
                      <p>• مدين: اختر حساب النقد/البنك الذي استقبل المبلغ (مثال: حساب النقد أو حساب البنك المحدد)، بقيمة المساهمة.</p>
                      <p>• دائن: اختر حساب رأس مال - {"{اسم المساهم}"} (من نوع Equity)، بنفس قيمة المساهمة.</p>
                    </>
                  )}
                </div>
                {entryLines.length === 0 ? (
                  <p className="text-center py-8 text-gray-500 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'No lines added yet' : 'لم تضف أي عناصر حتى الآن'}</p>
                ) : (
                  <div className="space-y-4">
                    {entryLines.map((line, index) => (
                      <div key={index} className="p-4 border rounded-lg space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div>
                            <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Account' : 'الحساب'}</Label>
                            <select
                              value={line.account_id}
                              onChange={(e) => updateEntryLine(index, "account_id", e.target.value)}
                              className="w-full px-3 py-2 border rounded-lg text-sm"
                              required
                            >
                              <option value="">{appLang==='en' ? 'Select account' : 'اختر حساب'}</option>
                              {accounts.map((acc) => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.account_code} - {acc.account_name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Debit' : 'مدين'}</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={line.debit_amount}
                              onChange={(e) =>
                                updateEntryLine(index, "debit_amount", Number.parseFloat(e.target.value) || 0)
                              }
                              className="text-sm"
                            />
                          </div>

                          <div>
                            <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Credit' : 'دائن'}</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={line.credit_amount}
                              onChange={(e) =>
                                updateEntryLine(index, "credit_amount", Number.parseFloat(e.target.value) || 0)
                              }
                              className="text-sm"
                            />
                          </div>

                          <div>
                            <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Description' : 'الوصف'}</Label>
                            <Input
                              type="text"
                              value={line.description}
                              onChange={(e) => updateEntryLine(index, "description", e.target.value)}
                              className="text-sm"
                            />
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeEntryLine(index)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {appLang==='en' ? 'Delete' : 'حذف'}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card
              className={`border-2 ${
                isBalanced
                  ? "border-green-200 bg-green-50 dark:bg-green-900/20"
                  : "border-red-200 bg-red-50 dark:bg-red-900/20"
              }`}
            >
              <CardContent className="pt-6">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total debit' : 'إجمالي المديون'}</p>
                    <p className="text-2xl font-bold">{totalDebit.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total credit' : 'إجمالي الدائن'}</p>
                    <p className="text-2xl font-bold">{totalCredit.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Difference' : 'الفرق'}</p>
                    <p className={`text-2xl font-bold ${isBalanced ? "text-green-600" : "text-red-600"}`}>
                      {Math.abs(totalDebit - totalCredit).toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button type="submit" disabled={isSaving || !isBalanced} className="disabled:opacity-50">
                {isSaving ? (appLang==='en' ? 'Saving...' : 'جاري الحفظ...') : (appLang==='en' ? 'Create Entry' : 'إنشاء القيد')}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                {appLang==='en' ? 'Cancel' : 'إلغاء'}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
