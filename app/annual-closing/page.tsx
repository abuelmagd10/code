"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { CompanyHeader } from "@/components/company-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import {
  Lock,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Eye,
  BookOpen,
  History,
  ArrowRight,
} from "lucide-react"

interface AccountLine {
  id: string
  account_code: string
  account_name: string
  balance: number
}

interface ClosingPreview {
  fiscal_year: number
  already_closed: boolean
  total_revenue: number
  total_expenses: number
  net_income: number
  revenue_accounts: AccountLine[]
  expense_accounts: AccountLine[]
}

interface ClosingRecord {
  id: string
  fiscal_year: number
  closing_date: string
  total_revenue: number
  total_expenses: number
  net_income: number
  status: string
  notes: string | null
  created_at: string
}

interface AccountOption {
  id: string
  account_code: string
  account_name: string
  account_type: string
}

export default function AnnualClosingPage() {
  const supabase = useSupabase()
  const { toast } = useToast()

  const [appLang, setAppLang] = useState<'ar' | 'en'>(() => {
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

  // Form state
  const [fiscalYear, setFiscalYear] = useState<number>(new Date().getFullYear() - 1)
  const [closingDate, setClosingDate] = useState<string>(`${new Date().getFullYear() - 1}-12-31`)
  const [retainedEarningsAccountId, setRetainedEarningsAccountId] = useState<string>("")
  const [closingNotes, setClosingNotes] = useState<string>("")

  // Data
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [preview, setPreview] = useState<ClosingPreview | null>(null)
  const [closingHistory, setClosingHistory] = useState<ClosingRecord[]>([])

  // UI state
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  useEffect(() => {
    const init = async () => {
      try {
        const cid = await getActiveCompanyId(supabase)
        if (!cid) return
        setCompanyId(cid)
        await Promise.all([
          loadAccounts(cid),
          loadClosingHistory(cid),
        ])
        // Auto-select retained earnings account (3200)
        const { data: re } = await supabase
          .from('chart_of_accounts')
          .select('id')
          .eq('company_id', cid)
          .eq('account_code', '3200')
          .maybeSingle()
        if (re?.id) setRetainedEarningsAccountId(re.id)
      } finally {
        setIsLoading(false)
      }
    }
    init()
    setHydrated(true)
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang
        if (docLang === 'en') { setAppLang('en'); return }
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        const v = fromCookie || localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAccounts = async (cid: string) => {
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type')
      .eq('company_id', cid)
      .in('account_type', ['equity'])
      .order('account_code', { ascending: true })
    setAccounts((data || []) as AccountOption[])
  }

  const loadClosingHistory = async (cid: string) => {
    const { data } = await supabase
      .from('fiscal_year_closings')
      .select('id, fiscal_year, closing_date, total_revenue, total_expenses, net_income, status, notes, created_at')
      .eq('company_id', cid)
      .order('fiscal_year', { ascending: false })
    setClosingHistory((data || []) as ClosingRecord[])
  }

  const handlePreview = async () => {
    if (!companyId) return
    if (!fiscalYear) {
      toast({ title: appLang === 'en' ? 'Required' : 'مطلوب', description: appLang === 'en' ? 'Please enter a fiscal year' : 'يرجى إدخال السنة المالية', variant: 'destructive' })
      return
    }
    try {
      setIsLoadingPreview(true)
      setPreview(null)
      const { data, error } = await supabase.rpc('get_closing_preview', {
        p_company_id: companyId,
        p_fiscal_year: fiscalYear,
      })
      if (error) throw error
      setPreview(data as ClosingPreview)
    } catch (err: any) {
      toastActionError(toast, appLang === 'en' ? 'Preview' : 'المعاينة', '', err?.message)
    } finally {
      setIsLoadingPreview(false)
    }
  }

  const handleExecuteClosing = async () => {
    if (!companyId || !retainedEarningsAccountId) return
    try {
      setIsExecuting(true)
      setShowConfirmDialog(false)

      const { data: { user } } = await supabase.auth.getUser()

      const { data, error } = await supabase.rpc('perform_annual_closing_atomic', {
        p_company_id: companyId,
        p_fiscal_year: fiscalYear,
        p_closing_date: closingDate,
        p_retained_earnings_account_id: retainedEarningsAccountId,
        p_user_id: user?.id || null,
        p_notes: closingNotes || null,
      })

      if (error) {
        toast({
          title: appLang === 'en' ? 'Closing Failed' : 'فشل الإقفال',
          description: error.message,
          variant: 'destructive',
        })
        return
      }

      const result = data as any
      toast({
        title: appLang === 'en' ? 'Annual Closing Completed' : 'تم الإقفال السنوي بنجاح',
        description: appLang === 'en'
          ? `Fiscal year ${fiscalYear} closed. Net income: ${Number(result.net_income).toFixed(2)}. ${result.accounts_closed} accounts closed.`
          : `تم إقفال السنة المالية ${fiscalYear}. صافي الدخل: ${Number(result.net_income).toFixed(2)}. عدد الحسابات المقفلة: ${result.accounts_closed}.`,
      })

      // Refresh
      setPreview(null)
      setClosingNotes("")
      if (companyId) await loadClosingHistory(companyId)
    } catch (err: any) {
      toastActionError(toast, appLang === 'en' ? 'Annual Closing' : 'الإقفال السنوي', '', err?.message)
    } finally {
      setIsExecuting(false)
    }
  }

  const formatNumber = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const isAlreadyClosed = preview?.already_closed || closingHistory.some(h => h.fiscal_year === fiscalYear && h.status === 'posted')

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-6 max-w-5xl mx-auto">

          {/* Page Header */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                <Lock className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white" suppressHydrationWarning>
                  {(hydrated && appLang === 'en') ? 'Annual Closing Entry' : 'قيد الإقفال السنوي'}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1" suppressHydrationWarning>
                  {(hydrated && appLang === 'en')
                    ? 'Zero out revenue & expense accounts and transfer net income to Retained Earnings'
                    : 'إقفال حسابات الإيرادات والمصروفات وترحيل صافي الدخل للأرباح المحتجزة'}
                </p>
              </div>
            </div>
          </div>

          <CompanyHeader />

          {/* Accounting flow explanation */}
          <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                  <p className="font-semibold" suppressHydrationWarning>
                    {(hydrated && appLang === 'en') ? 'How Annual Closing Works' : 'كيف يعمل الإقفال السنوي'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs mt-2">
                    <span className="px-2 py-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded font-medium" suppressHydrationWarning>
                      {(hydrated && appLang === 'en') ? 'Dr. Revenue Accounts' : 'م. حسابات الإيرادات'}
                    </span>
                    <ArrowRight className="h-3 w-3 text-gray-400" />
                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded font-medium" suppressHydrationWarning>
                      {(hydrated && appLang === 'en') ? 'Cr. Expense Accounts' : 'د. حسابات المصروفات'}
                    </span>
                    <ArrowRight className="h-3 w-3 text-gray-400" />
                    <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded font-medium" suppressHydrationWarning>
                      {(hydrated && appLang === 'en') ? 'Net → Retained Earnings (3200)' : 'صافي الدخل → أرباح محتجزة (3200)'}
                    </span>
                  </div>
                  <p className="text-xs text-blue-600 dark:text-blue-300 mt-2" suppressHydrationWarning>
                    {(hydrated && appLang === 'en')
                      ? 'All revenue & expense accounts are zeroed. Net income/loss is transferred to Retained Earnings. All periods for the year are locked.'
                      : 'يتم تصفير جميع حسابات الإيرادات والمصروفات. يُرحَّل صافي الدخل أو الخسارة للأرباح المحتجزة. يتم قفل جميع الفترات المحاسبية للسنة.'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Closing Form */}
          <Card>
            <CardHeader>
              <CardTitle suppressHydrationWarning>
                {(hydrated && appLang === 'en') ? 'Closing Parameters' : 'بيانات الإقفال'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Fiscal Year */}
                <div className="space-y-2">
                  <Label suppressHydrationWarning>
                    {(hydrated && appLang === 'en') ? 'Fiscal Year *' : 'السنة المالية *'}
                  </Label>
                  <Input
                    type="number"
                    min={2000}
                    max={new Date().getFullYear()}
                    value={fiscalYear}
                    onChange={(e) => {
                      const y = parseInt(e.target.value)
                      setFiscalYear(y)
                      setClosingDate(`${y}-12-31`)
                      setPreview(null)
                    }}
                  />
                </div>

                {/* Closing Date */}
                <div className="space-y-2">
                  <Label suppressHydrationWarning>
                    {(hydrated && appLang === 'en') ? 'Closing Date *' : 'تاريخ الإقفال *'}
                  </Label>
                  <Input
                    type="date"
                    value={closingDate}
                    onChange={(e) => setClosingDate(e.target.value)}
                  />
                </div>

                {/* Retained Earnings Account */}
                <div className="space-y-2">
                  <Label suppressHydrationWarning>
                    {(hydrated && appLang === 'en') ? 'Retained Earnings Account *' : 'حساب الأرباح المحتجزة *'}
                  </Label>
                  <Select value={retainedEarningsAccountId} onValueChange={setRetainedEarningsAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder={(hydrated && appLang === 'en') ? 'Select (3200)' : 'اختر (3200)'} />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.account_code} - {acc.account_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500" suppressHydrationWarning>
                    {(hydrated && appLang === 'en') ? 'Usually account 3200 – Retained Earnings' : 'عادةً الحساب 3200 – الأرباح المحتجزة'}
                  </p>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label suppressHydrationWarning>
                  {(hydrated && appLang === 'en') ? 'Notes (optional)' : 'ملاحظات (اختياري)'}
                </Label>
                <Input
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder={(hydrated && appLang === 'en') ? 'e.g. Board resolution No. ...' : 'مثال: قرار مجلس الإدارة رقم ...'}
                />
              </div>

              {/* Already closed warning */}
              {isAlreadyClosed && (
                <Alert variant="destructive">
                  <Lock className="h-4 w-4" />
                  <AlertTitle suppressHydrationWarning>
                    {(hydrated && appLang === 'en') ? 'Already Closed' : 'مقفل بالفعل'}
                  </AlertTitle>
                  <AlertDescription suppressHydrationWarning>
                    {(hydrated && appLang === 'en')
                      ? `Fiscal year ${fiscalYear} has already been closed. Cannot close again.`
                      : `السنة المالية ${fiscalYear} مقفلة بالفعل. لا يمكن إعادة الإقفال.`}
                  </AlertDescription>
                </Alert>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={handlePreview}
                  disabled={isLoadingPreview || !companyId}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  {isLoadingPreview
                    ? ((hydrated && appLang === 'en') ? 'Loading...' : 'جاري التحميل...')
                    : ((hydrated && appLang === 'en') ? 'Preview Closing' : 'معاينة الإقفال')}
                </Button>

                <Button
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={
                    isExecuting ||
                    !companyId ||
                    !retainedEarningsAccountId ||
                    !closingDate ||
                    isAlreadyClosed ||
                    (preview !== null && (preview.total_revenue === 0 && preview.total_expenses === 0))
                  }
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <Lock className="h-4 w-4 mr-2" />
                  {isExecuting
                    ? ((hydrated && appLang === 'en') ? 'Closing...' : 'جاري الإقفال...')
                    : ((hydrated && appLang === 'en') ? 'Execute Annual Closing' : 'تنفيذ الإقفال السنوي')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Preview Results */}
          {preview && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2" suppressHydrationWarning>
                  <Eye className="h-5 w-5" />
                  {(hydrated && appLang === 'en')
                    ? `Preview: Fiscal Year ${preview.fiscal_year}`
                    : `معاينة: السنة المالية ${preview.fiscal_year}`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700 dark:text-green-300" suppressHydrationWarning>
                        {(hydrated && appLang === 'en') ? 'Total Revenue' : 'إجمالي الإيرادات'}
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {formatNumber(preview.total_revenue)}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1" suppressHydrationWarning>
                      {preview.revenue_accounts.length} {(hydrated && appLang === 'en') ? 'accounts' : 'حساب'}
                    </p>
                  </div>

                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingDown className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-medium text-red-700 dark:text-red-300" suppressHydrationWarning>
                        {(hydrated && appLang === 'en') ? 'Total Expenses' : 'إجمالي المصروفات'}
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {formatNumber(preview.total_expenses)}
                    </p>
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1" suppressHydrationWarning>
                      {preview.expense_accounts.length} {(hydrated && appLang === 'en') ? 'accounts' : 'حساب'}
                    </p>
                  </div>

                  <div className={`p-4 rounded-xl border ${preview.net_income >= 0
                    ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'
                    : 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                    }`}>
                    <div className="flex items-center gap-2 mb-1">
                      {preview.net_income >= 0
                        ? <CheckCircle className="h-4 w-4 text-indigo-600" />
                        : <AlertCircle className="h-4 w-4 text-orange-600" />}
                      <span className={`text-sm font-medium ${preview.net_income >= 0 ? 'text-indigo-700 dark:text-indigo-300' : 'text-orange-700 dark:text-orange-300'}`} suppressHydrationWarning>
                        {preview.net_income >= 0
                          ? ((hydrated && appLang === 'en') ? 'Net Profit' : 'صافي الربح')
                          : ((hydrated && appLang === 'en') ? 'Net Loss' : 'صافي الخسارة')}
                      </span>
                    </div>
                    <p className={`text-2xl font-bold ${preview.net_income >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-orange-600 dark:text-orange-400'}`}>
                      {formatNumber(Math.abs(preview.net_income))}
                    </p>
                    <p className={`text-xs mt-1 ${preview.net_income >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-orange-600 dark:text-orange-400'}`} suppressHydrationWarning>
                      {preview.net_income >= 0
                        ? ((hydrated && appLang === 'en') ? '→ Credited to Retained Earnings' : '→ يُضاف للأرباح المحتجزة')
                        : ((hydrated && appLang === 'en') ? '→ Debited from Retained Earnings' : '→ يُخصم من الأرباح المحتجزة')}
                    </p>
                  </div>
                </div>

                {/* No data warning */}
                {preview.total_revenue === 0 && preview.total_expenses === 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription suppressHydrationWarning>
                      {(hydrated && appLang === 'en')
                        ? `No revenue or expense transactions found for fiscal year ${preview.fiscal_year}.`
                        : `لا توجد حركات إيرادات أو مصروفات للسنة المالية ${preview.fiscal_year}.`}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Revenue Accounts Table */}
                {preview.revenue_accounts.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-green-700 dark:text-green-300 mb-3 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      <span suppressHydrationWarning>
                        {(hydrated && appLang === 'en') ? 'Revenue Accounts (will be debited to zero)' : 'حسابات الإيرادات (ستُقيَّد مدينةً لتصفيرها)'}
                      </span>
                    </h3>
                    <div className="overflow-x-auto rounded-xl border border-green-200 dark:border-green-800">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-green-50 dark:bg-green-900/20">
                            <TableHead suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Code' : 'الرمز'}</TableHead>
                            <TableHead suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Account Name' : 'اسم الحساب'}</TableHead>
                            <TableHead className="text-right" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Balance (Dr)' : 'الرصيد (مدين)'}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.revenue_accounts.map((acc) => (
                            <TableRow key={acc.id}>
                              <TableCell className="font-mono text-sm">{acc.account_code}</TableCell>
                              <TableCell>{acc.account_name}</TableCell>
                              <TableCell className="text-right font-semibold text-green-600">
                                {formatNumber(acc.balance)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Expense Accounts Table */}
                {preview.expense_accounts.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-red-700 dark:text-red-300 mb-3 flex items-center gap-2">
                      <TrendingDown className="h-4 w-4" />
                      <span suppressHydrationWarning>
                        {(hydrated && appLang === 'en') ? 'Expense Accounts (will be credited to zero)' : 'حسابات المصروفات (ستُقيَّد دائنةً لتصفيرها)'}
                      </span>
                    </h3>
                    <div className="overflow-x-auto rounded-xl border border-red-200 dark:border-red-800">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-red-50 dark:bg-red-900/20">
                            <TableHead suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Code' : 'الرمز'}</TableHead>
                            <TableHead suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Account Name' : 'اسم الحساب'}</TableHead>
                            <TableHead className="text-right" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Balance (Cr)' : 'الرصيد (دائن)'}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {preview.expense_accounts.map((acc) => (
                            <TableRow key={acc.id}>
                              <TableCell className="font-mono text-sm">{acc.account_code}</TableCell>
                              <TableCell>{acc.account_name}</TableCell>
                              <TableCell className="text-right font-semibold text-red-600">
                                {formatNumber(acc.balance)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Closing History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2" suppressHydrationWarning>
                <History className="h-5 w-5" />
                {(hydrated && appLang === 'en') ? 'Closing History' : 'سجل الإقفالات السابقة'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-gray-500 py-4" suppressHydrationWarning>
                  {(hydrated && appLang === 'en') ? 'Loading...' : 'جاري التحميل...'}
                </div>
              ) : closingHistory.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Lock className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p suppressHydrationWarning>
                    {(hydrated && appLang === 'en')
                      ? 'No annual closings have been recorded yet.'
                      : 'لم يتم تسجيل أي إقفالات سنوية بعد.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Fiscal Year' : 'السنة المالية'}</TableHead>
                        <TableHead suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Closing Date' : 'تاريخ الإقفال'}</TableHead>
                        <TableHead className="text-right" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Revenue' : 'الإيرادات'}</TableHead>
                        <TableHead className="text-right" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Expenses' : 'المصروفات'}</TableHead>
                        <TableHead className="text-right" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Net Income' : 'صافي الدخل'}</TableHead>
                        <TableHead suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Status' : 'الحالة'}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {closingHistory.map((rec) => (
                        <TableRow key={rec.id}>
                          <TableCell className="font-bold text-indigo-600 dark:text-indigo-400">
                            {rec.fiscal_year}
                          </TableCell>
                          <TableCell>{rec.closing_date}</TableCell>
                          <TableCell className="text-right text-green-600">
                            {formatNumber(rec.total_revenue)}
                          </TableCell>
                          <TableCell className="text-right text-red-600">
                            {formatNumber(rec.total_expenses)}
                          </TableCell>
                          <TableCell className={`text-right font-semibold ${rec.net_income >= 0 ? 'text-indigo-600' : 'text-orange-600'}`}>
                            {rec.net_income >= 0 ? '' : '-'}{formatNumber(Math.abs(rec.net_income))}
                          </TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${rec.status === 'posted' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-600'}`}>
                              {rec.status === 'posted'
                                ? ((hydrated && appLang === 'en') ? 'Posted' : 'مرحَّل')
                                : rec.status}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Lock className="h-5 w-5" />
              <span suppressHydrationWarning>
                {(hydrated && appLang === 'en') ? 'Confirm Annual Closing' : 'تأكيد الإقفال السنوي'}
              </span>
            </DialogTitle>
            <DialogDescription suppressHydrationWarning>
              {(hydrated && appLang === 'en')
                ? `You are about to permanently close fiscal year ${fiscalYear}. This action cannot be undone. All revenue and expense accounts will be zeroed out and net income will be transferred to Retained Earnings.`
                : `أنت على وشك إقفال السنة المالية ${fiscalYear} بشكل نهائي. لا يمكن التراجع عن هذا الإجراء. سيتم تصفير جميع حسابات الإيرادات والمصروفات وترحيل صافي الدخل للأرباح المحتجزة.`}
            </DialogDescription>
          </DialogHeader>

          {preview && (
            <div className="space-y-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Total Revenue:' : 'إجمالي الإيرادات:'}</span>
                <span className="font-semibold text-green-600">{formatNumber(preview.total_revenue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Total Expenses:' : 'إجمالي المصروفات:'}</span>
                <span className="font-semibold text-red-600">{formatNumber(preview.total_expenses)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Net Income → RE:' : 'صافي الدخل → أرباح محتجزة:'}</span>
                <span className={`font-bold ${preview.net_income >= 0 ? 'text-indigo-600' : 'text-orange-600'}`}>
                  {formatNumber(preview.net_income)}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-4">
            <Button variant="ghost" onClick={() => setShowConfirmDialog(false)} suppressHydrationWarning>
              {(hydrated && appLang === 'en') ? 'Cancel' : 'إلغاء'}
            </Button>
            <Button
              onClick={handleExecuteClosing}
              disabled={isExecuting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Lock className="h-4 w-4 mr-2" />
              {isExecuting
                ? ((hydrated && appLang === 'en') ? 'Closing...' : 'جاري الإقفال...')
                : ((hydrated && appLang === 'en') ? 'Confirm & Close Year' : 'تأكيد وإقفال السنة')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
