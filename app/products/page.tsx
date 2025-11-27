"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError } from "@/lib/notifications"
import { ensureCompanyId } from "@/lib/company"
import { Plus, Edit2, Trash2, Search, AlertCircle, Package } from "lucide-react"
import { PageContainer } from "@/components/ui/page-container"
import { PageHeader } from "@/components/ui/page-header"

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
  })
  const [taxCodes, setTaxCodes] = useState<{ id: string; name: string; rate: number; scope: string }[]>([])
  const [productTaxDefaults, setProductTaxDefaults] = useState<Record<string, string>>({})

  useEffect(() => {
    loadProducts()
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

      if (editingId) {
        const { error } = await supabase.from("products").update(formData).eq("id", editingId)

        if (error) throw error
      } else {
        const { error } = await supabase.from("products").insert([{ ...formData, company_id: companyData.id }])

        if (error) throw error
      }

      setIsDialogOpen(false)
      setEditingId(null)
      setFormData({
        sku: "",
        name: "",
        description: "",
        unit_price: 0,
        cost_price: 0,
        unit: "piece",
        quantity_on_hand: 0,
        reorder_level: 0,
      })
      loadProducts()
    } catch (error) {
      console.error("Error saving product:", error)
    }
  }

  const handleEdit = (product: Product) => {
    setFormData(product)
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

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const setProductDefaultTax = (productId: string, taxCodeId: string) => {
    const next = { ...productTaxDefaults, [productId]: taxCodeId }
    setProductTaxDefaults(next)
    try {
      localStorage.setItem("product_tax_defaults", JSON.stringify(next))
    } catch {}
  }

  const lowStockProducts = products.filter((p) => p.quantity_on_hand <= p.reorder_level)

  return (
    <PageContainer>
      <PageHeader
        title="المنتجات"
        titleEn="Products"
        description="إدارة قائمة منتجاتك"
        descriptionEn="Manage your products list"
        icon={Package}
        iconColor="purple"
        lang={appLang}
      >
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setEditingId(null)
                setFormData({
                  sku: "",
                  name: "",
                  description: "",
                  unit_price: 0,
                  cost_price: 0,
                  unit: "piece",
                  quantity_on_hand: 0,
                  reorder_level: 0,
                })
              }}
            >
              <Plus className="w-4 h-4 ml-2" />
              {appLang==='en' ? 'New Product' : 'منتج جديد'}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingId ? (appLang==='en' ? 'Edit Product' : 'تعديل منتج') : (appLang==='en' ? 'Add New Product' : 'إضافة منتج جديد')}</DialogTitle>
              <DialogDescription className="sr-only">{editingId ? 'تعديل بيانات المنتج' : 'إضافة منتج جديد'}</DialogDescription>
            </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="sku">{appLang==='en' ? 'Product Code (SKU)' : 'رمز المنتج (SKU)'}</Label>
                    <Input
                      id="sku"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">{appLang==='en' ? 'Product Name' : 'اسم المنتج'}</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">{appLang==='en' ? 'Description' : 'الوصف'}</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit_price">{appLang==='en' ? 'Sale Price' : 'سعر البيع'}</Label>
                    <Input
                      id="unit_price"
                      type="number"
                      step="0.01"
                      value={formData.unit_price}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          unit_price: Number.parseFloat(e.target.value),
                        })
                      }
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
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          cost_price: Number.parseFloat(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">{appLang==='en' ? 'Unit of Measure' : 'وحدة القياس'}</Label>
                    <Input
                      id="unit"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity_on_hand">{appLang==='en' ? 'Quantity on Hand' : 'الكمية المتاحة'}</Label>
                    <Input
                      id="quantity_on_hand"
                      type="number"
                      value={formData.quantity_on_hand}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          quantity_on_hand: Number.parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reorder_level">{appLang==='en' ? 'Reorder Level' : 'حد إعادة الطلب'}</Label>
                    <Input
                      id="reorder_level"
                      type="number"
                      value={formData.reorder_level}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          reorder_level: Number.parseInt(e.target.value),
                        })
                      }
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    {editingId ? (appLang==='en' ? 'Update' : 'تحديث') : (appLang==='en' ? 'Add' : 'إضافة')}
                  </Button>
                </form>
          </DialogContent>
        </Dialog>

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

        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-gray-400" />
              <Input
                placeholder={appLang==='en' ? 'Search product...' : 'البحث عن منتج...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800">
            <CardTitle>{appLang==='en' ? 'Products List' : 'قائمة المنتجات'}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <p className="text-center py-12 text-gray-500">{appLang==='en' ? 'No products yet' : 'لا توجد منتجات حتى الآن'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[640px] w-full text-sm">
                  <thead className="border-b bg-gray-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Code' : 'الرمز'}</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Name' : 'الاسم'}</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Sale Price' : 'سعر البيع'}</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Cost Price' : 'سعر التكلفة'}</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Quantity' : 'الكمية'}</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Reorder Level' : 'حد الطلب'}</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Default Tax' : 'الضريبة الافتراضية'}</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Status' : 'الحالة'}</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Actions' : 'الإجراءات'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {filteredProducts.map((product) => {
                      const isLowStock = product.quantity_on_hand <= product.reorder_level
                      return (
                        <tr
                          key={product.id}
                            className={`border-b hover:bg-gray-50 dark:hover:bg-slate-900 ${
                              isLowStock ? "bg-orange-50 dark:bg-orange-900/10" : ""
                            }`}
                          >
                            <td className="px-4 py-3 font-medium">{product.sku}</td>
                            <td className="px-4 py-3">{product.name}</td>
                            <td className="px-4 py-3">{product.unit_price}</td>
                            <td className="px-4 py-3">{product.cost_price}</td>
                            <td className="px-4 py-3">{product.quantity_on_hand}</td>
                            <td className="px-4 py-3">{product.reorder_level}</td>
                            <td className="px-4 py-3">
                              <select
                                className="w-full px-3 py-2 border rounded-lg text-sm"
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
                              {isLowStock ? (
                                <span className="px-2 py-1 bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 rounded text-xs font-medium">
                                  {appLang==='en' ? 'Low' : 'منخفض'}
                                </span>
                              ) : (
                                <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded text-xs font-medium">
                                  {appLang==='en' ? 'Available' : 'متوفر'}
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
      </PageHeader>
    </PageContainer>
  )
}
