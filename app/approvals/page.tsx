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
}

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
  const [activeTab, setActiveTab] = useState<"all" | "bom" | "routing" | "po" | "mi" | "disc">("all")
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
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="py-16 text-center text-muted-foreground">{t("جاري التحميل…", "Loading…")}</div>
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
