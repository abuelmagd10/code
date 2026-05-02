"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Factory, GitBranch, Package2, Plus, RefreshCw, Search } from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { ERPPageHeader } from "@/components/erp-page-header"
import { FilterContainer } from "@/components/ui/filter-container"
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
import { ManufacturingGuide } from "@/components/manufacturing/manufacturing-guide"

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
        title: "تعذّر تحميل مسارات التشغيل",
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
        description: "يجب تحديد المنتج وكود المسار واسمه قبل الإنشاء.",
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
        title: "تم إنشاء مسار التشغيل",
        description: `${created.routing_code} جاهزة الآن لإدارة النسخ والعمليات.`,
      })

      setCreateOpen(false)
      setCreateForm(EMPTY_CREATE_FORM)
      await loadRoutings(appliedFilters)
      router.push(`/manufacturing/routings/${created.id}`)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذّر إنشاء مسار التشغيل",
        description: error?.message || "حدث خطأ أثناء الإنشاء",
      })
    } finally {
      setCreating(false)
    }
  }

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (appliedFilters.branchId && appliedFilters.branchId.trim() !== "") count++
    if (appliedFilters.productId && appliedFilters.productId.trim() !== "") count++
    if (appliedFilters.routingUsage && appliedFilters.routingUsage !== "all") count++
    if (appliedFilters.isActive && appliedFilters.isActive !== "all") count++
    if (appliedFilters.q && appliedFilters.q.trim() !== "") count++
    return count
  }, [appliedFilters])

  return (
    <PageGuard resource="manufacturing_boms">
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <CompanyHeader />

          {/* ── دليل دورة التصنيع ── */}
          <ManufacturingGuide
            currentStep="bom"
            pageInfo={{
              titleAr: "مسارات التصنيع — تسلسل العمليات",
              titleEn: "Routings — Operation Sequence",
              descAr: "مسار التصنيع يحدد تسلسل العمليات المطلوبة لتحويل المواد الخام إلى منتج نهائي. مثلاً: خلط ← تشكيل ← تحزين — كل عملية لها وقت ومركز عمل محدد.",
              descEn: "A routing defines the sequence of operations needed to convert raw materials into a finished product.",
              whenAr: "استخدم هذه الصفحة عند تعريف خطوات التصنيع لمنتج معين. يستخدم المسار لاحقاً في أمر الإنتاج لتتبع وقت كل مرحلة.",
              whenEn: "Use this page when defining manufacturing steps for a product. The routing is later referenced in production orders to track each stage.",
              nextStepId: "production_order",
            }}
          />

          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <ERPPageHeader
              title="مسارات التصنيع (خطوات العمل)"
              description="حدد تسلسل العمليات اللازمة لتحويل المواد الخام إلى منتج نهائي"
              variant="list"
              extra={
                <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
                  <Factory className="h-3.5 w-3.5" />
                  مديول التصنيع
                </div>
              }
              actions={
                <>
                  <Button variant="outline" onClick={() => loadRoutings(appliedFilters)} disabled={loading} className="gap-2">
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    تحديث
                  </Button>
                  <Button onClick={() => setCreateOpen(true)} disabled={!canWrite} className="gap-2">
                    <Plus className="h-4 w-4" />
                    إنشاء مسار تصنيع جديد
                  </Button>
                </>
              }
            />
          </div>

        <FilterContainer
          title="الفلاتر"
          activeCount={activeFilterCount}
          onClear={() => {
            setFilterForm({ branchId: "", productId: "", routingUsage: "all", isActive: "all", q: "" })
            setAppliedFilters({ branchId: "", productId: "", routingUsage: "all", isActive: "all", q: "" })
          }}
          defaultOpen={false}
        >
          <div className="grid gap-3 lg:grid-cols-[1.2fr,1.2fr,1fr,1fr,1fr,auto]">
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
                  <Label>الفرع</Label>
                  <Input
                    value={filterForm.branchId || ""}
                    onChange={(event) => setFilterForm((current) => ({ ...current, branchId: event.target.value }))}
                    placeholder="اختياري"
                  />
                </div>
                <div className="space-y-2">
                  <Label>المنتج</Label>
                  <Input
                    value={filterForm.productId || ""}
                    onChange={(event) => setFilterForm((current) => ({ ...current, productId: event.target.value }))}
                    placeholder="اختياري"
                  />
                </div>
                <div className="space-y-2">
                  <Label>نوع الاستخدام</Label>
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
        </FilterContainer>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
                <Factory className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">مسارات التشغيل المعروضة</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{routings.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <GitBranch className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">إجمالي النسخ المرتبطة</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {routings.reduce((sum, routing) => sum + routing.versions.length, 0)}
                </p>
              </div>
            </div>
          </Card>
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <Package2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">مسارات التشغيل النشطة حاليًا</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {routings.filter((routing) => routing.is_active).length}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
                    <TableRow>
                      <TableHead>الكود / الاسم</TableHead>
                      <TableHead>المنتج</TableHead>
                      <TableHead>الفرع</TableHead>
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
                            جاري تحميل مسارات التشغيل...
                          </TableCell>
                        </TableRow>
                      ))
                    ) : routings.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center">
                          <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
                            <Factory className="h-10 w-10 text-slate-300" />
                            <div className="text-lg font-medium text-slate-800">لا توجد مسارات تشغيل مطابقة</div>
                            <p className="text-sm leading-6 text-slate-500">
                              يمكنك تعديل الفلاتر أو إنشاء مسار تشغيلي جديد من الزر أعلى الصفحة.
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
                                  <Badge variant="outline">{routing.versions.length} نسخة</Badge>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="max-w-xs whitespace-normal text-sm text-slate-700">
                                {buildProductLabel(routing.product)}
                              </div>
                            </TableCell>
                            <TableCell className="align-top text-sm text-slate-600">
                              <span className="text-slate-400">—</span>
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
        </Card>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>إنشاء مسار تصنيع جديد</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                مسار التصنيع يحدد خطوات العمل بالتسلسل لتحويل المواد إلى منتج. حدد العمليات ووقتها بعد الإنشاء.
              </p>
            </DialogHeader>
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label>الفرع (اختياري)</Label>
                <Input
                  value={createForm.branch_id || ""}
                  onChange={(event) => setCreateForm((current) => ({ ...current, branch_id: event.target.value }))}
                  placeholder="اختياري — اتركه فارغًا لاستخدام فرعك الحالي"
                />
              </div>
              <div className="space-y-2">
                <Label>المنتج المراد تصنيعه</Label>
                <Input
                  value={createForm.product_id}
                  onChange={(event) => setCreateForm((current) => ({ ...current, product_id: event.target.value }))}
                  placeholder="أدخل كود أو رقم المنتج المراد تصنيعه"
                />
              </div>
              <div className="space-y-2">
                <Label>كود مسار التشغيل</Label>
                <Input
                  value={createForm.routing_code}
                  onChange={(event) => setCreateForm((current) => ({ ...current, routing_code: event.target.value }))}
                  placeholder="ROUT-FG-001"
                />
              </div>
              <div className="space-y-2">
                <Label>اسم مسار التشغيل</Label>
                <Input
                  value={createForm.routing_name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, routing_name: event.target.value }))}
                  placeholder="مثال: مسار تشغيل المنتج النهائي"
                />
              </div>
              <div className="space-y-2">
                <Label>نوع الاستخدام</Label>
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
                  <div className="font-medium text-slate-900">تفعيل مسار التشغيل</div>
                  <div className="text-sm text-slate-500">يمكن تعطيله لاحقًا من صفحة التفاصيل.</div>
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
                {creating ? "جاري الإنشاء..." : "إنشاء مسار التشغيل"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </main>
      </div>
    </PageGuard>
  )
}
