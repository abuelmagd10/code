"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Factory,
  GitBranch,
  Info,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Timer,
  Trash2,
} from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ERPPageHeader } from "@/components/erp-page-header"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/hooks/use-toast"
import { useAccess } from "@/lib/access-context"
import {
  ROUTING_USAGE_OPTIONS,
  type RoutingDetail,
  type RoutingOperationDraft,
  type RoutingVersionCreatePayload,
  type RoutingVersionSnapshot,
  type RoutingVersionStatus,
  type WorkCenterSummary,
  activateRoutingVersion,
  archiveRoutingVersion,
  buildProductLabel,
  buildWorkCenterLabel,
  canActivateRoutingVersion,
  canArchiveRoutingVersion,
  canDeactivateRoutingVersion,
  canDeleteRoutingVersion,
  createRoutingVersion,
  deactivateRoutingVersion,
  deleteRouting,
  deleteRoutingVersion,
  fetchAllWorkCenters,
  fetchRoutingDetail,
  fetchRoutingVersionSnapshot,
  formatDateTime,
  formatQuantity,
  getRoutingVersionStatusLabel,
  getRoutingVersionStatusVariant,
  isRoutingVersionHeaderEditable,
  isRoutingVersionStructureEditable,
  isoToLocalDateTimeInput,
  localDateTimeInputToIso,
  routingSnapshotToDraftOperations,
  updateRouting,
  updateRoutingOperations,
  updateRoutingVersion,
} from "@/lib/manufacturing/routing-ui"

interface RoutingDetailPageProps {
  routingId: string
}

interface RoutingHeaderFormState {
  routing_code: string
  routing_name: string
  description: string
  is_active: boolean
}

interface RoutingVersionFormState {
  effective_from: string
  effective_to: string
  change_summary: string
  notes: string
}

const EMPTY_VERSION_FORM: RoutingVersionFormState = {
  effective_from: "",
  effective_to: "",
  change_summary: "",
  notes: "",
}

const EMPTY_CREATE_VERSION_FORM: RoutingVersionCreatePayload = {
  clone_from_version_id: null,
  effective_from: null,
  effective_to: null,
  change_summary: "",
  notes: "",
}

function getRoutingVersionLockMessage(status: RoutingVersionStatus) {
  switch (status) {
    case "active":
      return "الإصدار ده مفعّل ومستخدم فى التصنيع دلوقتى. مش هتقدر تعدّله إلا بعد ما تشيله من الخدمة أو تأرشفه."
    case "inactive":
      return "الإصدار ده موقوف. تقدر تشغّله تانى أو تأرشفه نهائياً."
    case "archived":
      return "الإصدار ده مؤرشف. مفيش تعديل ممكن عليه."
    default:
      return "الإصدار ده لسه قيد التحضير. تقدر تعدّل بياناته وخطواته."
  }
}

function createEmptyOperation(nextOperationNo: number): RoutingOperationDraft {
  return {
    operation_no: nextOperationNo,
    operation_code: "",
    operation_name: "",
    work_center_id: "",
    setup_time_minutes: 0,
    run_time_minutes_per_unit: 0,
    queue_time_minutes: 0,
    move_time_minutes: 0,
    labor_time_minutes: 0,
    machine_time_minutes: 0,
    quality_checkpoint_required: false,
    instructions: "",
  }
}

export function RoutingDetailPage({ routingId }: RoutingDetailPageProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { canAction, isReady: accessReady } = useAccess()

  const canRead = accessReady ? canAction("manufacturing_boms", "read") : false
  const canWrite = accessReady ? canAction("manufacturing_boms", "write") : false
  const canUpdate = accessReady ? canAction("manufacturing_boms", "update") : false
  const canDelete = accessReady ? canAction("manufacturing_boms", "delete") : false

  const [routing, setRouting] = useState<RoutingDetail | null>(null)
  const [versionSnapshot, setVersionSnapshot] = useState<RoutingVersionSnapshot | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [loadingRouting, setLoadingRouting] = useState(true)
  const [loadingVersion, setLoadingVersion] = useState(false)
  const [savingHeader, setSavingHeader] = useState(false)
  const [savingVersionHeader, setSavingVersionHeader] = useState(false)
  const [savingOperations, setSavingOperations] = useState(false)
  const [runningAction, setRunningAction] = useState<string | null>(null)
  const [createVersionOpen, setCreateVersionOpen] = useState(false)
  const [createVersionForm, setCreateVersionForm] = useState<RoutingVersionCreatePayload>(EMPTY_CREATE_VERSION_FORM)
  const [confirmAction, setConfirmAction] = useState<null | "delete-routing" | "delete-version" | "activate" | "deactivate" | "archive">(null)

  const [headerForm, setHeaderForm] = useState<RoutingHeaderFormState>({
    routing_code: "",
    routing_name: "",
    description: "",
    is_active: true,
  })
  const [versionForm, setVersionForm] = useState<RoutingVersionFormState>(EMPTY_VERSION_FORM)
  const [operationsDraft, setOperationsDraft] = useState<RoutingOperationDraft[]>([])
  const [allWorkCenters, setAllWorkCenters] = useState<WorkCenterSummary[]>([])

  const activeSnapshot = versionSnapshot?.version.id === selectedVersionId ? versionSnapshot : null
  const selectedVersion =
    activeSnapshot?.version || routing?.versions.find((version) => version.id === selectedVersionId) || null
  const versionEditable = selectedVersion ? isRoutingVersionHeaderEditable(selectedVersion.status) : false
  const operationsEditable = selectedVersion ? isRoutingVersionStructureEditable(selectedVersion.status) : false
  const selectedVersionOperationCount =
    activeSnapshot && selectedVersion && activeSnapshot.version.id === selectedVersion.id
      ? activeSnapshot.operations.length
      : null
  const activationRequiresSavedOperation = selectedVersion
    ? canActivateRoutingVersion(selectedVersion.status) &&
      selectedVersionOperationCount !== null &&
      selectedVersionOperationCount <= 0
    : false
  const ownerProduct = activeSnapshot?.product || routing?.product || null
  const canDeleteRoutingRecord = Boolean(routing) && Boolean(routing?.versions.every((version) => version.status === "draft"))

  const workCentersById = useMemo(() => {
    // Start with all fetched work centers
    const byId: Record<string, WorkCenterSummary> = Object.fromEntries(
      allWorkCenters.map((wc) => [wc.id, wc])
    )
    // Merge in any work centers already embedded in the snapshot (richer data)
    for (const operation of activeSnapshot?.operations || []) {
      if (operation.work_center) {
        byId[operation.work_center_id] = operation.work_center
      }
    }
    return byId
  }, [allWorkCenters, activeSnapshot])

  const hydrateHeaderForm = useCallback((detail: RoutingDetail) => {
    setHeaderForm({
      routing_code: detail.routing_code || "",
      routing_name: detail.routing_name || "",
      description: detail.description || "",
      is_active: Boolean(detail.is_active),
    })
  }, [])

  const hydrateVersionState = useCallback((snapshot: RoutingVersionSnapshot) => {
    setVersionSnapshot(snapshot)
    setVersionForm({
      effective_from: isoToLocalDateTimeInput(snapshot.version.effective_from),
      effective_to: isoToLocalDateTimeInput(snapshot.version.effective_to),
      change_summary: snapshot.version.change_summary || "",
      notes: snapshot.version.notes || "",
    })
    setOperationsDraft(routingSnapshotToDraftOperations(snapshot.operations))
  }, [])

  const resetVersionState = useCallback(() => {
    setVersionSnapshot(null)
    setVersionForm(EMPTY_VERSION_FORM)
    setOperationsDraft([])
  }, [])

  const loadRoutingDetailData = useCallback(async (preferredVersionId?: string | null) => {
    try {
      setLoadingRouting(true)
      const detail = await fetchRoutingDetail(routingId)
      setRouting(detail)
      hydrateHeaderForm(detail)

      const resolvedVersionId =
        (preferredVersionId && detail.versions.some((version) => version.id === preferredVersionId) && preferredVersionId) ||
        (selectedVersionId && detail.versions.some((version) => version.id === selectedVersionId) && selectedVersionId) ||
        detail.versions.find((version) => version.status === "active")?.id ||
        detail.versions[0]?.id ||
        null

      setSelectedVersionId(resolvedVersionId)
      if (!resolvedVersionId) {
        resetVersionState()
      }

      return resolvedVersionId
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر فتح مسار التصنيع",
        description: error?.message || "حدث خطأ أثناء تحميل السجل",
      })
      setRouting(null)
      setSelectedVersionId(null)
      resetVersionState()
      return null
    } finally {
      setLoadingRouting(false)
    }
  }, [hydrateHeaderForm, resetVersionState, routingId, selectedVersionId, toast])

  const loadSelectedVersion = useCallback(async (versionId: string) => {
    try {
      setLoadingVersion(true)
      const snapshot = await fetchRoutingVersionSnapshot(versionId)
      hydrateVersionState(snapshot)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر تحميل بيانات الإصدار",
        description: error?.message || "حصل خطأ أثناء تحميل الإصدار المحدد",
      })
      resetVersionState()
    } finally {
      setLoadingVersion(false)
    }
  }, [hydrateVersionState, resetVersionState, toast])

  const refreshWorkspace = useCallback(async (preferredVersionId?: string | null) => {
    const resolvedVersionId = await loadRoutingDetailData(preferredVersionId)
    if (resolvedVersionId) {
      await loadSelectedVersion(resolvedVersionId)
    }
  }, [loadRoutingDetailData, loadSelectedVersion])

  useEffect(() => {
    if (!canRead) return
    loadRoutingDetailData()
    fetchAllWorkCenters()
      .then(setAllWorkCenters)
      .catch(() => {/* non-critical — dropdown will be empty */})
  }, [canRead, loadRoutingDetailData])

  useEffect(() => {
    if (!selectedVersionId) return
    loadSelectedVersion(selectedVersionId)
  }, [selectedVersionId, loadSelectedVersion])

  const handleSaveHeader = async () => {
    if (!routing) return
    if (!headerForm.routing_code.trim() || !headerForm.routing_name.trim()) {
      toast({
        variant: "destructive",
        title: "البيانات الأساسية مطلوبة",
        description: "كود المسار واسمه محتاجين قبل الحفظ.",
      })
      return
    }

    try {
      setSavingHeader(true)
      await updateRouting(routing.id, {
        routing_code: headerForm.routing_code.trim(),
        routing_name: headerForm.routing_name.trim(),
        description: headerForm.description.trim() || null,
        is_active: headerForm.is_active,
      })

      toast({
        title: "تم الحفظ",
        description: "بيانات المسار اتعدّلت بنجاح.",
      })

      await refreshWorkspace(selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر الحفظ",
        description: error?.message || "حدث خطأ أثناء الحفظ",
      })
      await refreshWorkspace(selectedVersionId)
    } finally {
      setSavingHeader(false)
    }
  }

  const handleDeleteRouting = async () => {
    if (!routing) return

    try {
      setRunningAction("delete-routing")
      await deleteRouting(routing.id)
      toast({
        title: "تم حذف المسار",
        description: "المسار وكل إصداراته اتمسحوا.",
      })
      router.push("/manufacturing/routings")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر حذف المسار",
        description: error?.message || "لا يمكن الحذف لوجود نسخ مفعّلة أو لعدم كفاية الصلاحيات.",
      })
      setRunningAction(null)
      await refreshWorkspace(selectedVersionId)
    }
  }

  const handleCreateVersion = async () => {
    if (!routing) return

    try {
      setRunningAction("create-version")
      const result = await createRoutingVersion(routing.id, {
        clone_from_version_id: createVersionForm.clone_from_version_id || null,
        effective_from: createVersionForm.effective_from || null,
        effective_to: createVersionForm.effective_to || null,
        change_summary: typeof createVersionForm.change_summary === "string" ? createVersionForm.change_summary.trim() || null : null,
        notes: typeof createVersionForm.notes === "string" ? createVersionForm.notes.trim() || null : null,
      })

      setCreateVersionOpen(false)
      setCreateVersionForm(EMPTY_CREATE_VERSION_FORM)
      toast({
        title: "تم إنشاء إصدار جديد",
        description: result.version_no ? `الإصدار v${result.version_no} جاهز للتعديل دلوقتى.` : "تم إنشاء الإصدار.",
      })
      await refreshWorkspace(result.routing_version_id || selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر إنشاء الإصدار",
        description: error?.message || "حصل خطأ أثناء إنشاء الإصدار",
      })
    } finally {
      setRunningAction(null)
    }
  }

  const handleSaveVersionHeader = async () => {
    if (!selectedVersionId) return

    try {
      setSavingVersionHeader(true)
      await updateRoutingVersion(selectedVersionId, {
        effective_from: localDateTimeInputToIso(versionForm.effective_from),
        effective_to: localDateTimeInputToIso(versionForm.effective_to),
        change_summary: versionForm.change_summary.trim() || null,
        notes: versionForm.notes.trim() || null,
      })

      toast({
        title: "تم حفظ الإصدار",
        description: "بيانات الإصدار اتعدّلت بنجاح.",
      })

      await refreshWorkspace(selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر حفظ الإصدار",
        description: error?.message || "حدث خطأ أثناء الحفظ",
      })
      await refreshWorkspace(selectedVersionId)
    } finally {
      setSavingVersionHeader(false)
    }
  }

  const handleDeleteVersion = async () => {
    if (!selectedVersionId || !selectedVersion) return

    try {
      setRunningAction("delete-version")
      await deleteRoutingVersion(selectedVersionId)
      toast({
        title: "تم حذف الإصدار",
        description: `تم حذف v${selectedVersion.version_no} بنجاح.`,
      })

      const nextVersionId = routing?.versions.find((version) => version.id !== selectedVersionId)?.id || null
      await refreshWorkspace(nextVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر حذف الإصدار",
        description: error?.message || "الحذف مرفوض بسبب الحالة الحالية للإصدار.",
      })
      await refreshWorkspace(selectedVersionId)
    } finally {
      setRunningAction(null)
    }
  }

  const handleSaveOperations = async () => {
    if (!selectedVersionId) return

    // Client-side validation before sending to API
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (let i = 0; i < operationsDraft.length; i++) {
      const op = operationsDraft[i]
      if (!op.operation_code.trim()) {
        toast({ variant: "destructive", title: "بيانات ناقصة", description: `العملية رقم ${i + 1}: كود العملية مطلوب` })
        return
      }
      if (!op.operation_name.trim()) {
        toast({ variant: "destructive", title: "بيانات ناقصة", description: `العملية رقم ${i + 1}: اسم العملية مطلوب` })
        return
      }
      if (!op.work_center_id || !uuidRegex.test(op.work_center_id)) {
        toast({ variant: "destructive", title: "بيانات ناقصة", description: `العملية رقم ${i + 1}: يجب تحديد مركز العمل` })
        return
      }
    }

    const sanitizedOperations = operationsDraft.map((operation) => ({
      operation_no: Number(operation.operation_no),
      operation_code: operation.operation_code.trim(),
      operation_name: operation.operation_name.trim(),
      work_center_id: operation.work_center_id.trim(),
      setup_time_minutes: Number(operation.setup_time_minutes || 0),
      run_time_minutes_per_unit: Number(operation.run_time_minutes_per_unit || 0),
      queue_time_minutes: Number(operation.queue_time_minutes || 0),
      move_time_minutes: Number(operation.move_time_minutes || 0),
      labor_time_minutes: Number(operation.labor_time_minutes || 0),
      machine_time_minutes: Number(operation.machine_time_minutes || 0),
      quality_checkpoint_required: Boolean(operation.quality_checkpoint_required),
      instructions: operation.instructions?.trim() || null,
    }))

    try {
      setSavingOperations(true)
      await updateRoutingOperations(selectedVersionId, sanitizedOperations)
      toast({
        title: "تم حفظ مراحل التصنيع",
        description: "تم تحديث مراحل التصنيع وحفظها بنجاح.",
      })
      await refreshWorkspace(selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر حفظ العمليات",
        description: error?.message || "حدث خطأ أثناء تحديث العمليات",
      })
      await refreshWorkspace(selectedVersionId)
    } finally {
      setSavingOperations(false)
    }
  }

  const executeVersionAction = async (action: string, operation: () => Promise<unknown>, successTitle: string, successDescription: string) => {
    try {
      setRunningAction(action)
      await operation()
      toast({
        title: successTitle,
        description: successDescription,
      })
      await refreshWorkspace(selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر تنفيذ العملية",
        description: error?.message || "تم رفض العملية بسبب قيود الحالة أو التزامن",
      })
      await refreshWorkspace(selectedVersionId)
    } finally {
      setRunningAction(null)
    }
  }

  const handleConfirmAction = async () => {
    switch (confirmAction) {
      case "delete-routing":
        await handleDeleteRouting()
        break
      case "delete-version":
        if (!selectedVersion) return
        await handleDeleteVersion()
        break
      case "activate":
        if (!selectedVersion) return
        await executeVersionAction(
          "activate",
          () => activateRoutingVersion(selectedVersion.id),
          "الإصدار اتفعّل",
          `الإصدار v${selectedVersion.version_no} بقى نشط.`
        )
        break
      case "deactivate":
        if (!selectedVersion) return
        await executeVersionAction(
          "deactivate",
          () => deactivateRoutingVersion(selectedVersion.id),
          "الإصدار اتشال من الخدمة",
          `الإصدار v${selectedVersion.version_no} بقى غير نشط.`
        )
        break
      case "archive":
        if (!selectedVersion) return
        await executeVersionAction(
          "archive",
          () => archiveRoutingVersion(selectedVersion.id),
          "الإصدار اتأرشف",
          `الإصدار v${selectedVersion.version_no} اتأرشف وبقى للقراءة فقط.`
        )
        break
      default:
        break
    }
  }

  const confirmDialogMeta = useMemo(() => {
    if (!selectedVersion && confirmAction !== "delete-routing") return null

    switch (confirmAction) {
      case "delete-routing":
        return {
          title: "حذف المسار",
          description: "هيتمسح المسار كله لو الشروط متحققة.",
          actionLabel: "حذف المسار",
          actionClassName: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        }
      case "delete-version":
        return {
          title: "حذف الإصدار ده",
          description: `الإصدار ${selectedVersion?.version_no} هيتمسح نهائياً. الحذف ممكن قبل تفعيل الإصدار بس.`,
          actionLabel: "حذف الإصدار",
          actionClassName: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        }
      case "activate":
        return {
          title: "تفعيل الإصدار ده",
          description: activationRequiresSavedOperation
            ? "مش هتقدر تفعّل الإصدار قبل ما تضيف خطوة واحدة على الأقل وتحفظها."
            : `الإصدار ${selectedVersion?.version_no} هيبقى الإصدار الفعّال للتصنيع. لو فى إصدار تانى مفعّل، هيتشال من الخدمة تلقائياً.`,
          actionLabel: "تفعيل الإصدار",
          actionClassName: "",
        }
      case "deactivate":
        return {
          title: "شيل الإصدار من الخدمة",
          description: `الإصدار ${selectedVersion?.version_no} هيتشال من الخدمة بدون حذف أى بيانات. تقدر تشغّله تانى بعدين.`,
          actionLabel: "شيل من الخدمة",
          actionClassName: "",
        }
      case "archive":
        return {
          title: "أرشفة الإصدار نهائياً",
          description: `الإصدار ${selectedVersion?.version_no} هيتقفل نهائياً وما تقدرش تعدّله بعد كده.`,
          actionLabel: "أرشفة",
          actionClassName: "bg-slate-900 text-white hover:bg-slate-800",
        }
      default:
        return null
    }
  }, [activationRequiresSavedOperation, confirmAction, selectedVersion])

  const handleAddOperation = () => {
    const nextOperationNo = Math.max(0, ...operationsDraft.map((operation) => Number(operation.operation_no) || 0)) + 10
    setOperationsDraft((current) => [...current, createEmptyOperation(nextOperationNo)])
  }

  return (
    <PageGuard resource="manufacturing_boms">
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <CompanyHeader />
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <ERPPageHeader
          title={routing ? `${routing.routing_code} — ${routing.routing_name}` : "تفاصيل المسار"}
          description="إدارة بيانات المسار وإصداراته وخطوات التصنيع."
          variant="detail"
          backHref="/manufacturing/routings"
          backLabel="العودة للقائمة"
          extra={
            <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
              <Factory className="h-3.5 w-3.5" />
              مسار تصنيع
            </div>
          }
          actions={
            <>
              <Button variant="outline" onClick={() => refreshWorkspace(selectedVersionId)} disabled={loadingRouting || loadingVersion} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${loadingRouting || loadingVersion ? "animate-spin" : ""}`} />
                تحديث
              </Button>
              <Button onClick={() => setCreateVersionOpen(true)} disabled={!canWrite || !routing} className="gap-2" data-ai-help="manufacturing_routing_detail.create_version_button">
                <Plus className="h-4 w-4" />
                إنشاء إصدار جديد
              </Button>
              <Button
                variant="destructive"
                onClick={() => setConfirmAction("delete-routing")}
                disabled={!canDelete || !canDeleteRoutingRecord}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                حذف المسار
              </Button>
            </>
          }
            />
          </div>

        <div className="space-y-6">
          {loadingRouting && !routing ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border bg-white p-12 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  جارٍ تحميل المسار...
                </div>
              ) : !routing ? (
                <div className="rounded-2xl border border-dashed bg-white p-12 text-center">
                  <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                    <AlertTriangle className="h-10 w-10 text-slate-300" />
                    <div className="text-lg font-medium text-slate-900">المسار ده مش موجود</div>
                    <p className="text-sm leading-6 text-slate-500">
                      قد يكون السجل غير موجود أو أنك لا تملك صلاحية الوصول إليه.
                    </p>
                    <Button variant="outline" onClick={() => router.push("/manufacturing/routings")}>
                      العودة إلى القائمة
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Quick info bar */}
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card className="border-cyan-200 bg-cyan-50/80" data-ai-help="manufacturing_routing_detail.finished_product">
                      <CardContent className="p-4">
                        <div className="text-sm text-slate-500">المنتج المصنّع</div>
                        <div className="mt-1 text-base font-semibold text-slate-900">{buildProductLabel(ownerProduct)}</div>
                        {ownerProduct?.product_type ? (
                          <Badge variant="outline" className="mt-2">{ownerProduct.product_type}</Badge>
                        ) : null}
                      </CardContent>
                    </Card>
                    <Card className="border-indigo-200 bg-indigo-50/80" data-ai-help="manufacturing_routing_detail.routing_usage">
                      <CardContent className="p-4">
                        <div className="text-sm text-slate-500">نوع الاستخدام</div>
                        <div className="mt-1 text-base font-semibold text-slate-900">
                          {ROUTING_USAGE_OPTIONS.find((option) => option.value === routing.routing_usage)?.labelAr || routing.routing_usage}
                        </div>
                        <Badge variant={routing.is_active ? "default" : "outline"} className="mt-2" data-ai-help="manufacturing_routing_detail.version_status">
                          {routing.is_active ? "نشط" : "غير نشط"}
                        </Badge>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200 bg-slate-50/80" data-ai-help="manufacturing_routing_detail.version_selector">
                      <CardContent className="p-4">
                        <div className="mb-2 text-sm text-slate-500">الإصدار المحدد</div>
                        {routing.versions.length === 0 ? (
                          <div className="text-sm text-slate-400">لا توجد نسخ بعد</div>
                        ) : (
                          <Select value={selectedVersionId || ""} onValueChange={setSelectedVersionId}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="اختر إصدار..." />
                            </SelectTrigger>
                            <SelectContent>
                              {routing.versions.map((version) => (
                                <SelectItem key={version.id} value={version.id}>
                                  v{version.version_no} — {getRoutingVersionStatusLabel(version.status)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {selectedVersion && (
                          <Badge variant={getRoutingVersionStatusVariant(selectedVersion.status)} className="mt-2">
                            {getRoutingVersionStatusLabel(selectedVersion.status)}
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Operations editor - main content */}
                  <div className="space-y-6">
                    {!selectedVersion ? (
                      <Card>
                        <CardContent className="py-12 text-center">
                          <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                            <GitBranch className="h-10 w-10 text-slate-300" />
                            <div className="text-lg font-medium text-slate-900">مفيش إصدار مختار</div>
                            <p className="text-sm leading-6 text-slate-500">
                              أنشئ إصدار جديد أو اختر واحد من اللى فوق.
                            </p>
                            <Button onClick={() => setCreateVersionOpen(true)} disabled={!canWrite} className="gap-2">
                              <Plus className="h-4 w-4" />
                              إنشاء الإصدار الأول
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <>
                            <div className="space-y-6" data-ai-help="manufacturing_routing_detail.operations_table">
                              <Card>
                                <CardHeader>
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                      <CardTitle className="text-base">خطوات التصنيع</CardTitle>
                                      <CardDescription>
                                        سلسلة الخطوات المرتبة التي تتحول فيها المواد الخام إلى منتج نهائي — كل خطوة لها مركز عمل وأوقات محددة.
                                      </CardDescription>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <Button
                                        variant="outline"
                                        onClick={handleAddOperation}
                                        disabled={!canUpdate || !operationsEditable || savingOperations}
                                        className="gap-2"
                                        data-ai-help="manufacturing_routing_detail.add_operation_button"
                                      >
                                        <Plus className="h-4 w-4" />
                                        إضافة خطوة
                                      </Button>
                                      <Button
                                        onClick={handleSaveOperations}
                                        disabled={!canUpdate || !operationsEditable || savingOperations}
                                        className="gap-2"
                                        data-ai-help="manufacturing_routing_detail.save_operations_button"
                                      >
                                        <Save className="h-4 w-4" />
                                        {savingOperations ? "جاري الحفظ..." : "حفظ العمليات"}
                                      </Button>
                                    </div>
                                  </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                  {/* Help banner */}
                                  <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-900/40 dark:bg-blue-950/30">
                                    <div className="flex gap-3">
                                      <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
                                      <div className="space-y-2">
                                        <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                                          ما هى خطوات التصنيع؟
                                        </p>
                                        <p className="text-sm leading-relaxed text-blue-800 dark:text-blue-300">
                                          هو <strong>خطة العمل التفصيلية</strong> لتصنيع المنتج — يُحدد كل خطوة إنتاجية بالترتيب، ومن أين تتم، وكم تستغرق.
                                        </p>
                                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                                          <div className="flex items-start gap-2 rounded-lg bg-white/60 px-3 py-2 dark:bg-white/5">
                                            <Factory className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                                            <div>
                                              <p className="text-xs font-medium text-blue-900 dark:text-blue-200">مركز العمل</p>
                                              <p className="text-xs text-blue-700 dark:text-blue-400">القسم أو الماكينة المسؤولة عن الخطوة</p>
                                            </div>
                                          </div>
                                          <div className="flex items-start gap-2 rounded-lg bg-white/60 px-3 py-2 dark:bg-white/5">
                                            <Timer className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                                            <div>
                                              <p className="text-xs font-medium text-blue-900 dark:text-blue-200">الأوقات</p>
                                              <p className="text-xs text-blue-700 dark:text-blue-400">إعداد + تشغيل + انتظار + نقل (بالدقائق)</p>
                                            </div>
                                          </div>
                                          <div className="flex items-start gap-2 rounded-lg bg-white/60 px-3 py-2 dark:bg-white/5">
                                            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                                            <div>
                                              <p className="text-xs font-medium text-blue-900 dark:text-blue-200">نقطة الجودة</p>
                                              <p className="text-xs text-blue-700 dark:text-blue-400">فحص إلزامي قبل الانتقال للخطوة التالية</p>
                                            </div>
                                          </div>
                                        </div>
                                        <p className="text-xs text-blue-600 dark:text-blue-400">
                                          <strong>مثال:</strong> تقطيع (10) &rarr; خياطة (20) &rarr; كي (30) &rarr; تعبئة (40)
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                  {loadingVersion ? (
                                    <div className="flex items-center justify-center gap-2 rounded-2xl border bg-slate-50 p-10 text-slate-500">
                                      <Loader2 className="h-5 w-5 animate-spin" />
                                      جاري تحميل العمليات...
                                    </div>
                                  ) : operationsDraft.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed p-10 text-center">
                                      <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                                        <Settings2 className="h-8 w-8 text-slate-300" />
                                        <div className="text-lg font-medium text-slate-900">لا توجد عمليات بعد</div>
                                        <p className="text-sm leading-6 text-slate-500">
                                          أضف أول خطوة للإصدار. التفعيل محتاج خطوة واحدة على الأقل.
                                        </p>
                                      </div>
                                    </div>
                                  ) : (
                                    operationsDraft.map((operation, index) => {
                                      const workCenter = workCentersById[operation.work_center_id]

                                      return (
                                        <Card key={`operation-${index}`} className="border-slate-200" data-ai-help="manufacturing_routing_detail.operations_table">
                                          <CardHeader className="border-b pb-4">
                                            <div className="flex items-center justify-between gap-3">
                                              <div className="space-y-1">
                                                <CardTitle className="text-base">خطوة #{operation.operation_no || index + 1}</CardTitle>
                                                <CardDescription>
                                                  {workCenter ? buildWorkCenterLabel(workCenter) : "أدخل معرف مركز العمل وسيتم التحقق منه تلقائياً."}
                                                </CardDescription>
                                              </div>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setOperationsDraft((current) => current.filter((_, opIndex) => opIndex !== index))}
                                                disabled={!canUpdate || !operationsEditable || savingOperations}
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            </div>
                                          </CardHeader>
                                          <CardContent className="grid gap-4 pt-6 md:grid-cols-2 xl:grid-cols-4">
                                            <div className="space-y-2" data-ai-help="manufacturing_routing_detail.operation_sequence">
                                              <div className="flex items-center gap-1.5">
                                                <Label>رقم الخطوة</Label>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Info className="h-3.5 w-3.5 cursor-help text-slate-400" />
                                                  </TooltipTrigger>
                                                  <TooltipContent side="top" className="max-w-xs">
                                                    ترتيب الخطوة فى التصنيع. الأفضل مضاعفات 10 (10، 20، 30...) عشان تقدر تدخّل خطوات جديدة بينها بعدين.
                                                  </TooltipContent>
                                                </Tooltip>
                                              </div>
                                              <Input
                                                type="number"
                                                min="1"
                                                step="1"
                                                value={operation.operation_no}
                                                onChange={(event) =>
                                                  setOperationsDraft((current) =>
                                                    current.map((item, opIndex) =>
                                                      opIndex === index ? { ...item, operation_no: Number(event.target.value || 0) } : item
                                                    )
                                                  )
                                                }
                                                disabled={!canUpdate || !operationsEditable || savingOperations}
                                              />
                                            </div>
                                            <div className="space-y-2" data-ai-help="manufacturing_routing_detail.operation_code">
                                              <div className="flex items-center gap-1.5">
                                                <Label>كود الخطوة</Label>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Info className="h-3.5 w-3.5 cursor-help text-slate-400" />
                                                  </TooltipTrigger>
                                                  <TooltipContent side="top" className="max-w-xs">
                                                    كود مختصر يميّز الخطوة. مثلاً CUT-01 للتقطيع، SEW-02 للخياطة. بيظهر فى التقارير وأوامر العمل.
                                                  </TooltipContent>
                                                </Tooltip>
                                              </div>
                                              <Input
                                                value={operation.operation_code}
                                                onChange={(event) =>
                                                  setOperationsDraft((current) =>
                                                    current.map((item, opIndex) =>
                                                      opIndex === index ? { ...item, operation_code: event.target.value } : item
                                                    )
                                                  )
                                                }
                                                disabled={!canUpdate || !operationsEditable || savingOperations}
                                              />
                                            </div>
                                            <div className="space-y-2 xl:col-span-2" data-ai-help="manufacturing_routing_detail.operation_name">
                                              <div className="flex items-center gap-1.5">
                                                <Label>اسم الخطوة</Label>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Info className="h-3.5 w-3.5 cursor-help text-slate-400" />
                                                  </TooltipTrigger>
                                                  <TooltipContent side="top" className="max-w-xs">
                                                    اسم الخطوة الكامل اللى يظهر للعمال وفى أوامر العمل. مثلاً: تقطيع القماش، خياطة الأطراف، كى ومرور نهائى.
                                                  </TooltipContent>
                                                </Tooltip>
                                              </div>
                                              <Input
                                                value={operation.operation_name}
                                                onChange={(event) =>
                                                  setOperationsDraft((current) =>
                                                    current.map((item, opIndex) =>
                                                      opIndex === index ? { ...item, operation_name: event.target.value } : item
                                                    )
                                                  )
                                                }
                                                disabled={!canUpdate || !operationsEditable || savingOperations}
                                              />
                                            </div>
                                            <div className="space-y-2 xl:col-span-2" data-ai-help="manufacturing_routing_detail.work_center">
                                              <div className="flex items-center gap-1.5">
                                                <Label>مركز العمل</Label>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Info className="h-3.5 w-3.5 cursor-help text-slate-400" />
                                                  </TooltipTrigger>
                                                  <TooltipContent side="top" className="max-w-xs">
                                                    محطة العمل المسؤولة عن تنفيذ الخطوة دى. اختار من القائمة.
                                                  </TooltipContent>
                                                </Tooltip>
                                              </div>
                                              {allWorkCenters.length === 0 ? (
                                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                                                  لا توجد مراكز عمل معرّفة بعد.{" "}
                                                  <a href="/manufacturing/work-centers" target="_blank" className="font-semibold underline underline-offset-2">
                                                    أضف مراكز العمل أولاً
                                                  </a>
                                                </div>
                                              ) : (
                                                <Select
                                                  value={operation.work_center_id || ""}
                                                  onValueChange={(val) =>
                                                    setOperationsDraft((current) =>
                                                      current.map((item, opIndex) =>
                                                        opIndex === index ? { ...item, work_center_id: val } : item
                                                      )
                                                    )
                                                  }
                                                  disabled={!canUpdate || !operationsEditable || savingOperations}
                                                >
                                                  <SelectTrigger>
                                                    <SelectValue placeholder="اختر مركز العمل..." />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    {allWorkCenters.map((wc) => (
                                                      <SelectItem key={wc.id} value={wc.id}>
                                                        {buildWorkCenterLabel(wc)}
                                                        {wc.work_center_type ? ` · ${wc.work_center_type}` : ""}
                                                      </SelectItem>
                                                    ))}
                                                  </SelectContent>
                                                </Select>
                                              )}
                                              {workCenter && (
                                                <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800">
                                                  <div className="font-medium text-slate-900 dark:text-slate-100">{buildWorkCenterLabel(workCenter)}</div>
                                                  <div className="mt-1">
                                                    {workCenter.work_center_type || "غير محدد"} · {workCenter.status || "غير محدد"}
                                                    {workCenter.capacity_uom ? ` · ${formatQuantity(workCenter.nominal_capacity_per_hour)} ${workCenter.capacity_uom}/hr` : ""}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                            <div className="flex items-center justify-between rounded-xl border px-4 py-3 xl:col-span-2" data-ai-help="manufacturing_routing_detail.quality_checkpoint">
                                              <div className="space-y-1">
                                                <div className="font-medium text-slate-900">نقطة مراقبة الجودة</div>
                                                <div className="text-sm text-slate-500">يفعّل فحص الجودة عند الخطوة دى.</div>
                                              </div>
                                              <Switch
                                                checked={operation.quality_checkpoint_required}
                                                onCheckedChange={(checked) =>
                                                  setOperationsDraft((current) =>
                                                    current.map((item, opIndex) =>
                                                      opIndex === index ? { ...item, quality_checkpoint_required: Boolean(checked) } : item
                                                    )
                                                  )
                                                }
                                                disabled={!canUpdate || !operationsEditable || savingOperations}
                                              />
                                            </div>
                                            <div className="space-y-2" data-ai-help="manufacturing_routing_detail.setup_time">
                                              <div className="flex items-center gap-1.5">
                                                <Label>وقت الإعداد (د)</Label>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Info className="h-3.5 w-3.5 cursor-help text-slate-400" />
                                                  </TooltipTrigger>
                                                  <TooltipContent side="top" className="max-w-xs">
                                                    الوقت اللازم لتجهيز الماكينة أو مكان العمل قبل بدء الإنتاج الفعلي (ضبط الآلة، تحميل المواد...). يُحسب مرة واحدة لكل دفعة بغض النظر عن الكمية.
                                                  </TooltipContent>
                                                </Tooltip>
                                              </div>
                                              <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={operation.setup_time_minutes}
                                                onChange={(event) =>
                                                  setOperationsDraft((current) =>
                                                    current.map((item, opIndex) =>
                                                      opIndex === index ? { ...item, setup_time_minutes: Number(event.target.value || 0) } : item
                                                    )
                                                  )
                                                }
                                                disabled={!canUpdate || !operationsEditable || savingOperations}
                                              />
                                            </div>
                                            <div className="space-y-2" data-ai-help="manufacturing_routing_detail.run_time">
                                              <div className="flex items-center gap-1.5">
                                                <Label>وقت التشغيل / وحدة (د)</Label>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Info className="h-3.5 w-3.5 cursor-help text-slate-400" />
                                                  </TooltipTrigger>
                                                  <TooltipContent side="top" className="max-w-xs">
                                                    الوقت اللى محتاجاه لإنتاج وحدة واحدة فى الخطوة دى. هيتضرب فى الكمية الإجمالية للحصول على إجمالى وقت الخطوة.
                                                  </TooltipContent>
                                                </Tooltip>
                                              </div>
                                              <Input
                                                type="number"
                                                min="0"
                                                step="0.0001"
                                                value={operation.run_time_minutes_per_unit}
                                                onChange={(event) =>
                                                  setOperationsDraft((current) =>
                                                    current.map((item, opIndex) =>
                                                      opIndex === index ? { ...item, run_time_minutes_per_unit: Number(event.target.value || 0) } : item
                                                    )
                                                  )
                                                }
                                                disabled={!canUpdate || !operationsEditable || savingOperations}
                                              />
                                            </div>
                                            <div className="space-y-2">
                                              <div className="flex items-center gap-1.5">
                                                <Label>وقت الانتظار (د)</Label>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Info className="h-3.5 w-3.5 cursor-help text-slate-400" />
                                                  </TooltipTrigger>
                                                  <TooltipContent side="top" className="max-w-xs">
                                                    المدة التي تنتظرها المادة في قائمة الانتظار قبل أن يبدأ مركز العمل بمعالجتها. يرتفع في خطوط الإنتاج المزدحمة.
                                                  </TooltipContent>
                                                </Tooltip>
                                              </div>
                                              <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={operation.queue_time_minutes}
                                                onChange={(event) =>
                                                  setOperationsDraft((current) =>
                                                    current.map((item, opIndex) =>
                                                      opIndex === index ? { ...item, queue_time_minutes: Number(event.target.value || 0) } : item
                                                    )
                                                  )
                                                }
                                                disabled={!canUpdate || !operationsEditable || savingOperations}
                                              />
                                            </div>
                                            <div className="space-y-2">
                                              <div className="flex items-center gap-1.5">
                                                <Label>وقت النقل (د)</Label>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Info className="h-3.5 w-3.5 cursor-help text-slate-400" />
                                                  </TooltipTrigger>
                                                  <TooltipContent side="top" className="max-w-xs">
                                                    الوقت اللى يستغرقه نقل المواد من محطة العمل دى للى بعدها بعد ما الخطوة تخلص.
                                                  </TooltipContent>
                                                </Tooltip>
                                              </div>
                                              <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={operation.move_time_minutes}
                                                onChange={(event) =>
                                                  setOperationsDraft((current) =>
                                                    current.map((item, opIndex) =>
                                                      opIndex === index ? { ...item, move_time_minutes: Number(event.target.value || 0) } : item
                                                    )
                                                  )
                                                }
                                                disabled={!canUpdate || !operationsEditable || savingOperations}
                                              />
                                            </div>
                                            <div className="space-y-2">
                                              <div className="flex items-center gap-1.5">
                                                <Label>وقت العمالة (د)</Label>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Info className="h-3.5 w-3.5 cursor-help text-slate-400" />
                                                  </TooltipTrigger>
                                                  <TooltipContent side="top" className="max-w-xs">
                                                    الوقت اللى يقضيه العامل فى تنفيذ الخطوة. بيُستخدم لحساب تكلفة الأجور.
                                                  </TooltipContent>
                                                </Tooltip>
                                              </div>
                                              <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={operation.labor_time_minutes}
                                                onChange={(event) =>
                                                  setOperationsDraft((current) =>
                                                    current.map((item, opIndex) =>
                                                      opIndex === index ? { ...item, labor_time_minutes: Number(event.target.value || 0) } : item
                                                    )
                                                  )
                                                }
                                                disabled={!canUpdate || !operationsEditable || savingOperations}
                                              />
                                            </div>
                                            <div className="space-y-2">
                                              <div className="flex items-center gap-1.5">
                                                <Label>وقت الآلة (د)</Label>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Info className="h-3.5 w-3.5 cursor-help text-slate-400" />
                                                  </TooltipTrigger>
                                                  <TooltipContent side="top" className="max-w-xs">
                                                    الوقت الفعلي الذي تعمل فيه الماكينة بشكل مستقل. قد يختلف عن وقت العمالة (مثلاً: الماكينة تعمل 30 دقيقة والعامل يراقبها 5 دقائق فقط).
                                                  </TooltipContent>
                                                </Tooltip>
                                              </div>
                                              <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={operation.machine_time_minutes}
                                                onChange={(event) =>
                                                  setOperationsDraft((current) =>
                                                    current.map((item, opIndex) =>
                                                      opIndex === index ? { ...item, machine_time_minutes: Number(event.target.value || 0) } : item
                                                    )
                                                  )
                                                }
                                                disabled={!canUpdate || !operationsEditable || savingOperations}
                                              />
                                            </div>
                                            <div className="space-y-2 xl:col-span-4" data-ai-help="manufacturing_routing_detail.instructions">
                                              <div className="flex items-center gap-1.5">
                                                <Label>تعليمات التنفيذ</Label>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Info className="h-3.5 w-3.5 cursor-help text-slate-400" />
                                                  </TooltipTrigger>
                                                  <TooltipContent side="top" className="max-w-xs">
                                                    ملاحظات وإرشادات للخطوة — هتُطبع فى أوامر العمل وتظهر للعمال على الخط. مثلاً: استخدم لاصق درجة B فقط.
                                                  </TooltipContent>
                                                </Tooltip>
                                              </div>
                                              <Textarea
                                                value={operation.instructions || ""}
                                                onChange={(event) =>
                                                  setOperationsDraft((current) =>
                                                    current.map((item, opIndex) =>
                                                      opIndex === index ? { ...item, instructions: event.target.value } : item
                                                    )
                                                  )
                                                }
                                                disabled={!canUpdate || !operationsEditable || savingOperations}
                                              />
                                            </div>
                                          </CardContent>
                                        </Card>
                                      )
                                    })
                                  )}
                                </CardContent>
                              </Card>

                              {activeSnapshot?.operations.length ? (
                                <Card data-ai-help="manufacturing_routing_detail.operations_table">
                                  <CardHeader>
                                    <CardTitle className="text-base">الإصدار المحفوظ دلوقتى</CardTitle>
                                    <CardDescription>عرض سريع للإصدار اللى محفوظ فعلاً بعد آخر تحديث.</CardDescription>
                                  </CardHeader>
                                  <CardContent>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead data-ai-help="manufacturing_routing_detail.operation_sequence">الرقم</TableHead>
                                          <TableHead data-ai-help="manufacturing_routing_detail.operation_code">الكود</TableHead>
                                          <TableHead data-ai-help="manufacturing_routing_detail.operation_name">الاسم</TableHead>
                                          <TableHead data-ai-help="manufacturing_routing_detail.work_center">مركز العمل</TableHead>
                                          <TableHead data-ai-help="manufacturing_routing_detail.run_time">وقت التشغيل/وحدة</TableHead>
                                          <TableHead data-ai-help="manufacturing_routing_detail.quality_checkpoint">مراقبة الجودة</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {activeSnapshot.operations.map((operation) => (
                                          <TableRow key={operation.id}>
                                            <TableCell>{operation.operation_no}</TableCell>
                                            <TableCell>{operation.operation_code}</TableCell>
                                            <TableCell>{operation.operation_name}</TableCell>
                                            <TableCell className="max-w-sm whitespace-normal">
                                              {buildWorkCenterLabel(operation.work_center)}
                                            </TableCell>
                                            <TableCell>{formatQuantity(operation.run_time_minutes_per_unit, 4)}</TableCell>
                                            <TableCell>{operation.quality_checkpoint_required ? "مطلوب" : "—"}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </CardContent>
                                </Card>
                              ) : null}
                            </div>

                            {/* Advanced accordions: version management + routing settings */}
                            <Accordion type="multiple" className="space-y-3">

                              <AccordionItem value="version-management" className="rounded-2xl border border-slate-200 bg-white/90 px-0" data-ai-help="manufacturing_routing_detail.version_selector">
                                <AccordionTrigger className="px-6 py-4 text-base font-semibold hover:no-underline">
                                  <div className="flex items-center gap-2">
                                    <ShieldCheck className="h-4 w-4 text-indigo-600" />
                                    إدارة الإصدار
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-6 pb-6">
                                  <div className="space-y-4">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                          <span className="text-lg font-semibold text-slate-900">v{selectedVersion.version_no}</span>
                                          <Badge variant={getRoutingVersionStatusVariant(selectedVersion.status)} data-ai-help="manufacturing_routing_detail.version_status">
                                            {getRoutingVersionStatusLabel(selectedVersion.status)}
                                          </Badge>
                                        </div>
                                        <p className="text-sm text-slate-500">{getRoutingVersionLockMessage(selectedVersion.status)}</p>
                                      </div>
                                      <div className="text-xs text-slate-400">{formatDateTime(selectedVersion.updated_at)}</div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <Button variant="outline" onClick={() => setConfirmAction("activate")}
                                        disabled={!canUpdate || !canActivateRoutingVersion(selectedVersion.status) || loadingVersion || activationRequiresSavedOperation || Boolean(runningAction)}
                                        className="gap-2" data-ai-help="manufacturing_routing_detail.activate_button">
                                        <PlayCircle className="h-4 w-4" />تفعيل
                                      </Button>
                                      <Button variant="outline" onClick={() => setConfirmAction("deactivate")}
                                        disabled={!canUpdate || !canDeactivateRoutingVersion(selectedVersion.status) || Boolean(runningAction)}
                                        className="gap-2" data-ai-help="manufacturing_routing_detail.deactivate_button">
                                        <PauseCircle className="h-4 w-4" />إيقاف
                                      </Button>
                                      <Button variant="outline" onClick={() => setConfirmAction("archive")}
                                        disabled={!canUpdate || !canArchiveRoutingVersion(selectedVersion.status) || Boolean(runningAction)}
                                        className="gap-2" data-ai-help="manufacturing_routing_detail.archive_button">
                                        <Archive className="h-4 w-4" />أرشفة
                                      </Button>
                                      <Button variant="destructive" onClick={() => setConfirmAction("delete-version")}
                                        disabled={!canDelete || !canDeleteRoutingVersion(selectedVersion.status) || Boolean(runningAction)}
                                        className="gap-2">
                                        <Trash2 className="h-4 w-4" />حذف الإصدار
                                      </Button>
                                    </div>
                                    <Separator />
                                    <div className="grid gap-4 md:grid-cols-2">
                                      <div className="space-y-2">
                                        <Label>تاريخ السريان من</Label>
                                        <Input type="datetime-local" value={versionForm.effective_from}
                                          onChange={(event) => setVersionForm((current) => ({ ...current, effective_from: event.target.value }))}
                                          disabled={!canUpdate || !versionEditable || savingVersionHeader} />
                                      </div>
                                      <div className="space-y-2">
                                        <Label>تاريخ السريان إلى</Label>
                                        <Input type="datetime-local" value={versionForm.effective_to}
                                          onChange={(event) => setVersionForm((current) => ({ ...current, effective_to: event.target.value }))}
                                          disabled={!canUpdate || !versionEditable || savingVersionHeader} />
                                      </div>
                                      <div className="space-y-2 md:col-span-2" data-ai-help="manufacturing_routing_detail.instructions">
                                        <Label>ملخص التغييرات</Label>
                                        <Textarea value={versionForm.change_summary}
                                          onChange={(event) => setVersionForm((current) => ({ ...current, change_summary: event.target.value }))}
                                          disabled={!canUpdate || !versionEditable || savingVersionHeader} />
                                      </div>
                                      <div className="space-y-2 md:col-span-2" data-ai-help="manufacturing_routing_detail.instructions">
                                        <Label>ملاحظات</Label>
                                        <Textarea value={versionForm.notes}
                                          onChange={(event) => setVersionForm((current) => ({ ...current, notes: event.target.value }))}
                                          disabled={!canUpdate || !versionEditable || savingVersionHeader} />
                                      </div>
                                    </div>
                                    <Button onClick={handleSaveVersionHeader}
                                      disabled={!canUpdate || !versionEditable || savingVersionHeader}
                                      className="gap-2" data-ai-help="manufacturing_routing_detail.version_status">
                                      <Save className="h-4 w-4" />
                                      {savingVersionHeader ? "جارٍ الحفظ..." : "حفظ الإصدار"}
                                    </Button>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>

                              {/* Routing settings accordion */}
                              <AccordionItem value="routing-settings" className="rounded-2xl border border-slate-200 bg-white/90 px-0">
                                <AccordionTrigger className="px-6 py-4 text-base font-semibold hover:no-underline">
                                  <div className="flex items-center gap-2">
                                    <Settings2 className="h-4 w-4 text-cyan-600" />
                                    إعدادات المسار
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-6 pb-6">
                                  <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2" data-ai-help="manufacturing_routing_detail.routing_code">
                                      <Label>كود المسار</Label>
                                      <Input value={headerForm.routing_code}
                                        onChange={(event) => setHeaderForm((current) => ({ ...current, routing_code: event.target.value }))}
                                        disabled={!canUpdate || savingHeader} />
                                    </div>
                                    <div className="space-y-2" data-ai-help="manufacturing_routing_detail.routing_name">
                                      <Label>اسم المسار</Label>
                                      <Input value={headerForm.routing_name}
                                        onChange={(event) => setHeaderForm((current) => ({ ...current, routing_name: event.target.value }))}
                                        disabled={!canUpdate || savingHeader} />
                                    </div>
                                    <div className="space-y-2" data-ai-help="manufacturing_routing_detail.finished_product">
                                      <Label>المنتج المالك</Label>
                                      <Input value={buildProductLabel(ownerProduct)} disabled />
                                    </div>
                                    <div className="space-y-2" data-ai-help="manufacturing_routing_detail.routing_usage">
                                      <Label>نوع الاستخدام</Label>
                                      <Input value={ROUTING_USAGE_OPTIONS.find((o) => o.value === routing.routing_usage)?.labelAr || routing.routing_usage} disabled />
                                    </div>
                                    <div className="flex items-center justify-between rounded-xl border px-4 py-3 md:col-span-2" data-ai-help="manufacturing_routing_detail.version_status">
                                      <div className="space-y-1">
                                        <div className="font-medium text-slate-900">حالة التفعيل</div>
                                        <div className="text-sm text-slate-500">تخص المسار نفسه مش الإصدار.</div>
                                      </div>
                                      <Switch checked={headerForm.is_active}
                                        onCheckedChange={(checked) => setHeaderForm((current) => ({ ...current, is_active: Boolean(checked) }))}
                                        disabled={!canUpdate || savingHeader} />
                                    </div>
                                    <div className="space-y-2 md:col-span-2">
                                      <Label>الوصف</Label>
                                      <Textarea value={headerForm.description}
                                        onChange={(event) => setHeaderForm((current) => ({ ...current, description: event.target.value }))}
                                        disabled={!canUpdate || savingHeader} />
                                    </div>
                                    <div className="md:col-span-2">
                                      <Button onClick={handleSaveHeader} disabled={!canUpdate || savingHeader} className="gap-2" data-ai-help="manufacturing_routing_detail.routing_name">
                                        <Save className="h-4 w-4" />
                                        {savingHeader ? "جاري الحفظ..." : "حفظ البيانات الأساسية"}
                                      </Button>
                                    </div>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          </>
                        )}
                    </div>
                </>
              )}
        </div>

        <Dialog open={createVersionOpen} onOpenChange={setCreateVersionOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>إنشاء إصدار جديد</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2" data-ai-help="manufacturing_routing_detail.create_version_button">
                <Label>نسخ من إصدار موجود</Label>
                <Select
                  value={createVersionForm.clone_from_version_id || "none"}
                  onValueChange={(value) =>
                    setCreateVersionForm((current) => ({
                      ...current,
                      clone_from_version_id: value === "none" ? null : value,
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="ابدأ من إصدار فاضى" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون استنساخ</SelectItem>
                    {(routing?.versions || []).map((version) => (
                      <SelectItem key={version.id} value={version.id}>
                        v{version.version_no} · {getRoutingVersionStatusLabel(version.status)}
                        {version.updated_at ? ` · ${formatDateTime(version.updated_at)}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>تاريخ السريان من</Label>
                <Input
                  type="datetime-local"
                  value={isoToLocalDateTimeInput(createVersionForm.effective_from)}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, effective_from: localDateTimeInputToIso(event.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>تاريخ السريان إلى</Label>
                <Input
                  type="datetime-local"
                  value={isoToLocalDateTimeInput(createVersionForm.effective_to)}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, effective_to: localDateTimeInputToIso(event.target.value) }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2" data-ai-help="manufacturing_routing_detail.instructions">
                <Label>ملخص التغييرات</Label>
                <Textarea
                  value={typeof createVersionForm.change_summary === "string" ? createVersionForm.change_summary : ""}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, change_summary: event.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2" data-ai-help="manufacturing_routing_detail.instructions">
                <Label>ملاحظات</Label>
                <Textarea
                  value={typeof createVersionForm.notes === "string" ? createVersionForm.notes : ""}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, notes: event.target.value }))}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setCreateVersionOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleCreateVersion} disabled={runningAction === "create-version"} data-ai-help="manufacturing_routing_detail.create_version_button">
                {runningAction === "create-version" ? "جارٍ الإنشاء..." : "إنشاء الإصدار"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={Boolean(confirmDialogMeta)}
          onOpenChange={(open) => {
            if (!open) setConfirmAction(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmDialogMeta?.title}</AlertDialogTitle>
              <AlertDialogDescription>{confirmDialogMeta?.description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={Boolean(runningAction)}>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  void handleConfirmAction()
                }}
                disabled={Boolean(runningAction) || (confirmAction === "activate" && activationRequiresSavedOperation)}
                className={confirmDialogMeta?.actionClassName}
                data-ai-help={confirmAction === "activate" ? "manufacturing_routing_detail.activate_button" : confirmAction === "deactivate" ? "manufacturing_routing_detail.deactivate_button" : confirmAction === "archive" ? "manufacturing_routing_detail.archive_button" : "manufacturing_routing_detail.version_status"}
              >
                {runningAction ? "جاري التنفيذ..." : confirmDialogMeta?.actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </main>
      </div>
    </PageGuard>
  )
}
