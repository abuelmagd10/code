"use client"

import type React from "react"

import { useState, useEffect, useTransition } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { Plus, Edit2, Trash2, Search, Truck, Wallet, ArrowDownLeft, CreditCard } from "lucide-react"
import { TableSkeleton } from "@/components/ui/skeleton"
import { SupplierReceiptDialog } from "@/components/suppliers/supplier-receipt-dialog"
import { getExchangeRate, getActiveCurrencies, type Currency, DEFAULT_CURRENCIES } from "@/lib/currency-service"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { useMemo } from "react"

interface Supplier {
  id: string
  name: string
  email: string
  phone: string
  city: string
  country: string
  tax_id: string
  payment_terms: string
}

interface SupplierBalance {
  advances: number      // السلف المدفوعة للمورد
  payables: number      // الذمم الدائنة (ما علينا للمورد)
  debitCredits: number  // الأرصدة المدينة (ما للمورد عندنا من مرتجعات)
}

export default function SuppliersPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  // 🚀 تحسين الأداء - استخدام useTransition للفلاتر
  const [isPending, startTransition] = useTransition()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

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

  // Listen for currency changes
  useEffect(() => {
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency') || 'EGP'
      setAppCurrency(newCurrency)
    }
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [])
  const [permView, setPermView] = useState(true)
  const [permWrite, setPermWrite] = useState(false)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    city: "",
    country: "",
    tax_id: "",
    payment_terms: "Net 30",
  })

  // ===== حالات الأرصدة وسند الاستقبال =====
  const [balances, setBalances] = useState<Record<string, SupplierBalance>>({})
  const [accounts, setAccounts] = useState<{ id: string; account_code: string; account_name: string; account_type: string; sub_type?: string }[]>([])
  const [currencies, setCurrencies] = useState<Currency[]>([])

  // حالات نافذة سند استقبال الأموال
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [receiptAmount, setReceiptAmount] = useState(0)
  const [receiptCurrency, setReceiptCurrency] = useState(appCurrency)
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0])
  const [receiptMethod, setReceiptMethod] = useState("cash")
  const [receiptAccountId, setReceiptAccountId] = useState("")
  const [receiptNotes, setReceiptNotes] = useState("")
  const [receiptExRate, setReceiptExRate] = useState<{ rate: number; rateId: string | null; source: string }>({ rate: 1, rateId: null, source: 'default' })

  useEffect(() => {
    (async () => {
      setPermView(await canAction(supabase, 'suppliers', 'read'))
      setPermWrite(await canAction(supabase, 'suppliers', 'write'))
      setPermUpdate(await canAction(supabase, 'suppliers', 'update'))
      setPermDelete(await canAction(supabase, 'suppliers', 'delete'))
    })()
    loadSuppliers()
  }, [])
  useEffect(() => {
    const reloadPerms = async () => {
      setPermView(await canAction(supabase, 'suppliers', 'read'))
      setPermWrite(await canAction(supabase, 'suppliers', 'write'))
      setPermUpdate(await canAction(supabase, 'suppliers', 'update'))
      setPermDelete(await canAction(supabase, 'suppliers', 'delete'))
    }
    const handler = () => { reloadPerms() }
    if (typeof window !== 'undefined') window.addEventListener('permissions_updated', handler)
    return () => { if (typeof window !== 'undefined') window.removeEventListener('permissions_updated', handler) }
  }, [])

  const loadSuppliers = async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // تحميل الموردين
      const { data, error } = await supabase.from("suppliers").select("*").eq("company_id", companyId)
      if (error) {
        // ERP-grade error handling: عدم وجود جدول محاسبي هو خطأ نظام حرج
        if (error.code === 'PGRST116' || error.code === 'PGRST205') {
          const errorMsg = appLang === 'en'
            ? 'System not initialized: suppliers table is missing. Please run company initialization first.'
            : 'النظام غير مهيأ: جدول الموردين مفقود. يرجى تشغيل تهيئة الشركة أولاً.'
          console.error("ERP System Error:", errorMsg, error)
          toast({
            title: appLang === 'en' ? 'System Not Initialized' : 'النظام غير مهيأ',
            description: errorMsg,
            variant: "destructive",
            duration: 10000
          })
          setIsLoading(false)
          return
        }
        toastActionError(toast, "الجلب", "الموردين", "تعذر جلب قائمة الموردين")
      }
      setSuppliers(data || [])

      // تحميل الحسابات للاستخدام في سند الاستقبال
      const { data: accountsData, error: accountsError } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, sub_type")
        .eq("company_id", companyId)
        .in("account_type", ["asset", "liability"])

      if (accountsError) {
        // ERP-grade error handling: عدم وجود جدول محاسبي هو خطأ نظام حرج
        if (accountsError.code === 'PGRST116' || accountsError.code === 'PGRST205') {
          const errorMsg = appLang === 'en'
            ? 'System not initialized: chart_of_accounts table is missing. Please run company initialization first.'
            : 'النظام غير مهيأ: جدول الشجرة المحاسبية مفقود. يرجى تشغيل تهيئة الشركة أولاً.'
          console.error("ERP System Error:", errorMsg, accountsError)
          toast({
            title: appLang === 'en' ? 'System Not Initialized' : 'النظام غير مهيأ',
            description: errorMsg,
            variant: "destructive",
            duration: 10000
          })
          setIsLoading(false)
          return
        }
        console.error("Error loading accounts:", accountsError)
      }
      setAccounts(accountsData || [])

      // تحميل العملات
      const activeCurrencies = await getActiveCurrencies(supabase)
      setCurrencies(activeCurrencies)

      // تحميل أرصدة الموردين
      if (data && data.length > 0) {
        await loadSupplierBalances(companyId, data)
      }
    } catch (error) {
      console.error("Error loading suppliers:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // دالة تحميل أرصدة الموردين
  const loadSupplierBalances = async (companyId: string, suppliersList: Supplier[]) => {
    const newBalances: Record<string, SupplierBalance> = {}

    // ===== 🔄 حساب الذمم الدائنة من القيود المحاسبية (Zoho Books Pattern) =====
    // بدلاً من حساب الذمم من الفواتير مباشرة، نحسبها من حساب Accounts Payable
    const { data: apAccount } = await supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("company_id", companyId)
      .eq("sub_type", "accounts_payable")
      .eq("is_active", true)
      .limit(1)
      .single()

    for (const supplier of suppliersList) {
      let payables = 0

      if (apAccount) {
        // حساب رصيد المورد من جميع القيود المحاسبية التي تؤثر على AP
        // هذا يشمل: قيود الفواتير (bill) + قيود الدفعات والمرتجعات (bill_payment)

        // جلب جميع فواتير المورد
        const { data: supplierBills = [] } = await supabase
          .from("bills")
          .select("id")
          .eq("company_id", companyId)
          .eq("supplier_id", supplier.id)
          .neq("status", "draft")
          .neq("status", "cancelled")

        const billIds = supplierBills.map((b: any) => b.id)

        if (billIds.length > 0) {
          // جلب جميع journal_entries المرتبطة بفواتير المورد
          // (قيود bill + قيود bill_payment المرتبطة بفواتير المورد)
          const { data: billEntries = [] } = await supabase
            .from("journal_entries")
            .select("id")
            .eq("company_id", companyId)
            .eq("reference_type", "bill")
            .in("reference_id", billIds)
            .eq("is_deleted", false)

          // جلب جميع payments المرتبطة بفواتير المورد
          const { data: payments = [] } = await supabase
            .from("payments")
            .select("id")
            .eq("company_id", companyId)
            .in("bill_id", billIds)

          const paymentIds = payments.map((p: any) => p.id)

          let paymentEntries: any[] = []
          if (paymentIds.length > 0) {
            const { data = [] } = await supabase
              .from("journal_entries")
              .select("id")
              .eq("company_id", companyId)
              .eq("reference_type", "bill_payment")
              .in("reference_id", paymentIds)
              .eq("is_deleted", false)
            paymentEntries = data || []
          }

          // جمع جميع entry IDs
          const allEntryIds = [
            ...billEntries.map((e: any) => e.id),
            ...paymentEntries.map((e: any) => e.id)
          ]

          if (allEntryIds.length > 0) {
            // جلب جميع journal_entry_lines لهذه القيود
            const { data: allLines = [] } = await supabase
              .from("journal_entry_lines")
              .select("debit_amount, credit_amount")
              .eq("account_id", apAccount.id)
              .in("journal_entry_id", allEntryIds)

            allLines.forEach((line: any) => {
              // الذمم الدائنة = الدائن - المدين
              const balance = Number(line.credit_amount || 0) - Number(line.debit_amount || 0)
              payables += balance
            })
          }
        }
      } else {
        // Fallback: إذا لم يوجد حساب AP، استخدم الطريقة القديمة
        console.warn("⚠️ حساب Accounts Payable غير موجود، استخدام الطريقة القديمة")
        const { data: bills } = await supabase
          .from("bills")
          .select("total_amount, paid_amount, status")
          .eq("company_id", companyId)
          .eq("supplier_id", supplier.id)
          .in("status", ["sent", "received", "partially_paid"])

        if (bills) {
          for (const bill of bills) {
            const remaining = Number(bill.total_amount || 0) - Number(bill.paid_amount || 0)
            payables += remaining
          }
        }
      }

      // حساب الأرصدة المدينة (من مرتجعات المشتريات)
      let debitCreditsTotal = 0
      try {
        const { data: debitCredits, error: debitCreditsError } = await supabase
          .from("supplier_debit_credits")
          .select("amount, used_amount, applied_amount")
          .eq("company_id", companyId)
          .eq("supplier_id", supplier.id)
          .eq("status", "active")

        if (debitCreditsError) {
          // ERP-grade error handling: عدم وجود جدول محاسبي هو خطأ نظام حرج
          if (debitCreditsError.code === 'PGRST116' || debitCreditsError.code === 'PGRST205') {
            const errorMsg = appLang === 'en'
              ? 'System not initialized: supplier_debit_credits table is missing. Please run SQL migration script: scripts/090_supplier_debit_credits.sql'
              : 'النظام غير مهيأ: جدول أرصدة الموردين المدينة مفقود. يرجى تشغيل سكربت SQL: scripts/090_supplier_debit_credits.sql'
            console.error("ERP System Error:", errorMsg, debitCreditsError)
            // لا نوقف العملية، فقط نسجل الخطأ
            // لأن هذا الجدول اختياري (لحساب الأرصدة فقط)
          } else {
            console.error("Error loading supplier debit credits:", debitCreditsError)
          }
        } else if (debitCredits) {
          for (const dc of debitCredits) {
            const available = Number(dc.amount || 0) - Number(dc.used_amount || 0) - Number(dc.applied_amount || 0)
            debitCreditsTotal += Math.max(0, available)
          }
        }
      } catch (error: any) {
        // معالجة الأخطاء الأخرى
        if (error?.code === 'PGRST116' || error?.code === 'PGRST205') {
          console.warn("supplier_debit_credits table not found, skipping debit credits calculation")
        } else {
          console.error("Error calculating supplier debit credits:", error)
        }
      }

      newBalances[supplier.id] = {
        advances: 0, // يمكن إضافة حساب السلف لاحقاً
        payables,
        debitCredits: debitCreditsTotal
      }
    }

    setBalances(newBalances)
  }

  // تحديث سعر الصرف عند تغيير العملة
  useEffect(() => {
    const updateExRate = async () => {
      if (receiptCurrency === appCurrency) {
        setReceiptExRate({ rate: 1, rateId: null, source: 'same_currency' })
      } else {
        const exRate = await getExchangeRate(supabase, receiptCurrency, appCurrency)
        setReceiptExRate({ rate: exRate.rate, rateId: exRate.rateId || null, source: exRate.source })
      }
    }
    updateExRate()
  }, [receiptCurrency, appCurrency])

  // فتح نافذة سند الاستقبال
  const openReceiptDialog = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setReceiptAmount(0)
    setReceiptCurrency(appCurrency)
    setReceiptDate(new Date().toISOString().split('T')[0])
    setReceiptMethod("cash")
    setReceiptAccountId("")
    setReceiptNotes("")
    setReceiptDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      if (editingId) {
        const { error } = await supabase.from("suppliers").update(formData).eq("id", editingId)

        if (error) throw error
      } else {
        const { error } = await supabase.from("suppliers").insert([{ ...formData, company_id: companyId }])

        if (error) throw error
      }

      setIsDialogOpen(false)
      setEditingId(null)
      setFormData({
        name: "",
        email: "",
        phone: "",
        city: "",
        country: "",
        tax_id: "",
        payment_terms: "Net 30",
      })
      loadSuppliers()
    } catch (error) {
      console.error("Error saving supplier:", error)
    }
  }

  const handleEdit = (supplier: Supplier) => {
    setFormData(supplier)
    setEditingId(supplier.id)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("suppliers").delete().eq("id", id)

      if (error) throw error
      loadSuppliers()
    } catch (error) {
      console.error("Error deleting supplier:", error)
      toastActionError(toast, "الحذف", "المورد", "تعذر حذف المورد")
    }
  }

  const filteredSuppliers = suppliers.filter(
    (supplier) =>
      supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.email.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  // تعريف أعمدة الجدول
  const tableColumns: DataTableColumn<Supplier>[] = useMemo(() => [
    {
      key: 'name',
      header: appLang === 'en' ? 'Name' : 'الاسم',
      type: 'text',
      align: 'left',
      width: 'min-w-[150px]',
      format: (value) => (
        <span className="font-medium text-gray-900 dark:text-white">{value}</span>
      )
    },
    {
      key: 'phone',
      header: appLang === 'en' ? 'Phone' : 'الهاتف',
      type: 'text',
      align: 'left',
      hidden: 'sm',
      format: (value) => value || '-'
    },
    {
      key: 'city',
      header: appLang === 'en' ? 'City' : 'المدينة',
      type: 'text',
      align: 'left',
      hidden: 'md',
      format: (value) => value || '-'
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Payables' : 'ذمم دائنة',
      type: 'currency',
      align: 'right',
      format: (_, row) => {
        const balance = balances[row.id] || { advances: 0, payables: 0, debitCredits: 0 }
        return balance.payables > 0 ? (
          <span className="text-red-600 dark:text-red-400 font-semibold flex items-center gap-1 justify-end">
            <CreditCard className="w-4 h-4" />
            {`${currencySymbol} ${balance.payables.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )
      }
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Debit Credits' : 'رصيد مدين',
      type: 'currency',
      align: 'right',
      format: (_, row) => {
        const balance = balances[row.id] || { advances: 0, payables: 0, debitCredits: 0 }
        return balance.debitCredits > 0 ? (
          <span className="text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1 justify-end">
            <Wallet className="w-4 h-4" />
            {`${currencySymbol} ${balance.debitCredits.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )
      }
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Actions' : 'إجراءات',
      type: 'actions',
      align: 'center',
      format: (_, row) => {
        const balance = balances[row.id] || { advances: 0, payables: 0, debitCredits: 0 }
        return (
          <div className="flex gap-1 flex-wrap justify-center">
            {balance.debitCredits > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => openReceiptDialog(row)}
                className="text-blue-600 hover:text-blue-700 border-blue-300"
                disabled={!permWrite}
                title={!permWrite ? (appLang === 'en' ? 'No permission to create receipt' : 'لا توجد صلاحية لإنشاء سند') : ''}
              >
                <ArrowDownLeft className="w-4 h-4" />
                {appLang === 'en' ? 'Receipt' : 'سند'}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => handleEdit(row)}
              disabled={!permUpdate}
              title={appLang === 'en' ? 'Edit supplier' : 'تعديل المورد'}
            >
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-500 hover:text-red-600"
              onClick={() => handleDelete(row.id)}
              disabled={!permDelete}
              title={appLang === 'en' ? 'Delete supplier' : 'حذف المورد'}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )
      }
    }
  ], [appLang, currencySymbol, balances, permWrite, permUpdate, permDelete])

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang === 'en' ? 'Suppliers' : 'الموردين'}</h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang === 'en' ? 'Manage suppliers' : 'إدارة الموردين'}</p>
                </div>
              </div>
              {permWrite ? (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      className="h-10 sm:h-11 text-sm sm:text-base px-3 sm:px-4 self-start sm:self-auto"
                      onClick={() => {
                        setEditingId(null)
                        setFormData({
                          name: "",
                          email: "",
                          phone: "",
                          city: "",
                          country: "",
                          tax_id: "",
                          payment_terms: "Net 30",
                        })
                      }}
                    >
                      <Plus className="w-4 h-4 ml-1 sm:ml-2" />
                      {appLang === 'en' ? 'New' : 'جديد'}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>{editingId ? (appLang === 'en' ? 'Edit Supplier' : 'تعديل مورد') : (appLang === 'en' ? 'Add New Supplier' : 'إضافة مورد جديد')}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">{appLang === 'en' ? 'Supplier Name' : 'اسم المورد'}</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">{appLang === 'en' ? 'Email' : 'البريد الإلكتروني'}</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">{appLang === 'en' ? 'Phone' : 'رقم الهاتف'}</Label>
                        <Input
                          id="phone"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="city">{appLang === 'en' ? 'City' : 'المدينة'}</Label>
                        <Input
                          id="city"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="country">{appLang === 'en' ? 'Country' : 'الدولة'}</Label>
                        <Input
                          id="country"
                          value={formData.country}
                          onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tax_id">{appLang === 'en' ? 'Tax ID' : 'الرقم الضريبي'}</Label>
                        <Input
                          id="tax_id"
                          value={formData.tax_id}
                          onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                        />
                      </div>
                      <Button type="submit" className="w-full">
                        {editingId ? (appLang === 'en' ? 'Update' : 'تحديث') : (appLang === 'en' ? 'Add' : 'إضافة')}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              ) : null}
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <Input
                  placeholder={appLang === 'en' ? 'Search supplier...' : 'البحث عن مورد...'}
                  value={searchTerm}
                  onChange={(e) => {
                    const val = e.target.value
                    startTransition(() => setSearchTerm(val))
                  }}
                  className={`flex-1 ${isPending ? 'opacity-70' : ''}`}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{appLang === 'en' ? 'Suppliers List' : 'قائمة الموردين'}</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <TableSkeleton
                  cols={9}
                  rows={8}
                  className="mt-4"
                />
              ) : filteredSuppliers.length === 0 ? (
                <p className="text-center py-8 text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No suppliers yet' : 'لا يوجد موردين حتى الآن'}</p>
              ) : (
                <DataTable
                  columns={tableColumns}
                  data={filteredSuppliers}
                  keyField="id"
                  lang={appLang}
                  minWidth="min-w-[600px]"
                  emptyMessage={appLang === 'en' ? 'No suppliers found' : 'لا توجد موردين'}
                  footer={{
                    render: () => {
                      const totalSuppliers = filteredSuppliers.length
                      const totalPayables = filteredSuppliers.reduce((sum, s) => {
                        const balance = balances[s.id] || { advances: 0, payables: 0, debitCredits: 0 }
                        return sum + balance.payables
                      }, 0)
                      const totalDebitCredits = filteredSuppliers.reduce((sum, s) => {
                        const balance = balances[s.id] || { advances: 0, payables: 0, debitCredits: 0 }
                        return sum + balance.debitCredits
                      }, 0)

                      return (
                        <tr>
                          <td className="px-3 py-4 text-right" colSpan={tableColumns.length - 1}>
                            <span className="text-gray-700 dark:text-gray-200">
                              {appLang === 'en' ? 'Totals' : 'الإجماليات'} ({totalSuppliers} {appLang === 'en' ? 'suppliers' : 'مورد'})
                            </span>
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Payables:' : 'الذمم الدائنة:'}</span>
                                <span className="text-orange-600 dark:text-orange-400 font-semibold">
                                  {currencySymbol}{totalPayables.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              {totalDebitCredits > 0 && (
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Debit Credits:' : 'الأرصدة المدينة:'}</span>
                                  <span className="text-blue-600 dark:text-blue-400 font-semibold">
                                    {currencySymbol}{totalDebitCredits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    }
                  }}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* نافذة سند استقبال الأموال */}
        {selectedSupplier && (
          <SupplierReceiptDialog
            open={receiptDialogOpen}
            onOpenChange={setReceiptDialogOpen}
            supplierId={selectedSupplier.id}
            supplierName={selectedSupplier.name}
            maxAmount={balances[selectedSupplier.id]?.debitCredits || 0}
            accounts={accounts}
            appCurrency={appCurrency}
            currencies={currencies.length > 0 ? currencies : DEFAULT_CURRENCIES.map(c => ({ ...c, id: c.code, symbol: c.code, decimals: 2, is_active: true, is_base: c.code === appCurrency })) as Currency[]}
            receiptAmount={receiptAmount}
            setReceiptAmount={setReceiptAmount}
            receiptCurrency={receiptCurrency}
            setReceiptCurrency={setReceiptCurrency}
            receiptDate={receiptDate}
            setReceiptDate={setReceiptDate}
            receiptMethod={receiptMethod}
            setReceiptMethod={setReceiptMethod}
            receiptAccountId={receiptAccountId}
            setReceiptAccountId={setReceiptAccountId}
            receiptNotes={receiptNotes}
            setReceiptNotes={setReceiptNotes}
            receiptExRate={receiptExRate}
            onReceiptComplete={loadSuppliers}
          />
        )}
      </main>
    </div>
  )
}
