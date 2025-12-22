"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FilterContainer } from "@/components/ui/filter-container"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { ensureCompanyId, getActiveCompanyId } from "@/lib/company"
import { Plus, Edit2, Trash2, Search, AlertCircle, Package, Wrench } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { canAction } from "@/lib/authz"
import { usePagination } from "@/lib/pagination"
import { DataPagination } from "@/components/data-pagination"
import { ListErrorBoundary } from "@/components/list-error-boundary"
import { validatePrice, getValidationError, validateField } from "@/lib/validation"
import { DataTable, type DataTableColumn } from "@/components/DataTable"

interface Product {
  id: string
  sku: string
  name: string
  description: string
  unit_price: number
  cost_price: number
  unit: string
  quantity_on_hand: number
  reorder_level: number
  original_unit_price?: number
  original_cost_price?: number
  display_unit_price?: number
  display_cost_price?: number
  display_currency?: string
  item_type: 'product' | 'service'
  income_account_id?: string | null
  expense_account_id?: string | null
  cost_center?: string | null
  cost_center_id?: string | null
  branch_id?: string | null
  warehouse_id?: string | null
  tax_code_id?: string | null
  selling_price?: number | null
}

interface Branch {
  id: string
  branch_name: string
  branch_code: string
}

interface Warehouse {
  id: string
  name: string
  code: string
  branch_id: string | null
}

interface CostCenter {
  id: string
  cost_center_name: string
  cost_center_code: string
  branch_id: string | null
}

interface Account {
  id: string
  account_code: string
  account_name: string
  account_type: string
}

export default function ProductsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try {
      const docLang = document.documentElement?.lang
      if (docLang === 'en') return 'en'
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      const v = fromCookie || localStorage.getItem('app_language') || 'ar'
      return v === 'en' ? 'en' : 'ar'
    } catch { return 'ar' }
  })
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    description: "",
    unit_price: 0,
    cost_price: 0,
    unit: "piece",
    quantity_on_hand: 0,
    reorder_level: 0,
    item_type: "product" as 'product' | 'service',
    income_account_id: "",
    expense_account_id: "",
    cost_center: "",
    cost_center_id: "",
    branch_id: "",
    warehouse_id: "",
    tax_code_id: "",
  })
  const [taxCodes, setTaxCodes] = useState<{ id: string; name: string; rate: number; scope: string }[]>([])
  const [productTaxDefaults, setProductTaxDefaults] = useState<Record<string, string>>({})
  const [accounts, setAccounts] = useState<Account[]>([])
  const [activeTab, setActiveTab] = useState<'all' | 'products' | 'services'>('all')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  // 🏢 بيانات الفروع والمستودعات ومراكز التكلفة
  const [branches, setBranches] = useState<Branch[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])

  // === إصلاح أمني: صلاحيات المنتجات ===
  const [permWrite, setPermWrite] = useState(false)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)
  const [canViewCOGS, setCanViewCOGS] = useState(false) // صلاحية رؤية سعر التكلفة
  const [userRole, setUserRole] = useState<string>("")

  // التحقق من الصلاحيات
  useEffect(() => {
    const checkPerms = async () => {
      const [write, update, del] = await Promise.all([
        canAction(supabase, "products", "write"),
        canAction(supabase, "products", "update"),
        canAction(supabase, "products", "delete"),
      ])
      setPermWrite(write)
      setPermUpdate(update)
      setPermDelete(del)

      // التحقق من صلاحية رؤية التكلفة (owner, admin, accountant, manager فقط)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const companyId = await getActiveCompanyId(supabase)
          if (companyId) {
            const { data: member } = await supabase
              .from("company_members")
              .select("role")
              .eq("company_id", companyId)
              .eq("user_id", user.id)
              .maybeSingle()

            const role = member?.role || ""
            setUserRole(role)
            // فقط هذه الأدوار يمكنها رؤية سعر التكلفة
            setCanViewCOGS(["owner", "admin", "accountant", "manager"].includes(role))
          }
        }
      } catch (err) {
        console.error("Error checking COGS permission:", err)
      }
    }
    checkPerms()
  }, [supabase])

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

  // Helper: Get display price (use converted if available)
  const getDisplayPrice = (product: Product, field: 'unit' | 'cost'): number => {
    if (field === 'unit') {
      if (product.display_currency === appCurrency && product.display_unit_price != null) {
        return product.display_unit_price
      }
      return product.unit_price
    } else {
      if (product.display_currency === appCurrency && product.display_cost_price != null) {
        return product.display_cost_price
      }
      return product.cost_price
    }
  }

  useEffect(() => {
    // Listen for currency changes
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency') || 'EGP'
      setAppCurrency(newCurrency)
      // Reload products to get updated display prices
      loadProducts()
    }
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [])

  useEffect(() => {
    loadProducts()
    loadAccounts()
    loadBranchesAndWarehouses() // 🏢 تحميل الفروع والمستودعات
    try {
      const rawCodes = localStorage.getItem("tax_codes")
      const parsedCodes = rawCodes ? JSON.parse(rawCodes) : []
      setTaxCodes(parsedCodes)
    } catch { setTaxCodes([]) }
    try {
      const rawDefaults = localStorage.getItem("product_tax_defaults")
      const parsedDefaults = rawDefaults ? JSON.parse(rawDefaults) : {}
      setProductTaxDefaults(parsedDefaults)
    } catch { setProductTaxDefaults({}) }
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang
        if (docLang === 'en') { setAppLang('en'); return }
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        const v = fromCookie || localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    window.addEventListener('app_language_changed', handler)
    window.addEventListener('storage', (e: any) => { if (e?.key === 'app_language') handler() })
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

  const loadAccounts = async () => {
    try {
      const companyId = await ensureCompanyId(supabase)
      if (!companyId) return
      const { data } = await supabase
        .from('chart_of_accounts')
        .select('id, account_code, account_name, account_type')
        .eq('company_id', companyId)
        .in('account_type', ['income', 'expense'])
        .order('account_code')
      setAccounts(data || [])
    } catch (error) {
      console.error("Error loading accounts:", error)
    }
  }

  // 🏢 تحميل الفروع والمستودعات ومراكز التكلفة
  const loadBranchesAndWarehouses = async () => {
    try {
      const companyId = await ensureCompanyId(supabase)
      if (!companyId) return

      // تحميل الفروع
      const { data: branchesData } = await supabase
        .from('branches')
        .select('id, branch_name, branch_code')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('branch_name')
      setBranches(branchesData || [])

      // تحميل المستودعات
      const { data: warehousesData } = await supabase
        .from('warehouses')
        .select('id, name, code, branch_id')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name')
      setWarehouses(warehousesData || [])

      // تحميل مراكز التكلفة
      const { data: costCentersData } = await supabase
        .from('cost_centers')
        .select('id, cost_center_name, cost_center_code, branch_id')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('cost_center_name')
      setCostCenters(costCentersData || [])
    } catch (error) {
      console.error("Error loading branches/warehouses:", error)
    }
  }

  // فلترة المستودعات ومراكز التكلفة حسب الفرع المختار
  const filteredWarehouses = formData.branch_id
    ? warehouses.filter(w => w.branch_id === formData.branch_id || !w.branch_id)
    : warehouses

  const filteredCostCenters = formData.branch_id
    ? costCenters.filter(cc => cc.branch_id === formData.branch_id || !cc.branch_id)
    : costCenters

  const loadProducts = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/products-list')
      if (res.ok) {
        const data = await res.json()
        setProducts(Array.isArray(data) ? data : [])
      } else {
        const companyId = await ensureCompanyId(supabase)
        if (!companyId) return
        const { data } = await supabase.from('products').select('*').eq('company_id', companyId)
        setProducts(data || [])
      }
    } catch (error) {
      console.error("Error loading products:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const [isSaving, setIsSaving] = useState(false)

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}

    // Validate unit price
    const unitPriceValidation = validateField(formData.unit_price.toString(), 'amount')
    if (!unitPriceValidation.isValid) {
      errors.unit_price = unitPriceValidation.error || ''
    }

    // Validate cost price (only if user can view COGS and it's provided)
    if (canViewCOGS && formData.cost_price > 0) {
      const costPriceValidation = validateField(formData.cost_price.toString(), 'amount')
      if (!costPriceValidation.isValid) {
        errors.cost_price = costPriceValidation.error || ''
      }
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    
    // Validate form first
    if (!validateForm()) {
      setIsSaving(false)
      return
    }
    
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        toastActionError(toast, appLang === 'en' ? 'You must be logged in' : 'يجب تسجيل الدخول أولاً')
        return
      }

      // التحقق من الحقول المطلوبة
      if (!formData.sku.trim()) {
        toastActionError(toast, appLang === 'en' ? 'SKU code is required' : 'الرمز (SKU) مطلوب')
        return
      }
      if (!formData.name.trim()) {
        toastActionError(toast, appLang === 'en' ? 'Name is required' : 'الاسم مطلوب')
        return
      }

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        toastActionError(toast, appLang === 'en' ? 'No company selected' : 'لم يتم اختيار شركة')
        return
      }

      // Get system currency for original values
      const systemCurrency = typeof window !== 'undefined'
        ? localStorage.getItem('original_system_currency') || 'EGP'
        : 'EGP'

      // Prepare data based on item type
      const saveData = {
        ...formData,
        // For services, set inventory fields to 0/null
        quantity_on_hand: formData.item_type === 'service' ? 0 : formData.quantity_on_hand,
        reorder_level: formData.item_type === 'service' ? 0 : formData.reorder_level,
        unit: formData.item_type === 'service' ? 'service' : formData.unit,
        income_account_id: formData.income_account_id || null,
        expense_account_id: formData.expense_account_id || null,
        tax_code_id: formData.tax_code_id || null,
        // 🏢 حقول الموقع - الفرع ومركز التكلفة للمنتجات والخدمات، المستودع للمنتجات فقط
        branch_id: formData.branch_id || null,
        warehouse_id: formData.item_type === 'service' ? null : (formData.warehouse_id || null),
        cost_center_id: formData.cost_center_id || null,
      }

      if (editingId) {
        const { error } = await supabase.from("products").update(saveData).eq("id", editingId)
        if (error) throw error
        toastActionSuccess(toast, appLang === 'en' ? 'Item updated successfully' : 'تم تحديث الصنف بنجاح')
      } else {
        // Store original values for multi-currency support
        const { error } = await supabase.from("products").insert([{
          ...saveData,
          company_id: companyId,
          original_unit_price: formData.unit_price,
          original_cost_price: formData.cost_price,
          original_currency: systemCurrency,
          exchange_rate_used: 1,
        }])
        if (error) throw error
        toastActionSuccess(toast, appLang === 'en' ? 'Item added successfully' : 'تمت إضافة الصنف بنجاح')
      }

      setIsDialogOpen(false)
      setEditingId(null)
      resetFormData()
      loadProducts()
    } catch (error: any) {
      console.error("Error saving product:", error)
      const errorMsg = error?.message || (appLang === 'en' ? 'Failed to save item' : 'فشل في حفظ الصنف')
      toastActionError(toast, errorMsg)
    } finally {
      setIsSaving(false)
    }
  }

  const resetFormData = () => {
    setFormData({
      sku: "",
      name: "",
      description: "",
      unit_price: 0,
      cost_price: 0,
      unit: "piece",
      quantity_on_hand: 0,
      reorder_level: 0,
      item_type: "product",
      income_account_id: "",
      expense_account_id: "",
      cost_center: "",
      cost_center_id: "",
      branch_id: "",
      warehouse_id: "",
      tax_code_id: "",
    })
    setFormErrors({})
  }

  const handleEdit = (product: Product) => {
    setFormData({
      ...product,
      income_account_id: product.income_account_id || "",
      expense_account_id: product.expense_account_id || "",
      cost_center: product.cost_center || "",
      cost_center_id: product.cost_center_id || "",
      branch_id: product.branch_id || "",
      warehouse_id: product.warehouse_id || "",
      tax_code_id: product.tax_code_id || "",
    } as any)
    setEditingId(product.id)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      // التحقق من وجود فواتير مرتبطة بالمنتج
      const { data: invoiceItems, error: invErr } = await supabase
        .from("invoice_items")
        .select("id")
        .eq("product_id", id)
        .limit(1)

      if (invErr) throw invErr

      if (invoiceItems && invoiceItems.length > 0) {
        toastActionError(
          toast,
          appLang === 'en' ? 'Delete' : 'الحذف',
          appLang === 'en' ? 'Product' : 'المنتج',
          appLang === 'en'
            ? 'Cannot delete product: It is used in invoices. Please delete related invoices first.'
            : 'لا يمكن حذف المنتج: يوجد فواتير مرتبطة به. يرجى حذف الفواتير المرتبطة أولاً.'
        )
        return
      }

      // التحقق من وجود فواتير شراء مرتبطة بالمنتج
      const { data: billItems, error: billErr } = await supabase
        .from("bill_items")
        .select("id")
        .eq("product_id", id)
        .limit(1)

      if (billErr) throw billErr

      if (billItems && billItems.length > 0) {
        toastActionError(
          toast,
          appLang === 'en' ? 'Delete' : 'الحذف',
          appLang === 'en' ? 'Product' : 'المنتج',
          appLang === 'en'
            ? 'Cannot delete product: It is used in purchase bills. Please delete related bills first.'
            : 'لا يمكن حذف المنتج: يوجد فواتير شراء مرتبطة به. يرجى حذف الفواتير المرتبطة أولاً.'
        )
        return
      }

      // التحقق من وجود حركات مخزون مرتبطة بالمنتج
      const { data: invTxns, error: txnErr } = await supabase
        .from("inventory_transactions")
        .select("id")
        .eq("product_id", id)
        .limit(1)

      if (txnErr) throw txnErr

      if (invTxns && invTxns.length > 0) {
        toastActionError(
          toast,
          appLang === 'en' ? 'Delete' : 'الحذف',
          appLang === 'en' ? 'Product' : 'المنتج',
          appLang === 'en'
            ? 'Cannot delete product: It has inventory transactions. Please delete related transactions first.'
            : 'لا يمكن حذف المنتج: يوجد حركات مخزون مرتبطة به. يرجى حذف الحركات المرتبطة أولاً.'
        )
        return
      }

      // حذف المنتج إذا لم تكن هناك سجلات مرتبطة
      const { error } = await supabase.from("products").delete().eq("id", id)
      if (error) throw error

      toastActionSuccess(
        toast,
        appLang === 'en' ? 'Delete' : 'الحذف',
        appLang === 'en' ? 'Product deleted successfully' : 'تم حذف المنتج بنجاح'
      )
      loadProducts()
    } catch (error: any) {
      console.error("Error deleting product:", error)
      toastActionError(
        toast,
        appLang === 'en' ? 'Delete' : 'الحذف',
        appLang === 'en' ? 'Product' : 'المنتج',
        error?.message || (appLang === 'en' ? 'Failed to delete product' : 'فشل في حذف المنتج')
      )
    }
  }

  // حساب عدد الفلاتر النشطة
  const activeFilterCount = [
    !!searchTerm,
    activeTab !== 'all'
  ].filter(Boolean).length

  const clearFilters = () => {
    setSearchTerm("")
    setActiveTab('all')
  }

  // Filter products based on search and active tab
  const filteredProducts = products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesTab = activeTab === 'all' ||
      (activeTab === 'products' && (product.item_type === 'product' || !product.item_type)) ||
      (activeTab === 'services' && product.item_type === 'service')
    return matchesSearch && matchesTab
  })

  // Pagination logic
  const {
    currentPage,
    totalPages,
    totalItems,
    paginatedItems: paginatedProducts,
    hasNext,
    hasPrevious,
    goToPage,
    nextPage,
    previousPage,
    setPageSize: updatePageSize
  } = usePagination(filteredProducts, { pageSize })

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    updatePageSize(newSize)
  }

  const setProductDefaultTax = (productId: string, taxCodeId: string) => {
    const next = { ...productTaxDefaults, [productId]: taxCodeId }
    setProductTaxDefaults(next)
    try {
      localStorage.setItem("product_tax_defaults", JSON.stringify(next))
    } catch {}
  }

  // تعريف أعمدة الجدول
  const tableColumns: DataTableColumn<Product>[] = useMemo(() => {
    const columns: DataTableColumn<Product>[] = [
      {
        key: 'item_type',
        header: appLang === 'en' ? 'Type' : 'النوع',
        type: 'custom',
        align: 'center',
        hidden: 'md',
        format: (_, row) => {
          const isProduct = row.item_type === 'product' || !row.item_type
          return isProduct ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded text-xs font-medium">
              <Package className="w-3 h-3" />
              {appLang === 'en' ? 'Product' : 'منتج'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded text-xs font-medium">
              <Wrench className="w-3 h-3" />
              {appLang === 'en' ? 'Service' : 'خدمة'}
            </span>
          )
        }
      },
      {
        key: 'sku',
        header: appLang === 'en' ? 'Code' : 'الرمز',
        type: 'text',
        align: 'left',
        hidden: 'lg',
        format: (value) => (
          <span className="font-medium text-gray-600 dark:text-gray-400">{value}</span>
        )
      },
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
        key: 'unit_price',
        header: appLang === 'en' ? 'Price' : 'السعر',
        type: 'currency',
        align: 'right',
        format: (_, row) => `${getDisplayPrice(row, 'unit').toFixed(2)} ${currencySymbol}`
      },
      {
        key: 'cost',
        header: appLang === 'en' ? 'Cost' : 'التكلفة',
        type: 'currency',
        align: 'right',
        hidden: 'lg',
        format: (_, row) => `${getDisplayPrice(row, 'cost').toFixed(2)} ${currencySymbol}`
      }
    ]

    // إضافة أعمدة الكمية فقط للمنتجات (ليس الخدمات)
    if (activeTab !== 'services') {
      columns.push(
        {
          key: 'quantity_on_hand',
          header: appLang === 'en' ? 'Qty' : 'الكمية',
          type: 'number',
          align: 'right',
          hidden: 'sm',
          format: (_, row) => {
            const isProduct = row.item_type === 'product' || !row.item_type
            return isProduct ? row.quantity_on_hand : '-'
          }
        },
        {
          key: 'reorder_level',
          header: appLang === 'en' ? 'Reorder' : 'حد الطلب',
          type: 'number',
          align: 'right',
          hidden: 'xl',
          format: (_, row) => {
            const isProduct = row.item_type === 'product' || !row.item_type
            return isProduct ? row.reorder_level : '-'
          }
        }
      )
    }

    // إضافة عمود الضريبة
    columns.push({
      key: 'id',
      header: appLang === 'en' ? 'Tax' : 'الضريبة',
      type: 'custom',
      align: 'center',
      hidden: 'lg',
      format: (_, row) => (
        <select
          className="w-full px-2 py-1 border rounded text-xs dark:bg-slate-700 dark:border-slate-600"
          value={productTaxDefaults[row.id] ?? ""}
          onChange={(e) => setProductDefaultTax(row.id, e.target.value)}
        >
          <option value="">{appLang === 'en' ? 'None' : 'بدون'}</option>
          {taxCodes
            .filter((c) => c.scope === "sales" || c.scope === "both")
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.rate}%)
              </option>
            ))}
        </select>
      )
    })

    // إضافة عمود الحالة
    columns.push({
      key: 'id',
      header: appLang === 'en' ? 'Status' : 'الحالة',
      type: 'status',
      align: 'center',
      hidden: 'sm',
      format: (_, row) => {
        const isProduct = row.item_type === 'product' || !row.item_type
        const isLowStock = isProduct && row.quantity_on_hand <= row.reorder_level
        return isProduct ? (
          isLowStock ? (
            <span className="px-2 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 rounded text-xs font-medium">
              {appLang === 'en' ? 'Low' : 'منخفض'}
            </span>
          ) : (
            <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded text-xs font-medium">
              {appLang === 'en' ? 'OK' : 'متوفر'}
            </span>
          )
        ) : (
          <span className="px-2 py-1 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 rounded text-xs font-medium">
            {appLang === 'en' ? 'Active' : 'نشط'}
          </span>
        )
      }
    })

    // إضافة عمود الإجراءات
    columns.push({
      key: 'id',
      header: appLang === 'en' ? 'Actions' : 'إجراءات',
      type: 'actions',
      align: 'center',
      format: (_, row) => (
        <div className="flex gap-1 justify-center">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => handleEdit(row)}
            disabled={!permUpdate}
            title={appLang === 'en' ? 'Edit product' : 'تعديل المنتج'}
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-500 hover:text-red-600"
            onClick={() => handleDelete(row.id)}
            disabled={!permDelete}
            title={appLang === 'en' ? 'Delete product' : 'حذف المنتج'}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )
    })

    return columns
  }, [appLang, currencySymbol, activeTab, productTaxDefaults, taxCodes, permUpdate, permDelete])

  const lowStockProducts = products.filter((p) => (p.item_type === 'product' || !p.item_type) && p.quantity_on_hand <= p.reorder_level)
  const productsCount = products.filter(p => p.item_type === 'product' || !p.item_type).length
  const servicesCount = products.filter(p => p.item_type === 'service').length

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <ListErrorBoundary listType="products" lang={appLang}>
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <Package className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang==='en' ? 'Products & Services' : 'المنتجات والخدمات'}</h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {appLang==='en'
                      ? `${productsCount} Products · ${servicesCount} Services`
                      : `${productsCount} منتج · ${servicesCount} خدمة`}
                  </p>
                </div>
              </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="h-10 sm:h-11 text-sm sm:text-base px-3 sm:px-4 self-start sm:self-auto" onClick={() => { setEditingId(null); resetFormData() }}>
                  <Plus className="w-4 h-4 ml-1 sm:ml-2" />
                  {appLang==='en' ? 'New' : 'جديد'}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {editingId
                      ? (appLang==='en' ? 'Edit Item' : 'تعديل صنف')
                      : (appLang==='en' ? 'Add New Item' : 'إضافة صنف جديد')}
                  </DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Item Type Selection */}
                  <div className="space-y-2">
                    <Label>{appLang==='en' ? 'Item Type' : 'نوع الصنف'}</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={formData.item_type === 'product' ? 'default' : 'outline'}
                        className="flex-1"
                        onClick={() => setFormData({ ...formData, item_type: 'product' })}
                      >
                        <Package className="w-4 h-4 mr-2" />
                        {appLang==='en' ? 'Product' : 'منتج'}
                      </Button>
                      <Button
                        type="button"
                        variant={formData.item_type === 'service' ? 'default' : 'outline'}
                        className="flex-1"
                        onClick={() => setFormData({ ...formData, item_type: 'service' })}
                      >
                        <Wrench className="w-4 h-4 mr-2" />
                        {appLang==='en' ? 'Service' : 'خدمة'}
                      </Button>
                    </div>
                  </div>

                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="sku">{appLang==='en' ? 'Code (SKU)' : 'الرمز (SKU)'}</Label>
                      <Input
                        id="sku"
                        value={formData.sku}
                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="name">{appLang==='en' ? 'Name' : 'الاسم'}</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">{appLang==='en' ? 'Description' : 'الوصف'}</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>

                  {/* Pricing */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="unit_price">{appLang==='en' ? 'Sale Price' : 'سعر البيع'}</Label>
                      <Input
                        id="unit_price"
                        type="number"
                        step="0.01"
                        value={formData.unit_price}
                        onChange={(e) => {
                          setFormData({ ...formData, unit_price: Number.parseFloat(e.target.value) || 0 })
                          setFormErrors({ ...formErrors, unit_price: '' })
                        }}
                        className={formErrors.unit_price ? 'border-red-500' : ''}
                        required
                      />
                      {formErrors.unit_price && (
                        <p className="text-sm text-red-500">{formErrors.unit_price}</p>
                      )}
                    </div>
                    {/* === إصلاح أمني: إخفاء سعر التكلفة للمستخدمين غير المصرح لهم === */}
                    {canViewCOGS && (
                      <div className="space-y-2">
                        <Label htmlFor="cost_price">{appLang==='en' ? 'Cost Price' : 'سعر التكلفة'}</Label>
                        <Input
                          id="cost_price"
                          type="number"
                          step="0.01"
                          value={formData.cost_price}
                          onChange={(e) => {
                            setFormData({ ...formData, cost_price: Number.parseFloat(e.target.value) || 0 })
                            setFormErrors({ ...formErrors, cost_price: '' })
                          }}
                          className={formErrors.cost_price ? 'border-red-500' : ''}
                        />
                        {formErrors.cost_price && (
                          <p className="text-sm text-red-500">{formErrors.cost_price}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Product-specific fields */}
                  {formData.item_type === 'product' && (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="unit">{appLang==='en' ? 'Unit' : 'الوحدة'}</Label>
                          <Input
                            id="unit"
                            value={formData.unit}
                            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="quantity_on_hand">{appLang==='en' ? 'Qty' : 'الكمية'}</Label>
                          <Input
                            id="quantity_on_hand"
                            type="number"
                            value={formData.quantity_on_hand}
                            onChange={(e) => setFormData({ ...formData, quantity_on_hand: Number.parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reorder_level">{appLang==='en' ? 'Reorder' : 'حد الطلب'}</Label>
                          <Input
                            id="reorder_level"
                            type="number"
                            value={formData.reorder_level}
                            onChange={(e) => setFormData({ ...formData, reorder_level: Number.parseInt(e.target.value) || 0 })}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* 🏢 Branch, Warehouse & Cost Center */}
                  <div className="border-t pt-4 mt-4">
                    <p className="text-sm font-medium mb-3">{appLang==='en' ? 'Location' : 'الموقع'}</p>
                    <div className={`grid gap-3 ${formData.item_type === 'product' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                      <div className="space-y-2">
                        <Label>{appLang==='en' ? 'Branch' : 'الفرع'}</Label>
                        <Select
                          value={formData.branch_id || "none"}
                          onValueChange={(v) => {
                            const branchId = v === "none" ? "" : v
                            // عند تغيير الفرع، إعادة تعيين المستودع ومركز التكلفة
                            setFormData({
                              ...formData,
                              branch_id: branchId,
                              warehouse_id: "",
                              cost_center_id: ""
                            })
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={appLang==='en' ? 'Select Branch...' : 'اختر الفرع...'} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{appLang==='en' ? 'None' : 'بدون'}</SelectItem>
                            {branches.map(b => (
                              <SelectItem key={b.id} value={b.id}>{b.branch_code} - {b.branch_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {/* المستودع - للمنتجات فقط */}
                      {formData.item_type === 'product' && (
                        <div className="space-y-2">
                          <Label>{appLang==='en' ? 'Warehouse' : 'المستودع'}</Label>
                          <Select
                            value={formData.warehouse_id || "none"}
                            onValueChange={(v) => setFormData({ ...formData, warehouse_id: v === "none" ? "" : v })}
                            disabled={!formData.branch_id}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={appLang==='en' ? 'Select...' : 'اختر...'} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">{appLang==='en' ? 'None' : 'بدون'}</SelectItem>
                              {filteredWarehouses.map(w => (
                                <SelectItem key={w.id} value={w.id}>{w.code ? `${w.code} - ` : ''}{w.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>{appLang==='en' ? 'Cost Center' : 'مركز التكلفة'}</Label>
                        <Select
                          value={formData.cost_center_id || "none"}
                          onValueChange={(v) => setFormData({ ...formData, cost_center_id: v === "none" ? "" : v })}
                          disabled={!formData.branch_id}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={appLang==='en' ? 'Select...' : 'اختر...'} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{appLang==='en' ? 'None' : 'بدون'}</SelectItem>
                            {filteredCostCenters.map(cc => (
                              <SelectItem key={cc.id} value={cc.id}>{cc.cost_center_code} - {cc.cost_center_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {!formData.branch_id && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {appLang==='en'
                          ? `Select a branch first to choose ${formData.item_type === 'product' ? 'warehouse and ' : ''}cost center`
                          : `اختر الفرع أولاً لتحديد ${formData.item_type === 'product' ? 'المستودع و' : ''}مركز التكلفة`}
                      </p>
                    )}
                  </div>

                  {/* Accounting Links */}
                  <div className="border-t pt-4 mt-4">
                    <p className="text-sm font-medium mb-3">{appLang==='en' ? 'Accounting' : 'الربط المحاسبي'}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>{appLang==='en' ? 'Income Account' : 'حساب الإيرادات'}</Label>
                        <Select
                          value={formData.income_account_id || "none"}
                          onValueChange={(v) => setFormData({ ...formData, income_account_id: v === "none" ? "" : v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={appLang==='en' ? 'Select...' : 'اختر...'} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{appLang==='en' ? 'None' : 'بدون'}</SelectItem>
                            {accounts.filter(a => a.account_type === 'income').map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.account_code} - {a.account_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{appLang==='en' ? 'Expense Account' : 'حساب المصروفات'}</Label>
                        <Select
                          value={formData.expense_account_id || "none"}
                          onValueChange={(v) => setFormData({ ...formData, expense_account_id: v === "none" ? "" : v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={appLang==='en' ? 'Select...' : 'اختر...'} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{appLang==='en' ? 'None' : 'بدون'}</SelectItem>
                            {accounts.filter(a => a.account_type === 'expense').map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.account_code} - {a.account_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={isSaving}>
                    {isSaving
                      ? (appLang==='en' ? 'Saving...' : 'جاري الحفظ...')
                      : editingId
                        ? (appLang==='en' ? 'Update' : 'تحديث')
                        : (appLang==='en' ? 'Add' : 'إضافة')}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {lowStockProducts.length > 0 && (
            <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/20">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-orange-900 dark:text-orange-100">{appLang==='en' ? 'Low Stock Alert' : 'تنبيه المخزون المنخفض'}</p>
                    <p className="text-sm text-orange-800 dark:text-orange-200 mt-1">
                      {appLang==='en' ? `${lowStockProducts.length} product(s) need reorder` : `${lowStockProducts.length} منتج(ات) بحاجة إلى إعادة طلب`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <FilterContainer
            title={appLang === 'en' ? 'Filters' : 'الفلاتر'}
            activeCount={activeFilterCount}
            onClear={clearFilters}
            defaultOpen={false}
          >
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full sm:w-auto">
                <TabsList>
                  <TabsTrigger value="all">{appLang==='en' ? 'All' : 'الكل'} ({products.length})</TabsTrigger>
                  <TabsTrigger value="products">
                    <Package className="w-4 h-4 mr-1" />
                    {appLang==='en' ? 'Products' : 'منتجات'} ({productsCount})
                  </TabsTrigger>
                  <TabsTrigger value="services">
                    <Wrench className="w-4 h-4 mr-1" />
                    {appLang==='en' ? 'Services' : 'خدمات'} ({servicesCount})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {/* Search */}
              <div className="flex items-center gap-2 flex-1">
                <Search className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <Input
                  placeholder={appLang==='en' ? 'Search by name or code...' : 'البحث بالاسم أو الرمز...'}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
          </FilterContainer>

          <Card>
              <CardHeader>
              <CardTitle>{appLang==='en' ? 'Items List' : 'قائمة الأصناف'}</CardTitle>
              </CardHeader>
            <CardContent>
              {isLoading ? (
                <LoadingState type="table" rows={8} />
              ) : filteredProducts.length === 0 ? (
                <EmptyState
                  icon={Package}
                  title={appLang==='en' ? 'No items yet' : 'لا توجد أصناف حتى الآن'}
                  description={appLang==='en' ? 'Create your first product or service to get started' : 'أنشئ أول منتج أو خدمة للبدء'}
                />
              ) : (
                <>
                  <DataTable
                    columns={tableColumns}
                    data={paginatedProducts}
                    keyField="id"
                    lang={appLang}
                    minWidth="min-w-[480px]"
                    emptyMessage={appLang === 'en' ? 'No items found' : 'لا توجد أصناف'}
                    rowClassName={(row) => {
                      const isProduct = row.item_type === 'product' || !row.item_type
                      const isLowStock = isProduct && row.quantity_on_hand <= row.reorder_level
                      return isLowStock ? "bg-orange-50 dark:bg-orange-900/10" : ""
                    }}
                  />
                  {filteredProducts.length > 0 && (
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
        </div>
        </ListErrorBoundary>
      </main>
    </div>
  )
}
