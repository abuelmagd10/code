"use client"

// v3.74.904 — تعديل الإشعار الدائن المرفوض وإعادة إرساله للاعتماد.
//
// الحادثة (ملاحظة المالك الحية 30/7 بعد رفض CR-51543): «يجب أن يظهر زر
// التعديل للمنشئ فى حالة الرفض مثل باقى الاعتمادات المتواجدة فى المشروع».
// النمط المعتمد (نقل المخزون): المرفوض يعدّله منشئه ويعيد إرساله.
//
// القاعدة هى الحَكم: update_vendor_credit_with_items ترفض غير المنشئ
// (NOT_CREATOR) وغير المرفوض (NOT_REJECTED) ومحاسباً خارج فرعه
// (BRANCH_SCOPE) — وهذه الشاشة تصدُق فلا تعرض نموذجاً لمن سيُرفض طلبه.
// بعد الإرسال تُطبَّق مصفوفة 865 من جديد بدور المنشئ لحظتها.
//
// ترث الشاشة قرارات الإنشاء كما هى: قفل الفرع/مركز التكلفة لغير المالك
// والمدير العام (901)، ولا عمود حساب فى البنود (902)، ولا خانة تسوية (788).

import { attachProductCosts } from "@/lib/product-costs"
import type React from "react"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter, useParams } from "next/navigation"
import { Trash2, Plus, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
import { toastActionError } from "@/lib/notifications"
import { getActiveCurrencies, getBaseCurrency, type Currency } from "@/lib/currency-service"
import { ExchangeRateSelector } from "@/components/ExchangeRateSelector"
import { BranchCostCenterSelector } from "@/components/branch-cost-center-selector"
import { ProductSearchSelect } from "@/components/ProductSearchSelect"
import { computeDocumentTotals } from "@/lib/document-totals"
import { TaxCodeSelect } from "@/components/forms/tax-code-select"

type Supplier = { id: string; name: string }
type Product = { id: string; name: string; cost_price: number | null; sku?: string | null; item_type?: 'product' | 'service'; quantity_on_hand?: number; image_urls?: string[] | null }

type ItemRow = {
  product_id: string | null
  description: string
  quantity: number
  unit_price: number
  discount_percent: number
  tax_rate: number
  tax_code_id?: string | null
  account_id: string | null
  line_total: number
}

export default function EditVendorCreditPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const { toast } = useToast()
  const params = useParams()
  const id = params?.id as string

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // غير المؤهَّل لا يرى نموذجاً سيُرفض حفظه — يرى السبب صراحةً.
  const [blockedReason, setBlockedReason] = useState<string | null>(null)

  const [credit, setCredit] = useState({
    supplier_id: "",
    credit_number: "",
    credit_date: new Date().toISOString().slice(0, 10),
    discount_type: "percent" as "percent" | "amount",
    discount_value: 0,
    discount_position: "before_tax" as "before_tax" | "after_tax",
    tax_inclusive: false,
    shipping: 0,
    shipping_tax_rate: 0,
    notes: "",
    currency: "EGP"
  })

  const [items, setItems] = useState<ItemRow[]>([])
  const [saving, setSaving] = useState(false)

  const [branchId, setBranchId] = useState<string | null>(null)
  const [costCenterId, setCostCenterId] = useState<string | null>(null)
  // v3.74.901 — الفرع ومركز التكلفة لا يغيّرهما إلا المالك أو المدير العام.
  const [branchLocked, setBranchLocked] = useState(false)

  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [exchangeRate, setExchangeRate] = useState<{ rate: number; rateId: string | null; source: string }>({ rate: 1, rateId: null, source: 'same_currency' })
  const [baseCurrency, setBaseCurrency] = useState<string>("")

  useEffect(() => {
    ; (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !id) { setLoading(false); return }

        const { getActiveCompanyId } = await import("@/lib/company")
        const loadedCompanyId = await getActiveCompanyId(supabase)
        if (!loadedCompanyId) { setLoading(false); return }
        setCompanyId(loadedCompanyId)

        // الإشعار نفسه أولاً — وبواباته قبل أى نموذج.
        const { data: vc } = await supabase.from("vendor_credits").select("*").eq("id", id).single()
        if (!vc) {
          setBlockedReason("الإشعار غير موجود")
          setLoading(false); return
        }
        if (vc.status !== 'rejected') {
          setBlockedReason("لا يُعدَّل إلا الإشعار المرفوض — المعلّق يُقرَّر من صندوق الموافقات، والمرحَّل تحكمه أدوات التصحيح المحاسبية")
          setLoading(false); return
        }
        if (!vc.created_by_user_id || vc.created_by_user_id !== user.id) {
          setBlockedReason("المرفوض يعدّله منشئه وحده")
          setLoading(false); return
        }

        try {
          setBaseCurrency(await getBaseCurrency(supabase, loadedCompanyId))
        } catch (err) {
          console.error(err)
        }

        const { data: memberDataVC } = await supabase
          .from("company_members")
          .select("role, branch_id")
          .eq("company_id", loadedCompanyId)
          .eq("user_id", user.id)
          .maybeSingle()
        const { data: companyDataVC } = await supabase.from("companies").select("user_id").eq("id", loadedCompanyId).single()
        const isOwnerVC = companyDataVC?.user_id === user.id
        const roleVC = isOwnerVC ? "owner" : (memberDataVC?.role || "viewer")
        const userBranchIdVC = isOwnerVC ? null : (memberDataVC?.branch_id || null)
        const normalizedRoleVC = String(roleVC).trim().toLowerCase().replace(/\s+/g, '_')
        const isAdminVC = ['super_admin', 'admin', 'gm', 'owner', 'generalmanager', 'superadmin'].includes(normalizedRoleVC)

        // v3.74.901 — قفل الفرع/مركز التكلفة لغير المالك والمدير العام
        if (!isAdminVC && userBranchIdVC) {
          setBranchId(userBranchIdVC)
          if (vc.branch_id === userBranchIdVC && vc.cost_center_id) {
            setCostCenterId(vc.cost_center_id)
          } else {
            try {
              const { data: brRow } = await supabase
                .from("branches").select("default_cost_center_id").eq("id", userBranchIdVC).maybeSingle()
              if (brRow?.default_cost_center_id) {
                setCostCenterId(brRow.default_cost_center_id)
              } else {
                const { data: ccRows } = await supabase
                  .from("cost_centers").select("id")
                  .eq("company_id", loadedCompanyId).eq("branch_id", userBranchIdVC).limit(1)
                if (ccRows && ccRows[0]) setCostCenterId(ccRows[0].id)
              }
            } catch { /* القاعدة سترفض خارج الفرع على أى حال */ }
          }
          setBranchLocked(true)
        } else {
          setBranchId(vc.branch_id || null)
          setCostCenterId(vc.cost_center_id || null)
        }

        // الرأس كما حُفظ — والمبالغ بعملة المستند الأصلية.
        setCredit({
          supplier_id: vc.supplier_id || "",
          credit_number: vc.credit_number || "",
          credit_date: vc.credit_date || new Date().toISOString().slice(0, 10),
          discount_type: (vc.discount_type as any) || "percent",
          discount_value: Number(vc.discount_value || 0),
          discount_position: (vc.discount_position as any) || "before_tax",
          tax_inclusive: !!vc.tax_inclusive,
          shipping: Number(vc.shipping || 0),
          shipping_tax_rate: Number(vc.shipping_tax_rate || 0),
          notes: vc.notes || "",
          currency: vc.original_currency || "EGP",
        })
        setExchangeRate({ rate: Number(vc.exchange_rate_used || 1), rateId: vc.exchange_rate_id || null, source: 'saved' })

        const { data: rows } = await supabase
          .from("vendor_credit_items")
          .select("product_id, description, quantity, unit_price, discount_percent, tax_rate, tax_code_id, account_id, line_total")
          .eq("vendor_credit_id", id)
        setItems(((rows || []) as any[]).map(r => ({
          product_id: r.product_id || null,
          description: r.description || "",
          quantity: Number(r.quantity || 0),
          unit_price: Number(r.unit_price || 0),
          discount_percent: Number(r.discount_percent || 0),
          tax_rate: Number(r.tax_rate || 0),
          tax_code_id: r.tax_code_id || null,
          account_id: r.account_id || null,
          line_total: Number(r.line_total || 0),
        })))

        let suppQueryVC = supabase.from("suppliers").select("id, name").eq("company_id", loadedCompanyId)
        if (!isAdminVC && userBranchIdVC) suppQueryVC = suppQueryVC.eq("branch_id", userBranchIdVC)
        const { data: sups } = await suppQueryVC
        setSuppliers((sups || []) as any)

        let prodsQueryVC = supabase.from("products").select("id, name, sku, item_type, quantity_on_hand, image_urls").eq("company_id", loadedCompanyId)
        if (!isAdminVC && userBranchIdVC) prodsQueryVC = prodsQueryVC.or(`branch_id.eq.${userBranchIdVC},branch_id.is.null`)
        const { data: prods } = await prodsQueryVC
        // v3.74.909 — التكلفة تُلحَق من المسار المخوَّل.
        setProducts((await attachProductCosts(supabase, (prods || []) as any[])) as any)

        const curr = await getActiveCurrencies(supabase, loadedCompanyId)
        if (curr.length > 0) setCurrencies(curr)
      } finally {
        setLoading(false)
      }
    })()
  }, [id])

  useEffect(() => {
    if (credit.currency === baseCurrency) {
      setExchangeRate({ rate: 1, rateId: null, source: 'same_currency' })
    }
  }, [credit.currency, baseCurrency])

  const totals = useMemo(() => computeDocumentTotals({
    items,
    taxInclusive: !!credit.tax_inclusive,
    discountType: credit.discount_type as any,
    discountValue: credit.discount_value,
    discountPosition: credit.discount_position as any,
    shippingCharge: credit.shipping,
    shippingTaxRate: credit.shipping_tax_rate,
    adjustment: 0,
  }), [items, credit.tax_inclusive, credit.discount_type, credit.discount_value, credit.discount_position, credit.shipping, credit.shipping_tax_rate])
  const subtotal = totals.subtotal
  const itemsTax = totals.tax
  const total = totals.total

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

  const addItem = () => setItems(prev => [...prev, { product_id: null, description: "", quantity: 1, unit_price: 0, discount_percent: 0, tax_rate: 0, tax_code_id: null, account_id: null, line_total: 0 }])
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const resubmitCredit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      if (!companyId || !credit.supplier_id || !id) return

      const finalBaseSubtotal = credit.currency === baseCurrency ? subtotal : Math.round(subtotal * exchangeRate.rate * 10000) / 10000
      const finalBaseTax = credit.currency === baseCurrency ? itemsTax : Math.round(itemsTax * exchangeRate.rate * 10000) / 10000
      const finalBaseTotal = credit.currency === baseCurrency ? total : Math.round(total * exchangeRate.rate * 10000) / 10000

      const rows = items.map(it => ({
        product_id: it.product_id,
        // v3.74.899 — وصفٌ فارغ مع منتجٍ مختار ⇒ يُحفظ باسم المنتج.
        description: it.description || products.find(pp => pp.id === it.product_id)?.name || "",
        quantity: it.quantity,
        unit_price: it.unit_price,
        tax_rate: it.tax_rate,
        tax_code_id: it.tax_code_id || null,
        discount_percent: it.discount_percent,
        account_id: it.account_id,
        line_total: it.line_total,
      }))

      // رأسٌ وبنودٌ فى نداءٍ ذرّى واحد (880) — والقاعدة تعيد تحكيم مصفوفة
      // 865 بدور المنشئ لحظةَ إعادة الإرسال.
      const { data: res, error: upErr } = await supabase.rpc("update_vendor_credit_with_items", {
        p_credit_id: id,
        p_credit: {
          supplier_id: credit.supplier_id,
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
          notes: credit.notes,
          original_currency: credit.currency,
          original_subtotal: subtotal,
          original_tax_amount: itemsTax,
          original_total_amount: total,
          exchange_rate_used: exchangeRate.rate,
          exchange_rate_id: exchangeRate.rateId,
          branch_id: branchId || null,
          cost_center_id: costCenterId || null,
        },
        p_items: rows,
      })
      if (upErr) throw upErr
      if (!res?.success) {
        const code = res?.error || 'UNKNOWN'
        const msgs: Record<string, string> = {
          NOT_REJECTED: "لا يُعدَّل إلا الإشعار المرفوض",
          NOT_CREATOR: "المرفوض يعدّله منشئه وحده",
          ALREADY_POSTED: "الإشعار مرحَّل بقيدٍ — لا يُعدَّل من هنا",
          ALREADY_APPLIED: "الإشعار طُبّق على فواتير — لا يُعدَّل من هنا",
        }
        throw new Error(msgs[code] || code)
      }

      if (res.status === 'open') {
        // منشئٌ صار مالكاً لحظةَ الإرسال — المصفوفة رحّلته مباشرة.
        toast({ title: "أُعيد الإرسال ورُحِّل", description: "قيد الإشعار رُحِّل مباشرة (مصفوفة 865: المالك)" })
      } else {
        toast({
          title: "أُعيد الإرسال بانتظار الاعتماد",
          description: "وصل إخطارٌ جديد للمعتمدين — القيد لا يُرحَّل إلا بعد الاعتماد من صندوق الموافقات (مصفوفة 865)",
        })
      }
      router.push(`/vendor-credits/${id}`)
    } catch (err: any) {
      console.error("Error resubmitting vendor credit", err)
      toastActionError(toast, "إعادة الإرسال", "الإشعار الدائن", err?.message || "فشل إعادة إرسال الإشعار الدائن")
    } finally { setSaving(false) }
  }

  if (loading) return null

  if (blockedReason) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8">
          <Card>
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-red-600 dark:text-red-400">⛔ {blockedReason}</p>
              <Link href={id ? `/vendor-credits/${id}` : "/vendor-credits"}>
                <Button variant="outline" size="sm" className="flex items-center gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5" />
                  العودة للإشعار
                </Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">
              تعديل إشعار دائن مرفوض {credit.credit_number && <span className="text-gray-400 font-normal">#{credit.credit_number}</span>}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              بعد الحفظ يُعاد الإرسال للاعتماد من جديد (مصفوفة 865) — وسبب الرفض السابق فى الملاحظات أدناه
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={resubmitCredit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>المورد</Label>
                  <select className="w-full border rounded px-2 py-1" value={credit.supplier_id} onChange={(e) => setCredit({ ...credit, supplier_id: e.target.value })}>
                    <option value="">اختر المورد</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>رقم الإشعار</Label>
                  {/* الرقم هوية المستند — القاعدة تحصّنه، والشاشة تصدُق فتعرضه بلا تحرير */}
                  <Input value={credit.credit_number} disabled readOnly />
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

              {credit.currency !== baseCurrency && (
                <div className="space-y-2">
                  <Label>سعر الصرف</Label>
                  <ExchangeRateSelector
                    fromCurrency={credit.currency}
                    baseCurrency={baseCurrency}
                    value={exchangeRate.rate}
                    onChange={(r) => setExchangeRate(prev => ({ ...prev, rate: r }))}
                    onRateMetaChange={(meta) => setExchangeRate({
                      rate: meta?.rate ?? 1,
                      rateId: meta?.rateId ?? null,
                      source: meta?.source ?? 'manual',
                    })}
                    hideLabel
                    showPreview
                    amount={Number(total || 0)}
                  />
                  {total > 0 && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-sm">
                      <div>المبلغ الأساسى: <strong>{(total * exchangeRate.rate).toFixed(2)} {baseCurrency}</strong></div>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-4 border-t">
                <BranchCostCenterSelector
                  branchId={branchId}
                  costCenterId={costCenterId}
                  onBranchChange={setBranchId}
                  onCostCenterChange={setCostCenterId}
                  lang="ar"
                  showLabels={true}
                  showWarehouse={false}
                  disabled={branchLocked}
                />
                {branchLocked && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    🔒 الفرع ومركز التكلفة مثبَّتان على فرعك — تغييرهما للمالك والمدير العام فقط
                  </p>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-600">
                      <th className="text-right p-2">المنتج</th>
                      <th className="text-right p-2">الوصف</th>
                      {/* v3.74.902 — لا عمود حساب: القيد تحكمه دالة الترحيل تلقائياً */}
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
                            products={products
                              .filter(p => p && p.id && p.name)
                              .map(p => ({
                                id: String(p.id || ''),
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
                        <td className="p-2"><NumericInput min={0} step="1" value={it.quantity} onChange={(val) => updateItem(idx, { quantity: Math.round(val) })} /></td>
                        <td className="p-2"><NumericInput min={0} step="0.01" value={it.unit_price} onChange={(val) => updateItem(idx, { unit_price: val })} decimalPlaces={2} /></td>
                        <td className="p-2"><NumericInput min={0} step="0.01" value={it.discount_percent} onChange={(val) => updateItem(idx, { discount_percent: val })} decimalPlaces={2} /></td>
                        <td className="p-2">
                          <TaxCodeSelect
                            supabase={supabase}
                            scope="purchase"
                            value={{ tax_code_id: it.tax_code_id, tax_rate: it.tax_rate }}
                            onChange={(v) => updateItem(idx, { tax_code_id: v.tax_code_id, tax_rate: v.tax_rate })}
                            lang="ar"
                          />
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
                {/* v3.74.788 — لا خانة تسوية */}
              </div>

              <div className="border-t pt-4">
                <div className="flex flex-col items-end gap-2 text-sm">
                  <div>المجموع قبل الضريبة: {totals.subtotalBeforeDiscount.toFixed(2)}</div>
                  {totals.discountAmount > 0 && (
                    <div className="text-red-600 dark:text-red-400">الخصم: -{totals.discountAmount.toFixed(2)}</div>
                  )}
                  <div>ضريبة البنود + الشحن: {itemsTax.toFixed(2)}</div>
                  <div>الإجمالي: <span className="font-semibold">{total.toFixed(2)}</span></div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Link href={`/vendor-credits/${id}`}>
                  <Button type="button" variant="outline">إلغاء</Button>
                </Link>
                <Button type="submit" disabled={saving || !credit.supplier_id}>حفظ وإعادة الإرسال للاعتماد</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
