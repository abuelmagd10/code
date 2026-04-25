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
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
      return "هذه النسخة نشطة وتشغيلية. حقول النسخة والعمليات للقراءة فقط حتى يتم إيقافها أو أرشفتها."
    case "inactive":
      return "هذه النسخة غير نشطة لكنها مقفلة للتحرير. يمكنك تفعيلها أو أرشفتها."
    case "archived":
      return "هذه النسخة مؤرشفة بالكامل ولا تقبل أي تعديل."
    default:
      return "هذه النسخة في حالة draft ويمكن تعديل header والعمليات."
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
        title: "تعذر تحميل Routing detail",
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
        title: "تعذر تحميل نسخة Routing",
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
        description: "routing_code وrouting_name مطلوبان قبل الحفظ.",
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
        title: "تم حفظ Routing header",
        description: "تم تحديث بيانات الـ header بنجاح.",
      })

      await refreshWorkspace(selectedVersionId)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر حفظ الـ header",
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
        title: "تم حذف Routing",
        description: "تم حذف السجل بنجاح.",
      })
      router.push("/manufacturing/routings")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر حذف Routing",
        description: error?.message || "الحذف مرفوض بسبب النسخ الحالية أو الصلاحيات.",
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
        title: "تم حفظ نسخة Routing",
        description: "تم تحديث version header بنجاح.",
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
        title: "تم حفظ العمليات",
        description: "أصبحت العمليات متزامنة مع قاعدة البيانات.",
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
          `النسخة v${selectedVersion.version_no} أصبحت الآن Active.`
        )
        break
      case "deactivate":
        if (!selectedVersion) return
        await executeVersionAction(
          "deactivate",
          () => deactivateRoutingVersion(selectedVersion.id),
          "تم إيقاف النسخة",
          `النسخة v${selectedVersion.version_no} أصبحت الآن Inactive.`
        )
        break
      case "archive":
        if (!selectedVersion) return
        await executeVersionAction(
          "archive",
          () => archiveRoutingVersion(selectedVersion.id),
          "تمت أرشفة النسخة",
          `النسخة v${selectedVersion.version_no} أصبحت الآن Archived.`
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
          title: "حذف Routing الحالية",
          description: "سيتم حذف الـ routing header بالكامل إذا كانت delete semantics الحالية تسمح بذلك.",
          actionLabel: "حذف Routing",
          actionClassName: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        }
      case "delete-version":
        return {
          title: "حذف النسخة الحالية",
          description: `سيتم حذف v${selectedVersion?.version_no} نهائيًا إذا كانت ما زالت Draft.`,
          actionLabel: "حذف النسخة",
          actionClassName: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        }
      case "activate":
        return {
          title: "تفعيل النسخة الحالية",
          description: `سيتم جعل v${selectedVersion?.version_no} النسخة التشغيلية Active، وقد يتم إلغاء تفعيل أي نسخة نشطة سابقة داخل نفس الـ routing.`,
          actionLabel: "تفعيل النسخة",
          actionClassName: "",
        }
      case "deactivate":
        return {
          title: "إيقاف النسخة الحالية",
          description: `سيتم تحويل v${selectedVersion?.version_no} إلى Inactive دون تعديل العمليات أو الـ header.`,
          actionLabel: "إيقاف النسخة",
          actionClassName: "",
        }
      case "archive":
        return {
          title: "أرشفة النسخة الحالية",
          description: `سيتم قفل v${selectedVersion?.version_no} نهائيًا وجعلها Archived للقراءة فقط.`,
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
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(8,145,178,0.08),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]">
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-12 pt-20 md:px-8 md:pt-10">
          <Card className="overflow-hidden border-slate-200/70 shadow-lg shadow-slate-200/40">
            <CardHeader className="border-b bg-white/80 backdrop-blur">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
                    <Factory className="h-3.5 w-3.5" />
                    Routing Workspace
                  </div>
                  <CardTitle className="text-2xl font-semibold text-slate-900">
                    {routing ? `${routing.routing_code} — ${routing.routing_name}` : "تفاصيل Routing"}
                  </CardTitle>
                  <CardDescription className="max-w-3xl text-sm leading-6 text-slate-600">
                    هذه الشاشة تدير الـ header والنسخ والعمليات والتفعيل/الإيقاف/الأرشفة. جميع الأوامر الحساسة تمر عبر B6 RPCs مع reload كامل بعد كل command.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" onClick={() => refreshWorkspace(selectedVersionId)} disabled={loadingRouting || loadingVersion} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${loadingRouting || loadingVersion ? "animate-spin" : ""}`} />
                    تحديث
                  </Button>
                  <Button onClick={() => setCreateVersionOpen(true)} disabled={!canWrite || !routing} className="gap-2">
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
                    حذف Routing
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 p-6">
              {loadingRouting && !routing ? (
                <div className="flex items-center justify-center gap-2 rounded-2xl border bg-white p-12 text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  جاري تحميل Routing...
                </div>
              ) : !routing ? (
                <div className="rounded-2xl border border-dashed bg-white p-12 text-center">
                  <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                    <AlertTriangle className="h-10 w-10 text-slate-300" />
                    <div className="text-lg font-medium text-slate-900">تعذر العثور على Routing</div>
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
                    <Card className="border-cyan-200 bg-cyan-50/80">
                      <CardContent className="p-4">
                        <div className="text-sm text-slate-500">Owner Product</div>
                        <div className="mt-1 text-base font-semibold text-slate-900">{buildProductLabel(ownerProduct)}</div>
                        {ownerProduct?.product_type ? (
                          <Badge variant="outline" className="mt-2">{ownerProduct.product_type}</Badge>
                        ) : null}
                      </CardContent>
                    </Card>
                    <Card className="border-indigo-200 bg-indigo-50/80">
                      <CardContent className="p-4">
                        <div className="text-sm text-slate-500">Routing Usage</div>
                        <div className="mt-1 text-base font-semibold text-slate-900">
                          {ROUTING_USAGE_OPTIONS.find((option) => option.value === routing.routing_usage)?.labelAr || routing.routing_usage}
                        </div>
                        <Badge variant={routing.is_active ? "default" : "outline"} className="mt-2">
                          {routing.is_active ? "Header Active" : "Header Inactive"}
                        </Badge>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200 bg-slate-50/80">
                      <CardContent className="p-4">
                        <div className="text-sm text-slate-500">Branch / Versions</div>
                        <div className="mt-1 font-mono text-xs text-slate-700">{routing.branch_id}</div>
                        <div className="mt-2 text-base font-semibold text-slate-900">{routing.versions.length} versions</div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[280px,minmax(0,1fr)]">
                    <Card className="h-fit">
                      <CardHeader>
                        <CardTitle className="text-base">Version Management</CardTitle>
                        <CardDescription>اختر النسخة الحالية أو أنشئ نسخة جديدة من نفس الـ routing.</CardDescription>
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
                                <Badge variant={getRoutingVersionStatusVariant(version.status)}>
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
                                    <Badge variant={getRoutingVersionStatusVariant(selectedVersion.status)}>
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
                                  >
                                    <PlayCircle className="h-4 w-4" />
                                    Activate
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => setConfirmAction("deactivate")}
                                    disabled={!canUpdate || !canDeactivateRoutingVersion(selectedVersion.status) || Boolean(runningAction)}
                                    className="gap-2"
                                  >
                                    <PauseCircle className="h-4 w-4" />
                                    Deactivate
                                  </Button>
                                  <Button
                                    variant="outline"
                                    onClick={() => setConfirmAction("archive")}
                                    disabled={!canUpdate || !canArchiveRoutingVersion(selectedVersion.status) || Boolean(runningAction)}
                                    className="gap-2"
                                  >
                                    <Archive className="h-4 w-4" />
                                    Archive
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    onClick={() => setConfirmAction("delete-version")}
                                    disabled={!canDelete || !canDeleteRoutingVersion(selectedVersion.status) || Boolean(runningAction)}
                                    className="gap-2"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete Version
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                          </Card>

                          <Tabs defaultValue="overview" className="space-y-4">
                            <TabsList className="grid w-full grid-cols-2">
                              <TabsTrigger value="overview">Overview</TabsTrigger>
                              <TabsTrigger value="operations">Operations Editor</TabsTrigger>
                            </TabsList>

                            <TabsContent value="overview" className="space-y-6">
                              <Card>
                                <CardHeader>
                                  <CardTitle className="text-base">Routing Header</CardTitle>
                                  <CardDescription>identity fields للقراءة فقط، والحقول القابلة للتحديث تحفظ عبر `PATCH /routings/[id]`.</CardDescription>
                                </CardHeader>
                                <CardContent className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label>Routing Code</Label>
                                    <Input
                                      value={headerForm.routing_code}
                                      onChange={(event) => setHeaderForm((current) => ({ ...current, routing_code: event.target.value }))}
                                      disabled={!canUpdate || savingHeader}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Routing Name</Label>
                                    <Input
                                      value={headerForm.routing_name}
                                      onChange={(event) => setHeaderForm((current) => ({ ...current, routing_name: event.target.value }))}
                                      disabled={!canUpdate || savingHeader}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Owner Product</Label>
                                    <Input value={buildProductLabel(ownerProduct)} disabled />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Branch ID</Label>
                                    <Input value={routing.branch_id} disabled className="font-mono text-xs" />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Routing Usage</Label>
                                    <Input
                                      value={ROUTING_USAGE_OPTIONS.find((option) => option.value === routing.routing_usage)?.labelAr || routing.routing_usage}
                                      disabled
                                    />
                                  </div>
                                  <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                                    <div className="space-y-1">
                                      <div className="font-medium text-slate-900">Header Active</div>
                                      <div className="text-sm text-slate-500">هذه الحالة خاصة بالـ header نفسه وليست version status.</div>
                                    </div>
                                    <Switch
                                      checked={headerForm.is_active}
                                      onCheckedChange={(checked) => setHeaderForm((current) => ({ ...current, is_active: Boolean(checked) }))}
                                      disabled={!canUpdate || savingHeader}
                                    />
                                  </div>
                                  <div className="space-y-2 md:col-span-2">
                                    <Label>Description</Label>
                                    <Textarea
                                      value={headerForm.description}
                                      onChange={(event) => setHeaderForm((current) => ({ ...current, description: event.target.value }))}
                                      disabled={!canUpdate || savingHeader}
                                    />
                                  </div>
                                  <div className="md:col-span-2">
                                    <Button onClick={handleSaveHeader} disabled={!canUpdate || savingHeader} className="gap-2">
                                      <Save className="h-4 w-4" />
                                      {savingHeader ? "جاري الحفظ..." : "حفظ Routing Header"}
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>

                              <Card>
                                <CardHeader>
                                  <CardTitle className="text-base">Version Header</CardTitle>
                                  <CardDescription>هذه الحقول تقرأ وتكتب عبر `PATCH /routing-versions/[id]` وتبقى قابلة للتعديل فقط في draft.</CardDescription>
                                </CardHeader>
                                <CardContent className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label>Effective From</Label>
                                    <Input
                                      type="datetime-local"
                                      value={versionForm.effective_from}
                                      onChange={(event) => setVersionForm((current) => ({ ...current, effective_from: event.target.value }))}
                                      disabled={!canUpdate || !versionEditable || savingVersionHeader}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Effective To</Label>
                                    <Input
                                      type="datetime-local"
                                      value={versionForm.effective_to}
                                      onChange={(event) => setVersionForm((current) => ({ ...current, effective_to: event.target.value }))}
                                      disabled={!canUpdate || !versionEditable || savingVersionHeader}
                                    />
                                  </div>
                                  <div className="space-y-2 md:col-span-2">
                                    <Label>Change Summary</Label>
                                    <Textarea
                                      value={versionForm.change_summary}
                                      onChange={(event) => setVersionForm((current) => ({ ...current, change_summary: event.target.value }))}
                                      disabled={!canUpdate || !versionEditable || savingVersionHeader}
                                    />
                                  </div>
                                  <div className="space-y-2 md:col-span-2">
                                    <Label>Notes</Label>
                                    <Textarea
                                      value={versionForm.notes}
                                      onChange={(event) => setVersionForm((current) => ({ ...current, notes: event.target.value }))}
                                      disabled={!canUpdate || !versionEditable || savingVersionHeader}
                                    />
                                  </div>
                                  <div className="md:col-span-2">
                                    <Button onClick={handleSaveVersionHeader} disabled={!canUpdate || !versionEditable || savingVersionHeader} className="gap-2">
                                      <Save className="h-4 w-4" />
                                      {savingVersionHeader ? "جاري الحفظ..." : "حفظ Version Header"}
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            </TabsContent>

                            <TabsContent value="operations" className="space-y-6">
                              <Card>
                                <CardHeader>
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                      <CardTitle className="text-base">Operations Structure</CardTitle>
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
                                      >
                                        <Plus className="h-4 w-4" />
                                        إضافة Operation
                                      </Button>
                                      <Button
                                        onClick={handleSaveOperations}
                                        disabled={!canUpdate || !operationsEditable || savingOperations}
                                        className="gap-2"
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
                                        <div className="text-lg font-medium text-slate-900">لا توجد Operations بعد</div>
                                        <p className="text-sm leading-6 text-slate-500">
                                          أضف أول عملية لهذه النسخة. التفعيل لن ينجح قبل وجود Operation واحدة على الأقل.
                                        </p>
                                      </div>
                                    </div>
                                  ) : (
                                    operationsDraft.map((operation, index) => {
                                      const workCenter = workCentersById[operation.work_center_id]

                                      return (
                                        <Card key={`operation-${index}`} className="border-slate-200">
                                          <CardHeader className="border-b pb-4">
                                            <div className="flex items-center justify-between gap-3">
                                              <div className="space-y-1">
                                                <CardTitle className="text-base">Operation #{operation.operation_no || index + 1}</CardTitle>
                                                <CardDescription>
                                                  {workCenter ? buildWorkCenterLabel(workCenter) : "أدخل Work Center ID صالح وسيتم تأكيده من الـ API/DB."}
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
                                            <div className="space-y-2">
                                              <Label>Operation No</Label>
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
                                            <div className="space-y-2">
                                              <Label>Operation Code</Label>
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
                                            <div className="space-y-2 xl:col-span-2">
                                              <Label>Operation Name</Label>
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
                                            <div className="space-y-2 xl:col-span-2">
                                              <Label>Work Center ID</Label>
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
                                                    {workCenter.work_center_type || "unknown"} · {workCenter.status || "unknown"}
                                                    {workCenter.capacity_uom ? ` · ${formatQuantity(workCenter.nominal_capacity_per_hour)} ${workCenter.capacity_uom}/hr` : ""}
                                                  </div>
                                                </div>
                                              ) : null}
                                            </div>
                                            <div className="flex items-center justify-between rounded-xl border px-4 py-3 xl:col-span-2">
                                              <div className="space-y-1">
                                                <div className="font-medium text-slate-900">Quality Checkpoint</div>
                                                <div className="text-sm text-slate-500">يبقى Boolean بسيطًا في v1.</div>
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
                                            <div className="space-y-2">
                                              <Label>Setup (min)</Label>
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
                                            <div className="space-y-2">
                                              <Label>Run / Unit (min)</Label>
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
                                              <Label>Queue (min)</Label>
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
                                              <Label>Move (min)</Label>
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
                                              <Label>Labor (min)</Label>
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
                                              <Label>Machine (min)</Label>
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
                                            <div className="space-y-2 xl:col-span-4">
                                              <Label>Instructions</Label>
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
                                <Card>
                                  <CardHeader>
                                    <CardTitle className="text-base">Current Persisted Snapshot</CardTitle>
                                    <CardDescription>مرجع سريع للنسخة المحفوظة فعليًا بعد آخر reload من الـ API.</CardDescription>
                                  </CardHeader>
                                  <CardContent>
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>No</TableHead>
                                          <TableHead>Code</TableHead>
                                          <TableHead>Name</TableHead>
                                          <TableHead>Work Center</TableHead>
                                          <TableHead>Run / Unit</TableHead>
                                          <TableHead>Quality</TableHead>
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
                                            <TableCell>{operation.quality_checkpoint_required ? "Required" : "—"}</TableCell>
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
            </CardContent>
          </Card>
        </main>

        <Dialog open={createVersionOpen} onOpenChange={setCreateVersionOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>إنشاء Routing Version جديدة</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Clone From Version</Label>
                <Input
                  value={createVersionForm.clone_from_version_id || ""}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, clone_from_version_id: event.target.value.trim() || null }))}
                  placeholder="اختياري: UUID لنسخة موجودة لاستنساخ العمليات منها"
                />
              </div>
              <div className="space-y-2">
                <Label>Effective From</Label>
                <Input
                  type="datetime-local"
                  value={isoToLocalDateTimeInput(createVersionForm.effective_from)}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, effective_from: localDateTimeInputToIso(event.target.value) }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Effective To</Label>
                <Input
                  type="datetime-local"
                  value={isoToLocalDateTimeInput(createVersionForm.effective_to)}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, effective_to: localDateTimeInputToIso(event.target.value) }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Change Summary</Label>
                <Textarea
                  value={typeof createVersionForm.change_summary === "string" ? createVersionForm.change_summary : ""}
                  onChange={(event) => setCreateVersionForm((current) => ({ ...current, change_summary: event.target.value }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Notes</Label>
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
              <Button onClick={handleCreateVersion} disabled={runningAction === "create-version"}>
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
              >
                {runningAction ? "جاري التنفيذ..." : confirmDialogMeta?.actionLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageGuard>
  )
}
