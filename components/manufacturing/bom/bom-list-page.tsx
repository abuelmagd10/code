"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Factory, Plus, RefreshCw, Search, ArrowUpRight, GitBranch, Package2, Layers3 } from "lucide-react"
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
  BOM_USAGE_OPTIONS,
  type BomCreatePayload,
  type BomListFilters,
  type BomListItem,
  type BranchOption,
  type ProductOption,
  buildBranchLabel,
  buildProductLabel,
  createBom,
  fetchBomList,
  fetchBranchOptions,
  fetchManufacturingProductOptions,
  formatDateTime,
  getVersionStatusLabel,
  getVersionStatusVariant,
} from "@/lib/manufacturing/bom-ui"

const EMPTY_CREATE_FORM: BomCreatePayload = {
  branch_id: "",
  product_id: "",
  bom_code: "",
  bom_name: "",
  bom_usage: "production",
  description: "",
  is_active: true,
}

export function BomListPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { canAction, isReady: accessReady } = useAccess()

  const canRead = accessReady ? canAction("manufacturing_boms", "read") : false
  const canWrite = accessReady ? canAction("manufacturing_boms", "write") : false

  const [boms, setBoms] = useState<BomListItem[]>([])
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const [loading, setLoading] = useState(true)
  const [lookupsLoading, setLookupsLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const [filterForm, setFilterForm] = useState<BomListFilters>({
    branchId: "",
    bomUsage: "all",
    isActive: "all",
    q: "",
  })
  const [appliedFilters, setAppliedFilters] = useState<BomListFilters>({
    branchId: "",
    bomUsage: "all",
    isActive: "all",
    q: "",
  })
  const [createForm, setCreateForm] = useState<BomCreatePayload>(EMPTY_CREATE_FORM)

  const branchMap = useMemo(
    () => Object.fromEntries(branches.map((branch) => [branch.id, branch])),
    [branches]
  )

  // Show all products — but only "manufactured" type can own a BOM.
  // We validate the type on submit to give clear feedback without hiding options.
  const ownerProductOptions = useMemo(
    () =>
      products.filter(
        (product) =>
          product.item_type === "product" &&
          (!createForm.branch_id || !product.branch_id || product.branch_id === createForm.branch_id)
      ),
    [products, createForm.branch_id]
  )

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === createForm.product_id) || null,
    [products, createForm.product_id]
  )

  const loadLookups = useCallback(async () => {
    try {
      setLookupsLoading(true)
      const [branchOptions, productOptions] = await Promise.all([
        fetchBranchOptions(),
        fetchManufacturingProductOptions(),
      ])

      setBranches(branchOptions)
      setProducts(productOptions)

      setCreateForm((current) => {
        if (current.branch_id || branchOptions.length !== 1) return current
        return { ...current, branch_id: branchOptions[0].id }
      })

      setFilterForm((current) => {
        if (current.branchId || branchOptions.length !== 1) return current
        return { ...current, branchId: branchOptions[0].id }
      })
      setAppliedFilters((current) => {
        if (current.branchId || branchOptions.length !== 1) return current
        return { ...current, branchId: branchOptions[0].id }
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر تحميل بيانات BOM المرجعية",
        description: error?.message || "حدث خطأ أثناء تحميل الفروع والمنتجات",
      })
    } finally {
      setLookupsLoading(false)
    }
  }, [toast])

  const loadBoms = useCallback(async (filters: BomListFilters) => {
    try {
      setLoading(true)
      const result = await fetchBomList(filters)
      setBoms(result.items)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر تحميل هياكل BOM",
        description: error?.message || "حدث خطأ أثناء تحميل القائمة",
      })
      setBoms([])
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    loadLookups()
  }, [loadLookups])

  useEffect(() => {
    if (!canRead) return
    loadBoms(appliedFilters)
  }, [appliedFilters, canRead, loadBoms])

  const resetCreateForm = useCallback(() => {
    setCreateForm({
      ...EMPTY_CREATE_FORM,
      branch_id: branches.length === 1 ? branches[0].id : "",
    })
  }, [branches])

  const handleOpenCreate = () => {
    resetCreateForm()
    setCreateOpen(true)
  }

  const handleApplyFilters = () => {
    setAppliedFilters({
      branchId: filterForm.branchId || "",
      bomUsage: filterForm.bomUsage || "all",
      isActive: filterForm.isActive || "all",
      q: filterForm.q || "",
    })
  }

  const handleCreate = async () => {
    if (!createForm.product_id || !createForm.bom_code.trim() || !createForm.bom_name.trim()) {
      toast({
        variant: "destructive",
        title: "البيانات الأساسية غير مكتملة",
        description: "المنتج والكود والاسم مطلوبة قبل إنشاء BOM.",
      })
      return
    }

    // Validate product type before sending to API
    if (selectedProduct && selectedProduct.product_type !== "manufactured") {
      toast({
        variant: "destructive",
        title: "المنتج غير مؤهل لإنشاء BOM",
        description: `المنتج "${selectedProduct.sku || selectedProduct.id}" تصنيفه الحالي: "${
          selectedProduct.product_type === 'purchased' ? 'مشتريات' :
          selectedProduct.product_type === 'raw_material' ? 'مادة خام' :
          selectedProduct.product_type || 'غير محدد'
        }" — لإنشاء BOM يجب أن يكون تصنيفه "تصنيعي". افتح صفحة المنتجات، اضغط على أيقونة التعديل للمنتج، وغيّر حقل "التصنيف التفصيلي" إلى تصنيعي.`,
      })
      return
    }

    try {
      setCreating(true)
      const created = await createBom({
        ...createForm,
        bom_code: createForm.bom_code.trim(),
        bom_name: createForm.bom_name.trim(),
        description: createForm.description?.trim() || null,
      })

      toast({
        title: "تم إنشاء BOM بنجاح",
        description: `${created.bom_code} جاهزة الآن لإدارة النسخ والهيكل.`,
      })

      setCreateOpen(false)
      await loadBoms(appliedFilters)
      router.push(`/manufacturing/boms/${created.id}`)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "تعذر إنشاء BOM",
        description: error?.message || "حدث خطأ أثناء إنشاء السجل",
      })
    } finally {
      setCreating(false)
    }
  }

  const getFeaturedVersion = (bom: BomListItem) => {
    return bom.versions.find((version) => version.is_default) || bom.versions[0] || null
  }

  const activeFilterCount = useMemo(() => {
    let count = 0
    if (appliedFilters.branchId && appliedFilters.branchId !== "all") count++
    if (appliedFilters.bomUsage && appliedFilters.bomUsage !== "all") count++
    if (appliedFilters.isActive && appliedFilters.isActive !== "all") count++
    if (appliedFilters.q && appliedFilters.q.trim() !== "") count++
    return count
  }, [appliedFilters])

  return (
    <PageGuard resource="manufacturing_boms">
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <CompanyHeader />
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <ERPPageHeader
              title="هياكل المواد (BOM)"
              description="إدارة هياكل المنتجات، النسخ، والاعتماد"
              variant="list"
              extra={
                <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
                  <Factory className="h-3.5 w-3.5" />
                  مديول التصنيع
                </div>
              }
              actions={
                <>
                  <Button
                    variant="outline"
                    onClick={() => loadBoms(appliedFilters)}
                    disabled={loading}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    تحديث
                  </Button>
                  <Button onClick={handleOpenCreate} disabled={!canWrite || lookupsLoading} className="gap-2">
                    <Plus className="h-4 w-4" />
                    إنشاء هيكل جديد
                  </Button>
                </>
              }
            />
          </div>

        <FilterContainer
          title="الفلاتر"
          activeCount={activeFilterCount}
          onClear={() => {
            setFilterForm({ branchId: "", bomUsage: "all", isActive: "all", q: "" })
            setAppliedFilters({ branchId: "", bomUsage: "all", isActive: "all", q: "" })
          }}
          defaultOpen={false}
        >
          <div className="grid gap-3 lg:grid-cols-[2fr,1fr,1fr,1fr,auto]">
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
                  <Select
                    value={filterForm.branchId || "all"}
                    onValueChange={(value) => setFilterForm((current) => ({ ...current, branchId: value === "all" ? "" : value }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="كل الفروع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">كل الفروع</SelectItem>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {buildBranchLabel(branch)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>نوع الهيكل</Label>
                  <Select
                    value={filterForm.bomUsage || "all"}
                    onValueChange={(value) => setFilterForm((current) => ({ ...current, bomUsage: value as BomListFilters["bomUsage"] }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="الكل" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل</SelectItem>
                      {BOM_USAGE_OPTIONS.map((option) => (
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
                    onValueChange={(value) => setFilterForm((current) => ({ ...current, isActive: value as BomListFilters["isActive"] }))}
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
                <p className="text-xs text-gray-500 dark:text-gray-400">إجمالي الهياكل المعروضة</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{boms.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                <Layers3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">إجمالي النسخ المرتبطة</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {boms.reduce((sum, bom) => sum + bom.versions.length, 0)}
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
                <p className="text-xs text-gray-500 dark:text-gray-400">الهياكل النشطة حاليًا</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {boms.filter((bom) => bom.is_active).length}
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
                            جاري تحميل بيانات الهياكل...
                          </TableCell>
                        </TableRow>
                      ))
                    ) : boms.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center">
                          <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
                            <Factory className="h-10 w-10 text-slate-300" />
                            <div className="text-lg font-medium text-slate-800">لا توجد هياكل مطابقة</div>
                            <p className="text-sm leading-6 text-slate-500">
                              يمكنك تعديل الفلاتر الحالية أو إنشاء هيكل جديد من الزر أعلى الصفحة.
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      boms.map((bom) => {
                        const featuredVersion = getFeaturedVersion(bom)
                        const branch = branchMap[bom.branch_id]

                        return (
                          <TableRow key={bom.id}>
                            <TableCell className="align-top">
                              <div className="space-y-1">
                                <div className="font-medium text-slate-900">{bom.bom_code}</div>
                                <div className="text-sm text-slate-600">{bom.bom_name}</div>
                                <div className="flex flex-wrap gap-2 pt-1">
                                  <Badge variant={bom.is_active ? "default" : "outline"}>
                                    {bom.is_active ? "نشط" : "غير نشط"}
                                  </Badge>
                                  <Badge variant="outline">{bom.versions.length} نسخة</Badge>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="max-w-xs whitespace-normal text-sm text-slate-700">
                                {buildProductLabel(bom.product)}
                              </div>
                            </TableCell>
                            <TableCell className="align-top text-sm text-slate-600">
                              <div className="flex items-center gap-2">
                                <GitBranch className="h-4 w-4 text-slate-400" />
                                {buildBranchLabel(branch)}
                              </div>
                            </TableCell>
                            <TableCell className="align-top">
                              <Badge variant="outline">
                                {BOM_USAGE_OPTIONS.find((option) => option.value === bom.bom_usage)?.labelAr || bom.bom_usage}
                              </Badge>
                            </TableCell>
                            <TableCell className="align-top">
                              {featuredVersion ? (
                                <div className="space-y-1">
                                  <div className="font-medium text-slate-900">v{featuredVersion.version_no}</div>
                                  <div className="flex flex-wrap gap-2">
                                    <Badge variant={getVersionStatusVariant(featuredVersion.status)}>
                                      {getVersionStatusLabel(featuredVersion.status)}
                                    </Badge>
                                    {featuredVersion.is_default ? <Badge variant="outline">افتراضية</Badge> : null}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-sm text-slate-400">لا توجد نسخ بعد</span>
                              )}
                            </TableCell>
                            <TableCell className="align-top text-sm text-slate-600">
                              {formatDateTime(bom.updated_at)}
                            </TableCell>
                            <TableCell className="align-top">
                              <Button
                                variant="outline"
                                className="gap-2"
                                onClick={() => router.push(`/manufacturing/boms/${bom.id}`)}
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
              <DialogTitle>إنشاء هيكل مواد جديد (BOM)</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label>الفرع</Label>
                <Select
                  value={createForm.branch_id || ""}
                  onValueChange={(value) =>
                    setCreateForm((current) => ({
                      ...current,
                      branch_id: value,
                      product_id: "",
                    }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="اختر الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {buildBranchLabel(branch)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>المنتج المالك</Label>
                <Select
                  value={createForm.product_id || ""}
                  onValueChange={(value) => setCreateForm((current) => ({ ...current, product_id: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="اختر المنتج" />
                  </SelectTrigger>
                  <SelectContent>
                    {ownerProductOptions.length === 0 ? (
                      <div className="py-3 px-2 text-sm text-muted-foreground text-center">
                        لا توجد منتجات متاحة للفرع المختار
                      </div>
                    ) : (
                      ownerProductOptions.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          <span className="flex items-center gap-2">
                            {buildProductLabel(product)}
                            {product.product_type === "manufactured" && (
                              <Badge variant="default" className="text-xs py-0 px-1">مؤهل</Badge>
                            )}
                          </span>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {selectedProduct && selectedProduct.product_type !== "manufactured" && (
                  <p className="text-xs text-destructive leading-relaxed">
                    ⚠️ تصنيف هذا المنتج الحالي: &quot;{
                      selectedProduct.product_type === 'purchased' ? 'مشتريات' :
                      selectedProduct.product_type === 'raw_material' ? 'مادة خام' :
                      selectedProduct.product_type || 'غير محدد'
                    }&quot; — لإنشاء BOM يجب أن يكون تصنيفه <strong>تصنيعي</strong>.
                    <br />
                    <span className="text-muted-foreground">
                      انتقل إلى صفحة المنتجات ← اضغط أيقونة التعديل ✏️ للمنتج ← غيّر &quot;التصنيف التفصيلي&quot; إلى تصنيعي.
                    </span>
                  </p>
                )}
                {selectedProduct?.product_type === "manufactured" && (
                  <p className="text-xs text-emerald-600">✓ منتج مؤهل لإنشاء BOM</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>كود الهيكل</Label>
                <Input
                  value={createForm.bom_code}
                  onChange={(event) => setCreateForm((current) => ({ ...current, bom_code: event.target.value }))}
                  placeholder="BOM-FG-001"
                />
              </div>
              <div className="space-y-2">
                <Label>اسم الهيكل</Label>
                <Input
                  value={createForm.bom_name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, bom_name: event.target.value }))}
                  placeholder="Finished Goods Production BOM"
                />
              </div>
              <div className="space-y-2">
                <Label>الاستخدام</Label>
                <Select
                  value={createForm.bom_usage}
                  onValueChange={(value) => setCreateForm((current) => ({ ...current, bom_usage: value as BomCreatePayload["bom_usage"] }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOM_USAGE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.labelAr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                <div className="space-y-1">
                  <div className="font-medium text-slate-900">تفعيل الهيكل</div>
                  <div className="text-sm text-slate-500">يمكن تعطيل السجل لاحقًا من صفحة التفاصيل.</div>
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
                  placeholder="ملاحظات عامة عن الغرض من هذا الهيكل أو طريقة استخدامه."
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleCreate} disabled={creating || lookupsLoading}>
                {creating ? "جاري الإنشاء..." : "إنشاء الهيكل"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </main>
      </div>
    </PageGuard>
  )
}
