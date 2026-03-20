"use client"

import { useEffect, useMemo, useState, useTransition, useCallback, useRef } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FilterContainer } from "@/components/ui/filter-container"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { Receipt, Plus, RotateCcw, Eye, Trash2, Pencil, Search, X, ShoppingCart, Package } from "lucide-react"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { CompanyHeader } from "@/components/company-header"
import { useToast } from "@/hooks/use-toast"
import { toastDeleteSuccess, toastDeleteError } from "@/lib/notifications"
import { buildPaginatedUrl } from "@/lib/server-pagination"
import { DataPagination } from "@/components/data-pagination"
import { type UserContext, getAccessFilter } from "@/lib/validation"
import { buildDataVisibilityFilter, applyDataVisibilityFilter, canAccessDocument, canCreateDocument } from "@/lib/data-visibility-control"
import { useBranchFilter } from "@/hooks/use-branch-filter"
import { BranchFilter } from "@/components/BranchFilter"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { StatusBadge } from "@/components/DataTableFormatters"
import { processPurchaseReturnFIFOReversal } from "@/lib/purchase-return-fifo-reversal"
import { createVendorCreditForReturn } from "@/lib/purchase-returns-vendor-credits"
import { createNotification } from "@/lib/governance-layer"
import { useRealtimeTable } from "@/hooks/use-realtime-table"
import { filterCashBankAccounts, getLeafAccountIds } from "@/lib/accounts"
import { getCachedPage, setCachedPage, invalidateCache, prefetchPage } from "@/lib/page-cache"
// 🏷️ Canonical shared types — Single Source of Truth
import type {
  Supplier,
  Bill,
  BillItemWithProduct,
  ReturnedQuantity,
  ProductSummary,
} from "@/types/database"

// نوع الدفعة (خاص بهذه الصفحة)
type Payment = { id: string; bill_id: string | null; amount: number }

// نوع للمنتجات (خاص بهذه الصفحة)
type Product = { id: string; name: string }


export default function BillsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [loading, setLoading] = useState<boolean>(true)
  const [bills, setBills] = useState<Bill[]>([])

  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({})
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [billItems, setBillItems] = useState<BillItemWithProduct[]>([])
  const [returnedQuantities, setReturnedQuantities] = useState<ReturnedQuantity[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [filterStatuses, setFilterStatuses] = useState<string[]>([])
  const [filterSuppliers, setFilterSuppliers] = useState<string[]>([])
  const [filterProducts, setFilterProducts] = useState<string[]>([])
  const [filterShippingProviders, setFilterShippingProviders] = useState<string[]>([])
  const [shippingProviders, setShippingProviders] = useState<{ id: string; provider_name: string }[]>([])
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")

  // 🚀 Server-Side Pagination State
  const [serverTotal, setServerTotal] = useState(0)
  const [serverPage, setServerPage] = useState(1)
  const [serverTotalPages, setServerTotalPages] = useState(1)
  const [pageSize, setPageSize] = useState<number>(20)

  // 🚀 تحسين الأداء - استخدام useTransition للفلاتر
  const [isPending, startTransition] = useTransition()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [hydrated, setHydrated] = useState(false)

  // تهيئة اللغة بعد hydration
  useEffect(() => {
    try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { }
    setHydrated(true)
  }, [])

  // 🔐 ERP Access Control - سياق المستخدم
  const [userContext, setUserContext] = useState<UserContext | null>(null)

  // 🔐 فلتر الفروع الموحد - يظهر فقط للأدوار المميزة (Owner/Admin/General Manager)
  const branchFilter = useBranchFilter()

  // Status options for multi-select - قائمة ثابتة بجميع الحالات الممكنة
  // تشمل دورة الاعتماد الجديدة لفواتير الشراء:
  // draft -> pending_approval -> approved -> received -> partially_paid / paid
  const allStatusOptions = useMemo(() => [
    { value: "draft", label: appLang === 'en' ? "Draft" : "مسودة" },
    { value: "pending_approval", label: appLang === 'en' ? "Pending Approval" : "بانتظار الاعتماد" },
    { value: "pending_receipt", label: appLang === 'en' ? "Pending Receipt" : "بانتظار الاستلام" },
    { value: "approved", label: appLang === 'en' ? "Approved" : "معتمدة إداريًا" },
    { value: "received", label: appLang === 'en' ? "Received" : "تم الاستلام" },
    { value: "sent", label: appLang === 'en' ? "Sent" : "مُرسل" },
    { value: "paid", label: appLang === 'en' ? "Paid" : "مدفوع" },
    { value: "partially_paid", label: appLang === 'en' ? "Partially Paid" : "مدفوع جزئياً" },
    { value: "returned", label: appLang === 'en' ? "Returned" : "مرتجع" },
    { value: "fully_returned", label: appLang === 'en' ? "Fully Returned" : "مرتجع بالكامل" },
    { value: "cancelled", label: appLang === 'en' ? "Cancelled" : "ملغي" },
  ], [appLang])

  // ✅ قائمة الحالات المتاحة بناءً على البيانات الفعلية للشركة
  const statusOptions = useMemo(() => {
    // جمع جميع الحالات الفعلية من الفواتير
    const availableStatuses = new Set<string>();

    bills.forEach((bill) => {
      // إضافة حالة الفاتورة
      availableStatuses.add(bill.status);
    });

    // إرجاع فقط الحالات المتاحة من القائمة الكاملة
    return allStatusOptions.filter(opt => availableStatuses.has(opt.value));
  }, [bills, allStatusOptions])

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

  // تجميع المدفوعات الفعلية من جدول payments حسب الفاتورة
  const paidByBill: Record<string, number> = useMemo(() => {
    const agg: Record<string, number> = {}
    payments.forEach((p) => {
      const key = p.bill_id || ""
      if (key) {
        agg[key] = (agg[key] || 0) + (p.amount || 0)
      }
    })
    return agg
  }, [payments])

  // Helper: Get display amount (use converted if available)
  // يستخدم المدفوعات الفعلية من جدول payments كأولوية
  // ملاحظة: total_amount هو المبلغ الحالي بعد خصم المرتجعات
  const getDisplayAmount = (bill: Bill, field: 'total' | 'paid' = 'total'): number => {
    if (field === 'total') {
      // استخدام total_amount مباشرة لأنه يمثل المبلغ الحالي بعد المرتجعات
      // display_total يستخدم فقط إذا كانت العملة مختلفة ومحولة
      if (bill.display_currency === appCurrency && bill.display_total != null) {
        return bill.display_total
      }
      // total_amount هو المبلغ الصحيح (بعد خصم المرتجعات)
      return bill.total_amount
    }
    // For paid amount: استخدام المدفوعات الفعلية من جدول payments أولاً
    const actualPaid = paidByBill[bill.id] || 0
    if (actualPaid > 0) {
      return actualPaid
    }
    // Fallback to stored paid_amount
    if (bill.display_currency === appCurrency && bill.display_paid != null) {
      return bill.display_paid
    }
    return bill.paid_amount ?? 0
  }

  // Listen for currency changes
  useEffect(() => {
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency') || 'EGP'
      setAppCurrency(newCurrency)
      // Reload data to get updated display amounts
      loadData()
    }
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [])
  const [permView, setPermView] = useState(true)
  const [permWrite, setPermWrite] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnMode, setReturnMode] = useState<"partial" | "full">("partial")
  const [returnBillId, setReturnBillId] = useState<string | null>(null)
  const [returnBillNumber, setReturnBillNumber] = useState<string>("")
  const [returnItems, setReturnItems] = useState<{ id: string; product_id: string; name?: string; quantity: number; maxQty: number; qtyToReturn: number; unit_price: number; tax_rate: number; line_total: number; returned_quantity?: number }[]>([])
  // Multi-currency and refund method states
  const [returnMethod, setReturnMethod] = useState<'cash' | 'bank' | 'credit'>('cash')
  const [returnAccountId, setReturnAccountId] = useState<string>('')
  const [returnAccounts, setReturnAccounts] = useState<Array<{ id: string; account_code: string | null; account_name: string; sub_type: string | null }>>([])
  const [returnCurrency, setReturnCurrency] = useState<string>('EGP')
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [returnExRate, setReturnExRate] = useState<{ rate: number; rateId: string | null; source: string }>({ rate: 1, rateId: null, source: 'same_currency' })
  const [returnProcessing, setReturnProcessing] = useState(false)
  const [returnBillCurrency, setReturnBillCurrency] = useState<string>('EGP')
  // Bill financial details for return form
  const [returnBillData, setReturnBillData] = useState<{
    originalTotal: number
    paidAmount: number
    remainingAmount: number
    previouslyReturned: number
    status: string
    paymentStatus: 'unpaid' | 'partial' | 'paid'
  }>({
    originalTotal: 0,
    paidAmount: 0,
    remainingAmount: 0,
    previouslyReturned: 0,
    status: '',
    paymentStatus: 'unpaid'
  })

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
      received: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      partially_paid: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      fully_returned: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      partially_returned: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    }
    return colors[status] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
  }

  const getStatusLabel = (status: string) => {
    const labelsAr: Record<string, string> = { draft: "مسودة", received: "مستلمة", sent: "مستلمة", partially_paid: "مدفوعة جزئياً", paid: "مدفوعة", cancelled: "ملغاة", fully_returned: "مرتجعة بالكامل", partially_returned: "مرتجعة جزئياً" }
    const labelsEn: Record<string, string> = { draft: "Draft", received: "Received", sent: "Received", partially_paid: "Partially Paid", paid: "Paid", cancelled: "Cancelled", fully_returned: "Fully Returned", partially_returned: "Partially Returned" }
    return (appLang === 'en' ? labelsEn : labelsAr)[status] || status
  }

  const [permEdit, setPermEdit] = useState(false)
  const [permDelete, setPermDelete] = useState(false)

  useEffect(() => {
    (async () => {
      setPermView(await canAction(supabase, 'bills', 'read'))
      setPermWrite(await canAction(supabase, 'bills', 'write'))
      setPermEdit(await canAction(supabase, 'bills', 'update'))
      setPermDelete(await canAction(supabase, 'bills', 'delete'))
    })()
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter.selectedBranchId]) // إعادة تحميل البيانات عند تغيير الفرع المحدد
  useEffect(() => {
    const reloadPerms = async () => {
      setPermView(await canAction(supabase, 'bills', 'read'))
      setPermWrite(await canAction(supabase, 'bills', 'write'))
      setPermEdit(await canAction(supabase, 'bills', 'update'))
      setPermDelete(await canAction(supabase, 'bills', 'delete'))
    }
    const handler = () => { reloadPerms() }
    if (typeof window !== 'undefined') window.addEventListener('permissions_updated', handler)
    return () => { if (typeof window !== 'undefined') window.removeEventListener('permissions_updated', handler) }
  }, [])

  // 🔄 الاستماع لتغيير الشركة وإعادة تحميل البيانات
  useEffect(() => {
    const handleCompanyChange = () => {
      loadData();
    };
    window.addEventListener('company_updated', handleCompanyChange);
    return () => window.removeEventListener('company_updated', handleCompanyChange);
  }, []);

  const loadData = async () => {
    try {
      setLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // 🔐 ERP Access Control - جلب سياق المستخدم
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from("company_members")
        .select("role, branch_id, cost_center_id, warehouse_id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .single()

      const role = member?.role || "staff"
      const context: UserContext = {
        user_id: user.id,
        company_id: companyId,
        branch_id: member?.branch_id || null,
        cost_center_id: member?.cost_center_id || null,
        warehouse_id: member?.warehouse_id || null,
        role: role
      }
      setUserContext(context)

      // ─── 🚀 جلب الفواتير عبر Server-Side Pagination + Cache ──────────────
      const selectedBranchId = branchFilter.getFilteredBranchId()

      // بناء cache key يعكس الصفحة الحالية وكل الفلاتر
      const cacheParams = {
        entity: 'bills' as const,
        page: serverPage,
        pageSize,
        filters: {
          statuses: filterStatuses,
          suppliers: filterSuppliers,
          search: searchQuery.trim(),
          dateFrom,
          dateTo,
          branchId: selectedBranchId || '',
        },
      }

      // ✅ Cache Hit → عرض فوري بدون fetch
      const cached = getCachedPage<{ bills: Bill[]; total: number; totalPages: number }>(cacheParams)
      if (cached) {
        setBills(cached.bills)
        setServerTotal(cached.total)
        setServerTotalPages(cached.totalPages)
        setLoading(false)
        // تحميل البيانات المرتبطة (payments/items) للصفحة المعروضة
        const cachedBillIds = cached.bills.map(b => b.id)
        if (cachedBillIds.length) {
          const [payData, itemsData] = await Promise.all([
            supabase.from("payments").select("id, bill_id, amount").eq("company_id", companyId).in("bill_id", cachedBillIds),
            supabase.from("bill_items").select("bill_id, quantity, product_id, returned_quantity, products(name)").in("bill_id", cachedBillIds),
          ])
          setPayments(payData.data || [])
          setBillItems(itemsData.data || [])
        }
        return
      }

      const params = new URLSearchParams({
        page: String(serverPage),
        pageSize: String(pageSize),
      })
      if (filterStatuses.length > 0) filterStatuses.forEach(s => params.append('status', s))
      if (filterSuppliers.length > 0) filterSuppliers.forEach(s => params.append('supplier', s))
      if (searchQuery.trim()) params.set('search', searchQuery.trim())
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (selectedBranchId) params.set('branchId', selectedBranchId)

      const billsRes = await fetch(`/api/v2/bills?${params.toString()}`)
      if (!billsRes.ok) throw new Error('Failed to fetch bills from API v2')
      const billsJson = await billsRes.json()

      const fetchedBills: Bill[] = billsJson.data || []
      const fetchedTotal = billsJson.meta?.totalCount ?? 0
      const fetchedTotalPages = billsJson.meta?.totalPages ?? 1

      setBills(fetchedBills)
      setServerTotal(fetchedTotal)
      setServerTotalPages(fetchedTotalPages)

      // ✅ Cache Write — احفظ نتيجة الصفحة الحالية
      setCachedPage(cacheParams, {
        bills: fetchedBills,
        total: fetchedTotal,
        totalPages: fetchedTotalPages,
      })

      // 🚀 Prefetch الصفحة التالية في الخلفية (بدون انتظار)
      if (serverPage < fetchedTotalPages) {
        const nextParams = { ...cacheParams, page: serverPage + 1 }
        const nextQueryParams = new URLSearchParams(params)
        nextQueryParams.set('page', String(serverPage + 1))
        prefetchPage(
          nextParams,
          async () => {
            const res = await fetch(`/api/v2/bills?${nextQueryParams.toString()}`)
            if (!res.ok) throw new Error('prefetch failed')
            const json = await res.json()
            return { bills: json.data || [], total: json.meta?.totalCount ?? 0, totalPages: json.meta?.totalPages ?? 1 }
          }
        )
      }

      setUserContext(context)

      // 🔐 جلب الصلاحيات المشتركة للمستخدم الحالي
      let sharedGrantorUserIds: string[] = [];
      const { data: sharedPerms } = await supabase
        .from("permission_sharing")
        .select("grantor_user_id, resource_type")
        .eq("grantee_user_id", user.id)
        .eq("company_id", companyId)
        .eq("is_active", true)
        .or("resource_type.eq.all,resource_type.eq.suppliers,resource_type.eq.bills")

      if (sharedPerms && sharedPerms.length > 0) {
        sharedGrantorUserIds = sharedPerms.map((p: any) => p.grantor_user_id);
      }

      // 🔐 ERP Access Control - بناء فلتر الوصول للموردين
      const accessFilter = getAccessFilter(
        role,
        user.id,
        member?.branch_id || null,
        member?.cost_center_id || null
      );

      // Load all suppliers for filtering - with access control
      let suppQuery = supabase.from("suppliers").select("id, name, phone").eq("company_id", companyId);

      if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
        suppQuery = suppQuery.eq("created_by_user_id", accessFilter.createdByUserId);
      }
      if (accessFilter.filterByBranch && accessFilter.branchId) {
        suppQuery = suppQuery.eq("branch_id", accessFilter.branchId);
      }

      const { data: allSuppliersData } = await suppQuery.order("name");

      let sharedSuppliers: Supplier[] = [];
      if (accessFilter.filterByCreatedBy && sharedGrantorUserIds.length > 0) {
        const { data: sharedSupp } = await supabase
          .from("suppliers")
          .select("id, name, phone")
          .eq("company_id", companyId)
          .in("created_by_user_id", sharedGrantorUserIds);
        sharedSuppliers = sharedSupp || [];
      }

      const allSupplierIds = new Set((allSuppliersData || []).map((s: Supplier) => s.id));
      const uniqueSharedSuppliers = sharedSuppliers.filter((s: Supplier) => !allSupplierIds.has(s.id));
      const mergedSuppliers = [...(allSuppliersData || []), ...uniqueSharedSuppliers];
      setAllSuppliers(mergedSuppliers)

      // موردي الصفحة الحالية فقط (للـ supplier map المستخدم في الجدول)
      const supplierIds = Array.from(new Set(fetchedBills.map(b => b.supplier_id)))
      if (supplierIds.length) {
        const { data: suppData } = await supabase
          .from("suppliers")
          .select("id, name, phone")
          .eq("company_id", companyId)
          .in("id", supplierIds)
        const map: Record<string, Supplier> = {}
        ;(suppData || []).forEach((s: any) => (map[s.id] = { id: s.id, name: s.name, phone: s.phone }))
        setSuppliers(map)
      } else {
        setSuppliers({})
      }

      // تحميل المنتجات للفلترة
      const { data: productsData } = await supabase
        .from("products")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name")
      setProducts(productsData || [])

      // ─── تحميل البيانات المرتبطة للصفحة الحالية فقط ───────────────────────
      // مقيّد بـ billIds الصفحة الحالية → لا over-fetching
      const billIds = fetchedBills.map(b => b.id)
      if (billIds.length) {
        const { data: payData } = await supabase
          .from("payments")
          .select("id, bill_id, amount")
          .eq("company_id", companyId)
          .in("bill_id", billIds)
        setPayments(payData || [])

        const { data: itemsData } = await supabase
          .from("bill_items")
          .select("bill_id, quantity, product_id, returned_quantity, products(name)")
          .in("bill_id", billIds)
        setBillItems(itemsData || [])

        const { data: vendorCredits } = await supabase
          .from("vendor_credits")
          .select("id, bill_id")
          .in("bill_id", billIds)

        if (vendorCredits && vendorCredits.length > 0) {
          const vcIds = vendorCredits.map((vc: { id: string }) => vc.id)
          const { data: vcItems } = await supabase
            .from("vendor_credit_items")
            .select("vendor_credit_id, product_id, quantity")
            .in("vendor_credit_id", vcIds)

          const returnedQty: ReturnedQuantity[] = (vcItems || []).map((item: { vendor_credit_id: string; product_id: string | null; quantity: number | null }) => {
            const vc = vendorCredits.find((v: { id: string; bill_id: string }) => v.id === item.vendor_credit_id)
            return {
              bill_id: vc?.bill_id || '',
              product_id: item.product_id || '',
              quantity: item.quantity || 0
            }
          }).filter((r: ReturnedQuantity) => r.bill_id && r.product_id)
          setReturnedQuantities(returnedQty)
        } else {
          setReturnedQuantities([])
        }
      } else {
        setPayments([])
        setBillItems([])
        setReturnedQuantities([])
      }

      // تحميل شركات الشحن
      const { data: providersData } = await supabase
        .from("shipping_providers")
        .select("id, provider_name")
        .order("provider_name")
      setShippingProviders(providersData || [])
    } finally {
      setLoading(false)
    }
  }


  // 🔄 Realtime: تحديث قائمة الفواتير تلقائياً عند أي تغيير
  // استخدام useRef للحفاظ على reference ثابت لـ loadData
  const loadDataRef = useRef(loadData)
  loadDataRef.current = loadData

  const handleBillsRealtimeEvent = useCallback(() => {
    console.log('🔄 [Bills Page] Realtime event received, invalidating cache and refreshing...')
    // ✅ إبطال الكاش عند أي تغيير في البيانات
    invalidateCache('bills')
    loadDataRef.current()
  }, [])

  useRealtimeTable({
    table: 'bills',
    enabled: true,
    onInsert: handleBillsRealtimeEvent,
    onUpdate: handleBillsRealtimeEvent,
    onDelete: handleBillsRealtimeEvent,
  })

  // دالة للحصول على ملخص المنتجات لفاتورة معينة مع الكميات المرتجعة
  const getProductsSummary = (billId: string): ProductSummary[] => {
    const items = billItems.filter(item => item.bill_id === billId)
    return items.map(item => {
      // استخدام الكمية المرتجعة مباشرة من bill_items.returned_quantity
      const returnedQty = item.returned_quantity || 0
      return {
        name: item.products?.name || '-',
        quantity: item.quantity,
        returned: returnedQty > 0 ? returnedQty : undefined
      }
    })
  }

  // Delete bill handler
  const handleDelete = async (id: string) => {
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // ===============================
      // 🔒 System Guard: منع حذف الفواتير التي لها حركات مخزون
      // ===============================
      const { data: inventoryTx } = await supabase
        .from("inventory_transactions")
        .select("id")
        .eq("reference_id", id)
        .limit(1)

      if (inventoryTx && inventoryTx.length > 0) {
        toast({
          variant: "destructive",
          title: appLang === 'en' ? "Cannot Delete" : "لا يمكن الحذف",
          description: appLang === 'en'
            ? "This bill has inventory transactions. Use 'Return' instead of delete to maintain audit trail."
            : "هذه الفاتورة لها حركات مخزون. استخدم 'مرتجع' بدلاً من الحذف للحفاظ على سجل التدقيق.",
          duration: 5000,
        })
        return
      }

      // ===============================
      // 🔒 System Guard: منع حذف الفواتير التي لها قيود محاسبية
      // ===============================
      const { data: journalEntries } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("reference_id", id)
        .limit(1)

      if (journalEntries && journalEntries.length > 0) {
        toast({
          variant: "destructive",
          title: appLang === 'en' ? "Cannot Delete" : "لا يمكن الحذف",
          description: appLang === 'en'
            ? "This bill has journal entries. Use 'Return' instead of delete to maintain audit trail."
            : "هذه الفاتورة لها قيود محاسبية. استخدم 'مرتجع' بدلاً من الحذف للحفاظ على سجل التدقيق.",
          duration: 5000,
        })
        return
      }

      // Check for linked payments
      const { data: linkedPays } = await supabase
        .from("payments")
        .select("id, amount")
        .eq("bill_id", id)

      const hasLinkedPayments = Array.isArray(linkedPays) && linkedPays.length > 0

      // ===============================
      // 🔒 System Guard: منع حذف الفواتير التي لها دفعات
      // ===============================
      if (hasLinkedPayments) {
        toast({
          variant: "destructive",
          title: appLang === 'en' ? "Cannot Delete" : "لا يمكن الحذف",
          description: appLang === 'en'
            ? "This bill has linked payments. Use 'Return' instead of delete."
            : "هذه الفاتورة لها دفعات مرتبطة. استخدم 'مرتجع' بدلاً من الحذف.",
          duration: 5000,
        })
        return
      }

      // ===============================
      // ✅ الفاتورة مسودة بدون حركات - يمكن حذفها
      // ===============================
      // Delete bill items
      await supabase.from("bill_items").delete().eq("bill_id", id)

      // Delete bill
      const { error } = await supabase.from("bills").delete().eq("id", id)
      if (error) throw error

      await loadData()
      toastDeleteSuccess(toast, appLang === 'en' ? "Bill deleted" : "تم حذف الفاتورة")
    } catch (error) {
      console.error("Error deleting bill:", error)
      toastDeleteError(toast, appLang === 'en' ? "Bill" : "الفاتورة")
    }
  }

  const requestDelete = (id: string, status?: string) => {
    // 🔒 النمط المحاسبي الصارم: لا يمكن حذف الفواتير المرسلة أو المدفوعة
    // فقط الفواتير المسودة (draft) يمكن حذفها
    if (status && status !== 'draft') {
      toast({
        title: appLang === 'en' ? "Cannot Delete Bill" : "لا يمكن حذف الفاتورة",
        description: appLang === 'en'
          ? "Only draft bills can be deleted. For sent/paid bills, use Return instead."
          : "يمكن حذف الفواتير المسودة فقط. للفواتير المرسلة/المدفوعة، استخدم المرتجع.",
        variant: "destructive",
      })
      return
    }
    setPendingDeleteId(id)
    setConfirmOpen(true)
  }

  // الفلاتر المحلية التي تعمل على بيانات الصفحة الحالية فقط
  // (البحث/status/supplier/date تم نقلها لـ DB في /api/v2/bills)
  // تبقى فلترة المنتجات وشركات الشحن محلياً لأنها تعتمد على billItems
  const filteredBills = useMemo(() => {
    return bills.filter((bill) => {
      // فلتر المنتجات — يعمل على بيانات الصفحة الحالية فقط
      if (filterProducts.length > 0) {
        const billProductIds = billItems
          .filter(item => item.bill_id === bill.id)
          .map(item => item.product_id)
          .filter(Boolean) as string[]
        const hasSelectedProduct = filterProducts.some(productId => billProductIds.includes(productId))
        if (!hasSelectedProduct) return false
      }
      // فلتر شركة الشحن
      if (filterShippingProviders.length > 0) {
        const billProviderId = (bill as any).shipping_provider_id
        if (!billProviderId || !filterShippingProviders.includes(billProviderId)) return false
      }
      return true
    })
  }, [bills, filterProducts, filterShippingProviders, billItems])

  // ─── Server Pagination Handlers ──────────────────────────────────────────
  const handlePageChange = (newPage: number) => {
    setServerPage(newPage)
  }

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setServerPage(1) // إعادة للصفحة الأولى عند تغيير الحجم
  }

  // إعادة تحميل عند تغيير الصفحة أو حجمها
  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPage, pageSize])

  // تعريف أعمدة الجدول
  const tableColumns: DataTableColumn<Bill>[] = useMemo(() => [
    {
      key: 'bill_number',
      header: appLang === 'en' ? 'Bill No.' : 'رقم الفاتورة',
      type: 'text',
      align: 'left',
      width: 'min-w-[120px]',
      format: (value) => (
        <span className="font-medium text-blue-600 dark:text-blue-400">{value}</span>
      )
    },
    {
      key: 'supplier_id',
      header: appLang === 'en' ? 'Supplier' : 'المورد',
      type: 'text',
      align: 'left',
      format: (_, row) => (row as any).suppliers?.name || suppliers[row.supplier_id]?.name || row.supplier_id
    },
    {
      key: 'branch_id',
      header: appLang === 'en' ? 'Branch' : 'الفرع',
      type: 'text',
      align: 'center',
      hidden: 'md',
      format: (_, row) => {
        const branchName = (row as any).branches?.name
        return branchName ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
            {branchName}
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">{appLang === 'en' ? 'Main' : 'رئيسي'}</span>
        )
      }
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Products' : 'المنتجات',
      type: 'custom',
      align: 'left',
      hidden: 'lg',
      width: 'max-w-[200px]',
      format: (_, row) => {
        const summary = getProductsSummary(row.id);
        if (summary.length === 0) return '-';
        return (
          <div className="text-xs space-y-0.5">
            {summary.slice(0, 3).map((p, idx) => (
              <div key={idx} className="truncate">
                {p.name} — <span className="font-medium">{p.quantity}</span>
                {p.returned && p.returned > 0 && (
                  <span className="text-orange-600 dark:text-orange-400 text-[10px]">
                    {' '}({appLang === 'en' ? 'ret:' : 'مرتجع:'} {p.returned})
                  </span>
                )}
              </div>
            ))}
            {summary.length > 3 && (
              <div className="text-gray-500 dark:text-gray-400">
                +{summary.length - 3} {appLang === 'en' ? 'more' : 'أخرى'}
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: 'bill_date',
      header: appLang === 'en' ? 'Date' : 'التاريخ',
      type: 'date',
      align: 'right',
      hidden: 'sm',
      format: (value) => new Date(value).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')
    },
    {
      key: 'total_amount',
      header: appLang === 'en' ? 'Amount' : 'المبلغ',
      type: 'currency',
      align: 'right',
      format: (_, row) => {
        const displayTotal = getDisplayAmount(row, 'total');
        return (
          <div>
            <div>{displayTotal.toFixed(2)} {currencySymbol}</div>
            {row.original_currency && row.original_currency !== appCurrency && row.original_total && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                ({row.original_total.toFixed(2)} {currencySymbols[row.original_currency] || row.original_currency})
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: 'paid_amount',
      header: appLang === 'en' ? 'Paid' : 'المدفوع',
      type: 'currency',
      align: 'right',
      hidden: 'md',
      format: (_, row) => {
        const displayPaid = getDisplayAmount(row, 'paid');
        return (
          <span className="text-green-600 dark:text-green-400">
            {displayPaid.toFixed(2)} {currencySymbol}
          </span>
        );
      }
    },
    {
      key: 'remaining',
      header: appLang === 'en' ? 'Remaining' : 'المتبقي',
      type: 'currency',
      align: 'right',
      hidden: 'md',
      format: (_, row) => {
        const displayTotal = getDisplayAmount(row, 'total');
        const displayPaid = getDisplayAmount(row, 'paid');
        const remaining = displayTotal - displayPaid;
        return (
          <span className={remaining > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
            {remaining.toFixed(2)} {currencySymbol}
          </span>
        );
      }
    },
    {
      key: 'shipping_provider_id',
      header: appLang === 'en' ? 'Shipping' : 'الشحن',
      type: 'text',
      align: 'center',
      hidden: 'lg',
      format: (_, row) => {
        const providerId = (row as any).shipping_provider_id;
        if (!providerId) return '-';
        return shippingProviders.find(p => p.id === providerId)?.provider_name || '-';
      }
    },
    {
      key: 'status',
      header: appLang === 'en' ? 'Status' : 'الحالة',
      type: 'status',
      align: 'center',
      format: (_, row) => (
        <div className="flex flex-col items-center gap-1">
          <StatusBadge status={row.status} lang={appLang} />
          {row.return_status && row.status !== 'fully_returned' && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${row.return_status === 'full'
              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
              : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
              }`}>
              {row.return_status === 'full'
                ? (appLang === 'en' ? 'Full Return' : 'مرتجع كامل')
                : (appLang === 'en' ? 'Partial Return' : 'مرتجع جزئي')}
            </span>
          )}
        </div>
      )
    },
    {
      key: 'receipt_status',
      header: appLang === 'en' ? 'Receipt Status' : 'حالة الاستلام',
      type: 'status',
      align: 'center',
      hidden: 'lg',
      format: (_, row) => {
        if (!row.receipt_status) return <span className="text-gray-400">-</span>
        return (
          <div className="flex flex-col items-center gap-1">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${row.receipt_status === 'received' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' :
                row.receipt_status === 'rejected' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                  row.receipt_status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
              }`}>
              {row.receipt_status === 'received' ? (appLang === 'en' ? 'Received' : 'تم الاستلام') :
                row.receipt_status === 'rejected' ? (appLang === 'en' ? 'Rejected' : 'مرفوض') :
                  row.receipt_status === 'pending' ? (appLang === 'en' ? 'Pending' : 'بانتظار') :
                    row.receipt_status}
            </span>
            {row.receipt_status === 'rejected' && row.receipt_rejection_reason && (
              <span className="text-xs text-red-600 dark:text-red-400 max-w-[150px] truncate" title={row.receipt_rejection_reason}>
                {row.receipt_rejection_reason}
              </span>
            )}
          </div>
        )
      }
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Actions' : 'الإجراءات',
      type: 'actions',
      align: 'center',
      format: (_, row) => (
        <div className="flex gap-2 flex-wrap justify-center">
          {permView && (
            <Link href={`/bills/${row.id}`}>
              <Button variant="outline" size="sm">
                <Eye className="w-4 h-4" />
              </Button>
            </Link>
          )}
          {permEdit && (
            <Link href={`/bills/${row.id}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil className="w-4 h-4" />
              </Button>
            </Link>
          )}
          {(() => {
            // ✅ المرتجعات تُسمح فقط للفواتير التي اعتُمد استلام بضاعتها فعلياً
            if (row.status === 'draft' || row.status === 'voided' || row.status === 'fully_returned' || row.status === 'cancelled') return null;
            if (row.receipt_status !== 'received') return null;

            // Calculate if partial return is allowed for this specific bill row
            const itemsForBill = billItems.filter(item => item.bill_id === row.id);
            const returnableItems = itemsForBill.map(it => ({
              ...it,
              max_qty: Math.max(0, Number(it.quantity || 0) - Number(it.returned_quantity || 0))
            })).filter(it => it.max_qty > 0);

            const canPartialReturn = returnableItems.length > 1 || (returnableItems.length === 1 && returnableItems[0].max_qty > 1);

            return (
              <>
                {canPartialReturn && (
                  <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => openPurchaseReturn(row, "partial")}>
                    {appLang === 'en' ? 'Partial Return' : 'مرتجع جزئي'}
                  </Button>
                )}
                <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => openPurchaseReturn(row, "full")}>
                  {appLang === 'en' ? 'Full Return' : 'مرتجع كامل'}
                </Button>
              </>
            );
          })()}
          {permDelete && row.status !== 'sent' && row.status !== 'partially_paid' && row.status !== 'paid' && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700 bg-transparent"
              onClick={() => requestDelete(row.id, row.status)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          {row.purchase_order_id && (
            <Link href={`/purchase-orders/${row.purchase_order_id}`}>
              <Button variant="ghost" size="icon" className="h-8 w-8" title={appLang === 'en' ? 'Linked PO' : 'أمر الشراء المرتبط'}>
                <ShoppingCart className="w-4 h-4 text-orange-500" />
              </Button>
            </Link>
          )}
          {row.goods_receipts && (
            <Link href={`/goods-receipts/${row.goods_receipts.id}`}>
              <Button variant="ghost" size="icon" className="h-8 w-8" title={appLang === 'en' ? 'Linked GRN' : 'إيصال الاستلام المرتبط'}>
                <Package className="w-4 h-4 text-green-500" />
              </Button>
            </Link>
          )}
        </div>
      )
    }
  ], [appLang, suppliers, currencySymbol, currencySymbols, appCurrency, shippingProviders, permView, permEdit, permDelete]);

  // مسح جميع الفلاتر
  const clearFilters = () => {
    setFilterStatuses([])
    setFilterSuppliers([])
    setFilterProducts([])
    setFilterShippingProviders([])
    setDateFrom("")
    setDateTo("")
    setSearchQuery("")
  }

  const hasActiveFilters = filterStatuses.length > 0 || filterSuppliers.length > 0 || filterProducts.length > 0 || filterShippingProviders.length > 0 || dateFrom || dateTo || searchQuery

  // حساب عدد الفلاتر النشطة
  const activeFilterCount = [
    filterStatuses.length > 0,
    filterSuppliers.length > 0,
    filterProducts.length > 0,
    filterShippingProviders.length > 0,
    !!dateFrom,
    !!dateTo,
    !!searchQuery
  ].filter(Boolean).length

  const openPurchaseReturn = async (bill: Bill, mode: "partial" | "full") => {
    try {
      setReturnMode(mode)
      setReturnBillId(bill.id)
      setReturnBillNumber(bill.bill_number)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // Load bill items with returned_quantity
      const { data: items } = await supabase
        .from("bill_items")
        .select("id, product_id, quantity, unit_price, tax_rate, discount_percent, line_total, returned_quantity, products(name)")
        .eq("bill_id", bill.id)
      const rows = (items || []).map((it: any) => {
        const availableQty = Math.max(0, Number(it.quantity || 0) - Number(it.returned_quantity || 0))
        return {
          id: String(it.id),
          product_id: String(it.product_id),
          name: String(it.products?.name || ""),
          quantity: Number(it.quantity || 0),
          maxQty: availableQty,
          qtyToReturn: mode === "full" ? availableQty : 0,
          unit_price: Number(it.unit_price || 0),
          tax_rate: Number(it.tax_rate || 0),
          line_total: Number(it.line_total || 0),
          returned_quantity: Number(it.returned_quantity || 0)
        }
      }).filter((r: any) => r.maxQty > 0)
      setReturnItems(rows)

      // Load accounts for refund selection - استخدام filterCashBankAccounts لضمان التوافق مع صفحة الأعمال المصرفية
      const { data: accs } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, sub_type, parent_id")
        .eq("company_id", companyId)
        .eq("is_active", true)
      // ✅ استخدام filterCashBankAccounts للحصول على حسابات النقد والبنك (نفس المنطق في صفحة الأعمال المصرفية)
      // ✅ إضافة حسابات الذمم الدائنة (accounts_payable) للمرتجعات - مع فلترة leaf accounts فقط للاتساق
      const cashBankAccounts = filterCashBankAccounts(accs || [], true)
      const leafIds = getLeafAccountIds(accs || [])
      const apAccounts = (accs || []).filter((a: any) =>
        String(a.sub_type || '').toLowerCase() === 'accounts_payable' && leafIds.has(a.id)
      )
      setReturnAccounts([...cashBankAccounts, ...apAccounts] as any)

      // Load currencies
      const curr = await getActiveCurrencies(supabase, companyId)
      if (curr.length > 0) setCurrencies(curr)

      // Set bill currency as default
      const billCurrency = bill.currency_code || bill.original_currency || appCurrency
      setReturnBillCurrency(billCurrency)
      setReturnCurrency(billCurrency)
      setReturnMethod('cash')
      setReturnAccountId('')

      // Store bill financial details for display in form
      const originalTotal = Number(bill.total_amount || 0) + Number((bill as any).returned_amount || 0)
      const paidAmount = Number((bill as any).paid_amount || 0)
      const previouslyReturned = Number((bill as any).returned_amount || 0)
      const remainingAmount = Math.max(0, Number(bill.total_amount || 0) - paidAmount)
      let paymentStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid'
      if (paidAmount >= originalTotal) {
        paymentStatus = 'paid'
      } else if (paidAmount > 0) {
        paymentStatus = 'partial'
      }
      setReturnBillData({
        originalTotal,
        paidAmount,
        remainingAmount,
        previouslyReturned,
        status: bill.status || '',
        paymentStatus
      })

      setReturnOpen(true)
    } catch { }
  }

  // Update exchange rate when return currency changes
  useEffect(() => {
    const updateRate = async () => {
      if (returnCurrency === appCurrency) {
        setReturnExRate({ rate: 1, rateId: null, source: 'same_currency' })
      } else {
        const companyId = await getActiveCompanyId(supabase)
        if (companyId) {
          const result = await getExchangeRate(supabase, returnCurrency, appCurrency, undefined, companyId)
          setReturnExRate({ rate: result.rate, rateId: result.rateId || null, source: result.source })
        }
      }
    }
    if (returnOpen) updateRate()
  }, [returnCurrency, appCurrency, returnOpen])

  // Calculate return total (including tax)
  // ✅ يجب أن يتطابق مع حساب returnTotalOriginal في submitPurchaseReturn
  const returnTotal = useMemo(() => {
    return returnItems.reduce((sum, it) => {
      const lineTotal = it.qtyToReturn * it.unit_price
      const taxAmount = lineTotal * (it.tax_rate || 0) / 100
      return sum + lineTotal + taxAmount
    }, 0)
  }, [returnItems])

  // ✅ إنشاء طلب مرتجع بحالة "pending_approval" — المخزون لا يُخصم إلا عند اعتماد مسؤول المخزن
  const submitPurchaseReturn = async () => {
    try {
      setReturnProcessing(true)
      if (!returnBillId || returnTotal <= 0) return
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get bill data for governance
      const { data: billRow } = await supabase
        .from('bills')
        .select('supplier_id, bill_number, branch_id, cost_center_id, warehouse_id')
        .eq('id', returnBillId)
        .single()
      if (!billRow) return

      const returnNumber = `PR-${returnBillNumber}-${Date.now()}`
      const returnDate = new Date().toISOString().slice(0, 10)

      // 1. إنشاء سجل المرتجع بحالة pending_approval
      const { data: prData, error: prError } = await supabase
        .from('purchase_returns')
        .insert({
          company_id: companyId,
          supplier_id: billRow.supplier_id,
          bill_id: returnBillId,
          return_number: returnNumber,
          return_date: returnDate,
          status: 'pending_approval',
          workflow_status: 'pending_approval',
          settlement_method: returnMethod,
          reason: appLang === 'en' ? `Purchase return (${returnMode})` : `مرتجع مشتريات (${returnMode === 'full' ? 'كامل' : 'جزئي'})`,
          total_amount: returnTotal,
          subtotal: returnTotal,
          branch_id: (billRow as any).branch_id || null,
          cost_center_id: (billRow as any).cost_center_id || null,
          warehouse_id: (billRow as any).warehouse_id || null,
          created_by: user.id,
        })
        .select('id')
        .single()

      if (prError) throw prError

      // 2. إضافة بنود المرتجع
      const validItems = returnItems.filter(r => r.qtyToReturn > 0)
      if (validItems.length > 0) {
        const prItems = validItems.map(r => ({
          purchase_return_id: prData.id,
          bill_item_id: r.id,
          product_id: r.product_id,
          description: r.name || r.product_id,
          quantity: r.qtyToReturn,
          unit_price: r.unit_price,
          tax_rate: r.tax_rate || 0,
          discount_percent: 0,
          line_total: Number((r.unit_price * r.qtyToReturn).toFixed(2)),
        }))
        const { error: itemsError } = await supabase.from('purchase_return_items').insert(prItems)
        if (itemsError) throw itemsError
      }

      // 3. سجل تدقيق
      try {
        await supabase.from('audit_logs').insert({
          company_id: companyId,
          user_id: user.id,
          action: 'purchase_return_submitted',
          entity_type: 'purchase_return',
          entity_id: prData.id,
          new_values: { bill_id: returnBillId, return_number: returnNumber, total_amount: returnTotal },
          created_at: new Date().toISOString(),
        })
      } catch (auditErr) { console.warn('Audit log failed:', auditErr) }

      // 4. إشعار للإدارة العليا للموافقة
      try {
        const notifTs = Date.now()
        const title = appLang === 'en' ? 'Purchase Return Approval Required' : 'مطلوب اعتماد مرتجع مشتريات'
        const message = appLang === 'en'
          ? `Purchase return ${returnNumber} for bill ${returnBillNumber} requires your approval`
          : `مرتجع مشتريات رقم ${returnNumber} للفاتورة ${returnBillNumber} يحتاج إلى اعتمادك`
        for (const role of ['admin', 'owner', 'general_manager']) {
          await createNotification({
            companyId,
            referenceType: 'purchase_return',
            referenceId: prData.id,
            title,
            message,
            createdBy: user.id,
            branchId: (billRow as any).branch_id || undefined,
            assignedToRole: role,
            priority: 'high',
            eventKey: `purchase_return:${prData.id}:pending_approval:${role}:${notifTs}`,
            severity: 'warning',
            category: 'approvals',
          })
        }
      } catch (notifErr) { console.warn('Notification failed:', notifErr) }

      setReturnOpen(false)
      setReturnItems([])
      toast({
        title: appLang === 'en' ? '✅ Return Submitted' : '✅ تم إرسال المرتجع',
        description: appLang === 'en'
          ? `Return ${returnNumber} submitted for approval. Go to Purchase Returns page to track status.`
          : `تم إرسال المرتجع ${returnNumber} للاعتماد. راجع صفحة مرتجعات المشتريات لمتابعة الحالة.`,
      })
      await loadData()
    } catch (err) {
      console.error("Error submitting purchase return:", err)
      toast({ title: '❌ Error', description: String(err), variant: 'destructive' })
    } finally {
      setReturnProcessing(false)
    }
  }



  // Prevent hydration mismatch
  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />

        {/* Main Content - تحسين للهاتف */}
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <div className="space-y-4 sm:space-y-6 max-w-full">
            <CompanyHeader />
            {/* رأس الصفحة - تحسين للهاتف */}
            <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="p-2 sm:p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                    <Receipt className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang === 'en' ? 'Purchase Bills' : 'فواتير المشتريات'}</h1>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang === 'en' ? 'Manage supplier bills and track payments' : 'إدارة فواتير الموردين وتتبع المدفوعات'}</p>
                    {/* 🔐 Governance Notice */}
                    {userContext && (userContext.role === 'manager' || userContext.role === 'accountant') && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        {appLang === 'en' ? '🏢 Showing bills from your branch only' : '🏢 تعرض الفواتير الخاصة بفرعك فقط'}
                      </p>
                    )}
                    {userContext && (userContext.role === 'staff' || userContext.role === 'sales' || userContext.role === 'employee') && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        {appLang === 'en' ? '👨‍💼 Showing bills you created only' : '👨‍💼 تعرض الفواتير التي أنشأتها فقط'}
                      </p>
                    )}
                  </div>
                </div>
                <Link href="/purchase-orders/new" className="self-start sm:self-auto" title={appLang === 'en' ? 'Bills are created automatically after PO approval' : 'تُنشأ الفواتير تلقائياً بعد اعتماد أمر الشراء'}>
                  <Button className="bg-orange-600 hover:bg-orange-700 h-10 sm:h-11 text-sm sm:text-base px-3 sm:px-4">
                    <Plus className="w-4 h-4 ml-1 sm:ml-2" />
                    {appLang === 'en' ? 'New Purchase Order' : 'أمر شراء جديد'}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Statistics Cards - تعمل مع الفلترة */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
              <Card className="p-2 sm:p-0">
                <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                  <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Total' : 'الإجمالي'}</CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-4 pt-0">
                  <div className="text-lg sm:text-2xl font-bold">{filteredBills.length}</div>
                </CardContent>
              </Card>

              <Card className="p-2 sm:p-0">
                <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                  <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Paid' : 'المدفوعة'}</CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-4 pt-0">
                  <div className="text-lg sm:text-2xl font-bold text-green-600">{filteredBills.filter((b) => b.status === "paid").length}</div>
                </CardContent>
              </Card>

              <Card className="p-2 sm:p-0">
                <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                  <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Pending' : 'قيد الانتظار'}</CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-4 pt-0">
                  <div className="text-lg sm:text-2xl font-bold text-yellow-600">
                    {filteredBills.filter((b) => b.status !== "paid" && b.status !== "cancelled" && b.status !== "draft").length}
                  </div>
                </CardContent>
              </Card>

              <Card className="p-2 sm:p-0">
                <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                  <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Amount' : 'المبلغ'}</CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-4 pt-0">
                  <div className="text-sm sm:text-2xl font-bold truncate">
                    {filteredBills.reduce((sum, b) => sum + getDisplayAmount(b, 'total'), 0).toFixed(0)} {currencySymbol}
                  </div>
                </CardContent>
              </Card>
              <Card className="p-2 sm:p-0">
                <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                  <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Paid' : 'المدفوع'}</CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-4 pt-0">
                  <div className="text-sm sm:text-2xl font-bold truncate text-green-600">
                    {filteredBills.reduce((sum, b) => sum + getDisplayAmount(b, 'paid'), 0).toFixed(0)} {currencySymbol}
                  </div>
                </CardContent>
              </Card>
              <Card className="p-2 sm:p-0">
                <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                  <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Remaining' : 'المتبقي'}</CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-4 pt-0">
                  <div className={`text-sm sm:text-2xl font-bold truncate ${filteredBills.reduce((sum, b) => sum + getDisplayAmount(b, 'total'), 0) - filteredBills.reduce((sum, b) => sum + getDisplayAmount(b, 'paid'), 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {(filteredBills.reduce((sum, b) => sum + getDisplayAmount(b, 'total'), 0) - filteredBills.reduce((sum, b) => sum + getDisplayAmount(b, 'paid'), 0)).toFixed(0)} {currencySymbol}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* قسم الفلترة المتقدم */}
            <FilterContainer
              title={appLang === 'en' ? 'Filters' : 'الفلاتر'}
              activeCount={activeFilterCount + (branchFilter.selectedBranchId ? 1 : 0)}
              onClear={() => {
                clearFilters()
                branchFilter.resetFilter()
              }}
              defaultOpen={false}
            >
              <div className="space-y-4">
                {/* 🔐 فلتر الفروع - يظهر فقط للأدوار المميزة (Owner/Admin/General Manager) */}
                <BranchFilter
                  lang={appLang as 'ar' | 'en'}
                  externalHook={branchFilter}
                  className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800"
                />

                {/* Quick Search Bar */}
                <div>
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        const val = e.target.value
                        startTransition(() => setSearchQuery(val))
                      }}
                      placeholder={appLang === 'en' ? 'Search by bill #, supplier name or phone...' : 'بحث برقم الفاتورة، اسم المورد أو الهاتف...'}
                      className={`pr-10 h-11 text-sm bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 ${isPending ? 'opacity-70' : ''}`}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                  {/* فلتر الحالة - Multi-select */}
                  <MultiSelect
                    options={statusOptions}
                    selected={filterStatuses}
                    onChange={(val) => startTransition(() => setFilterStatuses(val))}
                    placeholder={appLang === 'en' ? 'All Statuses' : 'جميع الحالات'}
                    searchPlaceholder={appLang === 'en' ? 'Search status...' : 'بحث في الحالات...'}
                    emptyMessage={appLang === 'en' ? 'No status found' : 'لا توجد حالات'}
                    className="h-10 text-sm"
                  />

                  {/* فلتر المورد - Multi-select */}
                  <MultiSelect
                    options={allSuppliers.map((s) => ({ value: s.id, label: s.name }))}
                    selected={filterSuppliers}
                    onChange={(val) => startTransition(() => setFilterSuppliers(val))}
                    placeholder={appLang === 'en' ? 'All Suppliers' : 'جميع الموردين'}
                    searchPlaceholder={appLang === 'en' ? 'Search suppliers...' : 'بحث في الموردين...'}
                    emptyMessage={appLang === 'en' ? 'No suppliers found' : 'لا يوجد موردين'}
                    className="h-10 text-sm"
                  />

                  {/* فلتر المنتجات */}
                  <MultiSelect
                    options={products.map((p) => ({ value: p.id, label: p.name }))}
                    selected={filterProducts}
                    onChange={(val) => startTransition(() => setFilterProducts(val))}
                    placeholder={appLang === 'en' ? 'Filter by Products' : 'فلترة بالمنتجات'}
                    searchPlaceholder={appLang === 'en' ? 'Search products...' : 'بحث في المنتجات...'}
                    emptyMessage={appLang === 'en' ? 'No products found' : 'لا توجد منتجات'}
                    className="h-10 text-sm"
                  />

                  {/* فلتر شركة الشحن */}
                  <MultiSelect
                    options={shippingProviders.map((p) => ({ value: p.id, label: p.provider_name }))}
                    selected={filterShippingProviders}
                    onChange={(val) => startTransition(() => setFilterShippingProviders(val))}
                    placeholder={appLang === 'en' ? 'Shipping Company' : 'شركة الشحن'}
                    searchPlaceholder={appLang === 'en' ? 'Search shipping...' : 'بحث في شركات الشحن...'}
                    emptyMessage={appLang === 'en' ? 'No shipping companies' : 'لا توجد شركات شحن'}
                    className="h-10 text-sm"
                  />

                  {/* من تاريخ */}
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">
                      {appLang === 'en' ? 'From Date' : 'من تاريخ'}
                    </label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => {
                        const val = e.target.value
                        startTransition(() => setDateFrom(val))
                      }}
                      className="h-10 text-sm"
                    />
                  </div>

                  {/* إلى تاريخ */}
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">
                      {appLang === 'en' ? 'To Date' : 'إلى تاريخ'}
                    </label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        const val = e.target.value
                        startTransition(() => setDateTo(val))
                      }}
                      className="h-10 text-sm"
                    />
                  </div>
                </div>

                {/* عرض عدد النتائج */}
                {hasActiveFilters && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-slate-700">
                    {appLang === 'en'
                      ? `Showing ${filteredBills.length} of ${bills.length} bills`
                      : `عرض ${filteredBills.length} من ${bills.length} فاتورة`}
                  </div>
                )}
              </div>
            </FilterContainer>

            {/* Bills Table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
                <CardTitle>{appLang === 'en' ? 'Bills List' : 'قائمة الفواتير'}</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <LoadingState type="table" rows={8} />
                ) : filteredBills.length === 0 ? (
                  <EmptyState
                    icon={Receipt}
                    title={appLang === 'en' ? 'No bills yet' : 'لا توجد فواتير حتى الآن'}
                    description={appLang === 'en' ? 'Create your first bill to get started' : 'أنشئ أول فاتورة مشتريات للبدء'}
                  />
                ) : (
                  <>
                    <DataTable
                      columns={tableColumns}
                      data={filteredBills}
                      keyField="id"
                      lang={appLang}
                      minWidth="min-w-[700px]"
                      emptyMessage={appLang === 'en' ? 'No bills found' : 'لا توجد فواتير'}
                      footer={{
                        render: () => {
                          const totalBills = filteredBills.length
                          const totalAmount = filteredBills.reduce((sum, b) => sum + getDisplayAmount(b, 'total'), 0)
                          const totalPaid = filteredBills.reduce((sum, b) => sum + getDisplayAmount(b, 'paid'), 0)
                          const totalDue = totalAmount - totalPaid

                          return (
                            <tr>
                              <td className="px-3 py-4 text-right" colSpan={tableColumns.length - 1}>
                                <span className="text-gray-700 dark:text-gray-200">
                                  {appLang === 'en' ? 'Totals' : 'الإجماليات'} ({totalBills} {appLang === 'en' ? 'bills' : 'فاتورة'})
                                </span>
                              </td>
                              <td className="px-3 py-4">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Total:' : 'الإجمالي:'}</span>
                                    <span className="text-blue-600 dark:text-blue-400 font-semibold">
                                      {currencySymbol}{totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Paid:' : 'المدفوع:'}</span>
                                    <span className="text-green-600 dark:text-green-400 font-semibold">
                                      {currencySymbol}{totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-4 border-t border-gray-300 dark:border-slate-600 pt-1 mt-1">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Due:' : 'المستحق:'}</span>
                                    <span className={`font-bold ${totalDue >= 0 ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'}`}>
                                      {currencySymbol}{totalDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )
                        }
                      }}
                    />
                    {serverTotal > 0 && (
                      <DataPagination
                        currentPage={serverPage}
                        totalPages={serverTotalPages}
                        totalItems={serverTotal}
                        pageSize={pageSize}
                        onPageChange={handlePageChange}
                        onPageSizeChange={handlePageSizeChange}
                        lang={appLang}
                      />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
              <DialogContent dir={appLang === 'en' ? 'ltr' : 'rtl'} className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{appLang === 'en' ? (returnMode === 'full' ? 'Full Purchase Return' : 'Partial Purchase Return') : (returnMode === 'full' ? 'مرتجع مشتريات كامل' : 'مرتجع مشتريات جزئي')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Bill Financial Summary */}
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-lg">{appLang === 'en' ? 'Bill' : 'الفاتورة'}: {returnBillNumber}</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${returnBillData.paymentStatus === 'paid' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        returnBillData.paymentStatus === 'partial' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                          'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}>
                        {returnBillData.paymentStatus === 'paid' ? (appLang === 'en' ? 'Fully Paid' : 'مدفوعة بالكامل') :
                          returnBillData.paymentStatus === 'partial' ? (appLang === 'en' ? 'Partially Paid' : 'مدفوعة جزئياً') :
                            (appLang === 'en' ? 'Unpaid' : 'غير مدفوعة')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang === 'en' ? 'Original Total' : 'الإجمالي الأصلي'}</p>
                        <p className="font-semibold">{returnBillData.originalTotal.toFixed(2)} {returnBillCurrency}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang === 'en' ? 'Paid Amount' : 'المبلغ المدفوع'}</p>
                        <p className="font-semibold text-green-600">{returnBillData.paidAmount.toFixed(2)} {returnBillCurrency}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang === 'en' ? 'Remaining' : 'المتبقي'}</p>
                        <p className="font-semibold text-red-600">{returnBillData.remainingAmount.toFixed(2)} {returnBillCurrency}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang === 'en' ? 'Previously Returned' : 'مرتجع سابق'}</p>
                        <p className="font-semibold text-orange-600">{returnBillData.previouslyReturned.toFixed(2)} {returnBillCurrency}</p>
                      </div>
                    </div>
                  </div>

                  {/* Items table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-600 dark:text-gray-300 border-b dark:border-slate-700">
                          <th className="p-2 text-right">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                          <th className="p-2 text-right">{appLang === 'en' ? 'Available' : 'المتاح'}</th>
                          <th className="p-2 text-right">{appLang === 'en' ? 'Return Qty' : 'كمية المرتجع'}</th>
                          <th className="p-2 text-right">{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                          <th className="p-2 text-right">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {returnItems.map((it, idx) => (
                          <tr key={it.id} className="border-b">
                            <td className="p-2">{it.name || it.product_id}</td>
                            <td className="p-2 text-center">{it.maxQty}</td>
                            <td className="p-2">
                              <NumericInput
                                min={0}
                                max={it.maxQty}
                                value={it.qtyToReturn}
                                disabled={returnMode === 'full'}
                                className="w-20"
                                onChange={(val) => {
                                  const v = Math.max(0, Math.min(Math.round(val), it.maxQty))
                                  setReturnItems((prev) => prev.map((r, i) => i === idx ? { ...r, qtyToReturn: v } : r))
                                }}
                              />
                            </td>
                            <td className="p-2 text-right">{it.unit_price.toFixed(2)}</td>
                            <td className="p-2 text-right font-medium">{(it.qtyToReturn * it.unit_price).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Return total */}
                  <div className="flex justify-end">
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded text-lg font-semibold">
                      {appLang === 'en' ? 'Return Total' : 'إجمالي المرتجع'}: {returnTotal.toFixed(2)} {returnCurrency}
                    </div>
                  </div>

                  {/* Currency and Method selection */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
                      <Select value={returnCurrency} onValueChange={setReturnCurrency}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {currencies.length > 0 ? (
                            currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)
                          ) : (
                            <>
                              <SelectItem value="EGP">EGP</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="SAR">SAR</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>{appLang === 'en' ? 'Refund Method' : 'طريقة الاسترداد'}</Label>
                      <Select value={returnMethod} onValueChange={(v: 'cash' | 'bank' | 'credit') => setReturnMethod(v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">{appLang === 'en' ? 'Cash Refund' : 'استرداد نقدي'}</SelectItem>
                          <SelectItem value="bank">{appLang === 'en' ? 'Bank Refund' : 'استرداد بنكي'}</SelectItem>
                          <SelectItem value="credit">{appLang === 'en' ? 'Credit to Supplier Account' : 'رصيد على حساب المورد'}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {returnMethod !== 'credit' && (
                      <div className="space-y-2">
                        <Label>{appLang === 'en' ? 'Refund Account' : 'حساب الاسترداد'}</Label>
                        <Select value={returnAccountId} onValueChange={setReturnAccountId}>
                          <SelectTrigger><SelectValue placeholder={appLang === 'en' ? 'Auto-select' : 'اختيار تلقائي'} /></SelectTrigger>
                          <SelectContent>
                            {returnAccounts.map(acc => (
                              <SelectItem key={acc.id} value={acc.id}>{acc.account_code || ''} {acc.account_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Exchange rate info */}
                  {returnCurrency !== appCurrency && returnTotal > 0 && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm">
                      <div>{appLang === 'en' ? 'Exchange Rate' : 'سعر الصرف'}: <strong>1 {returnCurrency} = {returnExRate.rate.toFixed(4)} {appCurrency}</strong> ({returnExRate.source})</div>
                      <div>{appLang === 'en' ? 'Base Amount' : 'المبلغ الأساسي'}: <strong>{(returnTotal * returnExRate.rate).toFixed(2)} {appCurrency}</strong></div>
                    </div>
                  )}

                  {/* Info about refund method */}
                  <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm text-yellow-800 dark:text-yellow-200">
                    {returnMethod === 'cash' && (appLang === 'en' ? '💰 Cash will be returned to the cash account' : '💰 سيتم إرجاع المبلغ إلى حساب النقد')}
                    {returnMethod === 'bank' && (appLang === 'en' ? '🏦 Amount will be returned to the bank account' : '🏦 سيتم إرجاع المبلغ إلى الحساب البنكي')}
                    {returnMethod === 'credit' && (appLang === 'en' ? '📝 Amount will reduce your payable to the supplier' : '📝 سيتم تخفيض المبلغ المستحق للمورد')}
                  </div>

                  {/* Post-return preview */}
                  {returnTotal > 0 && (
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm border border-green-200 dark:border-green-700">
                      <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">
                        {appLang === 'en' ? '📊 After Return Preview' : '📊 معاينة ما بعد المرتجع'}
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang === 'en' ? 'New Bill Total' : 'الإجمالي الجديد'}</p>
                          <p className="font-semibold">{Math.max(0, (returnBillData.originalTotal - returnBillData.previouslyReturned) - returnTotal).toFixed(2)} {returnBillCurrency}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang === 'en' ? 'Total Returned' : 'إجمالي المرتجع'}</p>
                          <p className="font-semibold text-orange-600">{(returnBillData.previouslyReturned + returnTotal).toFixed(2)} {returnBillCurrency}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 text-xs">{appLang === 'en' ? 'Expected Status' : 'الحالة المتوقعة'}</p>
                          <p className={`font-semibold ${(returnBillData.originalTotal - returnBillData.previouslyReturned - returnTotal) <= 0 ? 'text-purple-600' :
                            returnBillData.paymentStatus === 'paid' ? 'text-green-600' :
                              returnBillData.paidAmount > 0 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                            {(returnBillData.originalTotal - returnBillData.previouslyReturned - returnTotal) <= 0
                              ? (appLang === 'en' ? 'Fully Returned' : 'مرتجع بالكامل')
                              : returnBillData.paymentStatus === 'paid'
                                ? (appLang === 'en' ? 'Paid' : 'مدفوعة')
                                : returnBillData.paidAmount >= Math.max(0, (returnBillData.originalTotal - returnBillData.previouslyReturned) - returnTotal)
                                  ? (appLang === 'en' ? 'Paid' : 'مدفوعة')
                                  : returnBillData.paidAmount > 0
                                    ? (appLang === 'en' ? 'Partially Paid' : 'مدفوعة جزئياً')
                                    : (appLang === 'en' ? 'Unpaid' : 'غير مدفوعة')}
                          </p>
                        </div>
                      </div>
                      {/* Show expected refund for cash/bank method */}
                      {returnMethod !== 'credit' && (
                        <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-700">
                          <p className="text-gray-600 dark:text-gray-300">
                            💵 {appLang === 'en' ? 'Expected Refund Amount' : 'المبلغ المتوقع استرداده'}: <strong className="text-green-700 dark:text-green-300">
                              {returnBillData.paymentStatus !== 'unpaid'
                                ? `${Math.min(returnTotal, returnBillData.paidAmount).toFixed(2)} ${returnBillCurrency}`
                                : `0.00 ${returnBillCurrency} ${appLang === 'en' ? '(No payment made)' : '(لم يتم الدفع)'}`
                              }
                            </strong>
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Accounting entries preview */}
                  {returnTotal > 0 && (
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-xs border">
                      <h5 className="font-semibold mb-2">{appLang === 'en' ? '📝 Journal Entries to be Created' : '📝 القيود المحاسبية التي سيتم إنشاؤها'}</h5>
                      <div className="space-y-1 text-gray-600 dark:text-gray-300">
                        <p>1️⃣ {appLang === 'en' ? 'Purchase Return Entry:' : 'قيد مرتجع المشتريات:'}</p>
                        <p className="ms-4">• {appLang === 'en' ? 'Debit: Accounts Payable (Supplier)' : 'مدين: الذمم الدائنة (المورد)'} - {returnTotal.toFixed(2)}</p>
                        <p className="ms-4">• {appLang === 'en' ? 'Credit: Inventory' : 'دائن: المخزون'} - {returnTotal.toFixed(2)}</p>
                        {returnMethod !== 'credit' && (
                          <>
                            <p className="mt-2">2️⃣ {appLang === 'en' ? 'Refund Entry:' : 'قيد الاسترداد:'}</p>
                            {returnBillData.paymentStatus !== 'unpaid' ? (
                              <>
                                <p className="ms-4">• {appLang === 'en' ? 'Debit:' : 'مدين:'} {returnMethod === 'cash' ? (appLang === 'en' ? 'Cash' : 'الخزينة') : (appLang === 'en' ? 'Bank' : 'البنك')} - {Math.min(returnTotal, returnBillData.paidAmount).toFixed(2)}</p>
                                <p className="ms-4">• {appLang === 'en' ? 'Credit: Accounts Payable' : 'دائن: الذمم الدائنة'} - {Math.min(returnTotal, returnBillData.paidAmount).toFixed(2)}</p>
                              </>
                            ) : (
                              <p className="ms-4 text-gray-500 dark:text-gray-400 italic">
                                {appLang === 'en' ? '(No refund entry - bill is unpaid)' : '(لا يوجد قيد استرداد - الفاتورة غير مدفوعة)'}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setReturnOpen(false)} disabled={returnProcessing}>
                    {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                  </Button>
                  <Button
                    onClick={submitPurchaseReturn}
                    disabled={returnProcessing || returnTotal <= 0}
                    className="bg-orange-600 hover:bg-orange-700"
                  >
                    {returnProcessing ? '...' : (appLang === 'en' ? 'Process Return' : 'تنفيذ المرتجع')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </main>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir={appLang === 'en' ? 'ltr' : 'rtl'}>
          <AlertDialogHeader>
            <AlertDialogTitle>{appLang === 'en' ? 'Confirm Delete' : 'تأكيد الحذف'}</AlertDialogTitle>
            <AlertDialogDescription>
              {appLang === 'en' ? 'Are you sure you want to delete this bill? This action cannot be undone.' : 'هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteId) {
                  handleDelete(pendingDeleteId)
                }
                setConfirmOpen(false)
                setPendingDeleteId(null)
              }}
            >
              {appLang === 'en' ? 'Delete' : 'حذف'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
