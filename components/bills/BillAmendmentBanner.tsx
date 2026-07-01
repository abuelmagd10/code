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
  itemsChanged: number
  itemsAdded: number
  itemsRemoved: number
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

        // Compute simple item diff (best-effort — approvals page has full breakdown)
        const priorItems: any[] = Array.isArray(prior.items_snapshot) ? prior.items_snapshot : []
        const currItems: any[] = Array.isArray(latest.items_snapshot) ? latest.items_snapshot : []
        const priorMap = new Map(priorItems.map(r => [String(r?.product_id ?? r?.product_name), r]))
        const currMap = new Map(currItems.map(r => [String(r?.product_id ?? r?.product_name), r]))
        let added = 0, removed = 0, changed = 0
        for (const [k, c] of currMap.entries()) {
          const p = priorMap.get(k) as any
          if (!p) { added++; continue }
          const same = (a: any, b: any) => Math.abs(Number(a ?? 0) - Number(b ?? 0)) < 0.01
          if (!same(p.quantity, c.quantity) || !same(p.unit_price, c.unit_price) || !same(p.discount_percent, c.discount_percent)) changed++
        }
        for (const [k] of priorMap.entries()) if (!currMap.has(k)) removed++

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
          itemsChanged: changed,
          itemsAdded: added,
          itemsRemoved: removed,
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
          {(info.itemsAdded + info.itemsRemoved + info.itemsChanged > 0) && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              {info.itemsAdded > 0 && <>➕ {info.itemsAdded} {t("بند مضاف", "added")} </>}
              {info.itemsRemoved > 0 && <>➖ {info.itemsRemoved} {t("بند محذوف", "removed")} </>}
              {info.itemsChanged > 0 && <>✏️ {info.itemsChanged} {t("بند معدل", "modified")}</>}
            </p>
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
