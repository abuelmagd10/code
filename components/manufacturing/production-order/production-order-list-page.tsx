"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Factory, Package2, PlayCircle, Plus, RefreshCw } from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { ERPPageHeader } from "@/components/erp-page-header"
import { FilterContainer } from "@/components/ui/filter-container"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ManufacturingProductSelector,
  BomSelector,
  BomVersionSelector,
  RoutingSelector,
  RoutingVersionSelector,
  WarehouseSelector,
} from "@/components/manufacturing/manufacturing-selectors"
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
import { ManufacturingGuide } from "@/components/manufacturing/manufacturing-guide"

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

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (appliedFilters.branchId && appliedFilters.branchId.trim() !== "") count++
    if (appliedFilters.productId && appliedFilters.productId.trim() !== "") count++
    if (appliedFilters.status && appliedFilters.status !== "all") count++
    if (appliedFilters.q && appliedFilters.q.trim() !== "") count++
    return count
  }, [appliedFilters])

  return (
    <PageGuard resource="manufacturing_boms">
      <div dir={getTextDirection(appLang)} className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <CompanyHeader />

          {/* ── دليل دورة التصنيع ── */}
          <ManufacturingGuide
            currentStep="production_order"
            completedSteps={["products", "bom", "bom_version", "approve"]}
            lang={appLang === "ar" ? "ar" : "en"}
            pageInfo={{
              titleAr: "أوامر الإنتاج — ابدأ التصنيع",
              titleEn: "Production Orders — Start Manufacturing",
              descAr: "أمر الإنتاج هو الطلب الرسمي لتصنيع كمية محددة من منتج معين. بعد إصداره، يصرف النظام المواد من المخزن ويضيف المنتج النهائي بعد الانتهاء.",
              descEn: "A production order is the formal request to manufacture a specific quantity. After release, the system issues raw materials and receives finished goods.",
              whenAr: "عندما يطلب العميل كمية من منتج معين. تأكد أن قائمة المواد معتمدة قبل إنشاء أمر الإنتاج.",
              whenEn: "When a customer orders a product that needs to be manufactured. Ensure the BOM is approved before creating the order.",
              nextStepId: "material_issue",
            }}
          />

          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <ERPPageHeader
              title={copy.list.title}
              description={copy.list.description}
              variant="list"
              extra={
                <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
                  <Factory className="h-3.5 w-3.5" />
                  {copy.list.pill}
                </div>
              }
              actions={
                <>
                  <Button variant="outline" onClick={() => loadOrders(appliedFilters)} disabled={loading} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    {copy.list.refresh}
                  </Button>
                  <Button onClick={handleOpenCreate} disabled={!canWrite} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {copy.list.create}
                  </Button>
                </>
              }
            />
          </div>

        <FilterContainer
          title={copy.list.search}
          activeCount={activeFilterCount}
          onClear={() => {
            setFilterForm({ branchId: "", productId: "", status: "all", q: "" })
            setAppliedFilters({ branchId: "", productId: "", status: "all", q: "" })
          }}
          defaultOpen={false}
        >
          <div className="grid gap-3 lg:grid-cols-[1.4fr,1fr,1fr,1fr,auto]">
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
        </FilterContainer>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
                <Factory className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{copy.list.statsShown}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{orders.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <PlayCircle className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{copy.list.statsOpen}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{openOrdersCount}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <Package2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{copy.list.statsCompleted}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{completedOrdersCount}</p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-0 overflow-hidden">
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
        </Card>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{copy.list.createDialogTitle}</DialogTitle>
            <CardDescription>{copy.list.createDialogDescription}</CardDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* ── 1. المنتج المراد تصنيعه ── */}
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-sm font-semibold">
                {appLang === "ar" ? "١. المنتج المراد تصنيعه" : "1. Product to Manufacture"}
              </Label>
              <ManufacturingProductSelector
                value={createForm.product_id}
                onChange={(id) =>
                  setCreateForm((c) => ({
                    ...c,
                    product_id: id,
                    bom_id: "",
                    bom_version_id: "",
                    routing_id: "",
                    routing_version_id: "",
                  }))
                }
                productType="manufactured"
                placeholder={appLang === "ar" ? "اختر المنتج النهائي المراد تصنيعه" : "Select finished product"}
              />
            </div>

            {/* ── 2. قائمة المواد ── */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {appLang === "ar" ? "٢. قائمة المواد (الوصفة)" : "2. Bill of Materials"}
              </Label>
              <BomSelector
                value={createForm.bom_id}
                onChange={(id) =>
                  setCreateForm((c) => ({ ...c, bom_id: id, bom_version_id: "" }))
                }
                productId={createForm.product_id}
                placeholder={appLang === "ar" ? "اختر قائمة المواد" : "Select BOM"}
              />
            </div>

            {/* ── 3. إصدار قائمة المواد ── */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {appLang === "ar" ? "٣. إصدار قائمة المواد" : "3. BOM Version"}
              </Label>
              <BomVersionSelector
                value={createForm.bom_version_id}
                onChange={(id) => setCreateForm((c) => ({ ...c, bom_version_id: id }))}
                bomId={createForm.bom_id}
                placeholder={appLang === "ar" ? "اختر الإصدار المعتمد" : "Select approved version"}
              />
            </div>

            {/* ── 4. مسار التصنيع ── */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {appLang === "ar" ? "٤. مسار التصنيع" : "4. Routing"}
              </Label>
              <RoutingSelector
                value={createForm.routing_id}
                onChange={(id) =>
                  setCreateForm((c) => ({ ...c, routing_id: id, routing_version_id: "" }))
                }
                productId={createForm.product_id}
                placeholder={appLang === "ar" ? "اختر مسار التصنيع" : "Select routing"}
              />
            </div>

            {/* ── 5. إصدار مسار التصنيع ── */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {appLang === "ar" ? "٥. إصدار المسار" : "5. Routing Version"}
              </Label>
              <RoutingVersionSelector
                value={createForm.routing_version_id}
                onChange={(id) => setCreateForm((c) => ({ ...c, routing_version_id: id }))}
                routingId={createForm.routing_id}
                placeholder={appLang === "ar" ? "اختر إصدار المسار" : "Select routing version"}
              />
            </div>

            {/* ── 6. مستودع الصرف ── */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {appLang === "ar" ? "٦. مستودع الصرف (المواد الخام)" : "6. Issue Warehouse (Raw Materials)"}
              </Label>
              <WarehouseSelector
                value={createForm.issue_warehouse_id || ""}
                onChange={(id) => setCreateForm((c) => ({ ...c, issue_warehouse_id: id }))}
                placeholder={appLang === "ar" ? "مستودع سحب المواد الخام" : "Raw materials warehouse"}
              />
            </div>

            {/* ── 7. مستودع الاستلام ── */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {appLang === "ar" ? "٧. مستودع الاستلام (المنتج النهائي)" : "7. Receipt Warehouse (Finished Goods)"}
              </Label>
              <WarehouseSelector
                value={createForm.receipt_warehouse_id || ""}
                onChange={(id) => setCreateForm((c) => ({ ...c, receipt_warehouse_id: id }))}
                placeholder={appLang === "ar" ? "مستودع إضافة المنتج النهائي" : "Finished goods warehouse"}
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
        </main>
      </div>
    </PageGuard>
  )
}
