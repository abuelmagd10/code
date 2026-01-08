"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter } from "next/navigation"
import { Trash2, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { BranchCostCenterSelector } from "@/components/branch-cost-center-selector"
import { ProductSearchSelect } from "@/components/ProductSearchSelect"

type Supplier = { id: string; name: string }
type Product = { id: string; name: string; cost_price: number | null; sku?: string | null; item_type?: 'product' | 'service'; quantity_on_hand?: number }
type Account = { id: string; account_code: string | null; account_name: string; account_type: string }
type TaxRate = { id: string; name: string; rate: number; scope?: string }

type ItemRow = {
  product_id: string | null
  description: string
  quantity: number
  unit_price: number
  discount_percent: number
  tax_rate: number
  account_id: string | null
  line_total: number
}

export default function NewVendorCreditPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const { toast } = useToast()

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [taxCodes, setTaxCodes] = useState<TaxRate[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)

  const [credit, setCredit] = useState({
    supplier_id: "",
    credit_number: "CR-" + Math.floor(Math.random() * 100000),
    credit_date: new Date().toISOString().slice(0, 10),
    discount_type: "percent" as "percent" | "amount",
    discount_value: 0,
    discount_position: "before_tax" as "before_tax" | "after_tax",
    tax_inclusive: false,
    shipping: 0,
    shipping_tax_rate: 0,
    adjustment: 0,
    notes: "",
    currency: "EGP"
  })

  const [items, setItems] = useState<ItemRow[]>([
    { product_id: null, description: "", quantity: 1, unit_price: 0, discount_percent: 0, tax_rate: 0, account_id: null, line_total: 0 },
  ])
  const [saving, setSaving] = useState(false)

  // Branch and Cost Center
  const [branchId, setBranchId] = useState<string | null>(null)
  const [costCenterId, setCostCenterId] = useState<string | null>(null)

  // Multi-currency support
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [exchangeRate, setExchangeRate] = useState<{ rate: number; rateId: string | null; source: string }>({ rate: 1, rateId: null, source: 'same_currency' })
  const baseCurrency = typeof window !== 'undefined' ? localStorage.getItem('app_currency') || 'EGP' : 'EGP'
  const currencySymbols: Record<string, string> = { EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ' }

  useEffect(() => {
    ; (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const loadedCompanyId = await getActiveCompanyId(supabase)
      if (!loadedCompanyId) return
      setCompanyId(loadedCompanyId)

      const { data: sups } = await supabase.from("suppliers").select("id, name").eq("company_id", loadedCompanyId)
      setSuppliers((sups || []) as any)

      const { data: prods } = await supabase.from("products").select("id, name, cost_price, sku, item_type, quantity_on_hand").eq("company_id", loadedCompanyId)
      console.log('📦 [Vendor Credits] Loaded products:', prods?.length || 0, prods)
      setProducts((prods || []) as any)

      const { data: accs } = await supabase.from("chart_of_accounts").select("id, account_code, account_name, account_type").eq("company_id", loadedCompanyId)
      setAccounts((accs || []) as any)

      // ضرائب من الإعدادات (محلية)
      try {
        const local = localStorage.getItem("tax_codes")
        if (local) setTaxCodes(JSON.parse(local))
      } catch { }

      // Load currencies
      const curr = await getActiveCurrencies(supabase, loadedCompanyId)
      if (curr.length > 0) setCurrencies(curr)
      setCredit(c => ({ ...c, currency: baseCurrency }))
    })()
  }, [])

  // Update exchange rate when currency changes
  useEffect(() => {
    const updateRate = async () => {
      if (credit.currency === baseCurrency) {
        setExchangeRate({ rate: 1, rateId: null, source: 'same_currency' })
      } else if (companyId) {
        const result = await getExchangeRate(supabase, credit.currency, baseCurrency, undefined, companyId)
        setExchangeRate({ rate: result.rate, rateId: result.rateId || null, source: result.source })
      }
    }
    updateRate()
  }, [credit.currency, companyId, baseCurrency])

  const subtotal = useMemo(() => items.reduce((sum, it) => sum + Number(it.line_total || 0), 0), [items])
  const shippingTax = useMemo(() => (credit.shipping || 0) * (Number(credit.shipping_tax_rate || 0) / 100), [credit.shipping, credit.shipping_tax_rate])
  const discountBeforeTax = useMemo(() => {
    if (credit.discount_type === "percent") return subtotal * (Number(credit.discount_value || 0) / 100)
    return Number(credit.discount_value || 0)
  }, [subtotal, credit.discount_type, credit.discount_value])
  const itemsTax = useMemo(() => {
    const base = credit.discount_position === "before_tax" ? subtotal - discountBeforeTax : subtotal
    const itemsTaxSum = items.reduce((sum, it) => sum + (Number(it.line_total || 0) * (Number(it.tax_rate || 0) / 100)), 0)
    return itemsTaxSum + shippingTax
  }, [items, subtotal, discountBeforeTax, credit.discount_position, shippingTax])
  const total = useMemo(() => {
    const base = credit.discount_position === "before_tax" ? subtotal - discountBeforeTax : subtotal
    return base + itemsTax + Number(credit.shipping || 0) + Number(credit.adjustment || 0)
  }, [subtotal, discountBeforeTax, itemsTax, credit.shipping, credit.adjustment])

  const updateItem = (idx: number, patch: Partial<ItemRow>) => {
    setItems(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...patch }
      const qty = Number(next[idx].quantity || 0)
      const price = Number(next[idx].unit_price || 0)
      const disc = Number(next[idx].discount_percent || 0)
      const gross = qty * price
      const net = gross - (gross * disc / 100)
      next[idx].line_total = Number(net.toFixed(2))
      return next
    })
  }

  const addItem = () => setItems(prev => [...prev, { product_id: null, description: "", quantity: 1, unit_price: 0, discount_percent: 0, tax_rate: 0, account_id: null, line_total: 0 }])
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const saveCredit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      if (!companyId || !credit.supplier_id) return

      // Calculate base amounts for multi-currency
      const finalBaseSubtotal = credit.currency === baseCurrency ? subtotal : Math.round(subtotal * exchangeRate.rate * 10000) / 10000
      const finalBaseTax = credit.currency === baseCurrency ? itemsTax : Math.round(itemsTax * exchangeRate.rate * 10000) / 10000
      const finalBaseTotal = credit.currency === baseCurrency ? total : Math.round(total * exchangeRate.rate * 10000) / 10000

      const { data: vc, error: vcErr } = await supabase
        .from("vendor_credits")
        .insert({
          company_id: companyId,
          supplier_id: credit.supplier_id,
          credit_number: credit.credit_number,
          credit_date: credit.credit_date,
          subtotal: finalBaseSubtotal,
          tax_amount: finalBaseTax,
          total_amount: finalBaseTotal,
          discount_type: credit.discount_type,
          discount_value: credit.discount_value,
          discount_position: credit.discount_position,
          tax_inclusive: credit.tax_inclusive,
          shipping: credit.shipping,
          shipping_tax_rate: credit.shipping_tax_rate,
          adjustment: credit.adjustment,
          notes: credit.notes,
          // Multi-currency fields
          original_currency: credit.currency,
          original_subtotal: subtotal,
          original_tax_amount: itemsTax,
          original_total_amount: total,
          exchange_rate_used: exchangeRate.rate,
          exchange_rate_id: exchangeRate.rateId,
          // Branch and Cost Center
          branch_id: branchId || null,
          cost_center_id: costCenterId || null,
        })
        .select()
        .single()
      if (vcErr) throw vcErr

      const rows = items.map(it => ({
        vendor_credit_id: vc.id,
        product_id: it.product_id,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        tax_rate: it.tax_rate,
        discount_percent: it.discount_percent,
        account_id: it.account_id,
        line_total: it.line_total,
      }))

      const { error: itemsErr } = await supabase.from("vendor_credit_items").insert(rows)
      if (itemsErr) throw itemsErr

      toastActionSuccess(toast, "الإنشاء", "الإشعار الدائن")
      router.push(`/vendor-credits/${vc.id}`)
    } catch (err) {
      console.error("Error saving vendor credit", err)
      toastActionError(toast, "الحفظ", "الإشعار الدائن", "فشل حفظ الإشعار الدائن")
    } finally { setSaving(false) }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">إشعار دائن للمورد</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={saveCredit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <Label>المورد</Label>
                  <select className="w-full border rounded px-2 py-1" value={credit.supplier_id} onChange={(e) => setCredit({ ...credit, supplier_id: e.target.value })}>
                    <option value="">اختر المورد</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>رقم الإشعار</Label>
                  <Input value={credit.credit_number} onChange={(e) => setCredit({ ...credit, credit_number: e.target.value })} />
                </div>
                <div>
                  <Label>التاريخ</Label>
                  <Input type="date" value={credit.credit_date} onChange={(e) => setCredit({ ...credit, credit_date: e.target.value })} />
                </div>
                <div>
                  <Label>العملة</Label>
                  <select className="w-full border rounded px-2 py-1" value={credit.currency} onChange={(e) => setCredit({ ...credit, currency: e.target.value })}>
                    {currencies.length > 0 ? (
                      currencies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)
                    ) : (
                      <>
                        <option value="EGP">EGP</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="SAR">SAR</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {credit.currency !== baseCurrency && total > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm">
                  <div>سعر الصرف: <strong>1 {credit.currency} = {exchangeRate.rate.toFixed(4)} {baseCurrency}</strong> ({exchangeRate.source})</div>
                  <div>المبلغ الأساسي: <strong>{(total * exchangeRate.rate).toFixed(2)} {baseCurrency}</strong></div>
                </div>
              )}

              {/* Branch and Cost Center Selection */}
              <div className="pt-4 border-t">
                <BranchCostCenterSelector
                  branchId={branchId}
                  costCenterId={costCenterId}
                  onBranchChange={setBranchId}
                  onCostCenterChange={setCostCenterId}
                  lang="ar"
                  showLabels={true}
                  showWarehouse={false}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-600">
                      <th className="text-right p-2">المنتج</th>
                      <th className="text-right p-2">الوصف</th>
                      <th className="text-right p-2">الحساب</th>
                      <th className="text-right p-2">الكمية</th>
                      <th className="text-right p-2">سعر الوحدة</th>
                      <th className="text-right p-2">خصم%</th>
                      <th className="text-right p-2">الضريبة%</th>
                      <th className="text-right p-2">الإجمالي</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-2">
                          <ProductSearchSelect
                            products={products.map(p => ({
                              id: String(p.id),
                              name: String(p.name || ''),
                              sku: p.sku ? String(p.sku) : null,
                              unit_price: Number(p.cost_price ?? 0),
                              item_type: (p.item_type || 'product') as 'product' | 'service',
                              quantity_on_hand: Number(p.quantity_on_hand ?? 0)
                            }))}
                            value={it.product_id || ""}
                            onValueChange={(v) => {
                              const prod = products.find(p => p.id === v)
                              const price = Number(prod?.cost_price ?? 0)
                              updateItem(idx, { product_id: v || null, unit_price: price })
                            }}
                            lang="ar"
                            currency={credit.currency}
                            showStock={true}
                            showPrice={true}
                            productsOnly={true}
                          />
                        </td>
                        <td className="p-2"><Input value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })} /></td>
                        <td className="p-2">
                          <select className="w-full border rounded px-2 py-1" value={it.account_id || ""} onChange={(e) => updateItem(idx, { account_id: e.target.value || null })}>
                            <option value="">اختر الحساب</option>
                            {accounts.map(a => (<option key={a.id} value={a.id}>{a.account_code || ""} {a.account_name}</option>))}
                          </select>
                        </td>
                        <td className="p-2"><NumericInput min={0} step="1" value={it.quantity} onChange={(val) => updateItem(idx, { quantity: Math.round(val) })} /></td>
                        <td className="p-2"><NumericInput min={0} step="0.01" value={it.unit_price} onChange={(val) => updateItem(idx, { unit_price: val })} decimalPlaces={2} /></td>
                        <td className="p-2"><NumericInput min={0} step="0.01" value={it.discount_percent} onChange={(val) => updateItem(idx, { discount_percent: val })} decimalPlaces={2} /></td>
                        <td className="p-2">
                          <select className="w-full border rounded px-2 py-1" value={it.tax_rate} onChange={(e) => updateItem(idx, { tax_rate: Number(e.target.value) })}>
                            <option value={0}>0%</option>
                            {taxCodes.filter(t => t.scope === "purchase" || t.scope === "both").map(tc => (
                              <option key={tc.id} value={tc.rate}>{tc.name} ({tc.rate}%)</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 text-right">{it.line_total.toFixed(2)}</td>
                        <td className="p-2">
                          <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3"><Button variant="outline" onClick={addItem}><Plus className="w-4 h-4 mr-2" /> إضافة بند</Button></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>الملاحظات</Label>
                  <Input value={credit.notes} onChange={(e) => setCredit({ ...credit, notes: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>خصم</Label>
                  <div className="flex gap-2">
                    <select className="border rounded px-2 py-1" value={credit.discount_type} onChange={(e) => setCredit({ ...credit, discount_type: e.target.value as any })}>
                      <option value="percent">%</option>
                      <option value="amount">مبلغ</option>
                    </select>
                    <NumericInput min={0} step="0.01" value={credit.discount_value} onChange={(val) => setCredit({ ...credit, discount_value: val })} decimalPlaces={2} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>الخصم قبل/بعد الضريبة</Label>
                  <select className="w-full border rounded px-2 py-1" value={credit.discount_position} onChange={(e) => setCredit({ ...credit, discount_position: e.target.value as any })}>
                    <option value="before_tax">قبل الضريبة</option>
                    <option value="after_tax">بعد الضريبة</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>الشحن</Label>
                  <NumericInput min={0} step="0.01" value={credit.shipping} onChange={(val) => setCredit({ ...credit, shipping: val })} decimalPlaces={2} />
                </div>
                <div>
                  <Label>ضريبة الشحن%</Label>
                  <NumericInput min={0} step="0.01" value={credit.shipping_tax_rate} onChange={(val) => setCredit({ ...credit, shipping_tax_rate: val })} decimalPlaces={2} />
                </div>
                <div>
                  <Label>تسوية/تعديل</Label>
                  <NumericInput step="0.01" value={credit.adjustment} onChange={(val) => setCredit({ ...credit, adjustment: val })} decimalPlaces={2} />
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex flex-col items-end gap-2 text-sm">
                  <div>المجموع قبل الضريبة: {subtotal.toFixed(2)}</div>
                  <div>ضريبة البنود + الشحن: {itemsTax.toFixed(2)}</div>
                  <div>الإجمالي: <span className="font-semibold">{total.toFixed(2)}</span></div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="submit" disabled={saving || !credit.supplier_id}>حفظ الإشعار</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

