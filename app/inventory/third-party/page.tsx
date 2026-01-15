"use client"

import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
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
import { type UserContext } from "@/lib/validation"
import { StatusBadge } from "@/components/DataTableFormatters"

interface ThirdPartyItem {
  id: string
  invoice_id: string
  product_id: string
  quantity: number
  unit_cost: number
  cleared_quantity: number
  returned_quantity: number
  status: string
  shipping_provider_id: string
  created_at: string
  created_by?: string
  invoices?: { 
    invoice_number: string
    customer_id: string
    invoice_date?: string
    status?: string
    branch_id?: string | null
    warehouse_id?: string | null
    sales_order_id?: string | null
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
  const [items, setItems] = useState<ThirdPartyItem[]>([])
  const [providers, setProviders] = useState<ShippingProvider[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  // 🔐 ERP Access Control
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>("employee")

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
  const [filterCustomers, setFilterCustomers] = useState<string[]>([])
  const [filterProducts, setFilterProducts] = useState<string[]>([])
  const [filterShippingProviders, setFilterShippingProviders] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  // Can view all (manager/admin/owner)
  const canViewAll = ["owner", "admin", "manager"].includes(currentUserRole)

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
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setCurrentUserId(user.id)
        const { data: member } = await supabase
          .from("company_members")
          .select("role, branch_id, cost_center_id, warehouse_id")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .single()
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
        }
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

      // جلب الموظفين (للمديرين فقط)
      const { data: membersData } = await supabase
        .from("company_members")
        .select("user_id, role, email")
        .eq("company_id", companyId)

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

      // ✅ جلب الفواتير المرسلة (Sent/Confirmed) مع شركات الشحن
      // ثم ربطها مع third_party_inventory للحصول على الكميات
      const { data: sentInvoices, error: invoicesErr } = await supabase
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
          customers(name, phone),
          branches(name),
          warehouses(name)
        `)
        .eq("company_id", companyId)
        .in("status", ["sent", "confirmed"])
        .not("shipping_provider_id", "is", null)
        .order("invoice_date", { ascending: false })

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

      // دمج البيانات: ربط third_party_inventory مع بيانات الفاتورة
      const mergedItems = (thirdPartyData || []).map((tpi: any) => {
        const invoice = (sentInvoices || []).find((inv: any) => inv.id === tpi.invoice_id)
        return {
          ...tpi,
          invoices: invoice ? {
            invoice_number: invoice.invoice_number,
            customer_id: invoice.customer_id,
            invoice_date: invoice.invoice_date,
            status: invoice.status,
            branch_id: invoice.branch_id,
            warehouse_id: invoice.warehouse_id,
            sales_order_id: invoice.sales_order_id,
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
    setFilterEmployeeId("all")
    setSearchQuery("")
    setFilterCustomers([])
    setFilterProducts([])
    setFilterShippingProviders([])
    setDateFrom("")
    setDateTo("")
  }

  // Active filter count
  const activeFilterCount = [
    filterEmployeeId !== "all",
    !!searchQuery,
    filterCustomers.length > 0,
    filterProducts.length > 0,
    filterShippingProviders.length > 0,
    !!dateFrom,
    !!dateTo
  ].filter(Boolean).length

  // فلترة البضائع
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // فلتر الموظف
      if (canViewAll && filterEmployeeId !== "all") {
        if (item.created_by !== filterEmployeeId) return false
      }

      // فلتر البحث
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const invoiceNumber = (item.invoices?.invoice_number || "").toLowerCase()
        const customerName = (item.invoices?.customers?.name || "").toLowerCase()
        const customerPhone = (item.invoices?.customers?.phone || "").toLowerCase()
        if (!invoiceNumber.includes(q) && !customerName.includes(q) && !customerPhone.includes(q)) return false
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
  }, [items, filterEmployeeId, searchQuery, filterCustomers, filterProducts, filterShippingProviders, dateFrom, dateTo, canViewAll])

  // حساب الإحصائيات
  const stats = useMemo(() => {
    const getAvailable = (item: ThirdPartyItem) =>
      Number(item.quantity) - Number(item.cleared_quantity) - Number(item.returned_quantity)

    return {
      totalItems: filteredItems.length,
      totalQuantity: filteredItems.reduce((sum, item) => sum + getAvailable(item), 0),
      totalValue: filteredItems.reduce((sum, item) => sum + (getAvailable(item) * Number(item.unit_cost)), 0),
      uniqueInvoices: new Set(filteredItems.map(item => item.invoice_id)).size
    }
  }, [filteredItems])

  const getAvailableQty = (item: ThirdPartyItem) =>
    Number(item.quantity) - Number(item.cleared_quantity) - Number(item.returned_quantity)

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
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
      <Sidebar />
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
              {/* فلتر الموظفين - صف منفصل أعلى الفلاتر - يظهر فقط للمديرين */}
              {canViewAll && employees.length > 0 && (
                <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
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
                      <TableHead className="text-xs sm:text-sm">{isAr ? "المنتج" : "Product"}</TableHead>
                      <TableHead className="text-xs sm:text-sm">{isAr ? "الفاتورة" : "Invoice"}</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden sm:table-cell">{isAr ? "العميل" : "Customer"}</TableHead>
                      <TableHead className="text-xs sm:text-sm">{isAr ? "شركة الشحن" : "Provider"}</TableHead>
                      <TableHead className="text-xs sm:text-sm text-center">{isAr ? "الكمية" : "Qty"}</TableHead>
                      <TableHead className="text-xs sm:text-sm text-center hidden sm:table-cell">{isAr ? "التكلفة" : "Cost"}</TableHead>
                      <TableHead className="text-xs sm:text-sm text-center">{isAr ? "القيمة" : "Value"}</TableHead>
                      <TableHead className="text-xs sm:text-sm text-center">{isAr ? "عرض" : "View"}</TableHead>
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
                        const value = availableQty * Number(item.unit_cost)
                        const invoiceStatus = item.invoices?.status || 'sent'
                        return (
                          <TableRow key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                            <TableCell>
                              <div className="font-medium text-xs sm:text-sm">{item.products?.name}</div>
                              <div className="text-[10px] sm:text-xs text-gray-500">{item.products?.sku}</div>
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm">
                              <Link href={`/invoices/${item.invoice_id}`} className="text-blue-600 hover:underline">
                                {item.invoices?.invoice_number}
                              </Link>
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm hidden sm:table-cell">
                              {item.invoices?.customers?.name || '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] sm:text-xs bg-orange-50 text-orange-700 border-orange-200">
                                <Truck className="h-3 w-3 mr-1" />
                                {item.shipping_providers?.provider_name}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary" className="text-xs font-bold">
                                {availableQty}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm hidden lg:table-cell">
                              {item.invoices?.branches?.name || '-'}
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm hidden lg:table-cell">
                              {item.invoices?.warehouses?.name || '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              <StatusBadge status={invoiceStatus} lang={appLang} />
                            </TableCell>
                            <TableCell className="text-xs sm:text-sm text-center hidden sm:table-cell">
                              {Number(item.unit_cost).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-center">
                              <span className="font-bold text-xs sm:text-sm text-green-600">
                                {value.toLocaleString()}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              {item.invoices?.sales_order_id ? (
                                <Link href={`/sales-orders/${item.invoices.sales_order_id}`}>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title={isAr ? "عرض أمر البيع" : "View Sales Order"}>
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                </Link>
                              ) : (
                                <Link href={`/invoices/${item.invoice_id}`}>
                                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title={isAr ? "عرض الفاتورة" : "View Invoice"}>
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                </Link>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })
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

