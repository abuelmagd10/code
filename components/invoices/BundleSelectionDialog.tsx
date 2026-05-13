"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Lock, Package } from "lucide-react"
import type { ExpandedBundleRow } from "@/lib/products/bundle-helpers"

interface BundleSelectionDialogProps {
  open: boolean
  parentName: string
  rows: ExpandedBundleRow[]
  onCancel: () => void
  onConfirm: (selectedRows: ExpandedBundleRow[]) => void
  lang?: string
}

const PRICE_HANDLING_LABELS = {
  add_to_total: { ar: "يُضاف للإجمالي", en: "Add to total" },
  included:     { ar: "مشمول",          en: "Included" },
  free:         { ar: "هدية",           en: "Free" },
} as const

export function BundleSelectionDialog({
  open,
  parentName,
  rows,
  onCancel,
  onConfirm,
  lang = "ar",
}: BundleSelectionDialogProps) {
  const isAr = lang !== "en"
  const t = (ar: string, en: string) => (isAr ? ar : en)

  // Mandatory rows are always selected; optional default to NOT selected.
  // Track selection only for optional rows; mandatory are forced included.
  const [selectedOptional, setSelectedOptional] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (open) setSelectedOptional(new Set()) // reset every time the dialog opens
  }, [open])

  const mandatoryRows = rows.filter((r) => !r.is_optional)
  const optionalRows  = rows.filter((r) =>  r.is_optional)
  const totalSelected = mandatoryRows.length + selectedOptional.size

  const fmt = (n: number) =>
    Number(n || 0).toLocaleString(isAr ? "ar-EG" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const handleConfirm = () => {
    const picked: ExpandedBundleRow[] = [
      ...mandatoryRows,
      ...optionalRows.filter((r) => selectedOptional.has(r.child_product_id)),
    ]
    onConfirm(picked)
  }

  const renderRow = (r: ExpandedBundleRow, isMandatory: boolean) => {
    const checked = isMandatory || selectedOptional.has(r.child_product_id)
    const lineTotal = r.effective_unit_price * r.quantity
    const handlingLabel = PRICE_HANDLING_LABELS[r.price_handling]
    const isFreeOrIncluded = r.price_handling !== "add_to_total"

    return (
      <div
        key={r.child_product_id}
        className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${
          checked
            ? "border-orange-300 bg-orange-50/40 dark:border-orange-800 dark:bg-orange-950/20"
            : "border-border"
        }`}
      >
        <Checkbox
          checked={checked}
          disabled={isMandatory}
          onCheckedChange={(v) => {
            if (isMandatory) return
            setSelectedOptional((prev) => {
              const next = new Set(prev)
              if (v) next.add(r.child_product_id)
              else next.delete(r.child_product_id)
              return next
            })
          }}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{r.name}</span>
            {r.sku && (
              <span className="font-mono text-[10px] text-muted-foreground">{r.sku}</span>
            )}
            {isMandatory && (
              <Badge variant="secondary" className="text-[10px] gap-1">
                <Lock className="w-2.5 h-2.5" />
                {t("إلزامي", "Required")}
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            {Number(r.quantity)} × {fmt(r.unit_price)} ={" "}
            {isFreeOrIncluded ? (
              <span className="line-through opacity-60">{fmt(r.unit_price * r.quantity)}</span>
            ) : (
              <span className="font-semibold text-green-700 dark:text-green-400">{fmt(lineTotal)}</span>
            )}
            {isFreeOrIncluded && (
              <span className="ml-2 text-orange-600 dark:text-orange-400">
                ({isAr ? handlingLabel.ar : handlingLabel.en})
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <DialogContent className="max-w-xl" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-500" />
            {t("الأصناف المرفقة لـ", "Bundle items for")} "{parentName}"
          </DialogTitle>
          <DialogDescription>
            {t(
              "اختر الأصناف الاختيارية التي تريد إضافتها للفاتورة. الإلزامية تُضاف تلقائياً.",
              "Pick optional add-ons. Required items are added automatically."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          {mandatoryRows.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t("الإلزامية (لا يمكن إلغاؤها):", "Required (cannot be unchecked):")}
              </p>
              {mandatoryRows.map((r) => renderRow(r, true))}
            </div>
          )}

          {optionalRows.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t("الاختيارية:", "Optional:")}
              </p>
              {optionalRows.map((r) => renderRow(r, false))}
            </div>
          )}
        </div>

        <div className="text-[11px] text-muted-foreground border-t pt-2 leading-relaxed">
          {t("ⓘ التسعير:", "ⓘ Pricing:")}
          <br />
          • <b>{t("يُضاف للإجمالي", "Add to total")}</b> — {t("سعر السطر يدخل المجموع", "line price contributes to invoice total")}
          <br />
          • <b>{t("مشمول", "Included")}</b> — {t("سعر = 0 (مشمول في سعر الأم)", "price = 0 (already in parent price)")}
          <br />
          • <b>{t("هدية", "Free")}</b> — {t("سعر = 0 لكن المخزون والـ COGS يُسجَّلان", "price = 0 but inventory and COGS are still posted")}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>
            {t("إلغاء", "Cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {t(`تأكيد الإضافة (${totalSelected})`, `Add ${totalSelected} item${totalSelected === 1 ? "" : "s"}`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
