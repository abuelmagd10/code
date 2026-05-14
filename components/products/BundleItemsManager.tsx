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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { cn } from "@/lib/utils"
import {
  Plus, Trash2, Package, Loader2,
  HelpCircle, Info, Eye, Link2,
  PlusCircle, Gift,
} from "lucide-react"

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

  // derived for preview
  const selectedChild = products.find((p) => p.id === draft.child_product_id)
  const previewChildPrice = selectedChild?.unit_price ?? 0
  const previewLinePrice = previewChildPrice * (draft.quantity || 1)

  return (
    <div className="space-y-4" dir={isAr ? "rtl" : "ltr"}>

      {/* ── Info Banner ── */}
      <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="space-y-2 text-sm">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                {t("ما هي الأصناف المرفقة (Bundle Items)؟", "What are Bundle Items?")}
              </h4>
              <p className="text-blue-800 dark:text-blue-200">
                {t(
                  "الأصناف المرفقة هي منتجات/خدمات تُضاف تلقائياً عند بيع هذا المنتج. مثلاً: عند بيع \"تقشير وجه\"، يمكن إضافة \"كريم بعد التقشير\" تلقائياً للفاتورة.",
                  "Bundle items are products/services added automatically when this product is sold. E.g. selling a facial also adds the aftercare cream to the invoice."
                )}
              </p>
              <ul className="list-disc list-inside text-blue-700 dark:text-blue-300 space-y-1">
                <li>{t("الأصناف الإلزامية: تُضاف دائماً (لا يمكن إزالتها)", "Required items: always added (cannot be removed)")}</li>
                <li>{t("الأصناف الاختيارية: يقرر الموظف إن يضيفها أم لا", "Optional items: staff decides at point of sale")}</li>
                <li>{t("التسعير: يُضاف للإجمالي، مشمول في سعر الأم، أو هدية مجانية", "Pricing: add to total, included in parent price, or free gift")}</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

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

          {/* ── Add new row ── */}
          <div className="rounded-lg border-2 border-dashed border-orange-300 bg-orange-50/40 dark:border-orange-800 dark:bg-orange-950/20 p-4 space-y-5">
            <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
              ➕ {t("إضافة صنف مرفق", "Add bundle item")}
            </p>

            {/* Child product + display order */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
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
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                {t("الكمية لكل وحدة من المنتج الأم", "Quantity per parent unit")} *
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs" side="top">
                      <p>{t("كم وحدة من هذا الصنف تُضاف لكل وحدة من المنتج الأم؟", "How many units of this item are added per parent unit?")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(
                          "مثال: لو الكمية = 2، عند بيع 3 وحدات من \"تقشير\"، يُضاف 6 وحدات من \"كريم\"",
                          "E.g. qty = 2 means selling 3 facials adds 6 creams."
                        )}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Input
                type="number"
                min={0.01}
                step={0.01}
                value={draft.quantity}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, quantity: parseFloat(e.target.value) || 0 }))
                }
                className="max-w-[160px]"
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "💡 الكمية النهائية = (الكمية هنا) × (كمية المنتج الأم في الفاتورة)",
                  "💡 Final qty = (this qty) × (parent qty in invoice)"
                )}
              </p>
            </div>

            {/* is_optional */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                {t("هل هذا الصنف اختياري؟", "Is this item optional?")}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs" side="top">
                      <p className="font-semibold mb-1">{t("ماذا يعني هذا؟", "What does this mean?")}</p>
                      <p>• <strong>{t("إلزامي (OFF):", "Required (OFF):")}</strong> {t("الصنف يُضاف تلقائياً ولا يمكن حذفه من الفاتورة", "Always added, cannot be removed from the invoice")}</p>
                      <p>• <strong>{t("اختياري (ON):", "Optional (ON):")}</strong> {t("الصنف يظهر للموظف ليقرر إضافته أم لا", "Staff can choose whether to include it")}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <Switch
                  checked={draft.is_optional}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, is_optional: v }))}
                />
                <div className="flex-1">
                  {draft.is_optional ? (
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950/30 dark:text-green-300 dark:border-green-800">
                        🟢 {t("اختياري", "Optional")}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {t("الموظف يقرر إضافته للفاتورة حسب رغبة العميل", "Staff decides at point of sale")}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800">
                        🔒 {t("إلزامي", "Required")}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {t("يُضاف تلقائياً ولا يمكن إزالته من الفاتورة", "Always added, cannot be removed from invoice")}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* price_handling */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                {t("كيف يُحتسب السعر؟", "How is the price handled?")}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {t("اختر كيف يظهر سعر هذا الصنف في الفاتورة", "Choose how this item's price appears in the invoice")}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <RadioGroup
                value={draft.price_handling}
                onValueChange={(v) => setDraft((d) => ({ ...d, price_handling: v as PriceHandling }))}
                className="grid grid-cols-1 gap-3"
              >
                {/* add_to_total */}
                <Label
                  htmlFor="draft_add_to_total"
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                    draft.price_handling === "add_to_total"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <RadioGroupItem value="add_to_total" id="draft_add_to_total" className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 font-medium text-sm">
                      <PlusCircle className="w-4 h-4 text-blue-600" />
                      {t("يُضاف للإجمالي", "Add to total")}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("السعر يُحسب كاملاً ويُضاف لإجمالي الفاتورة (السلوك الطبيعي)", "Full price is added to the invoice total (default behaviour)")}
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      {t("مثال: خدمة 500 + كريم 50 = إجمالي 550 ج.م", "Example: service 500 + cream 50 = total 550")}
                    </p>
                  </div>
                </Label>

                {/* included */}
                <Label
                  htmlFor="draft_included"
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                    draft.price_handling === "included"
                      ? "border-green-500 bg-green-50 dark:bg-green-950/30"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <RadioGroupItem value="included" id="draft_included" className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 font-medium text-sm">
                      <Package className="w-4 h-4 text-green-600" />
                      {t("مشمول في سعر الأم", "Included in parent price")}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("السعر يُحسب صفر — مدفوع مسبقاً ضمن سعر المنتج الأصلي", "Price = 0 — already covered in parent price")}
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300">
                      {t("مثال: خدمة 500 (شامل الكريم) = إجمالي 500 ج.م فقط", "Example: service 500 (cream included) = total 500")}
                    </p>
                    <p className="text-xs text-orange-600 mt-1">
                      {t("⚠️ المخزون يُخصم وتكلفة البضاعة المباعة تُسجَّل", "⚠️ Inventory is deducted and COGS is posted")}
                    </p>
                  </div>
                </Label>

                {/* free */}
                <Label
                  htmlFor="draft_free"
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                    draft.price_handling === "free"
                      ? "border-pink-500 bg-pink-50 dark:bg-pink-950/30"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <RadioGroupItem value="free" id="draft_free" className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 font-medium text-sm">
                      <Gift className="w-4 h-4 text-pink-600" />
                      {t("هدية مجانية", "Free gift")}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("السعر صفر — هدية ترويجية للعميل", "Price = 0 — promotional gift for the client")}
                    </p>
                    <p className="text-xs text-pink-700 dark:text-pink-300">
                      {t("مثال: خدمة 500 + ماسك (هدية) = إجمالي 500 ج.م", "Example: service 500 + mask (gift) = total 500")}
                    </p>
                    <p className="text-xs text-orange-600 mt-1">
                      {t("⚠️ المخزون يُخصم والتكلفة تُسجَّل (تأثير سلبي على هامش الربح)", "⚠️ Inventory & COGS posted (negative margin impact)")}
                    </p>
                  </div>
                </Label>
              </RadioGroup>
            </div>

            {/* auto_deduct_inventory */}
            <div className="space-y-2 opacity-75">
              <Label className="flex items-center gap-2 text-sm">
                {t("خصم المخزون تلقائياً", "Auto-deduct inventory")}
                <Badge variant="outline" className="text-xs">{t("قريباً", "Coming soon")}</Badge>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs" side="top">
                      <p>{t("هذه الميزة قيد التطوير", "This feature is under development")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t(
                          "حالياً: خصم المخزون يتبع إعداد \"تتبع المخزون\" في الصنف الأصلي",
                          "Currently: follows each item's track_inventory flag"
                        )}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Switch
                disabled
                checked={true}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "ℹ️ يتبع حالياً إعداد products.track_inventory للصنف المرفق",
                  "ℹ️ Currently follows products.track_inventory of the child item"
                )}
              </p>
            </div>

            {/* Notes */}
            <div>
              <Label className="text-xs">{t("ملاحظات", "Notes")}</Label>
              <Input
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                placeholder={t("ملاحظات داخلية (اختياري)", "Internal notes (optional)")}
              />
            </div>

            {/* Preview */}
            <Card className="bg-muted/30 border-dashed">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  {t("معاينة: كيف سيظهر في الفاتورة", "Preview: how it appears in the invoice")}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                <div className="flex items-center justify-between p-3 rounded bg-background text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{parentName ?? t("[المنتج الأم]", "[Parent product]")}</span>
                    <span className="text-muted-foreground">× 1</span>
                  </div>
                  <span>—</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded bg-blue-50 dark:bg-blue-950/30 ps-8 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link2 className="w-3 h-3 text-blue-500 shrink-0" />
                    <span>{selectedChild?.name ?? t("[الصنف المرفق]", "[Bundle item]")}</span>
                    <span className="text-muted-foreground">× {draft.quantity || 1}</span>
                    {draft.is_optional && (
                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300">
                        {t("اختياري", "Optional")}
                      </Badge>
                    )}
                  </div>
                  <span className={cn(
                    draft.price_handling !== "add_to_total" && "line-through text-muted-foreground italic"
                  )}>
                    {draft.price_handling === "add_to_total"
                      ? previewLinePrice > 0
                        ? `${previewLinePrice.toFixed(2)} ${t("ج.م", "")}`
                        : "—"
                      : draft.price_handling === "included"
                        ? t("(مشمول)", "(Included)")
                        : t("(هدية)", "(Free)")
                    }
                  </span>
                </div>
              </CardContent>
            </Card>

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
