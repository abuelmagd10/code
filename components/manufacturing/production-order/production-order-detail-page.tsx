"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  Factory,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  TimerReset,
  Trash2,
  Wrench,
  XCircle,
} from "lucide-react"
import { PageGuard } from "@/components/page-guard"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { useAccess } from "@/lib/access-context"
import {
  type AppLang,
  type ProductionOrderOperation,
  PRODUCTION_ORDER_PROGRESS_STATUSES,
  type ProductionOrderSnapshot,
  buildBomLabel,
  buildProductLabel,
  buildRoutingLabel,
  buildSourceRoutingOperationLabel,
  buildWorkCenterLabel,
  cancelProductionOrder,
  canCancelProductionOrder,
  canDeleteProductionOrder,
  canCompleteProductionOrder,
  canEditProductionOrderHeader,
  canRegenerateProductionOrder,
  canReleaseProductionOrder,
  canStartProductionOrder,
  canUpdateProductionOrderOperationProgress,
  completeProductionOrder,
  deleteProductionOrder,
  fetchProductionOrderDetail,
  formatDateTime,
  formatQuantity,
  getProductionOrderCopy,
  getProductionOrderOperationStatusLabel,
  getProductionOrderOperationStatusVariant,
  getProductionOrderStatusLabel,
  getProductionOrderStatusVariant,
  getTextDirection,
  localDateTimeInputToIso,
  readAppLanguage,
  regenerateProductionOrderOperations,
  releaseProductionOrder,
  startProductionOrder,
  type ProductionOrderProgressStatus,
  updateProductionOrder,
  updateProductionOrderOperationProgress,
  isoToLocalDateTimeInput,
} from "@/lib/manufacturing/production-order-ui"

interface ProductionOrderDetailPageProps {
  productionOrderId: string
}

interface DraftHeaderFormState {
  bom_id: string
  bom_version_id: string
  issue_warehouse_id: string
  receipt_warehouse_id: string
  order_uom: string
  planned_start_at: string
  planned_end_at: string
  notes: string
}

interface RegenerateFormState {
  bom_id: string
  bom_version_id: string
  routing_id: string
  routing_version_id: string
  planned_quantity: string
  issue_warehouse_id: string
  receipt_warehouse_id: string
  order_uom: string
  planned_start_at: string
  planned_end_at: string
  notes: string
}

interface CompleteFormState {
  completed_quantity: string
  completed_at: string
}

interface CancelFormState {
  cancellation_reason: string
  cancelled_at: string
}

interface ProgressFormState {
  status: ProductionOrderProgressStatus
  completed_quantity: string
  actual_start_at: string
  actual_end_at: string
  notes: string
}

const EMPTY_HEADER_FORM: DraftHeaderFormState = {
  bom_id: "",
  bom_version_id: "",
  issue_warehouse_id: "",
  receipt_warehouse_id: "",
  order_uom: "",
  planned_start_at: "",
  planned_end_at: "",
  notes: "",
}

const EMPTY_REGENERATE_FORM: RegenerateFormState = {
  bom_id: "",
  bom_version_id: "",
  routing_id: "",
  routing_version_id: "",
  planned_quantity: "1",
  issue_warehouse_id: "",
  receipt_warehouse_id: "",
  order_uom: "",
  planned_start_at: "",
  planned_end_at: "",
  notes: "",
}

const EMPTY_COMPLETE_FORM: CompleteFormState = {
  completed_quantity: "",
  completed_at: "",
}

const EMPTY_CANCEL_FORM: CancelFormState = {
  cancellation_reason: "",
  cancelled_at: "",
}

const EMPTY_PROGRESS_FORM: ProgressFormState = {
  status: "in_progress",
  completed_quantity: "",
  actual_start_at: "",
  actual_end_at: "",
  notes: "",
}

export function ProductionOrderDetailPage({ productionOrderId }: ProductionOrderDetailPageProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { canAction, isReady: accessReady } = useAccess()

  const canRead = accessReady ? canAction("manufacturing_boms", "read") : false
  const canUpdate = accessReady ? canAction("manufacturing_boms", "update") : false
  const canDelete = accessReady ? canAction("manufacturing_boms", "delete") : false

  const [appLang, setAppLang] = useState<AppLang>("ar")
  const [snapshot, setSnapshot] = useState<ProductionOrderSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingHeader, setSavingHeader] = useState(false)
  const [runningAction, setRunningAction] = useState<string | null>(null)
  const [headerForm, setHeaderForm] = useState<DraftHeaderFormState>(EMPTY_HEADER_FORM)
  const [regenerateForm, setRegenerateForm] = useState<RegenerateFormState>(EMPTY_REGENERATE_FORM)
  const [completeForm, setCompleteForm] = useState<CompleteFormState>(EMPTY_COMPLETE_FORM)
  const [cancelForm, setCancelForm] = useState<CancelFormState>(EMPTY_CANCEL_FORM)
  const [progressForm, setProgressForm] = useState<ProgressFormState>(EMPTY_PROGRESS_FORM)
  const [regenerateOpen, setRegenerateOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false)
  const [startConfirmOpen, setStartConfirmOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [activeOperation, setActiveOperation] = useState<ProductionOrderOperation | null>(null)

  useEffect(() => {
    const handler = () => setAppLang(readAppLanguage())
    const storageHandler = (event: StorageEvent) => {
      if (event.key === "app_language") handler()
    }
    handler()
    window.addEventListener("app_language_changed", handler)
    window.addEventListener("storage", storageHandler)

    return () => {
      window.removeEventListener("app_language_changed", handler)
      window.removeEventListener("storage", storageHandler)
    }
  }, [])

  const copy = useMemo(() => getProductionOrderCopy(appLang), [appLang])
  const order = snapshot?.order || null

  const headerEditable = Boolean(order && canUpdate && canEditProductionOrderHeader(order.status))
  const regenerateEnabled = Boolean(order && canUpdate && canRegenerateProductionOrder(order.status))
  const releaseEnabled = Boolean(order && canUpdate && canReleaseProductionOrder(order.status))
  const startEnabled = Boolean(order && canUpdate && canStartProductionOrder(order.status))
  const completeEnabled = Boolean(order && canUpdate && canCompleteProductionOrder(order.status))
  const cancelEnabled = Boolean(order && canUpdate && canCancelProductionOrder(order.status))
  const deleteEnabled = Boolean(order && canDelete && canDeleteProductionOrder(order.status))
  const busy = Boolean(runningAction) || loading || savingHeader

  const hydrateState = useCallback((nextSnapshot: ProductionOrderSnapshot) => {
    setSnapshot(nextSnapshot)
    setHeaderForm({
      bom_id: nextSnapshot.order.bom_id || "",
      bom_version_id: nextSnapshot.order.bom_version_id || "",
      issue_warehouse_id: nextSnapshot.order.issue_warehouse_id || "",
      receipt_warehouse_id: nextSnapshot.order.receipt_warehouse_id || "",
      order_uom: nextSnapshot.order.order_uom || "",
      planned_start_at: isoToLocalDateTimeInput(nextSnapshot.order.planned_start_at),
      planned_end_at: isoToLocalDateTimeInput(nextSnapshot.order.planned_end_at),
      notes: nextSnapshot.order.notes || "",
    })
    setRegenerateForm({
      bom_id: nextSnapshot.order.bom_id || "",
      bom_version_id: nextSnapshot.order.bom_version_id || "",
      routing_id: nextSnapshot.order.routing_id || "",
      routing_version_id: nextSnapshot.order.routing_version_id || "",
      planned_quantity: String(nextSnapshot.order.planned_quantity ?? 1),
      issue_warehouse_id: nextSnapshot.order.issue_warehouse_id || "",
      receipt_warehouse_id: nextSnapshot.order.receipt_warehouse_id || "",
      order_uom: nextSnapshot.order.order_uom || "",
      planned_start_at: isoToLocalDateTimeInput(nextSnapshot.order.planned_start_at),
      planned_end_at: isoToLocalDateTimeInput(nextSnapshot.order.planned_end_at),
      notes: nextSnapshot.order.notes || "",
    })
    setCompleteForm({
      completed_quantity: String(nextSnapshot.order.planned_quantity ?? ""),
      completed_at: "",
    })
    setCancelForm(EMPTY_CANCEL_FORM)
  }, [])

  const loadSnapshot = useCallback(async () => {
    try {
      setLoading(true)
      const nextSnapshot = await fetchProductionOrderDetail(productionOrderId)
      hydrateState(nextSnapshot)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: copy.detail.loadErrorTitle,
        description: error?.message || copy.detail.loadErrorDescription,
      })
      setSnapshot(null)
    } finally {
      setLoading(false)
    }
  }, [copy.detail.loadErrorDescription, copy.detail.loadErrorTitle, hydrateState, productionOrderId, toast])

  const refreshWorkspace = useCallback(async () => {
    await loadSnapshot()
  }, [loadSnapshot])

  useEffect(() => {
    if (!canRead) return
    loadSnapshot()
  }, [canRead, loadSnapshot])

  const handleSaveHeader = async () => {
    if (!order) return

    try {
      setSavingHeader(true)
      await updateProductionOrder(order.id, {
        bom_id: headerForm.bom_id.trim(),
        bom_version_id: headerForm.bom_version_id.trim(),
        issue_warehouse_id: headerForm.issue_warehouse_id.trim() || null,
        receipt_warehouse_id: headerForm.receipt_warehouse_id.trim() || null,
        order_uom: headerForm.order_uom.trim() || null,
        planned_start_at: localDateTimeInputToIso(headerForm.planned_start_at),
        planned_end_at: localDateTimeInputToIso(headerForm.planned_end_at),
        notes: headerForm.notes.trim() || null,
      })

      toast({
        title: copy.detail.saveSuccessTitle,
        description: copy.detail.saveSuccessDescription,
      })
      await refreshWorkspace()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: copy.detail.saveErrorTitle,
        description: error?.message || copy.detail.saveErrorDescription,
      })
      await refreshWorkspace()
    } finally {
      setSavingHeader(false)
    }
  }

  const handleRegenerate = async () => {
    if (!order) return

    try {
      setRunningAction("regenerate")
      await regenerateProductionOrderOperations(order.id, {
        bom_id: regenerateForm.bom_id.trim(),
        bom_version_id: regenerateForm.bom_version_id.trim(),
        routing_id: regenerateForm.routing_id.trim(),
        routing_version_id: regenerateForm.routing_version_id.trim(),
        planned_quantity: Number(regenerateForm.planned_quantity || 0),
        issue_warehouse_id: regenerateForm.issue_warehouse_id.trim() || null,
        receipt_warehouse_id: regenerateForm.receipt_warehouse_id.trim() || null,
        order_uom: regenerateForm.order_uom.trim() || null,
        planned_start_at: localDateTimeInputToIso(regenerateForm.planned_start_at),
        planned_end_at: localDateTimeInputToIso(regenerateForm.planned_end_at),
        notes: regenerateForm.notes.trim() || null,
      })

      setRegenerateOpen(false)
      toast({
        title: copy.detail.regenerateSuccessTitle,
        description: copy.detail.regenerateSuccessDescription,
      })
      await refreshWorkspace()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: copy.detail.regenerateErrorTitle,
        description: error?.message || copy.detail.regenerateErrorDescription,
      })
      await refreshWorkspace()
    } finally {
      setRunningAction(null)
    }
  }

  const handleRelease = async () => {
    if (!order) return

    try {
      setRunningAction("release")
      await releaseProductionOrder(order.id)
      setReleaseConfirmOpen(false)
      toast({
        title: copy.detail.releaseSuccessTitle,
        description: copy.detail.releaseSuccessDescription,
      })
      await refreshWorkspace()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: copy.detail.releaseErrorTitle,
        description: error?.message || copy.detail.releaseErrorDescription,
      })
      await refreshWorkspace()
    } finally {
      setRunningAction(null)
    }
  }

  const handleStart = async () => {
    if (!order) return

    try {
      setRunningAction("start")
      await startProductionOrder(order.id)
      setStartConfirmOpen(false)
      toast({
        title: copy.detail.startSuccessTitle,
        description: copy.detail.startSuccessDescription,
      })
      await refreshWorkspace()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: copy.detail.startErrorTitle,
        description: error?.message || copy.detail.startErrorDescription,
      })
      await refreshWorkspace()
    } finally {
      setRunningAction(null)
    }
  }

  const handleComplete = async () => {
    if (!order) return

    try {
      setRunningAction("complete")
      await completeProductionOrder(order.id, {
        completed_quantity: Number(completeForm.completed_quantity || 0),
        completed_at: localDateTimeInputToIso(completeForm.completed_at),
      })
      setCompleteOpen(false)
      toast({
        title: copy.detail.completeSuccessTitle,
        description: copy.detail.completeSuccessDescription,
      })
      await refreshWorkspace()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: copy.detail.completeErrorTitle,
        description: error?.message || copy.detail.completeErrorDescription,
      })
      await refreshWorkspace()
    } finally {
      setRunningAction(null)
    }
  }

  const handleCancel = async () => {
    if (!order) return

    try {
      setRunningAction("cancel")
      await cancelProductionOrder(order.id, {
        cancellation_reason: cancelForm.cancellation_reason.trim(),
        cancelled_at: localDateTimeInputToIso(cancelForm.cancelled_at),
      })
      setCancelOpen(false)
      toast({
        title: copy.detail.cancelSuccessTitle,
        description: copy.detail.cancelSuccessDescription,
      })
      await refreshWorkspace()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: copy.detail.cancelErrorTitle,
        description: error?.message || copy.detail.cancelErrorDescription,
      })
      await refreshWorkspace()
    } finally {
      setRunningAction(null)
    }
  }

  const handleDelete = async () => {
    if (!order) return

    try {
      setRunningAction("delete")
      await deleteProductionOrder(order.id)
      setDeleteConfirmOpen(false)
      toast({
        title: copy.detail.deleteSuccessTitle,
        description: copy.detail.deleteSuccessDescription,
      })
      router.push("/manufacturing/production-orders")
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: copy.detail.deleteErrorTitle,
        description: error?.message || copy.detail.deleteErrorDescription,
      })
      await refreshWorkspace()
    } finally {
      setRunningAction(null)
    }
  }

  const openProgressDialog = (operation: ProductionOrderOperation) => {
    setActiveOperation(operation)
    setProgressForm({
      status: operation.status === "pending" ? "ready" : (operation.status as ProductionOrderProgressStatus),
      completed_quantity: String(operation.completed_quantity ?? 0),
      actual_start_at: isoToLocalDateTimeInput(operation.actual_start_at),
      actual_end_at: isoToLocalDateTimeInput(operation.actual_end_at),
      notes: operation.notes || "",
    })
    setProgressOpen(true)
  }

  const handleProgressSave = async () => {
    if (!activeOperation) return

    try {
      setRunningAction("progress")
      await updateProductionOrderOperationProgress(activeOperation.id, {
        status: progressForm.status,
        completed_quantity: Number(progressForm.completed_quantity || 0),
        actual_start_at: localDateTimeInputToIso(progressForm.actual_start_at),
        actual_end_at: localDateTimeInputToIso(progressForm.actual_end_at),
        notes: progressForm.notes.trim() || null,
      })

      setProgressOpen(false)
      setActiveOperation(null)
      toast({
        title: copy.detail.progressSuccessTitle,
        description: copy.detail.progressSuccessDescription,
      })
      await refreshWorkspace()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: copy.detail.progressErrorTitle,
        description: error?.message || copy.detail.progressErrorDescription,
      })
      await refreshWorkspace()
    } finally {
      setRunningAction(null)
    }
  }

  const lockMessage = useMemo(() => {
    if (!order) return copy.common.noValue
    if (order.status === "draft") return copy.detail.snapshotFrozenDraft
    if (order.status === "released" || order.status === "in_progress") return copy.detail.snapshotFrozenReleased
    return copy.detail.terminalOrder
  }, [copy.common.noValue, copy.detail.snapshotFrozenDraft, copy.detail.snapshotFrozenReleased, copy.detail.terminalOrder, order])

  return (
    <PageGuard resource="manufacturing_boms">
      <div dir={getTextDirection(appLang)} className="container mx-auto p-4 space-y-6">
        <ERPPageHeader
          title={order?.order_no || copy.detail.title}
          description={copy.detail.description}
          variant="detail"
          backHref="/manufacturing/production-orders"
          backLabel={copy.detail.back}
          extra={
            <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
              <Factory className="h-3.5 w-3.5" />
              {copy.detail.pill}
            </div>
          }
          actions={
            <>
              <Button variant="outline" onClick={refreshWorkspace} disabled={busy} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {copy.detail.reload}
              </Button>
              <Button
                variant="outline"
                onClick={() => setRegenerateOpen(true)}
                disabled={!regenerateEnabled || busy}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                {copy.detail.regenerate}
              </Button>
              <Button onClick={() => setReleaseConfirmOpen(true)} disabled={!releaseEnabled || busy} className="gap-2">
                <Send className="h-4 w-4" />
                {copy.detail.release}
              </Button>
              <Button onClick={() => setStartConfirmOpen(true)} disabled={!startEnabled || busy} className="gap-2">
                <PlayCircle className="h-4 w-4" />
                {copy.detail.start}
              </Button>
              <Button onClick={() => setCompleteOpen(true)} disabled={!completeEnabled || busy} className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {copy.detail.complete}
              </Button>
              <Button variant="destructive" onClick={() => setCancelOpen(true)} disabled={!cancelEnabled || busy} className="gap-2">
                <XCircle className="h-4 w-4" />
                {copy.detail.cancel}
              </Button>
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(true)} disabled={!deleteEnabled || busy} className="gap-2">
                <Trash2 className="h-4 w-4" />
                {copy.detail.delete}
              </Button>
            </>
          }
        />

        <div className="space-y-6">
          {loading ? (
            <div className="rounded-2xl border bg-white px-6 py-16 text-center text-slate-500">
              {copy.detail.loading}
            </div>
          ) : !snapshot || !order ? (
                <div className="rounded-2xl border bg-white px-6 py-16 text-center">
                  <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
                    <AlertTriangle className="h-10 w-10 text-slate-300" />
                    <div className="text-lg font-medium text-slate-800">{copy.detail.loadErrorTitle}</div>
                    <p className="text-sm leading-6 text-slate-500">{copy.detail.loadErrorDescription}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card className="border-cyan-200 bg-cyan-50/80">
                      <CardContent className="space-y-2 p-4">
                        <div className="text-sm text-slate-600">{copy.detail.ownerProduct}</div>
                        <div className="font-medium text-slate-900">{buildProductLabel(snapshot.product || order.product, appLang)}</div>
                        <div className="text-xs text-slate-500">{order.product_id}</div>
                      </CardContent>
                    </Card>
                    <Card className="border-indigo-200 bg-indigo-50/80">
                      <CardContent className="space-y-2 p-4">
                        <div className="text-sm text-slate-600">{copy.detail.sourceRefs}</div>
                        <div className="font-medium text-slate-900">
                          {buildBomLabel(snapshot.bom || order.bom, snapshot.bom_version || order.bom_version, appLang)}
                        </div>
                        <div className="font-medium text-slate-900">
                          {buildRoutingLabel(
                            snapshot.routing || order.routing,
                            snapshot.routing_version || order.routing_version,
                            appLang
                          )}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-emerald-200 bg-emerald-50/80">
                      <CardContent className="space-y-2 p-4">
                        <div className="text-sm text-slate-600">{copy.detail.snapshotCount}</div>
                        <div className="text-2xl font-semibold text-slate-900">{snapshot.operations.length}</div>
                        <div className="flex items-center gap-2">
                          <Badge variant={getProductionOrderStatusVariant(order.status)}>
                            {getProductionOrderStatusLabel(order.status, appLang)}
                          </Badge>
                          <span className="text-xs text-slate-500">
                            {copy.detail.orderNo}: {order.order_no}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Tabs defaultValue="overview" className="gap-4">
                    <TabsList className="w-full justify-start">
                      <TabsTrigger value="overview">{copy.detail.tabsOverview}</TabsTrigger>
                      <TabsTrigger value="operations">{copy.detail.tabsOperations}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle>{copy.detail.summaryTitle}</CardTitle>
                          <CardDescription>{copy.detail.summaryDescription}</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-wide text-slate-500">{copy.detail.status}</div>
                            <Badge variant={getProductionOrderStatusVariant(order.status)}>
                              {getProductionOrderStatusLabel(order.status, appLang)}
                            </Badge>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-wide text-slate-500">{copy.detail.plannedQty}</div>
                            <div className="font-medium text-slate-900">{formatQuantity(order.planned_quantity, appLang)}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-wide text-slate-500">{copy.detail.completedQty}</div>
                            <div className="font-medium text-slate-900">{formatQuantity(order.completed_quantity, appLang)}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-wide text-slate-500">{copy.detail.branchId}</div>
                            <div className="font-mono text-sm text-slate-700">{order.branch_id}</div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>{copy.detail.draftSectionTitle}</CardTitle>
                          <CardDescription>{copy.detail.draftSectionDescription}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            {lockMessage}
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>{copy.list.fields.bomId}</Label>
                              <Input
                                value={headerForm.bom_id}
                                onChange={(event) => setHeaderForm((current) => ({ ...current, bom_id: event.target.value }))}
                                disabled={!headerEditable}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{copy.list.fields.bomVersionId}</Label>
                              <Input
                                value={headerForm.bom_version_id}
                                onChange={(event) =>
                                  setHeaderForm((current) => ({ ...current, bom_version_id: event.target.value }))
                                }
                                disabled={!headerEditable}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{copy.detail.issueWarehouseId}</Label>
                              <Input
                                value={headerForm.issue_warehouse_id}
                                onChange={(event) =>
                                  setHeaderForm((current) => ({ ...current, issue_warehouse_id: event.target.value }))
                                }
                                disabled={!headerEditable}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{copy.detail.receiptWarehouseId}</Label>
                              <Input
                                value={headerForm.receipt_warehouse_id}
                                onChange={(event) =>
                                  setHeaderForm((current) => ({ ...current, receipt_warehouse_id: event.target.value }))
                                }
                                disabled={!headerEditable}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{copy.detail.orderUom}</Label>
                              <Input
                                value={headerForm.order_uom}
                                onChange={(event) => setHeaderForm((current) => ({ ...current, order_uom: event.target.value }))}
                                disabled={!headerEditable}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{copy.detail.plannedStartAt}</Label>
                              <Input
                                type="datetime-local"
                                value={headerForm.planned_start_at}
                                onChange={(event) =>
                                  setHeaderForm((current) => ({ ...current, planned_start_at: event.target.value }))
                                }
                                disabled={!headerEditable}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>{copy.detail.plannedEndAt}</Label>
                              <Input
                                type="datetime-local"
                                value={headerForm.planned_end_at}
                                onChange={(event) =>
                                  setHeaderForm((current) => ({ ...current, planned_end_at: event.target.value }))
                                }
                                disabled={!headerEditable}
                              />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                              <Label>{copy.detail.notes}</Label>
                              <Textarea
                                value={headerForm.notes}
                                onChange={(event) => setHeaderForm((current) => ({ ...current, notes: event.target.value }))}
                                rows={4}
                                disabled={!headerEditable}
                              />
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Button onClick={handleSaveHeader} disabled={!headerEditable || savingHeader} className="gap-2">
                              <Save className="h-4 w-4" />
                              {savingHeader ? copy.common.loadingAction : copy.detail.saveDraft}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>{copy.detail.sourceSectionTitle}</CardTitle>
                          <CardDescription>{copy.detail.sourceSectionDescription}</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-wide text-slate-500">{copy.list.fields.bomId}</div>
                            <div className="font-mono text-sm text-slate-700">{order.bom_id}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-wide text-slate-500">{copy.list.fields.bomVersionId}</div>
                            <div className="font-mono text-sm text-slate-700">{order.bom_version_id}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-wide text-slate-500">{copy.list.fields.routingId}</div>
                            <div className="font-mono text-sm text-slate-700">{order.routing_id}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-wide text-slate-500">{copy.list.fields.routingVersionId}</div>
                            <div className="font-mono text-sm text-slate-700">{order.routing_version_id}</div>
                          </div>
                          <div className="space-y-1 xl:col-span-2">
                            <div className="text-xs uppercase tracking-wide text-slate-500">{copy.common.bomRouting}</div>
                            <div className="space-y-1 text-sm text-slate-700">
                              <div>{buildBomLabel(snapshot.bom || order.bom, snapshot.bom_version || order.bom_version, appLang)}</div>
                              <div>
                                {buildRoutingLabel(
                                  snapshot.routing || order.routing,
                                  snapshot.routing_version || order.routing_version,
                                  appLang
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>{copy.detail.lifecycleSectionTitle}</CardTitle>
                          <CardDescription>{copy.detail.lifecycleDescription}</CardDescription>
                        </CardHeader>
                        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-wide text-slate-500">{copy.detail.plannedStartAt}</div>
                            <div className="text-sm text-slate-700">{formatDateTime(order.planned_start_at, appLang)}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-wide text-slate-500">{copy.detail.plannedEndAt}</div>
                            <div className="text-sm text-slate-700">{formatDateTime(order.planned_end_at, appLang)}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-wide text-slate-500">{copy.detail.releasedAt}</div>
                            <div className="text-sm text-slate-700">{formatDateTime(order.released_at, appLang)}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-wide text-slate-500">{copy.detail.startedAt}</div>
                            <div className="text-sm text-slate-700">{formatDateTime(order.started_at, appLang)}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-wide text-slate-500">{copy.detail.completedAt}</div>
                            <div className="text-sm text-slate-700">{formatDateTime(order.completed_at, appLang)}</div>
                          </div>
                          <div className="space-y-1">
                            <div className="text-xs uppercase tracking-wide text-slate-500">{copy.detail.cancelledAt}</div>
                            <div className="text-sm text-slate-700">{formatDateTime(order.cancelled_at, appLang)}</div>
                          </div>
                          <div className="space-y-1 xl:col-span-2">
                            <div className="text-xs uppercase tracking-wide text-slate-500">{copy.detail.cancellationReason}</div>
                            <div className="text-sm text-slate-700">{order.cancellation_reason || copy.common.noValue}</div>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="operations" className="space-y-4">
                      <Card>
                        <CardHeader>
                          <CardTitle>{copy.detail.operationsSectionTitle}</CardTitle>
                          <CardDescription>{copy.detail.operationsSectionDescription}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            {lockMessage}
                            <div className="mt-1 text-xs text-slate-500">{copy.common.partialProgress}</div>
                          </div>

                          {snapshot.operations.length === 0 ? (
                            <div className="rounded-2xl border border-dashed px-6 py-14 text-center">
                              <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
                                <Wrench className="h-10 w-10 text-slate-300" />
                                <div className="text-lg font-medium text-slate-800">{copy.detail.noOperationsTitle}</div>
                                <p className="text-sm leading-6 text-slate-500">{copy.detail.noOperationsDescription}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-2xl border bg-white">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>{copy.detail.tableOperation}</TableHead>
                                    <TableHead>{copy.detail.tableWorkCenter}</TableHead>
                                    <TableHead>{copy.detail.tableStatus}</TableHead>
                                    <TableHead>{copy.detail.tableQuantity}</TableHead>
                                    <TableHead>{copy.detail.tableTiming}</TableHead>
                                    <TableHead>{copy.detail.tableAction}</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {snapshot.operations.map((operation) => {
                                    const progressAllowed = canUpdate && canUpdateProductionOrderOperationProgress(order.status, operation.status)

                                    return (
                                      <TableRow key={operation.id}>
                                        <TableCell className="align-top">
                                          <div className="space-y-1">
                                            <div className="font-medium text-slate-900">
                                              #{operation.operation_no} / {operation.operation_code}
                                            </div>
                                            <div className="text-sm text-slate-700">{operation.operation_name}</div>
                                            <div className="text-xs text-slate-500">
                                              {copy.common.sourceOperation}:{" "}
                                              {buildSourceRoutingOperationLabel(operation.source_routing_operation, appLang)}
                                            </div>
                                            {operation.instructions ? (
                                              <div className="text-xs leading-5 text-slate-500">{operation.instructions}</div>
                                            ) : null}
                                          </div>
                                        </TableCell>
                                        <TableCell className="align-top text-sm text-slate-700">
                                          <div>{buildWorkCenterLabel(operation.work_center, appLang)}</div>
                                          <div className="text-xs text-slate-500">{operation.work_center_id}</div>
                                          {operation.quality_checkpoint_required ? (
                                            <Badge variant="outline" className="mt-2">
                                              {copy.common.qualityCheckpoint}
                                            </Badge>
                                          ) : null}
                                        </TableCell>
                                        <TableCell className="align-top">
                                          <Badge variant={getProductionOrderOperationStatusVariant(operation.status)}>
                                            {getProductionOrderOperationStatusLabel(operation.status, appLang)}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="align-top">
                                          <div className="space-y-1 text-sm text-slate-700">
                                            <div>
                                              {copy.detail.plannedQty}: {formatQuantity(operation.planned_quantity, appLang)}
                                            </div>
                                            <div>
                                              {copy.detail.completedQty}: {formatQuantity(operation.completed_quantity, appLang)}
                                            </div>
                                          </div>
                                        </TableCell>
                                        <TableCell className="align-top">
                                          <div className="space-y-1 text-sm text-slate-700">
                                            <div>{copy.common.actualWindow}</div>
                                            <div>{formatDateTime(operation.actual_start_at, appLang)}</div>
                                            <div>{formatDateTime(operation.actual_end_at, appLang)}</div>
                                            <div className="text-xs text-slate-500">
                                              {formatQuantity(operation.setup_time_minutes, appLang, 2)} /{" "}
                                              {formatQuantity(operation.run_time_minutes_per_unit, appLang, 4)}
                                            </div>
                                          </div>
                                        </TableCell>
                                        <TableCell className="align-top">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="gap-2"
                                            disabled={!progressAllowed || busy}
                                            onClick={() => openProgressDialog(operation)}
                                          >
                                            <TimerReset className="h-4 w-4" />
                                            {copy.detail.progress}
                                          </Button>
                                        </TableCell>
                                      </TableRow>
                                    )
                                  })}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </>
              )}
        </div>
      </div>

      <Dialog open={regenerateOpen} onOpenChange={setRegenerateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{copy.detail.dialogs.regenerateTitle}</DialogTitle>
            <CardDescription>{copy.detail.dialogs.regenerateDescription}</CardDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{copy.list.fields.bomId}</Label>
              <Input
                value={regenerateForm.bom_id}
                onChange={(event) => setRegenerateForm((current) => ({ ...current, bom_id: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.list.fields.bomVersionId}</Label>
              <Input
                value={regenerateForm.bom_version_id}
                onChange={(event) =>
                  setRegenerateForm((current) => ({ ...current, bom_version_id: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.list.fields.routingId}</Label>
              <Input
                value={regenerateForm.routing_id}
                onChange={(event) => setRegenerateForm((current) => ({ ...current, routing_id: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.list.fields.routingVersionId}</Label>
              <Input
                value={regenerateForm.routing_version_id}
                onChange={(event) =>
                  setRegenerateForm((current) => ({ ...current, routing_version_id: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.list.fields.plannedQuantity}</Label>
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={regenerateForm.planned_quantity}
                onChange={(event) =>
                  setRegenerateForm((current) => ({ ...current, planned_quantity: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.detail.orderUom}</Label>
              <Input
                value={regenerateForm.order_uom}
                onChange={(event) => setRegenerateForm((current) => ({ ...current, order_uom: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.detail.issueWarehouseId}</Label>
              <Input
                value={regenerateForm.issue_warehouse_id}
                onChange={(event) =>
                  setRegenerateForm((current) => ({ ...current, issue_warehouse_id: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.detail.receiptWarehouseId}</Label>
              <Input
                value={regenerateForm.receipt_warehouse_id}
                onChange={(event) =>
                  setRegenerateForm((current) => ({ ...current, receipt_warehouse_id: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.detail.plannedStartAt}</Label>
              <Input
                type="datetime-local"
                value={regenerateForm.planned_start_at}
                onChange={(event) =>
                  setRegenerateForm((current) => ({ ...current, planned_start_at: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.detail.plannedEndAt}</Label>
              <Input
                type="datetime-local"
                value={regenerateForm.planned_end_at}
                onChange={(event) =>
                  setRegenerateForm((current) => ({ ...current, planned_end_at: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{copy.detail.notes}</Label>
              <Textarea
                value={regenerateForm.notes}
                onChange={(event) => setRegenerateForm((current) => ({ ...current, notes: event.target.value }))}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRegenerateOpen(false)} disabled={runningAction === "regenerate"}>
              {copy.common.cancel}
            </Button>
            <Button onClick={handleRegenerate} disabled={runningAction === "regenerate"}>
              {runningAction === "regenerate" ? copy.common.loadingAction : copy.detail.regenerate}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{copy.detail.dialogs.completeTitle}</DialogTitle>
            <CardDescription>{copy.detail.dialogs.completeDescription}</CardDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>{copy.detail.completedQty}</Label>
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={completeForm.completed_quantity}
                onChange={(event) =>
                  setCompleteForm((current) => ({ ...current, completed_quantity: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.detail.completedAt}</Label>
              <Input
                type="datetime-local"
                value={completeForm.completed_at}
                onChange={(event) => setCompleteForm((current) => ({ ...current, completed_at: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCompleteOpen(false)} disabled={runningAction === "complete"}>
              {copy.common.cancel}
            </Button>
            <Button onClick={handleComplete} disabled={runningAction === "complete"}>
              {runningAction === "complete" ? copy.common.loadingAction : copy.detail.complete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{copy.detail.dialogs.cancelTitle}</DialogTitle>
            <CardDescription>{copy.detail.dialogs.cancelDescription}</CardDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>{copy.detail.cancellationReason}</Label>
              <Textarea
                value={cancelForm.cancellation_reason}
                onChange={(event) =>
                  setCancelForm((current) => ({ ...current, cancellation_reason: event.target.value }))
                }
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.detail.cancelledAt}</Label>
              <Input
                type="datetime-local"
                value={cancelForm.cancelled_at}
                onChange={(event) => setCancelForm((current) => ({ ...current, cancelled_at: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={runningAction === "cancel"}>
              {copy.common.cancel}
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={runningAction === "cancel"}>
              {runningAction === "cancel" ? copy.common.loadingAction : copy.detail.cancel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={progressOpen} onOpenChange={setProgressOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{copy.detail.dialogs.progressTitle}</DialogTitle>
            <CardDescription>{copy.detail.dialogs.progressDescription}</CardDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{copy.detail.tableStatus}</Label>
              <Select
                value={progressForm.status}
                onValueChange={(value) =>
                  setProgressForm((current) => ({
                    ...current,
                    status: value as ProductionOrderProgressStatus,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCTION_ORDER_PROGRESS_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {getProductionOrderOperationStatusLabel(status as ProductionOrderOperation["status"], appLang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{copy.detail.completedQty}</Label>
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={progressForm.completed_quantity}
                onChange={(event) =>
                  setProgressForm((current) => ({ ...current, completed_quantity: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.common.actualStart}</Label>
              <Input
                type="datetime-local"
                value={progressForm.actual_start_at}
                onChange={(event) =>
                  setProgressForm((current) => ({ ...current, actual_start_at: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.common.actualEnd}</Label>
              <Input
                type="datetime-local"
                value={progressForm.actual_end_at}
                onChange={(event) =>
                  setProgressForm((current) => ({ ...current, actual_end_at: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{copy.detail.notes}</Label>
              <Textarea
                value={progressForm.notes}
                onChange={(event) => setProgressForm((current) => ({ ...current, notes: event.target.value }))}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setProgressOpen(false)
                setActiveOperation(null)
              }}
              disabled={runningAction === "progress"}
            >
              {copy.common.cancel}
            </Button>
            <Button onClick={handleProgressSave} disabled={runningAction === "progress"}>
              {runningAction === "progress" ? copy.common.loadingAction : copy.detail.progress}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={releaseConfirmOpen} onOpenChange={setReleaseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.detail.dialogs.releaseTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.detail.dialogs.releaseDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={runningAction === "release"}>{copy.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRelease} disabled={runningAction === "release"}>
              {runningAction === "release" ? copy.common.loadingAction : copy.detail.release}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={startConfirmOpen} onOpenChange={setStartConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.detail.dialogs.startTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.detail.dialogs.startDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={runningAction === "start"}>{copy.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleStart} disabled={runningAction === "start"}>
              {runningAction === "start" ? copy.common.loadingAction : copy.detail.start}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{copy.detail.dialogs.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{copy.detail.dialogs.deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={runningAction === "delete"}>{copy.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={runningAction === "delete"}>
              {runningAction === "delete" ? copy.common.loadingAction : copy.detail.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageGuard>
  )
}
