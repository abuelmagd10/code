"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { Plus, Trash2, Package, Loader2 } from "lucide-react"

type PriceHandling = "add_to_total" | "included" | "free"

interface ChildProduct {
  id: string
  name: string
  sku?: string
  unit_price?: number
  cost_price?: number
  item_type?: string
  is_active?: boolean
}

interface BundleRow {
  id: string
  parent_product_id: string
  child_product_id: string
  quantity: number
  is_optional: boolean
  auto_deduct_inventory: boolean
  price_handling: PriceHandling
  display_order: number
  notes: string | null
  child?: ChildProduct | null
}

interface BundleItemsManagerProps {
  productId: string
  parentName?: string
  lang?: string
}

export function BundleItemsManager({ productId, parentName, lang = "ar" }: BundleItemsManagerProps) {
  const isAr = lang !== "en"
  const t = (ar: string, en: string) => (isAr ? ar : en)
  const { toast } = useToast()

  const [rows, setRows] = useState<BundleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<ChildProduct[]>([])
  const [submitting, setSubmitting] = useState(false)

  // New-row form state
  const [draft, setDraft] = useState({
    child_product_id: "",
    quantity: 1,
    is_optional: false,
    auto_deduct_inventory: true,
    price_handling: "add_to_total" as PriceHandling,
    display_order: 0,
    notes: "",
  })

  const loadRows = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/products/${productId}/bundle`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load")
      setRows((json.items ?? []) as BundleRow[])
    } catch (err: any) {
      toastActionError(toast, t("خطأ", "Error"), err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadProducts = async () => {
    try {
      const res = await fetch(`/api/products?limit=500`, { cache: "no-store" })
      const json = await res.json()
      if (json?.products) setProducts(json.products as ChildProduct[])
    } catch {
      /* non-critical */
    }
  }

  useEffect(() => {
    loadRows()
    loadProducts()
  }, [productId])

  const usedChildIds = new Set(rows.map((r) => r.child_product_id))
  const availableProducts = products.filter(
    (p) => p.is_active !== false && p.id !== productId && !usedChildIds.has(p.id)
  )

  const handleAdd = async () => {
    if (!draft.child_product_id) {
      toastActionError(toast, t("خطأ", "Error"), t("اختر الصنف المرفق", "Pick a child product"))
      return
    }
    if (!draft.quantity || draft.quantity <= 0) {
      toastActionError(toast, t("خطأ", "Error"), t("الكمية يجب أن تكون أكبر من صفر", "Quantity must be > 0"))
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/products/${productId}/bundle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          child_product_id: draft.child_product_id,
          quantity: draft.quantity,
          is_optional: draft.is_optional,
          auto_deduct_inventory: draft.auto_deduct_inventory,
          price_handling: draft.price_handling,
          display_order: draft.display_order,
          notes: draft.notes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toastActionSuccess(toast, t("تمت إضافة الصنف المرفق", "Bundle item added"))
      setDraft({
        child_product_id: "",
        quantity: 1,
        is_optional: false,
        auto_deduct_inventory: true,
        price_handling: "add_to_total",
        display_order: 0,
        notes: "",
      })
      await loadRows()
    } catch (err: any) {
      toastActionError(toast, t("خطأ في الإضافة", "Add Error"), err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (rowId: string) => {
    if (!window.confirm(t("هل أنت متأكد من حذف هذا الصنف المرفق؟", "Remove this bundle item?"))) return
    try {
      const res = await fetch(`/api/products/${productId}/bundle/${rowId}`, { method: "DELETE" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Failed")
      toastActionSuccess(toast, t("تم الحذف", "Removed"))
      await loadRows()
    } catch (err: any) {
      toastActionError(toast, t("خطأ في الحذف", "Delete Error"), err.message)
    }
  }

  const updateRow = async (rowId: string, patch: Partial<BundleRow>) => {
    try {
      const res = await fetch(`/api/products/${productId}/bundle/${rowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      await loadRows()
    } catch (err: any) {
      toastActionError(toast, t("خطأ في التعديل", "Update Error"), err.message)
    }
  }

  return (
    <div className="space-y-4" dir={isAr ? "rtl" : "ltr"}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="w-4 h-4 text-orange-500" />
            {t("الأصناف المرفقة", "Bundle Items")}
            {parentName && (
              <span className="text-sm text-muted-foreground font-normal">
                — {parentName}
              </span>
            )}
            <Badge variant="secondary" className="ml-auto">
              {rows.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {t(
              "الأصناف التي تُضاف تلقائياً للفاتورة عند بيع هذا المنتج. السعر يأتي من الكتالوج، الكمية = الكمية هنا × كمية المنتج الأم.",
              "Items added to the invoice automatically when this product is sold. Pricing comes from the catalog; final qty = this qty × parent qty."
            )}
          </p>

          {/* Existing rows */}
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("جاري التحميل...", "Loading…")}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t("لا توجد أصناف مرفقة بعد. أضف الصنف الأول أدناه.", "No bundle items yet. Add the first one below.")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-start py-2 px-2">{t("الصنف المرفق", "Child")}</th>
                    <th className="text-center py-2 px-2 w-24">{t("الكمية", "Qty")}</th>
                    <th className="text-center py-2 px-2 w-32">{t("التسعير", "Price Handling")}</th>
                    <th className="text-center py-2 px-2 w-20">{t("اختياري", "Optional")}</th>
                    <th className="text-center py-2 px-2 w-20">{t("خصم مخزون", "Auto Deduct")}</th>
                    <th className="text-center py-2 px-2 w-20">{t("ترتيب", "Order")}</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 px-2">
                        <div className="font-medium">{r.child?.name ?? r.child_product_id}</div>
                        {r.child?.sku && (
                          <div className="text-xs font-mono text-muted-foreground">{r.child.sku}</div>
                        )}
                      </td>
                      <td className="text-center py-2 px-2">
                        <Input
                          type="number"
                          min={0.0001}
                          step={0.0001}
                          defaultValue={r.quantity}
                          onBlur={(e) => {
                            const v = parseFloat(e.target.value)
                            if (v > 0 && v !== r.quantity) updateRow(r.id, { quantity: v })
                          }}
                          className="h-8 text-center tabular-nums"
                        />
                      </td>
                      <td className="text-center py-2 px-2">
                        <Select
                          value={r.price_handling}
                          onValueChange={(v) => updateRow(r.id, { price_handling: v as PriceHandling })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="add_to_total">
                              {t("يُضاف للإجمالي", "Add to total")}
                            </SelectItem>
                            <SelectItem value="included">{t("مشمول", "Included")}</SelectItem>
                            <SelectItem value="free">{t("هدية", "Free")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="text-center py-2 px-2">
                        <Switch
                          checked={r.is_optional}
                          onCheckedChange={(v) => updateRow(r.id, { is_optional: v })}
                        />
                      </td>
                      <td className="text-center py-2 px-2">
                        <Switch
                          checked={r.auto_deduct_inventory}
                          onCheckedChange={(v) => updateRow(r.id, { auto_deduct_inventory: v })}
                        />
                      </td>
                      <td className="text-center py-2 px-2">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          defaultValue={r.display_order}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value, 10)
                            if (!Number.isNaN(v) && v !== r.display_order)
                              updateRow(r.id, { display_order: v })
                          }}
                          className="h-8 w-16 text-center tabular-nums"
                        />
                      </td>
                      <td className="text-center py-2 px-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(r.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add new row */}
          <div className="rounded-lg border-2 border-dashed border-orange-300 bg-orange-50/40 dark:border-orange-800 dark:bg-orange-950/20 p-4 space-y-3">
            <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
              ➕ {t("إضافة صنف مرفق", "Add bundle item")}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="lg:col-span-2">
                <Label className="text-xs">{t("الصنف", "Child Product")} *</Label>
                <Select
                  value={draft.child_product_id}
                  onValueChange={(v) => setDraft((d) => ({ ...d, child_product_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("اختر صنفاً", "Pick a product…")} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProducts.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">
                        {t("لا توجد منتجات متاحة", "No products available")}
                      </div>
                    ) : (
                      availableProducts.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.sku ? `${p.name} — ${p.sku}` : p.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t("الكمية", "Quantity")} *</Label>
                <Input
                  type="number"
                  min={0.0001}
                  step={0.0001}
                  value={draft.quantity}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, quantity: parseFloat(e.target.value) || 0 }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">{t("التسعير", "Price Handling")}</Label>
                <Select
                  value={draft.price_handling}
                  onValueChange={(v) => setDraft((d) => ({ ...d, price_handling: v as PriceHandling }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="add_to_total">{t("يُضاف للإجمالي", "Add to total")}</SelectItem>
                    <SelectItem value="included">{t("مشمول في سعر الأم", "Included")}</SelectItem>
                    <SelectItem value="free">{t("هدية مجانية", "Free gift")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">{t("ترتيب العرض", "Display Order")}</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={draft.display_order}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, display_order: parseInt(e.target.value, 10) || 0 }))
                  }
                />
              </div>
              <div className="flex items-center gap-3 rounded-md border p-2">
                <Switch
                  checked={draft.is_optional}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, is_optional: v }))}
                />
                <Label className="cursor-pointer text-xs">{t("اختياري", "Optional")}</Label>
              </div>
              <div className="flex items-center gap-3 rounded-md border p-2">
                <Switch
                  checked={draft.auto_deduct_inventory}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, auto_deduct_inventory: v }))}
                />
                <Label className="cursor-pointer text-xs">{t("خصم مخزون تلقائي", "Auto-deduct inventory")}</Label>
              </div>
            </div>
            <div>
              <Label className="text-xs">{t("ملاحظات", "Notes")}</Label>
              <Input
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                placeholder={t("ملاحظات داخلية (اختياري)", "Internal notes (optional)")}
              />
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleAdd}
                disabled={submitting || !draft.child_product_id}
                className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {t("إضافة", "Add")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
