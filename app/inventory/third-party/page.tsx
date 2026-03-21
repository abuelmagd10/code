"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Package, Truck, DollarSign, FileText, ExternalLink, Loader2, UserCheck, X } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { MultiSelect } from "@/components/ui/multi-select"
import { FilterContainer } from "@/components/ui/filter-container"
import { type UserContext, getRoleAccessLevel } from "@/lib/validation"
import { StatusBadge } from "@/components/DataTableFormatters"
import { usePermissions } from "@/lib/permissions-context"

interface ThirdPartyItem {
  id: string
  invoice_id: string
  product_id: string
  quantity: number
  unit_cost: number
  unit_price?: number // سعر البيع من الفاتورة
  line_total?: number // قيمة البند بعد خصم البند
  net_line_value?: number // ✅ القيمة الصافية بعد جميع الخصومات (خصم البند + خصم الفاتورة)
  item_discount_percent?: number // نسبة خصم البند
  cleared_quantity: number
  returned_quantity: number
  status: string
  shipping_provider_id: string
  created_at: string
  created_by_user_id?: string | null // منشئ أمر البيع
  invoices?: {
    invoice_number: string
    customer_id: string
    invoice_date?: string
    status?: string
    branch_id?: string | null
    warehouse_id?: string | null
    sales_order_id?: string | null
    paid_amount?: number | null
    subtotal?: number | null // المجموع قبل الخصم
    tax_amount?: number | null // مبلغ الضريبة
    shipping?: number | null // مبلغ الشحن
    total_amount?: number | null // المجموع النهائي بعد الخصم
    original_total?: number | null
    return_status?: string | null
    returned_amount?: number | null
    customers?: { name: string; phone?: string }
    branches?: { name: string }
    warehouses?: { name: string }
  }
  products?: { name: string; sku: string }
  shipping_providers?: { provider_name: string }
}

interface ShippingProvider {
  id: string
  provider_name: string
}

interface Customer {
  id: string
  name: string
  phone?: string
}

interface Product {
  id: string
  name: string
  sku: string
}

interface Employee {
  user_id: string
  display_name: string
  role: string
  email?: string
}

export default function ThirdPartyInventoryPage() {
  const supabase = useSupabase()
  const { canAccessPage } = usePermissions()
  const [items, setItems] = useState<ThirdPartyItem[]>([])
  const [providers, setProviders] = useState<ShippingProvider[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  // 🔐 ERP Access Control - Governance Rules
  // 👑 Owner/Admin/GM: See all goods in all branches
  // 🏢 Manager/Accountant: See only their branch
  // 📦 Store Manager (Main Warehouse): See all branches
  // 📦 Store Manager (Branch Warehouse): See only their branch
  // 👨‍💼 Staff: See only goods from sales orders they created
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>("employee")
  const [isMainWarehouse, setIsMainWarehouse] = useState<boolean>(false)

  // قائمة الفروع للفلترة
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [filterBranchId, setFilterBranchId] = useState<string>("all")

  // التحقق من صلاحية الوصول لصفحة الفواتير
  const canAccessInvoices = canAccessPage("invoices")

  // Language
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])
  const isAr = appLang === 'ar'

  // Filters
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>("all")
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatuses, setFilterStatuses] = useState<string[]>([])
  const [filterCustomers, setFilterCustomers] = useState<string[]>([])
  const [filterProducts, setFilterProducts] = useState<string[]>([])
  const [filterShippingProviders, setFilterShippingProviders] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  // خيارات الحالة
  const statusOptions = [
    { value: "sent", label: isAr ? "مرسلة" : "Sent" },
    { value: "confirmed", label: isAr ? "مؤكدة" : "Confirmed" },
    { value: "partially_returned", label: isAr ? "مرتجع جزئي" : "Partially Returned" },
    { value: "partially_paid", label: isAr ? "مدفوعة جزئياً" : "Partially Paid" },
  ]

  // Can view all (admin/owner + store_manager in main warehouse)
  const canViewAll = ["owner", "admin", "general_manager"].includes(currentUserRole) ||
    (currentUserRole === "store_manager" && isMainWarehouse)

  // يمكنه رؤية فلتر الفروع
  const canSeeBranchFilter = ["owner", "admin", "general_manager"].includes(currentUserRole) ||
    (currentUserRole === "store_manager" && isMainWarehouse)

  useEffect(() => {
    loadData()
  }, [])

  // ✅ تحديث تلقائي عند تغيير حالة الفاتورة
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadData()
      }
    }

    const handleInvoiceUpdate = () => {
      loadData()
    }

    // تحديث عند ظهور الصفحة
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // تحديث عند تغيير حالة الفاتورة (من خلال custom event)
    window.addEventListener('invoice_status_changed', handleInvoiceUpdate)

    // تحديث دوري كل 5 ثوانٍ
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData()
      }
    }, 5000)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('invoice_status_changed', handleInvoiceUpdate)
      clearInterval(interval)
    }
  }, [])

  const loadData = async () => {
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // Get current user
      let memberData: { role?: string; branch_id?: string | null; cost_center_id?: string | null; warehouse_id?: string | null } | null = null
      let userIsInMainWarehouse = false
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
        const { data: member } = await supabase
          .from("company_members")
          .select("role, branch_id, cost_center_id, warehouse_id")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .single()
        memberData = member
        if (member) {
          setCurrentUserRole(member.role || "employee")
          setUserContext({
            user_id: user.id,
            company_id: companyId,
            role: member.role || "employee",
            branch_id: member.branch_id || null,
            cost_center_id: member.cost_center_id || null,
            warehouse_id: member.warehouse_id || null
          })

          // 📦 التحقق إذا كان مسئول المخزن في المخزن الرئيسي
          if (member.role === 'store_manager' && member.warehouse_id) {
            const { data: warehouseData } = await supabase
              .from("warehouses")
              .select("is_main")
              .eq("id", member.warehouse_id)
              .single()
            userIsInMainWarehouse = warehouseData?.is_main === true
            setIsMainWarehouse(userIsInMainWarehouse)
          }
        }
      }

      // 🏢 جلب الفروع للفلترة (للمستخدمين المخولين فقط)
      const roleForBranchFilter = memberData?.role || "employee"
      const canLoadBranches = ["owner", "admin", "general_manager"].includes(roleForBranchFilter) ||
        (roleForBranchFilter === "store_manager" && userIsInMainWarehouse)

      if (canLoadBranches) {
        const { data: branchesData } = await supabase
          .from("branches")
          .select("id, name")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("is_main", { ascending: false })
          .order("name")
        setBranches(branchesData || [])
      } else {
        setBranches([])
      }

      // جلب شركات الشحن
      const { data: providersData } = await supabase
        .from("shipping_providers")
        .select("id, provider_name")
        .eq("company_id", companyId)
      setProviders(providersData || [])

      // جلب العملاء
      const { data: customersData } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("company_id", companyId)
      setCustomers(customersData || [])

      // جلب المنتجات
      const { data: productsData } = await supabase
        .from("products")
        .select("id, name, sku")
        .eq("company_id", companyId)
        .neq("item_type", "service")
      setProducts(productsData || [])

      // جلب الموظفين (للمديرين فقط) مع مراعاة صلاحيات الفروع
      const currentRole = userContext?.role || memberData?.role || "staff"
      const accessLevel = getRoleAccessLevel(currentRole)

      let membersQuery = supabase
        .from("company_members")
        .select("user_id, role, email, branch_id")
        .eq("company_id", companyId)

      // إذا كان المستخدم مدير فرع، فلترة الموظفين حسب الفرع
      if (accessLevel === 'branch' && memberData?.branch_id) {
        membersQuery = membersQuery.eq("branch_id", memberData.branch_id)
      }

      const { data: membersData } = await membersQuery

      // جلب ملفات المستخدمين للحصول على display_name
      const userIds = (membersData || []).map((m: any) => m.user_id)
      let profilesMap: Record<string, { display_name?: string; username?: string }> = {}
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("user_id, display_name, username")
          .in("user_id", userIds)
        profilesMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]))
      }

      setEmployees((membersData || []).map((m: any) => {
        const profile = profilesMap[m.user_id]
        return {
          user_id: m.user_id,
          display_name: profile?.display_name || profile?.username || m.email || "Unknown",
          role: m.role || "employee",
          email: m.email
        }
      }))

      // ✅ جلب الفواتير المرسلة مع شركات الشحن
      // تشمل: sent, confirmed, partially_returned, partially_paid
      // (البضائع تبقى لدى الغير حتى يتم استلام كامل المبلغ أو إرجاع كامل البضاعة)

      // 🔐 تطبيق قاعدة الحوكمة (Governance Rules)
      // استخدام currentRole المعرف مسبقاً في السطر 226
      const currentBranchId = memberData?.branch_id || null

      let invoicesQuery = supabase
        .from("invoices")
        .select(`
          id,
          invoice_number,
          customer_id,
          invoice_date,
          status,
          shipping_provider_id,
          branch_id,
          warehouse_id,
          sales_order_id,
          paid_amount,
          subtotal,
          tax_amount,
          shipping,
          total_amount,
          original_total,
          return_status,
          returned_amount,
          customers(name, phone),
          branches(name),
          warehouses(name),
          sales_orders!invoices_sales_order_id_fkey(created_by_user_id)
        `)
        .eq("company_id", companyId)
        .in("status", ["sent", "confirmed", "partially_returned", "partially_paid"])
        .not("shipping_provider_id", "is", null)

      // 🔐 فلترة حسب الدور والفرع والمخزن
      const currentWarehouseId = memberData?.warehouse_id || null

      // 📦 التحقق إذا كان store_manager في المخزن الرئيسي
      const isStoreManagerInMainWarehouse = currentRole === 'store_manager' && userIsInMainWarehouse

      // 👑 Owner / Admin / GM / Store Manager (Main Warehouse): يرون كل شيء
      if (['owner', 'admin', 'general_manager'].includes(currentRole) || isStoreManagerInMainWarehouse) {
        // لا فلترة على مستوى الدور - فقط فلتر الفرع إذا تم اختياره
        // (سيتم تطبيقه لاحقاً في filteredItems)
      } else if (currentRole === 'store_manager') {
        // 📦 مسئول المخزن (غير الرئيسي): يرى فرعه فقط
        if (currentBranchId) {
          invoicesQuery = invoicesQuery.eq("branch_id", currentBranchId)
        }
      } else if (currentRole === 'manager' || currentRole === 'accountant') {
        // 🏢 Branch Manager / Accountant: يرون فرعهم فقط
        if (currentBranchId) {
          invoicesQuery = invoicesQuery.eq("branch_id", currentBranchId)
        }
      } else if (currentRole === 'staff' || currentRole === 'sales' || currentRole === 'employee') {
        // 👨‍💼 Staff: يرون فقط الفواتير المرتبطة بأوامر البيع التي أنشأوها
        // سنقوم بفلترة البيانات بعد جلبها لأن الربط معقد (invoice → sales_order → created_by)
        // RLS سيتولى الفلترة على مستوى قاعدة البيانات
      }

      invoicesQuery = invoicesQuery.order("invoice_date", { ascending: false })

      const { data: sentInvoices, error: invoicesErr } = await invoicesQuery

      if (invoicesErr) {
        console.error("Error loading sent invoices:", invoicesErr)
        setItems([])
        return
      }

      // جلب بضائع لدى الغير المرتبطة بهذه الفواتير
      const invoiceIds = (sentInvoices || []).map((inv: any) => inv.id)
      if (invoiceIds.length === 0) {
        setItems([])
        return
      }

      const { data: thirdPartyData, error: thirdPartyErr } = await supabase
        .from("third_party_inventory")
        .select(`
          *,
          products(name, sku),
          shipping_providers(provider_name)
        `)
        .eq("company_id", companyId)
        .in("invoice_id", invoiceIds)

      if (thirdPartyErr) {
        console.error("Error loading third party inventory:", thirdPartyErr)
        setItems([])
        return
      }

      // جلب بنود الفواتير للحصول على سعر البيع و line_total (بعد خصم البند)
      const { data: invoiceItemsData } = await supabase
        .from("invoice_items")
        .select("invoice_id, product_id, unit_price, quantity, discount_percent, line_total")
        .in("invoice_id", invoiceIds)

      // ✅ حساب مجموع line_totals لكل فاتورة (لأن subtotal قد يكون محفوظ بعد الخصم)
      const invoiceLineTotalsSum: Record<string, number> = {}
        ; (invoiceItemsData || []).forEach((item: any) => {
          const invoiceId = item.invoice_id
          const lineTotal = Number(item.line_total || 0)
          invoiceLineTotalsSum[invoiceId] = (invoiceLineTotalsSum[invoiceId] || 0) + lineTotal
        })

      // دمج البيانات: ربط third_party_inventory مع بيانات الفاتورة وسعر البيع
      const mergedItems = (thirdPartyData || []).map((tpi: any) => {
        const invoice = (sentInvoices || []).find((inv: any) => inv.id === tpi.invoice_id)
        // جلب بيانات البند من الفاتورة
        const invoiceItem = (invoiceItemsData || []).find(
          (item: any) => item.invoice_id === tpi.invoice_id && item.product_id === tpi.product_id
        )

        // ✅ حساب القيمة الصافية للبند بعد جميع الخصومات
        // المنطق الصحيح:
        // 1. line_total = قيمة البند (quantity * unit_price * (1 - discount_percent/100))
        // 2. sum_of_line_totals = مجموع قيم جميع بنود الفاتورة
        // 3. total_amount = القيمة النهائية للفاتورة بعد جميع الخصومات والشحن والضريبة
        // 4. نسبة البند من الفاتورة = line_total / sum_of_line_totals
        // 5. القيمة الصافية للبند = (total_amount - tax_amount - shipping) * نسبة البند

        // استخدام line_total من الفاتورة، أو حساب القيمة من unit_price * quantity كـ fallback
        const unitPrice = Number(invoiceItem?.unit_price || tpi.unit_cost || 0)
        const itemQty = Number(invoiceItem?.quantity || tpi.quantity || 0)
        const itemDiscountPercent = Number(invoiceItem?.discount_percent || 0)

        // line_total من الفاتورة أو حسابها يدوياً
        const lineTotal = invoiceItem?.line_total
          ? Number(invoiceItem.line_total)
          : unitPrice * itemQty * (1 - itemDiscountPercent / 100)

        // مجموع قيم بنود الفاتورة (قبل خصم الفاتورة)
        const sumLineTotals = invoiceLineTotalsSum[tpi.invoice_id] || lineTotal
        const invoiceTotalAmount = Number(invoice?.total_amount || 0)
        const invoiceTaxAmount = Number(invoice?.tax_amount || 0)
        const invoiceShipping = Number(invoice?.shipping || 0)

        // ✅ القيمة الصافية للبند = نسبة البند من صافي الفاتورة (بدون الشحن والضريبة)
        // صافي الفاتورة (للبضائع فقط) = total_amount - tax_amount - shipping
        const netInvoiceValue = invoiceTotalAmount - invoiceTaxAmount - invoiceShipping

        // نسبة البند من الفاتورة
        const itemRatio = sumLineTotals > 0 ? lineTotal / sumLineTotals : 1

        // القيمة الصافية للبند
        const netLineValue = netInvoiceValue * itemRatio

        return {
          ...tpi,
          unit_price: invoiceItem?.unit_price || tpi.unit_cost,
          line_total: lineTotal, // قيمة البند بعد خصم البند
          net_line_value: netLineValue, // ✅ القيمة الصافية بعد جميع الخصومات
          item_discount_percent: invoiceItem?.discount_percent || 0,
          // ✅ منشئ أمر البيع للفلترة حسب الموظف
          created_by_user_id: invoice?.sales_orders?.created_by_user_id || null,
          invoices: invoice ? {
            invoice_number: invoice.invoice_number,
            customer_id: invoice.customer_id,
            invoice_date: invoice.invoice_date,
            status: invoice.status,
            branch_id: invoice.branch_id,
            warehouse_id: invoice.warehouse_id,
            sales_order_id: invoice.sales_order_id,
            // ✅ إضافة الحقول المطلوبة لحساب الحالة الصحيحة
            paid_amount: invoice.paid_amount,
            total_amount: invoice.total_amount,
            subtotal: invoice.subtotal,
            tax_amount: invoice.tax_amount,
            shipping: invoice.shipping,
            original_total: invoice.original_total,
            return_status: invoice.return_status,
            returned_amount: invoice.returned_amount,
            customers: invoice.customers,
            branches: invoice.branches,
            warehouses: invoice.warehouses
          } : null
        }
      })

      setItems(mergedItems)
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setLoading(false)
    }
  }

  // Clear all filters
  const clearFilters = () => {
    setFilterBranchId("all")
    setFilterEmployeeId("all")
    setSearchQuery("")
    setFilterStatuses([])
    setFilterCustomers([])
    setFilterProducts([])
    setFilterShippingProviders([])
    setDateFrom("")
    setDateTo("")
  }

  // Active filter count
  const activeFilterCount = [
    filterBranchId !== "all",
    filterEmployeeId !== "all",
    !!searchQuery,
    filterStatuses.length > 0,
    filterCustomers.length > 0,
    filterProducts.length > 0,
    filterShippingProviders.length > 0,
    !!dateFrom,
    !!dateTo
  ].filter(Boolean).length

  // فلترة البضائع
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // 🏢 فلتر الفرع (للمستخدمين المخولين فقط)
      if (canSeeBranchFilter && filterBranchId !== "all") {
        if (item.invoices?.branch_id !== filterBranchId) return false
      }

      // فلتر الموظف (منشئ أمر البيع)
      if (canViewAll && filterEmployeeId !== "all") {
        if (item.created_by_user_id !== filterEmployeeId) return false
      }

      // فلتر البحث
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const invoiceNumber = (item.invoices?.invoice_number || "").toLowerCase()
        const customerName = (item.invoices?.customers?.name || "").toLowerCase()
        const customerPhone = (item.invoices?.customers?.phone || "").toLowerCase()
        if (!invoiceNumber.includes(q) && !customerName.includes(q) && !customerPhone.includes(q)) return false
      }

      // فلتر الحالة
      if (filterStatuses.length > 0) {
        const invoiceStatus = item.invoices?.status || 'sent'
        if (!filterStatuses.includes(invoiceStatus)) return false
      }

      // فلتر العملاء
      if (filterCustomers.length > 0) {
        if (!item.invoices?.customer_id || !filterCustomers.includes(item.invoices.customer_id)) return false
      }

      // فلتر المنتجات
      if (filterProducts.length > 0) {
        if (!filterProducts.includes(item.product_id)) return false
      }

      // فلتر شركات الشحن
      if (filterShippingProviders.length > 0) {
        if (!filterShippingProviders.includes(item.shipping_provider_id)) return false
      }

      // فلتر التاريخ
      const itemDate = item.invoices?.invoice_date || item.created_at?.slice(0, 10)
      if (dateFrom && itemDate < dateFrom) return false
      if (dateTo && itemDate > dateTo) return false

      return true
    })
  }, [items, filterBranchId, filterEmployeeId, searchQuery, filterStatuses, filterCustomers, filterProducts, filterShippingProviders, dateFrom, dateTo, canViewAll, canSeeBranchFilter])

  // حساب الإحصائيات
  const stats = useMemo(() => {
    const getAvailable = (item: ThirdPartyItem) =>
      Number(item.quantity) - Number(item.cleared_quantity) - Number(item.returned_quantity)

    // ✅ حساب القيمة الصافية للبند بناءً على الكمية المتاحة
    const getNetValue = (item: ThirdPartyItem) => {
      const availableQty = getAvailable(item)
      const totalQty = Number(item.quantity) || 1
      // نسبة الكمية المتاحة من إجمالي الكمية
      const availableRatio = totalQty > 0 ? availableQty / totalQty : 0
      // القيمة الصافية = net_line_value * نسبة الكمية المتاحة
      const netLineValue = Number(item.net_line_value || 0)
      return netLineValue * availableRatio
    }

    return {
      totalItems: filteredItems.length,
      totalQuantity: filteredItems.reduce((sum, item) => sum + getAvailable(item), 0),
      // ✅ استخدام القيمة الصافية بعد جميع الخصومات (Invoice Net Total)
      totalValue: filteredItems.reduce((sum, item) => sum + getNetValue(item), 0),
      uniqueInvoices: new Set(filteredItems.map(item => item.invoice_id)).size
    }
  }, [filteredItems])

  const getAvailableQty = (item: ThirdPartyItem) =>
    Number(item.quantity) - Number(item.cleared_quantity) - Number(item.returned_quantity)

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">

          {/* Header - رأس الصفحة */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {isAr ? "بضائع لدى الغير" : "Third Party Goods"}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {isAr ? "تتبع البضائع المرسلة لشركات الشحن" : "Track goods sent to shipping companies"}
                  </p>
                  {/* 🔐 Governance Notice */}
                  {currentUserRole === 'store_manager' && isMainWarehouse ? (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      {isAr ? "📦 المخزن الرئيسي - تعرض جميع البضائع في الشركة" : "📦 Main Warehouse - Showing all company goods"}
                    </p>
                  ) : currentUserRole === 'store_manager' ? (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      {isAr ? "📦 تعرض البضائع الخاصة بفرعك فقط" : "📦 Showing goods from your branch only"}
                    </p>
                  ) : currentUserRole === 'manager' || currentUserRole === 'accountant' ? (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      {isAr ? "🏢 تعرض البضائع الخاصة بفرعك فقط" : "🏢 Showing goods from your branch only"}
                    </p>
                  ) : currentUserRole === 'staff' || currentUserRole === 'sales' || currentUserRole === 'employee' ? (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      {isAr ? "👨‍💼 تعرض البضائع من أوامر البيع التي أنشأتها فقط" : "👨‍💼 Showing goods from your sales orders only"}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* Stats Cards - بطاقات الإحصائيات */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  {isAr ? "عدد البنود" : "Items"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <Package className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-lg sm:text-2xl font-bold">{stats.totalItems}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  {isAr ? "عدد الفواتير" : "Invoices"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="text-lg sm:text-2xl font-bold">{stats.uniqueInvoices}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  {isAr ? "إجمالي الكمية" : "Total Qty"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <Truck className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <span className="text-lg sm:text-2xl font-bold text-orange-600">{stats.totalQuantity.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  {isAr ? "إجمالي القيمة" : "Total Value"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <span className="text-sm sm:text-2xl font-bold text-purple-600 truncate">{stats.totalValue.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters - الفلاتر القابلة للطي */}
          <FilterContainer
            title={isAr ? 'الفلاتر' : 'Filters'}
            activeCount={activeFilterCount}
            onClear={clearFilters}
            defaultOpen={false}
          >
            <div className="space-y-4">
              {/* 🏢 فلتر الفروع - يظهر فقط للمخولين (Owner/Admin/GM/Store Manager Main Warehouse) */}
              {canSeeBranchFilter && branches.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <Package className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                    {isAr ? 'فلترة حسب الفرع:' : 'Filter by Branch:'}
                  </span>
                  <Select
                    value={filterBranchId}
                    onValueChange={(value) => setFilterBranchId(value)}
                  >
                    <SelectTrigger className="w-[220px] h-9 bg-white dark:bg-slate-800">
                      <SelectValue placeholder={isAr ? 'جميع الفروع' : 'All Branches'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {isAr ? '🏢 جميع الفروع' : '🏢 All Branches'}
                      </SelectItem>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          🏪 {branch.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {filterBranchId !== "all" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFilterBranchId("all")}
                      className="h-8 px-3 text-purple-600 hover:text-purple-800 hover:bg-purple-100"
                    >
                      <X className="w-4 h-4 mr-1" />
                      {isAr ? 'مسح' : 'Clear'}
                    </Button>
                  )}
                </div>
              )}

              {/* فلتر الموظفين - صف منفصل أعلى الفلاتر - يظهر فقط للمديرين */}
              {canViewAll && employees.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <UserCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    {isAr ? 'فلترة حسب الموظف:' : 'Filter by Employee:'}
                  </span>
                  <Select
                    value={filterEmployeeId}
                    onValueChange={(value) => setFilterEmployeeId(value)}
                  >
                    <SelectTrigger className="w-[220px] h-9 bg-white dark:bg-slate-800">
                      <SelectValue placeholder={isAr ? 'جميع الموظفين' : 'All Employees'} />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-2 sticky top-0 bg-white dark:bg-slate-950 z-10 border-b">
                        <Input
                          value={employeeSearchQuery}
                          onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                          placeholder={isAr ? 'بحث في الموظفين...' : 'Search employees...'}
                          className="text-sm h-8"
                          autoComplete="off"
                        />
                      </div>
                      <SelectItem value="all">
                        {isAr ? '👥 جميع الموظفين' : '👥 All Employees'}
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
                      {isAr ? 'مسح' : 'Clear'}
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
                      placeholder={isAr ? 'بحث برقم الفاتورة، اسم العميل أو الهاتف...' : 'Search by invoice #, customer name or phone...'}
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

                {/* فلتر الحالة */}
                <MultiSelect
                  options={statusOptions}
                  selected={filterStatuses}
                  onChange={setFilterStatuses}
                  placeholder={isAr ? 'جميع الحالات' : 'All Statuses'}
                  searchPlaceholder={isAr ? 'بحث في الحالات...' : 'Search status...'}
                  emptyMessage={isAr ? 'لا توجد حالات' : 'No status found'}
                  className="h-10 text-sm"
                />

                {/* فلتر العميل */}
                <MultiSelect
                  options={customers.map((c) => ({ value: c.id, label: c.name }))}
                  selected={filterCustomers}
                  onChange={setFilterCustomers}
                  placeholder={isAr ? 'جميع العملاء' : 'All Customers'}
                  searchPlaceholder={isAr ? 'بحث في العملاء...' : 'Search customers...'}
                  emptyMessage={isAr ? 'لا يوجد عملاء' : 'No customers found'}
                  className="h-10 text-sm"
                />

                {/* فلتر المنتجات */}
                <MultiSelect
                  options={products.map((p) => ({ value: p.id, label: p.name }))}
                  selected={filterProducts}
                  onChange={setFilterProducts}
                  placeholder={isAr ? 'فلترة بالمنتجات' : 'Filter by Products'}
                  searchPlaceholder={isAr ? 'بحث في المنتجات...' : 'Search products...'}
                  emptyMessage={isAr ? 'لا توجد منتجات' : 'No products found'}
                  className="h-10 text-sm"
                />

                {/* فلتر شركة الشحن */}
                <MultiSelect
                  options={providers.map((p) => ({ value: p.id, label: p.provider_name }))}
                  selected={filterShippingProviders}
                  onChange={setFilterShippingProviders}
                  placeholder={isAr ? 'شركة الشحن' : 'Shipping Company'}
                  searchPlaceholder={isAr ? 'بحث في شركات الشحن...' : 'Search shipping...'}
                  emptyMessage={isAr ? 'لا توجد شركات شحن' : 'No shipping companies'}
                  className="h-10 text-sm"
                />

                {/* من تاريخ */}
                <div className="space-y-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400">
                    {isAr ? 'من تاريخ' : 'From Date'}
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
                    {isAr ? 'إلى تاريخ' : 'To Date'}
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
              {activeFilterCount > 0 && (
                <div className="flex justify-start items-center pt-2 border-t">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {isAr
                      ? `عرض ${filteredItems.length} من ${items.length} عنصر`
                      : `Showing ${filteredItems.length} of ${items.length} items`}
                  </span>
                </div>
              )}
            </div>
          </FilterContainer>

          {/* Table - جدول البضائع */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="pb-2 sm:pb-4 border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Package className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-sm sm:text-base">
                  {isAr ? "قائمة البضائع لدى الغير" : "Third Party Goods List"}
                </CardTitle>
                {filteredItems.length > 0 && (
                  <Badge variant="secondary" className="text-xs">{filteredItems.length}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 dark:bg-slate-800">
                      <TableHead className="text-xs sm:text-sm font-semibold">{isAr ? "المنتج" : "Product"}</TableHead>
                      <TableHead className="text-xs sm:text-sm font-semibold">{isAr ? "الفاتورة" : "Invoice"}</TableHead>
                      <TableHead className="text-xs sm:text-sm font-semibold hidden md:table-cell">{isAr ? "العميل" : "Customer"}</TableHead>
                      <TableHead className="text-xs sm:text-sm font-semibold">{isAr ? "شركة الشحن" : "Shipping"}</TableHead>
                      <TableHead className="text-xs sm:text-sm font-semibold hidden lg:table-cell">{isAr ? "الفرع" : "Branch"}</TableHead>
                      <TableHead className="text-xs sm:text-sm font-semibold hidden lg:table-cell">{isAr ? "المخزن" : "Warehouse"}</TableHead>
                      <TableHead className="text-xs sm:text-sm font-semibold text-center">{isAr ? "الكمية" : "Qty"}</TableHead>
                      <TableHead className="text-xs sm:text-sm font-semibold text-center hidden sm:table-cell">{isAr ? "السعر" : "Price"}</TableHead>
                      <TableHead className="text-xs sm:text-sm font-semibold text-center">{isAr ? "القيمة" : "Value"}</TableHead>
                      <TableHead className="text-xs sm:text-sm font-semibold text-center">{isAr ? "الحالة" : "Status"}</TableHead>
                      <TableHead className="text-xs sm:text-sm font-semibold text-center w-16">{isAr ? "عرض" : "View"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                          <Truck className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          {isAr ? "لا توجد بضائع لدى الغير" : "No third party goods found"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredItems.map(item => {
                        const availableQty = getAvailableQty(item)
                        const totalQty = Number(item.quantity) || 1
                        // ✅ حساب القيمة الصافية بعد جميع الخصومات (Invoice Net Total)
                        // نسبة الكمية المتاحة من إجمالي الكمية
                        const availableRatio = totalQty > 0 ? availableQty / totalQty : 0
                        // القيمة الصافية = net_line_value * نسبة الكمية المتاحة
                        const netLineValue = Number(item.net_line_value || 0)
                        const value = netLineValue * availableRatio

                        // ✅ حساب حالة الدفع الأساسية (مستنتجة من المبالغ)
                        const paidAmount = Number(item.invoices?.paid_amount || 0)
                        const returnedAmount = Number(item.invoices?.returned_amount || 0)
                        const originalTotal = Number(item.invoices?.original_total || item.invoices?.total_amount || 0)

                        // ✅ تحديد ما إذا كان المرتجع كامل (بناءً على original_total)
                        const isFullyReturned = returnedAmount >= originalTotal && originalTotal > 0

                        // تحديد حالة الدفع الأساسية
                        let paymentStatus: string
                        if (isFullyReturned) {
                          paymentStatus = 'fully_returned'
                        } else if (paidAmount >= originalTotal && originalTotal > 0) {
                          paymentStatus = 'paid'
                        } else if (paidAmount > 0) {
                          paymentStatus = 'partially_paid'
                        } else {
                          paymentStatus = 'sent'
                        }

                        // تحديد ما إذا كان هناك مرتجع جزئي
                        const hasPartialReturn = returnedAmount > 0 && returnedAmount < originalTotal
                        return (
                          <TableRow key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                            {/* المنتج */}
                            <TableCell>
                              <div className="font-medium text-xs sm:text-sm">{item.products?.name}</div>
                              <div className="text-[10px] sm:text-xs text-gray-500">{item.products?.sku}</div>
                            </TableCell>
                            {/* الفاتورة */}
                            <TableCell className="text-xs sm:text-sm">
                              <Link href={`/invoices/${item.invoice_id}`} className="text-blue-600 hover:underline font-medium">
                                {item.invoices?.invoice_number}
                              </Link>
                            </TableCell>
                            {/* العميل */}
                            <TableCell className="text-xs sm:text-sm hidden md:table-cell">
                              {item.invoices?.customers?.name || '-'}
                            </TableCell>
                            {/* شركة الشحن */}
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] sm:text-xs bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-800">
                                <Truck className="h-3 w-3 ml-1" />
                                {item.shipping_providers?.provider_name}
                              </Badge>
                            </TableCell>
                            {/* الفرع */}
                            <TableCell className="text-xs sm:text-sm hidden lg:table-cell">
                              {item.invoices?.branches?.name || '-'}
                            </TableCell>
                            {/* المخزن */}
                            <TableCell className="text-xs sm:text-sm hidden lg:table-cell">
                              {item.invoices?.warehouses?.name || '-'}
                            </TableCell>
                            {/* الكمية */}
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="text-xs font-bold min-w-[40px]">
                                {availableQty.toLocaleString()}
                              </Badge>
                            </TableCell>
                            {/* السعر */}
                            <TableCell className="text-xs sm:text-sm text-center hidden sm:table-cell">
                              {Number(item.unit_price || item.unit_cost).toLocaleString()}
                            </TableCell>
                            {/* القيمة */}
                            <TableCell className="text-center">
                              <span className="font-bold text-xs sm:text-sm text-green-600 dark:text-green-400">
                                {value.toLocaleString()}
                              </span>
                            </TableCell>
                            {/* الحالة */}
                            <TableCell className="text-center">
                              <div className="flex flex-col items-center gap-1">
                                {/* حالة الدفع الأساسية */}
                                <StatusBadge status={paymentStatus} lang={appLang} />

                                {/* حالة المرتجع الجزئي (إن وجد) */}
                                {hasPartialReturn && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                                    {appLang === 'en' ? 'Partial Return' : 'مرتجع جزئي'}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            {/* عرض */}
                            <TableCell className="text-center">
                              {canAccessInvoices ? (
                                <Link href={`/invoices/${item.invoice_id}`}>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-blue-50 dark:hover:bg-blue-900/20" title={isAr ? "عرض الفاتورة" : "View Invoice"}>
                                    <ExternalLink className="h-4 w-4 text-blue-600" />
                                  </Button>
                                </Link>
                              ) : item.invoices?.sales_order_id ? (
                                <Link href={`/sales-orders/${item.invoices.sales_order_id}`}>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-blue-50 dark:hover:bg-blue-900/20" title={isAr ? "عرض أمر البيع" : "View Sales Order"}>
                                    <ExternalLink className="h-4 w-4 text-blue-600" />
                                  </Button>
                                </Link>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                    {/* صف الإجمالي */}
                    {filteredItems.length > 0 && (
                      <TableRow className="bg-gray-100 dark:bg-slate-800 font-bold border-t-2 border-gray-300 dark:border-slate-600">
                        <TableCell colSpan={6} className="text-sm">
                          <span className="text-gray-700 dark:text-gray-200">
                            {isAr ? "الإجمالي" : "Total"} ({stats.uniqueInvoices} {isAr ? "فاتورة" : "invoices"})
                          </span>
                        </TableCell>
                        {/* الكمية */}
                        <TableCell className="text-center">
                          <Badge variant="default" className="text-sm font-bold bg-blue-600 hover:bg-blue-600">
                            {stats.totalQuantity.toLocaleString()}
                          </Badge>
                        </TableCell>
                        {/* السعر - فارغ */}
                        <TableCell className="hidden sm:table-cell"></TableCell>
                        {/* القيمة */}
                        <TableCell className="text-center">
                          <span className="text-lg font-bold text-green-600 dark:text-green-400">
                            {stats.totalValue.toLocaleString()}
                          </span>
                        </TableCell>
                        {/* الحالة - فارغ */}
                        <TableCell></TableCell>
                        {/* عرض - فارغ */}
                        <TableCell></TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  )
}

