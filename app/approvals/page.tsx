"use client"

import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ERPPageHeader } from "@/components/erp-page-header"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import {
  CheckCircle2, XCircle, Clock, Layers, GitMerge,
  RefreshCw, AlertCircle, ChevronDown, ChevronUp, Factory, Package,
  Percent,
} from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import Link from "next/link"

// ── Types ──────────────────────────────────────────────────

interface PendingBomVersion {
  id: string; version_no: number; status: string; submitted_at: string
  bom_code: string; product_name: string; branch_name: string
  submitted_by_email: string
  type: "bom_version"
}

interface PendingRoutingVersion {
  id: string; version_no: number; approval_status: string; submitted_at: string
  routing_code: string; routing_name: string; branch_name: string
  submitted_by_email: string
  type: "routing_version"
}

interface PendingProductionOrder {
  id: string; order_no: string; approval_status: string; submitted_at: string
  product_name: string; branch_name: string; planned_quantity: number
  type: "production_order"
}

interface PendingMaterialIssue {
  id: string; status: string; requested_at: string
  order_no: string; product_name: string; branch_name: string
  warehouse_name: string
  type: "material_issue"
}

// v3.74.373 — discount approvals (Stage 2 of 5). Shape mirrors what
// GET /api/discount-approvals returns: snapshot fields on the
// approval row plus the requester's email when available.
interface PendingDiscountApproval {
  id: string
  // v3.74.422 — purchase_order + sales_order added (introduced by
  // v3.74.401/404 triggers and the v3.74.417 enum). Without them in this
  // union the UI fell back to the booking label / /bookings/<id> route.
  // v3.74.426 — supplier_payment added (introduced by v3.74.426 workflow).
  // v3.74.427 — purchase_return added. v3.74.430 — sales_return added.
  document_type: "sales_invoice" | "purchase_invoice" | "booking" | "purchase_order" | "sales_order" | "supplier_payment" | "purchase_return" | "sales_return"
  document_id: string
  document_no: string | null
  discount_value: number
  discount_type: "percent" | "amount"
  document_total: number | null
  party_name: string | null
  reason: string | null
  status: string
  requested_by: string
  requested_at: string
  requested_by_email: string | null
  type: "discount_approval"
  // v3.74.461 — amendment tracking
  supersedes_approval_id?: string | null
  items_snapshot?: Array<{
    product_id: string | null
    product_name: string | null
    quantity: number | null
    unit_price: number | null
    discount_percent: number | null
    tax_amount: number | null
    total: number | null
  }> | null
  shipping_snapshot?: number | null
  adjustment_snapshot?: number | null
  tax_amount_snapshot?: number | null
  subtotal_snapshot?: number | null
  // v3.74.467+ — extra fields so DiffCard can surface every possible edit
  shipping_tax_rate_snapshot?: number | null
  discount_position_snapshot?: string | null
  tax_inclusive_snapshot?: boolean | null
  supplier_name_snapshot?: string | null
  prior_approval?: {
    id: string
    discount_value: number | null
    discount_type: "percent" | "amount" | null
    document_total: number | null
    items_snapshot: any[] | null
    shipping_snapshot: number | null
    adjustment_snapshot: number | null
    tax_amount_snapshot: number | null
    subtotal_snapshot: number | null
    shipping_tax_rate_snapshot?: number | null
    discount_position_snapshot?: string | null
    tax_inclusive_snapshot?: boolean | null
    supplier_name_snapshot?: string | null
    decided_at: string | null
    status: string | null
  } | null
}

// v3.74.434 — historical discount approval (kept for reference; the
// unified history feed in v3.74.435 uses UnifiedHistoryEntry instead).

type PendingItem =
  | PendingBomVersion
  | PendingRoutingVersion
  | PendingProductionOrder
  | PendingMaterialIssue
  | PendingDiscountApproval

// ── Card components (module-level for stable React identity) ──
//
// v3.74.432 — DiscountApprovalCard used to live inside ApprovalsContent.
// Because the inner function was re-created on every parent render, React
// saw a NEW component type on each keystroke in the reject textarea, so
// it unmounted/remounted the entire card subtree → the textarea lost
// focus after each character. Hoisting the card to module level gives it
// a stable identity; React reconciler now preserves the subtree.

type CardCtx = {
  appLang: "ar" | "en"
  t: (ar: string, en: string) => string
  fmtMoney: (n: number) => string
  fmtDate: (s: string) => string
  docTypeLabel: (d: PendingDiscountApproval["document_type"]) => string
  docHref: (d: PendingDiscountApproval) => string
  rejectId: string | null
  rejectReason: string
  setRejectReason: (s: string) => void
  setRejectId: (id: string | null) => void
  setRejectType: (t: any) => void
  runningId: string | null
  handleApprove: (d: PendingDiscountApproval) => void
  handleReject: () => void
}

// v3.74.461 — Renders a side-by-side "before / after" comparison
// when an approval supersedes an earlier one. Highlights every field
// the accountant changed since the last owner-approved snapshot:
// financial totals + line items (added, removed, modified).
const AmendmentDiffCard = ({
  current,
  prior,
  ctx,
}: {
  current: PendingDiscountApproval
  prior: NonNullable<PendingDiscountApproval["prior_approval"]>
  ctx: CardCtx
}) => {
  const { t, fmtMoney } = ctx
  const num = (x: any) => Number(x ?? 0)
  const same = (a: any, b: any) => Math.abs(num(a) - num(b)) < 0.01

  const priorItems: any[] = Array.isArray(prior.items_snapshot) ? prior.items_snapshot : []
  const currItems: any[] = Array.isArray(current.items_snapshot) ? current.items_snapshot : []
  const keyOf = (r: any) => String(r?.product_id ?? r?.product_name ?? Math.random())

  const priorMap = new Map(priorItems.map(r => [keyOf(r), r]))
  const currMap = new Map(currItems.map(r => [keyOf(r), r]))

  const added: any[] = []
  const removed: any[] = []
  const changed: Array<{ from: any; to: any }> = []
  for (const [k, curr] of currMap.entries()) {
    const p = priorMap.get(k)
    if (!p) { added.push(curr); continue }
    if (!same(p.quantity, curr.quantity)
        || !same(p.unit_price, curr.unit_price)
        || !same(p.discount_percent, curr.discount_percent)
        || !same(p.tax_rate, curr.tax_rate)) {
      changed.push({ from: p, to: curr })
    }
  }
  for (const [k, p] of priorMap.entries()) {
    if (!currMap.has(k)) removed.push(p)
  }

  // v3.74.467 — include document-level discount in the diff table
  // so the owner sees the discount value change explicitly.
  const priorDiscLabel = prior.discount_type === "percent"
    ? `${num(prior.discount_value).toFixed(2)}%`
    : fmtMoney(num(prior.discount_value))
  const currDiscLabel = current.discount_type === "percent"
    ? `${num(current.discount_value).toFixed(2)}%`
    : fmtMoney(num(current.discount_value))
  const discChanged = priorDiscLabel !== currDiscLabel

  const rows: Array<{ label: string; a: number; b: number }> = [
    { label: t("المجموع الفرعى", "Subtotal"), a: num(prior.subtotal_snapshot), b: num(current.subtotal_snapshot) },
    { label: t("الشحن", "Shipping"), a: num(prior.shipping_snapshot), b: num(current.shipping_snapshot) },
    { label: t("نسبة ضريبة الشحن", "Shipping tax rate"), a: num((prior as any).shipping_tax_rate_snapshot), b: num((current as any).shipping_tax_rate_snapshot) },
    { label: t("قيمة الضريبة", "Tax amount"), a: num(prior.tax_amount_snapshot), b: num(current.tax_amount_snapshot) },
    { label: t("التعديل", "Adjustment"), a: num(prior.adjustment_snapshot), b: num(current.adjustment_snapshot) },
    { label: t("الإجمالى", "Total"), a: num(prior.document_total), b: num(current.document_total) },
  ]

  // v3.74.467 — categorical rows (non-numeric): discount position,
  // tax inclusive, supplier/customer name.
  const priorPos = String((prior as any).discount_position_snapshot ?? "")
  const currPos = String((current as any).discount_position_snapshot ?? "")
  const priorInc = Boolean((prior as any).tax_inclusive_snapshot)
  const currInc = Boolean((current as any).tax_inclusive_snapshot)
  const priorParty = String((prior as any).supplier_name_snapshot ?? (prior as any).party_name ?? "")
  const currParty = String((current as any).supplier_name_snapshot ?? (current as any).party_name ?? "")
  const posChanged = priorPos !== currPos && (priorPos || currPos)
  const incChanged = priorInc !== currInc
  const partyChanged = priorParty !== currParty && (priorParty || currParty)
  const posLabel = (v: string) => v === "before_tax" ? t("قبل الضريبة","before tax") : v === "after_tax" ? t("بعد الضريبة","after tax") : v || "—"

  const anyChanged = rows.some(r => !same(r.a, r.b)) || added.length + removed.length + changed.length > 0

  // v3.74.466 — surface the previous rejection so the owner sees
  // "you rejected X for reason Y — accountant now proposes Z".
  const priorWasRejected = prior.status === "rejected"
  const priorNote = (prior as any).decision_note as string | undefined

  return (
    <div className="mt-3 rounded-lg border-2 border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-bold text-amber-800 dark:text-amber-300">
          ⚠️ {t("تعديلات على الفاتورة تحتاج مراجعتك", "Amendments requiring your review")}
        </span>
      </div>
      {priorWasRejected && (
        <div className="mb-3 rounded border border-red-300 bg-red-50 dark:bg-red-900/20 p-2 text-xs">
          <p className="font-bold text-red-800 dark:text-red-300">
            🚫 {t("سبق رفض تعديل قبل هذا", "A previous amendment was rejected")}
          </p>
          {priorNote && (
            <p className="mt-1 text-red-700 dark:text-red-400">
              {t("سبب الرفض", "Reason")}: <span className="font-semibold">{priorNote}</span>
            </p>
          )}
          <p className="mt-1 text-red-700 dark:text-red-400">
            {t("قيمة التعديل المرفوض", "Rejected total")}: {fmtMoney(num(prior.document_total))}
          </p>
        </div>
      )}
      {!anyChanged ? (
        <p className="text-xs text-muted-foreground">
          {t("لا يوجد فروق ملموسة عن الاعتماد السابق.", "No material differences from the prior approval.")}
        </p>
      ) : (
        <>
          <table className="w-full text-xs mb-2">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-start font-normal py-1">{t("الحقل", "Field")}</th>
                <th className="text-end font-normal py-1">{t("قبل", "Before")}</th>
                <th className="text-end font-normal py-1">{t("بعد", "After")}</th>
              </tr>
            </thead>
            <tbody>
              {/* v3.74.467 — document-level discount row */}
              <tr className={discChanged ? "font-semibold" : "text-muted-foreground"}>
                <td className="py-1">{t("خصم الفاتورة", "Document discount")}</td>
                <td className="py-1 text-end">{priorDiscLabel}</td>
                <td className={"py-1 text-end " + (discChanged ? "text-amber-700 dark:text-amber-300" : "")}>
                  {currDiscLabel}
                </td>
              </tr>
              {/* v3.74.467 — categorical fields */}
              {(posChanged || (priorPos && currPos)) && (
                <tr className={posChanged ? "font-semibold" : "text-muted-foreground"}>
                  <td className="py-1">{t("موضع الخصم", "Discount position")}</td>
                  <td className="py-1 text-end">{posLabel(priorPos)}</td>
                  <td className={"py-1 text-end " + (posChanged ? "text-amber-700 dark:text-amber-300" : "")}>
                    {posLabel(currPos)}
                  </td>
                </tr>
              )}
              {incChanged && (
                <tr className="font-semibold">
                  <td className="py-1">{t("شاملة الضريبة", "Tax inclusive")}</td>
                  <td className="py-1 text-end">{priorInc ? t("نعم","yes") : t("لا","no")}</td>
                  <td className="py-1 text-end text-amber-700 dark:text-amber-300">
                    {currInc ? t("نعم","yes") : t("لا","no")}
                  </td>
                </tr>
              )}
              {partyChanged && (
                <tr className="font-semibold">
                  <td className="py-1">{t("المورد/العميل", "Party")}</td>
                  <td className="py-1 text-end">{priorParty || "—"}</td>
                  <td className="py-1 text-end text-amber-700 dark:text-amber-300">
                    {currParty || "—"}
                  </td>
                </tr>
              )}
              {rows.map((r, i) => {
                const diff = !same(r.a, r.b)
                return (
                  <tr key={i} className={diff ? "font-semibold" : "text-muted-foreground"}>
                    <td className="py-1">{r.label}</td>
                    <td className="py-1 text-end">{fmtMoney(r.a)}</td>
                    <td className={"py-1 text-end " + (diff ? "text-amber-700 dark:text-amber-300" : "")}>
                      {fmtMoney(r.b)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {added.length > 0 && (
            <div className="mb-1">
              <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                ➕ {t("بنود مضافة", "Added items")} ({added.length})
              </p>
              <ul className="text-xs ms-4 list-disc text-muted-foreground">
                {added.map((it, i) => {
                  // v3.74.469 — show item_type badge (product / service),
                  // description fallback, and every financial field
                  const typeLbl = it.item_type === "service" ? t("خدمة", "Service") : t("منتج", "Product")
                  const name = it.product_name ?? it.description ?? "?"
                  const disc = num(it.discount_percent)
                  const tax = num(it.tax_rate)
                  return (
                    <li key={i}>
                      <span className="inline-block px-1 me-1 text-[10px] rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">{typeLbl}</span>
                      <strong>{name}</strong>
                      {" · "}{t("كمية","qty")} {num(it.quantity)} × {fmtMoney(num(it.unit_price))}
                      {disc > 0 && <> · {t("خصم","disc")} {disc}%</>}
                      {tax > 0 && <> · {t("ضريبة","tax")} {tax}%</>}
                      {" = "}<strong>{fmtMoney(num(it.total))}</strong>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {removed.length > 0 && (
            <div className="mb-1">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                ➖ {t("بنود محذوفة", "Removed items")} ({removed.length})
              </p>
              <ul className="text-xs ms-4 list-disc text-muted-foreground">
                {removed.map((it, i) => {
                  const typeLbl = it.item_type === "service" ? t("خدمة", "Service") : t("منتج", "Product")
                  const name = it.product_name ?? it.description ?? "?"
                  const disc = num(it.discount_percent)
                  const tax = num(it.tax_rate)
                  return (
                    <li key={i}>
                      <span className="inline-block px-1 me-1 text-[10px] rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{typeLbl}</span>
                      <strong>{name}</strong>
                      {" · "}{t("كمية","qty")} {num(it.quantity)} × {fmtMoney(num(it.unit_price))}
                      {disc > 0 && <> · {t("خصم","disc")} {disc}%</>}
                      {tax > 0 && <> · {t("ضريبة","tax")} {tax}%</>}
                      {" = "}<strong>{fmtMoney(num(it.total))}</strong>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {changed.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                ✏️ {t("بنود معدلة", "Modified items")} ({changed.length})
              </p>
              <ul className="text-xs ms-4 list-disc text-muted-foreground">
                {changed.map((c, i) => {
                  // v3.74.467 — surface each field that changed on the item
                  const parts: string[] = []
                  if (!same(c.from.quantity, c.to.quantity)) {
                    parts.push(`${t("كمية","qty")} ${num(c.from.quantity)}→${num(c.to.quantity)}`)
                  }
                  if (!same(c.from.unit_price, c.to.unit_price)) {
                    parts.push(`${t("سعر","price")} ${fmtMoney(num(c.from.unit_price))}→${fmtMoney(num(c.to.unit_price))}`)
                  }
                  if (!same(c.from.discount_percent, c.to.discount_percent)) {
                    parts.push(`${t("خصم","disc")} ${num(c.from.discount_percent)}%→${num(c.to.discount_percent)}%`)
                  }
                  if (!same(c.from.tax_rate, c.to.tax_rate)) {
                    parts.push(`${t("ضريبة","tax")} ${num(c.from.tax_rate)}%→${num(c.to.tax_rate)}%`)
                  }
                  return (
                    <li key={i}>
                      <strong>{c.to.product_name ?? c.from.product_name ?? "?"}</strong>
                      {parts.length > 0 && <>: {parts.join(" · ")}</>}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const DiscountApprovalCard = ({ d, ctx }: { d: PendingDiscountApproval; ctx: CardCtx }) => {
  const { appLang, t, fmtMoney, fmtDate, docTypeLabel, docHref,
          rejectId, rejectReason, setRejectReason, setRejectId, setRejectType,
          runningId, handleApprove, handleReject } = ctx
  const discountLabel = d.discount_type === "percent"
    ? `${fmtMoney(d.discount_value)}%`
    : `${fmtMoney(d.discount_value)} ${t("ج.م", "EGP")}`
  const ratio = d.document_total && d.document_total > 0 && d.discount_type === "amount"
    ? (d.discount_value / d.document_total) * 100
    : null
  return (
    <Card key={d.id} className="border-l-4 border-l-rose-500">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg shrink-0">
              <Percent className="w-4 h-4 text-rose-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">
                {docTypeLabel(d.document_type)} · {d.document_no ?? t("بدون رقم", "(no number)")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                👤 {d.party_name ?? t("بدون طرف", "(no party)")}
                {d.document_total != null && (
                  <> · 💰 {t("إجمالى", "Total")}: {fmtMoney(d.document_total)} {t("ج.م", "EGP")}</>
                )}
              </p>
              <p className="text-xs mt-1">
                <span className="font-semibold text-rose-700 dark:text-rose-300">
                  {t("الخصم المطلوب", "Requested discount")}: {discountLabel}
                </span>
                {ratio != null && (
                  <span className="text-muted-foreground"> ({fmtMoney(ratio)}%)</span>
                )}
              </p>
              {d.reason && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  📝 {d.reason}
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                🧑 {d.requested_by_email ?? d.requested_by.slice(0, 8)} · 📅 {fmtDate(d.requested_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
              <Clock className="w-3 h-3 me-1" />{t("انتظار اعتماد", "Pending Approval")}
            </Badge>
            <Link href={docHref(d)} className="text-xs text-rose-600 hover:underline">
              {t("عرض المستند", "View document")}
            </Link>
          </div>
        </div>
        {/* v3.74.461 — Amendment diff card. Shown when this approval
            supersedes an earlier one, so the owner sees exactly what
            the accountant changed (shipping, tax, adjustment, items)
            before approving the amended bill/invoice. */}
        {d.prior_approval && (
          <AmendmentDiffCard current={d} prior={d.prior_approval} ctx={ctx} />
        )}
        <div className="flex gap-2 mt-3">
          <Button
            size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
            disabled={runningId === d.id}
            onClick={() => handleApprove(d)}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />{t("اعتماد الخصم", "Approve Discount")}
          </Button>
          <Button
            size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 text-xs"
            disabled={runningId === d.id}
            onClick={() => { setRejectId(d.id); setRejectType("discount_approval"); setRejectReason("") }}
          >
            <XCircle className="w-3.5 h-3.5" />{t("رفض", "Reject")}
          </Button>
        </div>
        {rejectId === d.id && (
          <div className="mt-3 space-y-2">
            <Textarea
              placeholder={t("سبب الرفض (مطلوب)…", "Rejection reason (required)…")}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={2}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" className="text-xs" disabled={!rejectReason.trim() || runningId === d.id} onClick={handleReject}>
                {t("تأكيد الرفض", "Confirm Reject")}
              </Button>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setRejectId(null); setRejectReason("") }}>
                {t("إلغاء", "Cancel")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// v3.74.434 → v3.74.435 — UnifiedHistoryEntry is a single shape that
// covers every approval flow (discounts + BOM versions + material
// issues so far). Each loader normalizes its source rows into this
// shape so the renderer + filter is one piece of code, not five.
type HistoryCategory = "discount" | "bom_version" | "material_issue" | "routing_version" | "production_order" | "product_receive"

interface UnifiedHistoryEntry {
  id: string
  category: HistoryCategory
  doc_label: string         // "أمر الشراء PO-0001" / "BOM-12 v3" / "MI-42"
  doc_href: string | null   // optional link to source doc
  party_label: string | null   // supplier/customer/product name, etc.
  value_label: string | null   // "10% خصم" / "100 وحدة" — domain-specific summary
  status: "approved" | "rejected" | "cancelled"
  requested_by_email: string | null
  requested_at: string
  decided_by_email: string | null
  decided_at: string | null
  decision_note: string | null
  // v3.74.470 — amendment context so the history row reflects what
  // was actually decided (a re-approval after an edit), not just the
  // static discount value.
  is_amendment?: boolean
  amendment_delta?: string | null   // e.g. "8.53 → 8.73 (+0.20)"
  prior_status?: string | null      // "rejected" / "approved" (what was superseded)
}

type UnifiedHistoryCtx = {
  appLang: "ar" | "en"
  t: (ar: string, en: string) => string
  fmtDate: (s: string) => string
}

const UnifiedHistoryCard = ({ h, ctx }: { h: UnifiedHistoryEntry; ctx: UnifiedHistoryCtx }) => {
  const { t, fmtDate } = ctx
  const statusBadge =
    h.status === "approved"  ? { color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",  label: t("معتمد", "Approved") } :
    h.status === "rejected"  ? { color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",         label: t("مرفوض", "Rejected") } :
                                { color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",       label: t("ملغى", "Cancelled") }
  const borderColor =
    h.status === "approved"  ? "border-l-green-500" :
    h.status === "rejected"  ? "border-l-red-500" :
                                "border-l-gray-400"
  const categoryLabel =
    h.category === "discount"         ? t("خصم", "Discount") :
    h.category === "bom_version"      ? t("قائمة مواد", "BOM") :
    h.category === "material_issue"   ? t("طلب صرف", "Material Issue") :
    h.category === "routing_version"  ? t("مسار تصنيع", "Routing") :
    h.category === "production_order" ? t("أمر إنتاج", "Production Order") :
    h.category === "product_receive"  ? t("استلام منتج", "Product Receive") :
                                         h.category
  const CategoryIcon =
    h.category === "discount"         ? Percent :
    h.category === "bom_version"      ? Layers :
    h.category === "routing_version"  ? GitMerge :
    h.category === "production_order" ? Factory :
    h.category === "product_receive"  ? CheckCircle2 :
                                         Package
  return (
    <Card key={h.id} className={`border-l-4 ${borderColor}`}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0">
              <CategoryIcon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">
                <Badge variant="outline" className="me-2 text-[10px]">{categoryLabel}</Badge>
                {/* v3.74.470 — mark amendments so history shows this
                    was a re-approval, not the original discount request. */}
                {h.is_amendment && (
                  <Badge className="me-2 text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                    🔄 {t("تعديل", "Amendment")}
                    {h.prior_status === "rejected" && <> · {t("بعد رفض", "after rejection")}</>}
                  </Badge>
                )}
                {h.doc_label}
              </p>
              {h.is_amendment && h.amendment_delta && (
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5 font-mono">
                  💰 {t("الإجمالى","Total")}: {h.amendment_delta}
                </p>
              )}
              {h.party_label && (
                <p className="text-xs text-muted-foreground mt-0.5">👤 {h.party_label}</p>
              )}
              {h.value_label && (
                <p className="text-xs mt-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{h.value_label}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                🧑 {t("طلب", "Requested by")}: {h.requested_by_email ?? "—"} · 📅 {fmtDate(h.requested_at)}
              </p>
              {h.decided_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  ⚖️ {t("القرار", "Decided by")}: {h.decided_by_email ?? "—"} · 📅 {fmtDate(h.decided_at)}
                </p>
              )}
              {h.decision_note && (
                <p className="text-xs mt-1 p-2 rounded bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700">
                  📝 {h.decision_note}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={`${statusBadge.color} text-xs`}>{statusBadge.label}</Badge>
            {h.doc_href && (
              <Link href={h.doc_href} className="text-xs text-rose-600 hover:underline">
                {t("عرض المستند", "View document")}
              </Link>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Component ─────────────────────────────────────────────

function ApprovalsContent() {
  const supabase = createClient()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")
  const [isLoading, setIsLoading] = useState(true)
  const [bomVersions, setBomVersions] = useState<PendingBomVersion[]>([])
  const [routingVersions, setRoutingVersions] = useState<PendingRoutingVersion[]>([])
  const [productionOrders, setProductionOrders] = useState<PendingProductionOrder[]>([])
  const [materialIssues, setMaterialIssues] = useState<PendingMaterialIssue[]>([])
  const [discountApprovals, setDiscountApprovals] = useState<PendingDiscountApproval[]>([])
  // v3.74.434 → v3.74.435 — unified history feed for all approval flows.
  const [activeTab, setActiveTab] = useState<"all" | "bom" | "routing" | "po" | "mi" | "disc" | "history">("all")
  const [history, setHistory] = useState<UnifiedHistoryEntry[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<HistoryCategory | "all">("all")
  const [runningId, setRunningId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectType, setRejectType] = useState<"bom_version" | "routing_version" | "production_order" | "material_issue" | "discount_approval" | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  const t = (ar: string, en: string) => appLang === "ar" ? ar : en

  useEffect(() => {
    const h = () => { try { setAppLang((localStorage.getItem("app_language") || "ar") === "en" ? "en" : "ar") } catch {} }
    h(); window.addEventListener("app_language_changed", h)
    return () => window.removeEventListener("app_language_changed", h)
  }, [])

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const cid = document.cookie.split(";").find(c => c.trim().startsWith("active_company_id="))?.split("=")[1] || ""
      if (!cid) return

      // BOM versions pending
      const { data: boms } = await supabase
        .from("manufacturing_bom_versions")
        .select(`
          id, version_no, status, submitted_at,
          manufacturing_boms!inner(bom_code, products!inner(name)),
          branches!inner(name)
        `)
        .eq("company_id", cid)
        .eq("status", "pending_approval")
        .order("submitted_at", { ascending: true })
        .limit(50)

      setBomVersions((boms || []).map((b: any) => ({
        id: b.id,
        version_no: b.version_no,
        status: b.status,
        submitted_at: b.submitted_at,
        bom_code: b.manufacturing_boms?.bom_code ?? "—",
        product_name: b.manufacturing_boms?.products?.name ?? "—",
        branch_name: b.branches?.name ?? "—",
        submitted_by_email: "—",
        type: "bom_version" as const,
      })))

      // Routing versions pending
      const { data: routings } = await supabase
        .from("manufacturing_routing_versions")
        .select(`
          id, version_no, approval_status, submitted_at,
          manufacturing_routings!inner(routing_code, routing_name),
          branches!inner(name)
        `)
        .eq("company_id", cid)
        .eq("approval_status", "pending_approval")
        .order("submitted_at", { ascending: true })
        .limit(50)

      setRoutingVersions((routings || []).map((r: any) => ({
        id: r.id,
        version_no: r.version_no,
        approval_status: r.approval_status,
        submitted_at: r.submitted_at,
        routing_code: r.manufacturing_routings?.routing_code ?? "—",
        routing_name: r.manufacturing_routings?.routing_name ?? "—",
        branch_name: r.branches?.name ?? "—",
        submitted_by_email: "—",
        type: "routing_version" as const,
      })))

      // Production orders pending
      const { data: pos } = await supabase
        .from("manufacturing_production_orders")
        .select(`
          id, order_no, approval_status, submitted_at, planned_quantity,
          products!inner(name),
          branches(name)
        `)
        .eq("company_id", cid)
        .eq("approval_status", "pending_approval")
        .order("submitted_at", { ascending: true })
        .limit(50)

      setProductionOrders((pos || []).map((p: any) => ({
        id: p.id,
        order_no: p.order_no,
        approval_status: p.approval_status,
        submitted_at: p.submitted_at,
        planned_quantity: p.planned_quantity,
        product_name: p.products?.name ?? "—",
        branch_name: p.branches?.name ?? "—",
        type: "production_order" as const,
      })))

      // Material issue approvals — pending management approval only (Stage 1)
      // management_approved goes to /inventory/dispatch-approvals for warehouse staff (Stage 2)
      const { data: mis } = await supabase
        .from("manufacturing_material_issue_approvals")
        .select(`
          id, status, requested_at,
          manufacturing_production_orders!inner(order_no, products!inner(name)),
          branches(name),
          warehouses(name)
        `)
        .eq("company_id", cid)
        .eq("status", "pending")
        .order("requested_at", { ascending: true })
        .limit(50)

      setMaterialIssues((mis || []).map((m: any) => ({
        id: m.id,
        status: m.status,
        requested_at: m.requested_at,
        order_no: m.manufacturing_production_orders?.order_no ?? "—",
        product_name: m.manufacturing_production_orders?.products?.name ?? "—",
        branch_name: m.branches?.name ?? "—",
        warehouse_name: m.warehouses?.name ?? "—",
        type: "material_issue" as const,
      })))

      // v3.74.373 — Discount approvals (Stage 2).
      // We deliberately go through the API route rather than a
      // direct table query: the route enforces can_approve_discount
      // and joins the requester's email via the service client, so
      // the inbox stays consistent with the badge RPC for owner /
      // admin / general_manager only.
      try {
        const discRes = await fetch(`/api/discount-approvals?company_id=${encodeURIComponent(cid)}`, {
          cache: "no-store",
        })
        if (discRes.ok) {
          const discJson = await discRes.json()
          const rows = Array.isArray(discJson?.data) ? discJson.data : []
          setDiscountApprovals(rows.map((d: any): PendingDiscountApproval => ({
            id: d.id,
            document_type: d.document_type,
            document_id: d.document_id,
            document_no: d.document_no ?? null,
            discount_value: Number(d.discount_value ?? 0),
            discount_type: d.discount_type,
            document_total: d.document_total != null ? Number(d.document_total) : null,
            party_name: d.party_name ?? null,
            reason: d.reason ?? null,
            status: d.status,
            requested_by: d.requested_by,
            requested_at: d.requested_at,
            requested_by_email: d.requested_by_email ?? null,
            type: "discount_approval",
            // v3.74.461 — amendment tracking
            supersedes_approval_id: d.supersedes_approval_id ?? null,
            items_snapshot: Array.isArray(d.items_snapshot) ? d.items_snapshot : null,
            shipping_snapshot: d.shipping_snapshot != null ? Number(d.shipping_snapshot) : null,
            adjustment_snapshot: d.adjustment_snapshot != null ? Number(d.adjustment_snapshot) : null,
            tax_amount_snapshot: d.tax_amount_snapshot != null ? Number(d.tax_amount_snapshot) : null,
            subtotal_snapshot: d.subtotal_snapshot != null ? Number(d.subtotal_snapshot) : null,
            shipping_tax_rate_snapshot: d.shipping_tax_rate_snapshot != null ? Number(d.shipping_tax_rate_snapshot) : null,
            discount_position_snapshot: d.discount_position_snapshot ?? null,
            tax_inclusive_snapshot: d.tax_inclusive_snapshot ?? null,
            supplier_name_snapshot: d.supplier_name_snapshot ?? null,
            prior_approval: d.prior_approval ?? null,
          })))
        } else {
          // 403 = caller isn't an approver; leave the list empty.
          setDiscountApprovals([])
        }
      } catch {
        setDiscountApprovals([])
      }
    } finally {
      setIsLoading(false)
    }
  }, [supabase])

  useEffect(() => { load() }, [load])

  // v3.74.435 — load decided approvals from EVERY supported source
  // and merge into a single unified feed sorted by decision time.
  // BOM versions + Material issues are loaded directly from supabase
  // (no dedicated API). Discounts go through the existing API to
  // benefit from its email enrichment.
  const loadHistory = useCallback(async () => {
    try {
      // Same cookie-based lookup as load() above (this page is a
      // client component, so we can't import the server helper).
      const cid = document.cookie.split(";").find(c => c.trim().startsWith("active_company_id="))?.split("=")[1] || ""
      if (!cid) { setHistory([]); return }

      const merged: UnifiedHistoryEntry[] = []

      // --- Discounts via API (already enriched with both emails)
      try {
        const res = await fetch(`/api/discount-approvals?company_id=${encodeURIComponent(cid)}&status=all`, { cache: "no-store" })
        if (res.ok) {
          const json = await res.json()
          const rows: any[] = Array.isArray(json?.data) ? json.data : []
          for (const d of rows) {
            if (d.status === "pending") continue
            const docLabel =
              d.document_type === "purchase_order"   ? `أمر شراء ${d.document_no ?? d.document_id.slice(0,6)}` :
              d.document_type === "sales_order"      ? `طلب مبيعات ${d.document_no ?? d.document_id.slice(0,6)}` :
              d.document_type === "purchase_invoice" ? `فاتورة مشتريات ${d.document_no ?? d.document_id.slice(0,6)}` :
              d.document_type === "sales_invoice"    ? `فاتورة مبيعات ${d.document_no ?? d.document_id.slice(0,6)}` :
              d.document_type === "booking"          ? `حجز ${d.document_no ?? d.document_id.slice(0,6)}` :
                                                       `${d.document_type} ${d.document_no ?? ""}`
            const href =
              d.document_type === "purchase_order"   ? `/purchase-orders/${d.document_id}` :
              d.document_type === "sales_order"      ? `/sales-orders/${d.document_id}` :
              d.document_type === "purchase_invoice" ? `/bills/${d.document_id}` :
              d.document_type === "sales_invoice"    ? `/invoices/${d.document_id}` :
              d.document_type === "booking"          ? `/bookings/${d.document_id}` :
                                                       null
            const valueLabel = d.discount_type === "percent"
              ? `الخصم: ${d.discount_value}%`
              : `الخصم: ${d.discount_value} ج.م`
            // v3.74.470 — build amendment context from the prior
            // approval when supersedes_approval_id is set.
            const isAmend = Boolean(d.supersedes_approval_id && d.prior_approval)
            let delta: string | null = null
            if (isAmend && d.prior_approval) {
              const before = Number(d.prior_approval.document_total ?? 0)
              const after  = Number(d.document_total ?? 0)
              const diff = after - before
              const sign = diff > 0 ? "+" : ""
              delta = `${before.toFixed(2)} → ${after.toFixed(2)} (${sign}${diff.toFixed(2)})`
            }
            merged.push({
              id: `disc-${d.id}`,
              category: "discount",
              doc_label: docLabel,
              doc_href: href,
              party_label: d.party_name ?? null,
              value_label: valueLabel,
              status: d.status,
              requested_by_email: d.requested_by_email ?? null,
              requested_at: d.requested_at,
              decided_by_email: d.decided_by_email ?? null,
              decided_at: d.decided_at ?? null,
              decision_note: d.decision_note ?? null,
              is_amendment: isAmend,
              amendment_delta: delta,
              prior_status: d.prior_approval?.status ?? null,
            })
          }
        }
      } catch { /* keep going */ }

      // --- BOM versions (direct from supabase since no API exists)
      try {
        const { data: boms } = await supabase
          .from("manufacturing_bom_versions")
          .select(`
            id, version_no, status, submitted_at, submitted_by, approved_by, approved_at,
            rejected_by, rejected_at, rejection_reason,
            manufacturing_boms!inner(bom_code, products!inner(name)),
            branches!inner(name)
          `)
          .eq("company_id", cid)
          .in("status", ["approved", "rejected"])
          .order("submitted_at", { ascending: false })
          .limit(200)
        for (const b of (boms || []) as any[]) {
          const decided_at = b.status === "approved" ? b.approved_at : b.rejected_at
          merged.push({
            id: `bom-${b.id}`,
            category: "bom_version",
            doc_label: `${b.manufacturing_boms?.bom_code ?? "BOM"} · إصدار ${b.version_no}`,
            doc_href: null,
            party_label: `${b.manufacturing_boms?.products?.name ?? "—"} · ${b.branches?.name ?? "—"}`,
            value_label: null,
            status: b.status,
            requested_by_email: null,
            requested_at: b.submitted_at,
            decided_by_email: null,
            decided_at,
            decision_note: b.rejection_reason ?? null,
          })
        }
      } catch { /* keep going */ }

      // --- Routing versions (v3.74.437 added the approval columns)
      try {
        const { data: rvs } = await supabase
          .from("manufacturing_routing_versions")
          .select(`
            id, version_no, approval_status, submitted_at, submitted_by,
            approved_by, approved_at, rejected_by, rejected_at, rejection_reason,
            manufacturing_routings!inner(routing_code, routing_name),
            branches!inner(name)
          `)
          .eq("company_id", cid)
          .in("approval_status", ["approved", "rejected"])
          .order("submitted_at", { ascending: false })
          .limit(200)
        for (const r of (rvs || []) as any[]) {
          const decided_at = r.approval_status === "approved" ? r.approved_at : r.rejected_at
          merged.push({
            id: `rv-${r.id}`,
            category: "routing_version",
            doc_label: `${r.manufacturing_routings?.routing_code ?? "Routing"} · إصدار ${r.version_no}`,
            doc_href: null,
            party_label: `${r.manufacturing_routings?.routing_name ?? "—"} · ${r.branches?.name ?? "—"}`,
            value_label: null,
            status: r.approval_status,
            requested_by_email: null,
            requested_at: r.submitted_at ?? r.approved_at ?? r.rejected_at,
            decided_by_email: null,
            decided_at,
            decision_note: r.rejection_reason ?? null,
          })
        }
      } catch { /* keep going */ }

      // --- Production orders (v3.74.438 added the approval columns)
      try {
        const { data: pos } = await supabase
          .from("manufacturing_production_orders")
          .select(`
            id, order_no, approval_status, submitted_at, submitted_by, planned_quantity,
            approved_by, approved_at, rejected_by, rejected_at, rejection_reason,
            products!inner(name),
            branches(name)
          `)
          .eq("company_id", cid)
          .in("approval_status", ["approved", "rejected"])
          .order("submitted_at", { ascending: false })
          .limit(200)
        for (const p of (pos || []) as any[]) {
          const decided_at = p.approval_status === "approved" ? p.approved_at : p.rejected_at
          merged.push({
            id: `po-${p.id}`,
            category: "production_order",
            doc_label: `أمر إنتاج ${p.order_no}`,
            doc_href: null,
            party_label: `${p.products?.name ?? "—"}${p.branches?.name ? " · " + p.branches.name : ""}`,
            value_label: `الكمية المخططة: ${p.planned_quantity}`,
            status: p.approval_status,
            requested_by_email: null,
            requested_at: p.submitted_at ?? p.approved_at ?? p.rejected_at,
            decided_by_email: null,
            decided_at,
            decision_note: p.rejection_reason ?? null,
          })
        }
      } catch { /* keep going */ }

      // --- Product receive approvals (v3.74.440)
      try {
        const { data: prs } = await supabase
          .from("manufacturing_product_receive_approvals")
          .select(`
            id, status, requested_by, requested_at, proposed_quantity,
            approved_by, approved_at, rejected_by, rejected_at, rejection_reason,
            manufacturing_production_orders!inner(order_no, products!inner(name))
          `)
          .eq("company_id", cid)
          .in("status", ["approved", "rejected"])
          .order("requested_at", { ascending: false })
          .limit(200)
        for (const r of (prs || []) as any[]) {
          const decided_at = r.status === "approved" ? r.approved_at : r.rejected_at
          merged.push({
            id: `pr-${r.id}`,
            category: "product_receive",
            doc_label: `استلام إنتاج · أمر ${r.manufacturing_production_orders?.order_no ?? "—"}`,
            doc_href: null,
            party_label: r.manufacturing_production_orders?.products?.name ?? "—",
            value_label: `الكمية: ${r.proposed_quantity}`,
            status: r.status,
            requested_by_email: null,
            requested_at: r.requested_at,
            decided_by_email: null,
            decided_at,
            decision_note: r.rejection_reason ?? null,
          })
        }
      } catch { /* keep going */ }

      // --- Material issue approvals
      try {
        const { data: mis } = await supabase
          .from("manufacturing_material_issue_approvals")
          .select(`
            id, status, requested_by, requested_at, approved_by, approved_at,
            rejected_by, rejected_at, rejection_reason
          `)
          .eq("company_id", cid)
          .in("status", ["approved", "rejected"])
          .order("requested_at", { ascending: false })
          .limit(200)
        for (const m of (mis || []) as any[]) {
          const decided_at = m.status === "approved" ? m.approved_at : m.rejected_at
          merged.push({
            id: `mi-${m.id}`,
            category: "material_issue",
            doc_label: `طلب صرف #${m.id.slice(0, 8)}`,
            doc_href: null,
            party_label: null,
            value_label: null,
            status: m.status,
            requested_by_email: null,
            requested_at: m.requested_at,
            decided_by_email: null,
            decided_at,
            decision_note: m.rejection_reason ?? null,
          })
        }
      } catch { /* keep going */ }

      merged.sort((a, b) => {
        const ta = a.decided_at ? new Date(a.decided_at).getTime() : new Date(a.requested_at).getTime()
        const tb = b.decided_at ? new Date(b.decided_at).getTime() : new Date(b.requested_at).getTime()
        return tb - ta
      })
      setHistory(merged)
      setHistoryLoaded(true)
    } catch {
      setHistory([])
    }
  }, [supabase])

  useEffect(() => {
    if (activeTab === "history" && !historyLoaded) {
      loadHistory()
    }
  }, [activeTab, historyLoaded, loadHistory])

  const handleApprove = async (item: PendingItem, stage?: "management" | "warehouse") => {
    setRunningId(item.id)
    try {
      // v3.74.373 — discount approvals go through their dedicated
      // POST … /decide endpoint with a JSON body. Everything else
      // keeps the existing GET-style approve endpoints.
      if (item.type === "discount_approval") {
        const res = await fetch(`/api/discount-approvals/${item.id}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "approved" }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed")
        toast({ title: t("تمت الموافقة على الخصم ✅", "Discount approved ✅"), description: t("يمكن الآن إتمام المستند", "The document can now be finalized") })
        await load()
        return
      }
      const endpoint =
        item.type === "bom_version"     ? `/api/manufacturing/bom-versions/${item.id}/approve` :
        item.type === "routing_version" ? `/api/manufacturing/routing-versions/${item.id}/approve` :
        item.type === "production_order"? `/api/manufacturing/production-orders/${item.id}/approve` :
        stage === "management"          ? `/api/manufacturing/material-issue-approvals/${item.id}/management-approve` :
                                          `/api/manufacturing/material-issue-approvals/${item.id}/approve`
      const res = await fetch(endpoint, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast({ title: t("تمت الموافقة ✅", "Approved ✅"), description: t("تمت الموافقة بنجاح", "Approved successfully") })
      await load()
    } catch (e: any) {
      toast({ title: t("خطأ", "Error"), description: e.message, variant: "destructive" })
    } finally {
      setRunningId(null)
    }
  }

  const handleReject = async () => {
    if (!rejectId || !rejectType || !rejectReason.trim()) return
    setRunningId(rejectId)
    try {
      // v3.74.373 — discount rejection goes through /decide with
      // decision='rejected' and the note in `note`, not `rejection_reason`.
      if (rejectType === "discount_approval") {
        const res = await fetch(`/api/discount-approvals/${rejectId}/decide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "rejected", note: rejectReason.trim() }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed")
        toast({ title: t("تم رفض الخصم", "Discount rejected"), description: t("تم إخطار مُرسل الطلب", "The requester has been notified") })
        setRejectId(null); setRejectType(null); setRejectReason("")
        await load()
        return
      }
      const endpoint =
        rejectType === "bom_version"     ? `/api/manufacturing/bom-versions/${rejectId}/reject` :
        rejectType === "routing_version" ? `/api/manufacturing/routing-versions/${rejectId}/reject` :
        rejectType === "production_order"? `/api/manufacturing/production-orders/${rejectId}/reject` :
                                           `/api/manufacturing/material-issue-approvals/${rejectId}/reject`
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rejection_reason: rejectReason.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toast({ title: t("تم الرفض", "Rejected"), description: t("تم رفض الطلب", "Request rejected") })
      setRejectId(null); setRejectType(null); setRejectReason("")
      await load()
    } catch (e: any) {
      toast({ title: t("خطأ", "Error"), description: e.message, variant: "destructive" })
    } finally {
      setRunningId(null)
    }
  }

  const totalPending = bomVersions.length + routingVersions.length + productionOrders.length + materialIssues.length + discountApprovals.length
  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString(appLang === "ar" ? "ar-EG" : "en-US") : "—"
  const fmtMoney = (n: number) => {
    try {
      return new Intl.NumberFormat(appLang === "ar" ? "ar-EG" : "en-US", {
        style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(n)
    } catch { return String(n) }
  }
  // v3.74.422 — explicit branches for every document type so unknown
  // values cannot silently fall through to "Booking".
  const docTypeLabel = (d: PendingDiscountApproval["document_type"]) => {
    switch (d) {
      case "sales_invoice":    return t("فاتورة مبيعات", "Sales Invoice")
      case "purchase_invoice": return t("فاتورة مشتريات", "Purchase Invoice")
      case "purchase_order":   return t("أمر شراء", "Purchase Order")
      case "sales_order":      return t("طلب مبيعات", "Sales Order")
      case "booking":          return t("حجز خدمة", "Booking")
      case "supplier_payment": return t("دفعة مورد", "Supplier Payment")
      case "purchase_return":  return t("مرتجع مشتريات", "Purchase Return")
      case "sales_return":     return t("مرتجع مبيعات", "Sales Return")
      default:                 return t("مستند", "Document")
    }
  }
  const docHref = (item: PendingDiscountApproval) => {
    switch (item.document_type) {
      case "sales_invoice":    return `/invoices/${item.document_id}`
      case "purchase_invoice": return `/bills/${item.document_id}`
      case "purchase_order":   return `/purchase-orders/${item.document_id}`
      case "sales_order":      return `/sales-orders/${item.document_id}`
      case "booking":          return `/bookings/${item.document_id}`
      case "supplier_payment": return `/payments/${item.document_id}`
      case "purchase_return":  return `/purchase-returns/${item.document_id}`
      case "sales_return":     return `/sales-returns/${item.document_id}`
      default:                 return "#"
    }
  }

  const BomCard = ({ b }: { b: PendingBomVersion }) => (
    <Card key={b.id} className="border-l-4 border-l-blue-500">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg shrink-0">
              <Layers className="w-4 h-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">{b.product_name}</p>
              <p className="text-xs text-muted-foreground font-mono">{b.bom_code} · v{b.version_no}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                🏢 {b.branch_name} · 📅 {fmtDate(b.submitted_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
              <Clock className="w-3 h-3 me-1" />{t("انتظار", "Pending")}
            </Badge>
            <Link href={`/manufacturing/boms`} className="text-xs text-blue-600 hover:underline">{t("عرض", "View")}</Link>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
            disabled={runningId === b.id}
            onClick={() => handleApprove(b)}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />{t("موافقة", "Approve")}
          </Button>
          <Button
            size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 text-xs"
            disabled={runningId === b.id}
            onClick={() => { setRejectId(b.id); setRejectType("bom_version"); setRejectReason("") }}
          >
            <XCircle className="w-3.5 h-3.5" />{t("رفض", "Reject")}
          </Button>
        </div>
        {/* Reject reason input */}
        {rejectId === b.id && (
          <div className="mt-3 space-y-2">
            <Textarea
              placeholder={t("سبب الرفض (مطلوب)…", "Rejection reason (required)…")}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={2}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" className="text-xs" disabled={!rejectReason.trim() || runningId === b.id} onClick={handleReject}>
                {t("تأكيد الرفض", "Confirm Reject")}
              </Button>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setRejectId(null); setRejectReason("") }}>
                {t("إلغاء", "Cancel")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )

  const RoutingCard = ({ r }: { r: PendingRoutingVersion }) => (
    <Card key={r.id} className="border-l-4 border-l-purple-500">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg shrink-0">
              <GitMerge className="w-4 h-4 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">{r.routing_name}</p>
              <p className="text-xs text-muted-foreground font-mono">{r.routing_code} · v{r.version_no}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                🏢 {r.branch_name} · 📅 {fmtDate(r.submitted_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
              <Clock className="w-3 h-3 me-1" />{t("انتظار", "Pending")}
            </Badge>
            <Link href={`/manufacturing/routings`} className="text-xs text-purple-600 hover:underline">{t("عرض", "View")}</Link>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
            disabled={runningId === r.id}
            onClick={() => handleApprove(r)}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />{t("موافقة", "Approve")}
          </Button>
          <Button
            size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 text-xs"
            disabled={runningId === r.id}
            onClick={() => { setRejectId(r.id); setRejectType("routing_version"); setRejectReason("") }}
          >
            <XCircle className="w-3.5 h-3.5" />{t("رفض", "Reject")}
          </Button>
        </div>
        {rejectId === r.id && (
          <div className="mt-3 space-y-2">
            <Textarea
              placeholder={t("سبب الرفض (مطلوب)…", "Rejection reason (required)…")}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={2}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" className="text-xs" disabled={!rejectReason.trim() || runningId === r.id} onClick={handleReject}>
                {t("تأكيد الرفض", "Confirm Reject")}
              </Button>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setRejectId(null); setRejectReason("") }}>
                {t("إلغاء", "Cancel")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )

  const MaterialIssueCard = ({ m }: { m: PendingMaterialIssue }) => {
    return (
      <Card key={m.id} className="border-l-4 border-l-teal-500">
        <CardContent className="py-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg shrink-0">
                <Package className="w-4 h-4 text-teal-600" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm">{m.product_name}</p>
                <p className="text-xs text-muted-foreground font-mono">{m.order_no}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  🏢 {m.branch_name} · 🏭 {m.warehouse_name} · 📅 {fmtDate(m.requested_at)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                <Clock className="w-3 h-3 me-1" />{t("انتظار الإدارة", "Pending Management")}
              </Badge>
              <Link href={`/manufacturing/production-orders`} className="text-xs text-teal-600 hover:underline">{t("عرض", "View")}</Link>
            </div>
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            <Button
              size="sm" className="gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs"
              disabled={runningId === m.id}
              onClick={() => handleApprove(m, "management")}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />{t("اعتماد الإدارة", "Management Approve")}
            </Button>
            <Button
              size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 text-xs"
              disabled={runningId === m.id}
              onClick={() => { setRejectId(m.id); setRejectType("material_issue"); setRejectReason("") }}
            >
              <XCircle className="w-3.5 h-3.5" />{t("رفض", "Reject")}
            </Button>
          </div>
          {rejectId === m.id && (
            <div className="mt-3 space-y-2">
              <Textarea
                placeholder={t("سبب الرفض (مطلوب)…", "Rejection reason (required)…")}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" className="text-xs" disabled={!rejectReason.trim() || runningId === m.id} onClick={handleReject}>
                  {t("تأكيد الرفض", "Confirm Reject")}
                </Button>
                <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setRejectId(null); setRejectReason("") }}>
                  {t("إلغاء", "Cancel")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // v3.74.432 — DiscountApprovalCard hoisted to module level (see top
  // of file). Bundle the closure values into ctx so we pass one prop.
  const discountCardCtx: CardCtx = {
    appLang, t, fmtMoney, fmtDate, docTypeLabel, docHref,
    rejectId, rejectReason, setRejectReason, setRejectId, setRejectType,
    runningId, handleApprove, handleReject,
  }

  const ProductionOrderCard = ({ p }: { p: PendingProductionOrder }) => (
    <Card key={p.id} className="border-l-4 border-l-orange-500">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg shrink-0">
              <Factory className="w-4 h-4 text-orange-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">{p.product_name}</p>
              <p className="text-xs text-muted-foreground font-mono">{p.order_no} · {t("الكمية", "Qty")}: {p.planned_quantity}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                🏢 {p.branch_name} · 📅 {fmtDate(p.submitted_at)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
              <Clock className="w-3 h-3 me-1" />{t("انتظار", "Pending")}
            </Badge>
            <Link href={`/manufacturing/production-orders`} className="text-xs text-orange-600 hover:underline">{t("عرض", "View")}</Link>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
            disabled={runningId === p.id}
            onClick={() => handleApprove(p)}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />{t("موافقة", "Approve")}
          </Button>
          <Button
            size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 text-xs"
            disabled={runningId === p.id}
            onClick={() => { setRejectId(p.id); setRejectType("production_order"); setRejectReason("") }}
          >
            <XCircle className="w-3.5 h-3.5" />{t("رفض", "Reject")}
          </Button>
        </div>
        {rejectId === p.id && (
          <div className="mt-3 space-y-2">
            <Textarea
              placeholder={t("سبب الرفض (مطلوب)…", "Rejection reason (required)…")}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={2}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" className="text-xs" disabled={!rejectReason.trim() || runningId === p.id} onClick={handleReject}>
                {t("تأكيد الرفض", "Confirm Reject")}
              </Button>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setRejectId(null); setRejectReason("") }}>
                {t("إلغاء", "Cancel")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900" dir={appLang === "ar" ? "rtl" : "ltr"}>
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Header — Migrated to ERPPageHeader (v3.54.0) */}
          <ERPPageHeader
            title={t("صندوق الموافقات", "Approval Inbox")}
            description={t("الطلبات المعلقة التي تحتاج موافقتك", "Pending requests awaiting your approval")}
            variant="list"
            lang={appLang as "ar" | "en"}
            actions={
              <div className="flex items-center gap-2">
                {totalPending > 0 && (
                  <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                    {totalPending} {t("معلق", "pending")}
                  </Badge>
                )}
                <Button variant="outline" size="sm" onClick={load} disabled={isLoading} className="gap-1">
                  <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                  {t("تحديث", "Refresh")}
                </Button>
              </div>
            }
          />

          {/* Tabs */}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant={activeTab === "all"     ? "default" : "outline"} onClick={() => setActiveTab("all")}     className="gap-1">
              {t("الكل", "All")} ({totalPending})
            </Button>
            <Button size="sm" variant={activeTab === "bom"     ? "default" : "outline"} onClick={() => setActiveTab("bom")}     className="gap-1">
              <Layers   className="w-3.5 h-3.5" />{t("قوائم المواد", "BOMs")} ({bomVersions.length})
            </Button>
            <Button size="sm" variant={activeTab === "routing" ? "default" : "outline"} onClick={() => setActiveTab("routing")} className="gap-1">
              <GitMerge className="w-3.5 h-3.5" />{t("مسارات التصنيع", "Routings")} ({routingVersions.length})
            </Button>
            <Button size="sm" variant={activeTab === "po"      ? "default" : "outline"} onClick={() => setActiveTab("po")}      className="gap-1">
              <Factory  className="w-3.5 h-3.5" />{t("أوامر الإنتاج", "Production Orders")} ({productionOrders.length})
            </Button>
            <Button size="sm" variant={activeTab === "mi"      ? "default" : "outline"} onClick={() => setActiveTab("mi")}      className="gap-1">
              <Package  className="w-3.5 h-3.5" />{t("طلبات الصرف", "Material Issues")} ({materialIssues.length})
            </Button>
            <Button size="sm" variant={activeTab === "disc"    ? "default" : "outline"} onClick={() => setActiveTab("disc")}    className="gap-1">
              <Percent  className="w-3.5 h-3.5" />{t("خصومات", "Discounts")} ({discountApprovals.length})
            </Button>
            {/* v3.74.434 → v3.74.435 — unified history tab */}
            <Button size="sm" variant={activeTab === "history" ? "default" : "outline"} onClick={() => setActiveTab("history")} className="gap-1">
              <Clock className="w-3.5 h-3.5" />{t("السجل", "History")}{historyLoaded ? ` (${history.length})` : ""}
            </Button>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="py-16 text-center text-muted-foreground">{t("جاري التحميل…", "Loading…")}</div>
          ) : activeTab === "history" ? (
            // v3.74.435 — unified history view across all approval flows
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                  <Clock className="w-4 h-4" />{t("سجل القرارات", "Decision History")}
                </h2>
                <Button size="sm" variant="outline" onClick={loadHistory} className="gap-1 text-xs">
                  <RefreshCw className="w-3.5 h-3.5" />{t("تحديث السجل", "Refresh history")}
                </Button>
              </div>
              {/* Category filter chips */}
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant={historyFilter === "all" ? "default" : "outline"} className="text-xs h-7" onClick={() => setHistoryFilter("all")}>
                  {t("الكل", "All")} ({history.length})
                </Button>
                <Button size="sm" variant={historyFilter === "discount" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("discount")}>
                  <Percent className="w-3 h-3" />{t("خصومات", "Discounts")} ({history.filter(h => h.category === "discount").length})
                </Button>
                <Button size="sm" variant={historyFilter === "bom_version" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("bom_version")}>
                  <Layers className="w-3 h-3" />{t("قوائم المواد", "BOMs")} ({history.filter(h => h.category === "bom_version").length})
                </Button>
                <Button size="sm" variant={historyFilter === "routing_version" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("routing_version")}>
                  <GitMerge className="w-3 h-3" />{t("مسارات التصنيع", "Routings")} ({history.filter(h => h.category === "routing_version").length})
                </Button>
                <Button size="sm" variant={historyFilter === "production_order" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("production_order")}>
                  <Factory className="w-3 h-3" />{t("أوامر الإنتاج", "Production Orders")} ({history.filter(h => h.category === "production_order").length})
                </Button>
                <Button size="sm" variant={historyFilter === "product_receive" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("product_receive")}>
                  <CheckCircle2 className="w-3 h-3" />{t("استلام إنتاج", "Product Receive")} ({history.filter(h => h.category === "product_receive").length})
                </Button>
                <Button size="sm" variant={historyFilter === "material_issue" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("material_issue")}>
                  <Package className="w-3 h-3" />{t("طلبات الصرف", "Material Issues")} ({history.filter(h => h.category === "material_issue").length})
                </Button>
              </div>
              {(() => {
                const filtered = historyFilter === "all" ? history : history.filter(h => h.category === historyFilter)
                if (filtered.length === 0) {
                  return (
                    <Card>
                      <CardContent className="py-16 text-center">
                        <Clock className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                        <p className="font-semibold text-lg">{t("لا توجد قرارات سابقة", "No past decisions")}</p>
                        <p className="text-muted-foreground text-sm mt-1">
                          {t("ستظهر هنا قرارات الاعتماد أو الرفض بعد اتخاذها", "Approved or rejected decisions will appear here")}
                        </p>
                      </CardContent>
                    </Card>
                  )
                }
                return filtered.map(h => <UnifiedHistoryCard key={h.id} h={h} ctx={{ appLang, t, fmtDate }} />)
              })()}
            </div>
          ) : totalPending === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                <p className="font-semibold text-lg">{t("لا توجد موافقات معلقة 🎉", "No pending approvals 🎉")}</p>
                <p className="text-muted-foreground text-sm mt-1">{t("كل الطلبات تمت معالجتها", "All requests have been processed")}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* BOM versions */}
              {(activeTab === "all" || activeTab === "bom") && bomVersions.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <Layers className="w-4 h-4" />{t("قوائم المواد (BOM Versions)", "BOM Versions")}
                  </h2>
                  {bomVersions.map(b => <BomCard key={b.id} b={b} />)}
                </div>
              )}

              {/* Routing versions */}
              {(activeTab === "all" || activeTab === "routing") && routingVersions.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <GitMerge className="w-4 h-4" />{t("مسارات التصنيع (Routing Versions)", "Routing Versions")}
                  </h2>
                  {routingVersions.map(r => <RoutingCard key={r.id} r={r} />)}
                </div>
              )}

              {/* Production orders */}
              {(activeTab === "all" || activeTab === "po") && productionOrders.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <Factory className="w-4 h-4" />{t("أوامر الإنتاج (Production Orders)", "Production Orders")}
                  </h2>
                  {productionOrders.map(p => <ProductionOrderCard key={p.id} p={p} />)}
                </div>
              )}

              {/* Material issue approvals */}
              {(activeTab === "all" || activeTab === "mi") && materialIssues.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <Package className="w-4 h-4" />{t("طلبات صرف المواد", "Material Issue Requests")}
                  </h2>
                  {materialIssues.map(m => <MaterialIssueCard key={m.id} m={m} />)}
                </div>
              )}

              {/* v3.74.373 — Discount approvals (Stage 2). */}
              {(activeTab === "all" || activeTab === "disc") && discountApprovals.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <Percent className="w-4 h-4" />{t("اعتمادات الخصم", "Discount Approvals")}
                  </h2>
                  {discountApprovals.map(d => <DiscountApprovalCard key={d.id} d={d} ctx={discountCardCtx} />)}
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

export default function ApprovalsPage() {
  return (
    <PageGuard resource="approvals">
      <ApprovalsContent />
    </PageGuard>
  )
}
