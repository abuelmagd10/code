"use client"

/**
 * v3.74.574 — Booking Addons panel.
 *
 * Two sections shown on the booking detail page:
 *   1) الأصناف المرفقة (Bundle items)
 *      * Mandatory rows appear read-only with an "auto-included" badge.
 *      * Optional rows show a checkbox — staff opts in/out.
 *   2) منتجات إضافية للبيع (Walk-in extras)
 *      * Product picker + qty + unit_price + add button.
 *      * Line list with remove button.
 *
 * Panels are locked when booking.status ∈ (completed, cancelled, no_show).
 * All writes go through the v3.74.573 RPCs.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
// v3.74.591 — نفس مكوّن اختيار المنتج المستخدم فى فاتورة البيع (بحث + صور + مخزون)
import { ProductSearchSelect, type ProductOption as SearchProductOption } from "@/components/ProductSearchSelect"
import { Package, Plus, Trash2, Sparkles } from "lucide-react"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"

interface BundleItem {
  id: string
  child_product_id: string
  child_name: string
  child_sku: string
  quantity: number
  is_optional: boolean
  auto_deduct_inventory: boolean
  price_handling: "included" | "added" | "free_gift"
  child_unit_price: number
  selected?: boolean
  quantity_override?: number | null
}

interface ExtraItem {
  id: string
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
}

// v3.74.591 — نستخدم نوع مكوّن البحث نفسه (يشمل الصور والمخزون)
type ProductOption = SearchProductOption

interface Props {
  companyId: string
  bookingId: string
  bookingStatus: string
  serviceId: string
  bookingQty: number
  lang: "ar" | "en"
  // v3.74.577 — governance inputs: who may edit the addons.
  bookingBranchId?: string | null
  staffUserId?: string | null
  assignedStaffUserIds?: string[] | null
  // v3.74.578 — post-execution edit window needs the invoice status.
  invoiceId?: string | null
  onChange?: () => void
}

export function BookingAddons({
  companyId,
  bookingId,
  bookingStatus,
  serviceId,
  bookingQty,
  lang,
  bookingBranchId = null,
  staffUserId = null,
  assignedStaffUserIds = null,
  invoiceId = null,
  onChange,
}: Props) {
  // v3.74.574 — look up the parent product on the service ourselves so
  // the page doesn't need to shove it through v_bookings_full.
  const [parentProductId, setParentProductId] = useState<string | null>(null)
  const supabase = useSupabase()
  const { toast } = useToast()
  const isAr = lang !== "en"
  const t = (ar: string, en: string) => (isAr ? ar : en)

  // v3.74.578 — stage-aware governance mirror of the server rules
  // (assert_booking_addons_permission + assert_booking_editable_for_bundle):
  //   * cancelled / no_show                      → locked for everyone
  //   * completed + invoice NOT draft            → locked for everyone
  //     (changes go through the sales-return cycle)
  //   * completed + invoice draft ("edit window") → owner/admin/GM and the
  //     ASSIGNED staff only (booking_officer's rights end at execution)
  //   * before completion → owner/admin/GM, booking_officer (own branch),
  //     assigned staff
  const executed = bookingStatus === "completed"
  const [invoiceStatus, setInvoiceStatus] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (!executed || !invoiceId) { setInvoiceStatus(null); return }
    ;(async () => {
      const { data } = await supabase
        .from("invoices")
        .select("status")
        .eq("id", invoiceId)
        .maybeSingle()
      if (alive) setInvoiceStatus((data as any)?.status ?? null)
    })()
    return () => { alive = false }
  }, [supabase, executed, invoiceId])

  const draftWindow = executed && invoiceStatus === "draft"
  const locked =
    ["cancelled", "no_show"].includes(bookingStatus) || (executed && !draftWindow)

  const [me, setMe] = useState<{ uid: string; role: string; branch: string | null } | null>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !companyId) return
        const { data: member } = await supabase
          .from("company_members")
          .select("role, branch_id")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .maybeSingle()
        if (alive) setMe({
          uid: user.id,
          role: String((member as any)?.role || ""),
          branch: (member as any)?.branch_id ?? null,
        })
      } catch { /* stay read-only on failure */ }
    })()
    return () => { alive = false }
  }, [supabase, companyId])

  const mayEdit = useMemo(() => {
    if (!me) return false
    if (["owner", "admin", "general_manager"].includes(me.role)) return true
    const isAssigned =
      (!!staffUserId && staffUserId === me.uid) ||
      (assignedStaffUserIds ?? []).includes(me.uid)
    if (executed) return isAssigned // officer's window closes at execution
    if (me.role === "booking_officer" && (!me.branch || !bookingBranchId || me.branch === bookingBranchId)) return true
    return isAssigned
  }, [me, executed, bookingBranchId, staffUserId, assignedStaffUserIds])

  const readOnly = locked || !mayEdit

  const [bundleItems, setBundleItems] = useState<BundleItem[]>([])
  const [extras, setExtras] = useState<ExtraItem[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [loading, setLoading] = useState(false)

  // Walk-in extras form state
  const [pickedProductId, setPickedProductId] = useState<string>("")
  const [extraQty, setExtraQty] = useState<string>("1")
  const [extraPrice, setExtraPrice] = useState<string>("0")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // v3.74.574 — resolve the parent product id from the service.
      let effectiveParentId = parentProductId
      if (!effectiveParentId && serviceId) {
        const { data: svc } = await supabase
          .from("services")
          .select("product_catalog_id")
          .eq("id", serviceId)
          .maybeSingle()
        effectiveParentId = (svc as any)?.product_catalog_id ?? null
        if (effectiveParentId !== parentProductId) setParentProductId(effectiveParentId)
      }

      // Bundle items from product_bundle_items + current selections
      let bundleRows: BundleItem[] = []
      if (effectiveParentId) {
        const { data: rawBundle } = await supabase
          .from("product_bundle_items")
          .select("id, child_product_id, quantity, is_optional, auto_deduct_inventory, price_handling, products:child_product_id(name, sku, unit_price)")
          .eq("company_id", companyId)
          .eq("parent_product_id", effectiveParentId)
          .order("display_order", { ascending: true })

        bundleRows = (rawBundle || []).map((row: any) => ({
          id: row.id,
          child_product_id: row.child_product_id,
          child_name: row.products?.name ?? "",
          child_sku: row.products?.sku ?? "",
          quantity: Number(row.quantity ?? 0) * Number(bookingQty || 1),
          is_optional: !!row.is_optional,
          auto_deduct_inventory: !!row.auto_deduct_inventory,
          price_handling: row.price_handling ?? "included",
          child_unit_price: Number(row.products?.unit_price ?? 0),
          selected: !row.is_optional,
          quantity_override: null,
        }))

        // Overlay actual staff selections
        const { data: selections } = await supabase
          .from("booking_bundle_selections")
          .select("bundle_item_id, quantity_override")
          .eq("company_id", companyId)
          .eq("booking_id", bookingId)
        const selMap = new Map<string, number | null>()
        for (const s of (selections || []) as any[]) {
          selMap.set(s.bundle_item_id, s.quantity_override)
        }
        for (const bi of bundleRows) {
          if (bi.is_optional) bi.selected = selMap.has(bi.id)
          if (selMap.has(bi.id)) bi.quantity_override = selMap.get(bi.id) ?? null
        }
      }
      setBundleItems(bundleRows)

      // Walk-in extras
      const { data: extraRows } = await supabase
        .from("booking_extra_items")
        .select("id, product_id, quantity, unit_price, discount_percent, products:product_id(name)")
        .eq("company_id", companyId)
        .eq("booking_id", bookingId)
        .order("added_at", { ascending: true })
      setExtras(
        (extraRows || []).map((r: any) => ({
          id: r.id,
          product_id: r.product_id,
          product_name: r.products?.name ?? "",
          quantity: Number(r.quantity),
          unit_price: Number(r.unit_price),
          line_total: Number(r.unit_price) * Number(r.quantity) * (1 - Number(r.discount_percent || 0) / 100),
        })),
      )

      // Product catalog for the walk-in picker
      // v3.74.591 — نجلب الصور والمخزون لعرضها فى مكوّن البحث (نمط فاتورة البيع)
      const { data: prods } = await supabase
        .from("products")
        .select("id, name, sku, unit_price, item_type, quantity_on_hand, image_urls")
        .eq("company_id", companyId)
        .in("item_type", ["product", "raw_material", "manufactured"])
        .order("name", { ascending: true })
        .limit(500)
      setProducts(
        (prods || []).map((p: any) => ({
          id: p.id,
          name: p.name,
          sku: p.sku ?? null,
          unit_price: Number(p.unit_price || 0),
          item_type: "product" as const,
          quantity_on_hand: p.quantity_on_hand != null ? Number(p.quantity_on_hand) : undefined,
          image_urls: p.image_urls ?? null,
        })),
      )
    } catch (e: any) {
      console.error("[BookingAddons] load error", e)
    } finally {
      setLoading(false)
    }
  }, [supabase, companyId, bookingId, parentProductId, bookingQty])

  useEffect(() => { load() }, [load])

  const toggleOptional = async (item: BundleItem, checked: boolean) => {
    if (readOnly) return
    try {
      if (checked) {
        const { error } = await supabase.rpc("add_booking_bundle_selection", {
          p_company_id: companyId,
          p_booking_id: bookingId,
          p_bundle_item_id: item.id,
          p_selected_by: (await supabase.auth.getUser()).data.user?.id ?? null,
          p_quantity_override: null,
        })
        if (error) throw error
      } else {
        const { error } = await supabase.rpc("remove_booking_bundle_selection", {
          p_company_id: companyId,
          p_booking_id: bookingId,
          p_bundle_item_id: item.id,
        })
        if (error) throw error
      }
      await load()
      onChange?.()
    } catch (e: any) {
      toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message || e) })
    }
  }

  const pickedProduct = useMemo(
    () => products.find((p) => p.id === pickedProductId) || null,
    [products, pickedProductId],
  )

  useEffect(() => {
    if (pickedProduct && Number(extraPrice) === 0) {
      setExtraPrice(String(pickedProduct.unit_price ?? 0))
    }
  }, [pickedProduct]) // eslint-disable-line react-hooks/exhaustive-deps

  const addExtra = async () => {
    if (readOnly || !pickedProductId) return
    const qty = Number(extraQty)
    const price = Number(extraPrice)
    if (!(qty > 0) || !(price >= 0)) {
      toast({ variant: "destructive", title: t("قيم غير صحيحة", "Invalid values"), description: t("الكمية والسعر مطلوبة", "Quantity and price required") })
      return
    }
    try {
      const { error } = await supabase.rpc("add_booking_extra_item", {
        p_company_id: companyId,
        p_booking_id: bookingId,
        p_product_id: pickedProductId,
        p_quantity: qty,
        p_unit_price: price,
        p_added_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      })
      if (error) throw error
      setPickedProductId("")
      setExtraQty("1")
      setExtraPrice("0")
      await load()
      onChange?.()
    } catch (e: any) {
      toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message || e) })
    }
  }

  const removeExtra = async (extraId: string) => {
    if (readOnly) return
    try {
      const { error } = await supabase.rpc("remove_booking_extra_item", {
        p_company_id: companyId,
        p_booking_id: bookingId,
        p_extra_id: extraId,
      })
      if (error) throw error
      await load()
      onChange?.()
    } catch (e: any) {
      toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message || e) })
    }
  }

  return (
    <div className="space-y-4">
      {/* v3.74.577/578 — read-only notice for unauthorized roles */}
      {!locked && !mayEdit && (
        <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded px-3 py-2">
          {executed
            ? t(
                "عرض فقط — بعد تنفيذ أمر الحجز يقتصر التعديل على الموظف المنفذ والإدارة ما دامت الفاتورة مسودة",
                "View only — after execution, only the assigned staff and management may edit while the invoice is still a draft",
              )
            : t(
                "عرض فقط — تعديل الإضافات متاح للمالك/الإدارة، مسئول الحجز فى فرعه، والموظف المكلف بهذا الحجز",
                "View only — addons can be edited by owner/management, the branch booking officer, and the staff assigned to this booking",
              )}
        </p>
      )}

      {/* v3.74.578 — active post-execution edit window */}
      {draftWindow && mayEdit && (
        <p className="text-xs text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded px-3 py-2">
          {t(
            "أمر الحجز منفَّذ والفاتورة ما زالت مسودة — أى تعديل هنا يُزامن الفاتورة والمخزون تلقائياً ويُخطر المحاسب والإدارة",
            "Booking executed, invoice still draft — edits here auto-sync the invoice and inventory, and notify the accountant and management",
          )}
        </p>
      )}

      {/* v3.74.578 — window closed */}
      {executed && !draftWindow && (
        <p className="text-xs text-muted-foreground bg-gray-50 dark:bg-gray-900/40 border rounded px-3 py-2">
          {t(
            "الفاتورة معتمدة — أى تعديل بعد الاعتماد يتم عبر مرتجع المبيعات",
            "Invoice posted — any further change goes through the sales-return cycle",
          )}
        </p>
      )}

      {/* ── Section 1: Walk-in extras ──
          v3.74.594 — نُقل هذا القسم أعلى الأصناف المرفقة (قرار المالك):
          القائمة المنسدلة تحتاج مساحة أسفلها لتنفرد، وكان القسم آخر
          الصفحة فتُحشر القائمة فى المساحة الضيقة المتبقية. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="w-4 h-4 text-emerald-500" />
            {t("منتجات إضافية للبيع", "Walk-in Extras")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!readOnly && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground">{t("المنتج", "Product")}</label>
                {/* v3.74.591 — نفس تجربة اختيار المنتج فى فاتورة البيع */}
                <ProductSearchSelect
                  products={products}
                  value={pickedProductId}
                  onValueChange={setPickedProductId}
                  lang={lang}
                  productsOnly
                  showPrice
                  showStock
                  currency={typeof window !== "undefined" ? (localStorage.getItem("app_currency") || "EGP") : "EGP"}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("الكمية", "Qty")}</label>
                <Input type="number" min={0} step={1} value={extraQty} onChange={(e) => setExtraQty(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">{t("السعر", "Unit Price")}</label>
                  <Input type="number" min={0} step="0.01" value={extraPrice} onChange={(e) => setExtraPrice(e.target.value)} />
                </div>
                <Button onClick={addExtra} disabled={!pickedProductId} className="mb-0 self-end">
                  <Plus className="w-4 h-4" /> {t("إضافة", "Add")}
                </Button>
              </div>
            </div>
          )}

          {extras.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("لا توجد منتجات إضافية", "No extras added")}
            </p>
          ) : (
            <ul className="space-y-2">
              {extras.map((ex) => (
                <li key={ex.id} className="flex items-center gap-3 border-b last:border-0 py-2">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{ex.product_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {ex.quantity} × {ex.unit_price.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-sm tabular-nums font-medium">
                    {ex.line_total.toFixed(2)}
                  </div>
                  {!readOnly && (
                    <Button variant="ghost" size="sm" onClick={() => removeExtra(ex.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ── Section 2: Bundle items ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            {t("الأصناف المرفقة بالخدمة", "Attached Bundle Items")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("جارٍ التحميل...", "Loading...")}</p>
          ) : bundleItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("لا توجد أصناف مرفقة لهذه الخدمة", "No bundle items configured for this service")}
            </p>
          ) : (
            <ul className="space-y-2">
              {bundleItems.map((bi) => (
                <li key={bi.id} className="flex items-center gap-3 border-b last:border-0 py-2">
                  {bi.is_optional ? (
                    <Checkbox
                      checked={bi.selected}
                      disabled={readOnly}
                      onCheckedChange={(v) => toggleOptional(bi, !!v)}
                    />
                  ) : (
                    <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded">
                      {t("إلزامى", "Required")}
                    </span>
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-medium">{bi.child_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{bi.child_sku}</div>
                  </div>
                  <div className="text-sm tabular-nums text-muted-foreground">
                    × {bi.quantity}
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">
                    {bi.price_handling === "included" ? t("مشمول", "Included")
                      : bi.price_handling === "free_gift" ? t("هدية", "Gift")
                      : t(`+ ${bi.child_unit_price.toFixed(2)}`, `+ ${bi.child_unit_price.toFixed(2)}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
