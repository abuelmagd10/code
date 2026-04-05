"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import {
  Wallet, ChevronRight, ArrowUpCircle, ArrowDownCircle,
  FileText, RotateCcw, CheckCircle, AlertCircle, Loader2
} from "lucide-react"

type LedgerRow = {
  id: string
  amount: number
  source_type: string
  source_id: string
  description: string
  created_at: string
  created_by: string
}

type OpenInvoice = {
  id: string
  invoice_number: string
  total_amount: number
  paid_amount: number
  status: string
}

const SOURCE_TYPE_ICON: Record<string, React.ReactNode> = {
  sales_return: <RotateCcw className="h-4 w-4 text-emerald-500" />,
  credit_applied: <ArrowDownCircle className="h-4 w-4 text-red-500" />,
  manual: <ArrowUpCircle className="h-4 w-4 text-blue-500" />,
}

export default function CustomerCreditDetailPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const params = useParams()
  const customerId = params.customerId as string

  const [loading, setLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [appCurrency, setAppCurrency] = useState<string>('EGP')
  const [customer, setCustomer] = useState<any>(null)
  const [balance, setBalance] = useState(0)
  const [ledger, setLedger] = useState<LedgerRow[]>([])

  // Apply dialog state
  const [showApply, setShowApply] = useState(false)
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("")
  const [applyAmount, setApplyAmount] = useState<string>("")
  const [applying, setApplying] = useState(false)

  const currencySymbol = { EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ' }[appCurrency] || appCurrency

  useEffect(() => {
    try {
      setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      setAppCurrency(localStorage.getItem('app_currency') || 'EGP')
    } catch {}
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/customer-credits/${customerId}`)
      const json = await res.json()
      if (json.success) {
        setCustomer(json.data.customer)
        setBalance(json.data.balance)
        setLedger(json.data.ledger)
      }
    } catch (e) {
      console.error("Error loading credit detail:", e)
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { loadData() }, [loadData])

  const handleOpenApplyDialog = async () => {
    setShowApply(true)
    setApplyAmount("")
    setSelectedInvoiceId("")
    // جلب فواتير العميل المفتوحة
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, total_amount, paid_amount, status")
      .eq("customer_id", customerId)
      .in("status", ["sent", "partially_paid"])
      .order("invoice_date", { ascending: false })
      .limit(30)
    setOpenInvoices(invoices || [])
  }

  const handleApply = async () => {
    if (!selectedInvoiceId || !applyAmount || Number(applyAmount) <= 0) {
      toast({ variant: "destructive", title: appLang === 'en' ? "Missing Data" : "بيانات مفقودة", description: appLang === 'en' ? "Select an invoice and enter an amount" : "اختر فاتورة وأدخل المبلغ" })
      return
    }
    const selectedInv = openInvoices.find(i => i.id === selectedInvoiceId)
    const remaining = selectedInv ? Number(selectedInv.total_amount) - Number(selectedInv.paid_amount) : 0
    const maxApply = Math.min(balance, remaining)

    if (Number(applyAmount) > maxApply) {
      toast({ variant: "destructive", title: appLang === 'en' ? "Exceeds Limit" : "يتجاوز الحد", description: `${appLang === 'en' ? 'Max applicable amount: ' : 'الحد الأقصى: '}${currencySymbol}${maxApply.toFixed(2)}` })
      return
    }

    setApplying(true)
    try {
      const res = await fetch(`/api/customer-credits/${customerId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: selectedInvoiceId, amount: Number(applyAmount) })
      })
      const json = await res.json()
      if (json.success) {
        toast({ title: appLang === 'en' ? "✅ Credit Applied" : "✅ تم تطبيق الرصيد", description: appLang === 'en' ? `Applied ${currencySymbol}${Number(applyAmount).toFixed(2)} to invoice` : `تم تطبيق ${currencySymbol}${Number(applyAmount).toFixed(2)} على الفاتورة` })
        setShowApply(false)
        await loadData()
      } else {
        toast({ variant: "destructive", title: appLang === 'en' ? "Error" : "خطأ", description: json.error })
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message })
    } finally {
      setApplying(false)
    }
  }

  const getSourceLabel = (type: string) => {
    const labels: Record<string, { ar: string; en: string }> = {
      sales_return: { ar: 'مرتجع مبيعات', en: 'Sales Return' },
      credit_applied: { ar: 'رصيد مطبّق على فاتورة', en: 'Credit Applied' },
      manual: { ar: 'إدخال يدوي', en: 'Manual Entry' },
    }
    return labels[type]?.[appLang] || type
  }

  if (loading) return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</p>
        </div>
      </main>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-5 overflow-x-hidden">

        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Link href="/customer-credits" className="hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1">
            <Wallet className="h-4 w-4" />
            {appLang === 'en' ? 'Customer Credits' : 'الأرصدة الدائنة'}
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-gray-700 dark:text-gray-200 font-medium">{customer?.name || '...'}</span>
        </nav>

        {/* Balance Card */}
        <div className="bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 rounded-2xl shadow-lg p-6 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.15),transparent)]" />
          <div className="relative">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-emerald-100 text-sm">{appLang === 'en' ? 'Credit Balance' : 'الرصيد الدائن المتاح'}</p>
                <p className="text-4xl sm:text-5xl font-bold mt-1 tracking-tight">
                  {currencySymbol}{balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-emerald-100 text-sm mt-2">{customer?.name}</p>
              </div>
              <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
                <Wallet className="h-8 w-8 text-white" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              {balance > 0 && (
                <Button
                  onClick={handleOpenApplyDialog}
                  className="bg-white text-emerald-700 hover:bg-emerald-50 font-semibold gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  {appLang === 'en' ? 'Apply to Invoice' : 'تطبيق على فاتورة'}
                </Button>
              )}
              <Link href={`/customers`}>
                <Button variant="outline" className="border-white/40 text-white hover:bg-white/20 gap-2">
                  <FileText className="h-4 w-4" />
                  {appLang === 'en' ? 'Customer Page' : 'صفحة العميل'}
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Ledger History */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">
              {appLang === 'en' ? 'Transaction History' : 'سجل الحركات'}
            </h2>
            <span className="text-xs bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">{ledger.length}</span>
          </div>
          <CardContent className="p-0">
            {ledger.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No transactions yet' : 'لا توجد حركات بعد'}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-800">
                {ledger.map((row) => (
                  <div key={row.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="p-2 rounded-full bg-gray-100 dark:bg-slate-700 flex-shrink-0">
                      {SOURCE_TYPE_ICON[row.source_type] || <Wallet className="h-4 w-4 text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{row.description || getSourceLabel(row.source_type)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {getSourceLabel(row.source_type)} · {new Date(row.created_at).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}
                      </p>
                    </div>
                    <span className={`font-bold text-sm tabular-nums flex-shrink-0 ${Number(row.amount) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {Number(row.amount) >= 0 ? '+' : ''}{currencySymbol}{Math.abs(Number(row.amount)).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Apply Credit Dialog */}
      <Dialog open={showApply} onOpenChange={setShowApply}>
        <DialogContent className="sm:max-w-md dark:bg-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle className="h-5 w-5" />
              {appLang === 'en' ? 'Apply Credit to Invoice' : 'تطبيق الرصيد على فاتورة'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Available Balance */}
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800">
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{appLang === 'en' ? 'Available Credit Balance' : 'الرصيد الدائن المتاح'}</p>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{currencySymbol}{balance.toFixed(2)}</p>
            </div>

            {/* Invoice Select */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {appLang === 'en' ? 'Select Invoice' : 'اختر الفاتورة'}
              </label>
              {openInvoices.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">{appLang === 'en' ? 'No open invoices for this customer' : 'لا توجد فواتير مفتوحة لهذا العميل'}</p>
              ) : (
                <select
                  value={selectedInvoiceId}
                  onChange={(e) => {
                    setSelectedInvoiceId(e.target.value)
                    const inv = openInvoices.find(i => i.id === e.target.value)
                    if (inv) {
                      const remaining = Number(inv.total_amount) - Number(inv.paid_amount)
                      setApplyAmount(String(Math.min(balance, remaining).toFixed(2)))
                    }
                  }}
                  className="w-full h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                >
                  <option value="">{appLang === 'en' ? '— Select —' : '— اختر —'}</option>
                  {openInvoices.map(inv => {
                    const remaining = Number(inv.total_amount) - Number(inv.paid_amount)
                    return (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoice_number} — {appLang === 'en' ? 'Remaining: ' : 'متبقي: '}{currencySymbol}{remaining.toFixed(2)}
                      </option>
                    )
                  })}
                </select>
              )}
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {appLang === 'en' ? 'Amount to Apply' : 'المبلغ المراد تطبيقه'}
              </label>
              <div className="relative">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">{currencySymbol}</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={balance}
                  value={applyAmount}
                  onChange={(e) => setApplyAmount(e.target.value)}
                  className="w-full h-10 px-4 pr-10 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  placeholder="0.00"
                />
              </div>
              <p className="text-xs text-gray-400">{appLang === 'en' ? `Max: ${currencySymbol}${balance.toFixed(2)}` : `الحد الأقصى: ${currencySymbol}${balance.toFixed(2)}`}</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowApply(false)} disabled={applying}>
              {appLang === 'en' ? 'Cancel' : 'إلغاء'}
            </Button>
            <Button
              onClick={handleApply}
              disabled={applying || !selectedInvoiceId || !applyAmount}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {appLang === 'en' ? 'Apply Credit' : 'تطبيق الرصيد'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
