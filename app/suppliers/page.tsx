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
}

export default function SuppliersPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const router = useRouter()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  // 🚀 تحسين الأداء - استخدام useTransition للفلاتر
  const [isPending, startTransition] = useTransition()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  // 🔐 فلتر الفروع الموحد
  const branchFilter = useBranchFilter()

  // تهيئة اللغة بعد hydration
  useEffect(() => {
    try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { }
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

  // 🔄 تحديث الأرصدة بشكل دوري (كل 30 ثانية) لضمان تحديث البيانات
  useEffect(() => {
    if (suppliers.length === 0) return

    const interval = setInterval(async () => {
      const companyId = await getActiveCompanyId(supabase)
      if (companyId && suppliers.length > 0) {
        await loadSupplierBalances(companyId, suppliers)
      }
    }, 30000) // كل 30 ثانية

    return () => clearInterval(interval)
  }, [suppliers, supabase])

  const loadSuppliers = async () => {
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

      // تحميل الموردين
      let suppliersQuery = supabase.from("suppliers").select("*, branches(branch_name)").eq("company_id", companyId)

      // 🔐 تطبيق فلترة الفروع حسب الصلاحيات
      if (canFilterByBranch && selectedBranchId) {
        // المستخدم المميز اختار فرعاً معيناً
        suppliersQuery = suppliersQuery.eq("branch_id", selectedBranchId)
      } else if (!canFilterByBranch && userBranchId) {
        // المستخدم العادي - فلترة بفرعه فقط
        suppliersQuery = suppliersQuery.eq("branch_id", userBranchId)
      }
      // else: المستخدم المميز بدون فلتر = جميع الفروع

      const { data, error } = await suppliersQuery
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

      // تحميل أرصدة الموردين
      if (data && data.length > 0) {
        await loadSupplierBalances(companyId, data)
      }

      // تحديث البيانات في Next.js
      router.refresh()
    } catch (error) {
      console.error("Error loading suppliers:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // ===== دالة جلب طلبات الاسترداد المعلقة =====
  const loadRefundRequests = async () => {
    try {
      setRefundRequestsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      const { data, error } = await supabase
        .from('vendor_refund_requests')
        .select('*, supplier:suppliers(id, name)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
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
  useEffect(() => {
    if (currentUserRole && PRIVILEGED_ROLES.includes(currentUserRole.toLowerCase())) {
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

  // دالة تحميل أرصدة الموردين
  const loadSupplierBalances = async (companyId: string, suppliersList: Supplier[]) => {
    try {
      console.log("🔄 بدء تحميل أرصدة الموردين...", { companyId, suppliersCount: suppliersList.length })
      const newBalances: Record<string, SupplierBalance> = {}

      for (const supplier of suppliersList) {
        let payables = 0

        // ✅ حساب الذمم الدائنة مباشرة من الفواتير (Cash Basis)
        // في نظام Cash Basis، فواتير المشتريات المستلمة لا تُنشئ قيود محاسبية
        // لذلك نحسب الذمم من الفواتير مباشرة: total_amount - paid_amount
        const { data: bills, error: billsError } = await supabase
          .from("bills")
          .select("id, total_amount, paid_amount, status, returned_amount")
          .eq("company_id", companyId)
          .eq("supplier_id", supplier.id)
          .neq("status", "draft")
          .neq("status", "cancelled")
          .neq("status", "fully_returned")

        if (billsError) {
          console.error(`❌ خطأ في جلب فواتير المورد ${supplier.name}:`, billsError)
        } else if (bills && bills.length > 0) {
          for (const bill of bills) {
            // ✅ حساب المتبقي من الفاتورة = إجمالي الفاتورة الأساسي - المدفوع - قيمة المرتجعات
            // ملاحظة: total_amount يمثل القيمة الأصلية للفاتورة. المرتجعات تسجل في returned_amount.
            const totalAmount = Number(bill.total_amount || 0)
            const paidAmount = Number(bill.paid_amount || 0)
            const returnedAmount = Number(bill.returned_amount || 0)
            const remaining = totalAmount - paidAmount - returnedAmount

            if (remaining > 0) {
              payables += remaining
            }
          }
          console.log(`📋 ${supplier.name}: ${bills.length} فاتورة، ذمم: ${payables.toFixed(2)}`)
        }

        // حساب الرصيد المدين من إشعارات الدائن (vendor_credits)
        let debitCreditsTotal = 0
        try {
          const { data: vendorCredits, error: vendorCreditsError } = await supabase
            .from("vendor_credits")
            .select("total_amount, applied_amount, status")
            .eq("company_id", companyId)
            .eq("supplier_id", supplier.id)
            .eq("status", "open")

          if (vendorCreditsError) {
            console.error("Error loading vendor credits:", vendorCreditsError)
          } else if (vendorCredits) {
            for (const vc of vendorCredits) {
              const available = Number(vc.total_amount || 0) - Number(vc.applied_amount || 0)
              debitCreditsTotal += Math.max(0, available)
            }
          }
        } catch (error: any) {
          console.error("Error calculating supplier debit credits:", error)
        }

        newBalances[supplier.id] = {
          advances: 0, // يمكن إضافة حساب السلف لاحقاً
          payables,
          debitCredits: debitCreditsTotal
        }

        // تسجيل بيانات المورد للتشخيص
        if (payables > 0 || debitCreditsTotal > 0) {
          console.log(`📊 ${supplier.name}:`, { payables, debitCredits: debitCreditsTotal })
        }
      }

      console.log("✅ تم تحميل أرصدة الموردين:", Object.keys(newBalances).length, "مورد")
      console.log("📊 تفاصيل الأرصدة:", newBalances)
      setBalances(newBalances)
      console.log("✅ تم حفظ الأرصدة في state")
    } catch (error) {
      console.error("❌ خطأ في تحميل أرصدة الموردين:", error)
    }
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
            {balance.debitCredits > 0 && (
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
            )}
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
            onReceiptComplete={loadSuppliers}
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
