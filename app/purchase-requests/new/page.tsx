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
import { useRouter } from "next/navigation"
import { Trash2, Plus, ClipboardList, Save, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { getActiveCompanyId } from "@/lib/company"
import { BranchCostCenterSelector } from "@/components/branch-cost-center-selector"
import { ProductSearchSelect } from "@/components/ProductSearchSelect"
import { notifyPurchaseRequestApprovalRequest } from "@/lib/notification-helpers"
import { useUserContext } from "@/hooks/use-user-context"

interface Product { 
  id: string; 
  name: string; 
  cost_price: number | null; 
  sku: string; 
  item_type?: 'product' | 'service'; 
  quantity_on_hand?: number 
}

interface RequestItem {
  product_id: string;
  quantity_requested: number;
  estimated_unit_price: number;
  item_type?: 'product' | 'service';
  description?: string;
}

export default function NewPurchaseRequestPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [requestItems, setRequestItems] = useState<RequestItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [appLang, setAppLang] = useState<'ar' | 'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      return (fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar'
    } catch { return 'ar' }
  })
  const [hydrated, setHydrated] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    request_date: new Date().toISOString().slice(0, 10),
    required_date: "",
    priority: "normal" as "low" | "normal" | "high" | "urgent",
    notes: ""
  })

  // Currency
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [requestCurrency, setRequestCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const [baseCurrency, setBaseCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const [exchangeRate, setExchangeRate] = useState(1)

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

        // Load products
        const { data: prodData } = await supabase
          .from("products")
          .select("id, name, cost_price, sku, item_type, quantity_on_hand")
          .eq("company_id", companyId)
          .order("name")
        setProducts(prodData || [])

        // Load currencies
        const dbCurrencies = await getActiveCurrencies(supabase, companyId)
        if (dbCurrencies.length > 0) {
          setCurrencies(dbCurrencies)
          const base = dbCurrencies.find(c => c.is_base)
          if (base) {
            setBaseCurrency(base.code)
            setRequestCurrency(base.code)
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
  }, [supabase, hydrated, userContext])

  // Item management
  const addItem = () => {
    setRequestItems([...requestItems, { 
      product_id: "", 
      quantity_requested: 1, 
      estimated_unit_price: 0,
      item_type: 'product'
    }])
  }

  const updateItem = (index: number, field: keyof RequestItem, value: any) => {
    const newItems = [...requestItems]
    newItems[index] = { ...newItems[index], [field]: value }
    if (field === "product_id" && value) {
      const prod = products.find(p => p.id === value)
      if (prod) {
        newItems[index].estimated_unit_price = prod.cost_price || 0
        newItems[index].item_type = prod.item_type || 'product'
      }
    }
    setRequestItems(newItems)
  }

  const removeItem = (index: number) => {
    setRequestItems(requestItems.filter((_, i) => i !== index))
  }

  // Calculate totals
  const calculateTotals = useMemo(() => {
    let total = 0
    requestItems.forEach(item => {
      const qty = Number(item.quantity_requested) || 0
      const price = Number(item.estimated_unit_price) || 0
      total += qty * price
    })
    return { total }
  }, [requestItems])

  // Save purchase request
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (requestItems.length === 0) {
      toastActionError(toast, appLang === 'en' ? 'Save' : 'حفظ', appLang === 'en' ? 'Please add at least one item' : 'الرجاء إضافة عنصر واحد على الأقل')
      return
    }

    try {
      setIsSaving(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Create request via API
      const response = await fetch('/api/purchase-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_date: formData.request_date,
          required_date: formData.required_date || null,
          priority: formData.priority,
          total_estimated_cost: calculateTotals.total,
          currency: requestCurrency,
          exchange_rate: exchangeRate,
          branch_id: branchId,
          cost_center_id: costCenterId,
          warehouse_id: warehouseId,
          notes: formData.notes || null,
          items: requestItems.map(item => ({
            product_id: item.product_id || null,
            description: item.description || null,
            quantity_requested: item.quantity_requested,
            estimated_unit_price: item.estimated_unit_price,
            item_type: item.item_type || 'product'
          }))
        })
      })

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to create purchase request')
      }

      const requestData = result.data

      // Submit for approval if not admin
      if (!isAdmin) {
        await notifyPurchaseRequestApprovalRequest({
          companyId,
          requestId: requestData.id,
          requestNumber: requestData.request_number,
          amount: calculateTotals.total,
          currency: requestCurrency,
          branchId: branchId || undefined,
          costCenterId: costCenterId || undefined,
          createdBy: user.id,
          appLang
        })

        // Update status to submitted
        await supabase
          .from("purchase_requests")
          .update({ status: 'submitted', approval_status: 'pending' })
          .eq("id", requestData.id)
      }

      toastActionSuccess(toast, appLang === 'en' ? 'Save' : 'حفظ', appLang === 'en' ? 'Purchase Request' : 'طلب الشراء')
      router.refresh()
      router.push("/purchase-requests")
    } catch (err: any) {
      console.error("Error saving:", err)
      toastActionError(toast, appLang === 'en' ? 'Save' : 'حفظ', appLang === 'en' ? 'Purchase Request' : 'طلب الشراء', err.message)
    } finally {
      setIsSaving(false)
    }
  }

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
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
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <ClipboardList className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle>{appLang === 'en' ? 'New Purchase Request' : 'طلب شراء جديد'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>{appLang === 'en' ? 'Request Date' : 'تاريخ الطلب'}</Label>
                  <Input 
                    type="date" 
                    value={formData.request_date} 
                    onChange={(e) => setFormData({ ...formData, request_date: e.target.value })} 
                  />
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Required Date' : 'تاريخ الحاجة'}</Label>
                  <Input 
                    type="date" 
                    value={formData.required_date} 
                    onChange={(e) => setFormData({ ...formData, required_date: e.target.value })} 
                  />
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Priority' : 'الأولوية'}</Label>
                  <Select value={formData.priority} onValueChange={(v: any) => setFormData({ ...formData, priority: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{appLang === 'en' ? 'Low' : 'منخفض'}</SelectItem>
                      <SelectItem value="normal">{appLang === 'en' ? 'Normal' : 'عادي'}</SelectItem>
                      <SelectItem value="high">{appLang === 'en' ? 'High' : 'عالي'}</SelectItem>
                      <SelectItem value="urgent">{appLang === 'en' ? 'Urgent' : 'عاجل'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Currency */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
                  <Select value={requestCurrency} onValueChange={setRequestCurrency}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.length > 0 ? (
                        currencies.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            <span className="font-bold text-blue-600 mr-1">{c.symbol}</span> {c.code}
                          </SelectItem>
                        ))
                      ) : (
                        Object.entries(currencySymbols).map(([code, symbol]) => (
                          <SelectItem key={code} value={code}>
                            <span className="font-bold text-blue-600 mr-1">{symbol}</span> {code}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
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

              {/* Items */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label className="text-lg font-semibold">{appLang === 'en' ? 'Items' : 'العناصر'}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="h-4 w-4 ml-1" /> {appLang === 'en' ? 'Add Item' : 'إضافة'}
                  </Button>
                </div>
                {requestItems.length === 0 ? (
                  <p className="text-center py-8 text-gray-500 dark:text-gray-400">
                    {appLang === 'en' ? 'No items added yet' : 'لم تضف أي عناصر حتى الآن'}
                  </p>
                ) : (
                  <div className="hidden md:block overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-slate-800 border-b">
                        <tr>
                          <th className="px-3 py-3 text-right font-semibold">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                          <th className="px-3 py-3 text-center font-semibold w-24">{appLang === 'en' ? 'Quantity' : 'الكمية'}</th>
                          <th className="px-3 py-3 text-center font-semibold w-28">{appLang === 'en' ? 'Est. Price' : 'السعر المقدر'}</th>
                          <th className="px-3 py-3 text-center font-semibold w-28">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                          <th className="px-3 py-3 w-12"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {requestItems.map((item, idx) => {
                          const lineTotal = (Number(item.quantity_requested) || 0) * (Number(item.estimated_unit_price) || 0)
                          return (
                            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                              <td className="px-3 py-3">
                                <ProductSearchSelect
                                  products={products.map(p => ({
                                    ...p,
                                    unit_price: p.cost_price ?? 0
                                  }))}
                                  value={item.product_id}
                                  onValueChange={(v) => updateItem(idx, "product_id", v)}
                                  lang={appLang}
                                  currency={requestCurrency}
                                  showStock={true}
                                  showPrice={true}
                                  productsOnly={true}
                                />
                              </td>
                              <td className="px-3 py-3">
                                <NumericInput
                                  min={1}
                                  className="text-center text-sm"
                                  value={item.quantity_requested}
                                  onChange={(val) => updateItem(idx, "quantity_requested", Math.round(val))}
                                />
                              </td>
                              <td className="px-3 py-3">
                                <NumericInput
                                  step="0.01"
                                  min={0}
                                  className="text-center text-sm"
                                  value={item.estimated_unit_price}
                                  onChange={(val) => updateItem(idx, "estimated_unit_price", val)}
                                  decimalPlaces={2}
                                />
                              </td>
                              <td className="px-3 py-3 text-center">
                                {currencySymbols[requestCurrency] || requestCurrency} {lineTotal.toFixed(2)}
                              </td>
                              <td className="px-3 py-3">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeItem(idx)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

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

              {/* Totals */}
              <div className="border-t pt-4">
                <div className="flex justify-end">
                  <div className="w-full md:w-64 space-y-2">
                    <div className="flex justify-between text-lg font-semibold">
                      <span>{appLang === 'en' ? 'Estimated Total' : 'الإجمالي المقدر'}:</span>
                      <span>
                        {currencySymbols[requestCurrency] || requestCurrency} {calculateTotals.total.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
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
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin ml-1" />
                      {appLang === 'en' ? 'Saving...' : 'جاري الحفظ...'}
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 ml-1" />
                      {appLang === 'en' ? 'Save Request' : 'حفظ الطلب'}
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
