"use client"

import type React from "react"

import { useState, useEffect, useTransition, useCallback, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { Plus, Edit2, Trash2, Search, Truck, ArrowDownLeft, Clock, CheckCircle2, XCircle } from "lucide-react"
import { TableSkeleton } from "@/components/ui/skeleton"
import { SupplierReceiptDialog } from "@/components/suppliers/supplier-receipt-dialog"
import { getExchangeRate, getActiveCurrencies, type Currency, DEFAULT_CURRENCIES } from "@/lib/currency-service"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { useRouter } from "next/navigation"
import { useRealtimeTable } from "@/hooks/use-realtime-table"
import { useBranchFilter } from "@/hooks/use-branch-filter"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { BranchFilter } from "@/components/BranchFilter"

interface Supplier {
  id: string
  name: string
  email: string
  phone: string
  city: string
  country: string
  tax_id: string
  payment_terms: string
  branch_id?: string | null
  branches?: { name?: string; branch_name?: string } | null
}

interface SupplierBalance {
  advances: number      // السلف المدفوعة للمورد
  payables: number      // الذمم الدائنة (ما علينا للمورد)
  debitCredits: number  // الأرصدة المدينة (ما للمورد عندنا من مرتجعات)
  // v3.74.251 — pre-receipt refundable: cash on bills the warehouse
  // hasn't confirmed receipt for. Refundable until goods arrive.
  preReceiptAdvance?: number
}

export default function SuppliersPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const router = useRouter()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  // Additional filters
  const [filterCity, setFilterCity] = useState<string>("all")
  const [filterPaymentTerms, setFilterPaymentTerms] = useState<string>("all")
  const [filterBalanceStatus, setFilterBalanceStatus] = useState<string>("all") // all | with_debt | no_debt | overpaid

  // 🚀 تحسين الأداء - استخدام useTransition للفلاتر
  const [isPending, startTransition] = useTransition()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  // 🔐 فلتر الفروع الموحد
  const branchFilter = useBranchFilter()

  // تهيئة اللغة + الاستماع لتغييرها
  useEffect(() => {
    const read = () => { try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { } }
    read()
    window.addEventListener('app_language_changed', read)
    window.addEventListener('storage', read)
    return () => { window.removeEventListener('app_language_changed', read); window.removeEventListener('storage', read) }
  }, [])

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
  const [currentUserRole, setCurrentUserRole] = useState<string>("")
  const [allBranches, setAllBranches] = useState<{ id: string; name: string }[]>([])
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    city: "",
    country: "",
    tax_id: "",
    payment_terms: "Net 30",
    branch_id: "__none__",
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

  // ===== حالات طلبات استرداد الموردين (Approval Workflow) =====
  const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']
  const isPrivilegedRole = PRIVILEGED_ROLES.includes(currentUserRole.toLowerCase())
  const [refundRequests, setRefundRequests] = useState<any[]>([])
  const [refundRequestsLoading, setRefundRequestsLoading] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [selectedRequestForReject, setSelectedRequestForReject] = useState<any | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [currentUserBranchId, setCurrentUserBranchId] = useState<string | null>(null)

  const dispatchVendorRefundDecisionNotification = async (
    requestId: string,
    action: "approved" | "rejected",
    rejectionReason?: string
  ) => {
    const response = await fetch(`/api/vendor-refund-requests/${requestId}/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action,
        rejectionReason: rejectionReason || null,
        appLang,
      }),
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload?.error || "Failed to dispatch vendor refund notification")
    }
  }

  useEffect(() => {
    (async () => {
      setPermView(await canAction(supabase, 'suppliers', 'read'))
      setPermWrite(await canAction(supabase, 'suppliers', 'write'))
      setPermUpdate(await canAction(supabase, 'suppliers', 'update'))
      setPermDelete(await canAction(supabase, 'suppliers', 'delete'))
    })()
    loadSuppliers()
  }, [branchFilter.selectedBranchId]) // إعادة تحميل البيانات عند تغيير الفرع المحدد
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

  // 🔄 الاستماع لتغيير الشركة وإعادة تحميل البيانات
  useEffect(() => {
    const handleCompanyChange = () => {
      loadSuppliers();
    };
    window.addEventListener('company_updated', handleCompanyChange);
    return () => window.removeEventListener('company_updated', handleCompanyChange);
  }, []);

  // 🔄 تحديث البيانات عند العودة للصفحة (visibilitychange)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // تحديث الأرصدة عند العودة للصفحة
        const companyId = await getActiveCompanyId(supabase)
        if (companyId && suppliers.length > 0) {
          await loadSupplierBalances(companyId, suppliers)
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [suppliers, supabase]);

  // ❌ No periodic polling — Enterprise pattern:
  // Balances update via: visibilitychange + Realtime subscriptions + user navigation

  // v3.74.56 - تَحديث تِلقائى عِندَ العَودَة للنّافِذَة/التَّبويب
  useAutoRefresh({ onRefresh: () => loadSuppliers() })

  // v3.74.194 — concurrency guard. realtime + useEffect + useAutoRefresh
  // can all race to trigger loadSuppliers within milliseconds of each
  // other; without this guard we'd refire the RPC multiple times.
  const loadSuppliersInFlightRef = useRef(false)

  const loadSuppliers = async () => {
    if (loadSuppliersInFlightRef.current) return
    loadSuppliersInFlightRef.current = true
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // 🔐 ERP Access Control - جلب دور المستخدم
      const { data: { user } } = await supabase.auth.getUser()
      let userRole = "viewer"
      let userBranchId: string | null = null

      if (user) {
        const { data: companyData } = await supabase
          .from("companies")
          .select("user_id")
          .eq("id", companyId)
          .single()

        const { data: memberData } = await supabase
          .from("company_members")
          .select("role, branch_id")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .single()

        const isOwner = companyData?.user_id === user.id
        userRole = isOwner ? "owner" : (memberData?.role || "viewer")
        userBranchId = memberData?.branch_id || null
        setCurrentUserRole(userRole)
        setCurrentUserBranchId(userBranchId)
      }

      // 🔐 الأدوار المميزة التي يمكنها فلترة الفروع
      const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']
      const canFilterByBranch = PRIVILEGED_ROLES.includes(userRole.toLowerCase())
      const selectedBranchId = branchFilter.getFilteredBranchId()

      if (canFilterByBranch) {
        const { data: branchesData } = await supabase
          .from("branches")
          .select("id, branch_name")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("branch_name")
        setAllBranches((branchesData || []).map((b: any) => ({
          id: b.id,
          name: b.branch_name || ''
        })))
      }

      // v3.74.194 — Single RPC `get_suppliers_overview` replaces the
      // suppliers SELECT + the per-supplier N+1 loop in loadSupplierBalances
      // (which used to fire 3 SELECTs per supplier: bills + vendor_credits +
      // advance payments). The RPC computes payables, open_credits, bill
      // overpayments, and advances in one round-trip.
      let p_branch_filter: string | null = null
      if (canFilterByBranch && selectedBranchId) {
        p_branch_filter = selectedBranchId
      } else if (!canFilterByBranch && userBranchId) {
        p_branch_filter = userBranchId
      }

      const { data: rpcRes, error: rpcErr } = await supabase.rpc('get_suppliers_overview', {
        p_company_id: companyId,
        p_branch_filter,
        p_search: null,
        p_page: 1,
        p_page_size: 500
      })
      if (rpcErr) {
        if (rpcErr.code === 'PGRST116' || rpcErr.code === 'PGRST205') {
          const errorMsg = appLang === 'en'
            ? 'System not initialized: suppliers table is missing. Please run company initialization first.'
            : 'النظام غير مهيأ: جدول الموردين مفقود. يرجى تشغيل تهيئة الشركة أولاً.'
          console.error("ERP System Error:", errorMsg, rpcErr)
          toast({
            title: appLang === 'en' ? 'System Not Initialized' : 'النظام غير مهيأ',
            description: errorMsg,
            variant: "destructive",
            duration: 10000
          })
          setIsLoading(false)
          return
        }
        console.error('[Suppliers] get_suppliers_overview error:', rpcErr)
        toastActionError(toast, "الجلب", "الموردين", "تعذر جلب قائمة الموردين")
      }

      const rows: any[] = (rpcRes && rpcRes.rows) || []
      const data = rows.map((r: any) => {
        // Suppliers table shape — strip the aggregate fields we added.
        const {
          payables: _p, bill_overpayments: _bo, open_credits: _oc, advances: _adv,
          ...supplierFields
        } = r
        return supplierFields
      })
      setSuppliers(data)

      // Hydrate balances directly from the RPC result.
      const newBalances: Record<string, SupplierBalance> = {}
      for (const r of rows) {
        const sid = String(r.id)
        const advances = Number(r.advances || 0)
        const openCredits = Number(r.open_credits || 0)
        const billOver = Number(r.bill_overpayments || 0)
        newBalances[sid] = {
          advances,
          payables: Number(r.payables || 0),
          // v3.26.3 + v3.74.158: open credits + true bill overpayments + advances
          debitCredits: openCredits + billOver + advances,
        }
      }
      // v3.74.251 — fold in the pre-receipt refundable balance.
      try {
        const { data: prrBills } = await supabase
          .from("bills")
          .select("supplier_id, paid_amount, status, receipt_status, pre_receipt_refund_at")
          .eq("company_id", companyId)
          .neq("is_deleted", true)
          .gt("paid_amount", 0)
        for (const b of (prrBills || [])) {
          const rc = String((b as any).receipt_status || '').toLowerCase()
          if (rc === 'received') continue
          const st = String((b as any).status || '').toLowerCase()
          if (st === 'cancelled') continue
          if ((b as any).pre_receipt_refund_at) continue
          const sid = String((b as any).supplier_id || '')
          if (!sid) continue
          if (!newBalances[sid]) continue
          const add = Number((b as any).paid_amount || 0)
          newBalances[sid].preReceiptAdvance = (newBalances[sid].preReceiptAdvance || 0) + add
          // Roll into the supplier's headline "debit credits" so every
          // place the balance shows up reflects the held advance.
          newBalances[sid].debitCredits += add
        }
      } catch { /* ignore — UI degrades gracefully */ }

      setBalances(newBalances)

      // ===== تحميل الحسابات للاستخدام في سند استرداد السلفة =====
      // 🔒 ERP Rule: يُعرض فقط الخزن والبنوك (cash / bank)
      // 🔒 فلترة الفرع: الأدوار العادية → الفرع فقط، الأدوار المميزة → جميع الفروع
      let accountsQuery = supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, sub_type, branch_id")
        .eq("company_id", companyId)
        .eq("account_type", "asset")
        .in("sub_type", ["cash", "bank"])

      // Branch isolation: regular roles see only their branch's accounts
      if (!canFilterByBranch && userBranchId) {
        // المستخدم العادي: فقط حسابات فرعه
        accountsQuery = accountsQuery.eq("branch_id", userBranchId)
      }
      // الأدوار المميزة: لا يوجد شرط على branch_id → جميع الفروع

      const { data: accountsData, error: accountsError } = await accountsQuery

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
        console.error("Error loading cash/bank accounts:", accountsError)
      }
      setAccounts(accountsData || [])

      // تحميل العملات
      const activeCurrencies = await getActiveCurrencies(supabase)
      setCurrencies(activeCurrencies)

      // v3.74.194 — balances already hydrated above from the same RPC result.
      // No second pass needed.

      // تحديث البيانات في Next.js
      router.refresh()
    } catch (error) {
      console.error("Error loading suppliers:", error)
    } finally {
      setIsLoading(false)
      loadSuppliersInFlightRef.current = false
    }
  }

  // ===== دالة جلب طلبات الاسترداد المعلقة =====
  const loadRefundRequests = async () => {
    try {
      setRefundRequestsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      // v3.74.180 — branch governance:
      //   owner / admin / general_manager: company-wide
      //   everyone else: their own branch only.
      // RLS only scopes to company; we add the branch filter explicitly.
      const seesAllBranches = PRIVILEGED_ROLES.includes((currentUserRole || '').toLowerCase())
      let q = supabase
        .from('vendor_refund_requests')
        .select('*, supplier:suppliers(id, name), branch:branches(id, name), receipt_account:chart_of_accounts!vendor_refund_requests_receipt_account_id_fkey(account_code, account_name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (!seesAllBranches && currentUserBranchId) {
        q = q.eq('branch_id', currentUserBranchId)
      }
      const { data, error } = await q
      if (error) {
        console.error('Error loading refund requests:', error)
        return
      }
      setRefundRequests(data || [])
    } catch (err) {
      console.error('loadRefundRequests error:', err)
    } finally {
      setRefundRequestsLoading(false)
    }
  }

  // تشغيل جلب الطلبات عند تحديد الدور (للأدوار المميزة فقط)
  // v3.74.178 — used to gate this load on PRIVILEGED_ROLES only, which
  // meant the accountant never had refundRequests populated. The
  // suppliers row guard then thought no request was in flight and the
  // 'استرداد نقدى' button kept showing, tempting the accountant to
  // resubmit the same refund. Accountants need to see their own
  // outstanding requests too. RLS still scopes what each role can read.
  useEffect(() => {
    if (currentUserRole) {
      loadRefundRequests()
    }
  }, [currentUserRole])

  // 🔄 Realtime: تحديث قائمة الموردين تلقائياً عند أي تغيير
  const loadSuppliersRef = useRef(loadSuppliers)
  loadSuppliersRef.current = loadSuppliers


  const handleSuppliersRealtimeEvent = useCallback(() => {
    console.log('🔄 [Suppliers] Realtime event received, refreshing suppliers list...')
    loadSuppliersRef.current()
  }, [])

  useRealtimeTable({
    table: 'suppliers',
    enabled: true,
    onInsert: handleSuppliersRealtimeEvent,
    onUpdate: handleSuppliersRealtimeEvent,
    onDelete: handleSuppliersRealtimeEvent,
  })

  // refs للأرصدة (تُحدَّث بعد تعريف loadSupplierBalances أدناه)
  const loadBalancesRef = useRef<(companyId: string, suppliersList: Supplier[]) => Promise<void>>(async () => { })
  const suppliersRef = useRef(suppliers)
  useEffect(() => { suppliersRef.current = suppliers }, [suppliers])

  const handleBalancesRealtimeEvent = useCallback(async () => {
    console.log('🔄 [Suppliers] Balance-related table changed, refreshing balances...')
    const companyId = await getActiveCompanyId(supabase)
    if (companyId && suppliersRef.current.length > 0) {
      await loadBalancesRef.current(companyId, suppliersRef.current)
    }
  }, [supabase])

  useRealtimeTable({
    table: 'vendor_credits',
    enabled: true,
    onInsert: handleBalancesRealtimeEvent,
    onUpdate: handleBalancesRealtimeEvent,
    onDelete: handleBalancesRealtimeEvent,
  })

  useRealtimeTable({
    table: 'bills',
    enabled: true,
    onInsert: handleBalancesRealtimeEvent,
    onUpdate: handleBalancesRealtimeEvent,
    onDelete: handleBalancesRealtimeEvent,
  })

  // v3.74.158 — payments table drives the supplier-advance figure too.
  // Without this the column stayed stale until the user navigated away
  // and back.
  useRealtimeTable({
    table: 'payments',
    enabled: true,
    onInsert: handleBalancesRealtimeEvent,
    onUpdate: handleBalancesRealtimeEvent,
    onDelete: handleBalancesRealtimeEvent,
  })

  // v3.74.181 — vendor_refund_requests drives the per-row refund pill,
  // the 'اعتمادات الاسترداد' approver queue, and the 'سِجِل الاسترداد'
  // history. Without realtime: a manager approving in another tab won't
  // see the accountant's request appear until refresh, and the
  // accountant won't see the rejection result without refresh either.
  const handleRefundRequestsRealtimeEvent = useCallback(() => {
    console.log('🔄 [Suppliers] refund_requests change — reloading')
    loadRefundRequests()
  }, [])

  useRealtimeTable({
    table: 'vendor_refund_requests',
    enabled: true,
    onInsert: handleRefundRequestsRealtimeEvent,
    onUpdate: handleRefundRequestsRealtimeEvent,
    onDelete: handleRefundRequestsRealtimeEvent,
  })

  // دالة تحميل أرصدة الموردين
  // v3.74.194 — The 3-queries-per-supplier N+1 loop that used to live here
  // is gone. Balances now come straight from get_suppliers_overview as part
  // of loadSuppliers itself. This wrapper survives for the realtime ref
  // (loadBalancesRef.current is called by handleBalancesRealtimeEvent on
  // vendor_credits / bills / payments changes) and just refreshes the whole
  // overview — one round-trip instead of 3×N.
  const loadSupplierBalances = async (_companyId: string, _suppliersList: Supplier[]) => {
    await loadSuppliers()
  }

  // ربط الـ ref بالدالة الحالية لضمان استخدامها في Realtime handlers
  loadBalancesRef.current = loadSupplierBalances

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

      // Get current user for created_by_user_id
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      if (editingId) {
        // For updates, remove empty branch_id
        const updateData = { ...formData }
        if (updateData.branch_id === "" || updateData.branch_id === "__none__") {
          updateData.branch_id = null as any
        }

        const { error } = await supabase.from("suppliers").update(updateData).eq("id", editingId)

        if (error) throw error
      } else {
        // Use secure API for creation
        const payloadData: any = { ...formData, company_id: companyId }
        if (payloadData.branch_id === "" || payloadData.branch_id === "__none__") {
          delete payloadData.branch_id
        }

        const response = await fetch('/api/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadData)
        })

        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || result.error_ar || 'Failed to create supplier')
        }
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
        branch_id: "__none__",
      })
      loadSuppliers()
      router.refresh()
    } catch (error) {
      console.error("Error saving supplier:", error)
    }
  }

  const handleEdit = (supplier: Supplier) => {
    setFormData({
      name: supplier.name || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      city: supplier.city || "",
      country: supplier.country || "",
      tax_id: supplier.tax_id || "",
      payment_terms: supplier.payment_terms || "Net 30",
      branch_id: supplier.branch_id || "__none__",
    })
    setEditingId(supplier.id)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("suppliers").delete().eq("id", id)

      if (error) throw error
      loadSuppliers()
      router.refresh()
    } catch (error) {
      console.error("Error deleting supplier:", error)
      toastActionError(toast, "الحذف", "المورد", "تعذر حذف المورد")
    }
  }

  // Derive unique values for filter dropdowns
  const supplierCities = useMemo(
    () => Array.from(new Set(suppliers.map(s => (s.city || '').trim()).filter(Boolean))).sort(),
    [suppliers]
  )
  const supplierPaymentTerms = useMemo(
    () => Array.from(new Set(suppliers.map(s => (s.payment_terms || '').trim()).filter(Boolean))).sort(),
    [suppliers]
  )

  const filteredSuppliers = useMemo(() => {
    const q = searchTerm.toLowerCase()
    return suppliers.filter((supplier) => {
      // Search by name, email, or phone
      if (q) {
        const matches =
          supplier.name.toLowerCase().includes(q) ||
          (supplier.email || '').toLowerCase().includes(q) ||
          (supplier.phone || '').toLowerCase().includes(q)
        if (!matches) return false
      }
      // City filter
      if (filterCity !== "all" && (supplier.city || '').trim() !== filterCity) return false
      // Payment terms filter
      if (filterPaymentTerms !== "all" && (supplier.payment_terms || '').trim() !== filterPaymentTerms) return false
      // Balance status filter
      if (filterBalanceStatus !== "all") {
        const b = balances[supplier.id]
        const netPayable = b ? (b.payables - b.advances) : 0  // > 0 means we owe them
        if (filterBalanceStatus === "with_debt" && netPayable <= 0) return false
        if (filterBalanceStatus === "no_debt" && netPayable !== 0) return false
        if (filterBalanceStatus === "overpaid" && netPayable >= 0) return false
      }
      return true
    })
  }, [suppliers, searchTerm, filterCity, filterPaymentTerms, filterBalanceStatus, balances])

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
      format: (value) => value || '—'
    },
    {
      key: 'city',
      header: appLang === 'en' ? 'City' : 'المدينة',
      type: 'text',
      align: 'left',
      hidden: 'md',
      format: (value) => value || '—'
    },
    {
      key: 'branch_id',
      header: appLang === 'en' ? 'Branch' : 'الفرع',
      type: 'text',
      align: 'left',
      hidden: 'lg',
      format: (_, row) => {
        const branchName = row.branches?.branch_name || row.branches?.name || '—'
        return <span className="text-gray-600 dark:text-gray-400 text-sm bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">{branchName}</span>
      }
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Payables' : 'مطلوبات (ذمم دائنة)',
      type: 'currency',
      align: 'right',
      format: (_, row) => {
        // المطلوبات = ما علينا للمورد (موجب فقط). السالب (overpayment) محله
        // عمود "مستحقات لنا (سلفة مورد)".
        // (v3.23.6: reverted v3.23.5 which incorrectly showed negative here.)
        const balance = balances[row.id] || { advances: 0, payables: 0, debitCredits: 0 }
        const payables = balance.payables || 0
        return (
          <span className={payables > 0 ? "text-red-600 dark:text-red-400 font-semibold" : "text-gray-400 dark:text-gray-500"}>
            {payables > 0 ? `${payables.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${currencySymbol}` : '—'}
          </span>
        )
      }
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Supplier Advance' : 'مستحقات لنا (سلفة مورد)',
      type: 'currency',
      align: 'right',
      hidden: 'sm',
      format: (_, row) => {
        const balance = balances[row.id] || { advances: 0, payables: 0, debitCredits: 0 }
        const debitCredits = balance.debitCredits || 0
        return (
          <span className={debitCredits > 0 ? "text-blue-600 dark:text-blue-400 font-semibold" : "text-gray-600 dark:text-gray-400"}>
            {debitCredits > 0 ? `${debitCredits.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${currencySymbol}` : '—'}
          </span>
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
            {/* v3.74.159 — shortcut to the /payments page so the accountant
                can open this supplier's advance and apply it to a bill.
                The Apply-to-Bill flow already lives there; this just
                saves a navigation step from the supplier ledger. */}
            {balance.advances > 0.005 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs px-2"
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(`/payments?focus_supplier=${row.id}`)
                }}
                disabled={!permWrite}
                title={appLang === 'en' ? 'Apply advance to an outstanding bill' : 'تَطبيق السُّلفَة على فاتورَة قائِمَة'}
              >
                {appLang === 'en' ? 'Apply Advance' : 'تطبيق سُلفَة'}
              </Button>
            )}
            {(() => {
              // v3.74.179 — look at the *latest* request only, not "any"
              // matching request. refundRequests is already ordered
               // created_at DESC, so the first row whose supplier_id matches
              // is the most recent one. Reasons:
              //   1. The list keeps historical 'approved' rows from cycles
              //      that already executed (e.g., a credit was approved
              //      and paid in April; the request row stays at
              //      status='approved' forever). The previous .find() with
              //      a status whitelist surfaced that historical row and
              //      pinned the supplier into '✓ refund approved' state
              //      even after the latest request had been rejected.
              //   2. The accountant's mental model matches the latest
              //      request - that's the one their inbox just heard
              //      about. So whatever the latest status is decides
              //      whether the button can show.
              const latestRequest = refundRequests.find(
                (r: any) => r.supplier_id === row.id
              )
              const activeRefund =
                latestRequest && (latestRequest.status === 'pending_approval' || latestRequest.status === 'approved')
                  ? latestRequest
                  : null
              if (activeRefund) {
                const isApproved = activeRefund.status === 'approved'
                return (
                  <span
                    className={`inline-flex items-center gap-1 h-8 px-2 text-xs rounded border ${
                      isApproved
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300'
                        : 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300'
                    }`}
                    title={
                      isApproved
                        ? (appLang === 'en' ? 'Refund approved; awaiting execution' : 'الاسترداد مُعتَمَد — قَيد التَّنفيذ')
                        : (appLang === 'en' ? 'A refund request is pending management approval' : 'يُوجَد طَلَب استِرداد بانتظار اعتماد الإدارَة')
                    }
                  >
                    {isApproved
                      ? (appLang === 'en' ? '✓ Refund approved' : '✓ استرداد مُعتَمَد')
                      : (appLang === 'en' ? '⏳ Refund pending' : '⏳ استرداد قَيد الاعتماد')}
                  </span>
                )
              }
              if (balance.debitCredits > 0) {
                return (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs px-2"
                    onClick={(e) => {
                      e.stopPropagation()
                      openReceiptDialog(row)
                    }}
                    disabled={!permWrite}
                    title={!permWrite ? (appLang === 'en' ? 'No permission to create receipt' : 'لا توجد صلاحية لإنشاء سند') : (appLang === 'en' ? 'Create receipt' : 'إنشاء سند')}
                  >
                    <ArrowDownLeft className="w-4 h-4" />
                    {appLang === 'en' ? 'Cash Refund' : 'استرداد نقدي'}
                  </Button>
                )
              }
              return null
            })()}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={(e) => {
                e.stopPropagation()
                handleEdit(row)
              }}
              disabled={!permUpdate}
              title={appLang === 'en' ? 'Edit supplier' : 'تعديل المورد'}
            >
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-500 hover:text-red-600"
              onClick={(e) => {
                e.stopPropagation()
                handleDelete(row.id)
              }}
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
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang === 'en' ? 'Manage supplier accounts and contacts' : 'إدارة حسابات الموردين وبيانات التواصل'}</p>
                  {/* 🔐 Governance Notice */}
                  {(currentUserRole === 'manager' || currentUserRole === 'accountant') && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      {appLang === 'en' ? '🏢 Showing suppliers from your branch only' : '🏢 تعرض الموردين الخاصين بفرعك فقط'}
                    </p>
                  )}
                  {(currentUserRole === 'staff' || currentUserRole === 'sales' || currentUserRole === 'employee') && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      {appLang === 'en' ? '👨‍💼 Showing suppliers you created only' : '👨‍💼 تعرض الموردين الذين أنشأتهم فقط'}
                    </p>
                  )}
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
                          branch_id: "",
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

                      {/* Branch Selection for privileged roles */}
                      {['owner', 'admin', 'general_manager'].includes(currentUserRole.toLowerCase()) && (
                        <div className="space-y-2">
                          <Label htmlFor="branch">{appLang === 'en' ? 'Assign to Branch (Optional)' : 'تعيين لفرع (اختياري)'}</Label>
                          <Select
                            value={formData.branch_id || '__none__'}
                            onValueChange={(value) => setFormData({ ...formData, branch_id: value === '__none__' ? '' : value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={appLang === 'en' ? 'Select Branch' : 'اختر الفرع'} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">{appLang === 'en' ? 'First Available Branch (Auto)' : 'أول فرع متاح (تلقائي)'}</SelectItem>
                              {allBranches.map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {appLang === 'en' ? 'Normal users create suppliers for their branch automatically.' : 'يتم إنشاء الموردين للمستخدمين العاديين بفرعهم تلقائياً.'}
                          </p>
                        </div>
                      )}

                      <Button type="submit" className="w-full">
                        {editingId ? (appLang === 'en' ? 'Update' : 'تحديث') : (appLang === 'en' ? 'Add' : 'إضافة')}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              ) : null}
            </div>
          </div>

          <Tabs defaultValue="suppliers" className="space-y-4">
            <TabsList className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-1 w-full flex overflow-x-auto justify-start h-auto rounded-xl">
              <TabsTrigger value="suppliers" className="flex-1 min-w-[150px] py-2.5 px-4 data-[state=active]:bg-orange-50 dark:data-[state=active]:bg-orange-900/20 data-[state=active]:text-orange-600 dark:data-[state=active]:text-orange-400 rounded-lg transition-all">
                <Truck className="w-4 h-4 ml-2 mr-2" />
                {appLang === 'en' ? 'Suppliers Directory' : 'دليل الموردين'}
              </TabsTrigger>
              {isPrivilegedRole && (
                <TabsTrigger value="refund_approvals" className="flex-1 min-w-[150px] py-2.5 px-4 data-[state=active]:bg-orange-50 dark:data-[state=active]:bg-orange-900/20 data-[state=active]:text-orange-600 dark:data-[state=active]:text-orange-400 rounded-lg transition-all">
                  <CheckCircle2 className="w-4 h-4 ml-2 mr-2" />
                  {appLang === 'en' ? 'Refund Approvals' : 'اعتمادات الاسترداد'}
                  {refundRequests.filter(r => r.status === 'pending_approval').length > 0 && (
                    <Badge variant="destructive" className="ml-2 mr-2 px-1.5 py-0 min-w-5 flex justify-center h-5 rounded-full text-xs">
                      {refundRequests.filter(r => r.status === 'pending_approval').length}
                    </Badge>
                  )}
                </TabsTrigger>
              )}
              {/* v3.74.180 — full refund history tab, visible to everyone.
                  loadRefundRequests already branch-scopes for non-privileged
                  roles, so the accountant sees only their branch's history
                  while owner/GM see the whole company. */}
              <TabsTrigger value="refund_history" className="flex-1 min-w-[150px] py-2.5 px-4 data-[state=active]:bg-orange-50 dark:data-[state=active]:bg-orange-900/20 data-[state=active]:text-orange-600 dark:data-[state=active]:text-orange-400 rounded-lg transition-all">
                <Clock className="w-4 h-4 ml-2 mr-2" />
                {appLang === 'en' ? 'Refund History' : 'سِجِل الاسترداد'}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="suppliers" className="space-y-4 m-0">

              <Card>
            <CardContent className="pt-6 space-y-4">
              {/* 🔐 فلتر الفروع الموحد - يظهر فقط للأدوار المميزة (Owner/Admin/General Manager) */}
              <BranchFilter
                lang={appLang}
                externalHook={branchFilter}
                className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800"
              />

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

              {/* Additional filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <Select value={filterCity} onValueChange={setFilterCity}>
                  <SelectTrigger><SelectValue placeholder={appLang === 'en' ? 'City' : 'المدينة'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{appLang === 'en' ? 'All cities' : 'جميع المدن'}</SelectItem>
                    {supplierCities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterPaymentTerms} onValueChange={setFilterPaymentTerms}>
                  <SelectTrigger><SelectValue placeholder={appLang === 'en' ? 'Payment terms' : 'شروط الدفع'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{appLang === 'en' ? 'All terms' : 'جميع الشروط'}</SelectItem>
                    {supplierPaymentTerms.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterBalanceStatus} onValueChange={setFilterBalanceStatus}>
                  <SelectTrigger><SelectValue placeholder={appLang === 'en' ? 'Balance' : 'الرصيد'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{appLang === 'en' ? 'All balances' : 'جميع الأرصدة'}</SelectItem>
                    <SelectItem value="with_debt">{appLang === 'en' ? 'With outstanding debt' : 'عليه ديون'}</SelectItem>
                    <SelectItem value="no_debt">{appLang === 'en' ? 'Settled (no debt)' : 'متسوَّى'}</SelectItem>
                    <SelectItem value="overpaid">{appLang === 'en' ? 'Overpaid (credit balance)' : 'دفعنا له زيادة'}</SelectItem>
                  </SelectContent>
                </Select>
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
                                <span className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Payables:' : 'إجمالي المطلوب (ذمم دائنة):'}</span>
                                <span className="text-orange-600 dark:text-orange-400 font-semibold">
                                  {currencySymbol}{totalPayables.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              {totalDebitCredits > 0 && (
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Supplier Advances:' : 'إجمالي المستحق لنا (سلف موردين):'}</span>
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
            </TabsContent>

            {isPrivilegedRole && (
              <TabsContent value="refund_approvals" className="space-y-4 m-0">
                <Card className="border-orange-100 dark:border-orange-900/30">
                  <CardHeader className="bg-orange-50/50 dark:bg-orange-900/10 border-b border-orange-50 dark:border-orange-900/20">
                    <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-300">
                      <CheckCircle2 className="w-5 h-5" />
                      {appLang === 'en' ? 'Pending Refund Requests' : 'طلبات استرداد النقدية المعلقة'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {refundRequestsLoading ? (
                      <TableSkeleton cols={5} rows={3} className="mt-4" />
                    ) : refundRequests.filter(r => r.status === 'pending_approval').length === 0 ? (
                      <div className="text-center py-12 px-4 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-xl">
                        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3 opacity-50" />
                        <p className="text-gray-500 font-medium">{appLang === 'en' ? 'No pending requests.' : 'لا توجد طلبات معلقة للاعتماد.'}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {refundRequests.filter(r => r.status === 'pending_approval').map(req => (
                          <div key={req.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-white dark:bg-slate-900 border border-orange-200 dark:border-orange-800/50 rounded-xl shadow-sm hover:shadow-md transition-shadow gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="font-bold text-gray-900 dark:text-white text-lg">{req.supplier?.name}</span>
                                <Badge variant="outline" className="bg-orange-100 text-orange-700 border-none dark:bg-orange-900/40 dark:text-orange-300">
                                  {appLang === 'en' ? 'Pending Approval' : 'قيد المراجعة'}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                                <span className="flex items-center gap-1.5 bg-gray-100 dark:bg-slate-800 px-2.5 py-1 rounded-md">
                                  <Clock className="w-4 h-4" /> 
                                  {new Date(req.created_at).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-gray-400">|</span>
                                  <span className="font-medium text-gray-900 dark:text-gray-200">{appLang === 'en' ? 'Amount:' : 'المبلغ المطلوب:'}</span>
                                  <span className="font-bold text-orange-600 dark:text-orange-400 text-base">{req.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {req.currency}</span>
                                </div>
                              </div>
                              {req.notes && (
                                <p className="text-sm mt-3 text-gray-700 dark:text-gray-300 bg-orange-50/50 dark:bg-orange-900/10 p-3 rounded-lg border border-orange-100 dark:border-orange-900/20 italic">
                                  "{req.notes}"
                                </p>
                              )}
                            </div>
                            <div className="flex w-full sm:w-auto gap-2 border-t sm:border-t-0 border-gray-100 dark:border-slate-800 pt-3 sm:pt-0 mt-2 sm:mt-0">
                                <Button
                                  variant="outline"
                                  className="flex-1 sm:flex-none text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-900/30"
                                  onClick={() => { setSelectedRequestForReject(req); setRejectDialogOpen(true) }}
                                  disabled={actionLoading === req.id}
                                >
                                  <XCircle className="w-4 h-4 ml-1 mr-1" />
                                  {appLang === 'en' ? 'Reject' : 'رفض'}
                                </Button>
                                <Button
                                  variant="default"
                                  className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white shadow-sm"
                                  disabled={actionLoading === req.id}
                                  onClick={async () => {
                                    setActionLoading(req.id)
                                    try {
                                      const companyId = await getActiveCompanyId(supabase)
                                      if (!companyId) throw new Error('No company')
                                      // v3.74.256 — pre_receipt requests use the new executor
                                      // route which voids supplier payments and optionally
                                      // cancels the bill + linked PO. Standard requests fall
                                      // through to the legacy RPC.
                                      if ((req as any).source_type === 'pre_receipt') {
                                        const resp = await fetch(`/api/vendor-refund-requests/${req.id}/execute-pre-receipt`, { method: 'POST' })
                                        const json = await resp.json()
                                        if (!resp.ok || !json.success) throw new Error(json.error || 'Pre-receipt refund failed')
                                        try { await dispatchVendorRefundDecisionNotification(req.id, 'approved') } catch {}
                                        toastActionSuccess(toast, appLang === 'en' ? 'Approved' : 'تم الاعتماد', appLang === 'en' ? 'Pre-receipt refund executed' : 'تم تنفيذ استرداد ما قبل الاستلام')
                                        loadRefundRequests()
                                        loadSuppliers()
                                        return
                                      }
                                      const { data: result } = await supabase.rpc('approve_vendor_refund_request', {
                                        p_request_id: req.id,
                                        p_company_id: companyId,
                                        p_action: 'approve'
                                      })
                                      if (!result?.success) throw new Error(result?.error || 'Unknown error')
                                      // Notification
                                      try {
                                        await dispatchVendorRefundDecisionNotification(req.id, 'approved')
                                      } catch (notificationError) {
                                        console.warn('Failed to dispatch vendor refund approval notification:', notificationError)
                                      }
                                      toastActionSuccess(toast, appLang === 'en' ? 'Approved' : 'تم الاعتماد', appLang === 'en' ? 'Refund processed successfully' : 'تم تنفيذ الاسترداد النقدي بنجاح وتحديث الأرصدة')
                                      loadRefundRequests()
                                      loadSuppliers()
                                    } catch (err: any) {
                                      toastActionError(toast, 'اعتماد', 'الاسترداد', err?.message || '', appLang, 'OPERATION_FAILED')
                                    } finally {
                                      setActionLoading(null)
                                    }
                                  }}
                                >
                                  <CheckCircle2 className="w-4 h-4 ml-1 mr-1" />
                                  {appLang === 'en' ? 'Approve & Execute' : 'اعتماد وتنفيذ'}
                                </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* v3.74.180 — Refund history: all statuses, all time.
                Branch-scoped at query time (loadRefundRequests adds the
                branch filter for non-privileged roles), so the table
                only ever shows rows the user is entitled to see. */}
            <TabsContent value="refund_history" className="space-y-4 m-0">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {appLang === 'en' ? 'Vendor Refund History' : 'سِجِل اعتمادات الاسترداد'}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {isPrivilegedRole
                          ? (appLang === 'en' ? 'Company-wide view' : 'عَرض على مُستَوى الشَّركَة')
                          : (appLang === 'en' ? 'Your branch only' : 'فَرعُك فَقَط')}
                      </p>
                    </div>
                  </div>

                  {refundRequestsLoading ? (
                    <p className="text-sm text-gray-500 py-6 text-center">
                      {appLang === 'en' ? 'Loading...' : 'جارٍ التَّحميل...'}
                    </p>
                  ) : refundRequests.length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">
                      {appLang === 'en' ? 'No refund requests yet' : 'لا تُوجَد طَلَبات استِرداد بَعد'}
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-slate-800/50 text-xs text-gray-600 dark:text-gray-300">
                          <tr>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Supplier' : 'المورد'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Account' : 'الخزنة'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Branch' : 'الفرع'}</th>
                            <th className="px-3 py-2 text-center">{appLang === 'en' ? 'Status' : 'الحالة'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Requested' : 'تاريخ الطَّلَب'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Decided' : 'تاريخ القَرار'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Reason (if rejected)' : 'سَبَب الرَّفض'}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                          {refundRequests.map((r: any) => {
                            const isRejected = r.status === 'rejected'
                            const isApproved = r.status === 'approved'
                            const isPending = r.status === 'pending_approval'
                            const statusLabel = isRejected
                              ? (appLang === 'en' ? 'Rejected' : 'مَرفوض')
                              : isApproved
                                ? (appLang === 'en' ? 'Approved' : 'مُعتَمَد')
                                : isPending
                                  ? (appLang === 'en' ? 'Pending' : 'قَيد الاعتماد')
                                  : (appLang === 'en' ? 'Cancelled' : 'مُلغى')
                            const statusCls = isRejected
                              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                              : isApproved
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                : isPending
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                            const decisionDate = r.approved_at || r.rejected_at || null
                            return (
                              <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/40">
                                <td className="px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                                  {r.supplier?.name || '—'}
                                </td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                  {Number(r.amount || 0).toFixed(2)} {r.currency || ''}
                                </td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 text-xs">
                                  {r.receipt_account?.account_code
                                    ? `${r.receipt_account.account_code} — ${r.receipt_account.account_name}`
                                    : '—'}
                                </td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 text-xs">
                                  {r.branch?.name || '—'}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCls}`}>
                                    {statusLabel}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                                  {r.created_at ? new Date(r.created_at).toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG') : '—'}
                                </td>
                                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                                  {decisionDate ? new Date(decisionDate).toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG') : '—'}
                                </td>
                                <td className="px-3 py-2 text-gray-700 dark:text-gray-300 text-xs">
                                  {isRejected ? (r.rejection_reason || '—') : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
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
            onReceiptComplete={() => { loadSuppliers(); loadRefundRequests(); }}
            userRole={currentUserRole}
            branchId={currentUserBranchId || undefined}
          />
        )}

        {/* ديالوج رفض الطلب */}
        <Dialog open={rejectDialogOpen} onOpenChange={(v) => { setRejectDialogOpen(v); if (!v) { setRejectReason(""); setSelectedRequestForReject(null) } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{appLang === 'en' ? 'Reject Refund Request' : 'رفض طلب الاسترداد'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {appLang === 'en' ? 'Please provide a reason for rejection:' : 'يرجى تقديم سبب الرفض:'}
              </p>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={appLang === 'en' ? 'Enter rejection reason...' : 'أدخل سبب الرفض...'}
                rows={3}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                  {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                </Button>
                <Button
                  variant="destructive"
                  disabled={!rejectReason.trim() || actionLoading === selectedRequestForReject?.id}
                  onClick={async () => {
                    if (!selectedRequestForReject || !rejectReason.trim()) return
                    setActionLoading(selectedRequestForReject.id)
                    try {
                      const companyId = await getActiveCompanyId(supabase)
                      if (!companyId) throw new Error('No company')
                      const { data: result } = await supabase.rpc('approve_vendor_refund_request', {
                        p_request_id: selectedRequestForReject.id,
                        p_company_id: companyId,
                        p_action: 'reject',
                        p_reason: rejectReason.trim(),
                      })
                      if (!result?.success) throw new Error(result?.error || 'Unknown error')
                      // إشعار المنشئ
                      try {
                        await dispatchVendorRefundDecisionNotification(
                          selectedRequestForReject.id,
                          'rejected',
                          rejectReason.trim()
                        )
                      } catch (notificationError) {
                        console.warn('Failed to dispatch vendor refund rejection notification:', notificationError)
                      }
                      toastActionSuccess(toast, appLang === 'en' ? 'Rejected' : 'الرفض', appLang === 'en' ? 'Request rejected' : 'تم رفض الطلب')
                      setRejectDialogOpen(false)
                      loadRefundRequests()
                    } catch (err: any) {
                      toastActionError(toast, 'رفض', 'الطلب', err?.message || '', appLang, 'OPERATION_FAILED')
                    } finally {
                      setActionLoading(null)
                    }
                  }}
                >
                  {appLang === 'en' ? 'Confirm Rejection' : 'تأكيد الرفض'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
