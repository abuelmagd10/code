"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Archive,
  Factory,
  GitBranch,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Save,
  Settings2,
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
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { useAccess } from "@/lib/access-context"
import {
  ROUTING_USAGE_OPTIONS,
  type RoutingDetail,
  type RoutingOperationDraft,
  type RoutingVersionCreatePayload,
  type RoutingVersionSnapshot,
  type RoutingVersionStatus,
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
      return "هذه النسخة مفعّلة وتُستخدم حالياً في التصنيع. لا يمكن تعديلها إلا بعد إيقافها أو أرشفتها."
    case "inactive":
      return "هذه النسخة موقوفة. يمكنك إعادة تفعيلها أو أرشفتها نهائياً."
    case "archived":
      return "هذه النسخة مؤرشفة ولا تقبل أي تعديل."
    default:
      return "هذه النسخة قيد الإعداد ويمكن تعديل بياناتها ومراحلها."
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

  const activeSnapshot = versionSnapshot?.version.id === selectedVersionId ? versionSnapshot : null
  const selectedVersion =
    activeSnapshot?.version || routing?.versions.find((version) => version.id === selectedVersionId) || null
  const versionEditable = selectedVersion ? isRoutingVersionHeaderEditable(selectedVersion.status) : false
  const operationsEditable = selectedVersion ? isRoutingVersionStructureEditable(selectedVersion.status) : false
  const ownerProduct = activeSnapshot?.product || routing?.product || null
  const canDeleteRoutingRecord = Boolean(routing) && Boolean(routing?.versions.every((version) => version.status === "draft"))

  const workCentersById = useMemo(() => {
    return Object.fromEntries(
      (activeSnapshot?.operations || [])
        .filter((operation) => operation.work_center)
        .map((operation) => [operation.work_center_id, operation.work_center])
    )
  }, [activeSnapshot])

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
        title: "تعذر تحميل مسار التصنيع",
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
        title: "تعذر تحميل بيانات النسخة",
        description: error?.message || "حدث خطأ أثناء تحميل النسخة المحددة",
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
        description: "كود مسار التشغيل واسمه مطلوبان قبل الحفظ.",
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
        title: "تم حفظ بيانات مسار التصنيع",
        description: "تم تحديث بيانات مسار التشغيل بنجاح.",
      })

      await refreshWorkspace(selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر حفظ بيانات مسار التصنيع",
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
        title: "تم حذف مسار التشغيل",
        description: "تم حذف مسار التشغيل وجميع نسخه بنجاح.",
      })
      router.push("/manufacturing/routings")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر حذف مسار التشغيل",
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
        title: "تم إنشاء نسخة جديدة",
        description: result.version_no ? `النسخة v${result.version_no} جاهزة الآن للتحرير.` : "تم إنشاء النسخة بنجاح.",
      })
      await refreshWorkspace(result.routing_version_id || selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر إنشاء النسخة",
        description: error?.message || "حدث خطأ أثناء إنشاء النسخة",
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
        title: "تم حفظ بيانات النسخة",
        description: "تم تحديث بيانات هذه النسخة بنجاح.",
      })

      await refreshWorkspace(selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر حفظ النسخة",
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
        title: "تم حذف النسخة",
        description: `تم حذف v${selectedVersion.version_no} بنجاح.`,
      })

      const nextVersionId = routing?.versions.find((version) => version.id !== selectedVersionId)?.id || null
      await refreshWorkspace(nextVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر حذف النسخة",
        description: error?.message || "الحذف مرفوض بسبب حالة النسخة الحالية.",
      })
      await refreshWorkspace(selectedVersionId)
    } finally {
      setRunningAction(null)
    }
  }

  const handleSaveOperations = async () => {
    if (!selectedVersionId) return

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
          "تم تفعيل النسخة",
          `النسخة v${selectedVersion.version_no} أصبحت الآن نشطة.`
        )
        break
      case "deactivate":
        if (!selectedVersion) return
        await executeVersionAction(
          "deactivate",
          () => deactivateRoutingVersion(selectedVersion.id),
          "تم إيقاف النسخة",
          `النسخة v${selectedVersion.version_no} أصبحت الآن غير نشطة.`
        )
        break
      case "archive":
        if (!selectedVersion) return
        await executeVersionAction(
          "archive",
          () => archiveRoutingVersion(selectedVersion.id),
          "تمت أرشفة النسخة",
          `النسخة v${selectedVersion.version_no} أصبحت مؤرشفة وللقراءة فقط.`
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
          title: "حذف مسار التصنيع",
          description: "سيتم حذف مسار التصنيع بالكامل إذا كانت الشروط اللازمة للحذف متحققة.",
          actionLabel: "حذف المسار",
          actionClassName: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        }
      case "delete-version":
        return {
          title: "حذف هذه النسخة",
          description: `سيتم حذف النسخة ${selectedVersion?.version_no} نهائياً. الحذف متاح فقط قبل تفعيل النسخة.`,
          actionLabel: "حذف النسخة",
          actionClassName: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        }
      case "activate":
        return {
          title: "تفعيل هذه النسخة للتصنيع",
          description: `سيتم تفعيل النسخة ${selectedVersion?.version_no} لتصبح النسخة التشغيلية الحالية. إذا كانت هناك نسخة أخرى مفعّلة، سيتم إيقافها تلقائياً.`,
          actionLabel: "تفعيل النسخة",
          actionClassName: "",
        }
      case "deactivate":
        return {
          title: "إيقاف هذه النسخة",
          description: `سيتم إيقاف النسخة ${selectedVersion?.version_no} دون حذف أي بيانات. يمكن إعادة تفعيلها لاحقاً.`,
          actionLabel: "إيقاف النسخة",
          actionClassName: "",
        }
      case "archive":
        return {
          title: "أرشفة هذه النسخة نهائياً",
          description: `سيتم قفل النسخة ${selectedVersion?.version_no} نهائياً ولن تتمكن من تعديلها بعد ذلك.`,
          actionLabel: "أرشفة النسخة",
          actionClassName: "bg-slate-900 text-white hover:bg-slate-800",
        }
      default:
        return null
    }
  }, [confirmAction, selectedVersion])

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
          title={routing ? `${routing.routing_code} — ${routing.routing_name}` : "تفاصيل مسار التصنيع"}
          description="إدارة بيانات مسار التصنيع، نسخه، ومراحل التصنيع المرتبطة به."
          variant="detail"
          backHref="/manufacturing/routings"
          backLabel="العودة للقائمة"
          extra={
            <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
              <Factory className="h-3.5 w-3.5" />
              بيئة مسار التصنيع
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
                إنشاء نسخة
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
                  جاري تحميل مسار التصنيع...
                </div>
              ) : !routing ? (
                <div className="rounded-2xl border border-dashed bg-white p-12 text-center">
                  <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                    <AlertTriangle className="h-10 w-10 text-slate-300" />
                    <div className="text-lg font-medium text-slate-900">تعذر العثور على مسار التصنيع</div>
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
                    <Card className="border-slate-200 bg-slate-50/80">
                      <CardContent className="p-4">
                        <div className="text-sm text-slate-500">عدد النسخ</div>
                        <div className="mt-1 text-base font-semibold text-slate-900">{routing.versions.length} نسخة</div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[280px,minmax(0,1fr)]">
                    <Card className="h-fit" data-ai-help="manufacturing_routing_detail.version_selector">
                      <CardHeader>
                        <CardTitle className="text-base">النسخ</CardTitle>
                        <CardDescription>اختر النسخة التي تريد مراجعتها أو تعديلها. كل نسخة تحتوي على مراحل تصنيع مستقلة.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {routing.versions.length === 0 ? (
                          <div className="rounded-xl border border-dashed p-4 text-sm text-slate-500">
                            لا توجد نسخ بعد. أنشئ أول نسخة لبدء تعريف العمليات.
                          </div>
                        ) : (
                          routing.versions.map((version) => (
                            <button
                              key={version.id}
                              type="button"
                              onClick={() => setSelectedVersionId(version.id)}
                              data-ai-help="manufacturing_routing_detail.version_selector"
                              className={`w-full rounded-xl border p-3 text-right transition ${
                                version.id === selectedVersionId
                                  ? "border-cyan-400 bg-cyan-50 shadow-sm"
                                  : "border-slate-200 bg-white hover:border-slate-300"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="font-medium text-slate-900">v{version.version_no}</div>
                                  <div className="mt-1 text-xs text-slate-500">{formatDateTime(version.updated_at)}</div>
                                </div>
                                <Badge variant={getRoutingVersionStatusVariant(version.status)} data-ai-help="manufacturing_routing_detail.version_status">
                                  {getRoutingVersionStatusLabel(version.status)}
                                </Badge>
                              </div>
                            </button>
                          ))
                        )}
                      </CardContent>
                    </Card>

                    <div className="space-y-6">
                      {!selectedVersion ? (
                        <Card>
                          <CardContent className="py-12 text-center">
                            <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                              <GitBranch className="h-10 w-10 text-slate-300" />
                              <div className="text-lg font-medium text-slate-900">لا توجد نسخة محددة</div>
                              <p className="text-sm leading-6 text-slate-500">
                                أنشئ نسخة جديدة أو اختر نسخة موجودة من العمود الجانبي.
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <>
                          <Card className="border-slate-200 bg-white">
                            <CardHeader className="border-b">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div className="space-y-2">
                                  <CardTitle className="flex items-center gap-3 text-base">
                                    <span>v{selectedVersion.version_no}</span>
                                    <Badge variant={getRoutingVersionStatusVariant(selectedVersion.status)} data-ai-help="manufacturing_routing_detail.version_status">
                                      {getRoutingVersionStatusLabel(selectedVersion.status)}
                                    </Badge>
                                  </CardTitle>
                                  <CardDescription>{getRoutingVersionLockMessage(selectedVersion.status)}</CardDescription>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    variant="outline"
                                    onClick={() => setConfirmAction("activate")}
                                    disabled={!canUpdate || !canActivateRoutingVersion(selectedVersion.status) || Boolean(runningAction)}
                                    className="gap-2"
                                    data-ai-help="manufacturing_routing_detail.activate_button"
                                  >
                                    <PlayCircle className="h-4 w-4" />
                                    تفعيل
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => setConfirmAction("deactivate")}
                                    disabled={!canUpdate || !canDeactivateRoutingVersion(selectedVersion.status) || Boolean(runningAction)}
                                    className="gap-2"
                                    data-ai-help="manufacturing_routing_detail.deactivate_button"
                                  >
                                    <PauseCircle className="h-4 w-4" />
                                    إيقاف
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => setConfirmAction("archive")}
                                    disabled={!canUpdate || !canArchiveRoutingVersion(selectedVersion.status) || Boolean(runningAction)}
                                    className="gap-2"
                                    data-ai-help="manufacturing_routing_detail.archive_button"
                                  >
                                    <Archive className="h-4 w-4" />
                                    أرشفة
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    onClick={() => setConfirmAction("delete-version")}
                                    disabled={!canDelete || !canDeleteRoutingVersion(selectedVersion.status) || Boolean(runningAction)}
                                    className="gap-2"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    حذف النسخة
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                          </Card>

                          <Tabs defaultValue="overview" className="space-y-4">
                            <TabsList className="grid w-full grid-cols-2">
                              <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
                              <TabsTrigger value="operations">محرر العمليات</TabsTrigger>
                            </TabsList>

                            <TabsContent value="overview" className="space-y-6">
                              <Card>
                                <CardHeader>
                                  <CardTitle className="text-base">بيانات مسار التصنيع</CardTitle>
                                  <CardDescription>حقول الهوية للقراءة فقط، والحقول القابلة للتعديل تُحفظ فور الضغط على حفظ.</CardDescription>
                                </CardHeader>
                                <CardContent className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-2" data-ai-help="manufacturing_routing_detail.routing_code">
                                    <Label>كود المسار</Label>
                                    <Input
                                      value={headerForm.routing_code}
                                      onChange={(event) => setHeaderForm((current) => ({ ...current, routing_code: event.target.value }))}
                                      disabled={!canUpdate || savingHeader}
                                    />
                                  </div>
                                  <div className="space-y-2" data-ai-help="manufacturing_routing_detail.routing_name">
                                    <Label>اسم المسار</Label>
                                    <Input
                                      value={headerForm.routing_name}
                                      onChange={(event) => setHeaderForm((current) => ({ ...current, routing_name: event.target.value }))}
                                      disabled={!canUpdate || savingHeader}
                                    />
                                  </div>
                                  <div className="space-y-2" data-ai-help="manufacturing_routing_detail.finished_product">
                                    <Label>المنتج المالك</Label>
                                    <Input value={buildProductLabel(ownerProduct)} disabled />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>معرف الفرع</Label>
                                    <Input value={routing.branch_id} disabled className="font-mono text-xs" />
                                  </div>
                                  <div className="space-y-2" data-ai-help="manufacturing_routing_detail.routing_usage">
                                    <Label>نوع الاستخدام</Label>
                                    <Input
                                      value={ROUTING_USAGE_OPTIONS.find((option) => option.value === routing.routing_usage)?.labelAr || routing.routing_usage}
                                      disabled
                                    />
                                  </div>
                                  <div className="flex items-center justify-between rounded-xl border px-4 py-3" data-ai-help="manufacturing_routing_detail.version_status">
                                    <div className="space-y-1">
                                      <div className="font-medium text-slate-900">حالة التفعيل</div>
                                      <div className="text-sm text-slate-500">هذه الحالة خاصة بمسار التصنيع الرئيسي وليست بالنسخة.</div>
                                    </div>
                                    <Switch
                                      checked={headerForm.is_active}
                                      onCheckedChange={(checked) => setHeaderForm((current) => ({ ...current, is_active: Boolean(checked) }))}
                                      disabled={!canUpdate || savingHeader}
                                    />
                                  </div>
                                  <div className="space-y-2 md:col-span-2">
                                    <Label>الوصف</Label>
                                    <Textarea
                                      value={headerForm.description}
                                      onChange={(event) => setHeaderForm((current) => ({ ...current, description: event.target.value }))}
                                      disabled={!canUpdate || savingHeader}
                                    />
                                  </div>
                                  <div className="md:col-span-2">
                                    <Button onClick={handleSaveHeader} disabled={!canUpdate || savingHeader} className="gap-2" data-ai-help="manufacturing_routing_detail.routing_name">
                                      <Save className="h-4 w-4" />
                                      {savingHeader ? "جاري الحفظ..." : "حفظ البيانات الأساسية"}
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>

                              <Card>
                                <CardHeader>
                                  <CardTitle className="text-base">بيانات النسخة</CardTitle>
                                  <CardDescription>هذه الحقول قابلة للتعديل فقط عندما تكون النسخة في حالة مسودة.</CardDescription>
                                </CardHeader>
                                <CardContent className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label>تاريخ السريان من</Label>
                                    <Input
                                      type="datetime-local"
                                      value={versionForm.effective_from}
                                      onChange={(event) => setVersionForm((current) => ({ ...current, effective_from: event.target.value }))}
                                      disabled={!canUpdate || !versionEditable || savingVersionHeader}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>تاريخ السريان إلى</Label>
                                    <Input
                                      type="datetime-local"
                                      value={versionForm.effective_to}
                                      onChange={(event) => setVersionForm((current) => ({ ...current, effective_to: event.target.value }))}
                                      disabled={!canUpdate || !versionEditable || savingVersionHeader}
                                    />
                                  </div>
                                  <div className="space-y-2 md:col-span-2" data-ai-help="manufacturing_routing_detail.instructions">
                                    <Label>ملخص التغييرات</Label>
                                    <Textarea
                                      value={versionForm.change_summary}
                                      onChange={(event) => setVersionForm((current) => ({ ...current, change_summary: event.target.value }))}
                                      disabled={!canUpdate || !versionEditable || savingVersionHeader}
                                    />
                                  </div>
                                  <div className="space-y-2 md:col-span-2" data-ai-help="manufacturing_routing_detail.instructions">
                                    <Label>ملاحظات</Label>
                                    <Textarea
                                      value={versionForm.notes}
                                      onChange={(event) => setVersionForm((current) => ({ ...current, notes: event.target.value }))}
                                      disabled={!canUpdate || !versionEditable || savingVersionHeader}
                                    />
                                  </div>
                                  <div className="md:col-span-2">
                                    <Button onClick={handleSaveVersionHeader} disabled={!canUpdate || !versionEditable || savingVersionHeader} className="gap-2" data-ai-help="manufacturing_routing_detail.version_status">
                                      <Save className="h-4 w-4" />
                                      {savingVersionHeader ? "جاري الحفظ..." : "حفظ بيانات النسخة"}
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            </TabsContent>

                            <TabsContent value="operations" className="space-y-6" data-ai-help="manufacturing_routing_detail.operations_table">
                              <Card>
                                <CardHeader>
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                      <CardTitle className="text-base">هيكل العمليات</CardTitle>
                                      <CardDescription>
                                        جميع التعديلات تُحفظ فقط عبر `PUT /routing-versions/[id]/operations` داخل replace transaction واحدة.
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
                                        إضافة عملية
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
                                          أضف أول عملية لهذه النسخة. التفعيل يتطلب وجود عملية واحدة على الأقل.
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
                                                <CardTitle className="text-base">عملية #{operation.operation_no || index + 1}</CardTitle>
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
                                              <Label>رقم العملية</Label>
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
                                              <Label>كود العملية</Label>
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
                                              <Label>اسم العملية</Label>
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
                                              <Label>مركز العمل</Label>
                                              <Input
                                                value={operation.work_center_id}
                                                onChange={(event) =>
                                                  setOperationsDraft((current) =>
                                                    current.map((item, opIndex) =>
                                                      opIndex === index ? { ...item, work_center_id: event.target.value } : item
                                                    )
                                                  )
                                                }
                                                disabled={!canUpdate || !operationsEditable || savingOperations}
                                                className="font-mono text-xs"
                                              />
                                              {workCenter ? (
                                                <div className="rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                                  <div className="font-medium text-slate-900">{buildWorkCenterLabel(workCenter)}</div>
                                                  <div className="mt-1">
                                                    {workCenter.work_center_type || "غير محدد"} · {workCenter.status || "غير محدد"}
                                                    {workCenter.capacity_uom ? ` · ${formatQuantity(workCenter.nominal_capacity_per_hour)} ${workCenter.capacity_uom}/hr` : ""}
                                                  </div>
                                                </div>
                                              ) : null}
                                            </div>
                                            <div className="flex items-center justify-between rounded-xl border px-4 py-3 xl:col-span-2" data-ai-help="manufacturing_routing_detail.quality_checkpoint">
                                              <div className="space-y-1">
                                                <div className="font-medium text-slate-900">نقطة مراقبة الجودة</div>
                                                <div className="text-sm text-slate-500">يُمكّن فحص الجودة عند هذه العملية.</div>
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
                                              <Label>وقت الإعداد (د)</Label>
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
                                              <Label>وقت التشغيل / وحدة (د)</Label>
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
                                              <Label>وقت الانتظار (د)</Label>
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
                                              <Label>وقت النقل (د)</Label>
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
                                              <Label>وقت العمالة (د)</Label>
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
                                              <Label>وقت الآلة (د)</Label>
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
                                              <Label>تعليمات التنفيذ</Label>
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
                                    <CardTitle className="text-base">النسخة المحفوظة حالياً</CardTitle>
                                    <CardDescription>مرجع سريع للنسخة المحفوظة فعليًا بعد آخر reload من الـ API.</CardDescription>
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
                            </TabsContent>
                          </Tabs>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
        </div>

        <Dialog open={createVersionOpen} onOpenChange={setCreateVersionOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>إنشاء Routing Version جديدة</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2" data-ai-help="manufacturing_routing_detail.create_version_button">
                <Label>استنساخ من نسخة</Label>
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
                    <SelectValue placeholder="ابدأ من نسخة فارغة" />
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
                {runningAction === "create-version" ? "جاري الإنشاء..." : "إنشاء النسخة"}
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
                disabled={Boolean(runningAction)}
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
