"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { useRouter } from "next/navigation"
import { ArrowLeftRight, Plus, Trash2, Warehouse, Package, Save, ArrowRight, AlertCircle } from "lucide-react"

interface Product {
  id: string
  name: string
  sku: string
  available_qty?: number
}

interface WarehouseData {
  id: string
  name: string
  branch_id?: string
  branches?: { name?: string; branch_name?: string }
}

interface TransferItem {
  product_id: string
  quantity: number
  product_name?: string
  product_sku?: string
  available_qty?: number
}

export default function NewTransferPage() {
  const supabase = createClient()
  const { toast } = useToast()
  const router = useRouter()

  const [hydrated, setHydrated] = useState(false)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [warehouses, setWarehouses] = useState<WarehouseData[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [productStock, setProductStock] = useState<Record<string, number>>({})

  const [sourceWarehouseId, setSourceWarehouseId] = useState<string>("")
  const [destinationWarehouseId, setDestinationWarehouseId] = useState<string>("")
  const [expectedArrivalDate, setExpectedArrivalDate] = useState<string>("")
  const [notes, setNotes] = useState<string>("")
  const [items, setItems] = useState<TransferItem[]>([])

  const [userRole, setUserRole] = useState<string>("")
  const [companyId, setCompanyId] = useState<string>("")

  useEffect(() => {
    setHydrated(true)
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

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (sourceWarehouseId && companyId) {
      loadWarehouseStock(sourceWarehouseId)
    }
  }, [sourceWarehouseId])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const cId = await getActiveCompanyId(supabase)
      if (!cId) {
        router.push("/")
        return
      }
      setCompanyId(cId)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push("/login")
        return
      }

      const { data: member } = await supabase
        .from("company_members")
        .select("role, branch_id, warehouse_id")
        .eq("company_id", cId)
        .eq("user_id", user.id)
        .single()

      const role = member?.role || "staff"
      const userBranchId = member?.branch_id || null
      setUserRole(role)

      // 🔒 صلاحية إنشاء طلبات النقل: Owner/Admin/Manager فقط
      // ❌ مسؤول المخزن لا يمكنه إنشاء طلبات نقل، فقط استلامها
      if (!["owner", "admin", "manager"].includes(role)) {
        toast({
          title: appLang === 'en' ? 'Access Denied' : 'غير مصرح',
          description: appLang === 'en' ? 'Only managers can create transfers' : 'فقط المدراء يمكنهم إنشاء طلبات النقل',
          variant: 'destructive'
        })
        router.push("/inventory-transfers")
        return
      }

      // ✅ جلب المخازن مع مراعاة الصلاحيات والأدوار
      // ملاحظة: جلب المخازن بدون العلاقة مع branches لتجنب مشاكل العلاقات
      let warehousesQuery = supabase
        .from("warehouses")
        .select("id, name, branch_id")
        .eq("company_id", cId)
        .eq("is_active", true)

      // 🔒 فلترة المخازن حسب الصلاحيات:
      // - Owner/Admin: يرون جميع المخازن (لا فلترة)
      // - Manager: يرى فقط مخازن فرعه
      if (role === "manager" && userBranchId) {
        warehousesQuery = warehousesQuery.eq("branch_id", userBranchId)
      }
      // Owner/Admin: لا فلترة - يرون جميع المخازن

      const { data: warehousesData, error: warehousesError } = await warehousesQuery.order("name")
      
      if (warehousesError) {
        console.error("Error loading warehouses:", warehousesError)
        toast({
          title: appLang === 'en' ? 'Error loading warehouses' : 'خطأ في تحميل المخازن',
          description: warehousesError.message,
          variant: 'destructive'
        })
        setWarehouses([])
      } else {
        console.log("✅ Loaded warehouses:", warehousesData?.length || 0)
        
        // جلب بيانات الفروع بشكل منفصل لتجنب مشاكل العلاقات
        if (warehousesData && warehousesData.length > 0) {
          const branchIds = [...new Set(warehousesData.map((w: any) => w.branch_id).filter(Boolean))]
          if (branchIds.length > 0) {
            const { data: branchesData } = await supabase
              .from("branches")
              .select("id, name, branch_name")
              .in("id", branchIds)
            
        // دمج بيانات الفروع مع المخازن
        const warehousesWithBranches = warehousesData.map((wh: any) => ({
          ...wh,
          branches: branchesData?.find((b: any) => b.id === wh.branch_id) || null
        }))
            setWarehouses(warehousesWithBranches as any)
          } else {
            setWarehouses(warehousesData || [])
          }
        } else {
          setWarehouses([])
        }
      }

      // جلب المنتجات
      const { data: productsData } = await supabase
        .from("products")
        .select("id, name, sku")
        .eq("company_id", cId)
        .eq("is_active", true)
        .order("name")

      setProducts(productsData || [])
    } catch (error) {
      console.error("Error loading data:", error)
      toast({ title: appLang === 'en' ? 'Error loading data' : 'خطأ في تحميل البيانات', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const loadWarehouseStock = async (warehouseId: string) => {
    try {
      const { data: wh } = await supabase
        .from("warehouses")
        .select("branch_id")
        .eq("company_id", companyId)
        .eq("id", warehouseId)
        .single()

      const branchId = String((wh as any)?.branch_id || "")
      if (!branchId) {
        setProductStock({})
        return
      }

      const { getBranchDefaults } = await import("@/lib/governance-branch-defaults")
      const defaults = await getBranchDefaults(supabase, branchId)

      const { data: transactions } = await supabase
        .from("inventory_transactions")
        .select("product_id, quantity_change, is_deleted")
        .eq("company_id", companyId)
        .eq("branch_id", branchId)
        .eq("cost_center_id", defaults.default_cost_center_id)
        .eq("warehouse_id", warehouseId)

      const stock: Record<string, number> = {}
        ; (transactions || []).forEach((t: any) => {
          if (t.is_deleted) return
          const pid = String(t.product_id || '')
          stock[pid] = (stock[pid] || 0) + Number(t.quantity_change || 0)
        })
      setProductStock(stock)
    } catch (error) {
      console.error("Error loading stock:", error)
    }
  }

  const addItem = () => {
    setItems([...items, { product_id: "", quantity: 1 }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: keyof TransferItem, value: any) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }
    if (field === 'product_id') {
      const product = products.find(p => p.id === value)
      if (product) {
        updated[index].product_name = product.name
        updated[index].product_sku = product.sku
        updated[index].available_qty = productStock[value] || 0
      }
    }
    setItems(updated)
  }

  const validateForm = () => {
    if (!sourceWarehouseId) {
      toast({ title: appLang === 'en' ? 'Select source warehouse' : 'اختر المخزن المصدر', variant: 'destructive' })
      return false
    }
    if (!destinationWarehouseId) {
      toast({ title: appLang === 'en' ? 'Select destination warehouse' : 'اختر المخزن الوجهة', variant: 'destructive' })
      return false
    }
    if (items.length === 0) {
      toast({ title: appLang === 'en' ? 'Add at least one product' : 'أضف منتج واحد على الأقل', variant: 'destructive' })
      return false
    }
    for (const item of items) {
      if (!item.product_id || item.quantity <= 0) {
        toast({ title: appLang === 'en' ? 'Fill all product details' : 'أكمل بيانات جميع المنتجات', variant: 'destructive' })
        return false
      }
      const available = productStock[item.product_id] || 0
      if (item.quantity > available) {
        toast({ title: appLang === 'en' ? 'Quantity exceeds available stock' : 'الكمية تتجاوز المتوفر', variant: 'destructive' })
        return false
      }
    }
    return true
  }

  const generateTransferNumber = () => {
    const date = new Date()
    const y = date.getFullYear().toString().slice(-2)
    const m = (date.getMonth() + 1).toString().padStart(2, '0')
    const d = date.getDate().toString().padStart(2, '0')
    const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
    return `TR-${y}${m}${d}-${rand}`
  }

  const handleSubmit = async () => {
    if (!validateForm()) return

    try {
      setIsSaving(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const transferNumber = generateTransferNumber()
      const srcWarehouse = warehouses.find(w => w.id === sourceWarehouseId)
      const destWarehouse = warehouses.find(w => w.id === destinationWarehouseId)

      // إنشاء طلب النقل
      const { data: transfer, error: transferError } = await supabase
        .from("inventory_transfers")
        .insert({
          company_id: companyId,
          transfer_number: transferNumber,
          source_warehouse_id: sourceWarehouseId,
          source_branch_id: srcWarehouse?.branch_id || null,
          destination_warehouse_id: destinationWarehouseId,
          destination_branch_id: destWarehouse?.branch_id || null,
          status: 'pending',
          expected_arrival_date: expectedArrivalDate || null,
          notes: notes || null,
          created_by: user.id
        })
        .select()
        .single()

      if (transferError) throw transferError

      // إضافة بنود النقل
      const transferItems = items.map(item => ({
        transfer_id: transfer.id,
        product_id: item.product_id,
        quantity_requested: item.quantity,
        unit_cost: 0
      }))

      const { error: itemsError } = await supabase
        .from("inventory_transfer_items")
        .insert(transferItems)

      if (itemsError) throw itemsError

      toast({ title: appLang === 'en' ? 'Transfer created successfully' : 'تم إنشاء طلب النقل بنجاح' })
      router.push(`/inventory-transfers/${transfer.id}`)
    } catch (error: any) {
      console.error("Error creating transfer:", error)
      toast({ title: appLang === 'en' ? 'Error creating transfer' : 'خطأ في إنشاء طلب النقل', variant: 'destructive' })
    } finally {
      setIsSaving(false)
    }
  }

  const availableDestinations = warehouses.filter(w => w.id !== sourceWarehouseId)

  if (!hydrated || isLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <div className="animate-pulse space-y-4 max-w-4xl mx-auto">
            <div className="h-24 bg-gray-200 dark:bg-slate-800 rounded-2xl"></div>
            <div className="h-64 bg-gray-200 dark:bg-slate-800 rounded-2xl"></div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                <ArrowLeftRight className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                  {appLang === 'en' ? 'New Transfer Request' : 'طلب نقل جديد'}
                </h1>
                <p className="text-gray-500 dark:text-gray-400">
                  {appLang === 'en' ? 'Transfer products from one warehouse to another' : 'نقل المنتجات من مخزن إلى آخر'}
                </p>
              </div>
            </div>
          </div>

          {/* Warehouses Selection */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Warehouse className="w-5 h-5 text-indigo-500" />
                {appLang === 'en' ? 'Warehouses' : 'المخازن'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6 items-end">
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Source Warehouse' : 'المخزن المصدر'} *</Label>
                  <Select value={sourceWarehouseId} onValueChange={setSourceWarehouseId}>
                    <SelectTrigger>
                      <SelectValue placeholder={appLang === 'en' ? 'Select source...' : 'اختر المخزن المصدر...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {warehouses.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                          {appLang === 'en' ? 'No warehouses available' : 'لا توجد مخازن متاحة'}
                        </div>
                      ) : (
                        warehouses.map(w => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name} {w.branches?.branch_name || w.branches?.name ? `(${w.branches.branch_name || w.branches.name})` : ''}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-center pb-2">
                  <ArrowRight className="w-6 h-6 text-gray-400" />
                </div>

                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Destination Warehouse' : 'المخزن الوجهة'} *</Label>
                  <Select value={destinationWarehouseId} onValueChange={setDestinationWarehouseId} disabled={!sourceWarehouseId}>
                    <SelectTrigger>
                      <SelectValue placeholder={appLang === 'en' ? 'Select destination...' : 'اختر المخزن الوجهة...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableDestinations.map(w => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name} {w.branches?.branch_name || w.branches?.name ? `(${w.branches.branch_name || w.branches.name})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-6 mt-6">
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Expected Arrival Date' : 'تاريخ الوصول المتوقع'}</Label>
                  <Input type="date" value={expectedArrivalDate} onChange={e => setExpectedArrivalDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={appLang === 'en' ? 'Optional notes...' : 'ملاحظات اختيارية...'} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Products */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-500" />
                {appLang === 'en' ? 'Products to Transfer' : 'المنتجات المراد نقلها'}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={addItem} disabled={!sourceWarehouseId} className="gap-1">
                <Plus className="w-4 h-4" />
                {appLang === 'en' ? 'Add Product' : 'إضافة منتج'}
              </Button>
            </CardHeader>
            <CardContent>
              {!sourceWarehouseId && (
                <div className="flex items-center gap-2 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-yellow-700 dark:text-yellow-400">
                  <AlertCircle className="w-5 h-5" />
                  {appLang === 'en' ? 'Select source warehouse first' : 'اختر المخزن المصدر أولاً'}
                </div>
              )}

              {items.length === 0 && sourceWarehouseId && (
                <div className="text-center py-8 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>{appLang === 'en' ? 'No products added yet' : 'لم تتم إضافة منتجات بعد'}</p>
                  <Button variant="outline" className="mt-4 gap-1" onClick={addItem}>
                    <Plus className="w-4 h-4" />
                    {appLang === 'en' ? 'Add First Product' : 'أضف أول منتج'}
                  </Button>
                </div>
              )}

              {items.length > 0 && (
                <div className="space-y-4">
                  {items.map((item, index) => (
                    <div key={index} className="flex gap-4 items-start p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
                      <div className="flex-1 space-y-2">
                        <Label>{appLang === 'en' ? 'Product' : 'المنتج'}</Label>
                        <Select value={item.product_id} onValueChange={v => updateItem(index, 'product_id', v)}>
                          <SelectTrigger>
                            <SelectValue placeholder={appLang === 'en' ? 'Select product...' : 'اختر المنتج...'} />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} ({p.sku}) - {appLang === 'en' ? 'Avail' : 'متوفر'}: {productStock[p.id] || 0}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-32 space-y-2">
                        <Label>{appLang === 'en' ? 'Quantity' : 'الكمية'}</Label>
                        <Input
                          type="number"
                          min={1}
                          max={productStock[item.product_id] || 999999}
                          value={item.quantity}
                          onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                        />
                        {item.product_id && (
                          <p className="text-xs text-gray-500">{appLang === 'en' ? 'Max' : 'أقصى'}: {productStock[item.product_id] || 0}</p>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="mt-7 text-red-500 hover:text-red-700" onClick={() => removeItem(index)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={() => router.push('/inventory-transfers')}>
              {appLang === 'en' ? 'Cancel' : 'إلغاء'}
            </Button>
            <Button onClick={handleSubmit} disabled={isSaving || items.length === 0} className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-600">
              <Save className="w-4 h-4" />
              {isSaving ? (appLang === 'en' ? 'Creating...' : 'جاري الإنشاء...') : (appLang === 'en' ? 'Create Transfer' : 'إنشاء طلب النقل')}
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
