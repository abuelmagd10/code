"use client"

import { useState, useEffect, use } from "react"
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
import { ArrowLeftRight, Plus, Trash2, Warehouse, Package, Save, ArrowLeft, AlertCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"

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
  id?: string
  product_id: string
  quantity: number
  product_name?: string
  product_sku?: string
  available_qty?: number
}

interface TransferData {
  id: string
  transfer_number: string
  status: string
  source_warehouse_id: string
  destination_warehouse_id: string
  expected_arrival_date?: string
  notes?: string
  rejection_reason?: string
  items?: any[]
}

export default function EditTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
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
  const [transfer, setTransfer] = useState<TransferData | null>(null)
  const [companyId, setCompanyId] = useState<string>("")
  const [userId, setUserId] = useState<string>("")

  const [sourceWarehouseId, setSourceWarehouseId] = useState<string>("")
  const [destinationWarehouseId, setDestinationWarehouseId] = useState<string>("")
  const [expectedArrivalDate, setExpectedArrivalDate] = useState<string>("")
  const [notes, setNotes] = useState<string>("")
  const [items, setItems] = useState<TransferItem[]>([])

  useEffect(() => {
    setHydrated(true)
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('languageChange', handler)
    return () => window.removeEventListener('languageChange', handler)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    loadData()
  }, [hydrated, resolvedParams.id])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const cid = await getActiveCompanyId(supabase)
      if (!cid) {
        router.push("/companies")
        return
      }
      setCompanyId(cid)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      // التحقق من الصلاحيات
      const { data: member } = await supabase
        .from("company_members")
        .select("role")
        .eq("company_id", cid)
        .eq("user_id", user.id)
        .single()

      const role = String(member?.role || "staff").trim().toLowerCase()
      
      // فقط المحاسب المنشئ يمكنه التعديل
      if (role !== 'accountant') {
        toast({
          title: appLang === 'en' ? 'Access Denied' : 'غير مصرح',
          description: appLang === 'en' ? 'Only the creator can edit this transfer' : 'فقط منشئ الطلب يمكنه التعديل',
          variant: 'destructive'
        })
        router.push(`/inventory-transfers/${resolvedParams.id}`)
        return
      }

      // تحميل بيانات الطلب
      const { data: transferData, error: transferError } = await supabase
        .from("inventory_transfers")
        .select(`
          *,
          items:inventory_transfer_items(
            id, product_id, quantity_requested,
            products(id, name, sku)
          )
        `)
        .eq("id", resolvedParams.id)
        .eq("company_id", cid)
        .single()

      if (transferError || !transferData) {
        toast({ title: appLang === 'en' ? 'Transfer not found' : 'الطلب غير موجود', variant: 'destructive' })
        router.push("/inventory-transfers")
        return
      }

      // التحقق من أن المستخدم هو المنشئ
      if (transferData.created_by !== user.id) {
        toast({
          title: appLang === 'en' ? 'Access Denied' : 'غير مصرح',
          description: appLang === 'en' ? 'You can only edit your own transfers' : 'يمكنك تعديل طلباتك فقط',
          variant: 'destructive'
        })
        router.push(`/inventory-transfers/${resolvedParams.id}`)
        return
      }

      // التحقق من الحالة (فقط draft أو rejected)
      if (!['draft', 'rejected'].includes(transferData.status)) {
        toast({
          title: appLang === 'en' ? 'Cannot Edit' : 'لا يمكن التعديل',
          description: appLang === 'en' ? 'Only rejected transfers can be edited' : 'يمكن تعديل الطلبات المرفوضة فقط',
          variant: 'destructive'
        })
        router.push(`/inventory-transfers/${resolvedParams.id}`)
        return
      }

      setTransfer(transferData)
      setSourceWarehouseId(transferData.source_warehouse_id)
      setDestinationWarehouseId(transferData.destination_warehouse_id)
      setExpectedArrivalDate(transferData.expected_arrival_date || "")
      setNotes(transferData.notes || "")

      // تحويل البنود
      const loadedItems: TransferItem[] = (transferData.items || []).map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        quantity: item.quantity_requested,
        product_name: item.products?.name,
        product_sku: item.products?.sku
      }))
      setItems(loadedItems)

      // تحميل المخازن
      const { data: warehousesData } = await supabase
        .from("warehouses")
        .select("id, name, branch_id, branches(name, branch_name)")
        .eq("company_id", cid)
        .eq("is_active", true)
        .order("name")

      setWarehouses(warehousesData || [])

      // تحميل المنتجات
      const { data: productsData } = await supabase
        .from("products")
        .select("id, name, sku")
        .eq("company_id", cid)
        .eq("is_active", true)
        .order("name")

      setProducts(productsData || [])

      // تحميل المخزون للمخزن المصدر
      if (transferData.source_warehouse_id) {
        await loadWarehouseStock(transferData.source_warehouse_id, cid)
      }

    } catch (error) {
      console.error("Error loading data:", error)
      toast({ title: appLang === 'en' ? 'Error loading data' : 'خطأ في تحميل البيانات', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const loadWarehouseStock = async (warehouseId: string, cid: string) => {
    const { data: stockData } = await supabase
      .from("inventory")
      .select("product_id, quantity")
      .eq("company_id", cid)
      .eq("warehouse_id", warehouseId)

    const stockMap: Record<string, number> = {}
    stockData?.forEach(s => {
      stockMap[s.product_id] = (stockMap[s.product_id] || 0) + (s.quantity || 0)
    })
    setProductStock(stockMap)
  }

  const addItem = () => {
    setItems([...items, { product_id: "", quantity: 1 }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: keyof TransferItem, value: any) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }
    if (field === 'product_id') {
      const product = products.find(p => p.id === value)
      if (product) {
        newItems[index].product_name = product.name
        newItems[index].product_sku = product.sku
        newItems[index].available_qty = productStock[value] || 0
      }
    }
    setItems(newItems)
  }

  const validateForm = () => {
    if (!sourceWarehouseId || !destinationWarehouseId) {
      toast({ title: appLang === 'en' ? 'Select warehouses' : 'اختر المخازن', variant: 'destructive' })
      return false
    }
    if (sourceWarehouseId === destinationWarehouseId) {
      toast({ title: appLang === 'en' ? 'Source and destination must be different' : 'المخزن المصدر والوجهة يجب أن يكونا مختلفين', variant: 'destructive' })
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

  const handleSave = async () => {
    if (!validateForm() || !transfer) return

    try {
      setIsSaving(true)

      const srcWarehouse = warehouses.find(w => w.id === sourceWarehouseId)
      const destWarehouse = warehouses.find(w => w.id === destinationWarehouseId)

      // تحديث الطلب
      const { error: updateError } = await supabase
        .from("inventory_transfers")
        .update({
          source_warehouse_id: sourceWarehouseId,
          source_branch_id: srcWarehouse?.branch_id || null,
          destination_warehouse_id: destinationWarehouseId,
          destination_branch_id: destWarehouse?.branch_id || null,
          expected_arrival_date: expectedArrivalDate || null,
          notes: notes || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", transfer.id)

      if (updateError) throw updateError

      // حذف البنود القديمة وإضافة الجديدة
      await supabase
        .from("inventory_transfer_items")
        .delete()
        .eq("transfer_id", transfer.id)

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

      toast({ title: appLang === 'en' ? 'Transfer updated successfully' : 'تم تحديث الطلب بنجاح' })
      router.push(`/inventory-transfers/${transfer.id}`)
    } catch (error: any) {
      console.error("Error updating transfer:", error)
      toast({ title: appLang === 'en' ? 'Error updating transfer' : 'خطأ في تحديث الطلب', variant: 'destructive' })
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
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => router.back()}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <ArrowLeftRight className="w-6 h-6 text-blue-600" />
                  {appLang === 'en' ? 'Edit Transfer Request' : 'تعديل طلب النقل'}
                </h1>
                {transfer && (
                  <p className="text-gray-500">#{transfer.transfer_number}</p>
                )}
              </div>
            </div>
          </div>

          {/* Rejection Reason Alert */}
          {transfer?.rejection_reason && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-red-800 dark:text-red-300">
                    {appLang === 'en' ? 'Rejection Reason' : 'سبب الرفض'}
                  </h3>
                  <p className="text-red-700 dark:text-red-400 mt-1">{transfer.rejection_reason}</p>
                </div>
              </div>
            </div>
          )}

          {/* Warehouses Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Warehouse className="w-5 h-5" />
                {appLang === 'en' ? 'Warehouses' : 'المخازن'}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{appLang === 'en' ? 'Source Warehouse' : 'المخزن المصدر'}</Label>
                <Select value={sourceWarehouseId} onValueChange={(v) => {
                  setSourceWarehouseId(v)
                  loadWarehouseStock(v, companyId)
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder={appLang === 'en' ? 'Select source' : 'اختر المصدر'} />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} {w.branches?.name && `(${w.branches.name})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{appLang === 'en' ? 'Destination Warehouse' : 'المخزن الوجهة'}</Label>
                <Select value={destinationWarehouseId} onValueChange={setDestinationWarehouseId}>
                  <SelectTrigger>
                    <SelectValue placeholder={appLang === 'en' ? 'Select destination' : 'اختر الوجهة'} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDestinations.map(w => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} {w.branches?.name && `(${w.branches.name})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Products */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  {appLang === 'en' ? 'Products' : 'المنتجات'}
                </span>
                <Button size="sm" onClick={addItem}>
                  <Plus className="w-4 h-4 mr-1" />
                  {appLang === 'en' ? 'Add' : 'إضافة'}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="flex gap-4 items-end p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <div className="flex-1 space-y-2">
                    <Label>{appLang === 'en' ? 'Product' : 'المنتج'}</Label>
                    <Select value={item.product_id} onValueChange={(v) => updateItem(index, 'product_id', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder={appLang === 'en' ? 'Select product' : 'اختر المنتج'} />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.sku}) - {appLang === 'en' ? 'Available' : 'متوفر'}: {productStock[p.id] || 0}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-32 space-y-2">
                    <Label>{appLang === 'en' ? 'Quantity' : 'الكمية'}</Label>
                    <Input
                      type="number"
                      min="1"
                      max={productStock[item.product_id] || 999999}
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <Button variant="destructive" size="icon" onClick={() => removeItem(index)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-center text-gray-500 py-8">
                  {appLang === 'en' ? 'No products added yet' : 'لم تتم إضافة منتجات بعد'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Additional Info */}
          <Card>
            <CardHeader>
              <CardTitle>{appLang === 'en' ? 'Additional Information' : 'معلومات إضافية'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{appLang === 'en' ? 'Expected Arrival Date' : 'تاريخ الوصول المتوقع'}</Label>
                <Input
                  type="date"
                  value={expectedArrivalDate}
                  onChange={(e) => setExpectedArrivalDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={appLang === 'en' ? 'Add any notes...' : 'أضف أي ملاحظات...'}
                />
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-4 justify-end">
            <Button variant="outline" onClick={() => router.back()}>
              {appLang === 'en' ? 'Cancel' : 'إلغاء'}
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              <Save className="w-4 h-4" />
              {isSaving
                ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...')
                : (appLang === 'en' ? 'Save Changes' : 'حفظ التغييرات')}
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}

