"use client"

/**
 * v3.74.462 — Amendment banner shown on the bill/invoice view page.
 *
 * When the accountant amends a draft bill/invoice, v3.74.458 opens a
 * fresh discount_approval and v3.74.461 captures a snapshot linked to
 * the prior one via supersedes_approval_id. This banner surfaces that
 * context to whoever opens the document:
 *   - who edited (from the requester on the new approval row)
 *   - when
 *   - a compact "before / after" summary of the totals
 *   - link to the full diff card on /approvals
 *
 * Rendered by app/bills/[id]/page.tsx and app/invoices/[id]/page.tsx.
 * Silent when there is no pending amendment approval linked to a
 * prior one.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ExternalLink } from "lucide-react"

type Kind = "bill" | "invoice"

interface Props {
  documentId: string
  kind: Kind
  lang?: "ar" | "en"
}

interface ItemLine {
  product_name: string | null
  quantity: number
  unit_price: number
  discount_percent: number
}
// v3.74.495 — carry the full added/removed/modified item lists so the
// banner can spell out what changed instead of just counting them.
interface ChangedItem {
  name: string
  qtyBefore: number
  qtyAfter: number
  priceBefore: number
  priceAfter: number
  discBefore: number
  discAfter: number
}
// v3.74.504 — document-level changes (general discount, shipping,
// adjustment, tax) so the owner sees EVERYTHING that moved, not just
// item lines. Owner spotted: an amendment that changed the general
// discount only surfaced through the total delta.
interface HeaderChange {
  key: "discount" | "shipping" | "shipping_tax" | "adjustment" | "tax"
  before: string
  after: string
}
interface AmendmentInfo {
  approvalId: string
  editorEmail: string | null
  requestedAt: string
  prior: {
    total: number | null
    shipping: number | null
    subtotal: number | null
  }
  current: {
    total: number | null
    shipping: number | null
    subtotal: number | null
  }
  added: ItemLine[]
  removed: ItemLine[]
  changed: ChangedItem[]
  headerChanges: HeaderChange[]
}

export function BillAmendmentBanner({ documentId, kind, lang = "ar" }: Props) {
  const [info, setInfo] = useState<AmendmentInfo | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/discount-approvals?document_id=${encodeURIComponent(documentId)}`, {
          cache: "no-store",
        })
        if (!res.ok) return
        const json = await res.json()
        const rows: any[] = Array.isArray(json?.data) ? json.data : []
        // Find the latest pending amendment approval for this doc
        const kindFilter = kind === "bill" ? "purchase_invoice" : "sales_invoice"
        const amendments = rows.filter(
          r => r.document_id === documentId
            && r.document_type === kindFilter
            && r.status === "pending"
            && r.supersedes_approval_id
        )
        if (amendments.length === 0) return
        const latest = amendments.sort((a, b) => (b.requested_at || "").localeCompare(a.requested_at || ""))[0]
        const prior = latest.prior_approval ?? {}

        // v3.74.495 — full item diff so the banner can list each edit
        // instead of just showing a count.
        const priorItems: any[] = Array.isArray(prior.items_snapshot) ? prior.items_snapshot : []
        const currItems: any[] = Array.isArray(latest.items_snapshot) ? latest.items_snapshot : []
        const priorMap = new Map(priorItems.map(r => [String(r?.product_id ?? r?.product_name), r]))
        const currMap = new Map(currItems.map(r => [String(r?.product_id ?? r?.product_name), r]))
        const num = (x: any) => Number(x ?? 0)
        const same = (a: any, b: any) => Math.abs(num(a) - num(b)) < 0.01
        const toLine = (r: any): ItemLine => ({
          product_name: r?.product_name ?? r?.description ?? null,
          quantity: num(r?.quantity),
          unit_price: num(r?.unit_price),
          discount_percent: num(r?.discount_percent),
        })
        const added: ItemLine[] = []
        const removed: ItemLine[] = []
        const changed: ChangedItem[] = []
        for (const [k, c] of currMap.entries()) {
          const p = priorMap.get(k) as any
          if (!p) { added.push(toLine(c)); continue }
          if (!same(p.quantity, c.quantity) || !same(p.unit_price, c.unit_price) || !same(p.discount_percent, c.discount_percent)) {
            changed.push({
              name: String(c?.product_name ?? p?.product_name ?? "?"),
              qtyBefore: num(p.quantity), qtyAfter: num(c.quantity),
              priceBefore: num(p.unit_price), priceAfter: num(c.unit_price),
              discBefore: num(p.discount_percent), discAfter: num(c.discount_percent),
            })
          }
        }
        for (const [k, p] of priorMap.entries()) if (!currMap.has(k)) removed.push(toLine(p))

        // v3.74.504 — document-level diff (general discount, shipping,
        // shipping tax rate, adjustment, tax amount).
        const headerChanges: HeaderChange[] = []
        const fmtDiscount = (v: any, dt: any) =>
          String(dt ?? "amount") === "percent" ? `${num(v)}%` : num(v).toFixed(2)
        const discountChanged =
          !same(prior.discount_value, latest.discount_value) ||
          String(prior.discount_type ?? "amount") !== String(latest.discount_type ?? "amount")
        if (discountChanged) {
          headerChanges.push({
            key: "discount",
            before: fmtDiscount(prior.discount_value, prior.discount_type),
            after: fmtDiscount(latest.discount_value, latest.discount_type),
          })
        }
        if (!same(prior.shipping_snapshot, latest.shipping_snapshot)) {
          headerChanges.push({
            key: "shipping",
            before: num(prior.shipping_snapshot).toFixed(2),
            after: num(latest.shipping_snapshot).toFixed(2),
          })
        }
        if (!same(prior.shipping_tax_rate_snapshot, latest.shipping_tax_rate_snapshot)) {
          headerChanges.push({
            key: "shipping_tax",
            before: `${num(prior.shipping_tax_rate_snapshot)}%`,
            after: `${num(latest.shipping_tax_rate_snapshot)}%`,
          })
        }
        if (!same(prior.adjustment_snapshot, latest.adjustment_snapshot)) {
          headerChanges.push({
            key: "adjustment",
            before: num(prior.adjustment_snapshot).toFixed(2),
            after: num(latest.adjustment_snapshot).toFixed(2),
          })
        }
        if (!same(prior.tax_amount_snapshot, latest.tax_amount_snapshot)) {
          headerChanges.push({
            key: "tax",
            before: num(prior.tax_amount_snapshot).toFixed(2),
            after: num(latest.tax_amount_snapshot).toFixed(2),
          })
        }

        if (cancelled) return
        setInfo({
          approvalId: latest.id,
          editorEmail: latest.requested_by_email ?? null,
          requestedAt: latest.requested_at,
          prior: {
            total: prior.document_total != null ? Number(prior.document_total) : null,
            shipping: prior.shipping_snapshot != null ? Number(prior.shipping_snapshot) : null,
            subtotal: prior.subtotal_snapshot != null ? Number(prior.subtotal_snapshot) : null,
          },
          current: {
            total: latest.document_total != null ? Number(latest.document_total) : null,
            shipping: latest.shipping_snapshot != null ? Number(latest.shipping_snapshot) : null,
            subtotal: latest.subtotal_snapshot != null ? Number(latest.subtotal_snapshot) : null,
          },
          added,
          removed,
          changed,
          headerChanges,
        })
      } catch {
        // 403 = viewer isn't an approver — banner stays hidden.
      }
    }
    load()
    return () => { cancelled = true }
  }, [documentId, kind])

  if (!info) return null

  const t = (ar: string, en: string) => lang === "ar" ? ar : en
  const fmt = (n: number | null) => n == null ? "—" : n.toFixed(2)
  const dt = new Date(info.requestedAt).toLocaleString(lang === "ar" ? "ar-EG" : "en-US")

  const totalDelta = (info.current.total ?? 0) - (info.prior.total ?? 0)
  const deltaSign = totalDelta > 0 ? "+" : ""

  return (
    <div className="rounded-lg border-2 border-amber-500 bg-amber-50 dark:bg-amber-900/30 p-3 sm:p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-bold text-amber-900 dark:text-amber-200">
            {t(
              "هذه الفاتورة تم تعديلها وتنتظر اعتماد الإدارة",
              "This document was amended and awaits owner approval",
            )}
          </p>
          <p className="mt-1 text-amber-800 dark:text-amber-300">
            {t("المُعدِّل", "Amended by")}: <span className="font-semibold">{info.editorEmail ?? t("غير معروف", "unknown")}</span>
            {" · "}
            {t("فى", "on")} {dt}
          </p>
          <p className="mt-1 text-amber-800 dark:text-amber-300">
            {t("الإجمالى", "Total")}: {fmt(info.prior.total)} → <span className="font-bold">{fmt(info.current.total)}</span>
            {" "}
            <span className={totalDelta > 0 ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"}>
              ({deltaSign}{fmt(totalDelta)})
            </span>
          </p>
          {/* v3.74.504 — document-level changes (general discount, shipping,
              adjustment, tax) so nothing moves silently. */}
          {info.headerChanges.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
                🧾 {t("تغييرات عامة على الفاتورة", "Document-level changes")} ({info.headerChanges.length})
              </p>
              <ul className="text-xs ms-4 list-disc text-amber-800 dark:text-amber-300">
                {info.headerChanges.map((h, i) => {
                  const label =
                    h.key === "discount" ? t("الخصم العام", "General discount")
                    : h.key === "shipping" ? t("الشحن", "Shipping")
                    : h.key === "shipping_tax" ? t("ضريبة الشحن", "Shipping tax")
                    : h.key === "adjustment" ? t("التسوية", "Adjustment")
                    : t("الضريبة", "Tax amount")
                  return (
                    <li key={i}>
                      <strong>{label}</strong>: {h.before} → <span className="font-bold">{h.after}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {/* v3.74.495 — spell out every item edit under the banner header.
              Owner asked for detail equal to what the /approvals DiffCard
              shows, not just counts. */}
          {info.added.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-green-700 dark:text-green-400">
                ➕ {t("بنود مضافة", "Added items")} ({info.added.length})
              </p>
              <ul className="text-xs ms-4 list-disc text-amber-800 dark:text-amber-300">
                {info.added.map((it, i) => (
                  <li key={i}>
                    {it.product_name ?? "?"} · {t("كمية","qty")} {it.quantity} × {it.unit_price.toFixed(2)}
                    {it.discount_percent > 0 && <> · {t("خصم","disc")} {it.discount_percent}%</>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {info.removed.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                ➖ {t("بنود محذوفة", "Removed items")} ({info.removed.length})
              </p>
              <ul className="text-xs ms-4 list-disc text-amber-800 dark:text-amber-300">
                {info.removed.map((it, i) => (
                  <li key={i}>
                    {it.product_name ?? "?"} · {t("كمية","qty")} {it.quantity} × {it.unit_price.toFixed(2)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {info.changed.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                ✏️ {t("بنود معدلة", "Modified items")} ({info.changed.length})
              </p>
              <ul className="text-xs ms-4 list-disc text-amber-800 dark:text-amber-300">
                {info.changed.map((c, i) => {
                  const parts: string[] = []
                  const same = (a: number, b: number) => Math.abs(a - b) < 0.01
                  if (!same(c.qtyBefore, c.qtyAfter)) parts.push(`${t("كمية","qty")} ${c.qtyBefore}→${c.qtyAfter}`)
                  if (!same(c.priceBefore, c.priceAfter)) parts.push(`${t("سعر","price")} ${c.priceBefore.toFixed(2)}→${c.priceAfter.toFixed(2)}`)
                  if (!same(c.discBefore, c.discAfter)) parts.push(`${t("خصم","disc")} ${c.discBefore}%→${c.discAfter}%`)
                  return (
                    <li key={i}>
                      <strong>{c.name}</strong>{parts.length > 0 && <>: {parts.join(" · ")}</>}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <Link
            href="/approvals"
            className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline"
          >
            {t("عرض التعديلات بالتفصيل", "View full diff")}
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  )
}
