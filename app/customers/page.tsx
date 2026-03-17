"use client"

import type React from "react"
import { useState, useEffect, useMemo, useTransition, useCallback, useRef } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FilterContainer } from "@/components/ui/filter-container"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { Edit2, Trash2, Search, Users, UserCheck, X } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { AccountFinders } from "@/lib/utils"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { usePagination } from "@/lib/pagination"
import { DataPagination } from "@/components/data-pagination"
import { ListErrorBoundary } from "@/components/list-error-boundary"
import { CustomerRefundDialog } from "@/components/customers/customer-refund-dialog"
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog"
import { type UserContext, getRoleAccessLevel, getAccessFilter, validateRecordModification } from "@/lib/validation"
import { buildDataVisibilityFilter, applyDataVisibilityFilter } from "@/lib/data-visibility-control"
import { useBranchFilter } from "@/hooks/use-branch-filter"
import { BranchFilter } from "@/components/BranchFilter"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { CurrencyCell, StatusBadge } from "@/components/DataTableFormatters"
import { useRealtimeTable } from "@/hooks/use-realtime-table"

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
  email: string
  phone: string
  address?: string
  governorate?: string
  city: string
  country: string
  detailed_address?: string
  tax_id: string
  credit_limit: number
  payment_terms: string
  // 🔐 ERP Access Control fields
  created_by_user_id?: string | null
  branch_id?: string | null
  cost_center_id?: string | null
  // 🏢 Branch relation
  branches?: { name: string } | null
}

interface InvoiceRow {
  id: string
  invoice_number: string
  total_amount: number
  paid_amount: number
  status: string
}

interface SalesOrderRow {
  id: string
  order_number: string
  status: string
}

export default function CustomersPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  // 🚀 تحسين الأداء - استخدام useTransition للفلاتر
  const [isPending, startTransition] = useTransition()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  // تهيئة اللغة بعد hydration
  useEffect(() => {
    try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { }
  }, [])

  // صلاحيات المستخدم
  const [permWrite, setPermWrite] = useState(false)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)
  const [permWritePayments, setPermWritePayments] = useState(false) // صلاحية سند الصرف
  const [permissionsLoaded, setPermissionsLoaded] = useState(false)

  // 🔐 ERP Access Control - سياق المستخدم
  const [userContext, setUserContext] = useState<UserContext | null>(null)

  // 🔐 فلتر الفروع الموحد - يظهر فقط للأدوار المميزة (Owner/Admin/General Manager)
  const branchFilter = useBranchFilter()

  // معلومات المستخدم الحالي للفلترة حسب المنشئ
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>("")
  const [canViewAllCustomers, setCanViewAllCustomers] = useState(false) // المديرين يرون الكل

  // فلترة العملاء حسب الموظف (للمديرين فقط)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>("all")
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState<string>("")

  // فلترة العملاء حسب ارتباطهم بالفواتير
  const [filterInvoiceStatus, setFilterInvoiceStatus] = useState<string>("all")
  const [customersWithAnyInvoices, setCustomersWithAnyInvoices] = useState<Set<string>>(new Set())

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

  const [accounts, setAccounts] = useState<{ id: string; account_code: string; account_name: string; account_type: string }[]>([])
  const [balances, setBalances] = useState<Record<string, { advance: number; applied: number; available: number; credits?: number; disbursed?: number }>>({})
  // الذمم المدينة لكل عميل (المبالغ المستحقة من الفواتير)
  const [receivables, setReceivables] = useState<Record<string, number>>({})
  // تتبع العملاء الذين لديهم فواتير نشطة (تمنع الحذف والتعديل)
  const [customersWithActiveInvoices, setCustomersWithActiveInvoices] = useState<Set<string>>(new Set())
  // حالات صرف رصيد العميل الدائن
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundCustomerId, setRefundCustomerId] = useState<string>("")
  const [refundCustomerName, setRefundCustomerName] = useState<string>("")
  const [refundMaxAmount, setRefundMaxAmount] = useState<number>(0)
  const [refundAmount, setRefundAmount] = useState<number>(0)
  const [refundDate, setRefundDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [refundMethod, setRefundMethod] = useState<string>("cash")
  const [refundAccountId, setRefundAccountId] = useState<string>("")
  const [refundNotes, setRefundNotes] = useState<string>("")

  // Multi-currency support for refund
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [refundCurrency, setRefundCurrency] = useState<string>("EGP")
  const [refundExRate, setRefundExRate] = useState<{ rate: number; rateId: string | null; source: string }>({ rate: 1, rateId: null, source: 'same_currency' })
  const [companyId, setCompanyId] = useState<string | null>(null)

  // 🔐 قوائم الفروع ومراكز التكلفة (للأدوار المميزة - لنافذة صرف الرصيد)
  const [allBranches, setAllBranches] = useState<{ id: string; name: string; defaultCostCenterId?: string | null }[]>([])
  const [allCostCenters, setAllCostCenters] = useState<{ id: string; name: string; code?: string }[]>([])

  // Pagination state
  const [pageSize, setPageSize] = useState(10)

  // التحقق من الصلاحيات ومعرفة دور المستخدم
  useEffect(() => {
    const checkPerms = async () => {
      const [write, update, del, writePayments] = await Promise.all([
        canAction(supabase, "customers", "write"),
        canAction(supabase, "customers", "update"),
        canAction(supabase, "customers", "delete"),
        canAction(supabase, "payments", "write"), // صلاحية سند الصرف
      ])
      setPermWrite(write)
      setPermUpdate(update)
      setPermDelete(del)
      setPermWritePayments(writePayments)

      // الحصول على معلومات المستخدم الحالي ودوره
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
        const activeCompanyId = await getActiveCompanyId(supabase)
        if (activeCompanyId) {
          const { data: member } = await supabase
            .from("company_members")
            .select("role, branch_id, cost_center_id, warehouse_id")
            .eq("company_id", activeCompanyId)
            .eq("user_id", user.id)
            .maybeSingle()

          const role = member?.role || "staff"
          setCurrentUserRole(role)

          // 🔐 ERP Access Control - تعيين سياق المستخدم
          const context: UserContext = {
            user_id: user.id,
            company_id: activeCompanyId,
            branch_id: member?.branch_id || null,
            cost_center_id: member?.cost_center_id || null,
            warehouse_id: member?.warehouse_id || null,
            role: role
          }
          setUserContext(context)

          // استخدام دالة getRoleAccessLevel لتحديد مستوى الوصول
          const accessLevel = getRoleAccessLevel(role)
          // المديرين (owner, admin, manager) يرون جميع العملاء أو عملاء الفرع
          const canViewAll = accessLevel === 'all' || accessLevel === 'company' || accessLevel === 'branch'
          setCanViewAllCustomers(canViewAll)

          // تحميل قائمة الموظفين للفلترة (للمديرين فقط)
          if (canViewAll) {
            const { data: members } = await supabase
              .from("company_members")
              .select("user_id, role, branch_id")
              .eq("company_id", activeCompanyId)

            // إذا كان المستخدم مدير فرع، يرى فقط موظفي فرعه
            let filteredMembers = members || []
            if (accessLevel === 'branch' && member?.branch_id) {
              filteredMembers = filteredMembers.filter((m: any) => m.branch_id === member.branch_id)
            }

            if (filteredMembers.length > 0) {
              // جلب أسماء الموظفين من user_profiles باستخدام user_id
              const userIds = filteredMembers.map((m: { user_id: string }) => m.user_id)
              const { data: profiles } = await supabase
                .from("user_profiles")
                .select("user_id, display_name, username")
                .in("user_id", userIds)

              const profileMap = new Map((profiles || []).map((p: { user_id: string; display_name?: string; username?: string }) => [p.user_id, p]))

              const employeesList: Employee[] = filteredMembers.map((m: { user_id: string; role: string }) => {
                const profile = profileMap.get(m.user_id) as { user_id: string; display_name?: string; username?: string } | undefined
                const roleLabels: Record<string, string> = {
                  owner: appLang === 'en' ? 'Owner' : 'مالك',
                  admin: appLang === 'en' ? 'Admin' : 'مدير',
                  manager: appLang === 'en' ? 'Manager' : 'مدير فرع',
                  supervisor: appLang === 'en' ? 'Supervisor' : 'مشرف',
                  staff: appLang === 'en' ? 'Staff' : 'موظف',
                  accountant: appLang === 'en' ? 'Accountant' : 'محاسب',
                  sales: appLang === 'en' ? 'Sales' : 'مبيعات',
                  inventory: appLang === 'en' ? 'Inventory' : 'مخزون',
                  viewer: appLang === 'en' ? 'Viewer' : 'مشاهد'
                }
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

          // 🔐 تحميل الفروع ومراكز التكلفة (للأدوار المميزة فقط)
          const PRIV_ROLES = ['owner', 'admin', 'general_manager']
          if (PRIV_ROLES.includes(role.toLowerCase())) {
            // تحميل الفروع (branch_name هو اسم العمود الصحيح + default_cost_center_id للربط التلقائي)
            const { data: branchesData } = await supabase
              .from("branches")
              .select("id, branch_name, default_cost_center_id")
              .eq("company_id", activeCompanyId)
              .eq("is_active", true)
              .order("branch_name")
            // تحويل branch_name إلى name للتوافق مع الواجهة
            setAllBranches((branchesData || []).map((b: { id: string; branch_name: string | null; default_cost_center_id: string | null }) => ({
              id: b.id,
              name: b.branch_name || '',
              defaultCostCenterId: b.default_cost_center_id
            })))

            // تحميل مراكز التكلفة (cost_center_name و cost_center_code هما اسما العمود الصحيحان)
            const { data: costCentersData } = await supabase
              .from("cost_centers")
              .select("id, cost_center_name, cost_center_code")
              .eq("company_id", activeCompanyId)
              .eq("is_active", true)
              .order("cost_center_name")
            // تحويل الأسماء للتوافق مع الواجهة
            setAllCostCenters((costCentersData || []).map((cc: { id: string; cost_center_name: string | null; cost_center_code: string | null }) => ({ id: cc.id, name: cc.cost_center_name || '', code: cc.cost_center_code || '' })))
          }
        }
      }

      setPermissionsLoaded(true)
    }
    checkPerms()
  }, [supabase])

  useEffect(() => {
    if (permissionsLoaded) {
      loadCustomers()
    }
  }, [permissionsLoaded, canViewAllCustomers, currentUserId, filterEmployeeId, userContext, branchFilter.selectedBranchId]) // إعادة تحميل البيانات عند تغيير الفرع المحدد

  // 🔄 الاستماع لتغيير الشركة وإعادة تحميل البيانات
  useEffect(() => {
    const handleCompanyChange = () => {
      loadCustomers();
    };
    window.addEventListener('company_updated', handleCompanyChange);
    return () => window.removeEventListener('company_updated', handleCompanyChange);
  }, []);

  const loadCustomers = async () => {
    try {
      setIsLoading(true)

      // استخدم الشركة الفعّالة (تعمل مع المالك والأعضاء المدعوين)
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) return

      // 🔐 ERP Access Control - استخدام getAccessFilter لتحديد التصفية
      const accessFilter = getAccessFilter(
        currentUserRole,
        currentUserId || '',
        userContext?.branch_id || null,
        userContext?.cost_center_id || null,
        filterEmployeeId !== 'all' ? filterEmployeeId : undefined
      )

      // 🔐 الأدوار المميزة التي يمكنها فلترة الفروع
      const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']
      const canFilterByBranch = PRIVILEGED_ROLES.includes(currentUserRole.toLowerCase())
      const selectedBranchId = branchFilter.getFilteredBranchId()

      // جلب العملاء - تصفية حسب صلاحيات المستخدم
      let allCustomers: Customer[] = [];

      // 🏢 استعلام موحد يشمل بيانات الفرع
      const customerSelectQuery = "*, branches(name)"

      // 🔐 تطبيق فلترة الفروع حسب الصلاحيات
      if (canFilterByBranch && selectedBranchId) {
        // المستخدم المميز اختار فرعاً معيناً من BranchFilter
        if (filterEmployeeId !== 'all') {
          // فلترة مزدوجة: فرع محدد + موظف محدد
          const { data: branchEmpCust } = await supabase.from("customers").select(customerSelectQuery)
            .eq("company_id", activeCompanyId)
            .eq("branch_id", selectedBranchId)
            .eq("created_by_user_id", filterEmployeeId);
          allCustomers = branchEmpCust || [];
        } else {
          const { data: branchCust } = await supabase.from("customers").select(customerSelectQuery).eq("company_id", activeCompanyId).eq("branch_id", selectedBranchId);
          allCustomers = branchCust || [];
        }
      } else if (filterEmployeeId !== 'all') {
        // 🎯 الأولوية: فلتر الموظف (للمديرين) - مع الحفاظ على عزل الفرع
        if (accessFilter.filterByBranch && accessFilter.branchId) {
          // مدير فرع: يرى عملاء الموظف المحدد داخل فرعه فقط
          const { data: empBranchCust } = await supabase.from("customers").select(customerSelectQuery)
            .eq("company_id", activeCompanyId)
            .eq("branch_id", accessFilter.branchId)
            .eq("created_by_user_id", filterEmployeeId);
          allCustomers = empBranchCust || [];
        } else {
          // owner/admin/general_manager: يرى عملاء الموظف المحدد على مستوى الشركة
          const { data: empCust } = await supabase.from("customers").select(customerSelectQuery)
            .eq("company_id", activeCompanyId)
            .eq("created_by_user_id", filterEmployeeId);
          allCustomers = empCust || [];
        }
      } else if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
        // موظف عادي: يرى فقط العملاء الذين أنشأهم
        const { data: ownCust } = await supabase.from("customers").select(customerSelectQuery).eq("company_id", activeCompanyId).eq("created_by_user_id", accessFilter.createdByUserId);
        allCustomers = ownCust || [];

        // جلب العملاء المشتركين (permission_sharing)
        if (currentUserId) {
          const { data: sharedPerms } = await supabase
            .from("permission_sharing")
            .select("grantor_user_id, resource_type")
            .eq("grantee_user_id", currentUserId)
            .eq("company_id", activeCompanyId)
            .eq("is_active", true)
            .or("resource_type.eq.all,resource_type.eq.customers");

          if (sharedPerms && sharedPerms.length > 0) {
            const grantorIds = sharedPerms.map((p: any) => p.grantor_user_id);
            const { data: sharedData } = await supabase.from("customers").select(customerSelectQuery).eq("company_id", activeCompanyId).in("created_by_user_id", grantorIds);
            const existingIds = new Set(allCustomers.map(c => c.id));
            (sharedData || []).forEach((c: Customer) => { if (!existingIds.has(c.id)) allCustomers.push(c); });
          }
        }
      } else if (accessFilter.filterByBranch && accessFilter.branchId) {
        // مدير: يرى عملاء الفرع
        const { data: branchCust } = await supabase.from("customers").select(customerSelectQuery).eq("company_id", activeCompanyId).eq("branch_id", accessFilter.branchId);
        allCustomers = branchCust || [];
      } else if (accessFilter.filterByCostCenter && accessFilter.costCenterId) {
        // مشرف: يرى عملاء مركز التكلفة
        const { data: ccCust } = await supabase.from("customers").select(customerSelectQuery).eq("company_id", activeCompanyId).eq("cost_center_id", accessFilter.costCenterId);
        allCustomers = ccCust || [];
      } else {
        // owner/admin: جميع العملاء
        const { data: allCust } = await supabase.from("customers").select(customerSelectQuery).eq("company_id", activeCompanyId);
        allCustomers = allCust || [];
      }

      setCustomers(allCustomers)

      // تم نقل setCustomers إلى بعد دمج العملاء المشتركين
      const { data: accs } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type")
        .eq("company_id", activeCompanyId)
      setAccounts((accs || []).filter((a: any) => (a.account_type || "").toLowerCase() === "asset"))

      const { data: pays } = await supabase
        .from("payments")
        .select("customer_id, amount, invoice_id")
        .eq("company_id", activeCompanyId)
        .not("customer_id", "is", null)
      const { data: apps } = await supabase
        .from("advance_applications")
        .select("customer_id, amount_applied")
        .eq("company_id", activeCompanyId)
      // ✅ جلب أرصدة العملاء الدائنة من المرتجعات (جميع الحالات لحساب المُصرَف أيضاً)
      const { data: customerCredits } = await supabase
        .from("customer_credits")
        .select("customer_id, amount, used_amount, status")
        .eq("company_id", activeCompanyId)

      const advMap: Record<string, number> = {}
        ; (pays || []).forEach((p: any) => {
          const cid = String(p.customer_id || "")
          if (!cid) return
          const amt = Number(p.amount || 0)
          if (!p.invoice_id) {
            advMap[cid] = (advMap[cid] || 0) + amt
          }
        })
      const appMap: Record<string, number> = {}
        ; (apps || []).forEach((a: any) => {
          const cid = String(a.customer_id || "")
          if (!cid) return
          const amt = Number(a.amount_applied || 0)
          appMap[cid] = (appMap[cid] || 0) + amt
        })
      // ✅ حساب أرصدة العملاء الدائنة المتاحة والمُصرَفة (من المرتجعات)
      const creditMap: Record<string, number> = {}
      const disbursedMap: Record<string, number> = {}
        ; (customerCredits || []).forEach((c: any) => {
          const cid = String(c.customer_id || "")
          if (!cid) return
          // المتاح: فقط من السجلات النشطة
          if (String(c.status || '') === 'active') {
            const available = Math.max(Number(c.amount || 0) - Number(c.used_amount || 0), 0)
            creditMap[cid] = (creditMap[cid] || 0) + available
          }
          // المُصرَف: من جميع السجلات
          const usedAmt = Number(c.used_amount || 0)
          if (usedAmt > 0) disbursedMap[cid] = (disbursedMap[cid] || 0) + usedAmt
        })

      const allIds = Array.from(new Set([...(allCustomers || []).map((c: any) => String(c.id || ""))]))
      const out: Record<string, { advance: number; applied: number; available: number; credits: number; disbursed: number }> = {}
      allIds.forEach((id) => {
        const adv = Number(advMap[id] || 0)
        const ap = Number(appMap[id] || 0)
        const credits = Number(creditMap[id] || 0)
        const disbursed = Number(disbursedMap[id] || 0)
        // الرصيد المتاح = السلف المتبقية + أرصدة المرتجعات
        out[id] = { advance: adv, applied: ap, available: Math.max(adv - ap, 0) + credits, credits, disbursed }
      })
      setBalances(out)

      // ===== 🔄 حساب الذمم المدينة من القيود المحاسبية (Zoho Books Pattern) =====
      // بدلاً من حساب الذمم من الفواتير مباشرة، نحسبها من حساب Accounts Receivable
      // هذا يشمل: قيود الفواتير (invoice) + قيود الدفعات والمرتجعات (invoice_payment, sales_return)
      const { data: arAccount } = await supabase
        .from("chart_of_accounts")
        .select("id")
        .eq("company_id", activeCompanyId)
        .eq("sub_type", "accounts_receivable")
        .eq("is_active", true)
        .limit(1)
        .single()

      const recMap: Record<string, number> = {}
      const activeCustomers = new Set<string>()
      const anyInvoiceCustomers = new Set<string>()

      if (arAccount) {
        // حساب رصيد كل عميل من القيود المحاسبية
        // الخطوة 1: جلب جميع الفواتير
        const { data: allInvoices } = await supabase
          .from("invoices")
          .select("id, customer_id, status")
          .eq("company_id", activeCompanyId)
          .neq("status", "draft")
          .neq("status", "cancelled")

          // تتبع العملاء والفواتير النشطة
          ; (allInvoices || []).forEach((inv: any) => {
            const cid = String(inv.customer_id || "")
            if (!cid) return

            anyInvoiceCustomers.add(cid)

            const status = (inv.status || "").toLowerCase()
            if (["sent", "partially_paid", "paid"].includes(status)) {
              activeCustomers.add(cid)
            }
          })

        // الخطوة 2: جلب جميع journal_entry_lines المرتبطة بحساب AR
        // من جميع القيود المرتبطة بالفواتير (invoice + invoice_payment + sales_return)
        const { data: allCustomerJournalLines, error: journalLinesError } = await supabase
          .from("journal_entry_lines")
          .select(`
            debit_amount,
            credit_amount,
            journal_entries!inner(
              reference_type,
              reference_id,
              is_deleted
            ),
            chart_of_accounts!inner(
              id,
              sub_type
            )
          `)
          .eq("chart_of_accounts.company_id", activeCompanyId)
          .eq("chart_of_accounts.id", arAccount.id)
          .in("journal_entries.reference_type", ["invoice", "invoice_payment", "sales_return"])

        if (journalLinesError) {
          console.error("Error fetching customer journal lines:", journalLinesError)
        } else if (allCustomerJournalLines) {
          // جمع جميع reference_ids للدفعات والمرتجعات
          const paymentRefIds = new Set<string>()
          const returnRefIds = new Set<string>()

          allCustomerJournalLines.forEach((line: any) => {
            if (line.journal_entries?.reference_type === "invoice_payment") {
              paymentRefIds.add(line.journal_entries.reference_id)
            } else if (line.journal_entries?.reference_type === "sales_return") {
              returnRefIds.add(line.journal_entries.reference_id)
            }
          })

          // جلب جميع payments دفعة واحدة
          const paymentIds = Array.from(paymentRefIds)
          let allPayments: any[] = []
          if (paymentIds.length > 0) {
            const { data = [] } = await supabase
              .from("payments")
              .select("id, invoice_id")
              .in("id", paymentIds)
            allPayments = data || []
          }

          // جلب جميع sales_returns دفعة واحدة مع customer_id
          const returnIds = Array.from(returnRefIds)
          let allReturns: any[] = []
          if (returnIds.length > 0) {
            const { data = [] } = await supabase
              .from("sales_returns")
              .select("id, invoice_id, customer_id")
              .in("id", returnIds)
            allReturns = data || []
          }

          // إنشاء خرائط للربط السريع
          const paymentToInvoiceMap: Record<string, string> = {}
          allPayments.forEach((p: any) => {
            paymentToInvoiceMap[p.id] = p.invoice_id
          })

          const returnToInvoiceMap: Record<string, string> = {}
          const returnToCustomerMap: Record<string, string> = {}
          allReturns.forEach((r: any) => {
            returnToInvoiceMap[r.id] = r.invoice_id
            // استخدام customer_id مباشرة من sales_return، أو من الفاتورة
            if (r.customer_id) {
              returnToCustomerMap[r.id] = r.customer_id
            } else if (r.invoice_id) {
              const invoice = allInvoices?.find((inv: any) => inv.id === r.invoice_id)
              if (invoice && invoice.customer_id) {
                returnToCustomerMap[r.id] = invoice.customer_id
              }
            }
          })

          const invoiceToCustomerMap: Record<string, string> = {}
            ; (allInvoices || []).forEach((inv: any) => {
              invoiceToCustomerMap[inv.id] = inv.customer_id
            })

          // حساب الرصيد لكل عميل
          allCustomerJournalLines.forEach((line: any) => {
            if (line.journal_entries?.is_deleted) return

            let customerId: string | null = null

            if (line.journal_entries?.reference_type === "invoice") {
              customerId = invoiceToCustomerMap[line.journal_entries.reference_id] || null
            } else if (line.journal_entries?.reference_type === "invoice_payment") {
              // أولاً: جرب من خلال جدول payments
              const invoiceId = paymentToInvoiceMap[line.journal_entries.reference_id]
              customerId = invoiceId ? (invoiceToCustomerMap[invoiceId] || null) : null
              // 🔧 إصلاح: إذا reference_id هو invoice.id مباشرة (ليس payment.id)
              if (!customerId) {
                customerId = invoiceToCustomerMap[line.journal_entries.reference_id] || null
              }
            } else if (line.journal_entries?.reference_type === "sales_return") {
              // محاولة الحصول على customer_id مباشرة من sales_return
              customerId = returnToCustomerMap[line.journal_entries.reference_id] || null
              // إذا لم يكن موجوداً، جرب من خلال الفاتورة المرتبطة بالمرتجع
              if (!customerId) {
                const invoiceId = returnToInvoiceMap[line.journal_entries.reference_id]
                customerId = invoiceId ? (invoiceToCustomerMap[invoiceId] || null) : null
              }
              // 🔧 إصلاح: إذا reference_id هو invoice.id مباشرة (ليس sales_return.id)
              if (!customerId) {
                customerId = invoiceToCustomerMap[line.journal_entries.reference_id] || null
              }
            }

            if (customerId) {
              const cid = String(customerId)
              // الذمم المدينة = المدين - الدائن
              const balance = Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
              recMap[cid] = (recMap[cid] || 0) + balance
            }
          })
        }
      } else {
        // Fallback: إذا لم يوجد حساب AR، استخدم الطريقة القديمة
        console.warn("⚠️ حساب Accounts Receivable غير موجود، استخدام الطريقة القديمة")
        const { data: allInvoicesData } = await supabase
          .from("invoices")
          .select("customer_id, total_amount, paid_amount, status")
          .eq("company_id", activeCompanyId)

          ; (allInvoicesData || []).forEach((inv: any) => {
            const cid = String(inv.customer_id || "")
            if (!cid) return
            const status = (inv.status || "").toLowerCase()

            anyInvoiceCustomers.add(cid)

            if (["sent", "partially_paid", "paid"].includes(status)) {
              activeCustomers.add(cid)
            }

            if (["sent", "partially_paid"].includes(status)) {
              const due = Math.max(Number(inv.total_amount || 0) - Number(inv.paid_amount || 0), 0)
              recMap[cid] = (recMap[cid] || 0) + due
            }
          })
      }

      setReceivables(recMap)
      setCustomersWithActiveInvoices(activeCustomers)
      setCustomersWithAnyInvoices(anyInvoiceCustomers)

      // Load currencies for multi-currency support
      setCompanyId(activeCompanyId)
      const curr = await getActiveCurrencies(supabase, activeCompanyId)
      if (curr.length > 0) setCurrencies(curr)
      setRefundCurrency(appCurrency)
    } catch (error) {
      // Silently handle loading errors
    } finally {
      setIsLoading(false)
    }
  }

  // 🔄 Realtime: تحديث قائمة العملاء تلقائياً عند أي تغيير
  const loadCustomersRef = useRef(loadCustomers)
  loadCustomersRef.current = loadCustomers

  const handleCustomersRealtimeEvent = useCallback(() => {
    console.log('🔄 [Customers] Realtime event received, refreshing customers list...')
    loadCustomersRef.current()
  }, [])

  useRealtimeTable({
    table: 'customers',
    enabled: true,
    onInsert: handleCustomersRealtimeEvent,
    onUpdate: handleCustomersRealtimeEvent,
    onDelete: handleCustomersRealtimeEvent,
  })

  // Update refund exchange rate when currency changes
  useEffect(() => {
    const updateRefundRate = async () => {
      if (refundCurrency === appCurrency) {
        setRefundExRate({ rate: 1, rateId: null, source: 'same_currency' })
      } else if (companyId) {
        const result = await getExchangeRate(supabase, refundCurrency, appCurrency, undefined, companyId)
        setRefundExRate({ rate: result.rate, rateId: result.rateId || null, source: result.source })
      }
    }
    updateRefundRate()
  }, [refundCurrency, companyId, appCurrency])







  const handleEdit = (customer: Customer) => {
    setEditingId(customer.id)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    // التحقق من صلاحية الحذف
    if (!permDelete) {
      toast({
        title: appLang === 'en' ? 'Permission Denied' : 'غير مصرح',
        description: appLang === 'en' ? 'You do not have permission to delete customers' : 'ليس لديك صلاحية حذف العملاء',
        variant: 'destructive'
      })
      return
    }

    // 🔐 ERP Access Control - التحقق من صلاحية حذف هذا العميل بالذات
    const customer = customers.find(c => c.id === id)
    if (customer && currentUserId) {
      const modResult = validateRecordModification(
        currentUserRole,
        currentUserId,
        customer.created_by_user_id || null,
        userContext?.branch_id || null,
        customer.branch_id || null,
        'delete',
        appLang
      )
      if (!modResult.isValid) {
        toast({
          title: modResult.error?.title || (appLang === 'en' ? 'Access Denied' : 'تم رفض الوصول'),
          description: modResult.error?.description || '',
          variant: 'destructive'
        })
        return
      }
    }

    try {
      // الحصول على company_id الفعّال
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) {
        throw new Error(appLang === 'en' ? 'No active company' : 'لا توجد شركة نشطة')
      }

      // تأكيد الحذف
      const confirmMessage = appLang === 'en'
        ? 'Are you sure you want to delete this customer?'
        : 'هل أنت متأكد من حذف هذا العميل؟'
      if (!window.confirm(confirmMessage)) {
        return
      }

      // استخدام API الآمن للحذف مع التحقق من جميع الشروط
      const response = await fetch('/api/customers/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: id, companyId: activeCompanyId })
      })

      const result = await response.json()

      if (!result.success) {
        // عرض رسالة الخطأ المناسبة حسب السبب
        const errorMessage = appLang === 'en' ? result.error : result.error_ar

        toast({
          title: appLang === 'en' ? 'Cannot Delete Customer' : 'لا يمكن حذف العميل',
          description: errorMessage,
          variant: 'destructive',
          duration: 8000 // مدة أطول للرسائل المهمة
        })
        return
      }

      toastActionSuccess(toast, appLang === 'en' ? 'Delete' : 'الحذف', appLang === 'en' ? 'Customer' : 'العميل')
      loadCustomers()
    } catch (error: any) {
      const errorMessage = error?.message || error?.details || String(error)
      toastActionError(toast, appLang === 'en' ? 'Delete' : 'الحذف', appLang === 'en' ? 'Customer' : 'العميل', errorMessage, appLang)
    }
  }

  // تحسين الأداء: استخدام useMemo لتجنب إعادة حساب الفلترة في كل render
  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => {
      // فلترة حسب ارتباط العميل بالفواتير
      if (filterInvoiceStatus === "with_invoices") {
        if (!customersWithAnyInvoices.has(customer.id)) return false
      } else if (filterInvoiceStatus === "without_invoices") {
        if (customersWithAnyInvoices.has(customer.id)) return false
      }

      const query = searchTerm.trim().toLowerCase()
      if (!query) return true

      // Detect input type
      const isNumeric = /^\d+$/.test(query)
      const isAlphabetic = /^[\u0600-\u06FF\u0750-\u077Fa-zA-Z\s]+$/.test(query)

      if (isNumeric) {
        // Search by phone only
        return (customer.phone || '').includes(query)
      } else if (isAlphabetic) {
        // Search by name only
        return customer.name.toLowerCase().includes(query)
      } else {
        // Mixed - search in both name, phone, and email
        return (
          customer.name.toLowerCase().includes(query) ||
          (customer.phone || '').toLowerCase().includes(query) ||
          customer.email.toLowerCase().includes(query)
        )
      }
    })
  }, [customers, filterInvoiceStatus, customersWithAnyInvoices, searchTerm])

  // حساب عدد الفلاتر النشطة
  const activeFilterCount = [
    filterEmployeeId !== "all",
    filterInvoiceStatus !== "all",
    !!searchTerm
  ].filter(Boolean).length

  const clearFilters = () => {
    setFilterEmployeeId("all")
    setFilterInvoiceStatus("all")
    setSearchTerm("")
  }

  // تعريف أعمدة الجدول
  const tableColumns: DataTableColumn<Customer>[] = useMemo(() => [
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
      key: 'branch_id',
      header: appLang === 'en' ? 'Branch' : 'الفرع',
      type: 'text',
      align: 'center',
      hidden: 'md',
      format: (_, row) => {
        const branchName = row.branches?.name
        return branchName ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            {branchName}
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">{appLang === 'en' ? 'Main' : 'رئيسي'}</span>
        )
      }
    },
    {
      key: 'email',
      header: appLang === 'en' ? 'Email' : 'البريد',
      type: 'text',
      align: 'left',
      hidden: 'lg',
      className: 'text-xs',
      format: (value) => value || '-'
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
      key: 'address',
      header: appLang === 'en' ? 'Address' : 'العنوان',
      type: 'text',
      align: 'left',
      hidden: 'xl',
      className: 'text-xs max-w-[150px] truncate',
      format: (value) => value || '-'
    },
    {
      key: 'city',
      header: appLang === 'en' ? 'City' : 'المدينة',
      type: 'text',
      align: 'left',
      hidden: 'lg',
      format: (value) => value || '-'
    },
    {
      key: 'credit_limit',
      header: appLang === 'en' ? 'Credit' : 'الائتمان',
      type: 'currency',
      align: 'right',
      hidden: 'md',
      format: (value) => `${value.toLocaleString()} ${currencySymbol}`
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Receivables' : 'الذمم',
      type: 'currency',
      align: 'right',
      format: (_, row) => {
        const rec = receivables[row.id] || 0
        return (
          <span className={rec > 0 ? "text-red-600 dark:text-red-400 font-semibold" : "text-gray-400 dark:text-gray-500"}>
            {rec > 0 ? `${rec.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${currencySymbol}` : '—'}
          </span>
        )
      }
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Balance' : 'الرصيد',
      type: 'currency',
      align: 'right',
      hidden: 'sm',
      format: (_, row) => {
        const b = balances[row.id] || { advance: 0, applied: 0, available: 0, credits: 0, disbursed: 0 }
        const available = b.available
        const disbursed = b.disbursed || 0
        return (
          <div className="flex flex-col items-end gap-0.5">
            <span className={available > 0 ? "text-green-600 dark:text-green-400 font-semibold" : "text-gray-600 dark:text-gray-400"}>
              {available.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            {disbursed > 0 && (
              <span className="text-xs text-purple-500 dark:text-purple-400 flex items-center gap-1" title={appLang === 'en' ? 'Disbursed credit (reference)' : 'رصيد مُصرَف (مرجع)'}>
                💸 {disbursed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            )}
          </div>
        )
      }
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Actions' : 'إجراءات',
      type: 'actions',
      align: 'center',
      format: (_, row) => {
        const hasActiveInvoices = customersWithActiveInvoices.has(row.id)
        const editDisabledReason = !permUpdate
          ? (appLang === 'en' ? 'No permission to edit' : 'لا توجد صلاحية للتعديل')
          : hasActiveInvoices
            ? (appLang === 'en' ? 'Cannot edit - has active invoices (sent/partially paid/paid). Address only can be edited.' : '❌ لا يمكن تعديل بيانات العميل - لديه فواتير نشطة. يمكن تعديل العنوان فقط.')
            : undefined
        const deleteDisabledReason = !permDelete
          ? (appLang === 'en' ? 'No permission to delete' : 'لا توجد صلاحية للحذف')
          : hasActiveInvoices
            ? (appLang === 'en' ? 'Cannot delete - has active invoices' : 'لا يمكن الحذف - لديه فواتير نشطة')
            : undefined

        return (
          <div className="flex gap-1 flex-wrap justify-center">
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 ${hasActiveInvoices ? 'border-yellow-400 text-yellow-600' : ''}`}
              onClick={() => handleEdit(row)}
              disabled={!permUpdate}
              title={editDisabledReason || (appLang === 'en' ? 'Edit customer' : 'تعديل العميل')}
            >
              <Edit2 className="w-4 h-4" />
              {hasActiveInvoices && <span className="ml-1 text-xs">⚠️</span>}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-500 hover:text-red-600"
              onClick={() => handleDelete(row.id)}
              disabled={!permDelete || hasActiveInvoices}
              title={deleteDisabledReason || (appLang === 'en' ? 'Delete customer' : 'حذف العميل')}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
            {(() => {
              const b = balances[row.id] || { advance: 0, applied: 0, available: 0, credits: 0 }
              const available = b.available
              return available > 0 && permWritePayments ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs px-2"
                  onClick={() => openRefundDialog(row)}
                  title={appLang === 'en' ? 'Disburse credit' : 'صرف رصيد دائن'}
                >
                  💰 {appLang === 'en' ? 'Disburse' : 'صرف'}
                </Button>
              ) : null
            })()}
          </div>
        )
      }
    }
  ], [appLang, currencySymbol, receivables, balances, customersWithActiveInvoices, permUpdate, permDelete, permWritePayments])

  // Pagination logic
  const {
    currentPage,
    totalPages,
    totalItems,
    paginatedItems: paginatedCustomers,
    hasNext,
    hasPrevious,
    goToPage,
    nextPage,
    previousPage,
    setPageSize: updatePageSize
  } = usePagination(filteredCustomers, { pageSize })

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    updatePageSize(newSize)
  }

  // ===== فتح نافذة صرف رصيد العميل الدائن =====
  const openRefundDialog = (customer: Customer) => {
    const bal = balances[customer.id]
    const available = bal?.available || 0
    if (available <= 0) {
      toastActionError(toast, appLang === 'en' ? 'Refund' : 'الصرف', appLang === 'en' ? 'Customer credit' : 'رصيد العميل', appLang === 'en' ? 'No available credit balance' : 'لا يوجد رصيد دائن متاح', appLang, 'INSUFFICIENT_STOCK')
      return
    }
    setRefundCustomerId(customer.id)
    setRefundCustomerName(customer.name)
    setRefundMaxAmount(available)
    setRefundAmount(available)
    setRefundDate(new Date().toISOString().slice(0, 10))
    setRefundMethod("cash")
    setRefundAccountId("")
    setRefundNotes("")
    setRefundOpen(true)
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <ListErrorBoundary listType="customers" lang={appLang}>
          <div className="space-y-4 sm:space-y-6 max-w-full">
            {/* رأس الصفحة - تحسين للهاتف */}
            <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                    <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang === 'en' ? 'Customers' : 'العملاء'}</h1>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang === 'en' ? 'Manage customer accounts and contacts' : 'إدارة حسابات العملاء وبيانات التواصل'}</p>
                    {/* 🔐 Governance Notice */}
                    {(currentUserRole === 'manager' || currentUserRole === 'accountant') && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        {appLang === 'en' ? '🏢 Showing customers from your branch only' : '🏢 تعرض العملاء الخاصين بفرعك فقط'}
                      </p>
                    )}
                    {(currentUserRole === 'staff' || currentUserRole === 'sales' || currentUserRole === 'employee') && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        {appLang === 'en' ? '👨‍💼 Showing customers you created only' : '👨‍💼 تعرض العملاء الذين أنشأتهم فقط'}
                      </p>
                    )}
                  </div>
                </div>
                <CustomerFormDialog
                  open={isDialogOpen}
                  onOpenChange={setIsDialogOpen}
                  editingCustomer={editingId ? customers.find(c => c.id === editingId) : null}
                  onSaveComplete={() => {
                    setIsDialogOpen(false)
                    setEditingId(null)
                    loadCustomers()
                  }}
                />
              </div>
            </div>

            {/* Search Bar and Filters */}
            <FilterContainer
              title={appLang === 'en' ? 'Filters' : 'الفلاتر'}
              activeCount={activeFilterCount}
              onClear={clearFilters}
              defaultOpen={false}
            >
              <div className="space-y-4">
                {/* 🔐 فلتر الفروع الموحد - يظهر فقط للأدوار المميزة (Owner/Admin/General Manager) */}
                <BranchFilter
                  lang={appLang}
                  externalHook={branchFilter}
                  className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
                />

                {/* Quick Search Bar */}
                <div>
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => {
                        const val = e.target.value
                        startTransition(() => setSearchTerm(val))
                      }}
                      placeholder={appLang === 'en' ? 'Search by name or phone...' : 'ابحث بالاسم أو رقم الهاتف...'}
                      className={`pr-10 h-11 text-sm bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 ${isPending ? 'opacity-70' : ''}`}
                    />
                    {searchTerm && (
                      <button
                        onClick={() => startTransition(() => setSearchTerm(""))}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Filter Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* فلتر الموظفين - يظهر فقط للمديرين */}
                  {canViewAllCustomers && employees.length > 0 && (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        <UserCheck className="w-4 h-4 text-blue-500" />
                        {appLang === 'en' ? 'Employee' : 'الموظف'}
                      </label>
                      <Select
                        value={filterEmployeeId}
                        onValueChange={(value) => startTransition(() => setFilterEmployeeId(value))}
                      >
                        <SelectTrigger className="h-10 text-sm bg-white dark:bg-slate-800">
                          <SelectValue placeholder={appLang === 'en' ? 'All Employees' : 'جميع الموظفين'} />
                        </SelectTrigger>
                        <SelectContent>
                          {/* حقل البحث داخل القائمة */}
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
                                <span className="flex items-center gap-2">
                                  <span>{emp.display_name}</span>
                                  <span className="text-xs text-gray-400">({emp.role})</span>
                                </span>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* فلتر ارتباط العملاء بالفواتير */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      <Users className="w-4 h-4 text-purple-500" />
                      {appLang === 'en' ? 'Invoice Status' : 'حالة الفواتير'}
                    </label>
                    <Select
                      value={filterInvoiceStatus}
                      onValueChange={(value) => setFilterInvoiceStatus(value)}
                    >
                      <SelectTrigger className="h-10 text-sm bg-white dark:bg-slate-800">
                        <SelectValue placeholder={appLang === 'en' ? 'All Customers' : 'جميع العملاء'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {appLang === 'en' ? '👥 All Customers' : '👥 جميع العملاء'}
                        </SelectItem>
                        <SelectItem value="with_invoices">
                          {appLang === 'en' ? '📄 With Invoices' : '📄 مرتبطون بفواتير'}
                        </SelectItem>
                        <SelectItem value="without_invoices">
                          {appLang === 'en' ? '📭 Without Invoices' : '📭 غير مرتبطين بفواتير'}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* عرض الفلتر النشط - الموظف */}
                {canViewAllCustomers && filterEmployeeId !== "all" && (
                  <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-md">
                    <UserCheck className="w-4 h-4" />
                    <span>
                      {appLang === 'en' ? 'Showing customers for: ' : 'عرض عملاء: '}
                      <strong>{employees.find(e => e.user_id === filterEmployeeId)?.display_name || filterEmployeeId}</strong>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFilterEmployeeId("all")}
                      className="h-6 px-2 text-xs text-blue-600 hover:text-blue-800"
                    >
                      {appLang === 'en' ? 'Show All' : 'عرض الكل'}
                    </Button>
                  </div>
                )}

                {/* عرض الفلتر النشط - الفواتير */}
                {filterInvoiceStatus !== "all" && (
                  <div className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-3 py-2 rounded-md">
                    <Users className="w-4 h-4" />
                    <span>
                      {filterInvoiceStatus === "with_invoices"
                        ? (appLang === 'en' ? '📄 Showing customers with invoices' : '📄 عرض العملاء المرتبطين بفواتير')
                        : (appLang === 'en' ? '📭 Showing customers without invoices' : '📭 عرض العملاء غير المرتبطين بفواتير')}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFilterInvoiceStatus("all")}
                      className="h-6 px-2 text-xs text-purple-600 hover:text-purple-800"
                    >
                      {appLang === 'en' ? 'Show All' : 'عرض الكل'}
                    </Button>
                  </div>
                )}
              </div>
            </FilterContainer>

            {/* Customers Table */}
            <Card>
              <CardHeader>
                <CardTitle>{appLang === 'en' ? 'Customers List' : 'قائمة العملاء'}</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <LoadingState type="table" rows={8} />
                ) : filteredCustomers.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title={appLang === 'en' ? 'No customers yet' : 'لا توجد عملاء حتى الآن'}
                    description={appLang === 'en' ? 'Create your first customer to get started' : 'أنشئ أول عميل للبدء'}
                  />
                ) : (
                  <div className="space-y-4">
                    <DataTable
                      columns={tableColumns}
                      data={paginatedCustomers}
                      keyField="id"
                      lang={appLang}
                      minWidth="min-w-[640px]"
                      emptyMessage={appLang === 'en' ? 'No customers found' : 'لا توجد عملاء'}
                      footer={{
                        render: () => {
                          const totalCustomers = filteredCustomers.length
                          const totalReceivables = filteredCustomers.reduce((sum, c) => sum + (receivables[c.id] || 0), 0)
                          const totalCredits = filteredCustomers.reduce((sum, c) => {
                            const b = balances[c.id] || { advance: 0, applied: 0, available: 0, credits: 0 }
                            return sum + (b.credits || 0)
                          }, 0)

                          return (
                            <tr>
                              <td className="px-3 py-4 text-right" colSpan={tableColumns.length - 1}>
                                <span className="text-gray-700 dark:text-gray-200">
                                  {appLang === 'en' ? 'Totals' : 'الإجماليات'} ({totalCustomers} {appLang === 'en' ? 'customers' : 'عميل'})
                                </span>
                              </td>
                              <td className="px-3 py-4">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Receivables:' : 'الذمم المدينة:'}</span>
                                    <span className="text-blue-600 dark:text-blue-400 font-semibold">
                                      {currencySymbol}{totalReceivables.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  {totalCredits > 0 && (
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Credits:' : 'الأرصدة الدائنة:'}</span>
                                      <span className="text-green-600 dark:text-green-400 font-semibold">
                                        {currencySymbol}{totalCredits.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                    {filteredCustomers.length > 0 && (
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
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </ListErrorBoundary>
      </main>
      <CustomerRefundDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        customerId={refundCustomerId}
        customerName={refundCustomerName}
        maxAmount={refundMaxAmount}
        accounts={accounts || []}
        appCurrency={appCurrency}
        currencies={currencies}
        refundAmount={refundAmount}
        setRefundAmount={setRefundAmount}
        refundCurrency={refundCurrency}
        setRefundCurrency={setRefundCurrency}
        refundDate={refundDate}
        setRefundDate={setRefundDate}
        refundMethod={refundMethod}
        setRefundMethod={setRefundMethod}
        refundAccountId={refundAccountId}
        setRefundAccountId={setRefundAccountId}
        refundNotes={refundNotes}
        setRefundNotes={setRefundNotes}
        refundExRate={refundExRate}
        onRefundComplete={loadCustomers}
        // 🔐 ERP Governance - سياق المستخدم
        userRole={currentUserRole}
        userBranchId={userContext?.branch_id || null}
        userCostCenterId={userContext?.cost_center_id || null}
        branches={allBranches}
        costCenters={allCostCenters}
      />
    </div>
  )
}
