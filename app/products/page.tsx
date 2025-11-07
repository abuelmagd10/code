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
import { Plus, Edit2, Trash2, Search, AlertCircle } from "lucide-react"

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
    // Load tax codes and product tax defaults from localStorage
    try {
      const rawCodes = localStorage.getItem("tax_codes")
      const parsedCodes = rawCodes ? JSON.parse(rawCodes) : []
      setTaxCodes(parsedCodes)
    } catch {
      setTaxCodes([])
    }
    try {
      const rawDefaults = localStorage.getItem("product_tax_defaults")
      const parsedDefaults = rawDefaults ? JSON.parse(rawDefaults) : {}
      setProductTaxDefaults(parsedDefaults)
    } catch {
      setProductTaxDefaults({})
    }
  }, [])

  const loadProducts = async () => {
    try {
      setIsLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return

      const { data } = await supabase.from("products").select("*").eq("company_id", companyData.id)

      setProducts(data || [])
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
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">المنتجات</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">إدارة قائمة منتجاتك</p>
            </div>
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
                  <Plus className="w-4 h-4 mr-2" />
                  منتج جديد
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{editingId ? "تعديل منتج" : "إضافة منتج جديد"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="sku">رمز المنتج (SKU)</Label>
                    <Input
                      id="sku"
                      value={formData.sku}
                      onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="name">اسم المنتج</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">الوصف</Label>
                    <Input
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit_price">سعر البيع</Label>
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
                    <Label htmlFor="cost_price">سعر التكلفة</Label>
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
                    <Label htmlFor="unit">وحدة القياس</Label>
                    <Input
                      id="unit"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity_on_hand">الكمية المتاحة</Label>
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
                    <Label htmlFor="reorder_level">حد إعادة الطلب</Label>
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
                    {editingId ? "تحديث" : "إضافة"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {lowStockProducts.length > 0 && (
            <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/20">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-orange-900 dark:text-orange-100">تنبيه المخزون المنخفض</p>
                    <p className="text-sm text-orange-800 dark:text-orange-200 mt-1">
                      {lowStockProducts.length} منتج(ات) بحاجة إلى إعادة طلب
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400" />
                <Input
                  placeholder="البحث عن منتج..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>قائمة المنتجات</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500">جاري التحميل...</p>
              ) : filteredProducts.length === 0 ? (
                <p className="text-center py-8 text-gray-500">لا توجد منتجات حتى الآن</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">الرمز</th>
                        <th className="px-4 py-3 text-right">الاسم</th>
                        <th className="px-4 py-3 text-right">سعر البيع</th>
                        <th className="px-4 py-3 text-right">سعر التكلفة</th>
                        <th className="px-4 py-3 text-right">الكمية</th>
                        <th className="px-4 py-3 text-right">حد الطلب</th>
                        <th className="px-4 py-3 text-right">الضريبة الافتراضية</th>
                        <th className="px-4 py-3 text-right">الحالة</th>
                        <th className="px-4 py-3 text-right">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
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
                                <option value="">بدون</option>
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
                                  منخفض
                                </span>
                              ) : (
                                <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded text-xs font-medium">
                                  متوفر
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
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
