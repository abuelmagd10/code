"use client"

import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { FilterContainer } from "@/components/ui/filter-container"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Plus, Eye, Trash2, Pencil, FileText, AlertCircle, DollarSign, CreditCard, Clock, UserCheck, X, ShoppingCart } from "lucide-react"
import Link from "next/link"
import { canAction } from "@/lib/authz"
import { type UserContext } from "@/lib/validation"
import { CompanyHeader } from "@/components/company-header"
import { usePagination } from "@/lib/pagination"
import { DataPagination } from "@/components/data-pagination"
import { ListErrorBoundary } from "@/components/list-error-boundary"
import { PageHeaderList } from "@/components/PageHeader"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { StatusBadge } from "@/components/DataTableFormatters"
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { toastDeleteSuccess, toastDeleteError } from "@/lib/notifications"
import { processSalesReturn } from "@/lib/sales-returns"

// نوع بيانات الموظف للفلترة
interface Employee {
  user_id: string
  display_name: string
  role: string
  email?: string
}

interface Customer {
  id: string
  name: string
  phone?: string
}

interface Invoice {
  id: string
  invoice_number: string
  customer_id: string
  invoice_date: string
  due_date: string
  total_amount: number
  paid_amount: number
  returned_amount?: number
  return_status?: string
  status: string
  customers?: { name: string; phone?: string }
  currency_code?: string
  original_currency?: string
  original_total?: number
  original_paid?: number
  display_currency?: string
  display_total?: number
  display_paid?: number
  // Linked Sales Order
  sales_order_id?: string | null
}

type Payment = { id: string; invoice_id: string | null; amount: number }

// نوع لأرصدة العملاء الدائنة
type CustomerCredit = {
  id: string
  customer_id: string
  reference_id: string | null
  amount: number
  used_amount: number | null
  applied_amount: number | null
  status: string
}

// نوع لبنود الفاتورة مع المنتج
type InvoiceItemWithProduct = {
  invoice_id: string
  quantity: number
  product_id?: string | null
  products?: { name: string } | null
}

// نوع لعرض ملخص المنتجات
type ProductSummary = { name: string; quantity: number }

// نوع للمنتجات
type Product = { id: string; name: string }

export default function InvoicesPage() {
  const supabase = useSupabase()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemWithProduct[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [customerCredits, setCustomerCredits] = useState<CustomerCredit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterStatuses, setFilterStatuses] = useState<string[]>([])
  const [filterCustomers, setFilterCustomers] = useState<string[]>([])
  const [filterPaymentMethod, setFilterPaymentMethod] = useState<string>("all")
  const [filterProducts, setFilterProducts] = useState<string[]>([])
  const [filterShippingProviders, setFilterShippingProviders] = useState<string[]>([])
  const [shippingProviders, setShippingProviders] = useState<{ id: string; provider_name: string }[]>([])
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  // فلترة الموظفين (للمديرين فقط)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>("")
  const [canViewAllInvoices, setCanViewAllInvoices] = useState(false)

  // 🔐 ERP Access Control - سياق المستخدم
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>("all")
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState<string>("")
  // خريطة لربط الفواتير بالموظف المنشئ لأمر البيع
  const [invoiceToEmployeeMap, setInvoiceToEmployeeMap] = useState<Record<string, string>>({})

  // Status options for multi-select
  const statusOptions = [
    { value: "draft", label: appLang === 'en' ? "Draft" : "مسودة" },
    { value: "sent", label: appLang === 'en' ? "Sent" : "مُرسل" },
    { value: "paid", label: appLang === 'en' ? "Paid" : "مدفوع" },
    { value: "partially_paid", label: appLang === 'en' ? "Partially Paid" : "مدفوع جزئياً" },
    { value: "returned", label: appLang === 'en' ? "Returned" : "مرتجع" },
    { value: "fully_returned", label: appLang === 'en' ? "Fully Returned" : "مرتجع بالكامل" },
    { value: "cancelled", label: appLang === 'en' ? "Cancelled" : "ملغي" },
    { value: "has_credit", label: appLang === 'en' ? "Has Credit" : "رصيد دائن" },
  ]

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

  // Pagination state
  const [pageSize, setPageSize] = useState(10)

  // تجميع المدفوعات الفعلية من جدول payments حسب الفاتورة
  const paidByInvoice: Record<string, number> = useMemo(() => {
    const agg: Record<string, number> = {}
    payments.forEach((p) => {
      const key = p.invoice_id || ""
      if (key) {
        agg[key] = (agg[key] || 0) + (p.amount || 0)
      }
    })
    return agg
  }, [payments])

  // Helper: Get display amount (use converted if available)
  // يستخدم المدفوعات الفعلية من جدول payments كأولوية
  // ملاحظة: total_amount هو المبلغ الحالي بعد خصم المرتجعات
  const getDisplayAmount = (invoice: Invoice, field: 'total' | 'paid' = 'total'): number => {
    if (field === 'total') {
      // استخدام total_amount مباشرة لأنه يمثل المبلغ الحالي بعد المرتجعات
      // display_total يستخدم فقط إذا كانت العملة مختلفة ومحولة
      if (invoice.display_currency === appCurrency && invoice.display_total != null) {
        return invoice.display_total
      }
      // total_amount هو المبلغ الصحيح (بعد خصم المرتجعات)
      return invoice.total_amount
    }
    // For paid amount: استخدام المدفوعات الفعلية من جدول payments أولاً
    const actualPaid = paidByInvoice[invoice.id] || 0
    if (actualPaid > 0) {
      return actualPaid
    }
    // Fallback to stored paid_amount
    if (invoice.display_currency === appCurrency && invoice.display_paid != null) {
      return invoice.display_paid
    }
    return invoice.paid_amount
  }

  // Listen for currency changes and reload data
  useEffect(() => {
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency') || 'EGP'
      setAppCurrency(newCurrency)
      // Reload invoices to get updated display amounts
      loadData()
    }
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [])
  const [permView, setPermView] = useState<boolean>(true)
  const [permWrite, setPermWrite] = useState<boolean>(true)
  const [permEdit, setPermEdit] = useState<boolean>(true)
  const [permDelete, setPermDelete] = useState<boolean>(true)
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnMode, setReturnMode] = useState<"partial" | "full">("partial")
  const [returnInvoiceId, setReturnInvoiceId] = useState<string | null>(null)
  const [returnInvoiceNumber, setReturnInvoiceNumber] = useState<string>("")
  const [returnItems, setReturnItems] = useState<{ id: string; product_id: string; name?: string; quantity: number; maxQty: number; qtyToReturn: number; qtyCreditOnly?: number; cost_price: number; unit_price: number; tax_rate: number; discount_percent: number; line_total: number }[]>([])
  // بيانات الفاتورة للعرض في نافذة المرتجع
  const [returnInvoiceData, setReturnInvoiceData] = useState<{
    total_amount: number;
    paid_amount: number;
    returned_amount: number;
    net_amount: number; // الصافي بعد المرتجعات
    status: string;
    customer_name: string;
  } | null>(null)
  useEffect(() => {
    (async () => {
      setPermView(await canAction(supabase, "invoices", "read"))
      setPermWrite(await canAction(supabase, "invoices", "write"))
      setPermEdit(await canAction(supabase, "invoices", "update"))
      setPermDelete(await canAction(supabase, "invoices", "delete"))
    })()
  }, [supabase])
  useEffect(() => {
    const reloadPerms = async () => {
      setPermView(await canAction(supabase, "invoices", "read"))
      setPermWrite(await canAction(supabase, "invoices", "write"))
      setPermEdit(await canAction(supabase, "invoices", "update"))
      setPermDelete(await canAction(supabase, "invoices", "delete"))
    }
    const handler = () => { reloadPerms() }
    if (typeof window !== 'undefined') window.addEventListener('permissions_updated', handler)
    return () => { if (typeof window !== 'undefined') window.removeEventListener('permissions_updated', handler) }
  }, [supabase])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setIsLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setIsLoading(false)
        return
      }

      setCurrentUserId(user.id)

      // استخدم الشركة الفعّالة لضمان ظهور الفواتير الصحيحة للمستخدمين المدعوين
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        setIsLoading(false)
        return
      }

      // جلب دور المستخدم الحالي مع الفرع ومركز التكلفة والمخزن
      const { data: member } = await supabase
        .from("company_members")
        .select("role, branch_id, cost_center_id, warehouse_id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .single()

      const role = member?.role || "staff"
      setCurrentUserRole(role)
      // owner, admin, accountant, viewer يرون كل الفواتير - staff يرى فقط فواتيره
      const canViewAll = ["owner", "admin", "accountant", "viewer"].includes(role)
      setCanViewAllInvoices(canViewAll)

      // 🔐 ERP Access Control - تعيين سياق المستخدم
      const context: UserContext = {
        user_id: user.id,
        company_id: companyId,
        branch_id: member?.branch_id || null,
        cost_center_id: member?.cost_center_id || null,
        warehouse_id: member?.warehouse_id || null,
        role: role
      }
      setUserContext(context)

      // تحميل قائمة الموظفين للفلترة (للأدوار المصرح لها)
      if (canViewAll) {
        const { data: members } = await supabase
          .from("company_members")
          .select("user_id, role")
          .eq("company_id", companyId)

        if (members && members.length > 0) {
          const userIds = members.map((m: { user_id: string }) => m.user_id)
          const { data: profiles } = await supabase
            .from("user_profiles")
            .select("user_id, display_name, username")
            .in("user_id", userIds)

          const profileMap = new Map((profiles || []).map((p: { user_id: string; display_name?: string; username?: string }) => [p.user_id, p]))

          const roleLabels: Record<string, string> = {
            owner: appLang === 'en' ? 'Owner' : 'مالك',
            admin: appLang === 'en' ? 'Admin' : 'مدير',
            staff: appLang === 'en' ? 'Staff' : 'موظف',
            accountant: appLang === 'en' ? 'Accountant' : 'محاسب',
            viewer: appLang === 'en' ? 'Viewer' : 'مشاهد'
          }

          const employeesList: Employee[] = members.map((m: { user_id: string; role: string }) => {
            const profile = profileMap.get(m.user_id) as { user_id: string; display_name?: string; username?: string } | undefined
            return {
              user_id: m.user_id,
              display_name: profile?.display_name || profile?.username || m.user_id.slice(0, 8),
              role: roleLabels[m.role] || m.role,
              email: profile?.username
            }
          })
          setEmployees(employeesList)
        }
      }

      // تحميل العملاء
      const { data: customersData } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("company_id", companyId)
        .order("name")
      setCustomers(customersData || [])

      // تحميل المنتجات للفلترة
      const { data: productsData } = await supabase
        .from("products")
        .select("id, name")
        .eq("company_id", companyId)
        .order("name")
      setProducts(productsData || [])

      // 🔐 ERP Access Control - تحميل الفواتير مع تصفية حسب سياق المستخدم
      let invoicesQuery = supabase
        .from("invoices")
        .select("*, customers(name, phone)")
        .eq("company_id", companyId)

      // تصفية حسب الفرع ومركز التكلفة (للأدوار غير المديرة)
      const canOverride = ["owner", "admin", "manager"].includes(role)
      if (!canOverride && member?.branch_id) {
        invoicesQuery = invoicesQuery.eq("branch_id", member.branch_id)
      }
      if (!canOverride && member?.cost_center_id) {
        invoicesQuery = invoicesQuery.eq("cost_center_id", member.cost_center_id)
      }

      const { data } = await invoicesQuery.order("invoice_date", { ascending: false })
      setInvoices(data || [])

      // تحميل المدفوعات من جدول payments لحساب المبالغ المدفوعة الفعلية
      const invoiceIds = Array.from(new Set((data || []).map((inv: any) => inv.id)))
      if (invoiceIds.length) {
        const { data: payData } = await supabase
          .from("payments")
          .select("id, invoice_id, amount")
          .eq("company_id", companyId)
          .in("invoice_id", invoiceIds)
        setPayments(payData || [])

        // تحميل بنود الفواتير مع أسماء المنتجات و product_id للفلترة
        const { data: itemsData } = await supabase
          .from("invoice_items")
          .select("invoice_id, quantity, product_id, products(name)")
          .in("invoice_id", invoiceIds)
        setInvoiceItems(itemsData || [])
      } else {
        setPayments([])
        setInvoiceItems([])
      }

      // تحميل أوامر البيع المرتبطة بالفواتير لمعرفة الموظف المنشئ
      const salesOrderIds = (data || []).filter((inv: any) => inv.sales_order_id).map((inv: any) => inv.sales_order_id)
      if (salesOrderIds.length > 0) {
        const { data: salesOrders } = await supabase
          .from("sales_orders")
          .select("id, created_by_user_id")
          .in("id", salesOrderIds)

        // بناء خريطة: invoice_id -> created_by_user_id
        const invToEmpMap: Record<string, string> = {}
        for (const inv of (data || [])) {
          if (inv.sales_order_id) {
            const so = (salesOrders || []).find((s: any) => s.id === inv.sales_order_id)
            if (so?.created_by_user_id) {
              invToEmpMap[inv.id] = so.created_by_user_id
            }
          }
        }
        setInvoiceToEmployeeMap(invToEmpMap)
      }

      // تحميل شركات الشحن
      const { data: providersData } = await supabase
        .from("shipping_providers")
        .select("id, provider_name")
        .eq("company_id", companyId)
        .order("provider_name")
      setShippingProviders(providersData || [])

      // تحميل أرصدة العملاء الدائنة لمعرفة حالة كل رصيد
      try {
        const { data: creditsData } = await supabase
          .from("customer_credits")
          .select("id, customer_id, reference_id, amount, used_amount, applied_amount, status")
          .eq("company_id", companyId)
        setCustomerCredits(creditsData || [])
      } catch {
        setCustomerCredits([])
      }
    } catch (error) {
      console.error("Error loading invoices:", error)
      toast({
        title: appLang === 'en' ? 'Loading Error' : 'خطأ في التحميل',
        description: appLang === 'en' ? 'Failed to load invoices. Please refresh the page.' : 'فشل تحميل الفواتير. يرجى إعادة تحميل الصفحة.',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const loadInvoices = async (status?: string) => {
    await loadData()
  }

  // دالة للحصول على ملخص المنتجات لفاتورة معينة
  const getProductsSummary = (invoiceId: string): ProductSummary[] => {
    const items = invoiceItems.filter(item => item.invoice_id === invoiceId)
    return items.map(item => ({
      name: item.products?.name || '-',
      quantity: item.quantity
    }))
  }

  // دالة للحصول على حالة رصيد العميل الدائن للفاتورة
  // تعيد: { amount: المبلغ الأصلي, disbursed: المصروف, status: الحالة }
  const getCreditStatus = (invoiceId: string): { amount: number; disbursed: number; status: 'active' | 'partial' | 'disbursed' | 'none' } => {
    // البحث عن رصيد دائن مرتبط بهذه الفاتورة
    const credit = customerCredits.find(c => c.reference_id === invoiceId)
    if (!credit) return { amount: 0, disbursed: 0, status: 'none' }

    const totalAmount = Number(credit.amount || 0)
    const usedAmount = Number(credit.used_amount || 0)
    const appliedAmount = Number(credit.applied_amount || 0)
    const totalDisbursed = usedAmount + appliedAmount

    let status: 'active' | 'partial' | 'disbursed' | 'none' = 'active'
    if (totalDisbursed >= totalAmount) {
      status = 'disbursed'
    } else if (totalDisbursed > 0) {
      status = 'partial'
    }

    return { amount: totalAmount, disbursed: totalDisbursed, status }
  }

  // الفلترة الديناميكية على الفواتير
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // فلتر الموظف (حسب الموظف المنشئ لأمر البيع المرتبط)
      if (canViewAllInvoices && filterEmployeeId && filterEmployeeId !== "all") {
        const employeeId = invoiceToEmployeeMap[inv.id]
        if (employeeId !== filterEmployeeId) return false
      } else if (!canViewAllInvoices && currentUserId) {
        // الموظف العادي يرى فقط فواتير أوامره
        const employeeId = invoiceToEmployeeMap[inv.id]
        if (employeeId && employeeId !== currentUserId) return false
      }

      // حساب رصيد دائن للفاتورة
      // لا يظهر رصيد دائن للفواتير الملغية أو المرتجعة بالكامل
      let hasCredit = false
      if (inv.status !== 'cancelled' && inv.status !== 'fully_returned') {
        const returnedAmount = Number(inv.returned_amount || 0)
        // استخدام الإجمالي الأصلي للحساب الصحيح
        const originalTotal = inv.original_total ? Number(inv.original_total) : (inv.display_currency === appCurrency && inv.display_total != null ? inv.display_total : inv.total_amount)
        const netInvoiceAmount = originalTotal - returnedAmount
        // فقط إذا كان صافي الفاتورة موجب
        if (netInvoiceAmount > 0) {
          const actualPaid = paidByInvoice[inv.id] || 0
          const paidAmount = actualPaid > 0 ? actualPaid : (inv.display_currency === appCurrency && inv.display_paid != null ? inv.display_paid : inv.paid_amount)
          hasCredit = paidAmount > netInvoiceAmount
        }
      }

      // فلتر الحالة - Multi-select (مع دعم فلتر رصيد دائن)
      if (filterStatuses.length > 0) {
        const hasHasCreditFilter = filterStatuses.includes("has_credit")
        const otherStatuses = filterStatuses.filter(s => s !== "has_credit")

        // إذا كان فلتر "رصيد دائن" موجود
        if (hasHasCreditFilter) {
          // إذا لا يوجد فلاتر أخرى، أظهر فقط الفواتير التي لها رصيد دائن
          if (otherStatuses.length === 0) {
            if (!hasCredit) return false
          } else {
            // إذا يوجد فلاتر أخرى، أظهر الفواتير التي تطابق إحدى الحالات أو لها رصيد دائن
            if (!otherStatuses.includes(inv.status) && !hasCredit) return false
          }
        } else {
          // فلتر عادي بدون رصيد دائن
          if (!filterStatuses.includes(inv.status)) return false
        }
      }

      // فلتر العميل - إظهار الفواتير لأي من العملاء المختارين
      if (filterCustomers.length > 0 && !filterCustomers.includes(inv.customer_id)) return false

      // فلتر المنتجات - إظهار الفواتير التي تحتوي على أي من المنتجات المختارة
      if (filterProducts.length > 0) {
        const invoiceProductIds = invoiceItems
          .filter(item => item.invoice_id === inv.id)
          .map(item => item.product_id)
          .filter(Boolean) as string[]
        const hasSelectedProduct = filterProducts.some(productId => invoiceProductIds.includes(productId))
        if (!hasSelectedProduct) return false
      }

      // فلتر شركة الشحن
      if (filterShippingProviders.length > 0) {
        const invProviderId = (inv as any).shipping_provider_id
        if (!invProviderId || !filterShippingProviders.includes(invProviderId)) return false
      }

      // فلتر نطاق التاريخ
      if (dateFrom && inv.invoice_date < dateFrom) return false
      if (dateTo && inv.invoice_date > dateTo) return false

      // البحث
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const customerName = (inv.customers?.name || "").toLowerCase()
        const customerPhone = (inv.customers?.phone || "").toLowerCase()
        const invoiceNumber = (inv.invoice_number || "").toLowerCase()
        if (!customerName.includes(q) && !customerPhone.includes(q) && !invoiceNumber.includes(q)) return false
      }

      return true
    })
  }, [invoices, filterStatuses, filterCustomers, filterProducts, filterShippingProviders, invoiceItems, dateFrom, dateTo, searchQuery, appCurrency, paidByInvoice, canViewAllInvoices, filterEmployeeId, currentUserId, invoiceToEmployeeMap])

  // Pagination logic
  const {
    currentPage,
    totalPages,
    totalItems,
    paginatedItems: paginatedInvoices,
    hasNext,
    hasPrevious,
    goToPage,
    nextPage,
    previousPage,
    setPageSize: updatePageSize
  } = usePagination(filteredInvoices, { pageSize })

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    updatePageSize(newSize)
  }

  // تعريف أعمدة الجدول
  const tableColumns: DataTableColumn<Invoice>[] = useMemo(() => [
    {
      key: 'invoice_number',
      header: appLang === 'en' ? 'Invoice No.' : 'رقم الفاتورة',
      type: 'text',
      align: 'left',
      width: 'min-w-[120px]',
      format: (value) => (
        <span className="font-medium text-blue-600 dark:text-blue-400">{value}</span>
      )
    },
    {
      key: 'customer_id',
      header: appLang === 'en' ? 'Customer' : 'العميل',
      type: 'text',
      align: 'left',
      format: (_, row) => (row as any).customers?.name || '-'
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
      key: 'invoice_date',
      header: appLang === 'en' ? 'Date' : 'التاريخ',
      type: 'date',
      align: 'right',
      hidden: 'sm',
      format: (value) => new Date(value).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')
    },
    {
      key: 'net_amount',
      header: appLang === 'en' ? 'Net Amount' : 'صافي المبلغ',
      type: 'currency',
      align: 'right',
      format: (_, row) => {
        const returnedAmount = Number(row.returned_amount || 0);
        const hasReturns = returnedAmount > 0;
        const originalTotal = row.original_total ? Number(row.original_total) : getDisplayAmount(row, 'total');
        const netInvoiceAmount = originalTotal - returnedAmount;

        return (
          <div>
            <div className={hasReturns ? 'line-through text-gray-400 dark:text-gray-500 text-xs' : ''}>
              {hasReturns && `${originalTotal.toFixed(2)} ${currencySymbol}`}
            </div>
            <div className={hasReturns ? 'font-semibold text-orange-600 dark:text-orange-400' : ''}>
              {netInvoiceAmount.toFixed(2)} {currencySymbol}
            </div>
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
        const paidAmount = getDisplayAmount(row, 'paid');
        return (
          <span className="text-green-600 dark:text-green-400">
            {paidAmount.toFixed(2)} {currencySymbol}
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
        const returnedAmount = Number(row.returned_amount || 0);
        const originalTotal = row.original_total ? Number(row.original_total) : getDisplayAmount(row, 'total');
        const netInvoiceAmount = originalTotal - returnedAmount;
        const paidAmount = getDisplayAmount(row, 'paid');
        const actualRemaining = Math.max(0, netInvoiceAmount - paidAmount);

        return (
          <span className={actualRemaining > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
            {actualRemaining.toFixed(2)} {currencySymbol}
          </span>
        );
      }
    },
    {
      key: 'credit',
      header: appLang === 'en' ? 'Credit' : 'رصيد دائن',
      type: 'currency',
      align: 'right',
      hidden: 'md',
      format: (_, row) => {
        const returnedAmount = Number(row.returned_amount || 0);
        const originalTotal = row.original_total ? Number(row.original_total) : getDisplayAmount(row, 'total');
        const netInvoiceAmount = originalTotal - returnedAmount;
        const paidAmount = getDisplayAmount(row, 'paid');
        const isValidForCredit = row.status !== 'cancelled' && row.status !== 'fully_returned' && netInvoiceAmount > 0;
        const customerCreditAmount = isValidForCredit ? Math.max(0, paidAmount - netInvoiceAmount) : 0;
        const creditStatus = getCreditStatus(row.id);

        if (customerCreditAmount === 0) return '-';

        return (
          <div className="text-xs">
            <div className="font-medium text-purple-600 dark:text-purple-400">
              {customerCreditAmount.toFixed(2)} {currencySymbol}
            </div>
            {creditStatus.status !== 'none' && (
              <div className={`text-[10px] ${
                creditStatus.status === 'disbursed' ? 'text-gray-500' :
                creditStatus.status === 'partial' ? 'text-orange-500' :
                'text-green-500'
              }`}>
                {creditStatus.status === 'disbursed' ? (appLang === 'en' ? 'Disbursed' : 'مصروف') :
                 creditStatus.status === 'partial' ? (appLang === 'en' ? 'Partial' : 'جزئي') :
                 (appLang === 'en' ? 'Active' : 'نشط')}
              </div>
            )}
          </div>
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
      format: (_, row) => <StatusBadge status={row.status} lang={appLang} />
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Actions' : 'الإجراءات',
      type: 'actions',
      align: 'center',
      format: (_, row) => (
        <div className="flex gap-2 flex-wrap justify-center">
          {permView && (
            <Link href={`/invoices/${row.id}`}>
              <Button variant="outline" size="sm">
                <Eye className="w-4 h-4" />
              </Button>
            </Link>
          )}
          {permEdit && (
            <Link href={`/invoices/${row.id}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil className="w-4 h-4" />
              </Button>
            </Link>
          )}
          {row.status !== 'draft' && row.status !== 'voided' && row.status !== 'fully_returned' && row.status !== 'cancelled' && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="whitespace-nowrap"
                onClick={() => {
                  console.log("🔘 Partial Return button clicked for:", row.invoice_number, "Status:", row.status)
                  openSalesReturn(row, "partial")
                }}
              >
                {appLang === 'en' ? 'Partial Return' : 'مرتجع جزئي'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="whitespace-nowrap"
                onClick={() => {
                  console.log("🔘 Full Return button clicked for:", row.invoice_number, "Status:", row.status)
                  openSalesReturn(row, "full")
                }}
              >
                {appLang === 'en' ? 'Full Return' : 'مرتجع كامل'}
              </Button>
            </>
          )}
          {permDelete && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700 bg-transparent"
              onClick={() => requestDelete(row.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          {row.sales_order_id && (
            <Link href={`/sales-orders/${row.sales_order_id}`}>
              <Button variant="ghost" size="icon" className="h-8 w-8" title={appLang === 'en' ? 'Linked SO' : 'أمر البيع المرتبط'}>
                <ShoppingCart className="w-4 h-4 text-orange-500" />
              </Button>
            </Link>
          )}
        </div>
      )
    }
  ], [appLang, currencySymbol, currencySymbols, appCurrency, shippingProviders, permView, permEdit, permDelete]);

  // إحصائيات الفواتير - تعمل مع الفلترة - استخدام getDisplayAmount للتعامل مع تحويل العملات
  const stats = useMemo(() => {
    const total = filteredInvoices.length
    const draft = filteredInvoices.filter(i => i.status === 'draft').length
    const sent = filteredInvoices.filter(i => i.status === 'sent').length
    const partiallyPaid = filteredInvoices.filter(i => i.status === 'partially_paid').length
    const paid = filteredInvoices.filter(i => i.status === 'paid').length
    const cancelled = filteredInvoices.filter(i => i.status === 'cancelled').length
    // استخدام getDisplayAmount للحصول على القيم الصحيحة حسب العملة المعروضة
    const totalAmount = filteredInvoices.reduce((sum, i) => sum + getDisplayAmount(i, 'total'), 0)
    const totalPaid = filteredInvoices.reduce((sum, i) => sum + getDisplayAmount(i, 'paid'), 0)
    const totalRemaining = totalAmount - totalPaid
    return { total, draft, sent, partiallyPaid, paid, cancelled, totalAmount, totalPaid, totalRemaining }
  }, [filteredInvoices, appCurrency, paidByInvoice])

  // مسح جميع الفلاتر
  const clearFilters = () => {
    setFilterStatuses([])
    setFilterCustomers([])
    setFilterPaymentMethod("all")
    setFilterProducts([])
    setFilterShippingProviders([])
    setFilterEmployeeId("all")
    setDateFrom("")
    setDateTo("")
    setSearchQuery("")
  }

  const hasActiveFilters = filterStatuses.length > 0 || filterCustomers.length > 0 || filterPaymentMethod !== "all" || filterProducts.length > 0 || filterShippingProviders.length > 0 || filterEmployeeId !== "all" || dateFrom || dateTo || searchQuery

  // حساب عدد الفلاتر النشطة
  const activeFilterCount = [
    filterStatuses.length > 0,
    filterCustomers.length > 0,
    filterPaymentMethod !== "all",
    filterProducts.length > 0,
    filterShippingProviders.length > 0,
    filterEmployeeId !== "all",
    !!dateFrom,
    !!dateTo,
    !!searchQuery
  ].filter(Boolean).length

  const handleDelete = async (id: string) => {
    try {
      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const companyId = await getActiveCompanyId(supabase)

      // جلب بيانات الفاتورة مع أمر البيع المرتبط
      const { data: invoice } = await supabase
        .from("invoices")
        .select("id, invoice_number, subtotal, tax_amount, total_amount, paid_amount, status, shipping, sales_order_id")
        .eq("id", id)
        .single()

      if (!invoice || !companyId) {
        throw new Error("لم يتم العثور على الفاتورة أو الشركة")
      }

      // ===============================
      // 🔒 System Guard: منع حذف الفواتير التي لها حركات مخزون
      // ===============================
      const { data: inventoryTx } = await supabase
        .from("inventory_transactions")
        .select("id")
        .eq("reference_id", id)
        .limit(1)

      if (inventoryTx && inventoryTx.length > 0) {
        // الفاتورة لها حركات مخزون - يجب إلغاؤها بدلاً من حذفها
        toast({
          variant: "destructive",
          title: appLang === 'en' ? "Cannot Delete" : "لا يمكن الحذف",
          description: appLang === 'en'
            ? "This invoice has inventory transactions. Use 'Cancel' instead of delete to maintain audit trail."
            : "هذه الفاتورة لها حركات مخزون. استخدم 'إلغاء' بدلاً من الحذف للحفاظ على سجل التدقيق.",
          duration: 5000,
        })
        return
      }

      // حفظ sales_order_id قبل الحذف لتحديث أمر البيع لاحقاً
      const linkedSalesOrderId = (invoice as any).sales_order_id

      // التحقق من وجود دفعات مرتبطة
      const { data: linkedPays } = await supabase
        .from("payments")
        .select("id, amount")
        .eq("invoice_id", id)

      const hasLinkedPayments = Array.isArray(linkedPays) && linkedPays.length > 0

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
            ? "This invoice has journal entries. Use 'Cancel' instead of delete to maintain audit trail."
            : "هذه الفاتورة لها قيود محاسبية. استخدم 'إلغاء' بدلاً من الحذف للحفاظ على سجل التدقيق.",
          duration: 5000,
        })
        return
      }

      // ===============================
      // 🔒 System Guard: منع حذف الفواتير التي لها دفعات
      // ===============================
      if (hasLinkedPayments) {
        toast({
          variant: "destructive",
          title: appLang === 'en' ? "Cannot Delete" : "لا يمكن الحذف",
          description: appLang === 'en'
            ? "This invoice has linked payments. Use 'Cancel' instead of delete."
            : "هذه الفاتورة لها دفعات مرتبطة. استخدم 'إلغاء' بدلاً من الحذف.",
          duration: 5000,
        })
        return
      }

      // ===============================
      // ✅ الفاتورة مسودة بدون حركات - يمكن حذفها
      // ===============================
      // حذف بنود الفاتورة
      await supabase.from("invoice_items").delete().eq("invoice_id", id)

      // حذف الفاتورة
      const { error } = await supabase.from("invoices").delete().eq("id", id)
      if (error) throw error

      // تحديث أمر البيع المرتبط (إن وجد)
      if (linkedSalesOrderId) {
        await supabase
          .from("sales_orders")
          .update({
            status: "draft",
            invoice_id: null
          })
          .eq("id", linkedSalesOrderId)
        console.log("✅ Reset linked sales order status:", linkedSalesOrderId)
      }

      await loadInvoices()
      toastDeleteSuccess(toast, appLang === 'en' ? "Invoice deleted" : "تم حذف الفاتورة")
    } catch (error) {
      console.error("Error deleting invoice:", error)
      toastDeleteError(toast, "الفاتورة")
    }
  }

  const requestDelete = (id: string) => {
    setPendingDeleteId(id)
    setConfirmOpen(true)
  }

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
      sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      partially_paid: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    }
    return colors[status] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
  }

  const getStatusLabel = (status: string) => {
    const labelsAr: Record<string, string> = { draft: "مسودة", sent: "مرسلة", partially_paid: "مدفوعة جزئياً", paid: "مدفوعة", cancelled: "ملغاة" }
    const labelsEn: Record<string, string> = { draft: "Draft", sent: "Sent", partially_paid: "Partially Paid", paid: "Paid", cancelled: "Cancelled" }
    return (appLang === 'en' ? labelsEn : labelsAr)[status] || status
  }

  const openSalesReturn = async (inv: Invoice, mode: "partial" | "full") => {
    try {
      console.log("🔍 openSalesReturn called:", { invoice: inv.invoice_number, mode, status: inv.status })
      setReturnMode(mode)
      setReturnInvoiceId(inv.id)
      setReturnInvoiceNumber(inv.invoice_number)

      // جلب بيانات الفاتورة الكاملة للعرض
      const { data: fullInvoice } = await supabase
        .from("invoices")
        .select("total_amount, paid_amount, returned_amount, status, customers(name)")
        .eq("id", inv.id)
        .single()

      const totalAmount = Number(fullInvoice?.total_amount || inv.total_amount || 0)
      const returnedAmount = Number((fullInvoice as any)?.returned_amount || 0)
      const netAmount = Math.max(totalAmount - returnedAmount, 0)

      setReturnInvoiceData({
        total_amount: totalAmount,
        paid_amount: Number(fullInvoice?.paid_amount || inv.paid_amount || 0),
        returned_amount: returnedAmount,
        net_amount: netAmount, // الصافي بعد المرتجعات
        status: String(fullInvoice?.status || inv.status || ""),
        customer_name: String((fullInvoice?.customers as any)?.name || inv.customers?.name || "")
      })

      // محاولة أولى: جلب البنود الأساسية فقط (بدون ربط)
      let items: any[] = []
      let prodMap: Record<string, { name: string; cost_price: number }> = {}

      try {
        // جلب بنود الفاتورة - مع الكمية المرتجعة
        const { data: baseItems, error: itemsError } = await supabase
          .from("invoice_items")
          .select("id, product_id, quantity, unit_price, tax_rate, discount_percent, returned_quantity, line_total")
          .eq("invoice_id", inv.id)

        if (itemsError) {
          console.log("Error fetching invoice_items:", itemsError.message)
        }

        const validItems = Array.isArray(baseItems) ? baseItems : []

        // جلب معلومات المنتجات منفصلاً
        const prodIds = Array.from(new Set(validItems.map((it: any) => String(it.product_id || ""))).values()).filter(Boolean)
        if (prodIds.length > 0) {
          const { data: prods } = await supabase
            .from("products")
            .select("id, name, cost_price")
            .in("id", prodIds)
            ; (prods || []).forEach((p: any) => {
              prodMap[String(p.id)] = { name: String(p.name || ""), cost_price: Number(p.cost_price || 0) }
            })
        }

        items = validItems.map((it: any) => ({
          id: String(it.id),
          product_id: String(it.product_id),
          quantity: Number(it.quantity || 0),
          unit_price: Number(it.unit_price || 0),
          tax_rate: Number(it.tax_rate || 0),
          discount_percent: Number(it.discount_percent || 0),
          returned_quantity: Number(it.returned_quantity || 0),
          line_total: Number(it.line_total || 0),
          products: prodMap[String(it.product_id)] || { name: "", cost_price: 0 },
        }))
      } catch (e) {
        console.log("Error in first attempt:", e)
      }
      if (!items || items.length === 0) {
        const { data: tx } = await supabase
          .from("inventory_transactions")
          .select("product_id, quantity_change, products(name, cost_price)")
          .eq("reference_id", inv.id)
          .eq("transaction_type", "sale")
        const txItems = Array.isArray(tx) ? tx : []
        items = txItems.map((t: any) => ({
          id: `${inv.id}-${String(t.product_id)}`,
          product_id: t.product_id,
          quantity: Math.abs(Number(t.quantity_change || 0)),
          unit_price: 0,
          tax_rate: 0,
          discount_percent: 0,
          line_total: 0,
          products: { name: String(t.products?.name || ""), cost_price: Number(t.products?.cost_price || 0) },
        }))
      }
      // حساب الكمية المتاحة للإرجاع = الكمية الأصلية - الكمية المرتجعة سابقاً
      const rows = (items || []).map((it: any) => {
        const originalQty = Number(it.quantity || 0)
        const returnedQty = Number(it.returned_quantity || 0)
        const availableQty = Math.max(0, originalQty - returnedQty)
        return {
          id: String(it.id),
          product_id: String(it.product_id),
          name: String(((it.products || {}).name) || it.product_id || ""),
          quantity: originalQty,
          maxQty: availableQty, // الحد الأقصى = الكمية المتاحة للإرجاع
          qtyToReturn: mode === "full" ? availableQty : 0, // المرتجع الكامل = كل الكمية المتاحة
          cost_price: Number(((it.products || {}).cost_price) || 0),
          unit_price: Number(it.unit_price || 0),
          tax_rate: Number(it.tax_rate || 0),
          discount_percent: Number(it.discount_percent || 0),
          line_total: Number(it.line_total || 0),
          returned_quantity: returnedQty
        }
      }).filter(row => row.maxQty > 0) // فلترة البنود التي لا يوجد بها كمية متاحة للإرجاع
      console.log("✅ Return items prepared:", rows.length, "items")
      setReturnItems(rows)
      console.log("✅ About to open return dialog...")
      setReturnOpen(true)
      console.log("✅ Return dialog opened! returnOpen should be true now")
    } catch (e) {
      console.error("❌ Error in openSalesReturn:", e)
    }
  }

  const submitSalesReturn = async () => {
    try {
      if (!returnInvoiceId) return
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const returnCompanyId = await getActiveCompanyId(supabase)
      if (!returnCompanyId) return

      // ===== التحقق من حالة الفاتورة قبل المرتجع (باستخدام الدالة الموحدة) =====
      const { canReturnInvoice, getInvoiceOperationError, requiresJournalEntries } = await import("@/lib/validation")

      const { data: invoiceCheck } = await supabase
        .from("invoices")
        .select("status, paid_amount, total_amount")
        .eq("id", returnInvoiceId)
        .single()

      // 🔒 التحقق الموحد: هل يُسمح بالمرتجع لهذه الحالة؟
      if (!canReturnInvoice(invoiceCheck?.status)) {
        const error = getInvoiceOperationError(invoiceCheck?.status, 'return', appLang as 'en' | 'ar')
        if (error) {
          toast({ title: error.title, description: error.description, variant: 'destructive' })
        }
        return
      }

      // ===== تحقق مهم: التأكد من وجود قيود محاسبية أصلية للفواتير المدفوعة فقط =====
      // الفواتير المرسلة (sent) لا تحتوي على قيود مالية - فقط حركات مخزون
      if (requiresJournalEntries(invoiceCheck?.status)) {
        const { data: existingInvoiceEntry } = await supabase
          .from("journal_entries")
          .select("id")
          .eq("reference_id", returnInvoiceId)
          .eq("reference_type", "invoice")
          .single()

        if (!existingInvoiceEntry) {
          toast({
            title: appLang === 'en' ? 'Cannot Return' : 'لا يمكن المرتجع',
            description: appLang === 'en' ? 'Cannot return paid invoice without journal entries.' : 'لا يمكن عمل مرتجع لفاتورة مدفوعة بدون قيود محاسبية.',
            variant: 'destructive'
          })
          return
        }
      }

      // استخدام مكتبة sales-returns للمعالجة
      const result = await processSalesReturn(supabase, {
        invoiceId: returnInvoiceId,
        invoiceNumber: returnInvoiceNumber,
        returnItems: returnItems.map(item => ({
          ...item,
          name: item.name || ''
        })),
        returnMode,
        companyId: returnCompanyId,
        userId: user?.id || '',
        lang: appLang as 'ar' | 'en'
      })

      if (!result.success) {
        toast({
          title: appLang === 'en' ? 'Return Failed' : 'فشل المرتجع',
          description: result.error || 'Unknown error',
          variant: 'destructive'
        })
        return
      }

      toast({
        title: appLang === 'en' ? 'Return Processed' : 'تم معالجة المرتجع',
        description: appLang === 'en'
          ? `Return processed successfully. Customer credit: ${result.customerCreditAmount || 0}`
          : `تم معالجة المرتجع بنجاح. رصيد العميل: ${result.customerCreditAmount || 0}`,
        variant: 'default'
      })

      setReturnOpen(false)
      loadInvoices()
    } catch (err: any) {
      console.error("❌ Error in sales return:", err)
      toast({
        title: appLang === 'en' ? 'Return Failed' : 'فشل المرتجع',
        description: `${appLang === 'en' ? 'Error:' : 'خطأ:'} ${err?.message || 'Unknown error'}`,
        variant: 'destructive'
      })
    }

      /* ===== الكود القديم (محفوظ للمرجع) =====
      const toReturn = returnItems.filter((r) => (r.qtyToReturn + (r.qtyCreditOnly || 0)) > 0)

      // ===== التحقق من الكميات المتاحة للمرتجع من حركات المخزون الفعلية =====
      for (const r of toReturn) {
        // التحقق من الكمية المباعة فعلياً من حركات المخزون
        const { data: actualSales } = await supabase
          .from("inventory_transactions")
          .select("quantity_change")
          .eq("reference_id", returnInvoiceId)
          .eq("product_id", r.product_id)
          .eq("transaction_type", "sale")

        const actualSoldQty = actualSales && actualSales.length > 0
          ? Math.abs(Number(actualSales[0].quantity_change || 0))
          : 0

        // التحقق من الكمية المرتجعة سابقاً
        const { data: previousReturns } = await supabase
          .from("inventory_transactions")
          .select("quantity_change")
          .eq("reference_id", returnInvoiceId)
          .eq("product_id", r.product_id)
          .eq("transaction_type", "sale_return")

        const previousReturnedQty = previousReturns && previousReturns.length > 0
          ? previousReturns.reduce((sum, tx) => sum + Number(tx.quantity_change || 0), 0)
          : 0

        const availableToReturn = actualSoldQty - previousReturnedQty

        // التحقق من عدم تجاوز الكمية المتاحة
        if (r.qtyToReturn > availableToReturn) {
          toast({
            title: appLang === 'en' ? 'Invalid Quantity' : 'كمية غير صالحة',
            description: appLang === 'en'
              ? `Product "${r.name}": Cannot return ${r.qtyToReturn} units. Only ${availableToReturn} units available for return.`
              : `المنتج "${r.name}": لا يمكن إرجاع ${r.qtyToReturn} وحدة. فقط ${availableToReturn} وحدة متاحة للإرجاع.`,
            variant: 'destructive'
          })
          return
        }
      }

      // تعديل كميات بنود الفاتورة بحسب المرتجع
      for (const r of toReturn) {
        try {
          const idStr = String(r.id || "")
          let curr: any = null

          // التحقق إذا كان الـ ID هو UUID حقيقي (36 حرف مع 4 شرطات)
          const isValidUUID = idStr.length === 36 && (idStr.match(/-/g) || []).length === 4

          if (isValidUUID) {
            // UUID حقيقي - جلب مباشر
            const { data } = await supabase
              .from("invoice_items")
              .select("*")
              .eq("id", idStr)
              .single()
            curr = data || null
          } else {
            // ID مركب (من inventory_transactions) - البحث بالمنتج والفاتورة
            const { data } = await supabase
              .from("invoice_items")
              .select("*")
              .eq("invoice_id", returnInvoiceId)
              .eq("product_id", r.product_id)
              .limit(1)
            curr = Array.isArray(data) ? (data[0] || null) : null
          }

          if (curr?.id) {
            const oldReturnedQty = Number(curr.returned_quantity || 0)
            const newReturnedQty = oldReturnedQty + Number(r.qtyToReturn || 0)

            // التحقق من عدم تجاوز الكمية الأصلية
            const originalQty = Number(curr.quantity || 0)
            const finalReturnedQty = Math.min(newReturnedQty, originalQty)

            // تحديث الكمية المرتجعة فقط مع الاحتفاظ بالكمية الأصلية
            const { error: updateErr } = await supabase
              .from("invoice_items")
              .update({ returned_quantity: finalReturnedQty })
              .eq("id", curr.id)
            if (updateErr) {
              console.error("Error updating returned_quantity:", updateErr)
            } else {
              console.log(`✅ Updated item ${curr.id}: returned_quantity = ${finalReturnedQty} (max: ${originalQty})`)
            }
          }
        } catch (err) {
          console.error("Error in return processing:", err)
        }
      }
      // 📌 النمط المحاسبي الصارم: لا COGS Reversal
      // COGS يُحسب عند الحاجة من cost_price × quantity المباع
      const returnedSubtotal = toReturn.reduce((s, r) => s + (r.unit_price * (1 - (r.discount_percent || 0) / 100)) * r.qtyToReturn, 0)
      const returnedTax = toReturn.reduce((s, r) => s + (((r.unit_price * (1 - (r.discount_percent || 0) / 100)) * r.qtyToReturn) * (r.tax_rate || 0) / 100), 0)
      const returnTotal = returnedSubtotal + returnedTax

      // ===== معالجة المرتجع حسب حالة الفاتورة =====
      // 
      // 📌 قواعد محاسبية صارمة للفواتير المرسلة (Sent):
      // ✅ المسموح فقط:
      //    - تحديث بيانات الفاتورة نفسها (الكميات، الصافي، الإجمالي)
      //    - تحديث ذمم العميل (AR) فقط - تخفيض المبلغ المستحق بدقة
      // ❌ ممنوع تمامًا:
      //    - عدم إنشاء أي قيد مالي جديد (Cash, COGS, Revenue إضافي)
      //    - عدم تعديل قيود Revenue أو VAT - فقط AR
      //    - عدم المساس بأي فواتير أو قيود أخرى غير الفاتورة محل المرتجع
      // 📌 المرتجع في حالة Sent هو تصحيح للفاتورة وليس حدثًا ماليًا مستقلًا
      //
      // 📌 للفواتير المدفوعة (paid/partially_paid): إنشاء قيود مالية كاملة

      // التحقق من حالة الفاتورة مرة أخرى
      const { data: invoiceStatusCheck } = await supabase
        .from("invoices")
        .select("status")
        .eq("id", returnInvoiceId)
        .single()

      const isSentInvoice = invoiceStatusCheck?.status === 'sent'

      // 📌 للفواتير المرسلة: سنقوم بتحديث AR بعد تحديث الفاتورة مباشرة
      // لضمان استخدام نفس القيم المحسوبة وتجنب مشاكل التزامن
      let arJournalEntryInfo: { entryId: string; lineId: string; accountId: string } | null = null

      if (isSentInvoice) {
        // ✅ للفواتير المرسلة: حفظ معلومات القيد المحاسبي لتحديثه لاحقاً
        // ❌ ممنوع: إنشاء قيود مالية جديدة (Revenue, VAT, Cash, COGS)
        // ❌ ممنوع: تعديل قيود Revenue أو VAT - فقط AR
        console.log(`📌 فاتورة مرسلة (Sent) - سيتم تحديث AR بعد تحديث الفاتورة`)

        // البحث عن القيد المحاسبي الأصلي للفاتورة (إن وجد)
        const { data: originalEntry } = await supabase
          .from("journal_entries")
          .select("id")
          .eq("company_id", returnCompanyId)
          .eq("reference_type", "invoice")
          .eq("reference_id", returnInvoiceId)
          .limit(1)
          .single()

        if (originalEntry && ar) {
          // جلب سطر AR فقط في القيد الأصلي
          const { data: originalLines } = await supabase
            .from("journal_entry_lines")
            .select("id")
            .eq("journal_entry_id", originalEntry.id)
            .eq("account_id", ar)
            .limit(1)

          if (originalLines && originalLines.length > 0) {
            arJournalEntryInfo = {
              entryId: originalEntry.id,
              lineId: originalLines[0].id,
              accountId: ar
            }
            console.log(`📌 تم العثور على قيد AR - سيتم تحديثه بعد تحديث الفاتورة`)
          }
        } else {
          console.log(`✅ لا يوجد قيد محاسبي أصلي - سيتم تحديث الفاتورة فقط`)
        }
      } else {
        // ===== للفواتير المدفوعة: إنشاء قيد مرتجع المبيعات =====
        // القيد المحاسبي الصحيح للمرتجع:
        // مدين: مردودات المبيعات (أو حساب الإيرادات)
        // مدين: ضريبة المبيعات المستحقة (إن وجدت)
        // دائن: رصيد العميل الدائن (وليس الذمم المدينة مباشرة)
        // لأن المبلغ يُضاف لرصيد العميل ولا يُرد نقداً مباشرة
        if (revenue && returnTotal > 0) {
          const { data: entry2 } = await supabase
            .from("journal_entries")
            .insert({
              company_id: returnCompanyId,
              reference_type: "sales_return",
              reference_id: returnInvoiceId,
              entry_date: new Date().toISOString().slice(0, 10),
              description: `مرتجع مبيعات للفاتورة ${returnInvoiceNumber}${returnMode === "partial" ? " (جزئي)" : " (كامل)"}`
            })
            .select()
            .single()
          const jid = entry2?.id ? String(entry2.id) : null
          if (jid) {
            const lines: any[] = [
              { journal_entry_id: jid, account_id: revenue, debit_amount: returnedSubtotal, credit_amount: 0, description: "مردودات المبيعات" },
            ]
            if (vatPayable && returnedTax > 0) {
              lines.push({ journal_entry_id: jid, account_id: vatPayable, debit_amount: returnedTax, credit_amount: 0, description: "عكس ضريبة المبيعات المستحقة" })
            }
            // المبلغ المرتجع يُضاف لرصيد العميل الدائن (customer credit) وليس للذمم المدينة
            // هذا يعني أن العميل لديه رصيد دائن يمكن صرفه أو استخدامه لاحقاً
            const creditAccount = customerCredit || ar
            lines.push({ journal_entry_id: jid, account_id: creditAccount, debit_amount: 0, credit_amount: returnTotal, description: "رصيد دائن للعميل من المرتجع" })
            await supabase.from("journal_entry_lines").insert(lines)
          }
        }
      }

      // ===== حركات المخزون - إضافة الكميات المرتجعة للمخزون =====
      if (toReturn.length > 0) {
        // ===== تحقق مهم: التأكد من وجود حركات بيع أصلية قبل إنشاء المرتجع =====
        const productIds = toReturn.filter(r => r.product_id).map(r => r.product_id)
        if (productIds.length > 0) {
          const { data: existingSales } = await supabase
            .from("inventory_transactions")
            .select("product_id, quantity_change")
            .eq("reference_id", returnInvoiceId)
            .eq("transaction_type", "sale")
            .in("product_id", productIds)

          const salesByProduct = new Map((existingSales || []).map((s: any) => [s.product_id, Math.abs(s.quantity_change)]))
          const missingProducts = productIds.filter(pid => !salesByProduct.has(pid))

          if (missingProducts.length > 0) {
            console.warn("⚠️ Missing sale transactions detected in invoices page, creating them now...")
            const missingTx = toReturn
              .filter(r => r.product_id && missingProducts.includes(r.product_id))
              .map(r => ({
                company_id: returnCompanyId,
                product_id: r.product_id,
                transaction_type: "sale",
                quantity_change: -Number(r.quantity || r.qtyToReturn),
                reference_id: returnInvoiceId,
                notes: `بيع ${returnInvoiceNumber} (إصلاح تلقائي)`,
              }))
            if (missingTx.length > 0) {
              await supabase.from("inventory_transactions").insert(missingTx)
              console.log("✅ Created missing sale transactions:", missingTx.length)
            }
          }
        }

        // 📌 النمط المحاسبي الصارم: حركات المخزون مستقلة عن القيود
        const invTx = toReturn.map((r) => ({
          company_id: returnCompanyId,
          product_id: r.product_id,
          transaction_type: "sale_return", // نوع العملية: مرتجع مبيعات (stock in)
          quantity_change: r.qtyToReturn, // كمية موجبة لأنها تدخل المخزون
          reference_id: returnInvoiceId,
          journal_entry_id: null, // 📌 لا ربط بقيد COGS
          notes: returnMode === "partial" ? "مرتجع جزئي للفاتورة" : "مرتجع كامل للفاتورة",
          branch_id: null, // TODO: Get from invoice
          cost_center_id: null, // TODO: Get from invoice
          warehouse_id: null, // TODO: Get from invoice
        }))
        await supabase.from("inventory_transactions").upsert(invTx, { onConflict: "journal_entry_id,product_id,transaction_type" })
        // ملاحظة: لا حاجة لتحديث products.quantity_on_hand يدوياً
        // لأن الـ Database Trigger (trg_apply_inventory_insert) يفعل ذلك تلقائياً
      }

      // ===== تحديث الفاتورة الأصلية =====
      try {
        const { data: invRow } = await supabase
          .from("invoices")
          .select("customer_id, invoice_number, subtotal, tax_amount, total_amount, paid_amount, status, returned_amount")
          .eq("id", returnInvoiceId)
          .single()
        if (invRow) {
          const oldSubtotal = Number(invRow.subtotal || 0)
          const oldTax = Number(invRow.tax_amount || 0)
          const oldTotal = Number(invRow.total_amount || 0)
          const oldPaid = Number(invRow.paid_amount || 0)
          const oldReturned = Number(invRow.returned_amount || 0)

          // حساب القيم الجديدة
          const newSubtotal = Math.max(oldSubtotal - returnedSubtotal, 0)
          const newTax = Math.max(oldTax - returnedTax, 0)
          const newTotal = Math.max(oldTotal - returnTotal, 0)
          const newReturned = oldReturned + returnTotal

          // تحديد حالة المرتجع
          const returnStatus = newTotal === 0 ? "full" : "partial"

          // ===== معالجة المدفوعات حسب القواعد الجديدة =====
          // حساب نسبة المرتجع من الإجمالي الأصلي
          const returnRatio = oldTotal > 0 ? returnTotal / oldTotal : 0
          // حساب المبلغ المدفوع الذي يجب عكسه (نسبياً)
          const paidToReverse = Math.min(oldPaid * returnRatio, returnTotal)
          // المبلغ المدفوع الجديد بعد العكس
          const newPaid = Math.max(0, oldPaid - paidToReverse)
          // رصيد العميل الدائن = المدفوع الذي تم عكسه
          const customerCreditAmount = paidToReverse

          // تحديد حالة الفاتورة
          let newStatus: string = invRow.status
          if (newTotal === 0) newStatus = "fully_returned"
          else if (returnStatus === "partial") newStatus = "partially_returned"
          else if (newPaid >= newTotal) newStatus = "paid"
          else if (newPaid > 0) newStatus = "partially_paid"
          else newStatus = "sent"

          // 📌 تحديث الفاتورة: استخدام RPC للفواتير المدفوعة، تحديث مباشر للمرسلة
          let invoiceUpdateError: any = null

          if (isSentInvoice) {
            // للفواتير المرسلة (sent) بدون قيود محاسبية: تحديث مباشر لجميع الحقول
            // جلب الملاحظات الحالية أولاً
            const { data: currentInvoice } = await supabase
              .from("invoices")
              .select("notes")
              .eq("id", returnInvoiceId)
              .single()
            
            const currentNotes = currentInvoice?.notes || ''
            const newNote = `\n[${new Date().toISOString().slice(0, 10)}] مرتجع ${returnMode === 'full' ? 'كامل' : 'جزئي'}: ${returnTotal.toFixed(2)}`
            const updatedNotes = currentNotes + newNote

            const updateData: any = {
              subtotal: newSubtotal,
              tax_amount: newTax,
              total_amount: newTotal,
              paid_amount: newPaid,
              returned_amount: newReturned,
              return_status: returnStatus,
              status: newStatus,
              notes: updatedNotes
            }

            const { error } = await supabase
              .from("invoices")
              .update(updateData)
              .eq("id", returnInvoiceId)

            invoiceUpdateError = error
          } else {
            // للفواتير المدفوعة: استخدام RPC function لتجاوز قيد القيود المحاسبية
            const noteText = `[${new Date().toISOString().slice(0, 10)}] مرتجع ${returnMode === 'full' ? 'كامل' : 'جزئي'}: ${returnTotal.toFixed(2)}`

            const { data: rpcResult, error } = await supabase.rpc('update_invoice_after_return', {
              p_invoice_id: returnInvoiceId,
              p_returned_amount: newReturned,
              p_return_status: returnStatus,
              p_new_status: newStatus,
              p_notes: noteText
            })

            if (error) {
              invoiceUpdateError = error
            } else if (rpcResult && !rpcResult.success) {
              invoiceUpdateError = { message: rpcResult.error }
            }
          }

          if (invoiceUpdateError) {
            console.error("❌ Failed to update invoice after return:", invoiceUpdateError)
            throw new Error(`فشل تحديث الفاتورة: ${invoiceUpdateError.message}`)
          }
          console.log("✅ Invoice updated successfully:", { returnInvoiceId, newReturned, returnStatus, newStatus })

          // ===== تحديث AR journal entry للفواتير المرسلة (بعد تحديث الفاتورة مباشرة) =====
          // 📌 Bug Fix: نقل تحديث AR هنا لضمان استخدام نفس القيم المحسوبة وتجنب مشاكل التزامن
          if (isSentInvoice && arJournalEntryInfo) {
            // استخدام newTotal المحسوب من نفس البيانات المستخدمة لتحديث الفاتورة
            // هذا يضمن التطابق بين AR debit amount و invoice total_amount
            const { error: arUpdateError } = await supabase
              .from("journal_entry_lines")
              .update({
                debit_amount: newTotal, // نفس القيمة المستخدمة في invoice.total_amount
                credit_amount: 0,
                description: `ذمم مدينة - ${invRow.invoice_number}${appLang === 'en' ? ' (adjusted for return)' : ' (معدل للمرتجع)'}`
              })
              .eq("id", arJournalEntryInfo.lineId)

            if (arUpdateError) {
              console.error("❌ Failed to update AR journal entry line:", arUpdateError)
              // لا نرمي خطأ هنا لأن الفاتورة تم تحديثها بالفعل
              // لكن نسجل الخطأ بوضوح
              throw new Error(
                appLang === 'en'
                  ? `Invoice updated but AR journal entry update failed: ${arUpdateError.message}. Please fix manually.`
                  : `تم تحديث الفاتورة لكن فشل تحديث قيد AR: ${arUpdateError.message}. يرجى الإصلاح يدوياً.`
              )
            }
            console.log(`✅ تم تحديث AR journal entry line للفاتورة المرسلة (${newTotal})`)
          }

          // ===== إنشاء مستند مرتجع منفصل (Sales Return) =====
          try {
            const returnNumber = `SR-${Date.now().toString().slice(-8)}`
            // 📌 النمط المحاسبي الصارم: لا ربط بقيد COGS
            const { data: salesReturn } = await supabase.from("sales_returns").insert({
              company_id: returnCompanyId,
              customer_id: invRow.customer_id,
              invoice_id: returnInvoiceId,
              return_number: returnNumber,
              return_date: new Date().toISOString().slice(0, 10),
              subtotal: returnedSubtotal,
              tax_amount: returnedTax,
              total_amount: returnTotal,
              refund_amount: customerCreditAmount,
              refund_method: customerCreditAmount > 0 ? "credit_note" : "none",
              status: "completed",
              reason: returnMode === "full" ? "مرتجع كامل" : "مرتجع جزئي",
              notes: `مرتجع للفاتورة ${invRow.invoice_number}`,
              journal_entry_id: null // 📌 لا ربط بقيد COGS
            }).select().single()

            // إنشاء بنود المرتجع
            if (salesReturn?.id) {
              const returnItemsData = toReturn.map(r => ({
                sales_return_id: salesReturn.id,
                product_id: r.product_id,
                description: r.name,
                quantity: r.qtyToReturn,
                unit_price: r.unit_price,
                tax_rate: r.tax_rate,
                discount_percent: r.discount_percent,
                line_total: r.qtyToReturn * r.unit_price * (1 - (r.discount_percent || 0) / 100)
              }))
              await supabase.from("sales_return_items").insert(returnItemsData)
            }
            console.log("✅ Sales return document created:", returnNumber)
          } catch (e) {
            console.log("sales_returns table may not exist:", e)
          }

          // ===== إضافة رصيد دائن للعميل (Customer Credit) =====
          if (customerCreditAmount > 0 && invRow.customer_id) {
            // 1. إنشاء سجل رصيد العميل في جدول customer_credits
            try {
              const { error: creditError } = await supabase.from("customer_credits").insert({
                company_id: returnCompanyId,
                customer_id: invRow.customer_id,
                credit_number: `CR-${Date.now()}`,
                credit_date: new Date().toISOString().slice(0, 10),
                amount: customerCreditAmount,
                used_amount: 0,
                reference_type: "invoice_return",
                reference_id: returnInvoiceId,
                status: "active",
                notes: `رصيد دائن من مرتجع الفاتورة ${invRow.invoice_number}`
              })
              if (creditError) {
                console.log("Error inserting customer credit:", creditError.message)
              } else {
                console.log("✅ Customer credit created:", customerCreditAmount)
              }
            } catch (e) {
              console.log("customer_credits table may not exist")
            }

            // ملاحظة: عند استخدام طريقة credit_note، لا نحتاج قيد عكس المدفوعات
            // لأن العميل لم يسترد المال نقداً، فقط حصل على رصيد دائن
            // قيد عكس المدفوعات يُنشأ فقط عند طريقة cash أو bank (رد نقدي فعلي)
            // القيد الذي تم إنشاؤه في قيد المرتجع (sales_return) يكفي:
            // مدين: المبيعات (تقليل الإيراد)
            // دائن: سلف من العملاء (رصيد دائن للعميل)

            // 3. تحديث سجلات المدفوعات الأصلية (وضع علامة عليها)
            try {
              const { data: originalPayments } = await supabase
                .from("payments")
                .select("id, amount")
                .eq("invoice_id", returnInvoiceId)
                .order("payment_date", { ascending: false })

              if (originalPayments && originalPayments.length > 0 && returnMode === "full") {
                // في المرتجع الكامل: وضع علامة على جميع المدفوعات
                for (const pmt of originalPayments) {
                  // جلب الملاحظات الحالية أولاً
                  const { data: currentPayment } = await supabase
                    .from("payments")
                    .select("notes")
                    .eq("id", pmt.id)
                    .single()
                  
                  const currentNotes = currentPayment?.notes || ''
                  const updatedNotes = currentNotes + ' [تم عكسها - مرتجع كامل]'
                  
                  await supabase.from("payments").update({
                    notes: updatedNotes
                  }).eq("id", pmt.id)
                }
              }
            } catch { }
          }
        }
      } catch { }

      // ===== تحديث أمر البيع المرتبط (إن وجد) =====
      try {
        const { data: invWithSO } = await supabase
          .from("invoices")
          .select("sales_order_id, return_status")
          .eq("id", returnInvoiceId)
          .single()

        if (invWithSO?.sales_order_id) {
          // تحديث حالة أمر البيع بناءً على حالة المرتجع
          const soNewStatus = invWithSO.return_status === "full" ? "returned" : "partially_returned"
          await supabase
            .from("sales_orders")
            .update({
              status: soNewStatus,
              updated_at: new Date().toISOString()
            })
            .eq("id", invWithSO.sales_order_id)
          console.log("✅ Updated linked sales order status:", invWithSO.sales_order_id, "->", soNewStatus)
        }
      } catch (soErr) {
        console.warn("Failed to update linked sales order:", soErr)
      }

      // رسالة نجاح
      toast({
        title: appLang === 'en' ? 'Return Completed' : 'تم المرتجع بنجاح',
        description: appLang === 'en'
          ? `${returnMode === 'full' ? 'Full' : 'Partial'} return processed. Inventory updated and customer credit created.`
          : `تم معالجة المرتجع ${returnMode === 'full' ? 'الكامل' : 'الجزئي'}. تم تحديث المخزون وإنشاء رصيد دائن للعميل.`,
      })

      setReturnOpen(false)
      setReturnItems([])
      await loadInvoices()
    ===== نهاية الكود القديم ===== */
  }

  return (
    <>
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />

        {/* Main Content - تحسين للهاتف */}
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <ListErrorBoundary listType="invoices" lang={appLang}>
            <div className="space-y-4 sm:space-y-6 max-w-full">
              <CompanyHeader />
              {/* رأس الصفحة - تحسين للهاتف */}
              {/* ✅ Unified Page Header */}
              <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
                <PageHeaderList
                  title={appLang === 'en' ? 'Sales Invoices' : 'الفواتير'}
                  description={appLang === 'en' ? 'Manage invoices' : 'إدارة فواتيرك'}
                  icon={FileText}
                  createHref={permWrite ? "/invoices/new" : undefined}
                  createLabel={appLang === 'en' ? 'New' : 'جديدة'}
                  createDisabled={!permWrite}
                  createTitle={!permWrite ? (appLang === 'en' ? 'No permission to create invoices' : 'لا توجد صلاحية لإنشاء فواتير') : undefined}
                  lang={appLang}
                />
              </div>

              {/* بطاقات الإحصائيات المحسّنة */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
                <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                      <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Total' : 'الإجمالي'}</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                      <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Draft' : 'مسودة'}</p>
                      <p className="text-xl font-bold text-yellow-600">{stats.draft}</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Sent' : 'مُرسلة'}</p>
                      <p className="text-xl font-bold text-blue-600">{stats.sent}</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                      <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Paid' : 'مدفوعة'}</p>
                      <p className="text-xl font-bold text-green-600">{stats.paid}</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                      <CreditCard className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Total Amount' : 'إجمالي المبلغ'}</p>
                      <p className="text-lg font-bold text-purple-600">{currencySymbol}{stats.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 0 })}</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${stats.totalRemaining > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                      <DollarSign className={`h-5 w-5 ${stats.totalRemaining > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Remaining' : 'المتبقي'}</p>
                      <p className={`text-lg font-bold ${stats.totalRemaining > 0 ? 'text-red-600' : 'text-green-600'}`}>{currencySymbol}{stats.totalRemaining.toLocaleString('en-US', { minimumFractionDigits: 0 })}</p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* قسم الفلترة المتقدم */}
              <FilterContainer
                title={appLang === 'en' ? 'Filters' : 'الفلاتر'}
                activeCount={activeFilterCount}
                onClear={clearFilters}
                defaultOpen={false}
              >
                <div className="space-y-4">
                  {/* فلتر الموظفين - صف منفصل أعلى الفلاتر - يظهر فقط للمديرين */}
                  {canViewAllInvoices && employees.length > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <UserCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        {appLang === 'en' ? 'Filter by Employee:' : 'فلترة حسب الموظف:'}
                      </span>
                      <Select
                        value={filterEmployeeId}
                        onValueChange={(value) => setFilterEmployeeId(value)}
                      >
                        <SelectTrigger className="w-[220px] h-9 bg-white dark:bg-slate-800">
                          <SelectValue placeholder={appLang === 'en' ? 'All Employees' : 'جميع الموظفين'} />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="p-2 sticky top-0 bg-white dark:bg-slate-950 z-10 border-b">
                            <Input
                              value={employeeSearchQuery}
                              onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                              placeholder={appLang === 'en' ? 'Search employees...' : 'بحث في الموظفين...'}
                              className="text-sm h-8"
                              autoComplete="off"
                            />
                          </div>
                          <SelectItem value="all">
                            {appLang === 'en' ? '👥 All Employees' : '👥 جميع الموظفين'}
                          </SelectItem>
                          {employees
                            .filter(emp => {
                              if (!employeeSearchQuery.trim()) return true
                              const q = employeeSearchQuery.toLowerCase()
                              return (
                                emp.display_name.toLowerCase().includes(q) ||
                                (emp.email || '').toLowerCase().includes(q) ||
                                emp.role.toLowerCase().includes(q)
                              )
                            })
                            .map((emp) => (
                              <SelectItem key={emp.user_id} value={emp.user_id}>
                                👤 {emp.display_name} <span className="text-xs text-gray-400">({emp.role})</span>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {filterEmployeeId !== "all" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFilterEmployeeId("all")}
                          className="h-8 px-3 text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                        >
                          <X className="w-4 h-4 mr-1" />
                          {appLang === 'en' ? 'Clear' : 'مسح'}
                        </Button>
                      )}
                    </div>
                  )}

                  {/* البحث والفلاتر المتقدمة */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {/* حقل البحث */}
                    <div className="sm:col-span-2 lg:col-span-2">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder={appLang === 'en' ? 'Search by invoice #, customer name or phone...' : 'بحث برقم الفاتورة، اسم العميل أو الهاتف...'}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full h-10 px-4 pr-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:border-slate-700 text-sm"
                        />
                        {searchQuery && (
                          <button
                            onClick={() => setSearchQuery("")}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* فلتر الحالة - Multi-select */}
                    <MultiSelect
                      options={statusOptions}
                      selected={filterStatuses}
                      onChange={setFilterStatuses}
                      placeholder={appLang === 'en' ? 'All Statuses' : 'جميع الحالات'}
                      searchPlaceholder={appLang === 'en' ? 'Search status...' : 'بحث في الحالات...'}
                      emptyMessage={appLang === 'en' ? 'No status found' : 'لا توجد حالات'}
                      className="h-10 text-sm"
                    />

                    {/* فلتر العميل */}
                    <MultiSelect
                      options={customers.map((c) => ({ value: c.id, label: c.name }))}
                      selected={filterCustomers}
                      onChange={setFilterCustomers}
                      placeholder={appLang === 'en' ? 'All Customers' : 'جميع العملاء'}
                      searchPlaceholder={appLang === 'en' ? 'Search customers...' : 'بحث في العملاء...'}
                      emptyMessage={appLang === 'en' ? 'No customers found' : 'لا يوجد عملاء'}
                      className="h-10 text-sm"
                    />

                    {/* فلتر المنتجات */}
                    <MultiSelect
                      options={products.map((p) => ({ value: p.id, label: p.name }))}
                      selected={filterProducts}
                      onChange={setFilterProducts}
                      placeholder={appLang === 'en' ? 'Filter by Products' : 'فلترة بالمنتجات'}
                      searchPlaceholder={appLang === 'en' ? 'Search products...' : 'بحث في المنتجات...'}
                      emptyMessage={appLang === 'en' ? 'No products found' : 'لا توجد منتجات'}
                      className="h-10 text-sm"
                    />

                    {/* فلتر شركة الشحن */}
                    <MultiSelect
                      options={shippingProviders.map((p) => ({ value: p.id, label: p.provider_name }))}
                      selected={filterShippingProviders}
                      onChange={setFilterShippingProviders}
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
                        onChange={(e) => setDateFrom(e.target.value)}
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
                        onChange={(e) => setDateTo(e.target.value)}
                        className="h-10 text-sm"
                      />
                    </div>
                  </div>

                  {/* عرض عدد النتائج */}
                  {hasActiveFilters && (
                    <div className="flex justify-start items-center pt-2 border-t">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {appLang === 'en'
                          ? `Showing ${filteredInvoices.length} of ${invoices.length} invoices`
                          : `عرض ${filteredInvoices.length} من ${invoices.length} فاتورة`}
                      </span>
                    </div>
                  )}
                </div>
              </FilterContainer>

              {/* جدول الفواتير */}
              <Card className="dark:bg-slate-900 dark:border-slate-800">
                <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap pb-4">
                  <CardTitle>{appLang === 'en' ? 'Invoices List' : 'قائمة الفواتير'}</CardTitle>
                  {filteredInvoices.length > 0 && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {appLang === 'en'
                        ? `Total: ${currencySymbol}${filteredInvoices.reduce((sum, i) => sum + getDisplayAmount(i, 'total'), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                        : `الإجمالي: ${currencySymbol}${filteredInvoices.reduce((sum, i) => sum + getDisplayAmount(i, 'total'), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                      }
                    </span>
                  )}
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <LoadingState type="table" rows={8} />
                  ) : invoices.length === 0 ? (
                    <EmptyState
                      icon={FileText}
                      title={appLang === 'en' ? 'No invoices yet' : 'لا توجد فواتير بعد'}
                      description={appLang === 'en' ? 'Create your first invoice to get started' : 'أنشئ أول فاتورة للبدء'}
                      action={permWrite ? {
                        label: appLang === 'en' ? 'Create Invoice' : 'إنشاء فاتورة',
                        onClick: () => window.location.href = '/invoices/new',
                        icon: Plus
                      } : undefined}
                    />
                  ) : filteredInvoices.length === 0 ? (
                    <EmptyState
                      icon={AlertCircle}
                      title={appLang === 'en' ? 'No results found' : 'لا توجد نتائج'}
                      description={appLang === 'en' ? 'Try adjusting your filters or search query' : 'حاول تعديل الفلاتر أو كلمة البحث'}
                      action={{
                        label: appLang === 'en' ? 'Clear Filters' : 'مسح الفلاتر',
                        onClick: clearFilters
                      }}
                    />
                  ) : (
                    <>
                      <DataTable
                        columns={tableColumns}
                        data={paginatedInvoices}
                        keyField="id"
                        lang={appLang}
                        minWidth="min-w-[700px]"
                        emptyMessage={appLang === 'en' ? 'No invoices found' : 'لا توجد فواتير'}
                        footer={{
                          render: () => {
                            const totalInvoices = filteredInvoices.length
                            const totalAmount = filteredInvoices.reduce((sum, i) => sum + getDisplayAmount(i, 'total'), 0)
                            const totalPaid = filteredInvoices.reduce((sum, i) => sum + getDisplayAmount(i, 'paid'), 0)
                            const totalDue = totalAmount - totalPaid
                            
                            return (
                              <tr>
                                <td className="px-3 py-4 text-right" colSpan={tableColumns.length - 1}>
                                  <span className="text-gray-700 dark:text-gray-200">
                                    {appLang === 'en' ? 'Totals' : 'الإجماليات'} ({totalInvoices} {appLang === 'en' ? 'invoices' : 'فاتورة'})
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
                      {filteredInvoices.length > 0 && (
                        <DataPagination
                          currentPage={currentPage}
                          totalPages={totalPages}
                          totalItems={totalItems}
                          pageSize={pageSize}
                          onPageChange={goToPage}
                          onPageSizeChange={handlePageSizeChange}
                          lang={appLang}
                        />
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* ===== DIALOGS ===== */}

              {/* Dialog: Delete Confirmation */}
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{appLang === 'en' ? 'Delete Invoice' : 'حذف الفاتورة'}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {appLang === 'en'
                        ? 'Are you sure you want to delete this invoice? This action cannot be undone and will reverse all related accounting entries.'
                        : 'هل أنت متأكد من حذف هذه الفاتورة؟ هذا الإجراء لا يمكن التراجع عنه وسيتم عكس جميع القيود المحاسبية المرتبطة.'}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        if (pendingDeleteId) {
                          handleDelete(pendingDeleteId)
                          setConfirmOpen(false)
                          setPendingDeleteId(null)
                        }
                      }}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {appLang === 'en' ? 'Delete' : 'حذف'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Dialog: Sales Return */}
              <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
                <DialogContent dir={appLang === 'en' ? 'ltr' : 'rtl'} className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>
                      {appLang === 'en'
                        ? (returnMode === 'full' ? 'Full Sales Return' : 'Partial Sales Return')
                        : (returnMode === 'full' ? 'مرتجع مبيعات كامل' : 'مرتجع مبيعات جزئي')}
                    </DialogTitle>
                    <DialogDescription>
                      {appLang === 'en'
                        ? 'Process a return for this invoice. This will reverse revenue, tax, and receivables, and return inventory to stock.'
                        : 'معالجة مرتجع لهذه الفاتورة. سيتم عكس الإيراد والضريبة والذمم، وإرجاع المخزون للمستودع.'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    {/* Invoice Financial Summary */}
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-lg">
                          {appLang === 'en' ? 'Invoice' : 'الفاتورة'}: {returnInvoiceNumber}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Customer' : 'العميل'}:</span>
                          <span className="font-medium">{returnInvoiceData?.customer_name || '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Status' : 'الحالة'}:</span>
                          <span className="font-medium">{returnInvoiceData?.status || '—'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Original Total' : 'الإجمالي الأصلي'}:</span>
                          <span className="font-medium">{currencySymbol}{(returnInvoiceData?.total_amount || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Returned' : 'المرتجع'}:</span>
                          <span className="font-medium text-orange-600">-{currencySymbol}{(returnInvoiceData?.returned_amount || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1">
                          <span className="text-gray-700 dark:text-gray-300 font-semibold">{appLang === 'en' ? 'Net Amount' : 'الصافي'}:</span>
                          <span className="font-bold text-blue-600">{currencySymbol}{(returnInvoiceData?.net_amount || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1">
                          <span className="text-gray-700 dark:text-gray-300 font-semibold">{appLang === 'en' ? 'Paid' : 'المدفوع'}:</span>
                          <span className="font-bold text-green-600">{currencySymbol}{(returnInvoiceData?.paid_amount || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Return Items Table */}
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Available' : 'المتاح'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Return Qty' : 'كمية المرتجع'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Damaged' : 'تالفة'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                            <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {returnItems.map((item, idx) => (
                            <tr key={idx} className="border-t">
                              <td className="px-3 py-2">{item.name}</td>
                              <td className="px-3 py-2">{item.maxQty}</td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min="0"
                                  max={item.maxQty - (item.qtyCreditOnly || 0)}
                                  value={item.qtyToReturn}
                                  onChange={(e) => {
                                    const newQty = Math.min(Math.max(0, Number(e.target.value)), item.maxQty - (item.qtyCreditOnly || 0))
                                    setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, qtyToReturn: newQty } : it))
                                  }}
                                  className="w-20 px-2 py-1 border rounded text-center"
                                  title={appLang === 'en' ? 'Good condition (returns to stock)' : 'حالة جيدة (ترجع للمخزون)'}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min="0"
                                  max={item.maxQty - item.qtyToReturn}
                                  value={item.qtyCreditOnly || 0}
                                  onChange={(e) => {
                                    const newQty = Math.min(Math.max(0, Number(e.target.value)), item.maxQty - item.qtyToReturn)
                                    setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, qtyCreditOnly: newQty } : it))
                                  }}
                                  className="w-20 px-2 py-1 border rounded text-center bg-red-50 dark:bg-red-900/20"
                                  title={appLang === 'en' ? 'Damaged/Expired (credit only, no stock return)' : 'تالفة/منتهية (رصيد فقط، لا ترجع للمخزون)'}
                                />
                              </td>
                              <td className="px-3 py-2">{currencySymbol}{item.unit_price.toFixed(2)}</td>
                              <td className="px-3 py-2 font-medium">
                                {currencySymbol}{(item.unit_price * (item.qtyToReturn + (item.qtyCreditOnly || 0)) * (1 - (item.discount_percent || 0) / 100) * (1 + (item.tax_rate || 0) / 100)).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Return Total */}
                    <div className="space-y-2 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Good Condition (Stock Return)' : 'حالة جيدة (ترجع للمخزون)'}:</span>
                        <span className="font-medium text-green-600">
                          {returnItems.reduce((sum, item) => sum + item.qtyToReturn, 0)} {appLang === 'en' ? 'units' : 'وحدة'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Damaged (Credit Only)' : 'تالفة (رصيد فقط)'}:</span>
                        <span className="font-medium text-red-600">
                          {returnItems.reduce((sum, item) => sum + (item.qtyCreditOnly || 0), 0)} {appLang === 'en' ? 'units' : 'وحدة'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="font-semibold">{appLang === 'en' ? 'Return Total' : 'إجمالي المرتجع'}:</span>
                        <span className="text-xl font-bold text-orange-600">
                          {currencySymbol}{returnItems.reduce((sum, item) =>
                            sum + (item.unit_price * (item.qtyToReturn + (item.qtyCreditOnly || 0)) * (1 - (item.discount_percent || 0) / 100) * (1 + (item.tax_rate || 0) / 100)), 0
                          ).toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-orange-600">
                      {appLang === 'en'
                        ? 'This will reverse the revenue, tax, and receivables for the returned items, and return the inventory to stock.'
                        : 'سيتم عكس الإيراد والضريبة والذمم للأصناف المرتجعة، وإرجاع المخزون للمستودع.'}
                    </p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setReturnOpen(false)}>
                      {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                    </Button>
                    <Button
                      className="bg-orange-600 hover:bg-orange-700"
                      onClick={submitSalesReturn}
                      disabled={returnItems.filter(it => (it.qtyToReturn + (it.qtyCreditOnly || 0)) > 0).length === 0}
                    >
                      {appLang === 'en' ? 'Process Return' : 'معالجة المرتجع'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </ListErrorBoundary>
        </main>
      </div>
    </>
  )
}

