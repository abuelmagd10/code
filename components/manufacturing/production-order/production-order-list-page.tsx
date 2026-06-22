"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, ChevronDown, ChevronUp, Factory, Package2, PlayCircle, Plus, RefreshCw, Zap } from "lucide-react"
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
  BranchSelector,
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
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [autoCascading, setAutoCascading] = useState(false)

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
    setShowAdvanced(false)
    setCreateOpen(true)
  }

  // ── Auto-cascade Phase 3: عند اختيار منتج → حمّل BOM + Routing تلقائياً
  useEffect(() => {
    const productId = createForm.product_id
    if (!productId || !createOpen) return

    let cancelled = false
    setAutoCascading(true)

    const fetchAndCascade = async () => {
      try {
        const [bomsRes, routingsRes] = await Promise.all([
          fetch(`/api/manufacturing/boms?product_id=${productId}&is_active=true`),
          fetch(`/api/manufacturing/routings?product_id=${productId}&is_active=true`),
        ])
        const bomsData = await bomsRes.json()
        const routingsData = await routingsRes.json()
        if (cancelled) return

        const boms: { id: string; source_warehouse_id?: string | null }[] = Array.isArray(bomsData?.data) ? bomsData.data : []
        const routings: { id: string; bom_id?: string | null }[] = Array.isArray(routingsData?.data) ? routingsData.data : []

        setCreateForm((c) => {
          // Auto-select BOM only if exactly one exists and none is selected
          const newBomId = boms.length === 1 && !c.bom_id ? boms[0].id : c.bom_id
          const bomChanged = newBomId !== c.bom_id

          // Phase 3: if BOM changed, inherit its default issue warehouse
          const selectedBom = boms.find((b) => b.id === newBomId)
          const newIssueWarehouse = bomChanged && selectedBom?.source_warehouse_id && !c.issue_warehouse_id
            ? selectedBom.source_warehouse_id
            : c.issue_warehouse_id

          // Auto-select routing: prefer one linked to selected BOM via bom_id, else if exactly one total
          const bomLinkedRoutings = routings.filter((r) => r.bom_id === newBomId)
          let newRoutingId = c.routing_id
          if (!c.routing_id) {
            if (bomLinkedRoutings.length === 1) newRoutingId = bomLinkedRoutings[0].id
            else if (routings.length === 1) newRoutingId = routings[0].id
          }
          const routingChanged = newRoutingId !== c.routing_id

          const changed = bomChanged || routingChanged || newIssueWarehouse !== c.issue_warehouse_id
          if (!changed) return c

          // Auto-open Advanced panel if warehouse was filled
          if (newIssueWarehouse && newIssueWarehouse !== c.issue_warehouse_id) {
            setShowAdvanced(true)
          }

          return {
            ...c,
            bom_id: newBomId,
            bom_version_id: bomChanged ? "" : c.bom_version_id,
            routing_id: newRoutingId,
            routing_version_id: routingChanged ? "" : c.routing_version_id,
            issue_warehouse_id: newIssueWarehouse,
          }
        })
      } catch {
        // silent — user can still select manually
      } finally {
        if (!cancelled) setAutoCascading(false)
      }
    }
    fetchAndCascade()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createForm.product_id, createOpen])

  // ── Auto-cascade Phase 3: عند تغيير bom_id → اجلب مستودع الصرف والـ Routing المرتبط
  useEffect(() => {
    const bomId = createForm.bom_id
    if (!bomId || !createOpen) return

    let cancelled = false

    const cascadeFromBom = async () => {
      try {
        const [bomRes, routingsRes] = await Promise.all([
          fetch(`/api/manufacturing/boms/${bomId}`),
          fetch(`/api/manufacturing/routings?bom_id=${bomId}&is_active=true`),
        ])
        const bomData = await bomRes.json()
        const routingsData = await routingsRes.json()
        if (cancelled) return

        const bom = bomData?.data
        const routings: { id: string }[] = Array.isArray(routingsData?.data) ? routingsData.data : []

        setCreateForm((c) => {
          if (c.bom_id !== bomId) return c // stale
          const newIssueWarehouse = !c.issue_warehouse_id && bom?.source_warehouse_id
            ? bom.source_warehouse_id
            : c.issue_warehouse_id

          // auto-select routing linked to this BOM if exactly one and none selected
          const newRoutingId = routings.length === 1 && !c.routing_id ? routings[0].id : c.routing_id
          const routingChanged = newRoutingId !== c.routing_id

          if (newIssueWarehouse !== c.issue_warehouse_id || routingChanged) {
            if (newIssueWarehouse !== c.issue_warehouse_id) setShowAdvanced(true)
            return {
              ...c,
              issue_warehouse_id: newIssueWarehouse,
              routing_id: newRoutingId,
              routing_version_id: routingChanged ? "" : c.routing_version_id,
            }
          }
          return c
        })
      } catch {
        // silent
      }
    }
    cascadeFromBom()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createForm.bom_id, createOpen])

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
                  <BranchSelector
                    value={filterForm.branchId || ""}
                    onChange={(branchId) => setFilterForm((current) => ({ ...current, branchId }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{copy.list.productId}</Label>
                  <ManufacturingProductSelector
                    value={filterForm.productId || ""}
                    onChange={(productId) => setFilterForm((current) => ({ ...current, productId }))}
                    productType="manufactured"
                    placeholder="اختر المنتج..."
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

          {/* ── Auto-cascade indicator ── */}
          {autoCascading && (
            <div className="flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-400">
              <Zap className="h-4 w-4 animate-pulse" />
              {appLang === "ar" ? "بنحضّر قائمة المكوّنات والمسار تلقائياً..." : "Auto-loading BOMs and routings..."}
            </div>
          )}

          {/* v3.74.276 — الفورم المبسّط: 3 حقول ظاهرة فقط (المنتج + الكمية + الفرع) */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-sm font-semibold">
                {appLang === "ar" ? "المنتج المراد تصنيعه" : "Product to Manufacture"} <span className="text-red-500">*</span>
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
                placeholder={appLang === "ar" ? "اختر المنتج النهائى" : "Select finished product"}
              />
              <p className="text-xs text-muted-foreground">
                {appLang === "ar"
                  ? "هنختار قائمة المكوّنات والمسار تلقائياً لو فى واحد لكل منهم. لو فى اختيارات متعددة، هنطلب منك التحديد."
                  : "We'll auto-pick the BOM and routing if there's only one. If there are multiple, we'll prompt you to choose."}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {copy.list.fields.plannedQuantity} <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={String(createForm.planned_quantity)}
                onChange={(event) => setCreateForm((current) => ({ ...current, planned_quantity: Number(event.target.value || 0) }))}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">
                {appLang === "ar" ? "الفرع" : "Branch"}
              </Label>
              <BranchSelector
                value={createForm.branch_id || ""}
                onChange={(branchId) => setCreateForm((c) => ({
                  ...c,
                  branch_id: branchId,
                  issue_warehouse_id: "",
                  receipt_warehouse_id: "",
                }))}
                placeholder={appLang === "ar" ? "الفرع الحالى" : "Current branch"}
              />
            </div>
          </div>

          {/* v3.74.276 — selectors المخفية تظهر تلقائياً لو الـ cascade ما لقاش خيار واحد */}
          {createForm.product_id && (
            <details className="group rounded-lg border border-slate-200 dark:border-slate-700" open={!createForm.bom_id || !createForm.bom_version_id || !createForm.routing_id || !createForm.routing_version_id}>
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 list-none flex items-center justify-between">
                <span className="flex items-center gap-2">
                  📋 {appLang === "ar" ? "قائمة المكوّنات والمسار" : "BOM & Routing"}
                  {createForm.bom_id && createForm.bom_version_id && createForm.routing_id && createForm.routing_version_id ? (
                    <Badge variant="secondary" className="text-xs">{appLang === "ar" ? "تم الاختيار تلقائياً" : "Auto-picked"}</Badge>
                  ) : (
                    <span className="text-xs text-amber-600 font-normal">({appLang === "ar" ? "محتاج اختيار يدوى" : "manual pick needed"})</span>
                  )}
                </span>
                <span className="text-slate-400 group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="grid gap-4 sm:grid-cols-2 p-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    {appLang === "ar" ? "قائمة المكوّنات" : "Bill of Materials"} <span className="text-red-500">*</span>
                  </Label>
                  <BomSelector
                    value={createForm.bom_id}
                    onChange={(id, bom) => {
                      setCreateForm((c) => ({
                        ...c,
                        bom_id: id,
                        bom_version_id: "",
                        issue_warehouse_id: !c.issue_warehouse_id && bom?.source_warehouse_id ? bom.source_warehouse_id : c.issue_warehouse_id,
                        routing_id: id !== c.bom_id ? "" : c.routing_id,
                        routing_version_id: id !== c.bom_id ? "" : c.routing_version_id,
                      }))
                    }}
                    productId={createForm.product_id}
                    placeholder={appLang === "ar" ? "اختر قائمة المكوّنات" : "Select BOM"}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    {appLang === "ar" ? "إصدار القائمة" : "BOM Version"} <span className="text-red-500">*</span>
                  </Label>
                  <BomVersionSelector
                    value={createForm.bom_version_id}
                    onChange={(id) => setCreateForm((c) => ({ ...c, bom_version_id: id }))}
                    bomId={createForm.bom_id}
                    placeholder={appLang === "ar" ? "الإصدار المعتمد" : "Approved version"}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    {appLang === "ar" ? "مسار التصنيع" : "Routing"} <span className="text-red-500">*</span>
                  </Label>
                  <RoutingSelector
                    value={createForm.routing_id}
                    onChange={(id) => setCreateForm((c) => ({ ...c, routing_id: id, routing_version_id: "" }))}
                    bomId={createForm.bom_id || undefined}
                    productId={createForm.product_id || undefined}
                    placeholder={appLang === "ar" ? "اختر المسار" : "Select routing"}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">
                    {appLang === "ar" ? "إصدار المسار" : "Routing Version"} <span className="text-red-500">*</span>
                  </Label>
                  <RoutingVersionSelector
                    value={createForm.routing_version_id}
                    onChange={(id) => setCreateForm((c) => ({ ...c, routing_version_id: id }))}
                    routingId={createForm.routing_id}
                    placeholder={appLang === "ar" ? "الإصدار المعتمد" : "Approved version"}
                  />
                </div>
              </div>
            </details>
          )}

          {/* ── الإعدادات المتقدمة (قابلة للطي) — المستودعات/التواريخ/الملاحظات */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              <span className="flex items-center gap-2">
                {showAdvanced
                  ? <ChevronUp className="h-4 w-4" />
                  : <ChevronDown className="h-4 w-4" />}
                ⚙️ {appLang === "ar" ? "إعدادات متقدمة (المستودعات، التواريخ، الملاحظات)" : "Advanced Settings (Warehouses, Dates, Notes)"}
              </span>
              {(createForm.issue_warehouse_id || createForm.receipt_warehouse_id || createForm.planned_start_at || createForm.planned_end_at || createForm.notes) && (
                <Badge variant="secondary" className="text-xs">{appLang === "ar" ? "تم التعبئة" : "Filled"}</Badge>
              )}
            </button>

            {showAdvanced && (
              <div className="grid gap-4 sm:grid-cols-2 border-t border-slate-200 dark:border-slate-700 px-4 py-4">
                <div className="space-y-2">
                  <Label>{appLang === "ar" ? "مستودع الصرف (المواد الخام)" : "Issue Warehouse (Raw Materials)"}</Label>
                  <WarehouseSelector
                    value={createForm.issue_warehouse_id || ""}
                    onChange={(id) => setCreateForm((c) => ({ ...c, issue_warehouse_id: id }))}
                    placeholder={appLang === "ar" ? "مستودع سحب المواد الخام" : "Raw materials warehouse"}
                    branchId={createForm.branch_id || undefined}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{appLang === "ar" ? "مستودع الاستلام (المنتج النهائى)" : "Receipt Warehouse (Finished Goods)"}</Label>
                  <WarehouseSelector
                    value={createForm.receipt_warehouse_id || ""}
                    onChange={(id) => setCreateForm((c) => ({ ...c, receipt_warehouse_id: id }))}
                    placeholder={appLang === "ar" ? "مستودع إضافة المنتج النهائى" : "Finished goods warehouse"}
                    branchId={createForm.branch_id || undefined}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{copy.list.fields.plannedStartAt}</Label>
                  <Input
                    type="datetime-local"
                    value={createForm.planned_start_at || ""}
                    onChange={(event) => setCreateForm((current) => ({ ...current, planned_start_at: event.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{copy.list.fields.plannedEndAt}</Label>
                  <Input
                    type="datetime-local"
                    value={createForm.planned_end_at || ""}
                    onChange={(event) => setCreateForm((current) => ({ ...current, planned_end_at: event.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{copy.list.fields.notes}</Label>
                  <Textarea
                    value={createForm.notes || ""}
                    onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))}
                    rows={3}
                  />
                </div>
              </div>
            )}
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
