"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError } from "@/lib/notifications"
import { ensureCompanyId } from "@/lib/company"
import { Plus, Edit2, Trash2, Search, AlertCircle, Package, Wrench } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

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
  tax_code_id?: string | null
  selling_price?: number | null
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
    tax_code_id: "",
  })
  const [taxCodes, setTaxCodes] = useState<{ id: string; name: string; rate: number; scope: string }[]>([])
  const [productTaxDefaults, setProductTaxDefaults] = useState<Record<string, string>>({})
  const [accounts, setAccounts] = useState<Account[]>([])
  const [activeTab, setActiveTab] = useState<'all' | 'products' | 'services'>('all')

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return

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
      }

      if (editingId) {
        const { error } = await supabase.from("products").update(saveData).eq("id", editingId)
        if (error) throw error
      } else {
        // Store original values for multi-currency support
        const { error } = await supabase.from("products").insert([{
          ...saveData,
          company_id: companyData.id,
          original_unit_price: formData.unit_price,
          original_cost_price: formData.cost_price,
          original_currency: systemCurrency,
          exchange_rate_used: 1,
        }])
        if (error) throw error
      }

      setIsDialogOpen(false)
      setEditingId(null)
      resetFormData()
      loadProducts()
    } catch (error) {
      console.error("Error saving product:", error)
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
      tax_code_id: "",
    })
  }

  const handleEdit = (product: Product) => {
    setFormData({
      ...product,
      income_account_id: product.income_account_id || "",
      expense_account_id: product.expense_account_id || "",
      cost_center: product.cost_center || "",
      tax_code_id: product.tax_code_id || "",
    } as any)
    setEditingId(product.id)
    setIsDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("products").delete().eq("id", id)
      if (error) throw error
      loadProducts()
    } catch (error) {
      console.error("Error deleting product:", error)
    }
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

  const setProductDefaultTax = (productId: string, taxCodeId: string) => {
    const next = { ...productTaxDefaults, [productId]: taxCodeId }
    setProductTaxDefaults(next)
    try {
      localStorage.setItem("product_tax_defaults", JSON.stringify(next))
    } catch {}
  }

  const lowStockProducts = products.filter((p) => (p.item_type === 'product' || !p.item_type) && p.quantity_on_hand <= p.reorder_level)
  const productsCount = products.filter(p => p.item_type === 'product' || !p.item_type).length
  const servicesCount = products.filter(p => p.item_type === 'service').length

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          {/* رأس الصفحة */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                  <Package className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{appLang==='en' ? 'Products & Services' : 'المنتجات والخدمات'}</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {appLang==='en'
                      ? `${productsCount} Products · ${servicesCount} Services`
                      : `${productsCount} منتج · ${servicesCount} خدمة`}
                  </p>
                </div>
              </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingId(null); resetFormData() }}>
                  <Plus className="w-4 h-4 mr-2" />
                  {appLang==='en' ? 'New Item' : 'صنف جديد'}
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
                        onChange={(e) => setFormData({ ...formData, unit_price: Number.parseFloat(e.target.value) || 0 })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cost_price">{appLang==='en' ? 'Cost Price' : 'سعر التكلفة'}</Label>
                      <Input
                        id="cost_price"
                        type="number"
                        step="0.01"
                        value={formData.cost_price}
                        onChange={(e) => setFormData({ ...formData, cost_price: Number.parseFloat(e.target.value) || 0 })}
                      />
                    </div>
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

                  {/* Accounting Links */}
                  <div className="border-t pt-4 mt-4">
                    <p className="text-sm font-medium mb-3">{appLang==='en' ? 'Accounting' : 'الربط المحاسبي'}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>{appLang==='en' ? 'Income Account' : 'حساب الإيرادات'}</Label>
                        <Select
                          value={formData.income_account_id}
                          onValueChange={(v) => setFormData({ ...formData, income_account_id: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={appLang==='en' ? 'Select...' : 'اختر...'} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">{appLang==='en' ? 'None' : 'بدون'}</SelectItem>
                            {accounts.filter(a => a.account_type === 'income').map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.account_code} - {a.account_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>{appLang==='en' ? 'Expense Account' : 'حساب المصروفات'}</Label>
                        <Select
                          value={formData.expense_account_id}
                          onValueChange={(v) => setFormData({ ...formData, expense_account_id: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={appLang==='en' ? 'Select...' : 'اختر...'} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">{appLang==='en' ? 'None' : 'بدون'}</SelectItem>
                            {accounts.filter(a => a.account_type === 'expense').map(a => (
                              <SelectItem key={a.id} value={a.id}>{a.account_code} - {a.account_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      <Label>{appLang==='en' ? 'Cost Center' : 'مركز التكلفة'}</Label>
                      <Input
                        value={formData.cost_center}
                        onChange={(e) => setFormData({ ...formData, cost_center: e.target.value })}
                        placeholder={appLang==='en' ? 'Optional' : 'اختياري'}
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full">
                    {editingId ? (appLang==='en' ? 'Update' : 'تحديث') : (appLang==='en' ? 'Add' : 'إضافة')}
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

          <Card>
            <CardContent className="pt-6">
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
                  <Search className="w-4 h-4 text-gray-400" />
                  <Input
                    placeholder={appLang==='en' ? 'Search by name or code...' : 'البحث بالاسم أو الرمز...'}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
              <CardHeader>
              <CardTitle>{appLang==='en' ? 'Items List' : 'قائمة الأصناف'}</CardTitle>
              </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</p>
              ) : filteredProducts.length === 0 ? (
                <p className="text-center py-8 text-gray-500">{appLang==='en' ? 'No items yet' : 'لا توجد أصناف حتى الآن'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[640px] w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Type' : 'النوع'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Code' : 'الرمز'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Name' : 'الاسم'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Sale Price' : 'سعر البيع'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Cost Price' : 'سعر التكلفة'}</th>
                        {activeTab !== 'services' && (
                          <>
                            <th className="px-4 py-3 text-right">{appLang==='en' ? 'Quantity' : 'الكمية'}</th>
                            <th className="px-4 py-3 text-right">{appLang==='en' ? 'Reorder' : 'حد الطلب'}</th>
                          </>
                        )}
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Tax' : 'الضريبة'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Status' : 'الحالة'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Actions' : 'الإجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((product) => {
                        const isProduct = product.item_type === 'product' || !product.item_type
                        const isLowStock = isProduct && product.quantity_on_hand <= product.reorder_level
                        return (
                          <tr
                            key={product.id}
                            className={`border-b hover:bg-gray-50 dark:hover:bg-slate-900 ${
                              isLowStock ? "bg-orange-50 dark:bg-orange-900/10" : ""
                            }`}
                          >
                            <td className="px-4 py-3">
                              {isProduct ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded text-xs font-medium">
                                  <Package className="w-3 h-3" />
                                  {appLang==='en' ? 'Product' : 'منتج'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded text-xs font-medium">
                                  <Wrench className="w-3 h-3" />
                                  {appLang==='en' ? 'Service' : 'خدمة'}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-medium">{product.sku}</td>
                            <td className="px-4 py-3">{product.name}</td>
                            <td className="px-4 py-3">{getDisplayPrice(product, 'unit').toFixed(2)} {currencySymbol}</td>
                            <td className="px-4 py-3">{getDisplayPrice(product, 'cost').toFixed(2)} {currencySymbol}</td>
                            {activeTab !== 'services' && (
                              <>
                                <td className="px-4 py-3">{isProduct ? product.quantity_on_hand : '-'}</td>
                                <td className="px-4 py-3">{isProduct ? product.reorder_level : '-'}</td>
                              </>
                            )}
                            <td className="px-4 py-3">
                              <select
                                className="w-full px-2 py-1 border rounded text-xs"
                                value={productTaxDefaults[product.id] ?? ""}
                                onChange={(e) => setProductDefaultTax(product.id, e.target.value)}
                              >
                                <option value="">{appLang==='en' ? 'None' : 'بدون'}</option>
                                {taxCodes
                                  .filter((c) => c.scope === "sales" || c.scope === "both")
                                  .map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name} ({c.rate}%)
                                    </option>
                                  ))}
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              {isProduct ? (
                                isLowStock ? (
                                  <span className="px-2 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 rounded text-xs font-medium">
                                    {appLang==='en' ? 'Low' : 'منخفض'}
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded text-xs font-medium">
                                    {appLang==='en' ? 'Available' : 'متوفر'}
                                  </span>
                                )
                              ) : (
                                <span className="px-2 py-1 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 rounded text-xs font-medium">
                                  {appLang==='en' ? 'Active' : 'نشط'}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2 flex-wrap">
                                <Button variant="outline" size="sm" onClick={() => handleEdit(product)}>
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDelete(product.id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
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
        </div>
      </main>
    </div>
  )
}
