"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { filterLeafAccounts } from "@/lib/accounts"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { getActiveCompanyId } from "@/lib/company"
import { MultiSelect } from "@/components/ui/multi-select"
import { Filter, X, Search, Calendar, Check, Ban } from "lucide-react"
import { usePermissions } from "@/lib/permissions-context"
import { notifyBankVoucherRequestCreated, notifyBankVoucherApproved, notifyBankVoucherRejected } from "@/lib/notification-helpers"
import { useRealtimeTable } from "@/hooks/use-realtime-table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
type Account = { id: string; account_code: string | null; account_name: string; account_type: string; branch_id?: string | null; cost_center_id?: string | null; branch_name?: string; cost_center_name?: string }
type BankVoucherRequest = {
  id: string;
  voucher_type: 'deposit' | 'withdraw';
  amount: number;
  currency: string;
  entry_date: string;
  description: string;
  payment_method?: string;
  reference_number?: string;
  status: 'draft' | 'pending' | 'approved' | 'posted' | 'rejected';
  rejection_reason?: string;
  created_at: string;
  created_by: string;
  users?: { email: string; raw_user_meta_data?: { name?: string } };
  counter_account?: { account_code?: string; account_name: string };
}

type Line = {
  id: string;
  debit_amount: number;
  credit_amount: number;
  description: string | null;
  journal_entries: { entry_date: string, description: string | null };
  // Multi-currency fields
  display_debit?: number | null;
  display_credit?: number | null;
  display_currency?: string | null;
}

export default function BankAccountDetail({ params }: { params: Promise<{ id: string }> }) {
  const supabase = useSupabase()
  const { toast } = useToast()
  const { role } = usePermissions()
  const { id: accountId } = React.use(params)
  const [account, setAccount] = useState<Account | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [requests, setRequests] = useState<BankVoucherRequest[]>([])
  const [rejectingReq, setRejectingReq] = useState<BankVoucherRequest | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Currency support
  const [appCurrency, setAppCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  // Multi-currency support
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)

  // Filter states for transactions
  const [selectedDescriptions, setSelectedDescriptions] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [transactionTypes, setTransactionTypes] = useState<string[]>([])
  const [filtersExpanded, setFiltersExpanded] = useState(false)

  // Language state
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  // تهيئة اللغة بعد hydration
  useEffect(() => {
    try {
      const v = localStorage.getItem('app_language') || 'ar'
      setAppLang(v === 'en' ? 'en' : 'ar')
    } catch { }
  }, [])

  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  // Helper function to get display amount based on current currency
  const getDisplayAmount = (originalAmount: number, displayAmount?: number | null, displayCurrency?: string | null): number => {
    if (displayAmount != null && displayCurrency === appCurrency) {
      return displayAmount
    }
    return originalAmount
  }

  useEffect(() => {
    // Listen for currency changes and reload data
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency') || 'EGP'
      setAppCurrency(newCurrency)
      // Reload data with new currency
      loadData()
    }
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [])

  // Load currencies on mount
  useEffect(() => {
    const loadCurrencies = async () => {
      const cid = await getActiveCompanyId(supabase)
      if (cid) {
        setCompanyId(cid)
        const curr = await getActiveCurrencies(supabase, cid)
        if (curr.length > 0) setCurrencies(curr)
      }
    }
    loadCurrencies()
  }, [])



  const loadData = async () => {
    try {
      setLoading(true)
      let cid: string | null = null
      try {
        const res = await fetch('/api/my-company')
        if (res.ok) {
          const j = await res.json()
          const companyData = j?.data?.company || j?.company || null
          const accountsData = j?.data?.accounts || j?.accounts || []

          cid = String(companyData?.id || '') || null
          if (cid) { try { localStorage.setItem('active_company_id', cid) } catch { } }
          const acc = accountsData.find((a: any) => String(a.id) === String(accountId))
          if (acc) setAccount(acc as any)
        }
      } catch { }
      if (!cid) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: memberCompany } = await supabase.from('company_members').select('company_id').eq('user_id', user.id).limit(1)
        cid = Array.isArray(memberCompany) && memberCompany[0]?.company_id ? String(memberCompany[0].company_id) : null
      }

      // Fetch account with branch and cost center info (always fetch, don't rely on state)
      // ✅ Always fetch from Supabase to ensure we have the latest data
      const { data: accData, error: accError } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, branch_id, cost_center_id, branches(name), cost_centers(cost_center_name)")
        .eq("id", accountId)
        .single()

      if (accData) {
        setAccount({
          ...accData,
          branch_name: (accData as any).branches?.name || null,
          cost_center_name: (accData as any).cost_centers?.cost_center_name || null,
        } as Account)
      } else if (accError) {
        console.error("Error fetching account:", accError)
        // If account not found, try to get it from the accounts list we already have
        if (cid) {
          const { data: fallbackAccount } = await supabase
            .from("chart_of_accounts")
            .select("id, account_code, account_name, account_type, branch_id, cost_center_id")
            .eq("id", accountId)
            .eq("company_id", cid)
            .single()
          if (fallbackAccount) {
            setAccount(fallbackAccount as Account)
          }
        }
      }

      // Try API first
      const res2 = await fetch(`/api/account-lines?accountId=${encodeURIComponent(String(accountId))}&companyId=${encodeURIComponent(String(cid || ''))}&limit=100`)
      if (res2.ok) {
        const response = await res2.json()
        // ✅ API returns { success: true, data: [...] }, extract data
        const lns = Array.isArray(response) ? response : (response?.data || [])
        setLines(Array.isArray(lns) ? lns : [])
      } else {
        // Fallback: fetch directly from Supabase (with multi-currency fields)
        // ✅ Filter out deleted journal entries
        const { data: directLines } = await supabase
          .from("journal_entry_lines")
          .select("id, debit_amount, credit_amount, description, display_debit, display_credit, display_currency, journal_entries!inner(entry_date, description, company_id, deleted_at)")
          .eq("account_id", accountId)
          .is("journal_entries.deleted_at", null)
          .order("id", { ascending: false })
          .limit(100)
        setLines((directLines || []) as any)
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [accountId])

  const loadDataRef = React.useRef(loadData)
  loadDataRef.current = loadData

  useRealtimeTable({
    table: 'journal_entries',
    enabled: !!accountId,
    onInsert: () => loadDataRef.current(),
    onUpdate: () => loadDataRef.current(),
    onDelete: () => loadDataRef.current(),
  })

  // Calculate balance using display amounts when available
  const balance = useMemo(() => {
    if (!Array.isArray(lines) || lines.length === 0) return 0
    return lines.reduce((sum, l) => {
      const debit = getDisplayAmount(l.debit_amount || 0, l.display_debit, l.display_currency)
      const credit = getDisplayAmount(l.credit_amount || 0, l.display_credit, l.display_currency)
      return sum + debit - credit
    }, 0)
  }, [lines, appCurrency])

  // Transaction type options
  const transactionTypeOptions = useMemo(() => {
    return [
      { value: "debit", label: appLang === 'en' ? "Debit (Incoming)" : "مدين (وارد)" },
      { value: "credit", label: appLang === 'en' ? "Credit (Outgoing)" : "دائن (صادر)" },
    ]
  }, [appLang])

  // Description options from lines (unique descriptions)
  const descriptionOptions = useMemo(() => {
    const descs = new Set<string>()
    lines.forEach(l => {
      if (l.description && typeof l.description === 'string' && l.description.trim()) {
        descs.add(l.description.trim())
      }
      if (l.journal_entries?.description && typeof l.journal_entries.description === 'string' && l.journal_entries.description.trim()) {
        descs.add(l.journal_entries.description.trim())
      }
    })
    return Array.from(descs).filter(d => d && d.length > 0).sort().map((d, idx) => ({ value: `desc_${idx}`, label: d }))
  }, [lines])

  // Filtered lines
  const filteredLines = useMemo(() => {
    if (!Array.isArray(lines) || lines.length === 0) return []

    // Get the actual description labels from the selected values
    const selectedDescLabels = selectedDescriptions.map(val =>
      descriptionOptions.find(opt => opt.value === val)?.label || ''
    ).filter(Boolean)

    return lines.filter(l => {
      try {
        // Description filter (multi-select)
        if (selectedDescLabels.length > 0) {
          const desc = (l.description || '').trim()
          const entryDesc = (l.journal_entries?.description || '').trim()
          const matchFound = selectedDescLabels.some(sel =>
            sel === desc || sel === entryDesc
          )
          if (!matchFound) return false
        }

        // Date filter
        const entryDate = l.journal_entries?.entry_date || ''
        if (dateFrom && entryDate && entryDate < dateFrom) return false
        if (dateTo && entryDate && entryDate > dateTo) return false

        // Transaction type filter
        if (transactionTypes.length > 0) {
          const debit = getDisplayAmount(l.debit_amount || 0, l.display_debit, l.display_currency)
          const credit = getDisplayAmount(l.credit_amount || 0, l.display_credit, l.display_currency)
          const isDebit = debit > 0
          const isCredit = credit > 0
          if (transactionTypes.includes('debit') && !transactionTypes.includes('credit') && !isDebit) return false
          if (transactionTypes.includes('credit') && !transactionTypes.includes('debit') && !isCredit) return false
        }

        return true
      } catch (err) {
        console.error('Filter error:', err)
        return true
      }
    })
  }, [lines, selectedDescriptions, descriptionOptions, dateFrom, dateTo, transactionTypes, appCurrency])

  // Check if filters are active
  const hasActiveFilters = selectedDescriptions.length > 0 || dateFrom || dateTo || transactionTypes.length > 0

  // Clear all filters
  const clearAllFilters = () => {
    setSelectedDescriptions([])
    setDateFrom("")
    setDateTo("")
    setTransactionTypes([])
  }


  const approveRequest = async (req: BankVoucherRequest) => {
    try {
      setSaving(true)
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase.rpc('approve_bank_voucher', {
        p_request_id: req.id,
        p_approved_by: user?.id
      })
      if (error) throw error

      await notifyBankVoucherApproved({
        companyId: companyId!,
        requestId: req.id,
        voucherType: req.voucher_type,
        amount: req.amount,
        currency: req.currency,
        branchId: account?.branch_id || undefined,
        costCenterId: account?.cost_center_id || undefined,
        createdBy: req.created_by,
        approvedBy: user?.id || ""
      })

      toastActionSuccess(toast, "اعتماد", "السند")
      await loadData()
    } catch (err) {
      toastActionError(toast, "اعتماد", "السند")
    } finally { setSaving(false) }
  }

  const postRequest = async (req: BankVoucherRequest) => {
    try {
      setSaving(true)
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.rpc('post_bank_voucher', {
        p_request_id: req.id,
        p_posted_by: user?.id
      })
      if (error) throw error

      toastActionSuccess(toast, "ترحيل", "السند")
      await loadData()
    } catch (err: any) {
      toast({
        title: "خطأ في الترحيل",
        description: err.message || "حدث خطأ غير متوقع",
        variant: "destructive"
      })
    } finally { setSaving(false) }
  }

  const rejectRequest = async () => {
    if (!rejectingReq || !rejectReason.trim()) return;
    try {
      setSaving(true)
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.rpc('reject_bank_voucher', {
        p_request_id: rejectingReq.id,
        p_rejected_by: user?.id,
        p_reason: rejectReason
      })
      if (error) throw error

      await notifyBankVoucherRejected({
        companyId: companyId!,
        requestId: rejectingReq.id,
        voucherType: rejectingReq.voucher_type,
        amount: rejectingReq.amount,
        currency: rejectingReq.currency,
        branchId: account?.branch_id || undefined,
        costCenterId: account?.cost_center_id || undefined,
        createdBy: rejectingReq.created_by,
        rejectedBy: user?.id || "",
        reason: rejectReason
      })

      toastActionSuccess(toast, "رفض", "السند")
      setRejectingReq(null)
      setRejectReason("")
      await loadData()
    } catch (err) {
      toastActionError(toast, "رفض", "السند")
    } finally { setSaving(false) }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-8 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">تفاصيل الحساب</h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2 truncate">عرض الرصيد والسجل</p>
          </div>
          <Button variant="outline" asChild>
            <a href="/banking">رجوع للبنوك</a>
          </Button>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-2">
            {loading ? (
              <div>جاري التحميل...</div>
            ) : account ? (
              <>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-lg font-semibold">{account.account_name} {account.account_code ? `(${account.account_code})` : ""}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">النوع: {account.account_type}</div>
                    {/* Branch and Cost Center info */}
                    {(account.branch_name || account.cost_center_name) && (
                      <div className="flex items-center gap-2 mt-2 text-xs">
                        {account.branch_name && (
                          <span className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded text-blue-700 dark:text-blue-300">
                            🏢 {account.branch_name}
                          </span>
                        )}
                        {account.cost_center_name && (
                          <span className="flex items-center gap-1 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded text-purple-700 dark:text-purple-300">
                            📍 {account.cost_center_name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className={`text-2xl font-bold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(balance)} {currencySymbol}
                  </div>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-2">عدد الحركات: {lines.length} | العملة: {appCurrency}</div>
              </>
            ) : (
              <div>الحساب غير موجود</div>
            )}
          </CardContent>
        </Card>


        {/* RequestsSection */}
        {requests.length > 0 && (
          <Card className="mt-6 border-orange-200 dark:border-orange-900/50">
            <CardContent className="pt-6">
              <h2 className="text-xl font-semibold mb-4 text-orange-700 dark:text-orange-400">
                {appLang === 'en' ? 'Voucher Requests' : 'طلبات السندات'}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-orange-50 dark:bg-orange-900/20 text-orange-900 dark:text-orange-200">
                    <tr>
                      <th className="p-3 text-right">التاريخ</th>
                      <th className="p-3 text-right">النوع</th>
                      <th className="p-3 text-right">المبلغ</th>
                      <th className="p-3 text-right">المقابل</th>
                      <th className="p-3 text-right">الدفع</th>
                      <th className="p-3 text-right">رقم المرجع</th>
                      <th className="p-3 text-right">الوصف</th>
                      <th className="p-3 text-right">الحالة</th>
                      <th className="p-3 text-right">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map(r => (
                      <tr key={r.id} className="border-b">
                        <td className="p-3">{r.entry_date}</td>
                        <td className="p-3">
                          <span className={`px-2 py-1 rounded text-xs ${r.voucher_type === 'deposit' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {r.voucher_type === 'deposit' ? 'إيداع' : 'سحب'}
                          </span>
                        </td>
                        <td className="p-3">{new Intl.NumberFormat('ar-EG').format(r.amount)} {r.currency}</td>
                        <td className="p-3">{r.counter_account?.account_name}</td>
                        <td className="p-3">
                          {r.payment_method === 'cash' ? 'نقدي' :
                            r.payment_method === 'bank_transfer' ? 'تحويل بنكي' :
                              r.payment_method === 'check' ? 'شيك' :
                                r.payment_method === 'credit_card' ? 'بطاقة ائتمان' : r.payment_method}
                        </td>
                        <td className="p-3">{r.reference_number || '-'}</td>
                        <td className="p-3">{r.description}</td>
                        <td className="p-3">
                          {r.status === 'draft' && <span className="text-gray-600">مسودة</span>}
                          {r.status === 'pending' && <span className="text-orange-600">قيد المراجعة</span>}
                          {r.status === 'approved' && <span className="text-blue-600">معتمد مسبقاً</span>}
                          {r.status === 'posted' && <span className="text-green-600">مُرحل ومُسجل</span>}
                          {r.status === 'rejected' && <div className="text-red-600">مرفوض {r.rejection_reason && <span className="block text-xs text-gray-500">{r.rejection_reason}</span>}</div>}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            {r.status === 'pending' && ["super_admin", "admin", "owner", "manager", "general_manager"].includes(role || "") && (
                              <>
                                <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => approveRequest(r)} disabled={saving}><Check className="w-4 h-4 mr-1" /> اعتماد</Button>
                                <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setRejectingReq(r)} disabled={saving}><Ban className="w-4 h-4 mr-1" /> رفض</Button>
                              </>
                            )}
                            {r.status === 'approved' && ["super_admin", "admin", "owner", "manager", "general_manager"].includes(role || "") && (
                              <Button size="sm" variant="outline" className="text-green-600 border-green-200 hover:bg-green-50" onClick={() => postRequest(r)} disabled={saving}><Check className="w-4 h-4 mr-1" /> ترحيل لدفتر اليومية</Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={!!rejectingReq} onOpenChange={(open) => !open && setRejectingReq(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>رفض السند</DialogTitle>
              <DialogDescription>يرجى إدخال سبب الرفض لإعلام الموظف به.</DialogDescription>
            </DialogHeader>
            <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="السبب..." />
            <DialogFooter>
              <Button onClick={() => setRejectingReq(null)} variant="outline">إلغاء</Button>
              <Button onClick={rejectRequest} disabled={!rejectReason || saving} variant="destructive">تأكيد الرفض</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>



        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-xl font-semibold">{appLang === 'en' ? 'Recent Transactions' : 'آخر الحركات'}</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFiltersExpanded(!filtersExpanded)}
                className="flex items-center gap-2"
              >
                <Filter className="w-4 h-4" />
                {appLang === 'en' ? 'Filters' : 'الفلاتر'}
                {hasActiveFilters && (
                  <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                    {[selectedDescriptions.length > 0, dateFrom, dateTo, transactionTypes.length > 0].filter(Boolean).length}
                  </span>
                )}
              </Button>
            </div>

            {/* Filters Section */}
            {filtersExpanded && (
              <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Description Filter */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm">
                      <Search className="w-4 h-4 text-purple-500" />
                      {appLang === 'en' ? 'Description' : 'الوصف'}
                    </Label>
                    <MultiSelect
                      options={descriptionOptions}
                      selected={selectedDescriptions}
                      onChange={setSelectedDescriptions}
                      placeholder={appLang === 'en' ? 'All Descriptions' : 'جميع الأوصاف'}
                      searchPlaceholder={appLang === 'en' ? 'Search descriptions...' : 'بحث في الأوصاف...'}
                      emptyMessage={appLang === 'en' ? 'No descriptions found' : 'لا توجد أوصاف'}
                      className="h-10"
                    />
                  </div>

                  {/* Transaction Type */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm">
                      <Filter className="w-4 h-4 text-blue-500" />
                      {appLang === 'en' ? 'Transaction Type' : 'نوع الحركة'}
                    </Label>
                    <MultiSelect
                      options={transactionTypeOptions}
                      selected={transactionTypes}
                      onChange={setTransactionTypes}
                      placeholder={appLang === 'en' ? 'All Types' : 'كل الأنواع'}
                      searchPlaceholder={appLang === 'en' ? 'Search...' : 'بحث...'}
                      emptyMessage={appLang === 'en' ? 'No types found' : 'لا توجد أنواع'}
                      className="h-10"
                    />
                  </div>

                  {/* Date From */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-green-500" />
                      {appLang === 'en' ? 'From Date' : 'من تاريخ'}
                    </Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-10"
                    />
                  </div>

                  {/* Date To */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-orange-500" />
                      {appLang === 'en' ? 'To Date' : 'إلى تاريخ'}
                    </Label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </div>

                {/* Active Filters & Clear Button */}
                {hasActiveFilters && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-200 dark:border-slate-700">
                    <span className="text-sm text-gray-500">{appLang === 'en' ? 'Active filters:' : 'الفلاتر النشطة:'}</span>
                    {selectedDescriptions.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs">
                        {selectedDescriptions.length} {appLang === 'en' ? 'descriptions' : 'أوصاف'}
                        <button onClick={() => setSelectedDescriptions([])} className="hover:text-purple-900"><X className="w-3 h-3" /></button>
                      </span>
                    )}
                    {transactionTypes.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                        {transactionTypes.length} {appLang === 'en' ? 'types' : 'أنواع'}
                        <button onClick={() => setTransactionTypes([])} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
                      </span>
                    )}
                    {(dateFrom || dateTo) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs">
                        {dateFrom || '...'} → {dateTo || '...'}
                        <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="hover:text-green-900"><X className="w-3 h-3" /></button>
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllFilters}
                      className="text-xs text-red-500 hover:text-red-600 mr-auto"
                    >
                      {appLang === 'en' ? 'Clear All' : 'مسح الكل'} ✕
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Results Count */}
            {hasActiveFilters && (
              <div className="text-sm text-gray-500">
                {appLang === 'en'
                  ? `Showing ${filteredLines.length} of ${lines.length} transactions`
                  : `عرض ${filteredLines.length} من ${lines.length} حركة`}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-[480px] w-full text-sm">
                <thead className="border-b bg-gray-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden sm:table-cell">{appLang === 'en' ? 'Description' : 'الوصف'}</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden lg:table-cell">{appLang === 'en' ? 'Entry' : 'القيد'}</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Debit' : 'مدين'}</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Credit' : 'دائن'}</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden sm:table-cell">{appLang === 'en' ? 'Balance' : 'الرصيد'}</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Calculate running balance from oldest to newest (using display amounts)
                    const sortedLines = [...filteredLines].reverse()
                    let runningBalance = 0
                    const linesWithBalance = sortedLines.map(l => {
                      const debit = getDisplayAmount(l.debit_amount || 0, l.display_debit, l.display_currency)
                      const credit = getDisplayAmount(l.credit_amount || 0, l.display_credit, l.display_currency)
                      runningBalance += debit - credit
                      return { ...l, runningBalance, displayDebit: debit, displayCredit: credit }
                    })
                    // Reverse back to show newest first
                    return linesWithBalance.reverse().map(l => (
                      <tr key={l.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{l.journal_entries?.entry_date || '-'}</td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300 hidden sm:table-cell max-w-[150px] truncate">{l.description || "-"}</td>
                        <td className="px-3 py-3 text-gray-500 dark:text-gray-400 hidden lg:table-cell text-xs max-w-[150px] truncate">{l.journal_entries?.description || "-"}</td>
                        <td className="px-3 py-3 text-green-600 dark:text-green-400">{l.displayDebit > 0 ? new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2 }).format(l.displayDebit) + ' ' + currencySymbol : '-'}</td>
                        <td className="px-3 py-3 text-red-600 dark:text-red-400">{l.displayCredit > 0 ? new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2 }).format(l.displayCredit) + ' ' + currencySymbol : '-'}</td>
                        <td className={`px-3 py-3 font-medium hidden sm:table-cell ${l.runningBalance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                          {new Intl.NumberFormat('ar-EG', { minimumFractionDigits: 2 }).format(l.runningBalance)} {currencySymbol}
                        </td>
                      </tr>
                    ))
                  })()}
                  {filteredLines.length === 0 && !loading && (
                    <tr>
                      <td className="p-2 text-center text-gray-500 dark:text-gray-400" colSpan={6}>
                        {hasActiveFilters
                          ? (appLang === 'en' ? 'No transactions match your filters.' : 'لا توجد حركات مطابقة للفلاتر.')
                          : (appLang === 'en' ? 'No transactions yet for this account.' : 'لا توجد حركات بعد لهذا الحساب.')}
                      </td>
                    </tr>
                  )}
                </tbody>
                {filteredLines.length > 0 && (
                  <tfoot className="bg-gray-100 dark:bg-slate-800 font-bold">
                    <tr>
                      <td className="px-3 py-3 text-gray-900 dark:text-white" colSpan={1}>{appLang === 'en' ? 'Total' : 'الإجمالي'}</td>
                      <td className="px-3 py-3 hidden sm:table-cell" colSpan={1}></td>
                      <td className="px-3 py-3 hidden lg:table-cell" colSpan={1}></td>
                      <td className="px-3 py-3 text-green-600 dark:text-green-400">{new Intl.NumberFormat(appLang === 'en' ? 'en-EG' : 'ar-EG', { minimumFractionDigits: 2 }).format(Array.isArray(filteredLines) ? filteredLines.reduce((s, l) => s + getDisplayAmount(l.debit_amount || 0, l.display_debit, l.display_currency), 0) : 0)} {currencySymbol}</td>
                      <td className="px-3 py-3 text-red-600 dark:text-red-400">{new Intl.NumberFormat(appLang === 'en' ? 'en-EG' : 'ar-EG', { minimumFractionDigits: 2 }).format(Array.isArray(filteredLines) ? filteredLines.reduce((s, l) => s + getDisplayAmount(l.credit_amount || 0, l.display_credit, l.display_currency), 0) : 0)} {currencySymbol}</td>
                      <td className={`px-3 py-3 hidden sm:table-cell ${Array.isArray(filteredLines) && filteredLines.reduce((s, l) => s + getDisplayAmount(l.debit_amount || 0, l.display_debit, l.display_currency) - getDisplayAmount(l.credit_amount || 0, l.display_credit, l.display_currency), 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {new Intl.NumberFormat(appLang === 'en' ? 'en-EG' : 'ar-EG', { minimumFractionDigits: 2 }).format(Array.isArray(filteredLines) ? filteredLines.reduce((s, l) => s + getDisplayAmount(l.debit_amount || 0, l.display_debit, l.display_currency) - getDisplayAmount(l.credit_amount || 0, l.display_credit, l.display_currency), 0) : 0)} {currencySymbol}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

