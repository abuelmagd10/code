"use client"

import { useCallback, useEffect, useState } from "react"
import { Cpu, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { ERPPageHeader } from "@/components/erp-page-header"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { useAccess } from "@/lib/access-context"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"

interface WorkCenter {
  id: string
  code: string
  name: string
  work_center_type: string
  status: string
  branch_id: string
  description?: string | null
  capacity_uom?: string | null
  nominal_capacity_per_hour?: number | null
  available_hours_per_day?: number | null
  efficiency_percent?: number | null
  // v3.7.0 / v3.74.266: 3-element costing rates (worker + machine + overheads)
  labor_cost_rate?: number | null
  machine_cost_rate?: number | null
  variable_overhead_rate?: number | null
  fixed_overhead_rate?: number | null
  cost_rate_uom?: string | null
  cost_rates_effective_from?: string | null
}

interface Branch { id: string; name: string; code: string }

const EMPTY_FORM = {
  code: "", name: "", branch_id: "", work_center_type: "machine", status: "active",
  description: "", capacity_uom: "",
  nominal_capacity_per_hour: "", available_hours_per_day: "",
  efficiency_percent: "100",
  // Cost rates default to empty (= 0). UOM defaults to per_hour
  labor_cost_rate: "", machine_cost_rate: "",
  variable_overhead_rate: "", fixed_overhead_rate: "",
  cost_rate_uom: "per_hour",
}

const COST_UOM_LABELS: Record<string, string> = {
  per_hour: "للساعة",
  per_minute: "للدقيقة",
  per_unit: "للوحدة",
}

const TYPE_LABELS: Record<string, string> = { machine: "آلة", production_line: "خط إنتاج", labor_group: "مجموعة عمالة" }
const STATUS_LABELS: Record<string, string> = { active: "نشط", inactive: "غير نشط", blocked: "موقوف" }
const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive"> = { active: "default", inactive: "secondary", blocked: "destructive" }

export default function WorkCentersPage() {
  const { toast } = useToast()
  const { canAction, isReady: accessReady } = useAccess()
  const canRead = accessReady ? canAction("manufacturing_boms", "read") : false
  const canWrite = accessReady ? canAction("manufacturing_boms", "write") : false
  const canUpdate = accessReady ? canAction("manufacturing_boms", "update") : false
  const canDelete = accessReady ? canAction("manufacturing_boms", "delete") : false

  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingWC, setEditingWC] = useState<WorkCenter | null>(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // v3.74.60 — تَحديث تِلقائى عِندَ العَودَة للنّافِذَة/التَّبويب
  useAutoRefresh({ onRefresh: () => loadData() })

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [wcRes, brRes] = await Promise.all([
        fetch("/api/manufacturing/work-centers"),
        fetch("/api/branches"),
      ])
      const wcJson = await wcRes.json()
      const brJson = await brRes.json()
      setWorkCenters(wcJson.data || [])
      setBranches(brJson.branches || [])
    } catch {
      toast({ variant: "destructive", title: "خطأ في التحميل", description: "تعذر جلب بيانات مراكز العمل" })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { if (canRead) loadData() }, [canRead, loadData])

  // v3.74.266 — pick the next free WC-NN code so the user doesn't have
  // to think about codes. Reads the current list and finds max(NN)+1.
  const nextAutoCode = (): string => {
    let max = 0
    for (const wc of workCenters) {
      const m = /^WC-(\d+)$/.exec(wc.code || "")
      if (m) { const n = parseInt(m[1], 10); if (n > max) max = n }
    }
    return `WC-${String(max + 1).padStart(2, "0")}`
  }

  const openAdd = () => {
    setEditingWC(null)
    // v3.74.266 — pre-fill code and branch so the visible form only asks
    // the user for things they actually have to decide (name + type).
    const defaultBranch = branches[0]?.id || ""
    setFormData({ ...EMPTY_FORM, code: nextAutoCode(), branch_id: defaultBranch })
    setDialogOpen(true)
  }
  const openEdit = (wc: WorkCenter) => {
    setEditingWC(wc)
    setFormData({
      code: wc.code,
      name: wc.name,
      branch_id: wc.branch_id,
      work_center_type: wc.work_center_type,
      status: wc.status,
      description: wc.description || "",
      capacity_uom: wc.capacity_uom || "",
      nominal_capacity_per_hour: wc.nominal_capacity_per_hour?.toString() || "",
      available_hours_per_day: wc.available_hours_per_day?.toString() || "",
      efficiency_percent: wc.efficiency_percent != null ? wc.efficiency_percent.toString() : "100",
      labor_cost_rate: wc.labor_cost_rate ? wc.labor_cost_rate.toString() : "",
      machine_cost_rate: wc.machine_cost_rate ? wc.machine_cost_rate.toString() : "",
      variable_overhead_rate: wc.variable_overhead_rate ? wc.variable_overhead_rate.toString() : "",
      fixed_overhead_rate: wc.fixed_overhead_rate ? wc.fixed_overhead_rate.toString() : "",
      cost_rate_uom: wc.cost_rate_uom || "per_hour",
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    // v3.74.266 — اسم المحطة هو الحقل الوحيد المطلوب من المستخدم.
    // الكود يتولّد تلقائياً والفرع بيتعبأ من openAdd().
    if (!formData.name.trim()) return toast({ variant: "destructive", title: "محتاجين اسم المحطة" })
    let codeToSubmit = formData.code.trim()
    if (!codeToSubmit) codeToSubmit = nextAutoCode()
    let branchToSubmit = formData.branch_id
    if (!branchToSubmit) branchToSubmit = branches[0]?.id || ""
    if (!branchToSubmit) return toast({ variant: "destructive", title: "ما فيش فروع بعد", description: "ضيف فرع من الإعدادات الأول." })
    try {
      setSaving(true)
      const url = editingWC ? `/api/manufacturing/work-centers/${editingWC.id}` : "/api/manufacturing/work-centers"
      const method = editingWC ? "PATCH" : "POST"
      // Build payload — convert empty strings to null/0 for numeric fields
      const payload = {
        ...formData,
        code: codeToSubmit,
        branch_id: branchToSubmit,
        nominal_capacity_per_hour: formData.nominal_capacity_per_hour || null,
        available_hours_per_day: formData.available_hours_per_day || null,
        efficiency_percent: formData.efficiency_percent ? Number(formData.efficiency_percent) : 100,
        labor_cost_rate: formData.labor_cost_rate ? Number(formData.labor_cost_rate) : 0,
        machine_cost_rate: formData.machine_cost_rate ? Number(formData.machine_cost_rate) : 0,
        variable_overhead_rate: formData.variable_overhead_rate ? Number(formData.variable_overhead_rate) : 0,
        fixed_overhead_rate: formData.fixed_overhead_rate ? Number(formData.fixed_overhead_rate) : 0,
      }
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "حدث خطأ") }
      toast({ title: editingWC ? "تم التعديل" : "تم الإنشاء", description: editingWC ? "تم تعديل مركز العمل بنجاح" : "تم إنشاء مركز العمل بنجاح" })
      setDialogOpen(false)
      await loadData()
    } catch (e: any) {
      toast({ variant: "destructive", title: "خطأ في الحفظ", description: e.message })
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      setDeleting(true)
      const res = await fetch(`/api/manufacturing/work-centers/${deleteId}`, { method: "DELETE" })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || "حدث خطأ") }
      toast({ title: "تم الحذف", description: "تم حذف مركز العمل بنجاح" })
      setDeleteId(null)
      await loadData()
    } catch (e: any) {
      toast({ variant: "destructive", title: "خطأ في الحذف", description: e.message })
    } finally { setDeleting(false) }
  }

  return (
    <PageGuard resource="manufacturing_boms">
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <CompanyHeader />
          <ERPPageHeader
            title="مراكز العمل"
            description="الآلات والأقسام التي تُنجز فيها عمليات التصنيع — يجب تعريفها قبل إنشاء مسارات التصنيع."
            variant="list"
            extra={canWrite ? <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" />إضافة مركز عمل</Button> : null}
          />

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />جاري التحميل...
            </div>
          ) : workCenters.length === 0 ? (
            <Card className="p-10 text-center">
              <Cpu className="mx-auto h-10 w-10 text-slate-300 mb-3" />
              <p className="text-lg font-medium text-slate-700 dark:text-slate-300">لا توجد مراكز عمل بعد</p>
              <p className="text-sm text-slate-500 mt-1 mb-4">أضف أول مركز عمل لتتمكن من ربطه بعمليات التصنيع.</p>
              {canWrite && <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" />إضافة مركز عمل</Button>}
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {workCenters.map((wc) => (
                <Card key={wc.id} className="dark:bg-slate-900 dark:border-slate-800">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{wc.code} — {wc.name}</CardTitle>
                        <CardDescription className="mt-0.5">{TYPE_LABELS[wc.work_center_type] || wc.work_center_type}</CardDescription>
                      </div>
                      <Badge variant={STATUS_VARIANTS[wc.status] || "secondary"}>{STATUS_LABELS[wc.status] || wc.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {wc.description && <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{wc.description}</p>}
                    {(wc.nominal_capacity_per_hour || wc.available_hours_per_day) && (
                      <div className="flex gap-3 text-xs text-slate-500">
                        {wc.nominal_capacity_per_hour && <span>⚡ {wc.nominal_capacity_per_hour} {wc.capacity_uom || ""}/ساعة</span>}
                        {wc.available_hours_per_day && <span>⏱ {wc.available_hours_per_day} ساعة/يوم</span>}
                      </div>
                    )}
                    {/* v3.7.0: Cost rates summary */}
                    {(Number(wc.labor_cost_rate) > 0 || Number(wc.machine_cost_rate) > 0 || Number(wc.variable_overhead_rate) > 0 || Number(wc.fixed_overhead_rate) > 0) && (
                      <div className="space-y-1 pt-2 border-t border-dashed border-slate-200 dark:border-slate-800">
                        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                          💰 معدلات التكلفة ({COST_UOM_LABELS[wc.cost_rate_uom || "per_hour"]})
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-500">
                          {Number(wc.labor_cost_rate) > 0 && <span>عمالة: {Number(wc.labor_cost_rate).toLocaleString()}</span>}
                          {Number(wc.machine_cost_rate) > 0 && <span>آلة: {Number(wc.machine_cost_rate).toLocaleString()}</span>}
                          {Number(wc.variable_overhead_rate) > 0 && <span>أعباء متغيرة: {Number(wc.variable_overhead_rate).toLocaleString()}</span>}
                          {Number(wc.fixed_overhead_rate) > 0 && <span>أعباء ثابتة: {Number(wc.fixed_overhead_rate).toLocaleString()}</span>}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      {canUpdate && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openEdit(wc)}><Pencil className="h-3.5 w-3.5" />تعديل</Button>}
                      {canDelete && <Button size="sm" variant="outline" className="gap-1.5 text-red-600 hover:bg-red-50" onClick={() => setDeleteId(wc.id)}><Trash2 className="h-3.5 w-3.5" />حذف</Button>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingWC ? "تعديل مركز العمل" : "إضافة مركز عمل جديد"}</DialogTitle>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              مركز العمل هو أى آلة أو خط أو ورشة بتشتغل فيها خطوة من خطوات التصنيع. أدخل الاسم والنوع فقط، وباقى الإعدادات اختيارية.
            </p>
          </DialogHeader>

          {/* v3.74.266 — تبسيط الفورم: 3 حقول ظاهرة + قسمان مطويان */}
          <div className="space-y-4 py-2">
            {/* ─── الأساسيات (دايماً ظاهرة) ─── */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>اسم المحطة <span className="text-red-500">*</span></Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="مثلاً: آلة الخلط الكبرى، خط التعبئة، ورشة التجميع"
                  disabled={saving}
                />
                <p className="text-xs text-slate-400">اكتب اسم واضح يميّز المحطة عن غيرها.</p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>نوع المحطة</Label>
                <Select value={formData.work_center_type} onValueChange={(v) => setFormData({ ...formData, work_center_type: v })} disabled={saving}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="machine">⚙️ آلة — جهاز واحد يشتغل لوحده</SelectItem>
                    <SelectItem value="production_line">🏭 خط إنتاج — مجموعة آلات متتابعة</SelectItem>
                    <SelectItem value="labor_group">👷 ورشة يدوية — عمالة بشرية</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>شرح مختصر (اختيارى)</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="ايه اللى بيحصل فى المحطة دى؟ (سطر أو سطرين)"
                  disabled={saving}
                  rows={2}
                />
              </div>
            </div>

            {/* ─── إعدادات متقدمة (مطوية) ─── */}
            <details className="group rounded-lg border border-slate-200 dark:border-slate-700">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 list-none flex items-center justify-between">
                <span className="flex items-center gap-2">
                  ⚙️ إعدادات تشغيلية متقدمة
                  <span className="text-xs text-slate-400 font-normal">(اختيارى — للى عاوز يتابع الأداء)</span>
                </span>
                <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="grid gap-4 sm:grid-cols-2 p-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-2">
                  <Label>كود المحطة</Label>
                  <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="WC-01" disabled={saving} />
                  <p className="text-xs text-slate-400">رمز قصير لتمييز المحطة. متولّد تلقائياً، تقدر تغيّره.</p>
                </div>
                <div className="space-y-2">
                  <Label>الفرع</Label>
                  <Select value={formData.branch_id} onValueChange={(v) => setFormData({ ...formData, branch_id: v })} disabled={saving || !!editingWC}>
                    <SelectTrigger><SelectValue placeholder="اختر الفرع..." /></SelectTrigger>
                    <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-slate-400">الفرع اللى موجودة فيه المحطة فعلياً.</p>
                </div>
                <div className="space-y-2">
                  <Label>الحالة</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })} disabled={saving}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">نشط — شغّال ويستقبل أوامر</SelectItem>
                      <SelectItem value="inactive">غير نشط — متوقف مؤقتاً</SelectItem>
                      <SelectItem value="blocked">موقوف — معطّل عن الاستخدام</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>وحدة الإنتاج</Label>
                  <Input value={formData.capacity_uom} onChange={(e) => setFormData({ ...formData, capacity_uom: e.target.value })} placeholder="قطعة، كجم، لتر" disabled={saving} />
                  <p className="text-xs text-slate-400">ايه اللى المحطة دى بتنتجه؟ قطع، أوزان، حجوم؟</p>
                </div>
                <div className="space-y-2">
                  <Label>الإنتاج فى الساعة</Label>
                  <Input type="number" min="0" value={formData.nominal_capacity_per_hour} onChange={(e) => setFormData({ ...formData, nominal_capacity_per_hour: e.target.value })} placeholder="100" disabled={saving} />
                  <p className="text-xs text-slate-400">كم قطعة/كجم/لتر بتنتجها فى الساعة؟</p>
                </div>
                <div className="space-y-2">
                  <Label>ساعات العمل اليومية</Label>
                  <Input type="number" min="0" max="24" value={formData.available_hours_per_day} onChange={(e) => setFormData({ ...formData, available_hours_per_day: e.target.value })} placeholder="8" disabled={saving} />
                </div>
                <div className="space-y-2">
                  <Label>كفاءة التشغيل %</Label>
                  <Input type="number" min="0" max="200" step="0.01" value={formData.efficiency_percent} onChange={(e) => setFormData({ ...formData, efficiency_percent: e.target.value })} placeholder="100" disabled={saving} />
                  <p className="text-xs text-slate-400">100% = المحطة بتشتغل بالطاقة القصوى. أقل من ده لو فى وقت تحضير أو صيانة.</p>
                </div>
              </div>
            </details>

            {/* ─── حسابات التكلفة (مطوية تماماً) ─── */}
            <details className="group rounded-lg border border-slate-200 dark:border-slate-700">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 list-none flex items-center justify-between">
                <span className="flex items-center gap-2">
                  💰 حسابات التكلفة
                  <span className="text-xs text-slate-400 font-normal">(للمحاسب فقط — اتركها فاضية لو ما تتبعش تكلفة المحطة)</span>
                </span>
                <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="p-4 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="space-y-2 max-w-xs">
                  <Label>كل قيم التكلفة التالية محسوبة:</Label>
                  <Select value={formData.cost_rate_uom} onValueChange={(v) => setFormData({ ...formData, cost_rate_uom: v })} disabled={saving}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_hour">للساعة الواحدة</SelectItem>
                      <SelectItem value="per_minute">للدقيقة الواحدة</SelectItem>
                      <SelectItem value="per_unit">للقطعة الواحدة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  <div className="space-y-1">
                    <Label className="text-sm">تكلفة العامل</Label>
                    <Input type="number" min="0" step="0.01" value={formData.labor_cost_rate} onChange={(e) => setFormData({ ...formData, labor_cost_rate: e.target.value })} placeholder="0" disabled={saving} />
                    <p className="text-xs text-slate-400">متوسط أجر العامل اللى يشغّل المحطة.</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">تكلفة تشغيل الآلة</Label>
                    <Input type="number" min="0" step="0.01" value={formData.machine_cost_rate} onChange={(e) => setFormData({ ...formData, machine_cost_rate: e.target.value })} placeholder="0" disabled={saving} />
                    <p className="text-xs text-slate-400">كهرباء وزيوت ومستهلكات وإهلاك الآلة.</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">مصاريف متغيرة</Label>
                    <Input type="number" min="0" step="0.01" value={formData.variable_overhead_rate} onChange={(e) => setFormData({ ...formData, variable_overhead_rate: e.target.value })} placeholder="0" disabled={saving} />
                    <p className="text-xs text-slate-400">مصاريف بتتغير حسب الإنتاج (مياه، تنظيف، نقل).</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">مصاريف ثابتة</Label>
                    <Input type="number" min="0" step="0.01" value={formData.fixed_overhead_rate} onChange={(e) => setFormData({ ...formData, fixed_overhead_rate: e.target.value })} placeholder="0" disabled={saving} />
                    <p className="text-xs text-slate-400">مصاريف ثابتة شهرياً (إيجار، تأمين، صيانة دورية) موزعة على الساعة.</p>
                  </div>
                </div>
              </div>
            </details>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingWC ? "حفظ التعديلات" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف مركز العمل هذا؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700">
              {deleting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageGuard>
  )
}
