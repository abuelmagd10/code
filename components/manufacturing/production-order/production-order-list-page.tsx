"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Factory, Package2, PlayCircle, Plus, RefreshCw } from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { useAccess } from "@/lib/access-context"
import {
  PRODUCTION_ORDER_STATUSES,
  type AppLang,
  type ProductionOrderCreatePayload,
  type ProductionOrderListFilters,
  type ProductionOrderListItem,
  buildBomLabel,
  buildProductLabel,
  buildRoutingLabel,
  createProductionOrder,
  fetchProductionOrderList,
  formatDateTime,
  formatQuantity,
  getProductionOrderCopy,
  getProductionOrderStatusLabel,
  getProductionOrderStatusVariant,
  getTextDirection,
  readAppLanguage,
} from "@/lib/manufacturing/production-order-ui"

const EMPTY_CREATE_FORM: ProductionOrderCreatePayload = {
  branch_id: "",
  product_id: "",
  bom_id: "",
  bom_version_id: "",
  routing_id: "",
  routing_version_id: "",
  issue_warehouse_id: "",
  receipt_warehouse_id: "",
  planned_quantity: 1,
  order_uom: "",
  planned_start_at: "",
  planned_end_at: "",
  notes: "",
}

export function ProductionOrderListPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { canAction, isReady: accessReady } = useAccess()

  const canRead = accessReady ? canAction("manufacturing_boms", "read") : false
  const canWrite = accessReady ? canAction("manufacturing_boms", "write") : false

  const [appLang, setAppLang] = useState<AppLang>("ar")
  const [orders, setOrders] = useState<ProductionOrderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [filterForm, setFilterForm] = useState<ProductionOrderListFilters>({
    branchId: "",
    productId: "",
    status: "all",
    q: "",
  })
  const [appliedFilters, setAppliedFilters] = useState<ProductionOrderListFilters>({
    branchId: "",
    productId: "",
    status: "all",
    q: "",
  })
  const [createForm, setCreateForm] = useState<ProductionOrderCreatePayload>(EMPTY_CREATE_FORM)

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

  const loadOrders = useCallback(async (filters: ProductionOrderListFilters) => {
    try {
      setLoading(true)
      const result = await fetchProductionOrderList(filters)
      setOrders(result.items)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: copy.list.loadErrorTitle,
        description: error?.message || copy.list.loadErrorDescription,
      })
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [copy.list.loadErrorDescription, copy.list.loadErrorTitle, toast])

  useEffect(() => {
    if (!canRead) return
    loadOrders(appliedFilters)
  }, [appliedFilters, canRead, loadOrders])

  const openOrdersCount = useMemo(
    () => orders.filter((order) => order.status === "released" || order.status === "in_progress").length,
    [orders]
  )

  const completedOrdersCount = useMemo(
    () => orders.filter((order) => order.status === "completed").length,
    [orders]
  )

  const handleApplyFilters = () => {
    setAppliedFilters({
      branchId: filterForm.branchId?.trim() || "",
      productId: filterForm.productId?.trim() || "",
      status: filterForm.status || "all",
      q: filterForm.q?.trim() || "",
    })
  }

  const handleOpenCreate = () => {
    setCreateForm(EMPTY_CREATE_FORM)
    setCreateOpen(true)
  }

  const handleCreate = async () => {
    if (
      !createForm.product_id.trim() ||
      !createForm.bom_id.trim() ||
      !createForm.bom_version_id.trim() ||
      !createForm.routing_id.trim() ||
      !createForm.routing_version_id.trim() ||
      Number(createForm.planned_quantity) <= 0
    ) {
      toast({
        variant: "destructive",
        title: copy.list.createValidationTitle,
        description: copy.list.createValidationDescription,
      })
      return
    }

    try {
      setCreating(true)
      const snapshot = await createProductionOrder({
        branch_id: createForm.branch_id?.trim() || null,
        product_id: createForm.product_id.trim(),
        bom_id: createForm.bom_id.trim(),
        bom_version_id: createForm.bom_version_id.trim(),
        routing_id: createForm.routing_id.trim(),
        routing_version_id: createForm.routing_version_id.trim(),
        issue_warehouse_id: createForm.issue_warehouse_id?.trim() || null,
        receipt_warehouse_id: createForm.receipt_warehouse_id?.trim() || null,
        planned_quantity: Number(createForm.planned_quantity),
        order_uom: createForm.order_uom?.trim() || null,
        planned_start_at: createForm.planned_start_at?.trim() || null,
        planned_end_at: createForm.planned_end_at?.trim() || null,
        notes: createForm.notes?.trim() || null,
      })

      setCreateOpen(false)
      toast({
        title: copy.list.createSuccessTitle,
        description: copy.list.createSuccessDescription(snapshot.order.order_no),
      })

      await loadOrders(appliedFilters)
      router.push(`/manufacturing/production-orders/${snapshot.order.id}`)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: copy.list.createErrorTitle,
        description: error?.message || copy.list.createErrorDescription,
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <PageGuard resource="manufacturing_boms">
      <div
        dir={getTextDirection(appLang)}
        className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.10),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]"
      >
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-12 pt-20 md:px-8 md:pt-10">
          <Card className="overflow-hidden border-slate-200/70 shadow-lg shadow-slate-200/50">
            <CardHeader className="border-b bg-white/80 backdrop-blur">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
                    <Factory className="h-3.5 w-3.5" />
                    {copy.list.pill}
                  </div>
                  <CardTitle className="text-2xl font-semibold text-slate-900">{copy.list.title}</CardTitle>
                  <CardDescription className="max-w-3xl text-sm leading-6 text-slate-600">
                    {copy.list.description}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" onClick={() => loadOrders(appliedFilters)} disabled={loading} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    {copy.list.refresh}
                  </Button>
                  <Button onClick={handleOpenCreate} disabled={!canWrite} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {copy.list.create}
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 p-6">
              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 lg:grid-cols-[1.4fr,1fr,1fr,1fr,auto]">
                <div className="space-y-2">
                  <Label>{copy.list.search}</Label>
                  <Input
                    value={filterForm.q || ""}
                    onChange={(event) => setFilterForm((current) => ({ ...current, q: event.target.value }))}
                    placeholder={copy.list.searchPlaceholder}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{copy.list.branchId}</Label>
                  <Input
                    value={filterForm.branchId || ""}
                    onChange={(event) => setFilterForm((current) => ({ ...current, branchId: event.target.value }))}
                    placeholder={copy.common.noValue}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{copy.list.productId}</Label>
                  <Input
                    value={filterForm.productId || ""}
                    onChange={(event) => setFilterForm((current) => ({ ...current, productId: event.target.value }))}
                    placeholder={copy.common.noValue}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{copy.list.status}</Label>
                  <Select
                    value={filterForm.status || "all"}
                    onValueChange={(value) =>
                      setFilterForm((current) => ({ ...current, status: value as ProductionOrderListFilters["status"] }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={copy.list.all} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{copy.list.all}</SelectItem>
                      {PRODUCTION_ORDER_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {getProductionOrderStatusLabel(status, appLang)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={handleApplyFilters} className="w-full">
                    {copy.list.apply}
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-cyan-200 bg-cyan-50/80">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Factory className="h-8 w-8 text-cyan-700" />
                    <div>
                      <div className="text-2xl font-semibold text-slate-900">{orders.length}</div>
                      <div className="text-sm text-slate-600">{copy.list.statsShown}</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-indigo-200 bg-indigo-50/80">
                  <CardContent className="flex items-center gap-3 p-4">
                    <PlayCircle className="h-8 w-8 text-indigo-700" />
                    <div>
                      <div className="text-2xl font-semibold text-slate-900">{openOrdersCount}</div>
                      <div className="text-sm text-slate-600">{copy.list.statsOpen}</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-emerald-200 bg-emerald-50/80">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Package2 className="h-8 w-8 text-emerald-700" />
                    <div>
                      <div className="text-2xl font-semibold text-slate-900">{completedOrdersCount}</div>
                      <div className="text-sm text-slate-600">{copy.list.statsCompleted}</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-2xl border bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{copy.list.tableOrder}</TableHead>
                      <TableHead>{copy.list.tableOwner}</TableHead>
                      <TableHead>{copy.list.tableSource}</TableHead>
                      <TableHead>{copy.list.tableQuantity}</TableHead>
                      <TableHead>{copy.list.tableUpdated}</TableHead>
                      <TableHead>{copy.list.tableAction}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 4 }).map((_, index) => (
                        <TableRow key={`loading-${index}`}>
                          <TableCell colSpan={6} className="py-6 text-center text-slate-500">
                            {copy.list.loading}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-12 text-center">
                          <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
                            <Factory className="h-10 w-10 text-slate-300" />
                            <div className="text-lg font-medium text-slate-800">{copy.list.emptyTitle}</div>
                            <p className="text-sm leading-6 text-slate-500">{copy.list.emptyDescription}</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="align-top">
                            <div className="space-y-1">
                              <div className="font-medium text-slate-900">{order.order_no}</div>
                              <Badge variant={getProductionOrderStatusVariant(order.status)}>
                                {getProductionOrderStatusLabel(order.status, appLang)}
                              </Badge>
                              <div className="text-xs text-slate-500">
                                {copy.detail.branchId}: <span className="font-mono">{order.branch_id}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-sm text-slate-700">
                            {buildProductLabel(order.product, appLang)}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="space-y-1 text-sm text-slate-700">
                              <div>{buildBomLabel(order.bom, order.bom_version, appLang)}</div>
                              <div>{buildRoutingLabel(order.routing, order.routing_version, appLang)}</div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="space-y-1 text-sm text-slate-700">
                              <div>
                                {copy.detail.plannedQty}: {formatQuantity(order.planned_quantity, appLang)}
                              </div>
                              <div>
                                {copy.detail.completedQty}: {formatQuantity(order.completed_quantity, appLang)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-sm text-slate-600">
                            {formatDateTime(order.updated_at, appLang)}
                          </TableCell>
                          <TableCell className="align-top">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => router.push(`/manufacturing/production-orders/${order.id}`)}
                            >
                              <ArrowUpRight className="h-4 w-4" />
                              {copy.list.open}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{copy.list.createDialogTitle}</DialogTitle>
            <CardDescription>{copy.list.createDialogDescription}</CardDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm leading-6 text-amber-900">
                {copy.common.idOnlyHint}
                <div className="mt-1 text-xs text-amber-700">{copy.list.fields.branchHint}</div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{copy.list.fields.branchId}</Label>
              <Input
                value={createForm.branch_id || ""}
                onChange={(event) => setCreateForm((current) => ({ ...current, branch_id: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.list.fields.productId}</Label>
              <Input
                value={createForm.product_id}
                onChange={(event) => setCreateForm((current) => ({ ...current, product_id: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.list.fields.bomId}</Label>
              <Input
                value={createForm.bom_id}
                onChange={(event) => setCreateForm((current) => ({ ...current, bom_id: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.list.fields.bomVersionId}</Label>
              <Input
                value={createForm.bom_version_id}
                onChange={(event) => setCreateForm((current) => ({ ...current, bom_version_id: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.list.fields.routingId}</Label>
              <Input
                value={createForm.routing_id}
                onChange={(event) => setCreateForm((current) => ({ ...current, routing_id: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.list.fields.routingVersionId}</Label>
              <Input
                value={createForm.routing_version_id}
                onChange={(event) => setCreateForm((current) => ({ ...current, routing_version_id: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.list.fields.issueWarehouseId}</Label>
              <Input
                value={createForm.issue_warehouse_id || ""}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, issue_warehouse_id: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.list.fields.receiptWarehouseId}</Label>
              <Input
                value={createForm.receipt_warehouse_id || ""}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, receipt_warehouse_id: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.list.fields.plannedQuantity}</Label>
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={String(createForm.planned_quantity)}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    planned_quantity: Number(event.target.value || 0),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.list.fields.orderUom}</Label>
              <Input
                value={createForm.order_uom || ""}
                onChange={(event) => setCreateForm((current) => ({ ...current, order_uom: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.list.fields.plannedStartAt}</Label>
              <Input
                type="datetime-local"
                value={createForm.planned_start_at || ""}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, planned_start_at: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{copy.list.fields.plannedEndAt}</Label>
              <Input
                type="datetime-local"
                value={createForm.planned_end_at || ""}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, planned_end_at: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>{copy.list.fields.notes}</Label>
              <Textarea
                value={createForm.notes || ""}
                onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))}
                rows={4}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              {copy.common.cancel}
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? copy.common.loadingAction : copy.list.create}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageGuard>
  )
}
