"use client"

/**
 * v3.74.253 — Refund Approvals queue.
 *
 * Owner / general_manager opens this page to see every refund request
 * the regular roles submitted, then approves or rejects. Approving
 * triggers the same executor logic owner/GM use for self-execute.
 */
import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { CheckCircle, XCircle, Clock, FileText, Filter, Search } from "lucide-react"
import Link from "next/link"

interface RefundRequestRow {
  id: string
  source_type: "invoice" | "bill"
  source_id: string
  mode: string
  amount: number
  reason: string | null
  status: string
  requested_by: string | null
  requested_at: string
  approved_at: string | null
  rejected_at: string | null
  rejection_reason: string | null
  _source_number?: string
  _party_name?: string | null
  _source_status?: string
}

export default function RefundApprovalsPage() {
  const { toast } = useToast()
  const [rows, setRows] = useState<RefundRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("pending_approval")
  const [search, setSearch] = useState("")
  const [actingId, setActingId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/refund-approvals?status=${encodeURIComponent(statusFilter)}`)
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || "Failed")
      setRows(json.data || [])
    } catch (e: any) {
      toast({ title: "تحميل", description: e?.message || "خطأ", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [statusFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      String(r._source_number || "").toLowerCase().includes(q)
      || String(r._party_name || "").toLowerCase().includes(q)
      || String(r.reason || "").toLowerCase().includes(q)
    )
  }, [rows, search])

  async function approve(id: string) {
    setActingId(id)
    try {
      const res = await fetch(`/api/refund-requests/${id}/approve`, { method: "POST" })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || "Failed")
      toast({ title: "اعتماد", description: "تم اعتماد طلب الاسترداد وتنفيذه" })
      await load()
    } catch (e: any) {
      toast({ title: "اعتماد", description: e?.message || "خطأ", variant: "destructive" })
    } finally {
      setActingId(null)
    }
  }

  async function submitReject() {
    if (!rejectId) return
    setActingId(rejectId)
    try {
      const res = await fetch(`/api/refund-requests/${rejectId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason || null }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || "Failed")
      toast({ title: "رفض", description: "تم رفض طلب الاسترداد" })
      setRejectId(null); setRejectReason("")
      await load()
    } catch (e: any) {
      toast({ title: "رفض", description: e?.message || "خطأ", variant: "destructive" })
    } finally {
      setActingId(null)
    }
  }

  function modeLabel(m: string) {
    switch (m) {
      case "cancel_invoice": return "إلغاء الفاتورة"
      case "cancel_bill":    return "إلغاء فاتورة الشراء"
      case "keep_open":      return "إبقاء مفتوحة"
      default: return m
    }
  }

  function statusBadge(s: string) {
    const map: Record<string, string> = {
      pending_approval: "bg-amber-100 text-amber-800 border-amber-300",
      approved_completed: "bg-emerald-100 text-emerald-800 border-emerald-300",
      rejected: "bg-red-100 text-red-800 border-red-300",
      cancelled: "bg-gray-100 text-gray-800 border-gray-300",
    }
    const label: Record<string, string> = {
      pending_approval: "بانتظار الاعتماد",
      approved_completed: "تم الاعتماد والتنفيذ",
      rejected: "مرفوض",
      cancelled: "مُلغى",
    }
    return (
      <span className={`inline-block px-2 py-0.5 text-xs rounded-full border ${map[s] || "bg-gray-100"}`}>
        {label[s] || s}
      </span>
    )
  }

  return (
    <div className="min-h-screen p-3 sm:p-6 max-w-7xl mx-auto" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-600" />
            اعتمادات الاسترداد قبل الشحن / الاستلام
          </CardTitle>
          <p className="text-xs text-gray-500 leading-relaxed mt-1">
            طلبات الاسترداد اللى المستخدمين أنشأوها (محاسب / مدير فرع / admin). المالك أو المدير العام بيعتمد أو يرفض. الاعتماد بينفّذ القيود فوراً ويخرج الفلوس من الحساب المختار.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 text-sm">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                className="border rounded px-2 py-1 bg-white dark:bg-slate-900"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="pending_approval">بانتظار الاعتماد</option>
                <option value="approved_completed">تم الاعتماد والتنفيذ</option>
                <option value="rejected">المرفوض</option>
                <option value="cancelled">المُلغى</option>
                <option value="all">الكل</option>
              </select>
            </div>
            <div className="flex items-center gap-1 flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-gray-500" />
              <Input
                placeholder="ابحث برقم الفاتورة أو اسم العميل/المورد"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" onClick={load}>تحديث</Button>
          </div>

          {loading ? (
            <p className="text-center py-8 text-gray-500">جارى التحميل...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-gray-500">لا توجد طلبات.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-right">النوع</th>
                    <th className="px-3 py-2 text-right">رقم</th>
                    <th className="px-3 py-2 text-right">الطرف</th>
                    <th className="px-3 py-2 text-right">المبلغ</th>
                    <th className="px-3 py-2 text-right">مصير المستند</th>
                    <th className="px-3 py-2 text-right">السبب</th>
                    <th className="px-3 py-2 text-right">طلب فى</th>
                    <th className="px-3 py-2 text-right">الحالة</th>
                    <th className="px-3 py-2 text-right">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const href = r.source_type === "invoice"
                      ? `/invoices/${r.source_id}`
                      : `/bills/${r.source_id}`
                    return (
                      <tr key={r.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-3 py-2">
                          <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${r.source_type === "invoice" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                            {r.source_type === "invoice" ? "مبيعات" : "مشتريات"}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium">
                          <Link href={href} className="text-blue-600 hover:underline" target="_blank">
                            {r._source_number || r.source_id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="px-3 py-2">{r._party_name || "—"}</td>
                        <td className="px-3 py-2 font-bold">{Number(r.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-xs">{modeLabel(r.mode)}</td>
                        <td className="px-3 py-2 text-xs text-gray-600 max-w-[200px] truncate" title={r.reason || ""}>{r.reason || "—"}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(r.requested_at).toLocaleString("ar-EG")}</td>
                        <td className="px-3 py-2">{statusBadge(r.status)}</td>
                        <td className="px-3 py-2 space-x-2 rtl:space-x-reverse whitespace-nowrap">
                          {r.status === "pending_approval" && (
                            <>
                              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => approve(r.id)} disabled={actingId === r.id}>
                                <CheckCircle className="w-4 h-4 ml-1" />
                                اعتماد
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => { setRejectId(r.id); setRejectReason("") }} disabled={actingId === r.id}>
                                <XCircle className="w-4 h-4 ml-1" />
                                رفض
                              </Button>
                            </>
                          )}
                          {r.status === "rejected" && r.rejection_reason && (
                            <span className="text-xs text-gray-500" title={r.rejection_reason}>سبب الرفض: {r.rejection_reason.slice(0, 30)}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!rejectId} onOpenChange={(o) => { if (!o) { setRejectId(null); setRejectReason("") } }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>رفض طلب استرداد</DialogTitle>
            <DialogDescription className="text-xs">يفضل كتابة سبب الرفض ليصل لمنشئ الطلب.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>السبب (اختيارى)</Label>
            <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="مثال: لا يوجد رصيد كافى" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectId(null); setRejectReason("") }} disabled={!!actingId}>إلغاء</Button>
            <Button variant="destructive" onClick={submitReject} disabled={!!actingId}>تأكيد الرفض</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
