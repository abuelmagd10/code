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
import { readAppLanguage, getTextDirection, type AppLang } from "@/lib/manufacturing/manufacturing-ui"
import { ManufacturingGuide } from "@/components/manufacturing/manufacturing-guide"

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

  const [lang, setLang] = useState<AppLang>("ar")
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

  // ── Language ──
  useEffect(() => {
    const handler = () => setLang(readAppLanguage())
    handler()
    window.addEventListener("app_language_changed", handler)
    window.addEventListener("storage", (e) => { if (e.key === "app_language") handler() })
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  const branchMap = useMemo(
    () => Object.fromEntries(branches.map((branch) => [branch.id, branch])),
    [branches]
  )

  // Only "manufactured" products can own a BOM — filter strictly here to prevent UX confusion.
  const ownerProductOptions = useMemo(
    () =>
      products.filter(
        (product) =>
          product.product_type === "manufactured" &&
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
        title: lang === "en" ? "Failed to load reference data" : "تعذّر تحميل البيانات المرجعية",
        description: error?.message || (lang === "en" ? "Error loading branches and products" : "حدث خطأ أثناء تحميل الفروع والمنتجات"),
      })
    } finally {
      setLookupsLoading(false)
    }
  }, [toast, lang])

  const loadBoms = useCallback(async (filters: BomListFilters) => {
    try {
      setLoading(true)
      const result = await fetchBomList(filters)
      setBoms(result.items)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: lang === "en" ? "Failed to load BOMs" : "تعذّر تحميل قوائم المواد",
        description: error?.message || (lang === "en" ? "Error loading list" : "حدث خطأ أثناء تحميل القائمة"),
      })
      setBoms([])
    } finally {
      setLoading(false)
    }
  }, [toast, lang])

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
        title: lang === "en" ? "Missing required fields" : "البيانات الأساسية غير مكتملة",
        description: lang === "en"
          ? "Product, BOM code and name are required."
          : "يجب تحديد المنتج ورمز قائمة المواد واسمها قبل الإنشاء.",
      })
      return
    }

    // Validate product type before sending to API
    if (selectedProduct && selectedProduct.product_type !== "manufactured") {
      toast({
        variant: "destructive",
        title: lang === "en" ? "Product not eligible for BOM" : "المنتج غير مؤهل لإنشاء قائمة مواد",
        description: lang === "en"
          ? `Product type must be "Manufactured". Change it from the Products page.`
          : `يجب أن يكون نوع المنتج "تصنيعي" — غيّر ذلك من صفحة المنتجات.`,
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
        title: lang === "en" ? "✅ BOM created successfully" : "✅ تم إنشاء قائمة المواد بنجاح",
        description: lang === "en"
          ? `"${created.bom_code}" is ready — now add a version and define components.`
          : `"${created.bom_code}" جاهزة — أضف الآن إصداراً وحدد مكونات التصنيع.`,
      })

      setCreateOpen(false)
      await loadBoms(appliedFilters)
      router.push(`/manufacturing/boms/${created.id}`)
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: lang === "en" ? "Failed to create BOM" : "تعذّر إنشاء قائمة المواد",
        description: error?.message || (lang === "en" ? "An error occurred" : "حدث خطأ أثناء إنشاء السجل"),
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
      <div dir={getTextDirection(lang)} className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <CompanyHeader />

          {/* ── دليل دورة التصنيع ── */}
          <ManufacturingGuide
            currentStep="bom"
            pageInfo={{
              titleAr: "قوائم المواد — وصفة التصنيع",
              titleEn: "Bills of Materials — The Manufacturing Recipe",
              descAr: "قائمة المواد هي الوصفة التي تحدد مكونات كل منتج تصنيعي. قبل أن تبدأ أي إنتاج، يجب أن يعرف النظام: ماذا يحتوي المنتج وبأي كميات.",
              descEn: "A Bill of Materials is the recipe that defines what components go into each manufactured product — and in what quantities.",
              whenAr: "استخدم هذه الصفحة عند إضافة منتج تصنيعي جديد تريد النظام أن يعرف مكوناته. كل منتج تصنيعي يحتاج قائمة مواد واحدة على الأقل.",
              whenEn: "Use this page when adding a new manufactured product and defining its raw material components.",
              nextStepId: "bom_version",
            }}
          />

          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <ERPPageHeader
              title={lang === "en" ? "Bills of Materials (BOM)" : "قوائم المواد (وصفات التصنيع)"}
              description={lang === "en"
                ? "Each manufactured product needs a BOM to define its components."
                : "كل منتج تصنيعي يحتاج قائمة مواد تحدد مكوناته — ابدأ بإنشاء قائمة وأضف لها الإصدار والمكونات"}
              variant="list"
              extra={
                <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
                  <Factory className="h-3.5 w-3.5" />
                  {lang === "en" ? "Manufacturing" : "التصنيع"}
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
                    {lang === "en" ? "Refresh" : "تحديث"}
                  </Button>
                  <Button onClick={handleOpenCreate} disabled={!canWrite || lookupsLoading} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {lang === "en" ? "New BOM" : "قائمة مواد جديدة"}
                  </Button>
                </>
              }
            />
          </div>

        <FilterContainer
          title={lang === "en" ? "Filters" : "الفلاتر"}
          activeCount={activeFilterCount}
          onClear={() => {
            setFilterForm({ branchId: "", bomUsage: "all", isActive: "all", q: "" })
            setAppliedFilters({ branchId: "", bomUsage: "all", isActive: "all", q: "" })
          }}
          defaultOpen={false}
        >
          <div className="grid gap-3 lg:grid-cols-[2fr,1fr,1fr,1fr,auto]">
                <div className="space-y-2">
                  <Label>{lang === "en" ? "Quick Search" : "بحث سريع"}</Label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={filterForm.q || ""}
                      onChange={(event) => setFilterForm((current) => ({ ...current, q: event.target.value }))}
                      placeholder={lang === "en" ? "Search by code or name" : "ابحث بالرمز أو الاسم"}
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{lang === "en" ? "Branch" : "الفرع"}</Label>
                  <Select
                    value={filterForm.branchId || "all"}
                    onValueChange={(value) => setFilterForm((current) => ({ ...current, branchId: value === "all" ? "" : value }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={lang === "en" ? "All branches" : "كل الفروع"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{lang === "en" ? "All branches" : "كل الفروع"}</SelectItem>
                      {branches.map((branch) => (
                        <SelectItem key={branch.id} value={branch.id}>
                          {buildBranchLabel(branch)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{lang === "en" ? "Usage Type" : "نوع الاستخدام"}</Label>
                  <Select
                    value={filterForm.bomUsage || "all"}
                    onValueChange={(value) => setFilterForm((current) => ({ ...current, bomUsage: value as BomListFilters["bomUsage"] }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={lang === "en" ? "All" : "الكل"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{lang === "en" ? "All" : "الكل"}</SelectItem>
                      {BOM_USAGE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {lang === "en" ? option.label : option.labelAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{lang === "en" ? "Status" : "الحالة"}</Label>
                  <Select
                    value={filterForm.isActive || "all"}
                    onValueChange={(value) => setFilterForm((current) => ({ ...current, isActive: value as BomListFilters["isActive"] }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={lang === "en" ? "All" : "الكل"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{lang === "en" ? "All" : "الكل"}</SelectItem>
                      <SelectItem value="true">{lang === "en" ? "Active" : "نشط"}</SelectItem>
                      <SelectItem value="false">{lang === "en" ? "Inactive" : "غير نشط"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={handleApplyFilters} className="w-full gap-2">
                    <Search className="h-4 w-4" />
                    {lang === "en" ? "Apply" : "تطبيق"}
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
                <p className="text-xs text-gray-500 dark:text-gray-400">{lang === "en" ? "Total BOMs" : "إجمالي قوائم المواد"}</p>
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
                <p className="text-xs text-gray-500 dark:text-gray-400">{lang === "en" ? "Total Versions" : "إجمالي الإصدارات"}</p>
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
                <p className="text-xs text-gray-500 dark:text-gray-400">{lang === "en" ? "Active BOMs" : "قوائم المواد النشطة"}</p>
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
                      <TableHead>{lang === "en" ? "Code / Name" : "الرمز / الاسم"}</TableHead>
                      <TableHead>{lang === "en" ? "Manufactured Product" : "المنتج المصنَّع"}</TableHead>
                      <TableHead>{lang === "en" ? "Branch" : "الفرع"}</TableHead>
                      <TableHead>{lang === "en" ? "Usage" : "الاستخدام"}</TableHead>
                      <TableHead>{lang === "en" ? "Latest Version" : "أحدث إصدار"}</TableHead>
                      <TableHead>{lang === "en" ? "Last Updated" : "آخر تحديث"}</TableHead>
                      <TableHead className="text-left">{lang === "en" ? "Action" : "إجراء"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 4 }).map((_, index) => (
                        <TableRow key={`loading-${index}`}>
                          <TableCell colSpan={7} className="py-6 text-center text-slate-500">
                            {lang === "en" ? "Loading BOMs..." : "جاري تحميل قوائم المواد..."}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : boms.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-12 text-center">
                          <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
                            <Factory className="h-10 w-10 text-slate-300" />
                            <div className="text-lg font-medium text-slate-800">{lang === "en" ? "No BOMs found" : "لا توجد قوائم مواد مطابقة"}</div>
                            <p className="text-sm leading-6 text-slate-500">
                              {lang === "en"
                                ? "Adjust filters or create a new BOM using the button above."
                                : "يمكنك تعديل الفلاتر الحالية أو إنشاء قائمة جديدة من الزر أعلى الصفحة."}
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
                                    {bom.is_active ? (lang === "en" ? "Active" : "نشط") : (lang === "en" ? "Inactive" : "غير نشط")}
                                  </Badge>
                                  <Badge variant="outline">{bom.versions.length} {lang === "en" ? "ver." : "إصدار"}</Badge>
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
                                    {featuredVersion.is_default ? <Badge variant="outline">{lang === "en" ? "Default" : "افتراضي"}</Badge> : null}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-sm text-slate-400">{lang === "en" ? "No versions yet" : "لا توجد إصدارات بعد"}</span>
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
                                {lang === "en" ? "Open" : "فتح"}
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
              <DialogTitle>{lang === "en" ? "New Bill of Materials" : "إنشاء قائمة مواد جديدة"}</DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {lang === "en"
                  ? "A BOM is your product's \"recipe\" — select the finished product, then add its raw material components in the next step."
                  : "قائمة المواد هي \"وصفة\" منتجك — حدد المنتج النهائي أولاً، ثم ستضيف مكوناته في الخطوة التالية."}
              </p>
            </DialogHeader>
            <div className="grid gap-4 py-2 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{lang === "en" ? "Branch" : "الفرع"}</Label>
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
                <Label>{lang === "en" ? "Manufactured Product" : "المنتج المصنَّع"}</Label>
                <Select
                  value={createForm.product_id || ""}
                  onValueChange={(value) => setCreateForm((current) => ({ ...current, product_id: value }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={lang === "en" ? "Select finished product" : "اختر المنتج النهائي"} />
                  </SelectTrigger>
                  <SelectContent>
                    {ownerProductOptions.length === 0 ? (
                      <div className="py-3 px-2 text-sm text-muted-foreground text-center">
                        {lang === "en" ? "No products available for this branch" : "لا توجد منتجات متاحة للفرع المختار"}
                      </div>
                    ) : (
                      ownerProductOptions.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {buildProductLabel(product)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {selectedProduct && selectedProduct.product_type !== "manufactured" && (
                  <p className="text-xs text-destructive leading-relaxed">
                    ⚠️ {lang === "en"
                      ? `Product type must be "Manufactured". Change it from the Products page.`
                      : `يجب أن يكون نوع المنتج "تصنيعي" — غيّر ذلك من صفحة المنتجات.`}
                  </p>
                )}
                {selectedProduct?.product_type === "manufactured" && (
                  <p className="text-xs text-emerald-600">✓ {lang === "en" ? "Eligible for BOM" : "منتج مؤهل لقائمة المواد"}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{lang === "en" ? "BOM Code" : "رمز قائمة المواد"}</Label>
                <Input
                  value={createForm.bom_code}
                  onChange={(event) => setCreateForm((current) => ({ ...current, bom_code: event.target.value }))}
                  placeholder="BOM-FG-001"
                />
              </div>
              <div className="space-y-2">
                <Label>{lang === "en" ? "BOM Name" : "اسم قائمة المواد"}</Label>
                <Input
                  value={createForm.bom_name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, bom_name: event.target.value }))}
                  placeholder={lang === "en" ? "e.g. Finished Product BOM" : "مثال: وصفة تصنيع المنتج النهائي"}
                />
              </div>
              <div className="space-y-2">
                <Label>{lang === "en" ? "Usage Type" : "نوع الاستخدام"}</Label>
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
                        {lang === "en" ? option.label : option.labelAr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-xl border px-4 py-3">
                <div className="space-y-1">
                  <div className="font-medium text-slate-900">{lang === "en" ? "Active" : "تفعيل قائمة المواد"}</div>
                  <div className="text-sm text-slate-500">{lang === "en" ? "Can be deactivated later from details." : "يمكن تعطيل السجل لاحقًا من صفحة التفاصيل."}</div>
                </div>
                <Switch
                  checked={createForm.is_active}
                  onCheckedChange={(checked) => setCreateForm((current) => ({ ...current, is_active: Boolean(checked) }))}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{lang === "en" ? "Description (optional)" : "الوصف (اختياري)"}</Label>
                <Textarea
                  value={createForm.description || ""}
                  onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder={lang === "en" ? "General notes about this BOM..." : "ملاحظات عامة عن الغرض من هذه القائمة أو طريقة استخدامها."}
                />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>
                {lang === "en" ? "Cancel" : "إلغاء"}
              </Button>
              <Button onClick={handleCreate} disabled={creating || lookupsLoading}>
                {creating ? (lang === "en" ? "Creating..." : "جاري الإنشاء...") : (lang === "en" ? "Create BOM" : "إنشاء قائمة المواد")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </main>
      </div>
    </PageGuard>
  )
}
