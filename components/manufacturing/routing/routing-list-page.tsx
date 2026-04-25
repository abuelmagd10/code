"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Factory, GitBranch, Package2, Plus, RefreshCw, Search } from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { useAccess } from "@/lib/access-context"
import {
  ROUTING_USAGE_OPTIONS,
  type RoutingCreatePayload,
  type RoutingListFilters,
  type RoutingListItem,
  buildProductLabel,
  createRouting,
  fetchRoutingList,
  formatDateTime,
  getRoutingVersionStatusLabel,
  getRoutingVersionStatusVariant,
} from "@/lib/manufacturing/routing-ui"

const EMPTY_CREATE_FORM: RoutingCreatePayload = {
  branch_id: "",
  product_id: "",
  routing_code: "",
  routing_name: "",
  routing_usage: "production",
  description: "",
  is_active: true,
}

function getFeaturedVersion(routing: RoutingListItem) {
  return routing.versions.find((version) => version.status === "active") || routing.versions[0] || null
}

export function RoutingListPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { canAction, isReady: accessReady } = useAccess()

  const canRead = accessReady ? canAction("manufacturing_boms", "read") : false
  const canWrite = accessReady ? canAction("manufacturing_boms", "write") : false

  const [routings, setRoutings] = useState<RoutingListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [filterForm, setFilterForm] = useState<RoutingListFilters>({
    branchId: "",
    productId: "",
    routingUsage: "all",
    isActive: "all",
    q: "",
  })
  const [appliedFilters, setAppliedFilters] = useState<RoutingListFilters>({
    branchId: "",
    productId: "",
    routingUsage: "all",
    isActive: "all",
    q: "",
  })
  const [createForm, setCreateForm] = useState<RoutingCreatePayload>(EMPTY_CREATE_FORM)

  const loadRoutings = useCallback(async (filters: RoutingListFilters) => {
    try {
      setLoading(true)
      const result = await fetchRoutingList(filters)
      setRoutings(result.items)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر تحميل Routing list",
        description: error?.message || "حدث خطأ أثناء تحميل القائمة",
      })
      setRoutings([])
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (!canRead) return
    loadRoutings(appliedFilters)
  }, [appliedFilters, canRead, loadRoutings])

  const handleApplyFilters = () => {
    setAppliedFilters({
      branchId: filterForm.branchId?.trim() || "",
      productId: filterForm.productId?.trim() || "",
      routingUsage: filterForm.routingUsage || "all",
      isActive: filterForm.isActive || "all",
      q: filterForm.q || "",
    })
  }

  const handleCreate = async () => {
    if (!createForm.product_id.trim() || !createForm.routing_code.trim() || !createForm.routing_name.trim()) {
      toast({
        variant: "destructive",
        title: "البيانات الأساسية غير مكتملة",
        description: "product_id وrouting_code وrouting_name مطلوبة قبل الإنشاء.",
      })
      return
    }

    try {
      setCreating(true)
      const created = await createRouting({
        ...createForm,
        branch_id: createForm.branch_id?.trim() || null,
        product_id: createForm.product_id.trim(),
        routing_code: createForm.routing_code.trim(),
        routing_name: createForm.routing_name.trim(),
        description: createForm.description?.trim() || null,
      })

      toast({
        title: "تم إنشاء Routing",
        description: `${created.routing_code} جاهزة الآن لإدارة النسخ والعمليات.`,
      })

      setCreateOpen(false)
      setCreateForm(EMPTY_CREATE_FORM)
      await loadRoutings(appliedFilters)
      router.push(`/manufacturing/routings/${created.id}`)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر إنشاء Routing",
        description: error?.message || "حدث خطأ أثناء الإنشاء",
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <PageGuard resource="manufacturing_boms">
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(8,145,178,0.08),_transparent_30%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]">
        <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-12 pt-20 md:px-8 md:pt-10">
          <Card className="overflow-hidden border-slate-200/70 shadow-lg shadow-slate-200/40">
            <CardHeader className="border-b bg-white/80 backdrop-blur">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
                    <Factory className="h-3.5 w-3.5" />
                    Routing Engine
                  </div>
                  <CardTitle className="text-2xl font-semibold text-slate-900">مسارات التشغيل Routing</CardTitle>
                  <CardDescription className="max-w-2xl text-sm leading-6 text-slate-600">
                    هذه الصفحة تعرض routing headers وتفتح صفحة التفاصيل لإدارة النسخ والعمليات وتفعيل النسخ عبر B6 APIs فقط.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" onClick={() => loadRoutings(appliedFilters)} disabled={loading} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    تحديث
                  </Button>
                  <Button onClick={() => setCreateOpen(true)} disabled={!canWrite} className="gap-2">
                    <Plus className="h-4 w-4" />
                    إنشاء Routing
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 p-6">
              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 lg:grid-cols-[1.2fr,1.2fr,1fr,1fr,1fr,auto]">
                <div className="space-y-2">
                  <Label>بحث سريع</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={filterForm.q || ""}
                      onChange={(event) => setFilterForm((current) => ({ ...current, q: event.target.value }))}
                      placeholder="ابحث بالكود أو الاسم"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Branch ID</Label>
                  <Input
                    value={filterForm.branchId || ""}
                    onChange={(event) => setFilterForm((current) => ({ ...current, branchId: event.target.value }))}
                    placeholder="اختياري"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Product ID</Label>
                  <Input
                    value={filterForm.productId || ""}
                    onChange={(event) => setFilterForm((current) => ({ ...current, productId: event.target.value }))}
                    placeholder="اختياري"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Routing Usage</Label>
                  <Select
                    value={filterForm.routingUsage || "all"}
                    onValueChange={(value) => setFilterForm((current) => ({ ...current, routingUsage: value as RoutingListFilters["routingUsage"] }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="الكل" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      {ROUTING_USAGE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.labelAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الحالة</Label>
                  <Select
                    value={filterForm.isActive || "all"}
                    onValueChange={(value) => setFilterForm((current) => ({ ...current, isActive: value as RoutingListFilters["isActive"] }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="الكل" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      <SelectItem value="true">نشط</SelectItem>
                      <SelectItem value="false">غير نشط</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={handleApplyFilters} className="w-full gap-2">
                    <Search className="h-4 w-4" />
                    تطبيق
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-cyan-200 bg-cyan-50/80">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Factory className="h-8 w-8 text-cyan-700" />
                    <div>
                      <div className="text-2xl font-semibold text-slate-900">{routings.length}</div>
                      <div className="text-sm text-slate-600">Routing headers المعروضة</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-indigo-200 bg-indigo-50/80">
                  <CardContent className="flex items-center gap-3 p-4">
                    <GitBranch className="h-8 w-8 text-indigo-700" />
                    <div>
                      <div className="text-2xl font-semibold text-slate-900">
                        {routings.reduce((sum, routing) => sum + routing.versions.length, 0)}
                      </div>
                      <div className="text-sm text-slate-600">إجمالي النسخ المرتبطة</div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-emerald-200 bg-emerald-50/80">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Package2 className="h-8 w-8 text-emerald-700" />
                    <div>
                      <div className="text-2xl font-semibold text-slate-900">
                        {routings.filter((routing) => routing.is_active).length}
                      </div>
                      <div className="text-sm text-slate-600">Headers النشطة حاليًا</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="rounded-2xl border bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الكود / الاسم</TableHead>
                      <TableHead>المنتج</TableHead>
                      <TableHead>Branch ID</TableHead>
                      <TableHead>الاستخدام</TableHead>
                      <TableHead>النسخة البارزة</TableHead>
                      <TableHead>آخر تحديث</TableHead>
                      <TableHead className="text-left">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 4 }).map((_, index) => (
                        <TableRow key={`loading-${index}`}>
                          <TableCell colSpan={7} className="py-6 text-center text-slate-500">
                            جاري تحميل Routing list...
                          </TableCell>
                        </TableRow>
                      ))
                    ) : routings.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center">
                          <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
                            <Factory className="h-10 w-10 text-slate-300" />
                            <div className="text-lg font-medium text-slate-800">لا توجد Routing مطابقة</div>
                            <p className="text-sm leading-6 text-slate-500">
                              يمكنك تعديل الفلاتر أو إنشاء Routing جديدة من الزر أعلى الصفحة.
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      routings.map((routing) => {
                        const featuredVersion = getFeaturedVersion(routing)

                        return (
                          <TableRow key={routing.id}>
                            <TableCell className="align-top">
                              <div className="space-y-1">
                                <div className="font-medium text-slate-900">{routing.routing_code}</div>
                                <div className="text-sm text-slate-600">{routing.routing_name}</div>
                                <div className="flex flex-wrap gap-2 pt-1">
                                  <Badge variant={routing.is_active ? "default" : "outline"}>
                                    {routing.is_active ? "نشط" : "غير نشط"}
                                  </Badge>
                                  <Badge variant="outline">{routing.versions.length} versions</Badge>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="max-w-xs whitespace-normal text-sm text-slate-700">
                                {buildProductLabel(routing.product)}
                              </div>
                            </TableCell>
                            <TableCell className="align-top text-sm text-slate-600">
                              <span className="font-mono text-xs">{routing.branch_id}</span>
                            </TableCell>
                            <TableCell className="align-top">
                              <Badge variant="outline">
                                {ROUTING_USAGE_OPTIONS.find((option) => option.value === routing.routing_usage)?.labelAr || routing.routing_usage}
                              </Badge>
                            </TableCell>
                            <TableCell className="align-top">
                              {featuredVersion ? (
                                <div className="space-y-1">
                                  <div className="font-medium text-slate-900">v{featuredVersion.version_no}</div>
                                  <Badge variant={getRoutingVersionStatusVariant(featuredVersion.status)}>
                                    {getRoutingVersionStatusLabel(featuredVersion.status)}
                                  </Badge>
                                </div>
                              ) : (
                                <span className="text-sm text-slate-400">لا توجد نسخ بعد</span>
                              )}
                            </TableCell>
                            <TableCell className="align-top text-sm text-slate-600">
                              {formatDateTime(routing.updated_at)}
                            </TableCell>
                            <TableCell className="align-top">
                              <Button
                                variant="outline"
                                className="gap-2"
                                onClick={() => router.push(`/manufacturing/routings/${routing.id}`)}
                              >
                                فتح
                                <ArrowUpRight className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </main>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>إنشاء Routing جديدة</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Branch ID</Label>
                <Input
                  value={createForm.branch_id || ""}
                  onChange={(event) => setCreateForm((current) => ({ ...current, branch_id: event.target.value }))}
                  placeholder="اختياري إذا كان الفرع يحسم من العضوية"
                />
              </div>
              <div className="space-y-2">
                <Label>Owner Product ID</Label>
                <Input
                  value={createForm.product_id}
                  onChange={(event) => setCreateForm((current) => ({ ...current, product_id: event.target.value }))}
                  placeholder="UUID لمنتج manufactured"
                />
              </div>
              <div className="space-y-2">
                <Label>Routing Code</Label>
                <Input
                  value={createForm.routing_code}
                  onChange={(event) => setCreateForm((current) => ({ ...current, routing_code: event.target.value }))}
                  placeholder="ROUT-FG-001"
                />
              </div>
              <div className="space-y-2">
                <Label>Routing Name</Label>
                <Input
                  value={createForm.routing_name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, routing_name: event.target.value }))}
                  placeholder="Finished Goods Primary Route"
                />
              </div>
              <div className="space-y-2">
                <Label>Routing Usage</Label>
                <Select
                  value={createForm.routing_usage}
                  onValueChange={(value) => setCreateForm((current) => ({ ...current, routing_usage: value as RoutingCreatePayload["routing_usage"] }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUTING_USAGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.labelAr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                <div className="space-y-1">
                  <div className="font-medium text-slate-900">تفعيل Routing</div>
                  <div className="text-sm text-slate-500">يمكن تعطيل الـ header لاحقًا من صفحة التفاصيل.</div>
                </div>
                <Switch
                  checked={createForm.is_active}
                  onCheckedChange={(checked) => setCreateForm((current) => ({ ...current, is_active: Boolean(checked) }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>الوصف</Label>
                <Textarea
                  value={createForm.description || ""}
                  onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="ملاحظات عامة عن هذا المسار التشغيلي."
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? "جاري الإنشاء..." : "إنشاء Routing"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageGuard>
  )
}
