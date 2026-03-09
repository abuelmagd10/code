"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter, useSearchParams } from "next/navigation"
import { Trash2, Plus, Package, Save, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"
import { BranchCostCenterSelector } from "@/components/branch-cost-center-selector"
import { useUserContext } from "@/hooks/use-user-context"

interface PurchaseOrder {
  id: string
  po_number: string
  supplier_id: string
  suppliers?: { name: string }
}

interface POItem {
  id: string
  product_id: string | null
  quantity: number
  unit_price: number
  products?: { name: string; sku: string | null }
}

interface ReceiptItem {
  purchase_order_item_id: string
  product_id: string
  product_name: string
  quantity_ordered: number
  quantity_received: number
  quantity_accepted: number
  quantity_rejected: number
  unit_price: number
  rejection_reason?: string
}

export default function NewGoodsReceiptPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromPOId = searchParams.get('from_po')
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  const [poItems, setPOItems] = useState<POItem[]>([])
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [hydrated, setHydrated] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    receipt_date: new Date().toISOString().slice(0, 10),
    notes: ""
  })

  // Branch, Cost Center, and Warehouse
  const [branchId, setBranchId] = useState<string | null>(null)
  const [costCenterId, setCostCenterId] = useState<string | null>(null)
  const [warehouseId, setWarehouseId] = useState<string | null>(null)

  // User context
  const { userContext } = useUserContext()
  const isAdmin = useMemo(() => {
    const role = String(userContext?.role || "").trim().toLowerCase()
    return ['admin', 'owner', 'general_manager'].includes(role)
  }, [userContext])

  useEffect(() => {
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      setHydrated(true)
    } catch { }
  }, [])

  // Load data
  useEffect(() => {
    if (!hydrated) return

    const loadData = async () => {
      try {
        setIsLoading(true)
        const companyId = await getActiveCompanyId(supabase)
        if (!companyId) return

        // Load purchase orders (sent or approved)
        const { data: poData } = await supabase
          .from("purchase_orders")
          .select("id, po_number, supplier_id, suppliers(name)")
          .eq("company_id", companyId)
          .in("status", ["sent", "approved", "draft"])
          .order("created_at", { ascending: false })

        setPurchaseOrders(poData || [])

        // If from_po parameter, load that PO
        if (fromPOId) {
          const po = poData?.find(p => p.id === fromPOId)
          if (po) {
            setSelectedPO(po)
            await loadPOItems(po.id)
          }
        }

        // Load branch defaults
        if (userContext?.branch_id) {
          try {
            const response = await fetch(`/api/governance-branch-defaults?branch_id=${userContext.branch_id}`)
            const branchDefaults = await response.json()
            if (branchDefaults.success && branchDefaults.data) {
              setBranchId(userContext.branch_id)
              setWarehouseId(branchDefaults.data.default_warehouse_id)
              setCostCenterId(branchDefaults.data.default_cost_center_id)
            }
          } catch (error) {
            console.error('Failed to apply branch defaults:', error)
            setBranchId(userContext.branch_id)
          }
        }
      } catch (err) {
        console.error("Error loading data:", err)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [supabase, hydrated, userContext, fromPOId])

  // Load PO items when PO is selected
  const loadPOItems = async (poId: string) => {
    try {
      const { data: itemsData, error } = await supabase
        .from("purchase_order_items")
        .select("id, product_id, quantity, unit_price, products(name, sku)")
        .eq("purchase_order_id", poId)

      if (error) throw error

      setPOItems(itemsData || [])

      // Initialize receipt items
      const receiptItemsInit: ReceiptItem[] = (itemsData || [])
        .filter((it: POItem) => !!it.product_id)
        .map((it: POItem) => ({
          purchase_order_item_id: it.id,
          product_id: it.product_id as string,
          product_name: it.products?.name || it.product_id || "",
          quantity_ordered: Number(it.quantity || 0),
          quantity_received: Number(it.quantity || 0), // Default: full receipt
          quantity_accepted: Number(it.quantity || 0),
          quantity_rejected: 0,
          unit_price: Number(it.unit_price || 0)
        }))

      setReceiptItems(receiptItemsInit)
    } catch (err) {
      console.error("Error loading PO items:", err)
      toastActionError(toast, appLang === 'en' ? 'Load' : 'تحميل', appLang === 'en' ? 'PO Items' : 'بنود أمر الشراء')
    }
  }

  // Handle PO selection
  const handlePOChange = async (poId: string) => {
    const po = purchaseOrders.find(p => p.id === poId)
    setSelectedPO(po || null)
    if (po) {
      await loadPOItems(po.id)
    } else {
      setPOItems([])
      setReceiptItems([])
    }
  }

  // Update receipt item
  const updateReceiptItem = (index: number, field: keyof ReceiptItem, value: any) => {
    const newItems = [...receiptItems]
    newItems[index] = { ...newItems[index], [field]: value }

    // Auto-calculate accepted + rejected = received
    if (field === 'quantity_received') {
      const received = Number(value) || 0
      const accepted = newItems[index].quantity_accepted
      newItems[index].quantity_rejected = Math.max(0, received - accepted)
    } else if (field === 'quantity_accepted') {
      const received = newItems[index].quantity_received
      const accepted = Number(value) || 0
      newItems[index].quantity_rejected = Math.max(0, received - accepted)
    }

    setReceiptItems(newItems)
  }

  // Save goods receipt
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPO) {
      toastActionError(toast, appLang === 'en' ? 'Save' : 'حفظ', appLang === 'en' ? 'Please select a Purchase Order' : 'الرجاء اختيار أمر شراء')
      return
    }
    if (!warehouseId) {
      toastActionError(toast, appLang === 'en' ? 'Save' : 'حفظ', appLang === 'en' ? 'Please select a warehouse' : 'الرجاء اختيار مخزن')
      return
    }
    if (receiptItems.length === 0) {
      toastActionError(toast, appLang === 'en' ? 'Save' : 'حفظ', appLang === 'en' ? 'Please add at least one item' : 'الرجاء إضافة عنصر واحد على الأقل')
      return
    }

    try {
      setIsSaving(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // Create GRN via API
      const response = await fetch('/api/goods-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchase_order_id: selectedPO.id,
          receipt_date: formData.receipt_date,
          branch_id: branchId,
          cost_center_id: costCenterId,
          warehouse_id: warehouseId,
          notes: formData.notes || null,
          items: receiptItems.map(item => ({
            purchase_order_item_id: item.purchase_order_item_id,
            product_id: item.product_id,
            quantity_ordered: item.quantity_ordered,
            quantity_received: item.quantity_received,
            quantity_accepted: item.quantity_accepted,
            quantity_rejected: item.quantity_rejected,
            unit_price: item.unit_price,
            rejection_reason: item.rejection_reason || null,
            item_type: 'product'
          }))
        })
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create goods receipt')
      }

      toastActionSuccess(toast, appLang === 'en' ? 'Save' : 'حفظ', appLang === 'en' ? 'Goods Receipt' : 'إيصال الاستلام')
      router.refresh()
      router.push(`/goods-receipts/${result.data.id}`)
    } catch (err: any) {
      console.error("Error saving:", err)
      toastActionError(toast, appLang === 'en' ? 'Save' : 'حفظ', appLang === 'en' ? 'Goods Receipt' : 'إيصال الاستلام', err.message)
    } finally {
      setIsSaving(false)
    }
  }

  if (!hydrated || isLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Package className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <CardTitle>{appLang === 'en' ? 'New Goods Receipt' : 'إيصال استلام جديد'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{appLang === 'en' ? 'Purchase Order' : 'أمر الشراء'} *</Label>
                  <Select 
                    value={selectedPO?.id || ""} 
                    onValueChange={handlePOChange}
                    disabled={!!fromPOId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={appLang === 'en' ? 'Select Purchase Order' : 'اختر أمر شراء'} />
                    </SelectTrigger>
                    <SelectContent>
                      {purchaseOrders.map(po => (
                        <SelectItem key={po.id} value={po.id}>
                          {po.po_number} - {po.suppliers?.name || ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Receipt Date' : 'تاريخ الاستلام'}</Label>
                  <Input 
                    type="date" 
                    value={formData.receipt_date} 
                    onChange={(e) => setFormData({ ...formData, receipt_date: e.target.value })} 
                  />
                </div>
              </div>

              {/* Branch, Cost Center, and Warehouse */}
              <div className="pt-4 border-t">
                <BranchCostCenterSelector
                  branchId={branchId}
                  costCenterId={costCenterId}
                  warehouseId={warehouseId}
                  onBranchChange={setBranchId}
                  onCostCenterChange={setCostCenterId}
                  onWarehouseChange={setWarehouseId}
                  lang={appLang}
                  showLabels={true}
                  showWarehouse={true}
                  disabled={!isAdmin}
                />
              </div>

              {/* Receipt Items */}
              {selectedPO && receiptItems.length > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label className="text-lg font-semibold">{appLang === 'en' ? 'Receipt Items' : 'بنود الاستلام'}</Label>
                  </div>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-slate-800 border-b">
                        <tr>
                          <th className="px-3 py-3 text-right">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                          <th className="px-3 py-3 text-center">{appLang === 'en' ? 'Ordered' : 'المطلوب'}</th>
                          <th className="px-3 py-3 text-center">{appLang === 'en' ? 'Received' : 'المستلم'}</th>
                          <th className="px-3 py-3 text-center">{appLang === 'en' ? 'Accepted' : 'المقبول'}</th>
                          <th className="px-3 py-3 text-center">{appLang === 'en' ? 'Rejected' : 'المرفوض'}</th>
                          <th className="px-3 py-3 text-center">{appLang === 'en' ? 'Rejection Reason' : 'سبب الرفض'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {receiptItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                            <td className="px-3 py-3">{item.product_name}</td>
                            <td className="px-3 py-3 text-center">{item.quantity_ordered}</td>
                            <td className="px-3 py-3">
                              <NumericInput
                                min={0}
                                max={item.quantity_ordered * 1.1} // Allow 10% over-receipt
                                className="text-center text-sm w-20"
                                value={item.quantity_received}
                                onChange={(val) => updateReceiptItem(idx, "quantity_received", val)}
                              />
                            </td>
                            <td className="px-3 py-3">
                              <NumericInput
                                min={0}
                                max={item.quantity_received}
                                className="text-center text-sm w-20"
                                value={item.quantity_accepted}
                                onChange={(val) => updateReceiptItem(idx, "quantity_accepted", val)}
                              />
                            </td>
                            <td className="px-3 py-3 text-center text-red-600">
                              {item.quantity_rejected}
                            </td>
                            <td className="px-3 py-3">
                              {item.quantity_rejected > 0 && (
                                <Input
                                  className="text-sm"
                                  placeholder={appLang === 'en' ? 'Reason...' : 'السبب...'}
                                  value={item.rejection_reason || ""}
                                  onChange={(e) => updateReceiptItem(idx, "rejection_reason", e.target.value)}
                                />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  placeholder={appLang === 'en' ? 'Additional notes...' : 'ملاحظات إضافية...'}
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                >
                  {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                </Button>
                <Button type="submit" disabled={isSaving || !selectedPO || !warehouseId}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin ml-1" />
                      {appLang === 'en' ? 'Saving...' : 'جاري الحفظ...'}
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 ml-1" />
                      {appLang === 'en' ? 'Save GRN' : 'حفظ الإيصال'}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
