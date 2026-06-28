"use client"

/**
 * ServiceProductsEditor — v3.74.386 (Stage B of 2).
 *
 * Manages the consumable-product BOM for a service. Renders below the
 * main ServiceForm on /services/[id]/edit. Owner-confirmed flow:
 *
 *   - Owner adds one or more products with quantity-per-execution
 *   - Save button writes the whole BOM (POST replaces the set)
 *   - At booking execution time, Stage C reads this BOM, validates
 *     stock in the booking branch warehouse, and deducts on success
 *
 * Products that aren't tracked in inventory (track_inventory=false)
 * are still allowed in the BOM but a small warning explains they
 * won't gate execution at stage C.
 */

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import {
  Package, Plus, Trash2, Save, Loader2, AlertTriangle, Info,
} from "lucide-react"

interface Props {
  serviceId: string
  lang?: string
}

interface ProductOption {
  id: string
  name: string
  product_type: string | null
  track_inventory: boolean
}

interface BomRow {
  // Local row id (for React keys + remove)
  rowId: string
  // Empty string when the row is fresh and no product picked yet
  product_id: string
  quantity_per_service: string  // string so the input stays controllable
  // Resolved on save / load — denormalized for display only
  product_name?: string | null
  track_inventory?: boolean
  notes?: string | null
}

function makeRowId(): string {
  return `r_${Math.random().toString(36).slice(2)}_${Date.now()}`
}

export function ServiceProductsEditor({ serviceId, lang = "ar" }: Props) {
  const isAr = lang !== "en"
  const t = (ar: string, en: string) => (isAr ? ar : en)
  const { toast } = useToast()

  const [products, setProducts]     = useState<ProductOption[]>([])
  const [rows, setRows]             = useState<BomRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const cid = document.cookie.split(";").find(c => c.trim().startsWith("active_company_id="))?.split("=")[1] || ""
      const [pRes, sRes] = await Promise.all([
        // Products list — paginated but we ask for a generous slice
        fetch(`/api/products?limit=500&company_id=${encodeURIComponent(cid)}`, { cache: "no-store" }),
        fetch(`/api/services/${serviceId}/products`, { cache: "no-store" }),
      ])

      const pJson = await pRes.json().catch(() => ({}))
      const productsList: ProductOption[] = Array.isArray(pJson?.products)
        ? pJson.products.map((p: any) => ({
            id: p.id,
            name: p.name,
            product_type: p.product_type ?? null,
            track_inventory: !!p.track_inventory,
          }))
        : Array.isArray(pJson?.data)
          ? pJson.data.map((p: any) => ({
              id: p.id,
              name: p.name,
              product_type: p.product_type ?? null,
              track_inventory: !!p.track_inventory,
            }))
          : []
      setProducts(productsList)

      if (!sRes.ok) {
        const j = await sRes.json().catch(() => ({}))
        throw new Error(j?.error || `Failed to load BOM (${sRes.status})`)
      }
      const sJson = await sRes.json()
      const initialRows: BomRow[] = (sJson?.items || []).map((it: any) => ({
        rowId: makeRowId(),
        product_id: it.product_id,
        quantity_per_service: String(it.quantity_per_service),
        product_name: it.product_name,
        track_inventory: !!it.track_inventory,
        notes: it.notes,
      }))
      setRows(initialRows)
    } catch (e: any) {
      setError(e?.message || t("تعذر تحميل قائمة المنتجات", "Failed to load product list"))
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId])

  useEffect(() => { load() }, [load])

  const addRow = () => {
    setRows((prev) => [...prev, {
      rowId: makeRowId(),
      product_id: "",
      quantity_per_service: "1",
    }])
  }

  const removeRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId))
  }

  const updateRow = (rowId: string, patch: Partial<BomRow>) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))
  }

  const onPickProduct = (rowId: string, productId: string) => {
    const p = products.find((x) => x.id === productId)
    updateRow(rowId, {
      product_id: productId,
      product_name: p?.name,
      track_inventory: !!p?.track_inventory,
    })
  }

  const save = async () => {
    // Validate
    for (const r of rows) {
      if (!r.product_id) {
        toastActionError(toast, t("نقص بيانات", "Missing data"), t("اختر منتج لكل سطر قبل الحفظ", "Pick a product for every row before saving"))
        return
      }
      const q = Number(r.quantity_per_service)
      if (!Number.isFinite(q) || q <= 0) {
        toastActionError(toast, t("كمية غير صحيحة", "Invalid quantity"), t("الكمية لكل تنفيذ يجب أن تكون أكبر من صفر", "Quantity per execution must be greater than zero"))
        return
      }
    }
    // Reject duplicate product picks before hitting the server.
    const seen = new Set<string>()
    for (const r of rows) {
      if (seen.has(r.product_id)) {
        toastActionError(toast, t("منتج مكرر", "Duplicate product"), t("كل منتج يضاف مرة واحدة فقط", "Each product can be added once only"))
        return
      }
      seen.add(r.product_id)
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/services/${serviceId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: rows.map((r) => ({
            product_id: r.product_id,
            quantity_per_service: Number(r.quantity_per_service),
            notes: r.notes || null,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Save failed")
      toastActionSuccess(
        toast,
        t("تم الحفظ", "Saved"),
        t(`تم حفظ ${json.count} منتج للخدمة`, `Saved ${json.count} products for the service`),
      )
      // Re-load to refresh the displayed names (and confirm server state)
      await load()
    } catch (e: any) {
      toastActionError(toast, t("خطأ فى الحفظ", "Save Error"), e?.message || "")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="w-4 h-4 text-blue-500" />
          {t("المنتجات المستهلكة فى الخدمة", "Consumable products for this service")}
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          {t(
            "اربط المنتجات اللى تستهلك عند تنفيذ الخدمة. الكمية المحددة هنا تتم خصمها من مخزون فرع الفاتورة عند تنفيذ كل حجز.",
            "Link the products consumed when the service is performed. The quantity here will be deducted from the invoice branch warehouse on each booking execution.",
          )}
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-8 text-center text-sm text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            {t("جارى تحميل المنتجات…", "Loading products…")}
          </div>
        ) : error ? (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-md text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        ) : (
          <>
            {rows.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-500 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-lg">
                {t("لا توجد منتجات مرتبطة بالخدمة دلوقتى.", "No products linked to this service yet.")}
              </div>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => (
                  <div key={row.rowId} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-7">
                      <Select
                        value={row.product_id || undefined}
                        onValueChange={(v) => onPickProduct(row.rowId, v)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("اختر منتج…", "Pick a product…")} />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              <span className="flex items-center gap-2">
                                <span>{p.name}</span>
                                {!p.track_inventory && (
                                  <span className="text-[10px] text-amber-600">
                                    ({t("بدون مخزون", "no inventory")})
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {row.product_id && row.track_inventory === false && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                          <Info className="w-3 h-3" />
                          {t(
                            "المنتج ده مش متتبع فى المخزون — لن يمنع التنفيذ عند نقص الكمية.",
                            "This product isn't tracked in inventory — it won't block execution if stock runs short.",
                          )}
                        </p>
                      )}
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        min={0}
                        step="0.0001"
                        value={row.quantity_per_service}
                        onChange={(e) => updateRow(row.rowId, { quantity_per_service: e.target.value })}
                        placeholder={t("الكمية لكل تنفيذ", "Qty per execution")}
                      />
                    </div>
                    <div className="col-span-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-300 hover:bg-red-50 w-full"
                        onClick={() => removeRow(row.rowId)}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        {t("حذف", "Remove")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={addRow} className="gap-1">
                <Plus className="w-4 h-4" />
                {t("إضافة منتج", "Add product")}
              </Button>
              <Button onClick={save} disabled={saving} className="gap-1 bg-blue-600 hover:bg-blue-700 text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t("حفظ قائمة المنتجات", "Save product list")}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
