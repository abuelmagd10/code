"use client"

import type React from "react"
import { useState, useEffect, useMemo, useTransition, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { ERPPageHeader } from "@/components/erp-page-header"
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
import { useAutoRefresh } from "@/hooks/use-auto-refresh"

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

  // تهيئة اللغة + الاستماع لتغييرها
  useEffect(() => {
    const read = () => { try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { } }
    read()
    window.addEventListener('app_language_changed', read)
    window.addEventListener('storage', read)
    return () => { window.removeEventListener('app_language_changed', read); window.removeEventListener('storage', read) }
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

  // v3.74.183 — customer credit refund requests (approval workflow for
  // non-privileged users). The list is branch-scoped at query time for
  // accountants and shown company-wide for owner / admin / general_manager.
  const [refundRequests, setRefundRequests] = useState<any[]>([])
  const [refundRequestsLoading, setRefundRequestsLoading] = useState(false)

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

  // v3.74.193 — Depend on primitive fields of userContext, not the object
  // itself. setUserContext rebuilds a new object on every permission load,
  // which used to fire this effect twice and run loadCustomers in parallel.
  const userBranchId = userContext?.branch_id || null
  const userCostCenterId = userContext?.cost_center_id || null
  useEffect(() => {
    if (permissionsLoaded) {
      loadCustomers()
    }
  }, [permissionsLoaded, canViewAllCustomers, currentUserId, filterEmployeeId, userBranchId, userCostCenterId, branchFilter.selectedBranchId])

  // 🔄 الاستماع لتغيير الشركة وإعادة تحميل البيانات
  useEffect(() => {
    const handleCompanyChange = () => {
      loadCustomers();
    };
    window.addEventListener('company_updated', handleCompanyChange);
    return () => window.removeEventListener('company_updated', handleCompanyChange);
  }, []);

  // v3.74.56 - تَحديث تِلقائى عِندَ العَودَة للنّافِذَة/التَّبويب
  useAutoRefresh({ onRefresh: () => loadCustomers() , skipIfHidden: true })

  // v3.74.193 — concurrency guard. Two effects ago, two parallel
  // loadCustomers calls would race; with the single-RPC version they'd
  // still both hit the network. This ref short-circuits the second one.
  const loadInFlightRef = useRef(false)

  const loadCustomers = async () => {
    if (loadInFlightRef.current) return
    loadInFlightRef.current = true
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

      // v3.74.193 — Single RPC `get_customers_overview` replaces the
      // 10+ client SELECTs we used to fire here (customers + payments +
      // advance_applications + customer_credits + invoices +
      // journal_entry_lines + supporting lookups). The RPC does the
      // aggregation server-side and returns each customer already enriched
      // with advance / applied / available_credits / disbursed_credits /
      // receivables / has_active_invoices.
      //
      // Permission filtering is translated into RPC parameters below — the
      // same role-based scoping the old code did, but expressed once.
      let p_branch_filter: string | null = null
      let p_employee_filter: string | null = null
      let p_cost_center_filter: string | null = null
      let p_shared_grantor_ids: string[] | null = null

      if (canFilterByBranch && selectedBranchId) {
        p_branch_filter = selectedBranchId
        if (filterEmployeeId !== 'all') p_employee_filter = filterEmployeeId
      } else if (filterEmployeeId !== 'all') {
        if (accessFilter.filterByBranch && accessFilter.branchId) {
          p_branch_filter = accessFilter.branchId
        }
        p_employee_filter = filterEmployeeId
      } else if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
        p_employee_filter = accessFilter.createdByUserId
        // Shared grantors (permission_sharing) — single lookup, narrow.
        if (currentUserId) {
          const { data: sharedPerms } = await supabase
            .from("permission_sharing")
            .select("grantor_user_id, resource_type")
            .eq("grantee_user_id", currentUserId)
            .eq("company_id", activeCompanyId)
            .eq("is_active", true)
            .or("resource_type.eq.all,resource_type.eq.customers")
          const ids = (sharedPerms || []).map((p: any) => p.grantor_user_id).filter(Boolean)
          if (ids.length > 0) p_shared_grantor_ids = ids
        }
      } else if (accessFilter.filterByBranch && accessFilter.branchId) {
        p_branch_filter = accessFilter.branchId
      } else if (accessFilter.filterByCostCenter && accessFilter.costCenterId) {
        p_cost_center_filter = accessFilter.costCenterId
      }

      const { data: rpcRes, error: rpcErr } = await supabase.rpc('get_customers_overview', {
        p_company_id: activeCompanyId,
        p_branch_filter,
        p_employee_filter,
        p_cost_center_filter,
        p_shared_grantor_ids,
        p_search: null,           // search filtering happens client-side (existing UX)
        p_invoice_filter: 'all',  // existing UX filters by invoice status client-side
        p_page: 1,
        p_page_size: 500          // ceiling; pagination is still client-side for now
      })
      if (rpcErr) {
        console.error('[Customers] get_customers_overview error:', rpcErr)
        return
      }

      const rows: any[] = (rpcRes && rpcRes.rows) || []

      // Hydrate every state slice the page already consumed.
      const allCustomers: Customer[] = rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        email: r.email || '',
        phone: r.phone || '',
        address: r.address || '',
        governorate: r.governorate || '',
        city: r.city || '',
        country: r.country || '',
        detailed_address: r.detailed_address || '',
        tax_id: r.tax_id || '',
        credit_limit: Number(r.credit_limit || 0),
        payment_terms: r.payment_terms || '',
        created_by_user_id: r.created_by_user_id || null,
        branch_id: r.branch_id || null,
        cost_center_id: r.cost_center_id || null,
        branches: r.branches || null,
      }))
      setCustomers(allCustomers)

      const out: Record<string, { advance: number; applied: number; available: number; credits: number; disbursed: number }> = {}
      const recMap: Record<string, number> = {}
      const activeCustomers = new Set<string>()
      const anyInvoiceCustomers = new Set<string>()
      for (const r of rows) {
        const id = String(r.id)
        const advance = Number(r.advance || 0)
        const applied = Number(r.applied || 0)
        const credits = Number(r.available_credits || 0)
        out[id] = {
          advance,
          applied,
          available: Math.max(advance - applied, 0) + credits,
          credits,
          disbursed: Number(r.disbursed_credits || 0),
        }
        recMap[id] = Number(r.receivables || 0)
        if (r.has_active_invoices) activeCustomers.add(id)
        if (r.has_any_invoices) anyInvoiceCustomers.add(id)
      }
      setBalances(out)
      setReceivables(recMap)
      setCustomersWithActiveInvoices(activeCustomers)
      setCustomersWithAnyInvoices(anyInvoiceCustomers)

      // تم نقل setCustomers إلى بعد دمج العملاء المشتركين
      // v3.74.41: scope the disbursement-account picker correctly.
      //   1. Narrow to cash + bank sub-types only. The dialog is for
      //      cashing out a customer credit, so showing receivables,
      //      inventory, or fixed-asset accounts in the dropdown is
      //      both confusing and wrong.
      //   2. Privileged roles (owner / admin / general_manager) see
      //      every cash + bank account in the company.
      //      Non-privileged roles (accountant, store_manager, staff,
      //      ...) see ONLY their own branch's cash + bank accounts.
      //      Central / company-level (branch_id NULL) accounts are
      //      visible only to privileged roles. A branch accountant
      //      may not disburse from the central treasury — they have
      //      to use their branch's accounts.
      const accountsPrivilegedRoles = ['owner', 'admin', 'general_manager']
      const isAccountsPrivileged = accountsPrivilegedRoles.includes(
        (currentUserRole || '').toLowerCase()
      )
      let accountsQuery = supabase
        .from("chart_of_accounts")
        // v3.74.200 — pull original_currency so the refund dialog can show
        // only same-currency accounts (and offer FX conversion when none match).
        .select("id, account_code, account_name, account_type, sub_type, branch_id, original_currency")
        .eq("company_id", activeCompanyId)
        .in("sub_type", ["cash", "bank"])
        .eq("is_active", true)
      if (!isAccountsPrivileged && userContext?.branch_id) {
        // Strict branch scope — no company-level fallback for branch
        // users.
        accountsQuery = accountsQuery.eq("branch_id", userContext.branch_id)
      }
      const { data: accs } = await accountsQuery
      setAccounts(accs || [])

      // v3.74.193 — The 10+ aggregation SELECTs (payments, advance_applications,
      // customer_credits, paid invoices for overpayment, AR account lookup,
      // all invoices, journal_entry_lines + payment/application/return joins,
      // fallback invoice scan) that used to live here have been collapsed into
      // get_customers_overview above. Receivables now come from invoices
      // directly (total - paid - returned) instead of being derived from the
      // AR journal lines — same number, dramatically fewer round-trips.

      // Load currencies for multi-currency support
      setCompanyId(activeCompanyId)
      const curr = await getActiveCurrencies(supabase, activeCompanyId)
      if (curr.length > 0) setCurrencies(curr)
      setRefundCurrency(appCurrency)
    } catch (error) {
      console.error('[Customers] loadCustomers failed:', error)
    } finally {
      setIsLoading(false)
      loadInFlightRef.current = false
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

  // v3.74.198 — credit / payment / invoice tables also feed the balance
  // and receivables columns. When the accountant submits a credit refund
  // and the owner approves it, the JE writes to customer_credits +
  // customer_credit_ledger; without subscribing here, the page kept
  // showing the pre-refund balance until the user navigated away and
  // back. Same fix the suppliers page had since v3.74.181.
  useRealtimeTable({
    table: 'customer_credits',
    enabled: true,
    onInsert: handleCustomersRealtimeEvent,
    onUpdate: handleCustomersRealtimeEvent,
    onDelete: handleCustomersRealtimeEvent,
  })
  useRealtimeTable({
    table: 'customer_credit_ledger',
    enabled: true,
    onInsert: handleCustomersRealtimeEvent,
    onUpdate: handleCustomersRealtimeEvent,
    onDelete: handleCustomersRealtimeEvent,
  })
  useRealtimeTable({
    table: 'payments',
    enabled: true,
    onInsert: handleCustomersRealtimeEvent,
    onUpdate: handleCustomersRealtimeEvent,
    onDelete: handleCustomersRealtimeEvent,
  })
  useRealtimeTable({
    table: 'invoices',
    enabled: true,
    onInsert: handleCustomersRealtimeEvent,
    onUpdate: handleCustomersRealtimeEvent,
    onDelete: handleCustomersRealtimeEvent,
  })

  // v3.74.184 — simplified: do not gate on currentUserRole, run on mount
  // and re-run whenever the role/branch changes. The previous version
  // could leave refundRequests empty during the brief window between
  // first render and the userContext fetch completing, and the SELECT
  // chained 3 cross-table joins that could break under stricter RLS in
  // some companies. Slimmer query, narrower failure surface.
  const loadRefundRequests = useCallback(async () => {
    try {
      setRefundRequestsLoading(true)
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) return
      const role = (currentUserRole || '').toLowerCase()
      const seesAllBranches = ['owner', 'admin', 'general_manager'].includes(role)
      let q = supabase
        .from('customer_refund_requests')
        .select('id, customer_id, status, source_type, amount, currency, branch_id, refund_account_id, rejection_reason, requested_by, approved_by, rejected_by, approved_at, rejected_at, executed_at, created_at, metadata')
        .eq('company_id', activeCompanyId)
        .eq('source_type', 'credit_refund')
        .order('created_at', { ascending: false })
      if (!seesAllBranches && userContext?.branch_id) {
        q = q.eq('branch_id', userContext.branch_id)
      }
      const { data, error } = await q
      if (error) {
        console.error('[customer-refund] loader error:', error)
        return
      }
      console.log('[customer-refund] loaded', data?.length || 0, 'rows for role', role)
      setRefundRequests(data || [])
    } catch (err) {
      console.error('loadRefundRequests error:', err)
    } finally {
      setRefundRequestsLoading(false)
    }
  }, [supabase, currentUserRole, userContext?.branch_id])

  // Run on mount + every time the loader changes (closure over role/branch).
  // No currentUserRole gate: the loader is safe to call before the role is
  // known, it just returns the full company set until the role narrows it.
  useEffect(() => {
    loadRefundRequests()
  }, [loadRefundRequests])

  const handleRefundRequestsRealtimeEvent = useCallback(() => {
    console.log('🔄 [Customers] refund_requests change — reloading')
    loadRefundRequests()
  }, [loadRefundRequests])

  useRealtimeTable({
    table: 'customer_refund_requests',
    enabled: true,
    onInsert: handleRefundRequestsRealtimeEvent,
    onUpdate: handleRefundRequestsRealtimeEvent,
    onDelete: handleRefundRequestsRealtimeEvent,
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

      // فلترة حسب الموظف منشئ العميل (matches activeFilterCount expectation)
      if (filterEmployeeId !== "all" && (customer as any).created_by_user_id !== filterEmployeeId) return false

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
  }, [customers, filterInvoiceStatus, customersWithAnyInvoices, searchTerm, filterEmployeeId])

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
        // الذمم = ما على العميل (موجب فقط). السالب (overpayment) محله عمود الرصيد.
        // (v3.23.6: reverted v3.23.3 which incorrectly showed negative here.)
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
              if (!(available > 0 && permWritePayments)) return null
              // v3.74.183 — block the disburse button while the latest refund
              // request for this customer is non-terminal (pending or approved).
              // refundRequests is sorted DESC, so first match = latest. Same
              // pattern as v3.74.179 on the suppliers page.
              const latestRequest = refundRequests.find((r: any) => r.customer_id === row.id)
              if (latestRequest && (latestRequest.status === 'pending' || latestRequest.status === 'approved')) {
                const isApproved = latestRequest.status === 'approved'
                return (
                  <span
                    className={`inline-flex items-center gap-1 h-8 px-2 text-xs rounded border ${
                      isApproved
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300'
                        : 'border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300'
                    }`}
                    title={isApproved
                      ? (appLang === 'en' ? 'Refund approved; awaiting execution' : 'الصَّرف مُعتَمَد — قَيد التَّنفيذ')
                      : (appLang === 'en' ? 'A refund request is pending management approval' : 'يُوجَد طَلَب صَرف بانتظار اعتماد الإدارَة')}
                  >
                    {isApproved
                      ? (appLang === 'en' ? '✓ Approved' : '✓ مُعتَمَد')
                      : (appLang === 'en' ? '⏳ Pending' : '⏳ قَيد الاعتماد')}
                  </span>
                )
              }
              return (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs px-2"
                  onClick={() => openRefundDialog(row)}
                  title={appLang === 'en' ? 'Disburse credit' : 'صرف رصيد دائن'}
                >
                  💰 {appLang === 'en' ? 'Disburse' : 'صرف'}
                </Button>
              )
            })()}
          </div>
        )
      }
    }
  ], [appLang, currencySymbol, receivables, balances, customersWithActiveInvoices, permUpdate, permDelete, permWritePayments, refundRequests])

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
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <ListErrorBoundary listType="customers" lang={appLang}>
          <div className="space-y-4 sm:space-y-6 max-w-full">
            {/* Header — Migrated to ERPPageHeader (v3.52.0) */}
            <ERPPageHeader
              title={appLang === 'en' ? 'Customers' : 'العملاء'}
              description={appLang === 'en' ? 'Manage customer accounts and contacts' : 'إدارة حسابات العملاء وبيانات التواصل'}
              variant="list"
              lang={appLang}
              actions={
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
              }
              extra={
                (currentUserRole === 'manager' || currentUserRole === 'accountant') ? (
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    {appLang === 'en' ? '🏢 Showing customers from your branch only' : '🏢 تعرض العملاء الخاصين بفرعك فقط'}
                  </p>
                ) : (currentUserRole === 'staff' || currentUserRole === 'sales' || currentUserRole === 'employee') ? (
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    {appLang === 'en' ? '👨‍💼 Showing customers you created only' : '👨‍💼 تعرض العملاء الذين أنشأتهم فقط'}
                  </p>
                ) : undefined
              }
            />

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
        setRefundExRate={setRefundExRate}
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
