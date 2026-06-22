"use client"

/**
 * v3.74.269 — Raw-material warehouse picker for the BOM form.
 *
 * Replaces the generic WarehouseSelector when the user needs to choose
 * "the warehouse production orders will pull raw materials from".
 *
 * Why a dedicated component:
 *   - Each option shows how much raw-material stock the warehouse
 *     actually holds, so the owner can tell at a glance whether the
 *     warehouse is a raw-material warehouse or a finished-goods one.
 *   - After picking, an inline confirmation strip shows ✓ (has stock)
 *     or ⚠️ (empty of raw materials) so the user catches a wrong pick
 *     before saving the BOM.
 *
 * Reads /api/manufacturing/warehouses-with-stock-summary which returns
 * per-warehouse { raw_item_count, raw_total_qty }. Server-side logic
 * lives there; this is presentation only.
 */

import { useEffect, useMemo, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react"

export interface WarehouseStockOption {
  id: string
  name: string
  code: string
  is_main: boolean
  branch_id: string
  raw_item_count: number
  raw_total_qty: number
}

interface Props {
  value: string
  onChange: (warehouseId: string) => void
  branchId: string | null
  disabled?: boolean
  lang?: "ar" | "en"
}

export function RawMaterialWarehousePicker({ value, onChange, branchId, disabled, lang = "ar" }: Props) {
  const [items, setItems] = useState<WarehouseStockOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!branchId) {
      setItems([])
      return
    }
    let cancelled = false
    const run = async () => {
      try {
        setLoading(true)
        const r = await fetch(`/api/manufacturing/warehouses-with-stock-summary?branch_id=${encodeURIComponent(branchId)}`)
        const j = await r.json()
        if (cancelled) return
        setItems(Array.isArray(j?.data) ? j.data : [])
      } catch {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [branchId])

  const selected = useMemo(() => items.find((w) => w.id === value) || null, [items, value])

  const fmtQty = (n: number) => {
    if (!Number.isFinite(n) || n === 0) return "0"
    return new Intl.NumberFormat(lang === "en" ? "en-US" : "en-US", {
      maximumFractionDigits: 1,
    }).format(n)
  }

  return (
    <div className="space-y-2">
      <Select value={value || ""} onValueChange={onChange} disabled={disabled || loading}>
        <SelectTrigger className="w-full">
          <SelectValue
            placeholder={
              loading
                ? (lang === "en" ? "Loading warehouses..." : "جارٍ تحميل المخازن...")
                : !branchId
                  ? (lang === "en" ? "Pick a branch first" : "اختر الفرع أولاً")
                  : items.length === 0
                    ? (lang === "en" ? "No warehouses available" : "لا توجد مخازن متاحة")
                    : (lang === "en" ? "Pick the issue warehouse..." : "اختر مخزن صرف الخامات...")
            }
          />
        </SelectTrigger>
        <SelectContent>
          {loading && (
            <div className="px-2 py-3 text-sm text-muted-foreground text-center">
              <Loader2 className="inline w-3 h-3 animate-spin ml-1" />
              {lang === "en" ? "Loading..." : "جارٍ التحميل..."}
            </div>
          )}
          {!loading && items.length === 0 && branchId && (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              {lang === "en" ? "No active warehouses in this branch" : "ما فيش مخازن نشطة فى الفرع ده"}
            </div>
          )}
          {items.map((w) => {
            const hasRaw = w.raw_item_count > 0
            return (
              <SelectItem key={w.id} value={w.id}>
                <div className="flex items-center gap-2 w-full">
                  <span className={hasRaw ? "text-emerald-600" : "text-amber-500"}>
                    {hasRaw ? "✓" : "○"}
                  </span>
                  <span className="font-medium">{w.name}</span>
                  {w.is_main && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      {lang === "en" ? "main" : "رئيسى"}
                    </span>
                  )}
                  <span className="ms-auto text-xs text-slate-500">
                    {hasRaw
                      ? (lang === "en"
                          ? `${w.raw_item_count} raw items · ${fmtQty(w.raw_total_qty)} units`
                          : `${w.raw_item_count} صنف خامات · ${fmtQty(w.raw_total_qty)} وحدة`)
                      : (lang === "en" ? "no raw materials yet" : "ما فيش خامات لسه")}
                  </span>
                </div>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>

      {/* Inline confirmation strip — shows after the user picks */}
      {selected && (
        <div
          className={
            selected.raw_item_count > 0
              ? "flex items-start gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/40 text-sm"
              : "flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 text-sm"
          }
        >
          {selected.raw_item_count > 0 ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          )}
          <div className="leading-relaxed">
            {selected.raw_item_count > 0 ? (
              <span className="text-emerald-900 dark:text-emerald-200">
                {lang === "en"
                  ? `"${selected.name}" currently holds ${selected.raw_item_count} raw-material item(s) totalling ${fmtQty(selected.raw_total_qty)} units. Good pick.`
                  : `مخزن "${selected.name}" دلوقتى فيه ${selected.raw_item_count} صنف من الخامات بإجمالى ${fmtQty(selected.raw_total_qty)} وحدة. اختيار سليم.`}
              </span>
            ) : (
              <span className="text-amber-900 dark:text-amber-200">
                {lang === "en"
                  ? `"${selected.name}" doesn't hold any raw materials right now. You can still pick it, but you'll need to transfer raw materials into it before the production order can issue them.`
                  : `مخزن "${selected.name}" ما فيهوش أى مواد خام دلوقتى. تقدر تختاره، لكن هتحتاج تنقل خامات إليه قبل ما أمر الإنتاج يقدر يصرف منه.`}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
