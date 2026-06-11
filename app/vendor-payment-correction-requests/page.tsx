/**
 * v3.74.127 — Vendor payment correction requests workflow page.
 * Mirror of /customer-refund-requests for the supplier side. Owner/GM see
 * everything and can Approve/Reject. The requester sees their own rows and
 * can Execute once approved (SoD: approver cannot execute).
 */
"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { ERPPageHeader } from "@/components/erp-page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

type Status = "pending" | "approved" | "executed" | "cancelled"
type Row = {
  id: string
  company_id: string
  supplier_id: string
  bill_id: string | null
  source_type: string
  amount: number
  status: Status
  notes: string | null
  rejection_reason: string | null
  requested_by: string | null
  approved_by: string | null
  executed_by: string | null
  created_at: string
  approved_at: string | null
  executed_at: string | null
  original_payment_id: string | null
  metadata: any
  suppliers?: { name: string } | null
  bills?: { bill_number: string } | null
}

const STATUS_LABEL: Record<Status, string> = {
  pending: "بانتِظار الاعتماد",
  approved: "مُعتَمَد — جاهِز للتَّنفيذ",
  executed: "تَم التَّنفيذ",
  cancelled: "مَرفوض / مُلغى"
}
const STATUS_CLASS: Record<Status, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  approved: "bg-blue-100 text-blue-800 border-blue-300",
  executed: "bg-emerald-100 text-emerald-800 border-emerald-300",
  cancelled: "bg-gray-200 text-gray-700 border-gray-300"
}

export default function VendorPaymentCorrectionRequestsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlStatus = (searchParams?.get("status") as Status | null) || null

  const [companyId, setCompanyId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [role, setRole] = useState<string>("")
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Status | "all">(urlStatus || "all")
  const [rejectFor, setRejectFor] = useState<Row | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [actingId, setActingId] = useState<string | null>(null)

  const canApprove = role === "owner" || role === "general_manager"

  const load = useCallback(async () => {
    setLoading(true)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)
    const { data: m } = await sb.from("company_members")
      .select("company_id, role").eq("user_id", user.id).maybeSingle()
    if (!m) { setLoading(false); return }
    setCompanyId((m as any).company_id)
    setRole(String((m as any).role || ""))

    const { data } = await sb
      .from("vendor_payment_correction_requests")
      .select("*, suppliers(name), bills(bill_number)")
      .eq("company_id", (m as any).company_id)
      .order("created_at", { ascending: false })
    setRows((data as any) || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Realtime refresh
  useEffect(() => {
    if (!companyId) return
    const sb = createClient()
    const ch = sb.channel(`vpcr-${companyId}`)
      .on("postgres_changes", {
        event: "*", schema: "public",
        table: "vendor_payment_correction_requests",
        filter: `company_id=eq.${companyId}`
      }, () => { load() })
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [companyId, load])

  const visibleRows = useMemo(() => {
    let r = rows
    if (!canApprove) r = r.filter(x => x.requested_by === userId)
    if (filter !== "all") r = r.filter(x => x.status === filter)
    return r
  }, [rows, canApprove, userId, filter])

  const counts = useMemo(() => {
    const base = canApprove ? rows : rows.filter(x => x.requested_by === userId)
    return {
      all: base.length,
      pending: base.filter(x => x.status === "pending").length,
      approved: base.filter(x => x.status === "approved").length,
      executed: base.filter(x => x.status === "executed").length,
      cancelled: base.filter(x => x.status === "cancelled").length,
    }
  }, [rows, canApprove, userId])

  const canExecuteRow = (r: Row) => {
    if (r.status !== "approved") return false
    if (userId === r.approved_by) return false  // SoD
    if (userId === r.requested_by) return true
    return canApprove
  }

  async function approve(r: Row) {
    setActingId(r.id)
    try {
      const res = await fetch(`/api/vendor-payment-correction-requests/${r.id}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || "Approve failed")
      toast({ title: "تَم الاعتماد", description: j?.message || "" })
      load()
    } catch (e: any) {
      toast({ title: "خَطَأ", description: e?.message, variant: "destructive" })
    } finally { setActingId(null) }
  }

  async function execute(r: Row) {
    setActingId(r.id)
    try {
      const res = await fetch(`/api/vendor-payment-correction-requests/${r.id}/execute`, {
        method: "POST"
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || "Execute failed")
      toast({ title: "تَم التَّنفيذ", description: j?.message || "" })
      load()
    } catch (e: any) {
      toast({ title: "خَطَأ", description: e?.message, variant: "destructive" })
    } finally { setActingId(null) }
  }

  async function reject() {
    if (!rejectFor) return
    if (rejectReason.trim().length < 3) {
      toast({ title: "سَبَب الرَّفض مَطلوب", variant: "destructive" })
      return
    }
    setActingId(rejectFor.id)
    try {
      const res = await fetch(`/api/vendor-payment-correction-requests/${rejectFor.id}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason })
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || "Reject failed")
      toast({ title: "تَم الرَّفض" })
      setRejectFor(null); setRejectReason("")
      load()
    } catch (e: any) {
      toast({ title: "خَطَأ", description: e?.message, variant: "destructive" })
    } finally { setActingId(null) }
  }

  return (
    <div className="container mx-auto p-4 space-y-4" dir="rtl">
      <ERPPageHeader
        title="طَلَبات تَصحيح مَدفوعات الموردين"
        description="مُقتَرِح ⇐ مالك/مُدير عام يَعتَمِد ⇐ المُقتَرِح يُنَفِّذ (فَصل المَهام)"
        actions={
          <Button variant="outline" onClick={() => router.push("/payments")}>
            رُجوع لصَفحَة المَدفوعات
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {(["all","pending","approved","executed","cancelled"] as const).map(s => (
          <Card key={s}
            className={`cursor-pointer transition ${filter === s ? "ring-2 ring-blue-500" : ""}`}
            onClick={() => setFilter(s)}>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{(counts as any)[s]}</div>
              <div className="text-xs text-muted-foreground">
                {s === "all" ? "الكُل" : STATUS_LABEL[s as Status]}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>السِّجِل</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">جارٍ التَّحميل…</div>
          ) : visibleRows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا تَوجَد طَلَبات حَسَب هذا الفِلتَر
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-right">التاريخ</th>
                    <th className="p-2 text-right">المُورِّد</th>
                    <th className="p-2 text-right">الفاتورَة</th>
                    <th className="p-2 text-right">المَبلَغ</th>
                    <th className="p-2 text-right">السَّبَب</th>
                    <th className="p-2 text-right">الحالَة</th>
                    <th className="p-2 text-right">الإِجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(r => (
                    <tr key={r.id} className="border-b">
                      <td className="p-2">{new Date(r.created_at).toLocaleDateString("ar-EG")}</td>
                      <td className="p-2">{r.suppliers?.name || "-"}</td>
                      <td className="p-2">{r.bills?.bill_number || "-"}</td>
                      <td className="p-2 font-mono">{Number(r.amount).toLocaleString()}</td>
                      <td className="p-2 max-w-xs truncate" title={r.notes || ""}>
                        {r.notes || "-"}
                      </td>
                      <td className="p-2">
                        <Badge className={`${STATUS_CLASS[r.status]} border`}>
                          {STATUS_LABEL[r.status]}
                        </Badge>
                        {r.status === "cancelled" && r.rejection_reason && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {r.rejection_reason}
                          </div>
                        )}
                      </td>
                      <td className="p-2 space-x-1 space-x-reverse">
                        {r.status === "pending" && canApprove && (
                          <>
                            <Button size="sm" variant="default"
                              disabled={actingId === r.id}
                              onClick={() => approve(r)}>اعتماد</Button>
                            <Button size="sm" variant="destructive"
                              disabled={actingId === r.id}
                              onClick={() => setRejectFor(r)}>رَفض</Button>
                          </>
                        )}
                        {canExecuteRow(r) && (
                          <Button size="sm" variant="default"
                            disabled={actingId === r.id}
                            onClick={() => execute(r)}>تَنفيذ</Button>
                        )}
                        {r.status === "approved" && !canExecuteRow(r) && userId === r.approved_by && (
                          <span className="text-xs text-amber-700">
                            لا تَستَطيع تَنفيذ ما اعتَمَدتُه (فَصل المَهام)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && (setRejectFor(null), setRejectReason(""))}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>رَفض طَلَب تَصحيح</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              المُورِّد: {rejectFor?.suppliers?.name || ""} — المَبلَغ: {Number(rejectFor?.amount || 0).toLocaleString()}
            </div>
            <Textarea
              placeholder="سَبَب الرَّفض (سَيُعرَض للمُقتَرِح)…"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectFor(null)}>إِلغاء</Button>
            <Button variant="destructive"
              disabled={actingId === rejectFor?.id || rejectReason.trim().length < 3}
              onClick={reject}>تَأكيد الرَّفض</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
