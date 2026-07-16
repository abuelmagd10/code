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
  Percent, Wallet,
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

// v3.74.472 — supplier payment approval. Loaded from the payments
// table with status='pending_approval'. Uses the existing
// /api/supplier-payments/[id]/approve endpoint for actions so the
// governance layer (SupplierPaymentCommandService + JE creation)
// stays intact.
// v3.74.521 — enriched with everything the owner needs to decide in the
// inbox without opening the payment page:
//   - payment_method + account_name (which cash/bank the money leaves)
//   - payment_date (actual, not the request timestamp)
//   - bill_outstanding (was the payment sized correctly?)
//   - base_amount + exchange_rate (FX visibility for non-EGP)
//   - notes + reference_number (context provided by the accountant)
//   - requester email (WHO asked for approval)
interface PendingSupplierPayment {
  id: string
  payment_no: string | null
  supplier_name: string | null
  amount: number
  currency: string
  bill_id: string | null
  bill_no: string | null
  branch_name: string | null
  warehouse_name: string | null
  requested_at: string
  requested_by_email: string | null
  // v3.74.521 — enrichment fields
  payment_date: string | null
  payment_method: string | null
  account_name: string | null
  account_currency: string | null
  bill_total: number | null
  bill_paid: number | null
  bill_outstanding: number | null
  // v3.74.579 — سياق الفاتورة الكامل للمعتمِد (إجمالى/مدفوع/مرتجع)
  bill_returned: number | null
  base_amount: number | null
  base_currency: string | null
  exchange_rate: number | null
  notes: string | null
  reference_number: string | null
  // v3.74.523 — allocations. Payments here don't set payments.bill_id
  // directly; they link through the payment_allocations table. A single
  // payment can be split across multiple bills, so we carry the primary
  // (largest / first) allocation on the card and a count for the rest.
  po_no: string | null
  allocation_count: number
  allocated_total: number | null
  // v3.74.527 — bill_outstanding was previously rendered next to the
  // payment currency label, which is wrong when the bill and the
  // payment are in different currencies. Carry the bill's own currency
  // (from bills.currency_code) so the outstanding line reads honestly.
  bill_currency: string | null
  type: "supplier_payment"
}

// v3.74.475 — sales return request (dual-stage: management + warehouse).
// Uses /api/sales-return-requests/[id]/{approve|reject|warehouse-approve|
// warehouse-reject}.
interface PendingSalesReturnRequest {
  id: string
  customer_name: string | null
  invoice_no: string | null
  total: number
  status: string   // 'pending_approval_level_1' or 'pending_warehouse_approval'
  branch_name: string | null
  warehouse_name: string | null
  requested_at: string
  stage: "level_1" | "warehouse"
  type: "sales_return_request"
}

// v3.74.476 — customer refund request. Two-phase workflow:
// approve → execute. This tab surfaces both phases; the card renders
// stage-aware buttons (Approve for 'pending', Execute for 'approved').
// v3.74.528 — enriched to match the supplier-payment card story:
// currency + FX equivalent + method + refund account + requester email
// + rejection reason banner. All fields already live in
// customer_refund_requests; the loader was under-reading them.
interface PendingCustomerRefund {
  id: string
  customer_name: string | null
  invoice_no: string | null
  amount: number
  status: string      // 'pending' | 'approved'
  notes: string | null
  requested_at: string
  requested_by: string | null
  approved_by: string | null
  // v3.74.528 — enrichment
  currency: string
  base_amount: number | null
  exchange_rate: number | null
  refund_method: string | null
  refund_account_name: string | null
  requested_by_email: string | null
  rejection_reason: string | null
  // v3.74.540 — proposed changes stored in customer_refund_requests.metadata
  // → proposed_changes when the row is a correction-of-payment request.
  proposed_amount: number | null
  proposed_currency: string | null
  proposed_account_name: string | null
  proposed_method: string | null
  proposed_date: string | null
  proposed_reference: string | null
  type: "customer_refund"
}

// v3.74.479 — inventory write-off pending approval. The approve
// endpoint takes complex parameters (expense + inventory accounts),
// so this tab surfaces the pending item as a read-only card with a
// "Approve on details page" link.
interface PendingWriteOff {
  id: string
  write_off_no: string | null
  total_cost: number
  reason: string | null
  branch_name: string | null
  warehouse_name: string | null
  requested_at: string
  type: "write_off"
}

// v3.74.488 — manufacturing product receive pending approval.
// Reads manufacturing_product_receive_approvals (status='pending').
// Actions call
// /api/manufacturing/product-receive-approvals/[id]/{approve,reject}.
interface PendingProductReceive {
  id: string
  order_no: string | null
  product_name: string | null
  proposed_quantity: number
  branch_name: string | null
  warehouse_name: string | null
  requested_at: string
  type: "product_receive_pending"
}

// v3.74.480 — generic misc pending approval item. Used for the
// remaining categories whose actions require dedicated pages
// (purchase requests, bank vouchers, expenses, customer debit notes,
// permission transfers). One shape covers all: doc_no + party + amount
// + branch/warehouse + link to the dedicated page for actioning.
interface PendingMiscApproval {
  id: string
  kind: "purchase_request" | "bank_voucher" | "expense" | "customer_debit_note" | "permission_transfer"
  doc_no: string | null
  party_or_label: string | null
  amount: number
  branch_name: string | null
  warehouse_name: string | null
  href: string
  requested_at: string
  // v3.74.579 — اسم طالب الاعتماد (يُحل عبر /api/members-emails فقط حيث
  // يحمل الاستعلام حقل مستخدم أصلاً — نقل الصلاحيات transferred_by حالياً)
  requested_by_label?: string | null
  type: "misc_approval"
}

// v3.74.479 — inventory transfer pending approval. The workflow has
// three stages (source manager approve → in-transit → destination
// manager receive). Each stage lives on the transfer's own page.
interface PendingInventoryTransfer {
  id: string
  transfer_no: string | null
  status: string
  from_warehouse: string | null
  to_warehouse: string | null
  requested_at: string
  type: "inventory_transfer"
}

// v3.74.478 — goods receipt approval for purchase bills. Warehouse
// stage: bills.receipt_status='pending' after the bill was submitted
// for receipt. Uses /api/bills/[id]/{confirm-receipt, reject-receipt}.
// v3.74.483 — added bill_items so the warehouse manager can review
// products + quantities inline before confirming.
interface PendingGoodsReceipt {
  id: string
  bill_no: string | null
  supplier_name: string | null
  total: number
  branch_name: string | null
  warehouse_name: string | null
  requested_at: string
  items: Array<{
    product_name: string
    product_type: string | null
    quantity: number
    unit_price: number
  }>
  type: "goods_receipt"
}

// v3.74.477 — dispatch approval for sales invoices. Warehouse Stage 2:
// invoice.warehouse_status='pending' after the invoice was sent.
// Uses /api/invoices/[id]/{warehouse-approve, warehouse-reject}.
// v3.74.491 — attach shipping_provider so cards can offer the
// approve-with-shipping button when the provider is API-integrated
// (bosta / aramex with auth_type set), matching the dispatch page.
interface PendingDispatch {
  id: string
  invoice_no: string | null
  customer_name: string | null
  total: number
  branch_name: string | null
  warehouse_name: string | null
  requested_at: string
  shipping_provider_name: string | null
  shipping_provider_code: string | null
  shipping_provider_has_api: boolean
  type: "dispatch"
}

// v3.74.680 — booking stock withdrawal awaiting the branch store manager's
// approval (same "issue from warehouse" family as dispatch, its own tab).
interface PendingBookingWithdrawal {
  id: string
  booking_id: string
  booking_no: string | null
  product_name: string | null
  quantity: number
  branch_name: string | null
  warehouse_name: string | null
  reason: string | null
  requested_at: string
  type: "booking_stock_withdrawal"
}

// v3.74.476 — vendor payment correction request. Same two-phase
// pattern as customer refund.
// v3.74.528 — enrichment: vendor_payment_correction_requests itself
// carries only amount+status+notes+rejection_reason. Currency and FX
// context live on the ORIGINAL payment (original_payment_id); the
// loader now joins that in.
interface PendingVendorPaymentCorrection {
  id: string
  supplier_name: string | null
  bill_no: string | null
  amount: number
  status: string      // 'pending' | 'approved'
  notes: string | null
  requested_at: string
  requested_by: string | null
  approved_by: string | null
  // v3.74.528 — enrichment (currency + FX from original payment,
  // requester email, rejection reason)
  currency: string
  base_amount: number | null
  exchange_rate: number | null
  requested_by_email: string | null
  rejection_reason: string | null
  // v3.74.539 — proposed changes so the owner sees exactly what the
  // accountant wants to change. Metadata.proposed_changes is a small
  // JSON blob of just the diffed keys, not the full new payment.
  proposed_amount: number | null
  proposed_currency: string | null
  proposed_account_name: string | null
  proposed_method: string | null
  proposed_date: string | null
  proposed_reference: string | null
  type: "vendor_payment_correction"
}

// v3.74.473 — purchase return approval. Uses the existing
// /api/purchase-returns/[id]/approve endpoint so
// PurchaseReturnCommandService and its atomic RPC preserve full
// governance (role check, warehouse gate, JE creation).
interface PendingPurchaseReturn {
  id: string
  return_no: string | null
  supplier_name: string | null
  bill_id: string | null
  bill_no: string | null
  total: number
  // v3.74.513 — لنطاق الفرع/المخزن لأدوار المخازن
  branch_id: string | null
  warehouse_id: string | null
  branch_name: string | null
  warehouse_name: string | null
  requested_at: string
  workflow_status: string | null
  // v3.74.579 — بيانات توضيحية للمستخدم: البنود + المنفذ + طريقة التسوية
  currency: string
  requested_by_label: string | null
  detail_lines: string[]
  settlement_method: string | null
  refund_account_name: string | null
  reason: string | null
  type: "purchase_return"
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
  | PendingSupplierPayment
  | PendingPurchaseReturn
  | PendingSalesReturnRequest
  | PendingCustomerRefund
  | PendingVendorPaymentCorrection
  | PendingDispatch
  | PendingGoodsReceipt
  | PendingWriteOff
  | PendingInventoryTransfer
  | PendingMiscApproval
  | PendingProductReceive

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
  /** v3.74.509 — أزرار القرار تظهر لمن يملك حق القرار فقط (الخادم كان يحمى أصلاً) */
  canDecide: boolean
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
          runningId, handleApprove, handleReject, canDecide } = ctx
  // v3.74.520 — عملة الشركة الأساسية بدل تثبيت الجنيه
  const baseCcy = (() => { try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' } })()
  const ccyLbl = baseCcy === 'EGP' ? t("ج.م", "EGP") : baseCcy
  const discountLabel = d.discount_type === "percent"
    ? `${fmtMoney(d.discount_value)}%`
    : `${fmtMoney(d.discount_value)} ${ccyLbl}`
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
                  <> · 💰 {t("إجمالى", "Total")}: {fmtMoney(d.document_total)} {ccyLbl}</>
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
        {canDecide && (
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
        )}
        {canDecide && rejectId === d.id && (
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
type HistoryCategory = "discount" | "bom_version" | "material_issue" | "routing_version" | "production_order" | "product_receive" | "supplier_payment" | "purchase_return" | "sales_return_request" | "customer_refund" | "vendor_payment_correction" | "dispatch" | "goods_receipt" | "write_off" | "inventory_transfer" | "booking_stock_withdrawal" | "misc"

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
  // v3.74.489 — branch + warehouse of the source document so the
  // history can be filtered (owner/GM widen or narrow; other roles
  // are locked to their own scope by RLS on the underlying tables).
  branch_id?: string | null
  warehouse_id?: string | null
  // v3.74.471 — full snapshot data so history can render the same
  // diff card the owner saw when approving.
  raw_current?: PendingDiscountApproval | null
  raw_prior?: NonNullable<PendingDiscountApproval["prior_approval"]> | null
  // v3.74.511 — معرفات المنفذين تُحل إلى إيميلات دفعة واحدة عبر
  // /api/members-emails بعد تجميع السجل (كانت "—" فى كل الأقسام عدا الخصومات)
  requested_by_id?: string | null
  decided_by_id?: string | null
  // v3.74.512 — سطور تفصيلية للمستند (بنود المرتجع مثلاً) على غرار
  // التفصيل المتاح فى سجل الخصومات
  detail_lines?: string[] | null
}

type UnifiedHistoryCtx = {
  appLang: "ar" | "en"
  t: (ar: string, en: string) => string
  fmtDate: (s: string) => string
  // v3.74.471 — used by the embedded AmendmentDiffCard on history rows
  fmtMoney: (n: number) => string
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
    h.category === "supplier_payment" ? t("دفعة مورد", "Supplier Payment") :
    h.category === "purchase_return"  ? t("مرتجع مشتريات", "Purchase Return") :
    h.category === "sales_return_request" ? t("مرتجع مبيعات", "Sales Return") :
    h.category === "customer_refund" ? t("استرداد عميل", "Customer Refund") :
    h.category === "vendor_payment_correction" ? t("تصحيح دفعة مورد", "Vendor Correction") :
    h.category === "dispatch" ? t("موافقة إرسال", "Dispatch") :
    h.category === "goods_receipt" ? t("استلام مخزنى", "Goods Receipt") :
    h.category === "write_off" ? t("إهلاك", "Write-off") :
    h.category === "inventory_transfer" ? t("تحويل مخزون", "Inv. Transfer") :
    h.category === "misc" ? t("طلب متنوع", "Misc") :
    h.category === "product_receive"  ? t("استلام منتج", "Product Receive") :
                                         h.category
  const CategoryIcon =
    h.category === "discount"         ? Percent :
    h.category === "bom_version"      ? Layers :
    h.category === "routing_version"  ? GitMerge :
    h.category === "production_order" ? Factory :
    h.category === "product_receive"  ? CheckCircle2 :
    h.category === "supplier_payment" ? Wallet :
    h.category === "purchase_return"  ? RefreshCw :
    h.category === "sales_return_request" ? RefreshCw :
    h.category === "customer_refund" ? Wallet :
    h.category === "vendor_payment_correction" ? Wallet :
    h.category === "dispatch" ? Package :
    h.category === "goods_receipt" ? Package :
    h.category === "write_off" ? XCircle :
    h.category === "inventory_transfer" ? GitMerge :
    h.category === "misc" ? AlertCircle :
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
              {/* v3.74.512 — سطور تفصيل المستند (بنود المرتجع...) */}
              {h.detail_lines && h.detail_lines.length > 0 && (
                <div className="mt-1 p-2 rounded bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    📦 {t("البنود", "Items")} ({h.detail_lines.length})
                  </p>
                  <ul className="text-xs ms-4 list-disc text-muted-foreground mt-0.5">
                    {h.detail_lines.map((l, i) => (<li key={i}>{l}</li>))}
                  </ul>
                </div>
              )}
              {/* v3.74.471 — same DiffCard as the pending inbox, so
                  the owner sees the full "before/after" they approved.
                  Renders only for amendment entries that have snapshots. */}
              {h.is_amendment && h.raw_current && h.raw_prior && (
                <AmendmentDiffCard
                  current={h.raw_current}
                  prior={h.raw_prior}
                  ctx={{
                    appLang: ctx.appLang,
                    t: ctx.t,
                    fmtMoney: ctx.fmtMoney,
                    fmtDate: ctx.fmtDate,
                    docTypeLabel: () => "",
                    docHref: () => "",
                    rejectId: null,
                    rejectReason: "",
                    setRejectReason: () => {},
                    setRejectId: () => {},
                    setRejectType: () => {},
                    runningId: null,
                    handleApprove: () => {},
                    handleReject: () => {},
                  } as any}
                />
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
  const [supplierPayments, setSupplierPayments] = useState<PendingSupplierPayment[]>([])
  const [purchaseReturns, setPurchaseReturns] = useState<PendingPurchaseReturn[]>([])
  const [salesReturnRequests, setSalesReturnRequests] = useState<PendingSalesReturnRequest[]>([])
  const [customerRefunds, setCustomerRefunds] = useState<PendingCustomerRefund[]>([])
  const [vendorPaymentCorrections, setVendorPaymentCorrections] = useState<PendingVendorPaymentCorrection[]>([])
  const [dispatches, setDispatches] = useState<PendingDispatch[]>([])
  const [goodsReceipts, setGoodsReceipts] = useState<PendingGoodsReceipt[]>([])
  // v3.74.483 — tracks which goods-receipt card has its items panel expanded.
  const [receiptExpandedId, setReceiptExpandedId] = useState<string | null>(null)
  // v3.74.485 — user's own role so the UI can hide the approve button for
  // roles that server-side will refuse (manager, accountant, purchasing_officer).
  // v3.74.489 — also store branch/warehouse so we can lock the history
  // filter to the user's scope when they are not owner/admin/GM.
  const [myRole, setMyRole] = useState<string | null>(null)
  // v3.74.543 — track own user id so the correction card can show
  // the "تنفيذ" button to the original requester (SoD: the executor
  // must not be the approver, so we allow the requester too).
  const [myUserId, setMyUserId] = useState<string | null>(null)
  const [myBranchId, setMyBranchId] = useState<string | null>(null)
  const [myWarehouseId, setMyWarehouseId] = useState<string | null>(null)
  // Branch + warehouse master lists for the history filter dropdowns.
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([])
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string; branch_id: string | null }>>([])
  // Currently-selected filter values on the history tab.
  const [historyBranchFilter, setHistoryBranchFilter] = useState<string>("all")
  const [historyWarehouseFilter, setHistoryWarehouseFilter] = useState<string>("all")
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      // v3.74.543 — remember own user id for SoD gates
      setMyUserId(user.id)
      const cid = document.cookie.split(";").find(c => c.trim().startsWith("active_company_id="))?.split("=")[1] || ""
      if (!cid) return
      const { data: member } = await supabase
        .from("company_members")
        .select("role, branch_id, warehouse_id")
        .eq("company_id", cid).eq("user_id", user.id).maybeSingle()
      const m: any = member
      setMyRole(m?.role ?? null)
      setMyBranchId(m?.branch_id ?? null)
      setMyWarehouseId(m?.warehouse_id ?? null)
      // Load master lists (branches + warehouses).
      const [{ data: brs }, { data: whs }] = await Promise.all([
        supabase.from("branches").select("id, name").eq("company_id", cid).order("name"),
        supabase.from("warehouses").select("id, name, branch_id").eq("company_id", cid).order("name"),
      ])
      setBranches((brs || []) as any[])
      setWarehouses((whs || []) as any[])
    })()
  }, [supabase])
  // The four canonical "receipt approvers" per owner spec:
  const canApproveReceipt = myRole !== null && ["owner","admin","general_manager","store_manager"].includes(myRole)
  // v3.74.680 — who may decide a booking stock withdrawal (mirrors the RPC
  // decide_booking_stock_withdrawal: management + branch store/warehouse manager).
  const canDecideWithdrawal = myRole !== null && ["owner","admin","general_manager","store_manager","warehouse_manager"].includes(myRole)

  // v3.74.486 — Role-scoped tab visibility. Each role only sees the
  // tabs relevant to the workflows they participate in. Owner / admin /
  // general_manager see everything.
  type TabKey = "bom"|"routing"|"po"|"mi"|"pr"|"disc"|"pay"|"pret"|"sret"|"cref"|"vcor"|"disp"|"recv"|"wo"|"tr"|"bwd"|"misc"
  const roleTabs: Record<string, ReadonlyArray<TabKey>> = {
    // Warehouse: dispatch, receipt, write-offs, transfers, sales-return
    // warehouse stage, AND pending mfg product receive (v3.74.488).
    // v3.74.513 — "pret" مضافة: مرحلة إخراج مرتجعات المشتريات من المخزن
    // منوطة بمسؤول المخزن (تأكيد الإخراج) + يرى سجلها
    store_manager:      ["recv","disp","bwd","wo","tr","sret","pr","pret"],
    warehouse_manager:  ["recv","disp","bwd","wo","tr","sret","pr","pret"],
    // Accountant: payments, purchase returns, discounts, sales returns, refunds, corrections, misc
    accountant:         ["pay","pret","disc","sret","cref","vcor","misc"],
    // Purchasing officer: purchase returns, discounts (PO-related), misc (purchase requests)
    purchasing_officer: ["pret","disc","misc"],
    // Manufacturing officer: BOM/routing/production/material issue/product receive
    manufacturing_officer: ["bom","routing","po","mi","pr"],
    // Branch manager: broad view but read-only most places (visibility only)
    manager:            ["disc","pay","pret","sret","cref","vcor","disp","recv","bwd","wo","tr","misc","pr"],
    // Sales staff & bookings: no approvals to act on today
    staff:              [],
    booking_officer:    [],
  }
  const isAdminLike = !!myRole && ["owner","admin","general_manager"].includes(myRole)
  // v3.74.509 — قرارات محصورة بالمالك/المدير العام فقط (دفعات الموردين،
  // استرداد العملاء، تصحيحات دفعات الموردين) مطابقة لبوابات الخادم
  const isOwnerOrGm = !!myRole && ["owner","general_manager"].includes(myRole)
  const visibleTabs: ReadonlyArray<TabKey> =
    isAdminLike || !myRole
      ? (["bom","routing","po","mi","pr","disc","pay","pret","sret","cref","vcor","disp","recv","bwd","wo","tr","misc"] as const)
      : (roleTabs[myRole] ?? [])
  const canShow = (t: TabKey) => visibleTabs.includes(t)
  // v3.74.487 — Mirror the tab visibility onto the history filter row.
  // Each HistoryCategory maps to a TabKey (many-to-one for the
  // manufacturing subcategories that share a single tab).
  const historyCategoryToTab: Partial<Record<HistoryCategory, TabKey>> = {
    discount: "disc",
    bom_version: "bom",
    routing_version: "routing",
    production_order: "po",
    material_issue: "mi",
    product_receive: "pr",              // v3.74.488 own tab
    supplier_payment: "pay",
    purchase_return: "pret",
    sales_return_request: "sret",
    customer_refund: "cref",
    vendor_payment_correction: "vcor",
    dispatch: "disp",
    goods_receipt: "recv",
    write_off: "wo",
    inventory_transfer: "tr",
    booking_stock_withdrawal: "bwd",
    misc: "misc",
  }
  const canShowHistory = (c: HistoryCategory) => {
    const tabKey = historyCategoryToTab[c]
    return tabKey ? canShow(tabKey) : false
  }
  // v3.74.486 — staff / booking_officer have no approval workflows at
  // all. The sidebar link is hidden for them (their default pages
  // template excludes 'approvals'), but if they navigate here directly
  // we show a friendly "no access" message instead of an empty tab bar.
  const hasNoApprovalRole = !!myRole && ["staff","booking_officer"].includes(myRole)
  const [writeOffs, setWriteOffs] = useState<PendingWriteOff[]>([])
  const [inventoryTransfers, setInventoryTransfers] = useState<PendingInventoryTransfer[]>([])
  const [miscApprovals, setMiscApprovals] = useState<PendingMiscApproval[]>([])
  const [productReceivePending, setProductReceivePending] = useState<PendingProductReceive[]>([])
  // v3.74.680 — pending booking stock withdrawals (bwd tab).
  const [bookingWithdrawals, setBookingWithdrawals] = useState<PendingBookingWithdrawal[]>([])
  // v3.74.434 → v3.74.435 — unified history feed for all approval flows.
  const [activeTab, setActiveTab] = useState<"all" | "bom" | "routing" | "po" | "mi" | "pr" | "disc" | "pay" | "pret" | "sret" | "cref" | "vcor" | "disp" | "recv" | "wo" | "tr" | "bwd" | "misc" | "history">("all")
  // v3.74.484 — honor ?tab=... from notification routing so warehouse
  // manager clicking a dispatch/receipt notification lands on the
  // matching tab.
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const initialTab = params.get("tab")
    const valid = ["all","bom","routing","po","mi","pr","disc","pay","pret","sret","cref","vcor","disp","recv","bwd","wo","tr","misc","history"] as const
    if (initialTab && (valid as readonly string[]).includes(initialTab)) {
      setActiveTab(initialTab as any)
    }
  }, [])
  const [history, setHistory] = useState<UnifiedHistoryEntry[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<HistoryCategory | "all">("all")
  const [runningId, setRunningId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectType, setRejectType] = useState<"bom_version" | "routing_version" | "production_order" | "material_issue" | "discount_approval" | "supplier_payment" | "purchase_return" | "sales_return_request" | "customer_refund" | "vendor_payment_correction" | "dispatch" | "goods_receipt" | "product_receive" | "booking_stock_withdrawal" | null>(null)
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

      // v3.74.491 — Material issue approvals now include BOTH stages:
      //   Stage 1 (management approval) : status='pending'
      //   Stage 2 (warehouse dispatch)   : status='management_approved'
      // The dispatch-approvals page carried Stage 2 separately; folding it
      // into this tab means warehouse staff can finish the dispatch from
      // the inbox after management approves.
      const { data: mis } = await supabase
        .from("manufacturing_material_issue_approvals")
        .select(`
          id, status, requested_at,
          manufacturing_production_orders!inner(order_no, products!inner(name)),
          branches(name),
          warehouses(name)
        `)
        .eq("company_id", cid)
        .in("status", ["pending", "management_approved"])
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

      // v3.74.488 — Manufacturing product receive pending approvals.
      // Loader mirrors the material-issue pattern. Governance:
      // /api/manufacturing/product-receive-approvals/[id]/approve|reject
      // enforces the same role + scope checks the goods-receipt page
      // used before consolidation.
      try {
        const { data: prs } = await supabase
          .from("manufacturing_product_receive_approvals")
          .select(`
            id, status, requested_at, proposed_quantity, branch_id, warehouse_id,
            manufacturing_production_orders(order_no, products(name)),
            branches(name),
            warehouses(name)
          `)
          .eq("company_id", cid)
          .eq("status", "pending")
          .order("requested_at", { ascending: true })
          .limit(50)
        setProductReceivePending((prs || []).map((r: any) => ({
          id: r.id,
          order_no: r.manufacturing_production_orders?.order_no ?? null,
          product_name: r.manufacturing_production_orders?.products?.name ?? null,
          proposed_quantity: Number(r.proposed_quantity || 0),
          branch_name: r.branches?.name ?? null,
          warehouse_name: r.warehouses?.name ?? null,
          requested_at: r.requested_at,
          type: "product_receive_pending" as const,
        })))
      } catch {
        setProductReceivePending([])
      }

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

      // v3.74.472 — supplier payments awaiting owner/GM approval.
      // Direct table read (no dedicated inbox API yet). The RPC
      // approve_supplier_payment_atomic behind /api/supplier-payments/[id]/approve
      // enforces role + branch checks on decision, so read-side RLS
      // is sufficient here.
      try {
        const { data: pays } = await supabase
          .from("payments")
          .select(`
            id, reference_number, amount, currency_code, original_currency,
            base_currency_amount, exchange_rate,
            payment_date, payment_method, notes,
            created_at, created_by, created_by_user_id,
            supplier_id, branch_id, warehouse_id, bill_id, account_id,
            branches(name),
            warehouses(name)
          `)
          .eq("company_id", cid)
          .eq("status", "pending_approval")
          .not("supplier_id", "is", null)
          .order("created_at", { ascending: true })
          .limit(100)

        const payIds = (pays || []).map((p: any) => p.id)
        const paySupplierIds = Array.from(new Set((pays || []).map((p: any) => p.supplier_id).filter(Boolean)))
        const payAccountIds = Array.from(new Set((pays || []).map((p: any) => p.account_id).filter(Boolean)))
        const payUserIds = Array.from(new Set((pays || [])
          .map((p: any) => p.created_by_user_id || p.created_by)
          .filter(Boolean)))

        // v3.74.523 — bill link isn't on payments.bill_id (that column
        // stays NULL for allocated payments). It's in payment_allocations
        // keyed by payment_id. We batch-fetch the allocations first, then
        // fold the resulting bill_ids into the bills batch so a single
        // payment allocated to N bills doesn't require N round-trips.
        const allocsRes = payIds.length
          ? await supabase.from("payment_allocations")
              .select("payment_id, bill_id, invoice_id, allocated_amount")
              .in("payment_id", payIds)
          : { data: [] as any[] }
        const allocations = ((allocsRes.data || []) as any[])
        const allocsByPayment = new Map<string, any[]>()
        for (const a of allocations) {
          if (!allocsByPayment.has(a.payment_id)) allocsByPayment.set(a.payment_id, [])
          allocsByPayment.get(a.payment_id)!.push(a)
        }
        const allocBillIds = Array.from(new Set(allocations.map(a => a.bill_id).filter(Boolean)))

        // v3.74.503/521 — payments has NO FK to suppliers/bills, so
        // PostgREST embeds fail with 400. Batch-fetch in a second pass.
        // v3.74.523 — payBillIds now comes from allocations, not from the
        // (always-null) payments.bill_id.
        const [paySupsRes, payBillsRes, payAcctsRes, payUsersRes] = await Promise.all([
          paySupplierIds.length
            ? supabase.from("suppliers").select("id, name").in("id", paySupplierIds)
            : Promise.resolve({ data: [] as any[] }),
          allocBillIds.length
            ? supabase.from("bills")
                .select("id, bill_number, total_amount, paid_amount, returned_amount, currency_code, purchase_order_id")
                .in("id", allocBillIds)
            : Promise.resolve({ data: [] as any[] }),
          // v3.74.522 — chart_of_accounts uses `original_currency`, NOT
          // `currency_code`. The previous select failed silently and the
          // whole column mapping came back empty, so the card never showed
          // the source account name.
          payAccountIds.length
            ? supabase.from("chart_of_accounts").select("id, account_name, original_currency").in("id", payAccountIds)
            : Promise.resolve({ data: [] as any[] }),
          // v3.74.522 — user emails live in `company_members` (keyed by
          // user_id), not `user_profiles` (which has no email column).
          // Scope to the current company for RLS friendliness.
          payUserIds.length
            ? supabase.from("company_members").select("user_id, email").eq("company_id", cid).in("user_id", payUserIds)
            : Promise.resolve({ data: [] as any[] }),
        ])
        const paySupMap = new Map(((paySupsRes.data || []) as any[]).map((s: any) => [s.id, s.name]))
        const payBillMap = new Map(((payBillsRes.data || []) as any[]).map((b: any) => [b.id, b]))
        const payAcctMap = new Map(((payAcctsRes.data || []) as any[]).map((a: any) => [a.id, a]))
        const payUserMap = new Map(((payUsersRes.data || []) as any[]).map((u: any) => [u.user_id, u.email]))
        // v3.74.579 — الاسم أولاً (موظف مرتبط/اسم الحساب) والإيميل fallback،
        // بنفس نمط سجل القرارات v3.74.512.
        if (payUserIds.length) {
          try {
            const res = await fetch("/api/members-emails", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userIds: payUserIds, companyId: cid }),
            })
            if (res.ok) {
              const j = await res.json().catch(() => ({}))
              for (const uid of payUserIds as string[]) {
                const label = (j?.names || {})[uid] || (j?.map || {})[uid]
                if (label) payUserMap.set(uid, label)
              }
            }
          } catch { /* best-effort */ }
        }

        // v3.74.523 — resolve PO numbers for the bills that carry one.
        // Same round-trip pattern (no FK embed).
        const payPoIds = Array.from(new Set(((payBillsRes.data || []) as any[])
          .map((b: any) => b.purchase_order_id)
          .filter(Boolean)))
        const payPosRes = payPoIds.length
          ? await supabase.from("purchase_orders").select("id, po_number").in("id", payPoIds)
          : { data: [] as any[] }
        const payPoMap = new Map(((payPosRes.data || []) as any[]).map((po: any) => [po.id, po.po_number]))

        setSupplierPayments((pays || []).map((p: any) => {
          const acctRow = p.account_id ? payAcctMap.get(p.account_id) : null
          const allocs = allocsByPayment.get(p.id) || []
          // Pick the primary bill = the allocation with the largest amount.
          // For the common 1-allocation case this is just that allocation.
          const primaryAlloc = allocs.length
            ? allocs.slice().sort((a: any, b: any) => Number(b.allocated_amount || 0) - Number(a.allocated_amount || 0))[0]
            : null
          const primaryBill = primaryAlloc?.bill_id ? payBillMap.get(primaryAlloc.bill_id) : null
          const primaryPoNo = primaryBill?.purchase_order_id ? payPoMap.get(primaryBill.purchase_order_id) : null
          const billTotal = primaryBill ? Number(primaryBill.total_amount || 0) : null
          const billPaid = primaryBill ? Number(primaryBill.paid_amount || 0) : null
          const allocatedTotal = allocs.length
            ? Number(allocs.reduce((s: number, a: any) => s + Number(a.allocated_amount || 0), 0).toFixed(4))
            : null
          return {
            id: p.id,
            payment_no: p.reference_number ?? null,
            supplier_name: paySupMap.get(p.supplier_id) ?? null,
            amount: Number(p.amount || 0),
            currency: String(p.original_currency || p.currency_code || "EGP"),
            bill_id: primaryAlloc?.bill_id ?? null,
            bill_no: primaryBill?.bill_number ?? null,
            branch_name: p.branches?.name ?? null,
            warehouse_name: p.warehouses?.name ?? null,
            requested_at: p.created_at,
            requested_by_email: payUserMap.get(p.created_by_user_id || p.created_by) ?? null,
            payment_date: p.payment_date ?? null,
            payment_method: p.payment_method ?? null,
            account_name: acctRow?.account_name ?? null,
            account_currency: acctRow?.original_currency ?? null,
            bill_total: billTotal,
            bill_paid: billPaid,
            bill_returned: primaryBill?.returned_amount != null ? Number(primaryBill.returned_amount) : null,
            // v3.74.529 — outstanding must subtract returned_amount too,
            // otherwise the card contradicts the bill view page (which
            // was fixed in v3.74.527 to do the same subtraction). For
            // BILL-0001: 7.34 - 0.00 - 1.03 = 6.31 EGP.
            bill_outstanding: billTotal != null && billPaid != null
              ? Number((billTotal - billPaid - Number(primaryBill?.returned_amount || 0)).toFixed(2))
              : null,
            // v3.74.527 — bill currency for the outstanding label. Defaults
            // to base (EGP) when the bill row didn't stamp a currency.
            bill_currency: primaryBill?.currency_code ? String(primaryBill.currency_code) : null,
            base_amount: p.base_currency_amount != null ? Number(p.base_currency_amount) : null,
            base_currency: "EGP",
            exchange_rate: p.exchange_rate != null ? Number(p.exchange_rate) : null,
            notes: p.notes ?? null,
            reference_number: p.reference_number ?? null,
            po_no: primaryPoNo ?? null,
            allocation_count: allocs.length,
            allocated_total: allocatedTotal,
            type: "supplier_payment" as const,
          }
        }))
      } catch {
        setSupplierPayments([])
      }

      // v3.74.473 — purchase returns awaiting admin approval.
      // Governance: /api/purchase-returns/[id]/approve runs
      // PurchaseReturnCommandService → approve_purchase_return_atomic
      // (role check + JE creation on approve).
      try {
        const { data: prs } = await supabase
          .from("purchase_returns")
          .select(`
            id, return_number, total_amount, status, workflow_status,
            created_at, created_by,
            settlement_method, refund_account_id, reason, original_currency,
            supplier_id, branch_id, warehouse_id, bill_id,
            suppliers(name),
            branches(name),
            warehouses(name),
            bills(bill_number)
          `)
          .eq("company_id", cid)
          // v3.74.513 — تشمل مرحلة إخراج المخزن حتى تظهر فى صندوق مسؤول المخزن
          .in("workflow_status", ["pending_admin_approval", "pending_approval", "pending_warehouse"])
          .order("created_at", { ascending: true })
          .limit(100)

        // v3.74.579 — بيانات توضيحية: بنود المرتجع (نفس نمط السجل v3.74.512)
        // + حساب الاسترداد + اسم المنفذ بدل الإيميل.
        const qPretIds = (prs || []).map((r: any) => r.id)
        const qPretItemsMap = new Map<string, string[]>()
        if (qPretIds.length > 0) {
          try {
            const { data: qPretItems } = await supabase
              .from("purchase_return_items")
              .select("purchase_return_id, description, quantity, unit_price, line_total, products(name)")
              .in("purchase_return_id", qPretIds)
            for (const it of (qPretItems || []) as any[]) {
              const name = it.products?.name ?? it.description ?? "?"
              const line = `${name} · ${Number(it.quantity)} × ${Number(it.unit_price).toFixed(2)} = ${Number(it.line_total).toFixed(2)}`
              const arr = qPretItemsMap.get(it.purchase_return_id) || []
              arr.push(line)
              qPretItemsMap.set(it.purchase_return_id, arr)
            }
          } catch { /* items are best-effort */ }
        }
        const qPretAcctIds = Array.from(new Set((prs || []).map((r: any) => r.refund_account_id).filter(Boolean)))
        const qPretAcctMap = new Map<string, string>()
        if (qPretAcctIds.length > 0) {
          try {
            const { data: accts } = await supabase
              .from("chart_of_accounts").select("id, account_name").in("id", qPretAcctIds)
            for (const a of (accts || []) as any[]) qPretAcctMap.set(a.id, a.account_name)
          } catch { /* best-effort */ }
        }
        const qPretUserIds = Array.from(new Set((prs || []).map((r: any) => r.created_by).filter(Boolean)))
        const qPretUserMap = new Map<string, string>()
        if (qPretUserIds.length > 0) {
          try {
            const res = await fetch("/api/members-emails", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userIds: qPretUserIds, companyId: cid }),
            })
            if (res.ok) {
              const j = await res.json().catch(() => ({}))
              for (const id of qPretUserIds as string[]) {
                const label = (j?.names || {})[id] || (j?.map || {})[id]
                if (label) qPretUserMap.set(id, label)
              }
            }
          } catch { /* best-effort */ }
        }
        setPurchaseReturns((prs || []).map((r: any) => ({
          id: r.id,
          return_no: r.return_number ?? null,
          supplier_name: r.suppliers?.name ?? null,
          bill_id: r.bill_id ?? null,
          bill_no: r.bills?.bill_number ?? null,
          total: Number(r.total_amount || 0),
          branch_id: r.branch_id ?? null,
          warehouse_id: r.warehouse_id ?? null,
          branch_name: r.branches?.name ?? null,
          warehouse_name: r.warehouses?.name ?? null,
          requested_at: r.created_at,
          workflow_status: r.workflow_status ?? null,
          currency: String(r.original_currency || "EGP"),
          requested_by_label: r.created_by ? (qPretUserMap.get(r.created_by) ?? null) : null,
          detail_lines: qPretItemsMap.get(r.id) || [],
          settlement_method: r.settlement_method ?? null,
          refund_account_name: r.refund_account_id ? (qPretAcctMap.get(r.refund_account_id) ?? null) : null,
          reason: r.reason ?? null,
          type: "purchase_return" as const,
        })))
      } catch {
        setPurchaseReturns([])
      }

      // v3.74.475 — sales return requests (dual-stage: management +
      // warehouse). Governance: /api/sales-return-requests/[id]/*
      // enforces role + branch/warehouse gate.
      try {
        const { data: srs } = await supabase
          .from("sales_return_requests")
          .select(`
            id, status, total_return_amount, created_at,
            invoice_id, customer_id, branch_id, warehouse_id,
            customers(name),
            invoices(invoice_number),
            branches(name),
            warehouses(name)
          `)
          .eq("company_id", cid)
          .in("status", ["pending", "pending_approval_level_1", "pending_warehouse_approval"])
          .order("created_at", { ascending: true })
          .limit(100)
        setSalesReturnRequests((srs || []).map((s: any) => ({
          id: s.id,
          customer_name: s.customers?.name ?? null,
          invoice_no: s.invoices?.invoice_number ?? null,
          total: Number(s.total_return_amount || 0),
          status: s.status,
          branch_name: s.branches?.name ?? null,
          warehouse_name: s.warehouses?.name ?? null,
          requested_at: s.created_at,
          stage: s.status === "pending_warehouse_approval" ? ("warehouse" as const) : ("level_1" as const),
          type: "sales_return_request" as const,
        })))
      } catch {
        setSalesReturnRequests([])
      }

      // v3.74.476 — customer refund requests (pending + approved).
      // Governance: /api/customer-refund-requests/[id]/{approve,reject,execute}
      // enforces SoD (approver ≠ executor).
      try {
        // v3.74.528 — pull the FX + method + account + rejection reason
        // that were already stored on the row but never surfaced.
        const { data: crs } = await supabase
          .from("customer_refund_requests")
          .select(`
            id, amount, currency, exchange_rate, base_amount,
            refund_method, refund_account_id, rejection_reason,
            metadata,
            status, notes, created_at,
            customer_id, requested_by, approved_by, approved_at,
            customers(name),
            invoice_id, invoices(invoice_number)
          `)
          .eq("company_id", cid)
          .in("status", ["pending", "approved"])
          .order("created_at", { ascending: true })
          .limit(100)
        // v3.74.540 — batch-fetch refund account names + requester emails +
        // any proposed account_id inside metadata.proposed_changes.
        const crAcctIds = Array.from(new Set(((crs || []) as any[]).map(r => r.refund_account_id).filter(Boolean)))
        const crProposedAcctIds = Array.from(new Set((crs || []).map((r: any) => (r.metadata?.proposed_changes?.account_id) as string | undefined).filter(Boolean)))
        const allCrAcctIds = Array.from(new Set([...crAcctIds, ...crProposedAcctIds]))
        const crUserIds = Array.from(new Set(((crs || []) as any[]).map(r => r.requested_by).filter(Boolean)))
        const [crAcctsRes, crUsersRes] = await Promise.all([
          allCrAcctIds.length
            ? supabase.from("chart_of_accounts").select("id, account_name").in("id", allCrAcctIds)
            : Promise.resolve({ data: [] as any[] }),
          crUserIds.length
            ? supabase.from("company_members").select("user_id, email").eq("company_id", cid).in("user_id", crUserIds)
            : Promise.resolve({ data: [] as any[] }),
        ])
        const crAcctMap = new Map(((crAcctsRes.data || []) as any[]).map((a: any) => [a.id, a.account_name]))
        const crUserMap = new Map(((crUsersRes.data || []) as any[]).map((u: any) => [u.user_id, u.email]))
        // v3.74.579 — الاسم أولاً والإيميل fallback (نمط v3.74.512)
        if (crUserIds.length) {
          try {
            const res = await fetch("/api/members-emails", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userIds: crUserIds, companyId: cid }),
            })
            if (res.ok) {
              const j = await res.json().catch(() => ({}))
              for (const uid of crUserIds as string[]) {
                const label = (j?.names || {})[uid] || (j?.map || {})[uid]
                if (label) crUserMap.set(uid, label)
              }
            }
          } catch { /* best-effort */ }
        }
        setCustomerRefunds((crs || []).map((r: any) => {
          const proposed = (r.metadata?.proposed_changes || {}) as Record<string, any>
          return {
            id: r.id,
            customer_name: r.customers?.name ?? null,
            invoice_no: r.invoices?.invoice_number ?? null,
            amount: Number(r.amount || 0),
            status: r.status,
            notes: r.notes ?? null,
            requested_at: r.created_at,
            requested_by: r.requested_by ?? null,
            approved_by: r.approved_by ?? null,
            currency: String(r.currency || "EGP"),
            base_amount: r.base_amount != null ? Number(r.base_amount) : null,
            exchange_rate: r.exchange_rate != null ? Number(r.exchange_rate) : null,
            refund_method: r.refund_method ?? null,
            refund_account_name: r.refund_account_id ? (crAcctMap.get(r.refund_account_id) ?? null) : null,
            requested_by_email: r.requested_by ? (crUserMap.get(r.requested_by) ?? null) : null,
            rejection_reason: r.rejection_reason ?? null,
            // v3.74.540 — proposed changes
            proposed_amount: proposed.amount != null ? Number(proposed.amount) : null,
            proposed_currency: proposed.original_currency ? String(proposed.original_currency) : null,
            proposed_account_name: proposed.account_id ? (crAcctMap.get(proposed.account_id) ?? null) : null,
            proposed_method: proposed.payment_method ? String(proposed.payment_method) : null,
            proposed_date: proposed.payment_date ? String(proposed.payment_date) : null,
            proposed_reference: proposed.reference_number ? String(proposed.reference_number) : null,
            type: "customer_refund" as const,
          }
        }))
      } catch {
        setCustomerRefunds([])
      }

      // v3.74.476 — vendor payment correction requests.
      // v3.74.528 — pull rejection_reason + original_payment_id so we can
      // fetch the FX context that lives on the original payment.
      // v3.74.539 — also pull metadata so the card can surface
      // proposed_changes (what the accountant wants to change to).
      try {
        const { data: vpc } = await supabase
          .from("vendor_payment_correction_requests")
          .select(`
            id, amount, status, notes, rejection_reason, original_payment_id,
            metadata,
            created_at, supplier_id, requested_by, approved_by, approved_at,
            suppliers(name),
            bill_id, bills(bill_number)
          `)
          .eq("company_id", cid)
          .in("status", ["pending", "approved"])
          .order("created_at", { ascending: true })
          .limit(100)
        // Batch-fetch original payments for their currency/FX + requester emails.
        const vpcOrigIds = Array.from(new Set(((vpc || []) as any[]).map(r => r.original_payment_id).filter(Boolean)))
        const vpcUserIds = Array.from(new Set(((vpc || []) as any[]).map(r => r.requested_by).filter(Boolean)))
        const [vpcPaysRes, vpcUsersRes] = await Promise.all([
          vpcOrigIds.length
            ? supabase.from("payments")
                .select("id, original_currency, currency_code, exchange_rate, base_currency_amount")
                .in("id", vpcOrigIds)
            : Promise.resolve({ data: [] as any[] }),
          vpcUserIds.length
            ? supabase.from("company_members").select("user_id, email").eq("company_id", cid).in("user_id", vpcUserIds)
            : Promise.resolve({ data: [] as any[] }),
        ])
        const vpcPayMap = new Map(((vpcPaysRes.data || []) as any[]).map((p: any) => [p.id, p]))
        const vpcUserMap = new Map(((vpcUsersRes.data || []) as any[]).map((u: any) => [u.user_id, u.email]))
        // v3.74.579 — الاسم أولاً والإيميل fallback (نمط v3.74.512)
        if (vpcUserIds.length) {
          try {
            const res = await fetch("/api/members-emails", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userIds: vpcUserIds, companyId: cid }),
            })
            if (res.ok) {
              const j = await res.json().catch(() => ({}))
              for (const uid of vpcUserIds as string[]) {
                const label = (j?.names || {})[uid] || (j?.map || {})[uid]
                if (label) vpcUserMap.set(uid, label)
              }
            }
          } catch { /* best-effort */ }
        }
        // v3.74.539 — batch-fetch chart_of_accounts to resolve any
        // proposed account_id into an account name.
        const vpcProposedAcctIds = Array.from(new Set((vpc || []).map((r: any) => (r.metadata?.proposed_changes?.account_id) as string | undefined).filter(Boolean)))
        const vpcAcctsRes = vpcProposedAcctIds.length
          ? await supabase.from("chart_of_accounts").select("id, account_name").in("id", vpcProposedAcctIds)
          : { data: [] as any[] }
        const vpcAcctMap = new Map(((vpcAcctsRes.data || []) as any[]).map((a: any) => [a.id, a.account_name]))
        setVendorPaymentCorrections((vpc || []).map((r: any) => {
          const origPay = r.original_payment_id ? vpcPayMap.get(r.original_payment_id) : null
          // v3.74.539 — pluck proposed_changes fields for the card
          const proposed = (r.metadata?.proposed_changes || {}) as Record<string, any>
          return {
            id: r.id,
            supplier_name: r.suppliers?.name ?? null,
            bill_no: r.bills?.bill_number ?? null,
            amount: Number(r.amount || 0),
            status: r.status,
            notes: r.notes ?? null,
            requested_at: r.created_at,
            requested_by: r.requested_by ?? null,
            approved_by: r.approved_by ?? null,
            currency: String(origPay?.original_currency || origPay?.currency_code || "EGP"),
            base_amount: origPay?.base_currency_amount != null ? Number(origPay.base_currency_amount) : null,
            exchange_rate: origPay?.exchange_rate != null ? Number(origPay.exchange_rate) : null,
            requested_by_email: r.requested_by ? (vpcUserMap.get(r.requested_by) ?? null) : null,
            rejection_reason: r.rejection_reason ?? null,
            // v3.74.539 — proposed changes (owner needs these to decide)
            proposed_amount: proposed.amount != null ? Number(proposed.amount) : null,
            proposed_currency: proposed.original_currency ? String(proposed.original_currency) : null,
            proposed_account_name: proposed.account_id ? (vpcAcctMap.get(proposed.account_id) ?? null) : null,
            proposed_method: proposed.payment_method ? String(proposed.payment_method) : null,
            proposed_date: proposed.payment_date ? String(proposed.payment_date) : null,
            proposed_reference: proposed.reference_number ? String(proposed.reference_number) : null,
            type: "vendor_payment_correction" as const,
          }
        }))
      } catch {
        setVendorPaymentCorrections([])
      }

      // v3.74.477 — dispatch approvals (invoices awaiting warehouse
      // stage-2). Governance:
      // /api/invoices/[id]/warehouse-approve enforces warehouse role
      // + warehouse gate.
      try {
        const { data: invs } = await supabase
          .from("invoices")
          .select(`
            id, invoice_number, total_amount, warehouse_status, status,
            created_at, customer_id, branch_id, warehouse_id,
            shipping_provider_id,
            customers(name),
            branches(name),
            warehouses(name),
            shipping_providers:shipping_provider_id(provider_name, provider_code, auth_type)
          `)
          .eq("company_id", cid)
          .eq("warehouse_status", "pending")
          .in("status", ["sent", "paid", "partially_paid"])
          .order("created_at", { ascending: true })
          .limit(100)
        setDispatches((invs || []).map((i: any) => {
          const sp = i.shipping_providers
          const code = String(sp?.provider_code || "").toLowerCase()
          return {
            id: i.id,
            invoice_no: i.invoice_number ?? null,
            customer_name: i.customers?.name ?? null,
            total: Number(i.total_amount || 0),
            branch_name: i.branches?.name ?? null,
            warehouse_name: i.warehouses?.name ?? null,
            requested_at: i.created_at,
            shipping_provider_name: sp?.provider_name ?? null,
            shipping_provider_code: sp?.provider_code ?? null,
            // v3.74.491 — API-integrated providers can do
            // approve-with-shipping in one click.
            shipping_provider_has_api: ["bosta","aramex"].includes(code) && !!sp?.auth_type,
            type: "dispatch" as const,
          }
        }))
      } catch {
        setDispatches([])
      }

      // v3.74.680 — booking stock withdrawals awaiting the branch store
      // manager (same "issue from warehouse" family as dispatch, own tab).
      // Scope to the user's branch for non-management; management sees all.
      try {
        // NOTE: booking_stock_withdrawals only has FK to bookings + companies,
        // so PostgREST can embed bookings(...) but NOT products/branches/
        // warehouses. Resolve those names in separate id lookups.
        let wq = supabase
          .from("booking_stock_withdrawals")
          .select(`id, booking_id, product_id, quantity, reason, requested_at, branch_id, warehouse_id, status, bookings(booking_no)`)
          .eq("company_id", cid)
          .eq("status", "pending")
          .order("requested_at", { ascending: true })
          .limit(100)
        if (!isAdminLike && myBranchId) wq = wq.eq("branch_id", myBranchId)
        const { data: wds } = await wq
        const rows = (wds || []) as any[]
        const nameMap = async (table: string, ids: any[]) => {
          const uniq = Array.from(new Set(ids.filter(Boolean)))
          if (!uniq.length) return {} as Record<string, string>
          const { data } = await supabase.from(table).select("id, name").in("id", uniq as string[])
          return Object.fromEntries((data || []).map((r: any) => [r.id, r.name])) as Record<string, string>
        }
        const [prodNames, brNames, whNames] = await Promise.all([
          nameMap("products", rows.map(r => r.product_id)),
          nameMap("branches", rows.map(r => r.branch_id)),
          nameMap("warehouses", rows.map(r => r.warehouse_id)),
        ])
        setBookingWithdrawals(rows.map((w) => ({
          id: w.id,
          booking_id: w.booking_id,
          booking_no: w.bookings?.booking_no ?? null,
          product_name: prodNames[w.product_id] ?? null,
          quantity: Number(w.quantity || 0),
          branch_name: brNames[w.branch_id] ?? null,
          warehouse_name: whNames[w.warehouse_id] ?? null,
          reason: w.reason ?? null,
          requested_at: w.requested_at,
          type: "booking_stock_withdrawal" as const,
        })))
      } catch {
        setBookingWithdrawals([])
      }

      // v3.74.478+v3.74.483 — goods receipt approvals (bills awaiting
      // warehouse confirmation). Governance: /api/bills/[id]/confirm-receipt
      // enforces warehouse role + warehouse gate.
      // v3.74.483 — fetch bill_items in a second query so the warehouse
      // manager can review products + quantities inline.
      try {
        const { data: bills } = await supabase
          .from("bills")
          .select(`
            id, bill_number, total_amount, receipt_status, status,
            created_at, supplier_id, branch_id, warehouse_id,
            suppliers(name),
            branches(name),
            warehouses(name)
          `)
          .eq("company_id", cid)
          .eq("receipt_status", "pending")
          .not("status", "in", "(cancelled,draft)")
          .order("created_at", { ascending: true })
          .limit(100)

        const itemsByBill = new Map<string, PendingGoodsReceipt["items"]>()
        const billIds = (bills || []).map((b: any) => b.id)
        if (billIds.length > 0) {
          const { data: items } = await supabase
            .from("bill_items")
            .select("bill_id, quantity, unit_price, description, products(name, product_type)")
            .in("bill_id", billIds)
          for (const it of (items || []) as any[]) {
            const key = String(it.bill_id)
            if (!itemsByBill.has(key)) itemsByBill.set(key, [])
            itemsByBill.get(key)!.push({
              product_name: it.products?.name ?? it.description ?? "—",
              product_type: it.products?.product_type ?? null,
              quantity: Number(it.quantity || 0),
              unit_price: Number(it.unit_price || 0),
            })
          }
        }

        setGoodsReceipts((bills || []).map((b: any) => ({
          id: b.id,
          bill_no: b.bill_number ?? null,
          supplier_name: b.suppliers?.name ?? null,
          total: Number(b.total_amount || 0),
          branch_name: b.branches?.name ?? null,
          warehouse_name: b.warehouses?.name ?? null,
          requested_at: b.created_at,
          items: itemsByBill.get(b.id) ?? [],
          type: "goods_receipt" as const,
        })))
      } catch {
        setGoodsReceipts([])
      }

      // v3.74.479 — inventory write-offs (approve requires account
      // selection → link to details page).
      try {
        const { data: wos } = await supabase
          .from("inventory_write_offs")
          .select(`
            id, write_off_number, total_cost, reason, status,
            created_at, branch_id, warehouse_id, warehouse_name,
            branches(name)
          `)
          .eq("company_id", cid)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(100)
        setWriteOffs((wos || []).map((w: any) => ({
          id: w.id,
          write_off_no: w.write_off_number ?? null,
          total_cost: Number(w.total_cost || 0),
          reason: w.reason ?? null,
          branch_name: w.branches?.name ?? null,
          warehouse_name: w.warehouse_name ?? null,
          requested_at: w.created_at,
          type: "write_off" as const,
        })))
      } catch {
        setWriteOffs([])
      }

      // v3.74.479 — inventory transfers (multi-stage workflow — link
      // to details page for the stage-appropriate action).
      try {
        const { data: its } = await supabase
          .from("inventory_transfers")
          .select(`
            id, transfer_number, status, created_at,
            source_warehouse_id, destination_warehouse_id,
            source_warehouse:warehouses!inventory_transfers_source_warehouse_id_fkey(name),
            destination_warehouse:warehouses!inventory_transfers_destination_warehouse_id_fkey(name)
          `)
          .eq("company_id", cid)
          .in("status", ["pending_approval", "pending", "in_transit"])
          .order("created_at", { ascending: true })
          .limit(100)
        setInventoryTransfers((its || []).map((it: any) => ({
          id: it.id,
          transfer_no: it.transfer_number ?? null,
          status: it.status,
          from_warehouse: it.source_warehouse?.name ?? null,
          to_warehouse: it.destination_warehouse?.name ?? null,
          requested_at: it.created_at,
          type: "inventory_transfer" as const,
        })))
      } catch {
        setInventoryTransfers([])
      }

      // v3.74.480 — collect misc pending items (purchase requests,
      // bank vouchers, expenses, customer debit notes, permission
      // transfers). All are link-out cards; the dedicated pages hold
      // the actual approve/reject flows with their full governance.
      try {
        const misc: PendingMiscApproval[] = []
        // Purchase Requests
        const { data: prs } = await supabase
          .from("purchase_requests")
          .select(`id, request_number, total_estimated_cost, status, created_at,
                   branch_id, warehouse_id, branches(name), warehouses(name)`)
          .eq("company_id", cid)
          .eq("status", "pending_approval")
          .order("created_at", { ascending: true })
          .limit(50)
        for (const r of (prs || []) as any[]) {
          misc.push({
            id: `pr-${r.id}`, kind: "purchase_request",
            doc_no: r.request_number ?? null,
            party_or_label: null,
            amount: Number(r.total_estimated_cost || 0),
            branch_name: r.branches?.name ?? null,
            warehouse_name: r.warehouses?.name ?? null,
            href: `/purchase-requests/${r.id}`,
            requested_at: r.created_at,
            type: "misc_approval",
          })
        }
        // Bank Voucher Requests
        // v3.74.561 — select base_amount + currency so the sum sees
        // the FX-correct number (mixing raw amount across currencies
        // used to display meaningless totals).
        const { data: bvs } = await supabase
          .from("bank_voucher_requests")
          .select(`id, reference_number, amount, base_amount, currency, status, created_at, branch_id, branches(name)`)
          .eq("company_id", cid)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(50)
        for (const r of (bvs || []) as any[]) {
          misc.push({
            id: `bv-${r.id}`, kind: "bank_voucher",
            doc_no: r.reference_number ?? null,
            party_or_label: null,
            amount: Number(r.base_amount ?? r.amount ?? 0),
            branch_name: r.branches?.name ?? null,
            warehouse_name: null,
            href: `/bank-vouchers/${r.id}`,
            requested_at: r.created_at,
            type: "misc_approval",
          })
        }
        // Expenses
        const { data: exs } = await supabase
          .from("expenses")
          .select(`id, expense_number, amount, status, created_at, branch_id, branches(name)`)
          .eq("company_id", cid)
          .eq("status", "pending_approval")
          .order("created_at", { ascending: true })
          .limit(50)
        for (const r of (exs || []) as any[]) {
          misc.push({
            id: `ex-${r.id}`, kind: "expense",
            doc_no: r.expense_number ?? null,
            party_or_label: null,
            amount: Number(r.amount || 0),
            branch_name: r.branches?.name ?? null,
            warehouse_name: null,
            href: `/expenses/${r.id}`,
            requested_at: r.created_at,
            type: "misc_approval",
          })
        }
        // Customer Debit Notes
        const { data: cdns } = await supabase
          .from("customer_debit_notes")
          .select(`id, debit_note_number, total_amount, approval_status, created_at,
                   customer_id, customers(name),
                   branch_id, branches(name)`)
          .eq("company_id", cid)
          .eq("approval_status", "pending_approval")
          .order("created_at", { ascending: true })
          .limit(50)
        for (const r of (cdns || []) as any[]) {
          misc.push({
            id: `cdn-${r.id}`, kind: "customer_debit_note",
            doc_no: r.debit_note_number ?? null,
            party_or_label: r.customers?.name ?? null,
            amount: Number(r.total_amount || 0),
            branch_name: r.branches?.name ?? null,
            warehouse_name: null,
            href: `/customer-debit-notes/${r.id}`,
            requested_at: r.created_at,
            type: "misc_approval",
          })
        }
        // Permission Transfers
        const { data: pts } = await supabase
          .from("permission_transfers")
          .select(`id, status, created_at, transferred_by, to_user_id`)
          .eq("company_id", cid)
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(50)
        // v3.74.579 — اسم طالب نقل الصلاحيات (transferred_by مُحمَّل أصلاً
        // فى الاستعلام؛ يُحل الاسم دفعة واحدة بنمط v3.74.512)
        const ptUserIds = Array.from(new Set((pts || []).map((r: any) => r.transferred_by).filter(Boolean)))
        const ptUserMap = new Map<string, string>()
        if (ptUserIds.length > 0) {
          try {
            const res = await fetch("/api/members-emails", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userIds: ptUserIds, companyId: cid }),
            })
            if (res.ok) {
              const j = await res.json().catch(() => ({}))
              for (const id of ptUserIds as string[]) {
                const label = (j?.names || {})[id] || (j?.map || {})[id]
                if (label) ptUserMap.set(id, label)
              }
            }
          } catch { /* best-effort */ }
        }
        for (const r of (pts || []) as any[]) {
          misc.push({
            id: `pt-${r.id}`, kind: "permission_transfer",
            doc_no: r.id.slice(0, 8),
            party_or_label: null,
            amount: 0,
            branch_name: null,
            warehouse_name: null,
            href: `/permissions/transfers`,
            requested_at: r.created_at,
            requested_by_label: r.transferred_by ? (ptUserMap.get(r.transferred_by) ?? null) : null,
            type: "misc_approval",
          })
        }
        setMiscApprovals(misc)
      } catch {
        setMiscApprovals([])
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
          // v3.74.489 — fetch document rows in a second pass to attach
          // branch_id + warehouse_id so the branch filter can act on
          // discount history. Fine to run a small IN-batch since we
          // already have the ids in memory.
          const idsByType: Record<string, string[]> = {}
          for (const d of rows) {
            const t = d.document_type as string
            if (!idsByType[t]) idsByType[t] = []
            idsByType[t].push(d.document_id)
          }
          const scopeByDoc = new Map<string, { branch_id: string|null; warehouse_id: string|null }>()
          for (const t of Object.keys(idsByType)) {
            const table = t === "purchase_invoice" ? "bills"
              : t === "sales_invoice" ? "invoices"
              : t === "purchase_order" ? "purchase_orders"
              : t === "sales_order" ? "sales_orders"
              : null
            if (!table) continue
            try {
              const { data: scopeRows } = await supabase
                .from(table)
                .select("id, branch_id, warehouse_id")
                .in("id", idsByType[t])
              for (const r of (scopeRows || []) as any[]) {
                scopeByDoc.set(`${t}:${r.id}`, { branch_id: r.branch_id ?? null, warehouse_id: r.warehouse_id ?? null })
              }
            } catch { /* keep going */ }
          }
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
              // v3.74.520 — عملة الشركة الأساسية بدل تثبيت الجنيه
              : `الخصم: ${d.discount_value} ${(() => { try { const c = localStorage.getItem('app_currency') || 'EGP'; return c === 'EGP' ? 'ج.م' : c } catch { return 'ج.م' } })()}`
            // v3.74.470 — build amendment context from the prior
            // approval when supersedes_approval_id is set.
            const scope = scopeByDoc.get(`${d.document_type}:${d.document_id}`) ?? { branch_id: null, warehouse_id: null }
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
              branch_id: scope.branch_id,
              warehouse_id: scope.warehouse_id,
              // v3.74.471 — pass snapshots through so UnifiedHistoryCard
              // can render the same diff card as the pending inbox.
              raw_current: isAmend ? {
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
                items_snapshot: Array.isArray(d.items_snapshot) ? d.items_snapshot : null,
                shipping_snapshot: d.shipping_snapshot != null ? Number(d.shipping_snapshot) : null,
                adjustment_snapshot: d.adjustment_snapshot != null ? Number(d.adjustment_snapshot) : null,
                tax_amount_snapshot: d.tax_amount_snapshot != null ? Number(d.tax_amount_snapshot) : null,
                subtotal_snapshot: d.subtotal_snapshot != null ? Number(d.subtotal_snapshot) : null,
                shipping_tax_rate_snapshot: d.shipping_tax_rate_snapshot != null ? Number(d.shipping_tax_rate_snapshot) : null,
                discount_position_snapshot: d.discount_position_snapshot ?? null,
                tax_inclusive_snapshot: d.tax_inclusive_snapshot ?? null,
                supplier_name_snapshot: d.supplier_name_snapshot ?? null,
              } as PendingDiscountApproval : null,
              raw_prior: (isAmend && d.prior_approval) ? d.prior_approval : null,
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

      // v3.74.474 — supplier payments history (approved / rejected /
      // completed). The pending inbox tab handles pending rows.
      // v3.74.534 — enriched with the same story the pending card
      // carries: bill number + PO + amount in payment ccy + FX base
      // equivalent + payment method + source account name.
      try {
        const { data: pays } = await supabase
          .from("payments")
          .select(`
            id, reference_number, amount, currency_code, original_currency, status,
            exchange_rate, base_currency_amount, payment_method, account_id,
            created_at, approved_at, approved_by, rejected_by, created_by, rejection_reason,
            branch_id, warehouse_id,
            supplier_id, branches(name)
          `)
          .eq("company_id", cid)
          .not("supplier_id", "is", null)
          .in("status", ["approved", "rejected", "completed", "paid"])
          .order("approved_at", { ascending: false })
          .limit(100)
        // v3.74.503 — no FK payments→suppliers; fetch names separately.
        const histSupIds = Array.from(new Set((pays || []).map((p: any) => p.supplier_id).filter(Boolean)))
        const histPayIds = (pays || []).map((p: any) => p.id)
        const histAcctIds = Array.from(new Set((pays || []).map((p: any) => p.account_id).filter(Boolean)))
        const [histSupsRes, histAllocsRes, histAcctsRes] = await Promise.all([
          histSupIds.length
            ? supabase.from("suppliers").select("id, name").in("id", histSupIds)
            : Promise.resolve({ data: [] as any[] }),
          // v3.74.534 — allocations to resolve bill_no + PO for each payment
          histPayIds.length
            ? supabase.from("payment_allocations").select("payment_id, bill_id, allocated_amount").in("payment_id", histPayIds)
            : Promise.resolve({ data: [] as any[] }),
          histAcctIds.length
            ? supabase.from("chart_of_accounts").select("id, account_name").in("id", histAcctIds)
            : Promise.resolve({ data: [] as any[] }),
        ])
        const histSupMap = new Map(((histSupsRes.data || []) as any[]).map((s: any) => [s.id, s.name]))
        const histAcctMap = new Map(((histAcctsRes.data || []) as any[]).map((a: any) => [a.id, a.account_name]))
        const histAllocsByPay = new Map<string, any[]>()
        for (const a of (histAllocsRes.data || []) as any[]) {
          if (!histAllocsByPay.has(a.payment_id)) histAllocsByPay.set(a.payment_id, [])
          histAllocsByPay.get(a.payment_id)!.push(a)
        }
        const histAllBillIds = Array.from(new Set(((histAllocsRes.data || []) as any[]).map(a => a.bill_id).filter(Boolean)))
        const histBillsRes = histAllBillIds.length
          ? await supabase.from("bills").select("id, bill_number, purchase_order_id").in("id", histAllBillIds)
          : { data: [] as any[] }
        const histBillMap = new Map(((histBillsRes.data || []) as any[]).map((b: any) => [b.id, b]))
        const histPoIds = Array.from(new Set(((histBillsRes.data || []) as any[]).map((b: any) => b.purchase_order_id).filter(Boolean)))
        const histPosRes = histPoIds.length
          ? await supabase.from("purchase_orders").select("id, po_number").in("id", histPoIds)
          : { data: [] as any[] }
        const histPoMap = new Map(((histPosRes.data || []) as any[]).map((po: any) => [po.id, po.po_number]))
        for (const p of (pays || []) as any[]) {
          const status = p.status === "rejected" ? "rejected" : "approved"
          const allocs = histAllocsByPay.get(p.id) || []
          const primaryAlloc = allocs.length
            ? allocs.slice().sort((a: any, b: any) => Number(b.allocated_amount || 0) - Number(a.allocated_amount || 0))[0]
            : null
          const primaryBill = primaryAlloc?.bill_id ? histBillMap.get(primaryAlloc.bill_id) : null
          const poNo = primaryBill?.purchase_order_id ? histPoMap.get(primaryBill.purchase_order_id) : null
          const acctName = p.account_id ? histAcctMap.get(p.account_id) : null
          const payCcy = p.original_currency || p.currency_code || "EGP"
          const details: string[] = []
          if (primaryBill?.bill_number) {
            let line = `🧾 فاتورة: ${primaryBill.bill_number}`
            if (poNo) line += ` · 📄 أمر شراء: ${poNo}`
            if (allocs.length > 1) line += ` · + ${allocs.length - 1} فاتورة أخرى`
            details.push(line)
          }
          const baseStr = payCcy !== "EGP" && p.base_currency_amount != null
            ? ` ≈ ${Number(p.base_currency_amount).toFixed(2)} EGP · سعر الصرف: ${Number(p.exchange_rate || 0).toFixed(4)}`
            : ""
          details.push(`💰 القيمة: ${Number(p.amount).toFixed(2)} ${payCcy}${baseStr}`)
          const methodLabel = p.payment_method === "cash" ? "نقدى"
            : p.payment_method === "bank" || p.payment_method === "bank_transfer" ? "تحويل بنكى"
            : p.payment_method === "check" || p.payment_method === "cheque" ? "شيك"
            : p.payment_method ?? "—"
          let payLine = `💳 ${methodLabel}`
          if (acctName) payLine += ` · 🏦 ${acctName}`
          details.push(payLine)

          merged.push({
            id: `pay-${p.id}`,
            category: "supplier_payment",
            doc_label: `دفعة مورد · ${p.reference_number ?? p.id.slice(0, 8)}`,
            doc_href: null,
            party_label: histSupMap.get(p.supplier_id) ?? null,
            // v3.74.534 — value_label now carries the base equivalent inline
            value_label: payCcy !== "EGP" && p.base_currency_amount != null
              ? `${Number(p.amount).toFixed(2)} ${payCcy} ≈ ${Number(p.base_currency_amount).toFixed(2)} EGP`
              : `${Number(p.amount).toFixed(2)} ${payCcy}`,
            status: status as any,
            requested_by_email: null,
            requested_by_id: p.created_by ?? null,
            requested_at: p.created_at,
            decided_by_email: null,
            decided_by_id: p.approved_by ?? p.rejected_by ?? null,
            decided_at: p.approved_at ?? null,
            decision_note: p.rejection_reason ?? null,
            detail_lines: details,
          })
        }
      } catch { /* keep going */ }

      // v3.74.476 — customer refund history.
      // v3.74.579 — تفاصيل توضيحية على غرار الخصومات: عملة، فاتورة، طريقة
      // الصرف والحساب، من طلب/اعتمد/نفّذ (تُحل الأسماء دفعة واحدة لاحقاً).
      try {
        const { data: crs } = await supabase
          .from("customer_refund_requests")
          .select(`
            id, status, amount, currency, created_at, executed_at, approved_at,
            notes, rejection_reason, refund_method, refund_account_id,
            requested_by, approved_by, executed_by, rejected_by,
            customer_id, customers(name), invoice_id, invoices(invoice_number)
          `)
          .eq("company_id", cid)
          .in("status", ["executed", "rejected", "cancelled"])
          .order("created_at", { ascending: false })
          .limit(100)
        const crefAcctIds = Array.from(new Set(((crs || []) as any[]).map(r => r.refund_account_id).filter(Boolean)))
        const crefAcctMap = new Map<string, string>()
        if (crefAcctIds.length > 0) {
          try {
            const { data: accts } = await supabase
              .from("chart_of_accounts").select("id, account_name").in("id", crefAcctIds)
            for (const a of (accts || []) as any[]) crefAcctMap.set(a.id, a.account_name)
          } catch { /* best-effort */ }
        }
        for (const r of (crs || []) as any[]) {
          const status = r.status === "rejected" ? "rejected" : (r.status === "cancelled" ? "cancelled" : "approved")
          const ccy = String(r.currency || "EGP")
          const details: string[] = []
          if (r.invoices?.invoice_number) details.push(`🧾 فاتورة: ${r.invoices.invoice_number}`)
          const methodLabel = r.refund_method === "cash" ? "نقدى"
            : r.refund_method === "bank" || r.refund_method === "bank_transfer" ? "تحويل بنكى"
            : r.refund_method === "check" || r.refund_method === "cheque" ? "شيك"
            : r.refund_method ?? null
          const acctName = r.refund_account_id ? crefAcctMap.get(r.refund_account_id) : null
          if (methodLabel || acctName) {
            details.push(`💳 ${methodLabel ?? "—"}${acctName ? ` · 🏦 ${acctName}` : ""}`)
          }
          if (r.status === "executed" && r.executed_at) {
            details.push(`✅ نُفِّذ الصرف فعلياً فى ${new Date(r.executed_at).toLocaleDateString("ar-EG")}`)
          }
          merged.push({
            id: `cref-${r.id}`,
            category: "customer_refund",
            doc_label: `استرداد عميل · ${r.id.slice(0, 8)}`,
            doc_href: "/customer-refund-requests",
            party_label: r.customers?.name ?? null,
            value_label: `${Number(r.amount).toFixed(2)} ${ccy}`,
            status: status as any,
            requested_by_email: null,
            requested_by_id: r.requested_by ?? null,
            requested_at: r.created_at,
            decided_by_email: null,
            decided_by_id: r.executed_by ?? r.approved_by ?? r.rejected_by ?? null,
            decided_at: r.executed_at ?? r.approved_at ?? null,
            decision_note: r.rejection_reason ?? r.notes ?? null,
            detail_lines: details.length ? details : null,
          })
        }
      } catch { /* keep going */ }

      // v3.74.476 — vendor payment correction history.
      try {
        const { data: vpc } = await supabase
          .from("vendor_payment_correction_requests")
          .select(`id, status, amount, created_at, executed_at, approved_at, rejection_reason, notes, requested_by, approved_by, executed_by, supplier_id, suppliers(name)`)
          .eq("company_id", cid)
          .in("status", ["executed", "rejected", "cancelled"])
          .order("created_at", { ascending: false })
          .limit(100)
        for (const r of (vpc || []) as any[]) {
          const status = r.status === "rejected" ? "rejected" : (r.status === "cancelled" ? "cancelled" : "approved")
          merged.push({
            id: `vcor-${r.id}`,
            category: "vendor_payment_correction",
            doc_label: `تصحيح دفعة مورد · ${r.id.slice(0, 8)}`,
            doc_href: "/vendor-payment-correction-requests",
            party_label: r.suppliers?.name ?? null,
            value_label: `${Number(r.amount).toFixed(2)}`,
            status: status as any,
            requested_by_email: null,
            // v3.74.579 — من طلب/قرر (يُحل الاسم دفعة واحدة كباقى السجل)
            requested_by_id: r.requested_by ?? null,
            requested_at: r.created_at,
            decided_by_email: null,
            decided_by_id: r.executed_by ?? r.approved_by ?? null,
            decided_at: r.executed_at ?? r.approved_at ?? null,
            decision_note: r.rejection_reason ?? r.notes ?? null,
          })
        }
      } catch { /* keep going */ }

      // v3.74.475 — sales return requests history (decided rows).
      try {
        const { data: srs } = await supabase
          .from("sales_return_requests")
          .select(`
            id, status, total_return_amount, created_at,
            level_1_reviewed_at, warehouse_reviewed_at,
            level_1_rejection_reason, warehouse_rejection_reason,
            executed_at, rejection_reason,
            customer_id, customers(name), invoice_id, invoices(invoice_number)
          `)
          .eq("company_id", cid)
          .in("status", ["approved", "rejected", "executed", "completed"])
          .order("created_at", { ascending: false })
          .limit(100)
        for (const r of (srs || []) as any[]) {
          const status = r.status === "rejected" ? "rejected" : "approved"
          const decided_at = r.executed_at ?? r.warehouse_reviewed_at ?? r.level_1_reviewed_at ?? null
          const note = r.rejection_reason ?? r.warehouse_rejection_reason ?? r.level_1_rejection_reason ?? null
          merged.push({
            id: `sret-${r.id}`,
            category: "sales_return_request",
            doc_label: `مرتجع مبيعات · ${r.id.slice(0, 8)}`,
            doc_href: `/sales-return-requests/${r.id}`,
            party_label: r.customers?.name ?? null,
            value_label: `${Number(r.total_return_amount).toFixed(2)}`,
            status: status as any,
            requested_by_email: null,
            requested_at: r.created_at,
            decided_by_email: null,
            decided_at,
            decision_note: note,
          })
        }
      } catch { /* keep going */ }

      // v3.74.481 — dispatch history (invoices with warehouse_status
      // = approved / rejected).
      try {
        // v3.74.510 — كان يطلب عمود تاريخ اعتماد غير موجود فى جدول الفواتير
        // فيفشل بصمت ويظهر القسم صفراً دائماً منذ إنشائه.
        const { data: invs } = await supabase
          .from("invoices")
          .select(`id, invoice_number, total_amount, warehouse_status,
                   created_at, updated_at, warehouse_rejected_at,
                   created_by_user_id, posted_by_user_id, approved_by, rejected_by,
                   warehouse_rejection_reason, branch_id, warehouse_id,
                   customer_id, customers(name)`)
          .eq("company_id", cid)
          .in("warehouse_status", ["approved", "rejected"])
          .order("created_at", { ascending: false })
          .limit(50)
        for (const r of (invs || []) as any[]) {
          const status = r.warehouse_status === "rejected" ? "rejected" : "approved"
          merged.push({
            id: `disp-${r.id}`,
            category: "dispatch",
            doc_label: `موافقة إرسال · ${r.invoice_number ?? r.id.slice(0, 8)}`,
            doc_href: `/invoices/${r.id}`,
            party_label: r.customers?.name ?? null,
            value_label: `${Number(r.total_amount).toFixed(2)}`,
            status: status as any,
            requested_by_email: null,
            requested_by_id: r.posted_by_user_id ?? r.created_by_user_id ?? null,
            requested_at: r.created_at,
            decided_by_email: null,
            decided_by_id: r.approved_by ?? r.rejected_by ?? null,
            decided_at: r.warehouse_rejected_at ?? r.updated_at ?? null,
            decision_note: r.warehouse_rejection_reason ?? null,
            branch_id: r.branch_id ?? null,
            warehouse_id: r.warehouse_id ?? null,
          })
        }
      } catch { /* keep going */ }

      // v3.74.680 — booking stock withdrawal history (approved / rejected).
      try {
        const { data: wds } = await supabase
          .from("booking_stock_withdrawals")
          .select(`id, booking_id, product_id, quantity, status, requested_at,
                   requested_by, decided_by, decided_at, decision_notes,
                   branch_id, warehouse_id,
                   bookings(booking_no)`)
          .eq("company_id", cid)
          .in("status", ["approved", "rejected"])
          .order("decided_at", { ascending: false })
          .limit(50)
        const wRows = (wds || []) as any[]
        // products has no FK embed here — resolve names by id.
        const wpIds = Array.from(new Set(wRows.map(r => r.product_id).filter(Boolean)))
        let wProdNames: Record<string, string> = {}
        if (wpIds.length) {
          const { data: wp } = await supabase.from("products").select("id, name").in("id", wpIds as string[])
          wProdNames = Object.fromEntries((wp || []).map((p: any) => [p.id, p.name]))
        }
        for (const r of wRows) {
          merged.push({
            id: `bwd-${r.id}`,
            category: "booking_stock_withdrawal",
            doc_label: `سحب مخزون · ${r.bookings?.booking_no ?? (r.booking_id ? String(r.booking_id).slice(0, 8) : r.id.slice(0, 8))}`,
            doc_href: r.booking_id ? `/bookings/${r.booking_id}` : null,
            party_label: wProdNames[r.product_id] ?? null,
            value_label: `${Number(r.quantity || 0)} ${appLang === "en" ? "unit" : "وحدة"}`,
            status: (r.status === "rejected" ? "rejected" : "approved") as any,
            requested_by_email: null,
            requested_by_id: r.requested_by ?? null,
            requested_at: r.requested_at,
            decided_by_email: null,
            decided_by_id: r.decided_by ?? null,
            decided_at: r.decided_at ?? null,
            decision_note: r.decision_notes ?? null,
            branch_id: r.branch_id ?? null,
            warehouse_id: r.warehouse_id ?? null,
          })
        }
      } catch { /* keep going */ }

      // v3.74.481 — goods receipt history (bills with receipt_status
      // = approved / rejected).
      try {
        // v3.74.510 — كان يطلب عمودى تاريخ اعتماد/رفض غير موجودين فى جدول
        // bills ويشترط receipt_status='approved' بينما القيمة الفعلية
        // 'received' — فكان القسم صفراً دائماً منذ إنشائه.
        const { data: bills } = await supabase
          .from("bills")
          .select(`id, bill_number, total_amount, receipt_status,
                   created_at, updated_at,
                   created_by, created_by_user_id, received_by, rejected_by,
                   receipt_rejection_reason, branch_id, warehouse_id,
                   supplier_id, suppliers(name)`)
          .eq("company_id", cid)
          .in("receipt_status", ["received", "rejected"])
          .order("created_at", { ascending: false })
          .limit(50)
        for (const r of (bills || []) as any[]) {
          const status = r.receipt_status === "rejected" ? "rejected" : "approved"
          merged.push({
            id: `recv-${r.id}`,
            category: "goods_receipt",
            doc_label: `استلام مخزنى · ${r.bill_number ?? r.id.slice(0, 8)}`,
            doc_href: `/bills/${r.id}`,
            party_label: r.suppliers?.name ?? null,
            value_label: `${Number(r.total_amount).toFixed(2)}`,
            status: status as any,
            requested_by_email: null,
            requested_by_id: r.created_by_user_id ?? r.created_by ?? null,
            requested_at: r.created_at,
            decided_by_email: null,
            decided_by_id: r.received_by ?? r.rejected_by ?? null,
            decided_at: r.updated_at ?? null,
            decision_note: r.receipt_rejection_reason ?? null,
            branch_id: r.branch_id ?? null,
            warehouse_id: r.warehouse_id ?? null,
          })
        }
      } catch { /* keep going */ }

      // v3.74.481 — inventory write-offs history.
      try {
        const { data: wos } = await supabase
          .from("inventory_write_offs")
          .select(`id, write_off_number, total_cost, status, reason,
                   created_by, approved_by, rejected_by,
                   created_at, approved_at, rejected_at, rejection_reason`)
          .eq("company_id", cid)
          .in("status", ["approved", "rejected", "posted"])
          .order("created_at", { ascending: false })
          .limit(50)
        for (const r of (wos || []) as any[]) {
          const status = r.status === "rejected" ? "rejected" : "approved"
          merged.push({
            id: `wo-${r.id}`,
            category: "write_off",
            doc_label: `إهلاك · ${r.write_off_number ?? r.id.slice(0, 8)}`,
            doc_href: `/inventory/write-offs`,
            party_label: null,
            value_label: `${Number(r.total_cost).toFixed(2)}`,
            status: status as any,
            requested_by_email: null,
            requested_by_id: r.created_by ?? null,
            requested_at: r.created_at,
            decided_by_email: null,
            decided_by_id: r.approved_by ?? r.rejected_by ?? null,
            decided_at: r.approved_at ?? r.rejected_at ?? null,
            decision_note: r.rejection_reason ?? r.reason ?? null,
          })
        }
      } catch { /* keep going */ }

      // v3.74.481 — inventory transfers history.
      try {
        const { data: its } = await supabase
          .from("inventory_transfers")
          .select(`id, transfer_number, status, created_at,
                   source_warehouse_id, destination_warehouse_id,
                   source_warehouse:warehouses!inventory_transfers_source_warehouse_id_fkey(name),
                   destination_warehouse:warehouses!inventory_transfers_destination_warehouse_id_fkey(name)`)
          .eq("company_id", cid)
          .in("status", ["received", "cancelled", "rejected"])
          .order("created_at", { ascending: false })
          .limit(50)
        for (const r of (its || []) as any[]) {
          const status = r.status === "cancelled" ? "cancelled" : (r.status === "rejected" ? "rejected" : "approved")
          merged.push({
            id: `tr-${r.id}`,
            category: "inventory_transfer",
            doc_label: `تحويل مخزون · ${r.transfer_number ?? r.id.slice(0, 8)}`,
            doc_href: `/inventory-transfers/${r.id}`,
            party_label: `${r.source_warehouse?.name ?? "—"} → ${r.destination_warehouse?.name ?? "—"}`,
            value_label: null,
            status: status as any,
            requested_by_email: null,
            requested_at: r.created_at,
            decided_by_email: null,
            decided_at: null,
            decision_note: null,
          })
        }
      } catch { /* keep going */ }

      // v3.74.481 — misc history (purchase_requests, bank_vouchers,
      // expenses, customer_debit_notes, permission_transfers).
      try {
        const [prR, bvR, exR, cdnR, ptR] = await Promise.all([
          supabase.from("purchase_requests").select(`id, request_number, total_estimated_cost, status, created_at, approved_at, rejected_at`).eq("company_id", cid).in("status", ["approved", "rejected", "cancelled"]).order("created_at", { ascending: false }).limit(30),
          supabase.from("bank_voucher_requests").select(`id, reference_number, amount, status, created_at, reviewed_at, rejection_reason`).eq("company_id", cid).in("status", ["approved", "rejected", "cancelled"]).order("created_at", { ascending: false }).limit(30),
          supabase.from("expenses").select(`id, expense_number, amount, status, created_at, approved_at, rejected_at, rejection_reason`).eq("company_id", cid).in("status", ["approved", "rejected", "cancelled"]).order("created_at", { ascending: false }).limit(30),
          supabase.from("customer_debit_notes").select(`id, debit_note_number, total_amount, approval_status, created_at, approved_at, rejection_reason, customer_id, customers(name)`).eq("company_id", cid).in("approval_status", ["approved", "rejected"]).order("created_at", { ascending: false }).limit(30),
          supabase.from("permission_transfers").select(`id, status, created_at`).eq("company_id", cid).in("status", ["approved", "rejected", "cancelled"]).order("created_at", { ascending: false }).limit(30),
        ])
        for (const r of (prR.data || []) as any[]) {
          const status = r.status === "cancelled" ? "cancelled" : r.status
          merged.push({
            id: `pr-${r.id}`, category: "misc",
            doc_label: `طلب شراء · ${r.request_number ?? r.id.slice(0, 8)}`,
            doc_href: `/purchase-requests/${r.id}`, party_label: null,
            value_label: `${Number(r.total_estimated_cost).toFixed(2)}`,
            status: status as any, requested_by_email: null,
            requested_at: r.created_at, decided_by_email: null,
            decided_at: r.approved_at ?? r.rejected_at ?? null, decision_note: null,
          })
        }
        for (const r of (bvR.data || []) as any[]) {
          const status = r.status === "cancelled" ? "cancelled" : r.status
          merged.push({
            id: `bv-${r.id}`, category: "misc",
            doc_label: `سند بنكى · ${r.reference_number ?? r.id.slice(0, 8)}`,
            doc_href: `/bank-vouchers/${r.id}`, party_label: null,
            value_label: `${Number(r.amount).toFixed(2)}`,
            status: status as any, requested_by_email: null,
            requested_at: r.created_at, decided_by_email: null,
            decided_at: r.reviewed_at ?? null,
            decision_note: r.rejection_reason ?? null,
          })
        }
        for (const r of (exR.data || []) as any[]) {
          const status = r.status === "cancelled" ? "cancelled" : r.status
          merged.push({
            id: `ex-${r.id}`, category: "misc",
            doc_label: `مصروف · ${r.expense_number ?? r.id.slice(0, 8)}`,
            doc_href: `/expenses/${r.id}`, party_label: null,
            value_label: `${Number(r.amount).toFixed(2)}`,
            status: status as any, requested_by_email: null,
            requested_at: r.created_at, decided_by_email: null,
            decided_at: r.approved_at ?? r.rejected_at ?? null,
            decision_note: r.rejection_reason ?? null,
          })
        }
        for (const r of (cdnR.data || []) as any[]) {
          merged.push({
            id: `cdn-${r.id}`, category: "misc",
            doc_label: `إشعار مدين عميل · ${r.debit_note_number ?? r.id.slice(0, 8)}`,
            doc_href: `/customer-debit-notes/${r.id}`,
            party_label: r.customers?.name ?? null,
            value_label: `${Number(r.total_amount).toFixed(2)}`,
            status: r.approval_status as any, requested_by_email: null,
            requested_at: r.created_at, decided_by_email: null,
            decided_at: r.approved_at ?? null,
            decision_note: r.rejection_reason ?? null,
          })
        }
        for (const r of (ptR.data || []) as any[]) {
          const status = r.status === "cancelled" ? "cancelled" : r.status
          merged.push({
            id: `pt-${r.id}`, category: "misc",
            doc_label: `نقل صلاحيات · ${r.id.slice(0, 8)}`,
            doc_href: `/permissions/transfers`, party_label: null,
            value_label: null,
            status: status as any, requested_by_email: null,
            requested_at: r.created_at, decided_by_email: null,
            decided_at: null, decision_note: null,
          })
        }
      } catch { /* keep going */ }

      // v3.74.474 — purchase returns history (decided rows).
      try {
        const { data: prs } = await supabase
          .from("purchase_returns")
          .select(`
            id, return_number, total_amount, workflow_status, status,
            created_at, approved_at, rejected_at, rejection_reason,
            branch_id, warehouse_id, bill_id,
            created_by, approved_by, rejected_by,
            settlement_method, refund_account_id, reason, original_currency,
            confirmed_at,
            supplier_id, suppliers(name), branches(name), bills(bill_number)
          `)
          .eq("company_id", cid)
          // v3.74.510 — القرار الإدارى (اعتماد/رفض) هو الحدث المسجَّل،
          // حتى لو كان المرتجع لا يزال بانتظار إخراج المخزن. الفلتر
          // القديم على workflow_status كان يخفى المعتمد إدارياً
          // (pending_warehouse) من السجل.
          .or("approved_at.not.is.null,rejected_at.not.is.null")
          .order("created_at", { ascending: false })
          .limit(100)

        // v3.74.512 — بنود المرتجع (دفعة واحدة لكل المرتجعات) لعرض
        // تفصيل "ماذا أُرجع" على غرار تفصيل الخصومات.
        const pretIds = (prs || []).map((r: any) => r.id)
        const pretItemsMap = new Map<string, string[]>()
        if (pretIds.length > 0) {
          try {
            const { data: pretItems } = await supabase
              .from("purchase_return_items")
              .select("purchase_return_id, description, quantity, unit_price, line_total, products(name)")
              .in("purchase_return_id", pretIds)
            for (const it of (pretItems || []) as any[]) {
              const name = it.products?.name ?? it.description ?? "?"
              const line = `${name} · ${Number(it.quantity)} × ${Number(it.unit_price).toFixed(2)} = ${Number(it.line_total).toFixed(2)}`
              const arr = pretItemsMap.get(it.purchase_return_id) || []
              arr.push(line)
              pretItemsMap.set(it.purchase_return_id, arr)
            }
          } catch { /* items are best-effort */ }
        }

        // v3.74.579 — أسماء حسابات الاسترداد النقدى (إن وُجدت)
        const pretHistAcctIds = Array.from(new Set(((prs || []) as any[]).map(r => r.refund_account_id).filter(Boolean)))
        const pretHistAcctMap = new Map<string, string>()
        if (pretHistAcctIds.length > 0) {
          try {
            const { data: accts } = await supabase
              .from("chart_of_accounts").select("id, account_name").in("id", pretHistAcctIds)
            for (const a of (accts || []) as any[]) pretHistAcctMap.set(a.id, a.account_name)
          } catch { /* best-effort */ }
        }

        for (const r of (prs || []) as any[]) {
          const status = r.workflow_status === "rejected" ? "rejected"
            : (r.rejected_at && !r.approved_at) ? "rejected" : "approved"
          const decided_at = r.approved_at ?? r.rejected_at ?? null
          // v3.74.579 — تفاصيل توضيحية: التسوية + السبب + حالة الإخراج
          const details: string[] = [...(pretItemsMap.get(r.id) ?? [])]
          const acctName = r.refund_account_id ? pretHistAcctMap.get(r.refund_account_id) : null
          details.push(`💳 التسوية: ${acctName
            ? `استرداد نقدى · 🏦 ${acctName}`
            : r.settlement_method === "vendor_credit"
              ? "رصيد دائن لدى المورد"
              : "خصم من رصيد الفاتورة / رصيد دائن"}`)
          if (r.reason) details.push(`📝 السبب: ${r.reason}`)
          if (r.confirmed_at) {
            details.push(`📦 أُخرجت البضاعة من المخزن فى ${new Date(r.confirmed_at).toLocaleDateString("ar-EG")}`)
          } else if (status === "approved" && r.workflow_status === "pending_warehouse") {
            details.push("⏳ بانتظار تأكيد إخراج البضاعة من مسئول المخزن")
          }
          merged.push({
            id: `pret-${r.id}`,
            category: "purchase_return",
            doc_label: `مرتجع مشتريات · ${r.return_number ?? r.id.slice(0, 8)}${r.bills?.bill_number ? ` · 🧾 ${r.bills.bill_number}` : ""}`,
            doc_href: `/purchase-returns/${r.id}`,
            party_label: r.suppliers?.name ?? null,
            value_label: `${Number(r.total_amount).toFixed(2)} ${String(r.original_currency || "EGP")}`,
            status: status as any,
            requested_by_email: null,
            requested_by_id: r.created_by ?? null,
            requested_at: r.created_at,
            decided_by_email: null,
            decided_by_id: r.approved_by ?? r.rejected_by ?? null,
            decided_at,
            decision_note: r.rejection_reason ?? null,
            branch_id: r.branch_id ?? null,
            warehouse_id: r.warehouse_id ?? null,
            detail_lines: details.length ? details : null,
          })
        }
      } catch { /* keep going */ }

      merged.sort((a, b) => {
        const ta = a.decided_at ? new Date(a.decided_at).getTime() : new Date(a.requested_at).getTime()
        const tb = b.decided_at ? new Date(b.decided_at).getTime() : new Date(b.requested_at).getTime()
        return tb - ta
      })

      // v3.74.511 — حل إيميلات المنفذين دفعة واحدة (كانت "—" فى كل
      // الأقسام عدا الخصومات التى يثريها الـ API الخاص بها).
      try {
        const idSet = new Set<string>()
        for (const m of merged) {
          if (m.requested_by_id && !m.requested_by_email) idSet.add(m.requested_by_id)
          if (m.decided_by_id && !m.decided_by_email) idSet.add(m.decided_by_id)
        }
        if (idSet.size > 0) {
          const res = await fetch("/api/members-emails", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userIds: Array.from(idSet), companyId: cid }),
          })
          if (res.ok) {
            const j = await res.json().catch(() => ({}))
            const emailMap: Record<string, string> = j?.map || {}
            // v3.74.512 — الاسم أولاً (موظف مرتبط/اسم الحساب) والإيميل fallback
            const nameMap: Record<string, string> = j?.names || {}
            const label = (id: string) => nameMap[id] || emailMap[id] || null
            for (const m of merged) {
              if (!m.requested_by_email && m.requested_by_id) {
                m.requested_by_email = label(m.requested_by_id)
              }
              if (!m.decided_by_email && m.decided_by_id) {
                m.decided_by_email = label(m.decided_by_id)
              }
            }
          }
        }
      } catch { /* best-effort enrichment */ }

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

  const totalPending = bomVersions.length + routingVersions.length + productionOrders.length + materialIssues.length + discountApprovals.length + supplierPayments.length + purchaseReturns.length + salesReturnRequests.length + customerRefunds.length + vendorPaymentCorrections.length + dispatches.length + goodsReceipts.length + writeOffs.length + inventoryTransfers.length + miscApprovals.length + productReceivePending.length + bookingWithdrawals.length
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
              {/* v3.74.579 — ماذا يحدث عند الاعتماد */}
              <p className="text-[11px] text-muted-foreground mt-1 italic">
                ℹ️ {t("عند الاعتماد: تصبح هذه النسخة من قائمة المواد هى المعتمدة وتُستخدم فى أوامر الإنتاج الجديدة — لا يتحرك أى مخزون",
                      "On approval: this BOM version becomes the approved one used for new production orders — no stock moves")}
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
        {/* v3.74.513 — قرار BOM للإدارة فقط؛ مسؤول التصنيع يتابع بلا أزرار */}
        {isAdminLike && (
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
        )}
        {/* Reject reason input */}
        {isAdminLike && rejectId === b.id && (
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
              {/* v3.74.579 — ماذا يحدث عند الاعتماد */}
              <p className="text-[11px] text-muted-foreground mt-1 italic">
                ℹ️ {t("عند الاعتماد: يصبح هذا المسار التصنيعى هو المعتمد وتُستخدم مراحله فى أوامر الإنتاج الجديدة — لا يتحرك أى مخزون",
                      "On approval: this routing version becomes the approved one and its steps are used for new production orders — no stock moves")}
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
        {/* v3.74.513 — قرار مسار التصنيع للإدارة فقط */}
        {isAdminLike && (
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
        )}
        {isAdminLike && rejectId === r.id && (
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
    // v3.74.491 — Stage-aware: pending = management stage,
    // management_approved = warehouse dispatch stage.
    const isWarehouseStage = m.status === "management_approved"
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
                {/* v3.74.579 — ماذا يحدث عند الاعتماد (حسب المرحلة) */}
                <p className="text-[11px] text-muted-foreground mt-1 italic">
                  ℹ️ {isWarehouseStage
                    ? t(`عند تنفيذ الصرف: تُخصم المواد الخام فعلياً من مخزن «${m.warehouse_name}» لصالح أمر الإنتاج`,
                        `On dispatch: the raw materials are actually deducted from "${m.warehouse_name}" for the production order`)
                    : t("عند اعتماد الإدارة: يُخطَر مسئول المخزن لتنفيذ الصرف — لا تُخصم المواد قبل تأكيده",
                        "On management approval: the store manager is notified to dispatch — materials are not deducted until he confirms")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className={isWarehouseStage
                ? "text-xs bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300"
                : "text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"}>
                <Clock className="w-3 h-3 me-1" />
                {isWarehouseStage ? t("استكمال صرف المخزن", "Warehouse Dispatch") : t("انتظار الإدارة", "Pending Management")}
              </Badge>
              <Link href={`/manufacturing/production-orders`} className="text-xs text-teal-600 hover:underline">{t("عرض", "View")}</Link>
            </div>
          </div>
          {/* v3.74.513 — مرحلة الإدارة: مالك/أدمن/مدير عام؛ مرحلة الصرف:
              مسؤولو المخازن + الإدارة (مطابق لأدوار الخادم) */}
          {(isWarehouseStage ? (canApproveReceipt || myRole === 'warehouse_manager') : isAdminLike) && (
          <div className="flex gap-2 mt-3 flex-wrap">
            <Button
              size="sm" className={isWarehouseStage ? "gap-1 bg-cyan-600 hover:bg-cyan-700 text-white text-xs" : "gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs"}
              disabled={runningId === m.id}
              onClick={() => handleApprove(m, isWarehouseStage ? "warehouse" : "management")}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {isWarehouseStage ? t("تنفيذ صرف المخزن", "Approve Warehouse Dispatch") : t("اعتماد الإدارة", "Management Approve")}
            </Button>
            <Button
              size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 text-xs"
              disabled={runningId === m.id}
              onClick={() => { setRejectId(m.id); setRejectType("material_issue"); setRejectReason("") }}
            >
              <XCircle className="w-3.5 h-3.5" />{t("رفض", "Reject")}
            </Button>
          </div>
          )}
          {(isWarehouseStage ? (canApproveReceipt || myRole === 'warehouse_manager') : isAdminLike) && rejectId === m.id && (
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
    // v3.74.509 — قرار الخصم: مالك/أدمن/مدير عام (مطابق لبوابة الخادم can_approve_discount)
    canDecide: isAdminLike,
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
              {/* v3.74.579 — ماذا يحدث عند الاعتماد */}
              <p className="text-[11px] text-muted-foreground mt-1 italic">
                ℹ️ {t("عند الاعتماد: يُسمح ببدء تنفيذ أمر الإنتاج وطلب صرف المواد الخام له — لا يُخصم المخزون إلا بعد اعتماد الصرف",
                      "On approval: the production order can start and material issue can be requested — stock is only deducted after the issue is approved")}
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
        {/* v3.74.513 — قرار أمر الإنتاج للإدارة فقط */}
        {isAdminLike && (
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
        )}
        {isAdminLike && rejectId === p.id && (
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

          {/* v3.74.486 — friendly gate for roles with no approval workflows */}
          {hasNoApprovalRole ? (
            <Card>
              <CardContent className="py-10 text-center">
                <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-6 h-6 text-slate-500" />
                </div>
                <p className="font-semibold text-sm mb-1">
                  {t("لا توجد اعتمادات لدورك", "No approvals for your role")}
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {t(
                    "دورك الحالى لا يشارك فى أى دورة اعتماد. راجع مدير النظام إذا كنت تحتاج صلاحيات إضافية.",
                    "Your current role does not participate in any approval workflows. Contact your admin if you need extra permissions."
                  )}
                </p>
              </CardContent>
            </Card>
          ) : (
          <>
          {/* Tabs */}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant={activeTab === "all"     ? "default" : "outline"} onClick={() => setActiveTab("all")}     className="gap-1">
              {t("الكل", "All")} ({totalPending})
            </Button>
            {/* v3.74.486 — tabs filtered by role. Owner/admin/GM see all;
                every other role only sees the workflows they participate in. */}
            {canShow("bom") && (
              <Button size="sm" variant={activeTab === "bom"     ? "default" : "outline"} onClick={() => setActiveTab("bom")}     className="gap-1">
                <Layers   className="w-3.5 h-3.5" />{t("قوائم المواد", "BOMs")} ({bomVersions.length})
              </Button>
            )}
            {canShow("routing") && (
              <Button size="sm" variant={activeTab === "routing" ? "default" : "outline"} onClick={() => setActiveTab("routing")} className="gap-1">
                <GitMerge className="w-3.5 h-3.5" />{t("مسارات التصنيع", "Routings")} ({routingVersions.length})
              </Button>
            )}
            {canShow("po") && (
              <Button size="sm" variant={activeTab === "po"      ? "default" : "outline"} onClick={() => setActiveTab("po")}      className="gap-1">
                <Factory  className="w-3.5 h-3.5" />{t("أوامر الإنتاج", "Production Orders")} ({productionOrders.length})
              </Button>
            )}
            {canShow("mi") && (
              <Button size="sm" variant={activeTab === "mi"      ? "default" : "outline"} onClick={() => setActiveTab("mi")}      className="gap-1">
                <Package  className="w-3.5 h-3.5" />{t("طلبات الصرف", "Material Issues")} ({materialIssues.length})
              </Button>
            )}
            {/* v3.74.488 — manufacturing product receive pending */}
            {canShow("pr") && (
              <Button size="sm" variant={activeTab === "pr" ? "default" : "outline"} onClick={() => setActiveTab("pr")} className="gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />{t("استلام إنتاج", "Product Receive")} ({productReceivePending.length})
              </Button>
            )}
            {canShow("disc") && (
              <Button size="sm" variant={activeTab === "disc"    ? "default" : "outline"} onClick={() => setActiveTab("disc")}    className="gap-1">
                <Percent  className="w-3.5 h-3.5" />{t("خصومات", "Discounts")} ({discountApprovals.length})
              </Button>
            )}
            {canShow("pay") && (
              <Button size="sm" variant={activeTab === "pay" ? "default" : "outline"} onClick={() => setActiveTab("pay")} className="gap-1">
                <Wallet className="w-3.5 h-3.5" />{t("دفعات موردين", "Supplier Payments")} ({supplierPayments.length})
              </Button>
            )}
            {canShow("pret") && (
              <Button size="sm" variant={activeTab === "pret" ? "default" : "outline"} onClick={() => setActiveTab("pret")} className="gap-1">
                <RefreshCw className="w-3.5 h-3.5" />{t("مرتجعات مشتريات", "Purchase Returns")} ({purchaseReturns.length})
              </Button>
            )}
            {canShow("sret") && (
              <Button size="sm" variant={activeTab === "sret" ? "default" : "outline"} onClick={() => setActiveTab("sret")} className="gap-1">
                <RefreshCw className="w-3.5 h-3.5" />{t("مرتجعات مبيعات", "Sales Returns")} ({salesReturnRequests.length})
              </Button>
            )}
            {canShow("cref") && (
              <Button size="sm" variant={activeTab === "cref" ? "default" : "outline"} onClick={() => setActiveTab("cref")} className="gap-1">
                <Wallet className="w-3.5 h-3.5" />{t("استرداد عملاء", "Customer Refunds")} ({customerRefunds.length})
              </Button>
            )}
            {canShow("vcor") && (
              <Button size="sm" variant={activeTab === "vcor" ? "default" : "outline"} onClick={() => setActiveTab("vcor")} className="gap-1">
                <Wallet className="w-3.5 h-3.5" />{t("تصحيح دفعات موردين", "Vendor Corrections")} ({vendorPaymentCorrections.length})
              </Button>
            )}
            {canShow("disp") && (
              <Button size="sm" variant={activeTab === "disp" ? "default" : "outline"} onClick={() => setActiveTab("disp")} className="gap-1">
                <Package className="w-3.5 h-3.5" />{t("موافقات الإرسال", "Dispatch")} ({dispatches.length})
              </Button>
            )}
            {canShow("bwd") && (
              <Button size="sm" variant={activeTab === "bwd" ? "default" : "outline"} onClick={() => setActiveTab("bwd")} className="gap-1">
                <Package className="w-3.5 h-3.5" />{t("سحب مخزون الحجوزات", "Booking Withdrawals")} ({bookingWithdrawals.length})
              </Button>
            )}
            {canShow("recv") && (
              <Button size="sm" variant={activeTab === "recv" ? "default" : "outline"} onClick={() => setActiveTab("recv")} className="gap-1">
                <Package className="w-3.5 h-3.5" />{t("الاستلام المخزنى", "Goods Receipt")} ({goodsReceipts.length})
              </Button>
            )}
            {canShow("wo") && (
              <Button size="sm" variant={activeTab === "wo" ? "default" : "outline"} onClick={() => setActiveTab("wo")} className="gap-1">
                <XCircle className="w-3.5 h-3.5" />{t("إهلاك المخزون", "Write-offs")} ({writeOffs.length})
              </Button>
            )}
            {canShow("tr") && (
              <Button size="sm" variant={activeTab === "tr" ? "default" : "outline"} onClick={() => setActiveTab("tr")} className="gap-1">
                <GitMerge className="w-3.5 h-3.5" />{t("تحويلات المخزون", "Transfers")} ({inventoryTransfers.length})
              </Button>
            )}
            {canShow("misc") && (
              <Button size="sm" variant={activeTab === "misc" ? "default" : "outline"} onClick={() => setActiveTab("misc")} className="gap-1">
                <AlertCircle className="w-3.5 h-3.5" />{t("طلبات متنوعة", "Other Requests")} ({miscApprovals.length})
              </Button>
            )}
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
              {/* v3.74.489 — branch + warehouse filter row. Owner/admin/GM
                  choose freely; other roles see a read-only chip that
                  reflects their scope so they know what's being shown. */}
              {isAdminLike ? (
                <div className="flex gap-2 flex-wrap items-center mb-3">
                  <span className="text-xs text-muted-foreground">{t("فلترة السجل:", "Filter history:")}</span>
                  <select
                    className="text-xs border rounded px-2 py-1 bg-white dark:bg-slate-900"
                    value={historyBranchFilter}
                    onChange={e => { setHistoryBranchFilter(e.target.value); setHistoryWarehouseFilter("all") }}
                  >
                    <option value="all">🏢 {t("كل الفروع", "All branches")}</option>
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>🏢 {b.name}</option>
                    ))}
                  </select>
                  <select
                    className="text-xs border rounded px-2 py-1 bg-white dark:bg-slate-900"
                    value={historyWarehouseFilter}
                    onChange={e => setHistoryWarehouseFilter(e.target.value)}
                  >
                    <option value="all">🏬 {t("كل المخازن", "All warehouses")}</option>
                    {warehouses
                      .filter(w => historyBranchFilter === "all" || w.branch_id === historyBranchFilter)
                      .map(w => (
                        <option key={w.id} value={w.id}>🏬 {w.name}</option>
                      ))}
                  </select>
                  {(historyBranchFilter !== "all" || historyWarehouseFilter !== "all") && (
                    <button
                      className="text-xs text-slate-500 hover:text-slate-700 underline"
                      onClick={() => { setHistoryBranchFilter("all"); setHistoryWarehouseFilter("all") }}
                    >
                      {t("مسح الفلاتر", "Clear filters")}
                    </button>
                  )}
                </div>
              ) : (myBranchId || myWarehouseId) && (
                <div className="flex gap-2 flex-wrap items-center mb-3 text-xs">
                  <span className="text-muted-foreground">{t("العرض مقيّد بنطاقك:", "View limited to your scope:")}</span>
                  {myBranchId && (
                    <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      🏢 {branches.find(b => b.id === myBranchId)?.name ?? myBranchId.slice(0,8)}
                    </Badge>
                  )}
                  {myWarehouseId && (
                    <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      🏬 {warehouses.find(w => w.id === myWarehouseId)?.name ?? myWarehouseId.slice(0,8)}
                    </Badge>
                  )}
                </div>
              )}
              {/* Category filter chips */}
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant={historyFilter === "all" ? "default" : "outline"} className="text-xs h-7" onClick={() => setHistoryFilter("all")}>
                  {t("الكل", "All")} ({history.length})
                </Button>
                {/* v3.74.487 — history filter chips filtered by role,
                    same matrix as the pending inbox tabs. */}
                {canShowHistory("discount") && (
                  <Button size="sm" variant={historyFilter === "discount" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("discount")}>
                    <Percent className="w-3 h-3" />{t("خصومات", "Discounts")} ({history.filter(h => h.category === "discount").length})
                  </Button>
                )}
                {canShowHistory("bom_version") && (
                  <Button size="sm" variant={historyFilter === "bom_version" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("bom_version")}>
                    <Layers className="w-3 h-3" />{t("قوائم المواد", "BOMs")} ({history.filter(h => h.category === "bom_version").length})
                  </Button>
                )}
                {canShowHistory("routing_version") && (
                  <Button size="sm" variant={historyFilter === "routing_version" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("routing_version")}>
                    <GitMerge className="w-3 h-3" />{t("مسارات التصنيع", "Routings")} ({history.filter(h => h.category === "routing_version").length})
                  </Button>
                )}
                {canShowHistory("production_order") && (
                  <Button size="sm" variant={historyFilter === "production_order" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("production_order")}>
                    <Factory className="w-3 h-3" />{t("أوامر الإنتاج", "Production Orders")} ({history.filter(h => h.category === "production_order").length})
                  </Button>
                )}
                {canShowHistory("product_receive") && (
                  <Button size="sm" variant={historyFilter === "product_receive" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("product_receive")}>
                    <CheckCircle2 className="w-3 h-3" />{t("استلام إنتاج", "Product Receive")} ({history.filter(h => h.category === "product_receive").length})
                  </Button>
                )}
                {canShowHistory("material_issue") && (
                  <Button size="sm" variant={historyFilter === "material_issue" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("material_issue")}>
                    <Package className="w-3 h-3" />{t("طلبات الصرف", "Material Issues")} ({history.filter(h => h.category === "material_issue").length})
                  </Button>
                )}
                {canShowHistory("supplier_payment") && (
                  <Button size="sm" variant={historyFilter === "supplier_payment" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("supplier_payment")}>
                    <Wallet className="w-3 h-3" />{t("دفعات موردين", "Supplier Payments")} ({history.filter(h => h.category === "supplier_payment").length})
                  </Button>
                )}
                {canShowHistory("purchase_return") && (
                  <Button size="sm" variant={historyFilter === "purchase_return" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("purchase_return")}>
                    <RefreshCw className="w-3 h-3" />{t("مرتجعات مشتريات", "Purchase Returns")} ({history.filter(h => h.category === "purchase_return").length})
                  </Button>
                )}
                {canShowHistory("sales_return_request") && (
                  <Button size="sm" variant={historyFilter === "sales_return_request" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("sales_return_request")}>
                    <RefreshCw className="w-3 h-3" />{t("مرتجعات مبيعات", "Sales Returns")} ({history.filter(h => h.category === "sales_return_request").length})
                  </Button>
                )}
                {canShowHistory("customer_refund") && (
                  <Button size="sm" variant={historyFilter === "customer_refund" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("customer_refund")}>
                    <Wallet className="w-3 h-3" />{t("استرداد عملاء", "Customer Refunds")} ({history.filter(h => h.category === "customer_refund").length})
                  </Button>
                )}
                {canShowHistory("vendor_payment_correction") && (
                  <Button size="sm" variant={historyFilter === "vendor_payment_correction" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("vendor_payment_correction")}>
                    <Wallet className="w-3 h-3" />{t("تصحيح دفعات", "Vendor Corrections")} ({history.filter(h => h.category === "vendor_payment_correction").length})
                  </Button>
                )}
                {canShowHistory("dispatch") && (
                  <Button size="sm" variant={historyFilter === "dispatch" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("dispatch")}>
                    <Package className="w-3 h-3" />{t("موافقات الإرسال", "Dispatch")} ({history.filter(h => h.category === "dispatch").length})
                  </Button>
                )}
                {canShowHistory("goods_receipt") && (
                  <Button size="sm" variant={historyFilter === "goods_receipt" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("goods_receipt")}>
                    <Package className="w-3 h-3" />{t("استلام مخزنى", "Goods Receipt")} ({history.filter(h => h.category === "goods_receipt").length})
                  </Button>
                )}
                {canShowHistory("write_off") && (
                  <Button size="sm" variant={historyFilter === "write_off" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("write_off")}>
                    <XCircle className="w-3 h-3" />{t("إهلاك المخزون", "Write-offs")} ({history.filter(h => h.category === "write_off").length})
                  </Button>
                )}
                {canShowHistory("inventory_transfer") && (
                  <Button size="sm" variant={historyFilter === "inventory_transfer" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("inventory_transfer")}>
                    <GitMerge className="w-3 h-3" />{t("تحويلات المخزون", "Transfers")} ({history.filter(h => h.category === "inventory_transfer").length})
                  </Button>
                )}
                {canShowHistory("misc") && (
                  <Button size="sm" variant={historyFilter === "misc" ? "default" : "outline"} className="text-xs h-7 gap-1" onClick={() => setHistoryFilter("misc")}>
                    <AlertCircle className="w-3 h-3" />{t("طلبات متنوعة", "Other")} ({history.filter(h => h.category === "misc").length})
                  </Button>
                )}
              </div>
              {(() => {
                // v3.74.487 — "All" respects role visibility: only
                // include categories this role can see, so a store
                // manager clicking "الكل" doesn't get payment or
                // discount rows in their history.
                const roleScoped = history.filter(h => canShowHistory(h.category))
                // v3.74.489 — apply branch + warehouse filter. For
                // owner/admin/GM the filter is user-controlled; for
                // any other role it is locked to their own scope
                // (RLS on the source tables already filters out
                // rows outside their reach; the ==== forces the
                // filter to also match on the client so a wider RLS
                // scope wouldn't leak data).
                const scopedByBranch = roleScoped.filter(h => {
                  if (isAdminLike) {
                    if (historyBranchFilter !== "all" && h.branch_id && h.branch_id !== historyBranchFilter) return false
                    if (historyWarehouseFilter !== "all" && h.warehouse_id && h.warehouse_id !== historyWarehouseFilter) return false
                    return true
                  }
                  if (myBranchId && h.branch_id && h.branch_id !== myBranchId) return false
                  if (myWarehouseId && h.warehouse_id && h.warehouse_id !== myWarehouseId) return false
                  return true
                })
                const filtered = historyFilter === "all" ? scopedByBranch : scopedByBranch.filter(h => h.category === historyFilter)
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
                return filtered.map(h => <UnifiedHistoryCard key={h.id} h={h} ctx={{ appLang, t, fmtDate, fmtMoney }} />)
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

              {/* v3.74.472 — Supplier payments awaiting owner/GM approval. */}
              {(activeTab === "all" || activeTab === "pay") && supplierPayments.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <Wallet className="w-4 h-4" />{t("اعتمادات دفعات الموردين", "Supplier Payment Approvals")}
                  </h2>
                  {supplierPayments.map(p => (
                    <Card key={p.id} className="border-l-4 border-l-indigo-500">
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg shrink-0">
                              <Wallet className="w-4 h-4 text-indigo-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm">
                                {t("دفعة مورد", "Supplier Payment")} · {p.payment_no ?? t("بدون رقم", "(no number)")}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                🏭 <span className="font-semibold text-foreground">{p.supplier_name ?? "—"}</span>
                                {p.bill_no ? (
                                  <>
                                    {" "}· 🧾 {t("فاتورة", "Bill")}: <span className="font-semibold">{p.bill_no}</span>
                                    {/* v3.74.523 — PO the bill was raised against */}
                                    {p.po_no && <> · 📄 {t("أمر شراء", "PO")}: <span className="font-semibold">{p.po_no}</span></>}
                                    {/* v3.74.523 — flag multi-bill splits */}
                                    {p.allocation_count > 1 && (
                                      <> · <span className="text-indigo-700 dark:text-indigo-300 font-semibold">
                                        + {p.allocation_count - 1} {t("فاتورة أخرى", "more bill(s)")}
                                      </span></>
                                    )}
                                  </>
                                ) : (
                                  // v3.74.522 — payments without allocations
                                  // are on-account advances/settlements.
                                  <> · 🧾 <span className="font-semibold text-amber-700 dark:text-amber-400">{t("دفع على الحساب (بدون فاتورة)", "On-account (no bill)")}</span></>
                                )}
                              </p>
                              {/* v3.74.521 — bill outstanding vs. payment amount.
                                  v3.74.527 — outstanding is now labelled with the
                                  BILL's own currency (was mis-labelled as the
                                  payment currency, which lied when they differ).
                                  Overpayment comparison uses base-currency
                                  amounts so USD 0.10 vs. EGP 7.34 isn't compared
                                  as raw numbers. */}
                              {/* v3.74.579 — سياق الفاتورة الكامل: كم كانت، كم دُفع، كم أُرجع */}
                              {p.bill_total != null && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  🧮 {t("إجمالى الفاتورة", "Bill total")}: <span className="font-medium text-foreground">{fmtMoney(p.bill_total)}</span>
                                  {p.bill_paid != null && <> · {t("مدفوع سابقاً", "Paid so far")}: <span className="font-medium text-foreground">{fmtMoney(p.bill_paid)}</span></>}
                                  {p.bill_returned != null && p.bill_returned > 0 && <> · {t("مرتجعات", "Returns")}: <span className="font-medium text-foreground">{fmtMoney(p.bill_returned)}</span></>}
                                  {" "}{p.bill_currency || "EGP"}
                                </p>
                              )}
                              {p.bill_outstanding != null && (() => {
                                const billCcy = p.bill_currency || "EGP"
                                // Convert both sides to base (EGP) for a fair
                                // comparison. Payment: use base_amount if set,
                                // else amount when currency = base.
                                const payInBase = p.base_amount != null
                                  ? p.base_amount
                                  : (p.currency === "EGP" ? p.amount : null)
                                const outstandingInBase = billCcy === "EGP" ? p.bill_outstanding : null
                                const isOverpay = payInBase != null && outstandingInBase != null && payInBase > outstandingInBase + 0.01
                                return (
                                  <p className="text-xs mt-0.5">
                                    <span className="text-muted-foreground">{t("متبقى الفاتورة", "Bill outstanding")}: </span>
                                    <span className={`font-semibold ${isOverpay ? "text-red-600" : "text-emerald-600"}`}>
                                      {fmtMoney(p.bill_outstanding)} {billCcy}
                                    </span>
                                    {isOverpay && (
                                      <span className="ms-1 text-red-600 font-bold">
                                        · ⚠️ {t("الدفعة أكبر من المتبقى", "Overpayment")}
                                      </span>
                                    )}
                                  </p>
                                )
                              })()}
                              <p className="text-xs mt-1">
                                <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                                  💰 {t("القيمة", "Amount")}: {fmtMoney(p.amount)} {p.currency}
                                </span>
                                {/* v3.74.521 — FX rate + base equivalent for non-EGP payments */}
                                {p.currency !== "EGP" && p.base_amount != null && (
                                  <span className="ms-2 text-muted-foreground">
                                    ≈ {fmtMoney(p.base_amount)} {p.base_currency}
                                    {p.exchange_rate != null && <> · {t("سعر الصرف", "FX")}: {p.exchange_rate.toFixed(4)}</>}
                                  </span>
                                )}
                              </p>
                              {/* v3.74.521 — payment method + source account */}
                              {(p.payment_method || p.account_name) && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  💳 {p.payment_method === "cash" ? t("نقدى", "Cash")
                                      : p.payment_method === "bank" || p.payment_method === "bank_transfer" ? t("تحويل بنكى", "Bank transfer")
                                      : p.payment_method === "check" || p.payment_method === "cheque" ? t("شيك", "Check")
                                      : p.payment_method ?? t("طريقة الدفع", "Method")}
                                  {p.account_name && <> · 🏦 <span className="font-medium text-foreground">{p.account_name}</span></>}
                                  {p.account_currency && p.account_currency !== p.currency && (
                                    <span className="ms-1 text-amber-600">
                                      ⚠️ {t("عملة الحساب", "Account currency")}: {p.account_currency}
                                    </span>
                                  )}
                                </p>
                              )}
                              {p.branch_name && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  🏢 {p.branch_name}{p.warehouse_name && <> · 🏬 {p.warehouse_name}</>}
                                </p>
                              )}
                              {/* v3.74.521 — actual payment date + requested-at + requester */}
                              <p className="text-xs text-muted-foreground mt-1">
                                📅 {t("تاريخ الدفع", "Payment date")}: {fmtDate(p.payment_date || p.requested_at)}
                                <> · ⏱️ {t("طُلب فى", "Requested")}: {fmtDate(p.requested_at)}</>
                              </p>
                              {p.requested_by_email && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  ✍️ {t("طلب الاعتماد", "Requested by")}: <span className="font-medium">{p.requested_by_email}</span>
                                </p>
                              )}
                              {/* v3.74.521 — accountant's note gives owner the "why" */}
                              {p.notes && (
                                <p className="text-xs mt-1 p-1.5 bg-amber-50 dark:bg-amber-900/20 rounded border-l-2 border-amber-400">
                                  📝 {p.notes}
                                </p>
                              )}
                              {/* v3.74.579 — ماذا يحدث عند الاعتماد */}
                              <p className="text-[11px] text-muted-foreground mt-1 italic">
                                ℹ️ {t("عند الاعتماد: يُسجَّل قيد الدفع، يُخصم المبلغ من الحساب المحدد، ويُخفَّض المتبقى على الفاتورة ورصيد المورد",
                                      "On approval: the payment is posted, the amount leaves the selected account, and the bill outstanding + supplier balance are reduced")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
                              <Clock className="w-3 h-3 me-1" />{t("انتظار اعتماد", "Pending Approval")}
                            </Badge>
                            {p.bill_id && (
                              <Link href={`/bills/${p.bill_id}`} className="text-xs text-indigo-600 hover:underline">
                                {t("عرض الفاتورة", "View bill")}
                              </Link>
                            )}
                          </div>
                        </div>
                        {/* v3.74.509 — قرار الدفعة للمالك/المدير العام فقط (مطابق للـ RPC) */}
                        {isOwnerOrGm && (
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                            disabled={runningId === p.id}
                            onClick={async () => {
                              try {
                                setRunningId(p.id)
                                const res = await fetch(`/api/supplier-payments/${encodeURIComponent(p.id)}/approve`, {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `pay:${p.id}:approve:${Date.now()}`,
                                  },
                                  body: JSON.stringify({ action: "APPROVE", uiSurface: "approvals_inbox", appLang }),
                                })
                                const j = await res.json().catch(() => ({}))
                                if (!res.ok || j.success === false) {
                                  throw new Error(j.error || (appLang === 'en' ? 'Approve failed' : 'تعذر اعتماد الدفعة'))
                                }
                                toast({ title: t("تم الاعتماد", "Approved"), description: t("تم اعتماد الدفعة بنجاح", "Payment approved") })
                                await load()
                              } catch (e: any) {
                                toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                              } finally {
                                setRunningId(null)
                              }
                            }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />{t("اعتماد الدفعة", "Approve Payment")}
                          </Button>
                          <Button
                            size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 text-xs"
                            disabled={runningId === p.id}
                            onClick={() => { setRejectId(p.id); setRejectType("supplier_payment"); setRejectReason("") }}
                          >
                            <XCircle className="w-3.5 h-3.5" />{t("رفض", "Reject")}
                          </Button>
                        </div>
                        )}
                        {isOwnerOrGm && rejectId === p.id && (
                          <div className="mt-3 space-y-2">
                            <textarea
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                              placeholder={t("سبب الرفض...", "Rejection reason...")}
                              rows={2}
                              className="w-full text-sm p-2 border rounded"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm" variant="destructive"
                                disabled={!rejectReason.trim() || runningId === p.id}
                                onClick={async () => {
                                  try {
                                    setRunningId(p.id)
                                    const res = await fetch(`/api/supplier-payments/${encodeURIComponent(p.id)}/approve`, {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                        "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `pay:${p.id}:reject:${Date.now()}`,
                                      },
                                      body: JSON.stringify({ action: "REJECT", rejectionReason: rejectReason, uiSurface: "approvals_inbox", appLang }),
                                    })
                                    const j = await res.json().catch(() => ({}))
                                    if (!res.ok || j.success === false) {
                                      throw new Error(j.error || (appLang === 'en' ? 'Reject failed' : 'تعذر رفض الدفعة'))
                                    }
                                    toast({ title: t("تم الرفض", "Rejected"), description: t("تم رفض الدفعة", "Payment rejected") })
                                    setRejectId(null); setRejectReason("")
                                    await load()
                                  } catch (e: any) {
                                    toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                                  } finally {
                                    setRunningId(null)
                                  }
                                }}
                              >
                                {t("تأكيد الرفض", "Confirm Reject")}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setRejectId(null); setRejectReason("") }}>
                                {t("إلغاء", "Cancel")}
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* v3.74.480 — Misc pending approvals (link-out). */}
              {(activeTab === "all" || activeTab === "misc") && miscApprovals.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />{t("طلبات اعتماد متنوعة", "Other Pending Approvals")}
                  </h2>
                  {miscApprovals.map(m => {
                    const kindLabel =
                      m.kind === "purchase_request" ? t("طلب شراء", "Purchase Request") :
                      m.kind === "bank_voucher" ? t("سند بنكى", "Bank Voucher") :
                      m.kind === "expense" ? t("مصروف", "Expense") :
                      m.kind === "customer_debit_note" ? t("إشعار مدين عميل", "Customer Debit Note") :
                      m.kind === "permission_transfer" ? t("نقل صلاحيات", "Permission Transfer") :
                      m.kind
                    const color =
                      m.kind === "purchase_request" ? "border-l-purple-500 bg-purple-100 dark:bg-purple-900/30 text-purple-600" :
                      m.kind === "bank_voucher" ? "border-l-emerald-500 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600" :
                      m.kind === "expense" ? "border-l-yellow-500 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600" :
                      m.kind === "customer_debit_note" ? "border-l-fuchsia-500 bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-600" :
                      "border-l-gray-500 bg-gray-100 dark:bg-gray-800 text-gray-600"
                    const [borderColor, bgColor, textColor] = color.split(" ")
                    return (
                      <Card key={m.id} className={`border-l-4 ${borderColor}`}>
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className={`p-2 rounded-lg shrink-0 ${bgColor}`}>
                                <AlertCircle className={`w-4 h-4 ${textColor}`} />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-sm">
                                  {kindLabel} · {m.doc_no ?? m.id.slice(0, 6)}
                                </p>
                                {m.party_or_label && (
                                  <p className="text-xs text-muted-foreground mt-0.5">👤 {m.party_or_label}</p>
                                )}
                                {m.amount > 0 && (
                                  <p className="text-xs mt-1">
                                    <span className={`font-semibold ${textColor}`}>
                                      {t("القيمة", "Amount")}: {fmtMoney(m.amount)}
                                    </span>
                                  </p>
                                )}
                                {m.branch_name && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    🏢 {m.branch_name}{m.warehouse_name && <> · 🏬 {m.warehouse_name}</>}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">📅 {fmtDate(m.requested_at)}</p>
                                {m.requested_by_label && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    ✍️ {t("طلب الاعتماد", "Requested by")}: <span className="font-medium">{m.requested_by_label}</span>
                                  </p>
                                )}
                                {/* v3.74.579 — ماذا يحدث عند الاعتماد */}
                                <p className="text-[11px] text-muted-foreground mt-1 italic">
                                  ℹ️ {t("الموافقة تنفّذ الطلب الموضح أعلاه من صفحته المخصصة", "Approval executes the request shown above from its dedicated page")}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
                                <Clock className="w-3 h-3 me-1" />{t("انتظار اعتماد", "Pending Approval")}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <Link href={m.href} className="inline-block">
                              <Button size="sm" className="gap-1 bg-slate-700 hover:bg-slate-800 text-white text-xs">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {t("فتح صفحة المستند", "Open document")}
                              </Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}

              {/* v3.74.479 — Inventory write-offs (link out to details page). */}
              {(activeTab === "all" || activeTab === "wo") && writeOffs.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <XCircle className="w-4 h-4" />{t("اعتمادات إهلاك المخزون", "Inventory Write-off Approvals")}
                  </h2>
                  {writeOffs.map(w => (
                    <Card key={w.id} className="border-l-4 border-l-rose-500">
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="p-2 bg-rose-100 dark:bg-rose-900/30 rounded-lg shrink-0">
                              <XCircle className="w-4 h-4 text-rose-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm">
                                {t("طلب إهلاك مخزون", "Inventory Write-off")} · {w.write_off_no ?? w.id.slice(0, 6)}
                              </p>
                              <p className="text-xs mt-1">
                                <span className="font-semibold text-rose-700 dark:text-rose-300">
                                  {t("قيمة الإهلاك", "Write-off cost")}: {fmtMoney(w.total_cost)}
                                </span>
                              </p>
                              {w.reason && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">📝 {w.reason}</p>}
                              {w.branch_name && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  🏢 {w.branch_name}{w.warehouse_name && <> · 🏬 {w.warehouse_name}</>}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">📅 {fmtDate(w.requested_at)}</p>
                              {/* v3.74.579 — ماذا يحدث عند الاعتماد */}
                              <p className="text-[11px] text-muted-foreground mt-1 italic">
                                ℹ️ {t("عند الاعتماد (من صفحة التفاصيل): يُخصم المخزون المُهلَك نهائياً وتُسجَّل قيمته كمصروف على الحسابات المختارة",
                                      "On approval (from the details page): the written-off stock is deducted permanently and its cost is posted as an expense to the chosen accounts")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
                              <Clock className="w-3 h-3 me-1" />{t("انتظار اعتماد", "Pending Approval")}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <Link href={`/inventory/write-offs`} className="inline-block">
                            <Button size="sm" className="gap-1 bg-rose-600 hover:bg-rose-700 text-white text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {t("اعتماد من صفحة التفاصيل", "Approve on details page")}
                            </Button>
                          </Link>
                          <p className="text-xs text-muted-foreground self-center">
                            {t("(يتطلب اختيار حسابات المصروف والمخزون)", "(requires account selection)")}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* v3.74.479 — Inventory transfers (multi-stage — details page). */}
              {(activeTab === "all" || activeTab === "tr") && inventoryTransfers.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <GitMerge className="w-4 h-4" />{t("اعتمادات تحويلات المخزون", "Inventory Transfer Approvals")}
                  </h2>
                  {inventoryTransfers.map(it => {
                    const stageLabel =
                      it.status === "pending_approval" ? t("اعتماد إدارى", "Management approval") :
                      it.status === "pending" ? t("موافقة مصدر المخزون", "Source warehouse") :
                      it.status === "in_transit" ? t("استلام وجهة", "Destination receive") :
                      it.status
                    return (
                      <Card key={it.id} className="border-l-4 border-l-blue-500">
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg shrink-0">
                                <GitMerge className="w-4 h-4 text-blue-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-sm">
                                  {t("تحويل مخزون", "Inventory Transfer")} · {it.transfer_no ?? it.id.slice(0, 6)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {it.from_warehouse ?? "—"} → {it.to_warehouse ?? "—"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">📅 {fmtDate(it.requested_at)}</p>
                                {/* v3.74.579 — ماذا يحدث عند الموافقة (حسب المرحلة) */}
                                <p className="text-[11px] text-muted-foreground mt-1 italic">
                                  ℹ️ {it.status === "pending_approval"
                                    ? t("عند الاعتماد الإدارى: يُخطَر مخزن المصدر لبدء النقل — لا يتحرك المخزون بعد",
                                        "On management approval: the source warehouse is notified to start the transfer — no stock moves yet")
                                    : it.status === "in_transit"
                                      ? t("عند استلام الوجهة: تُضاف الكميات إلى مخزن الوجهة ويكتمل التحويل",
                                          "On destination receive: the quantities are added to the destination warehouse and the transfer completes")
                                      : t("عند بدء النقل: تُخصم الكميات من مخزن المصدر وتصبح البضاعة فى الطريق إلى الوجهة",
                                          "On dispatch: the quantities are deducted from the source warehouse and the goods are in transit to the destination")}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs">
                                <Clock className="w-3 h-3 me-1" />{stageLabel}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3">
                            <Link href={`/inventory-transfers/${it.id}`} className="inline-block">
                              <Button size="sm" className="gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {t("فتح صفحة التحويل", "Open transfer")}
                              </Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}

              {/* v3.74.488 — Manufacturing product receive pending approvals. */}
              {(activeTab === "all" || activeTab === "pr") && productReceivePending.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />{t("اعتمادات استلام منتجات التصنيع", "Manufacturing Product Receive Approvals")}
                  </h2>
                  {productReceivePending.map(r => (
                    <Card key={r.id} className="border-l-4 border-l-cyan-500">
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg shrink-0">
                              <CheckCircle2 className="w-4 h-4 text-cyan-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm">
                                {t("طلب استلام منتج", "Product Receive")} · {t("أمر", "Order")} {r.order_no ?? "—"}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                🏭 {r.product_name ?? "—"}
                              </p>
                              <p className="text-xs mt-1">
                                <span className="font-semibold text-cyan-700 dark:text-cyan-300">
                                  {t("الكمية المقترحة", "Proposed quantity")}: {r.proposed_quantity}
                                </span>
                              </p>
                              {r.branch_name && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  🏢 {r.branch_name}{r.warehouse_name && <> · 🏬 {r.warehouse_name}</>}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">📅 {fmtDate(r.requested_at)}</p>
                              {/* v3.74.579 — ماذا يحدث عند الاعتماد */}
                              <p className="text-[11px] text-muted-foreground mt-1 italic">
                                ℹ️ {t("عند اعتماد الاستلام: تُضاف الكمية المنتجة إلى مخزون المنتج التام بتكلفة التصنيع الفعلية، وقد يكتمل أمر الإنتاج تلقائياً إذا اكتملت الكمية",
                                      "On receipt approval: the produced quantity is added to finished-goods stock at actual manufacturing cost, and the production order auto-completes when fully received")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
                              <Clock className="w-3 h-3 me-1" />{t("انتظار اعتماد", "Pending Approval")}
                            </Badge>
                          </div>
                        </div>
                        {/* v3.74.509 — قرار استلام التصنيع لمسؤولى المخازن والإدارة فقط */}
                        {canApproveReceipt && (
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                            disabled={runningId === r.id}
                            onClick={async () => {
                              try {
                                setRunningId(r.id)
                                const res = await fetch(`/api/manufacturing/product-receive-approvals/${encodeURIComponent(r.id)}/approve`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({}),
                                })
                                const j = await res.json().catch(() => ({}))
                                if (!res.ok || j.success === false) throw new Error(j.error || (appLang === 'en' ? 'Approve failed' : 'تعذر الاعتماد'))
                                toast({ title: t("تم الاعتماد", "Approved"), description: t("تم اعتماد استلام المنتج", "Product receive approved") })
                                await load()
                              } catch (e: any) {
                                toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                              } finally {
                                setRunningId(null)
                              }
                            }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />{t("اعتماد الاستلام", "Approve Receipt")}
                          </Button>
                          <Button
                            size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 text-xs"
                            disabled={runningId === r.id}
                            onClick={() => { setRejectId(r.id); setRejectType("product_receive"); setRejectReason("") }}
                          >
                            <XCircle className="w-3.5 h-3.5" />{t("رفض", "Reject")}
                          </Button>
                        </div>
                        )}
                        {canApproveReceipt && rejectId === r.id && (
                          <div className="mt-3 space-y-2">
                            <textarea
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                              placeholder={t("سبب الرفض...", "Rejection reason...")}
                              rows={2}
                              className="w-full text-sm p-2 border rounded"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm" variant="destructive"
                                disabled={!rejectReason.trim() || runningId === r.id}
                                onClick={async () => {
                                  try {
                                    setRunningId(r.id)
                                    const res = await fetch(`/api/manufacturing/product-receive-approvals/${encodeURIComponent(r.id)}/reject`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ rejection_reason: rejectReason }),
                                    })
                                    const j = await res.json().catch(() => ({}))
                                    if (!res.ok || j.success === false) throw new Error(j.error || (appLang === 'en' ? 'Reject failed' : 'تعذر الرفض'))
                                    toast({ title: t("تم الرفض", "Rejected") })
                                    setRejectId(null); setRejectReason("")
                                    await load()
                                  } catch (e: any) {
                                    toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                                  } finally {
                                    setRunningId(null)
                                  }
                                }}
                              >{t("تأكيد الرفض", "Confirm Reject")}</Button>
                              <Button size="sm" variant="outline" onClick={() => { setRejectId(null); setRejectReason("") }}>{t("إلغاء", "Cancel")}</Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* v3.74.478 — Goods Receipt approvals (bills awaiting warehouse confirmation). */}
              {(activeTab === "all" || activeTab === "recv") && goodsReceipts.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <Package className="w-4 h-4" />{t("موافقات الاستلام المخزنى", "Goods Receipt Approvals")}
                  </h2>
                  {goodsReceipts.map(b => (
                    <Card key={b.id} className="border-l-4 border-l-lime-500">
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="p-2 bg-lime-100 dark:bg-lime-900/30 rounded-lg shrink-0">
                              <Package className="w-4 h-4 text-lime-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm">
                                {t("فاتورة مشتريات للاستلام", "Bill Awaiting Receipt")} · {b.bill_no ?? b.id.slice(0, 6)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                👤 {b.supplier_name ?? "—"}
                              </p>
                              <p className="text-xs mt-1">
                                <span className="font-semibold text-lime-700 dark:text-lime-300">
                                  {t("قيمة الفاتورة", "Bill total")}: {fmtMoney(b.total)}
                                </span>
                              </p>
                              {b.branch_name && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  🏢 {b.branch_name}{b.warehouse_name && <> · 🏬 {b.warehouse_name}</>}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">📅 {fmtDate(b.requested_at)}</p>
                              {/* v3.74.579 — ماذا يحدث عند التأكيد */}
                              <p className="text-[11px] text-muted-foreground mt-1 italic">
                                ℹ️ {t("عند تأكيد الاستلام: تُضاف كميات الفاتورة إلى المخزون فى المخزن المحدد",
                                      "On receipt confirmation: the bill quantities are added to stock in the specified warehouse")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
                              <Clock className="w-3 h-3 me-1" />{t("انتظار الاستلام", "Awaiting Receipt")}
                            </Badge>
                            {/* v3.74.485 — badge for view-only roles so it's clear
                                they see the pending item for information but
                                cannot decide. */}
                            {!canApproveReceipt && myRole && (
                              <Badge className="bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 text-xs">
                                👁️ {t("للاطلاع فقط", "View only")}
                              </Badge>
                            )}
                            <Link href={`/bills/${b.id}`} className="text-xs text-lime-600 hover:underline">
                              {t("عرض الفاتورة", "View bill")}
                            </Link>
                          </div>
                        </div>
                        {/* v3.74.483 — expandable items panel so the warehouse
                            manager can review the line items before confirming,
                            without leaving the inbox. */}
                        {b.items.length > 0 && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={() => setReceiptExpandedId(receiptExpandedId === b.id ? null : b.id)}
                              className="text-xs text-lime-700 dark:text-lime-300 hover:underline inline-flex items-center gap-1"
                            >
                              {receiptExpandedId === b.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              {t(`عرض بنود الفاتورة (${b.items.length})`, `View items (${b.items.length})`)}
                            </button>
                            {receiptExpandedId === b.id && (
                              <div className="mt-2 rounded border bg-white dark:bg-slate-900/60 overflow-hidden">
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-100 dark:bg-slate-800 text-muted-foreground">
                                    <tr>
                                      <th className="text-start p-2 font-normal">{t("المنتج", "Product")}</th>
                                      <th className="text-end p-2 font-normal">{t("الكمية", "Qty")}</th>
                                      <th className="text-end p-2 font-normal">{t("سعر الوحدة", "Unit price")}</th>
                                      <th className="text-end p-2 font-normal">{t("الإجمالى", "Line total")}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {b.items.map((it, i) => (
                                      <tr key={i} className="border-t">
                                        <td className="p-2">
                                          {it.product_type === "service" && (
                                            <span className="inline-block px-1 me-1 text-[10px] rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                              {t("خدمة", "Service")}
                                            </span>
                                          )}
                                          {it.product_name}
                                        </td>
                                        <td className="p-2 text-end">{it.quantity}</td>
                                        <td className="p-2 text-end">{fmtMoney(it.unit_price)}</td>
                                        <td className="p-2 text-end font-medium">{fmtMoney(it.quantity * it.unit_price)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                        {/* v3.74.485 — approve/reject buttons only for roles the
                            server accepts (owner/admin/general_manager/store_manager).
                            manager, accountant, purchasing_officer see the card
                            but no action buttons — matches API-side gate. */}
                        {canApproveReceipt ? (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                              disabled={runningId === b.id}
                              onClick={async () => {
                                try {
                                  setRunningId(b.id)
                                  const res = await fetch(`/api/bills/${encodeURIComponent(b.id)}/confirm-receipt`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ ui_surface: "approvals_inbox" }),
                                  })
                                  const j = await res.json().catch(() => ({}))
                                  if (!res.ok) throw new Error(j.error || (appLang === 'en' ? 'Confirm failed' : 'تعذر تأكيد الاستلام'))
                                  toast({ title: t("تم تأكيد الاستلام", "Receipt confirmed") })
                                  await load()
                                } catch (e: any) {
                                  toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                                } finally {
                                  setRunningId(null)
                                }
                              }}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />{t("تأكيد الاستلام", "Confirm Receipt")}
                            </Button>
                            <Button
                              size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 text-xs"
                              disabled={runningId === b.id}
                              onClick={() => { setRejectId(b.id); setRejectType("goods_receipt"); setRejectReason("") }}
                            >
                              <XCircle className="w-3.5 h-3.5" />{t("رفض الاستلام", "Reject Receipt")}
                            </Button>
                          </div>
                        ) : (
                          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 italic">
                            {t(
                              "الاعتماد لمسئول المخزن / المدير العام / المالك فقط.",
                              "Approval is limited to the store manager, GM, or owner."
                            )}
                          </p>
                        )}
                        {rejectId === b.id && (
                          <div className="mt-3 space-y-2">
                            <textarea
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                              placeholder={t("سبب رفض الاستلام...", "Rejection reason...")}
                              rows={2}
                              className="w-full text-sm p-2 border rounded"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm" variant="destructive"
                                disabled={!rejectReason.trim() || runningId === b.id}
                                onClick={async () => {
                                  try {
                                    setRunningId(b.id)
                                    const res = await fetch(`/api/bills/${encodeURIComponent(b.id)}/reject-receipt`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ reason: rejectReason, rejection_reason: rejectReason }),
                                    })
                                    const j = await res.json().catch(() => ({}))
                                    if (!res.ok) throw new Error(j.error || (appLang === 'en' ? 'Reject failed' : 'تعذر الرفض'))
                                    toast({ title: t("تم الرفض", "Rejected") })
                                    setRejectId(null); setRejectReason("")
                                    await load()
                                  } catch (e: any) {
                                    toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                                  } finally {
                                    setRunningId(null)
                                  }
                                }}
                              >{t("تأكيد الرفض", "Confirm Reject")}</Button>
                              <Button size="sm" variant="outline" onClick={() => { setRejectId(null); setRejectReason("") }}>{t("إلغاء", "Cancel")}</Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* v3.74.477 — Dispatch approvals (invoices awaiting warehouse stage 2). */}
              {(activeTab === "all" || activeTab === "disp") && dispatches.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <Package className="w-4 h-4" />{t("موافقات الإرسال والصرف المخزنى", "Dispatch Approvals")}
                  </h2>
                  {dispatches.map(d => (
                    <Card key={d.id} className="border-l-4 border-l-sky-500">
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg shrink-0">
                              <Package className="w-4 h-4 text-sky-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm">
                                {t("فاتورة مبيعات", "Sales Invoice")} · {d.invoice_no ?? d.id.slice(0, 6)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                👤 {d.customer_name ?? "—"}
                              </p>
                              <p className="text-xs mt-1">
                                <span className="font-semibold text-sky-700 dark:text-sky-300">
                                  {t("قيمة الفاتورة", "Invoice total")}: {fmtMoney(d.total)}
                                </span>
                              </p>
                              {d.branch_name && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  🏢 {d.branch_name}{d.warehouse_name && <> · 🏬 {d.warehouse_name}</>}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">📅 {fmtDate(d.requested_at)}</p>
                              {/* v3.74.579 — ماذا يحدث عند الاعتماد */}
                              <p className="text-[11px] text-muted-foreground mt-1 italic">
                                ℹ️ {t("عند اعتماد الصرف: تُخصم كميات الفاتورة من المخزن فعلياً وتخرج البضاعة للشحن إلى العميل",
                                      "On dispatch approval: the invoice quantities are deducted from the warehouse and the goods leave for shipment to the customer")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
                              <Clock className="w-3 h-3 me-1" />{t("انتظار الصرف", "Awaiting Dispatch")}
                            </Badge>
                            <Link href={`/inventory/dispatch-approvals/${d.id}`} className="text-xs text-sky-600 hover:underline">
                              {t("عرض التفاصيل", "View details")}
                            </Link>
                          </div>
                        </div>
                        {/* v3.74.509 — قرار الصرف لمسؤولى المخازن والإدارة فقط (مدير الفرع اطلاع) */}
                        {canApproveReceipt && (
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                            disabled={runningId === d.id}
                            onClick={async () => {
                              try {
                                setRunningId(d.id)
                                const res = await fetch(`/api/invoices/${encodeURIComponent(d.id)}/warehouse-approve`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ ui_surface: "approvals_inbox" }),
                                })
                                const j = await res.json().catch(() => ({}))
                                if (!res.ok) throw new Error(j.error || (appLang === 'en' ? 'Dispatch failed' : 'تعذر اعتماد الصرف'))
                                toast({ title: t("تم اعتماد الصرف", "Dispatch approved") })
                                await load()
                              } catch (e: any) {
                                toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                              } finally {
                                setRunningId(null)
                              }
                            }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />{t("اعتماد الصرف", "Approve Dispatch")}
                          </Button>
                          {/* v3.74.491 — Approve + create shipment. Visible only when the
                              invoice targets an API-integrated provider (bosta / aramex).
                              The classic Approve button stays as a fallback if the provider
                              call fails. Same endpoint the dispatch-approvals page used. */}
                          {d.shipping_provider_has_api && (
                            <Button
                              size="sm" variant="outline" className="gap-1 text-cyan-600 border-cyan-300 hover:bg-cyan-50 text-xs"
                              disabled={runningId === d.id}
                              onClick={async () => {
                                try {
                                  setRunningId(d.id)
                                  const res = await fetch(`/api/invoices/${encodeURIComponent(d.id)}/warehouse-approve-with-shipping`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ notes: null }),
                                  })
                                  const j = await res.json().catch(() => ({}))
                                  if (!res.ok || j.success === false) throw new Error(j.error || (appLang === 'en' ? 'Shipment creation failed' : 'تعذر إنشاء الشحنة'))
                                  toast({
                                    title: t("تم الاعتماد + إنشاء الشحنة", "Approved + shipment created"),
                                    description: j?.shipment?.tracking_number ? t(`رقم التتبع: ${j.shipment.tracking_number}`, `Tracking: ${j.shipment.tracking_number}`) : undefined,
                                  })
                                  await load()
                                } catch (e: any) {
                                  toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                                } finally {
                                  setRunningId(null)
                                }
                              }}
                            >
                              🚚 {t(`اعتماد + إرسال لـ ${d.shipping_provider_name}`, `Approve + send to ${d.shipping_provider_name}`)}
                            </Button>
                          )}
                          <Button
                            size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 text-xs"
                            disabled={runningId === d.id}
                            onClick={() => { setRejectId(d.id); setRejectType("dispatch"); setRejectReason("") }}
                          >
                            <XCircle className="w-3.5 h-3.5" />{t("رفض", "Reject")}
                          </Button>
                        </div>
                        )}
                        {canApproveReceipt && rejectId === d.id && (
                          <div className="mt-3 space-y-2">
                            <textarea
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                              placeholder={t("سبب الرفض...", "Rejection reason...")}
                              rows={2}
                              className="w-full text-sm p-2 border rounded"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm" variant="destructive"
                                disabled={!rejectReason.trim() || runningId === d.id}
                                onClick={async () => {
                                  try {
                                    setRunningId(d.id)
                                    const res = await fetch(`/api/invoices/${encodeURIComponent(d.id)}/warehouse-reject`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ reason: rejectReason, rejection_reason: rejectReason }),
                                    })
                                    const j = await res.json().catch(() => ({}))
                                    if (!res.ok) throw new Error(j.error || (appLang === 'en' ? 'Reject failed' : 'تعذر الرفض'))
                                    toast({ title: t("تم الرفض", "Rejected") })
                                    setRejectId(null); setRejectReason("")
                                    await load()
                                  } catch (e: any) {
                                    toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                                  } finally {
                                    setRunningId(null)
                                  }
                                }}
                              >{t("تأكيد الرفض", "Confirm Reject")}</Button>
                              <Button size="sm" variant="outline" onClick={() => { setRejectId(null); setRejectReason("") }}>{t("إلغاء", "Cancel")}</Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* v3.74.680 — Booking stock withdrawals (issue from warehouse for a service booking). */}
              {(activeTab === "all" || activeTab === "bwd") && bookingWithdrawals.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <Package className="w-4 h-4" />{t("سحب مخزون الحجوزات", "Booking Stock Withdrawals")}
                  </h2>
                  {bookingWithdrawals.map(w => (
                    <Card key={w.id} className="border-l-4 border-l-indigo-500">
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg shrink-0">
                              <Package className="w-4 h-4 text-indigo-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm">
                                {t("سحب منتج لحجز", "Withdrawal for booking")} · {w.booking_no ?? w.booking_id.slice(0, 6)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                📦 {w.product_name ?? "—"} · {t("الكمية", "Qty")}: {w.quantity}
                              </p>
                              {w.branch_name && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  🏢 {w.branch_name}{w.warehouse_name && <> · 🏬 {w.warehouse_name}</>}
                                </p>
                              )}
                              {w.reason && <p className="text-xs text-muted-foreground mt-1">📝 {w.reason}</p>}
                              <p className="text-xs text-muted-foreground mt-1">📅 {fmtDate(w.requested_at)}</p>
                              <p className="text-[11px] text-muted-foreground mt-1 italic">
                                ℹ️ {t("عند الاعتماد: يُسمح بسحب المنتج من المخزن لتنفيذ الخدمة",
                                      "On approval: the product may be withdrawn from the warehouse to perform the service")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">
                              <Clock className="w-3 h-3 me-1" />{t("انتظار اعتماد المخزن", "Awaiting store approval")}
                            </Badge>
                            <Link href={`/bookings/${w.booking_id}`} className="text-xs text-indigo-600 hover:underline">
                              {t("عرض الحجز", "View booking")}
                            </Link>
                          </div>
                        </div>
                        {canDecideWithdrawal && (
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                            disabled={runningId === w.id}
                            onClick={async () => {
                              try {
                                setRunningId(w.id)
                                const res = await fetch(`/api/booking-stock-withdrawals/${encodeURIComponent(w.id)}/decide`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ approve: true }),
                                })
                                const j = await res.json().catch(() => ({}))
                                if (!res.ok) throw new Error(j.error || (appLang === 'en' ? 'Approve failed' : 'تعذر الاعتماد'))
                                toast({ title: t("تم اعتماد السحب", "Withdrawal approved") })
                                await load()
                              } catch (e: any) {
                                toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                              } finally {
                                setRunningId(null)
                              }
                            }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />{t("اعتماد السحب", "Approve Withdrawal")}
                          </Button>
                          <Button
                            size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 text-xs"
                            disabled={runningId === w.id}
                            onClick={() => { setRejectId(w.id); setRejectType("booking_stock_withdrawal"); setRejectReason("") }}
                          >
                            <XCircle className="w-3.5 h-3.5" />{t("رفض", "Reject")}
                          </Button>
                        </div>
                        )}
                        {canDecideWithdrawal && rejectId === w.id && (
                          <div className="mt-3 space-y-2">
                            <textarea
                              value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                              placeholder={t("سبب الرفض...", "Rejection reason...")}
                              rows={2}
                              className="w-full text-sm p-2 border rounded"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm" variant="destructive"
                                disabled={!rejectReason.trim() || runningId === w.id}
                                onClick={async () => {
                                  try {
                                    setRunningId(w.id)
                                    const res = await fetch(`/api/booking-stock-withdrawals/${encodeURIComponent(w.id)}/decide`, {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ approve: false, notes: rejectReason }),
                                    })
                                    const j = await res.json().catch(() => ({}))
                                    if (!res.ok) throw new Error(j.error || (appLang === 'en' ? 'Reject failed' : 'تعذر الرفض'))
                                    toast({ title: t("تم الرفض", "Rejected") })
                                    setRejectId(null); setRejectReason("")
                                    await load()
                                  } catch (e: any) {
                                    toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                                  } finally {
                                    setRunningId(null)
                                  }
                                }}
                              >{t("تأكيد الرفض", "Confirm Reject")}</Button>
                              <Button size="sm" variant="outline" onClick={() => { setRejectId(null); setRejectReason("") }}>{t("إلغاء", "Cancel")}</Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* v3.74.476 — Customer refund requests (two-phase: approve → execute). */}
              {(activeTab === "all" || activeTab === "cref") && customerRefunds.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <Wallet className="w-4 h-4" />{t("طلبات استرداد العملاء", "Customer Refund Requests")}
                  </h2>
                  {customerRefunds.map(r => {
                    const isApproved = r.status === "approved"
                    return (
                      <Card key={r.id} className="border-l-4 border-l-cyan-500">
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg shrink-0">
                                <Wallet className="w-4 h-4 text-cyan-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-sm">{t("طلب استرداد عميل", "Customer Refund Request")}</p>
                                {/* v3.74.528 — rejection reason banner (only when
                                    the row carries one, i.e. previously rejected). */}
                                {r.rejection_reason && (
                                  <div className="mt-1 mb-1 p-2 rounded text-[11px] bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800">
                                    ⛔ {t("سبب الرفض السابق", "Previous rejection reason")}: {r.rejection_reason}
                                  </div>
                                )}
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  🧑 <span className="font-semibold text-foreground">{r.customer_name ?? "—"}</span>
                                  {r.invoice_no && <> · 🧾 {t("فاتورة", "Invoice")}: <span className="font-semibold">{r.invoice_no}</span></>}
                                </p>
                                <p className="text-xs mt-1">
                                  <span className="font-semibold text-cyan-700 dark:text-cyan-300">
                                    💰 {t("قيمة الاسترداد", "Refund amount")}: {fmtMoney(r.amount)} {r.currency}
                                  </span>
                                  {/* v3.74.528 — FX base equivalent for non-EGP */}
                                  {r.currency !== "EGP" && r.base_amount != null && (
                                    <span className="ms-2 text-muted-foreground">
                                      ≈ {fmtMoney(r.base_amount)} EGP
                                      {r.exchange_rate != null && <> · {t("سعر الصرف", "FX")}: {r.exchange_rate.toFixed(4)}</>}
                                    </span>
                                  )}
                                </p>
                                {/* v3.74.540 — proposed changes panel (only if
                                    the request is a payment correction with a
                                    metadata.proposed_changes payload). */}
                                {(r.proposed_amount != null || r.proposed_currency || r.proposed_account_name || r.proposed_method || r.proposed_date || r.proposed_reference) && (
                                  <div className="mt-1 p-2 rounded bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 text-xs">
                                    <p className="font-semibold text-cyan-700 dark:text-cyan-300 mb-0.5">
                                      🔧 {t("التعديلات المقترحة", "Proposed changes")}
                                    </p>
                                    <ul className="text-xs text-cyan-900 dark:text-cyan-200 ms-4 list-disc">
                                      {r.proposed_amount != null && (
                                        <li>
                                          {t("القيمة", "Amount")}: <span className="line-through text-muted-foreground">{fmtMoney(r.amount)}</span>
                                          <span className="font-semibold ms-1">→ {fmtMoney(r.proposed_amount)}</span>
                                          {r.proposed_currency && <> {r.proposed_currency}</>}
                                        </li>
                                      )}
                                      {r.proposed_currency && r.proposed_amount == null && (
                                        <li>
                                          {t("العملة", "Currency")}: <span className="line-through text-muted-foreground">{r.currency}</span>
                                          <span className="font-semibold ms-1">→ {r.proposed_currency}</span>
                                        </li>
                                      )}
                                      {r.proposed_account_name && (
                                        <li>{t("الحساب", "Account")}: <span className="font-semibold">{r.proposed_account_name}</span></li>
                                      )}
                                      {r.proposed_method && (
                                        <li>{t("طريقة الدفع", "Method")}: <span className="font-semibold">
                                          {r.proposed_method === "cash" ? t("نقدى", "Cash")
                                            : r.proposed_method === "bank" || r.proposed_method === "bank_transfer" ? t("تحويل بنكى", "Bank transfer")
                                            : r.proposed_method === "check" || r.proposed_method === "cheque" ? t("شيك", "Check")
                                            : r.proposed_method}
                                        </span></li>
                                      )}
                                      {r.proposed_date && (
                                        <li>{t("التاريخ", "Date")}: <span className="font-semibold">{r.proposed_date}</span></li>
                                      )}
                                      {r.proposed_reference && (
                                        <li>{t("المرجع", "Reference")}: <span className="font-semibold">{r.proposed_reference}</span></li>
                                      )}
                                    </ul>
                                  </div>
                                )}
                                {/* v3.74.528 — refund method + destination account.
                                    v3.74.579 — يظهر دائماً: لو لم تُحدد الطريقة/الحساب
                                    يعرف المعتمِد أنها ستُحدد عند التنفيذ. */}
                                <p className="text-xs text-muted-foreground mt-1">
                                  💳 {t("طريقة الصرف", "Payout")}: {r.refund_method === "cash" ? t("نقدى", "Cash")
                                      : r.refund_method === "bank" || r.refund_method === "bank_transfer" ? t("تحويل بنكى", "Bank transfer")
                                      : r.refund_method === "check" || r.refund_method === "cheque" ? t("شيك", "Check")
                                      : r.refund_method
                                        ? r.refund_method
                                        : <span className="text-amber-600">{t("لم تُحدد بعد — تُختار عند التنفيذ", "Not set yet — chosen at execution")}</span>}
                                  {r.refund_account_name && <> · 🏦 <span className="font-medium text-foreground">{r.refund_account_name}</span></>}
                                </p>
                                {/* v3.74.579 — ماذا يحدث فى الخطوة القادمة */}
                                <p className="text-[11px] text-muted-foreground mt-1 italic">
                                  ℹ️ {isApproved
                                    ? t("عند التنفيذ: يُصرف المبلغ فعلياً من الحساب المختار ويُقيَّد على حساب العميل (المنفذ يجب أن يكون غير المعتمِد)",
                                        "On execution: the amount actually leaves the chosen account and is posted against the customer (executor must differ from approver)")
                                    : t("عند الاعتماد: يصبح الطلب جاهزاً للتنفيذ — لا تخرج أموال قبل خطوة التنفيذ",
                                        "On approval: the request becomes ready to execute — no money leaves before the execution step")}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">📅 {fmtDate(r.requested_at)}</p>
                                {r.requested_by_email && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    ✍️ {t("طلب الاعتماد", "Requested by")}: <span className="font-medium">{r.requested_by_email}</span>
                                  </p>
                                )}
                                {r.notes && (
                                  <p className="text-xs mt-1 p-1.5 bg-amber-50 dark:bg-amber-900/20 rounded border-l-2 border-amber-400">
                                    📝 {r.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className={isApproved
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs"
                                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs"}>
                                <Clock className="w-3 h-3 me-1" />
                                {isApproved ? t("جاهز للتنفيذ", "Ready to execute") : t("انتظار اعتماد", "Pending approval")}
                              </Badge>
                              <Link href="/customer-refund-requests" className="text-xs text-cyan-600 hover:underline">
                                {t("عرض القائمة", "View list")}
                              </Link>
                            </div>
                          </div>
                          {/* v3.74.509 — قرار الاسترداد للمالك/المدير العام فقط
                              v3.74.543 — بعد الاعتماد المُقتَرِح ينفّذ (SoD) */}
                          {(isOwnerOrGm || (isApproved && myUserId && r.requested_by === myUserId)) && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                              disabled={runningId === r.id}
                              onClick={async () => {
                                try {
                                  setRunningId(r.id)
                                  const endpoint = isApproved ? "execute" : "approve"
                                  const res = await fetch(`/api/customer-refund-requests/${encodeURIComponent(r.id)}/${endpoint}`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({}),
                                  })
                                  const j = await res.json().catch(() => ({}))
                                  if (!res.ok) throw new Error(j.error || (appLang === 'en' ? 'Failed' : 'تعذر التنفيذ'))
                                  toast({ title: isApproved ? t("تم التنفيذ", "Executed") : t("تم الاعتماد", "Approved") })
                                  await load()
                                } catch (e: any) {
                                  toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                                } finally {
                                  setRunningId(null)
                                }
                              }}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {isApproved ? t("تنفيذ الاسترداد", "Execute Refund") : t("اعتماد", "Approve")}
                            </Button>
                            {!isApproved && (
                              <Button
                                size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 text-xs"
                                disabled={runningId === r.id}
                                onClick={() => { setRejectId(r.id); setRejectType("customer_refund"); setRejectReason("") }}
                              >
                                <XCircle className="w-3.5 h-3.5" />{t("رفض", "Reject")}
                              </Button>
                            )}
                          </div>
                          )}
                          {isOwnerOrGm && rejectId === r.id && (
                            <div className="mt-3 space-y-2">
                              <textarea
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                placeholder={t("سبب الرفض...", "Rejection reason...")}
                                rows={2}
                                className="w-full text-sm p-2 border rounded"
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm" variant="destructive"
                                  disabled={!rejectReason.trim() || runningId === r.id}
                                  onClick={async () => {
                                    try {
                                      setRunningId(r.id)
                                      const res = await fetch(`/api/customer-refund-requests/${encodeURIComponent(r.id)}/reject`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ reason: rejectReason, rejection_reason: rejectReason }),
                                      })
                                      const j = await res.json().catch(() => ({}))
                                      if (!res.ok) throw new Error(j.error || (appLang === 'en' ? 'Reject failed' : 'تعذر الرفض'))
                                      toast({ title: t("تم الرفض", "Rejected") })
                                      setRejectId(null); setRejectReason("")
                                      await load()
                                    } catch (e: any) {
                                      toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                                    } finally {
                                      setRunningId(null)
                                    }
                                  }}
                                >{t("تأكيد الرفض", "Confirm Reject")}</Button>
                                <Button size="sm" variant="outline" onClick={() => { setRejectId(null); setRejectReason("") }}>{t("إلغاء", "Cancel")}</Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}

              {/* v3.74.476 — Vendor payment correction requests (two-phase). */}
              {(activeTab === "all" || activeTab === "vcor") && vendorPaymentCorrections.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <Wallet className="w-4 h-4" />{t("طلبات تصحيح دفعات موردين", "Vendor Payment Correction Requests")}
                  </h2>
                  {vendorPaymentCorrections.map(r => {
                    const isApproved = r.status === "approved"
                    return (
                      <Card key={r.id} className="border-l-4 border-l-violet-500">
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg shrink-0">
                                <Wallet className="w-4 h-4 text-violet-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-sm">{t("طلب تصحيح دفعة مورد", "Vendor Payment Correction")}</p>
                                {/* v3.74.528 — rejection reason banner (previous reject) */}
                                {r.rejection_reason && (
                                  <div className="mt-1 mb-1 p-2 rounded text-[11px] bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800">
                                    ⛔ {t("سبب الرفض السابق", "Previous rejection reason")}: {r.rejection_reason}
                                  </div>
                                )}
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  🏭 <span className="font-semibold text-foreground">{r.supplier_name ?? "—"}</span>
                                  {r.bill_no && <> · 🧾 {t("فاتورة", "Bill")}: <span className="font-semibold">{r.bill_no}</span></>}
                                </p>
                                <p className="text-xs mt-1">
                                  <span className="text-muted-foreground">
                                    {t("الحالى", "Current")}: {fmtMoney(r.amount)} {r.currency}
                                  </span>
                                  {/* v3.74.528 — FX base equivalent for non-EGP */}
                                  {r.currency !== "EGP" && r.base_amount != null && (
                                    <span className="ms-2 text-muted-foreground">
                                      ≈ {fmtMoney(r.base_amount)} EGP
                                      {r.exchange_rate != null && <> · {t("سعر الصرف", "FX")}: {r.exchange_rate.toFixed(4)}</>}
                                    </span>
                                  )}
                                </p>
                                {/* v3.74.539 — proposed changes so the owner sees
                                    exactly what the accountant wants to change to.
                                    Nothing here means notes-only correction. */}
                                {(r.proposed_amount != null || r.proposed_currency || r.proposed_account_name || r.proposed_method || r.proposed_date || r.proposed_reference) && (
                                  <div className="mt-1 p-2 rounded bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 text-xs">
                                    <p className="font-semibold text-violet-700 dark:text-violet-300 mb-0.5">
                                      🔧 {t("التعديلات المقترحة", "Proposed changes")}
                                    </p>
                                    <ul className="text-xs text-violet-900 dark:text-violet-200 ms-4 list-disc">
                                      {r.proposed_amount != null && (
                                        <li>
                                          {t("القيمة", "Amount")}: <span className="line-through text-muted-foreground">{fmtMoney(r.amount)}</span>
                                          <span className="font-semibold ms-1">→ {fmtMoney(r.proposed_amount)}</span>
                                          {r.proposed_currency && <> {r.proposed_currency}</>}
                                        </li>
                                      )}
                                      {r.proposed_currency && r.proposed_amount == null && (
                                        <li>
                                          {t("العملة", "Currency")}: <span className="line-through text-muted-foreground">{r.currency}</span>
                                          <span className="font-semibold ms-1">→ {r.proposed_currency}</span>
                                        </li>
                                      )}
                                      {r.proposed_account_name && (
                                        <li>{t("الحساب", "Account")}: <span className="font-semibold">{r.proposed_account_name}</span></li>
                                      )}
                                      {r.proposed_method && (
                                        <li>{t("طريقة الدفع", "Method")}: <span className="font-semibold">
                                          {r.proposed_method === "cash" ? t("نقدى", "Cash")
                                            : r.proposed_method === "bank" || r.proposed_method === "bank_transfer" ? t("تحويل بنكى", "Bank transfer")
                                            : r.proposed_method === "check" || r.proposed_method === "cheque" ? t("شيك", "Check")
                                            : r.proposed_method}
                                        </span></li>
                                      )}
                                      {r.proposed_date && (
                                        <li>{t("التاريخ", "Date")}: <span className="font-semibold">{r.proposed_date}</span></li>
                                      )}
                                      {r.proposed_reference && (
                                        <li>{t("المرجع", "Reference")}: <span className="font-semibold">{r.proposed_reference}</span></li>
                                      )}
                                    </ul>
                                  </div>
                                )}
                                {/* v3.74.579 — ماذا يحدث فى الخطوة القادمة */}
                                <p className="text-[11px] text-muted-foreground mt-1 italic">
                                  ℹ️ {isApproved
                                    ? t("عند التنفيذ: تُعكس الدفعة الأصلية بقيد عكسى وتُسجَّل دفعة مصححة بالقيم المقترحة وتُحدَّث أرصدة المورد والفاتورة تلقائياً",
                                        "On execution: the original payment is reversed and a corrected payment is posted with the proposed values — supplier and bill balances update automatically")
                                    : t("عند الاعتماد: يصبح التصحيح جاهزاً للتنفيذ — لا يتغير شىء فى الدفعة أو الأرصدة قبل خطوة التنفيذ",
                                        "On approval: the correction becomes ready to execute — nothing changes on the payment or balances before the execution step")}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">📅 {fmtDate(r.requested_at)}</p>
                                {r.requested_by_email && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    ✍️ {t("طلب الاعتماد", "Requested by")}: <span className="font-medium">{r.requested_by_email}</span>
                                  </p>
                                )}
                                {r.notes && (
                                  <p className="text-xs mt-1 p-1.5 bg-amber-50 dark:bg-amber-900/20 rounded border-l-2 border-amber-400">
                                    📝 {r.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className={isApproved
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs"
                                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs"}>
                                <Clock className="w-3 h-3 me-1" />
                                {isApproved ? t("جاهز للتنفيذ", "Ready to execute") : t("انتظار اعتماد", "Pending approval")}
                              </Badge>
                              <Link href="/vendor-payment-correction-requests" className="text-xs text-violet-600 hover:underline">
                                {t("عرض القائمة", "View list")}
                              </Link>
                            </div>
                          </div>
                          {/* v3.74.509 — قرار التصحيح للمالك/المدير العام فقط
                              v3.74.543 — بعد الاعتماد المُقتَرِح (منشئ الطلب)
                              هو من يُنَفّذ (SoD) — الزر يظهر له أيضاً. */}
                          {(isOwnerOrGm || (isApproved && myUserId && r.requested_by === myUserId)) && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                              disabled={runningId === r.id}
                              onClick={async () => {
                                try {
                                  setRunningId(r.id)
                                  const endpoint = isApproved ? "execute" : "approve"
                                  const res = await fetch(`/api/vendor-payment-correction-requests/${encodeURIComponent(r.id)}/${endpoint}`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({}),
                                  })
                                  const j = await res.json().catch(() => ({}))
                                  if (!res.ok) throw new Error(j.error || (appLang === 'en' ? 'Failed' : 'تعذر التنفيذ'))
                                  toast({ title: isApproved ? t("تم التنفيذ", "Executed") : t("تم الاعتماد", "Approved") })
                                  await load()
                                } catch (e: any) {
                                  toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                                } finally {
                                  setRunningId(null)
                                }
                              }}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {isApproved ? t("تنفيذ التصحيح", "Execute Correction") : t("اعتماد", "Approve")}
                            </Button>
                            {!isApproved && (
                              <Button
                                size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 text-xs"
                                disabled={runningId === r.id}
                                onClick={() => { setRejectId(r.id); setRejectType("vendor_payment_correction"); setRejectReason("") }}
                              >
                                <XCircle className="w-3.5 h-3.5" />{t("رفض", "Reject")}
                              </Button>
                            )}
                          </div>
                          )}
                          {isOwnerOrGm && rejectId === r.id && (
                            <div className="mt-3 space-y-2">
                              <textarea
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                placeholder={t("سبب الرفض...", "Rejection reason...")}
                                rows={2}
                                className="w-full text-sm p-2 border rounded"
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm" variant="destructive"
                                  disabled={!rejectReason.trim() || runningId === r.id}
                                  onClick={async () => {
                                    try {
                                      setRunningId(r.id)
                                      const res = await fetch(`/api/vendor-payment-correction-requests/${encodeURIComponent(r.id)}/reject`, {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ reason: rejectReason, rejection_reason: rejectReason }),
                                      })
                                      const j = await res.json().catch(() => ({}))
                                      if (!res.ok) throw new Error(j.error || (appLang === 'en' ? 'Reject failed' : 'تعذر الرفض'))
                                      toast({ title: t("تم الرفض", "Rejected") })
                                      setRejectId(null); setRejectReason("")
                                      await load()
                                    } catch (e: any) {
                                      toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                                    } finally {
                                      setRunningId(null)
                                    }
                                  }}
                                >{t("تأكيد الرفض", "Confirm Reject")}</Button>
                                <Button size="sm" variant="outline" onClick={() => { setRejectId(null); setRejectReason("") }}>{t("إلغاء", "Cancel")}</Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}

              {/* v3.74.475 — Sales return requests (dual-stage). */}
              {(activeTab === "all" || activeTab === "sret") && salesReturnRequests.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <RefreshCw className="w-4 h-4" />{t("اعتمادات مرتجعات المبيعات", "Sales Return Approvals")}
                  </h2>
                  {salesReturnRequests.map(s => {
                    const isWh = s.stage === "warehouse"
                    const approveUrl = isWh
                      ? `/api/sales-return-requests/${encodeURIComponent(s.id)}/warehouse-approve`
                      : `/api/sales-return-requests/${encodeURIComponent(s.id)}/approve`
                    const rejectUrl = isWh
                      ? `/api/sales-return-requests/${encodeURIComponent(s.id)}/warehouse-reject`
                      : `/api/sales-return-requests/${encodeURIComponent(s.id)}/reject`
                    // v3.74.509 — المرحلة الإدارية: مالك/أدمن/مدير عام؛
                    // مرحلة المخزن: مسؤولو المخازن + الإدارة (مطابق لبوابات الخادم)
                    const canDecideSret = isWh
                      ? (canApproveReceipt || myRole === 'warehouse_manager')
                      : isAdminLike
                    return (
                      <Card key={s.id} className="border-l-4 border-l-pink-500">
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <div className="p-2 bg-pink-100 dark:bg-pink-900/30 rounded-lg shrink-0">
                                <RefreshCw className="w-4 h-4 text-pink-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-sm">
                                  {t("طلب مرتجع مبيعات", "Sales Return Request")}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  👤 {s.customer_name ?? "—"}
                                  {s.invoice_no && <> · 🧾 {t("فاتورة", "Invoice")}: {s.invoice_no}</>}
                                </p>
                                <p className="text-xs mt-1">
                                  <span className="font-semibold text-pink-700 dark:text-pink-300">
                                    {t("قيمة المرتجع", "Return amount")}: {fmtMoney(s.total)}
                                  </span>
                                </p>
                                {s.branch_name && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    🏢 {s.branch_name}{s.warehouse_name && <> · 🏬 {s.warehouse_name}</>}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1">
                                  📅 {fmtDate(s.requested_at)}
                                </p>
                                {/* v3.74.579 — ماذا يحدث بعد هذه الخطوة */}
                                <p className="text-[11px] text-muted-foreground mt-1 italic">
                                  ℹ️ {isWh
                                    ? t("عند اعتماد المخزن: تُعاد الكمية المرتجعة إلى المخزون فعلياً ويُقيَّد المبلغ لصالح العميل (رصيد دائن أو استرداد حسب الطلب)",
                                        "On warehouse approval: the returned goods are added back to stock and the amount is credited/refunded to the customer per the request")
                                    : t("عند الاعتماد الإدارى: يُخطَر مسئول المخزن لاستلام البضاعة المرتجعة — لا يتحرك المخزون ولا تُقيَّد أموال قبل تأكيده",
                                        "On management approval: the store manager is notified to receive the returned goods — no stock or money moves until he confirms")}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className={isWh
                                ? "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 text-xs"
                                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs"}>
                                <Clock className="w-3 h-3 me-1" />
                                {isWh ? t("اعتماد المخزن", "Warehouse stage") : t("اعتماد إدارى", "Management stage")}
                              </Badge>
                              <Link href={`/sales-return-requests/${s.id}`} className="text-xs text-pink-600 hover:underline">
                                {t("عرض المستند", "View document")}
                              </Link>
                            </div>
                          </div>
                          {canDecideSret && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                              disabled={runningId === s.id}
                              onClick={async () => {
                                try {
                                  setRunningId(s.id)
                                  const res = await fetch(approveUrl, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({}),
                                  })
                                  const j = await res.json().catch(() => ({}))
                                  if (!res.ok) throw new Error(j.error || (appLang === 'en' ? 'Approve failed' : 'تعذر الاعتماد'))
                                  toast({ title: t("تم الاعتماد", "Approved"), description: t("تم اعتماد مرتجع المبيعات", "Sales return approved") })
                                  await load()
                                } catch (e: any) {
                                  toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                                } finally {
                                  setRunningId(null)
                                }
                              }}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {isWh ? t("اعتماد المخزن", "Approve (Warehouse)") : t("اعتماد إدارى", "Approve (Management)")}
                            </Button>
                            <Button
                              size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 text-xs"
                              disabled={runningId === s.id}
                              onClick={() => { setRejectId(s.id); setRejectType("sales_return_request"); setRejectReason("") }}
                            >
                              <XCircle className="w-3.5 h-3.5" />{t("رفض", "Reject")}
                            </Button>
                          </div>
                          )}
                          {canDecideSret && rejectId === s.id && (
                            <div className="mt-3 space-y-2">
                              <textarea
                                value={rejectReason}
                                onChange={e => setRejectReason(e.target.value)}
                                placeholder={t("سبب الرفض (٥ أحرف على الأقل)...", "Rejection reason (min 5 chars)...")}
                                rows={2}
                                className="w-full text-sm p-2 border rounded"
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm" variant="destructive"
                                  disabled={rejectReason.trim().length < 5 || runningId === s.id}
                                  onClick={async () => {
                                    try {
                                      setRunningId(s.id)
                                      const res = await fetch(rejectUrl, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ rejection_reason: rejectReason }),
                                      })
                                      const j = await res.json().catch(() => ({}))
                                      if (!res.ok) throw new Error(j.error || (appLang === 'en' ? 'Reject failed' : 'تعذر الرفض'))
                                      toast({ title: t("تم الرفض", "Rejected"), description: t("تم رفض المرتجع", "Return rejected") })
                                      setRejectId(null); setRejectReason("")
                                      await load()
                                    } catch (e: any) {
                                      toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                                    } finally {
                                      setRunningId(null)
                                    }
                                  }}
                                >
                                  {t("تأكيد الرفض", "Confirm Reject")}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => { setRejectId(null); setRejectReason("") }}>
                                  {t("إلغاء", "Cancel")}
                                </Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}

              {/* v3.74.473 — Purchase returns awaiting admin approval. */}
              {(activeTab === "all" || activeTab === "pret") && purchaseReturns.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                    <RefreshCw className="w-4 h-4" />{t("اعتمادات مرتجعات المشتريات", "Purchase Return Approvals")}
                  </h2>
                  {purchaseReturns
                    // v3.74.513 — أدوار المخازن ترى مرتجعات مخزنها/فرعها فقط
                    .filter(r => isAdminLike
                      ? true
                      : myWarehouseId
                        ? r.warehouse_id === myWarehouseId
                        : myBranchId
                          ? r.branch_id === myBranchId
                          : true)
                    .map(r => {
                    const isWarehouseStage = r.workflow_status === "pending_warehouse"
                    return (
                    <Card key={r.id} className="border-l-4 border-l-orange-500">
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-start gap-3 flex-1 min-w-0">
                            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg shrink-0">
                              <RefreshCw className="w-4 h-4 text-orange-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm">
                                {t("مرتجع مشتريات", "Purchase Return")} · {r.return_no ?? t("بدون رقم", "(no number)")}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                👤 {r.supplier_name ?? "—"}
                                {r.bill_no && <> · 🧾 {t("فاتورة", "Bill")}: {r.bill_no}</>}
                              </p>
                              <p className="text-xs mt-1">
                                <span className="font-semibold text-orange-700 dark:text-orange-300">
                                  {t("قيمة المرتجع", "Return amount")}: {fmtMoney(r.total)} {r.currency}
                                </span>
                              </p>
                              {/* v3.74.579 — بنود المرتجع (ماذا يُرجَع بالضبط) */}
                              {r.detail_lines.length > 0 && (
                                <div className="mt-1 p-2 rounded bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                                  <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">
                                    📦 {t("البنود", "Items")} ({r.detail_lines.length})
                                  </p>
                                  <ul className="text-xs ms-4 list-disc text-muted-foreground mt-0.5">
                                    {r.detail_lines.map((l, i) => (<li key={i}>{l}</li>))}
                                  </ul>
                                </div>
                              )}
                              {/* v3.74.579 — طريقة التسوية مع المورد */}
                              <p className="text-xs text-muted-foreground mt-1">
                                💳 {t("التسوية", "Settlement")}: <span className="font-medium text-foreground">
                                  {r.refund_account_name
                                    ? `${t("استرداد نقدى", "Cash refund")} · 🏦 ${r.refund_account_name}`
                                    : r.settlement_method === "vendor_credit"
                                      ? t("رصيد دائن لدى المورد", "Vendor credit")
                                      : t("خصم من رصيد الفاتورة / رصيد دائن", "Offset against bill / vendor credit")}
                                </span>
                              </p>
                              {r.branch_name && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  🏢 {r.branch_name}{r.warehouse_name && <> · 🏬 {r.warehouse_name}</>}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                📅 {fmtDate(r.requested_at)}
                                {r.requested_by_label && (
                                  <> · ✍️ {t("طلب المرتجع", "Requested by")}: <span className="font-medium text-foreground">{r.requested_by_label}</span></>
                                )}
                              </p>
                              {r.reason && (
                                <p className="text-xs mt-1 p-1.5 bg-amber-50 dark:bg-amber-900/20 rounded border-l-2 border-amber-400">
                                  📝 {t("السبب", "Reason")}: {r.reason}
                                </p>
                              )}
                              {/* v3.74.579 — ماذا يحدث بعد هذه الخطوة */}
                              <p className="text-[11px] text-muted-foreground mt-1 italic">
                                ℹ️ {isWarehouseStage
                                  ? t("عند تأكيد الإخراج: يُخصم المخزون فعلياً وتُسوَّى قيمة المرتجع مع المورد (رصيد دائن أو استرداد)",
                                      "On goods-out confirmation: stock is deducted and the return value is settled with the supplier (credit or refund)")
                                  : t("عند الاعتماد: يُخطَر مسئول مخزن الفرع لإخراج البضاعة — لا يتحرك المخزون قبل تأكيده",
                                      "On approval: the branch store manager is notified to release the goods — stock doesn't move until he confirms")}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {/* v3.74.513 — الشارة حسب المرحلة */}
                            <Badge className={isWarehouseStage
                              ? "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 text-xs"
                              : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs"}>
                              <Clock className="w-3 h-3 me-1" />
                              {isWarehouseStage ? t("بانتظار إخراج المخزن", "Awaiting warehouse") : t("انتظار اعتماد", "Pending Approval")}
                            </Badge>
                            <Link href={`/purchase-returns/${r.id}`} className="text-xs text-orange-600 hover:underline">
                              {t("عرض المستند", "View document")}
                            </Link>
                          </div>
                        </div>
                        {/* v3.74.513 — مرحلة المخزن: زر تأكيد إخراج البضاعة لمسؤولى المخازن */}
                        {isWarehouseStage && (canApproveReceipt || myRole === 'warehouse_manager') && (
                          <div className="flex gap-2 mt-3">
                            <Button
                              size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700 text-white text-xs"
                              disabled={runningId === r.id}
                              onClick={async () => {
                                try {
                                  setRunningId(r.id)
                                  const res = await fetch(`/api/purchase-returns/${encodeURIComponent(r.id)}/confirm-delivery`, {
                                    method: "POST",
                                    headers: {
                                      "Content-Type": "application/json",
                                      "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `pret:${r.id}:confirm:${Date.now()}`,
                                    },
                                    body: JSON.stringify({ uiSurface: "approvals_inbox", appLang }),
                                  })
                                  const j = await res.json().catch(() => ({}))
                                  if (!res.ok || j.success === false) {
                                    throw new Error(j.error || (appLang === 'en' ? 'Confirmation failed' : 'تعذر تأكيد الإخراج'))
                                  }
                                  toast({ title: t("تم الإخراج", "Delivered"), description: t("تم تأكيد إخراج بضاعة المرتجع", "Return goods-out confirmed") })
                                  await load()
                                } catch (e: any) {
                                  toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                                } finally {
                                  setRunningId(null)
                                }
                              }}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />{t("تأكيد إخراج البضاعة", "Confirm Goods-Out")}
                            </Button>
                          </div>
                        )}
                        {/* v3.74.509 — أزرار قرار الاعتماد للمخوّلين فقط (مالك/أدمن/مدير عام).
                            الخادم كان يرفض غيرهم أصلاً؛ الأزرار كانت تظهر خطأً للمحاسب
                            الذى يرى التبويب للمتابعة فقط. */}
                        {!isWarehouseStage && isAdminLike && (
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                            disabled={runningId === r.id}
                            onClick={async () => {
                              try {
                                setRunningId(r.id)
                                const res = await fetch(`/api/purchase-returns/${encodeURIComponent(r.id)}/approve`, {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `pret:${r.id}:approve:${Date.now()}`,
                                  },
                                  body: JSON.stringify({ action: "APPROVE", uiSurface: "approvals_inbox", appLang }),
                                })
                                const j = await res.json().catch(() => ({}))
                                if (!res.ok || j.success === false) {
                                  throw new Error(j.error || (appLang === 'en' ? 'Approve failed' : 'تعذر اعتماد المرتجع'))
                                }
                                toast({ title: t("تم الاعتماد", "Approved"), description: t("تم اعتماد المرتجع بنجاح", "Return approved") })
                                await load()
                              } catch (e: any) {
                                toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                              } finally {
                                setRunningId(null)
                              }
                            }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />{t("اعتماد المرتجع", "Approve Return")}
                          </Button>
                          <Button
                            size="sm" variant="outline" className="gap-1 text-red-600 border-red-300 hover:bg-red-50 text-xs"
                            disabled={runningId === r.id}
                            onClick={() => { setRejectId(r.id); setRejectType("purchase_return"); setRejectReason("") }}
                          >
                            <XCircle className="w-3.5 h-3.5" />{t("رفض", "Reject")}
                          </Button>
                        </div>
                        )}
                        {isAdminLike && rejectId === r.id && (
                          <div className="mt-3 space-y-2">
                            <textarea
                                          value={rejectReason}
                              onChange={e => setRejectReason(e.target.value)}
                              placeholder={t("سبب الرفض...", "Rejection reason...")}
                              rows={2}
                              className="w-full text-sm p-2 border rounded"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm" variant="destructive"
                                disabled={!rejectReason.trim() || runningId === r.id}
                                onClick={async () => {
                                  try {
                                    setRunningId(r.id)
                                    const res = await fetch(`/api/purchase-returns/${encodeURIComponent(r.id)}/approve`, {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                        "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `pret:${r.id}:reject:${Date.now()}`,
                                      },
                                      body: JSON.stringify({ action: "REJECT", rejectionReason: rejectReason, uiSurface: "approvals_inbox", appLang }),
                                    })
                                    const j = await res.json().catch(() => ({}))
                                    if (!res.ok || j.success === false) {
                                      throw new Error(j.error || (appLang === 'en' ? 'Reject failed' : 'تعذر رفض المرتجع'))
                                    }
                                    toast({ title: t("تم الرفض", "Rejected"), description: t("تم رفض المرتجع", "Return rejected") })
                                    setRejectId(null); setRejectReason("")
                                    await load()
                                  } catch (e: any) {
                                    toast({ variant: "destructive", title: t("خطأ", "Error"), description: String(e?.message ?? e) })
                                  } finally {
                                    setRunningId(null)
                                  }
                                }}
                              >
                                {t("تأكيد الرفض", "Confirm Reject")}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setRejectId(null); setRejectReason("") }}>
                                {t("إلغاء", "Cancel")}
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )})}
                </div>
              )}
            </div>
          )}
          </>
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
