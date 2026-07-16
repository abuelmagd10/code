"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Loader2, Save, Link2, MapPin } from "lucide-react"
import { createServiceSchema, SERVICE_TYPE_VALUES } from "@/lib/services/booking-api"
import {
  ServiceSchedulesEditor,
  schedulesToUpsertInput,
  type ScheduleRow,
} from "@/components/services/ServiceSchedulesEditor"
import { useState, useEffect } from "react"
import type { Service, ServiceSchedule } from "@/types/services"
import { useAccess } from "@/lib/access-context"
// v3.74.343 — Tax rate dropdown sourced from /settings/taxes
import { useSupabase } from "@/lib/supabase/hooks"
import { listTaxCodes, ensureDefaultsIfEmpty, type TaxCode } from "@/lib/taxes"

// Use createServiceSchema for both create and edit (edit uses same fields)
type ServiceFormValues = z.infer<typeof createServiceSchema>

const SERVICE_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  individual: { ar: "فردي", en: "Individual" },
  group:      { ar: "جماعي", en: "Group" },
  hourly:     { ar: "بالساعة", en: "Hourly" },
  session:    { ar: "بالجلسة", en: "Session" },
  daily:      { ar: "يومي", en: "Daily" },
}

interface ServiceFormProps {
  mode: "create" | "edit"
  initialData?: Partial<ServiceFormValues>
  initialSchedules?: ScheduleRow[]
  onSubmit: (data: ServiceFormValues, schedules: ScheduleRow[]) => Promise<void>
  isSubmitting?: boolean
  lang?: string
  // v3.74.677 — let the page relocate the submit button (via the HTML `form`
  // attribute) below the consumed-products section.
  formId?: string
  hideSubmit?: boolean
}

export function ServiceForm({
  mode,
  initialData,
  initialSchedules,
  onSubmit,
  isSubmitting = false,
  lang = "ar",
  formId,
  hideSubmit = false,
}: ServiceFormProps) {
  const isAr = lang !== "en"
  const t = (ar: string, en: string) => (isAr ? ar : en)

  // Always initialise to a full 7-row grid so the state matches what
  // ServiceSchedulesEditor renders (it shows defaultRows() when value is empty).
  const [schedules, setSchedules] = useState<ScheduleRow[]>(() => {
    const base: ScheduleRow[] = Array.from({ length: 7 }, (_, i) => ({
      day_of_week: i,
      is_active: i >= 0 && i <= 4, // Sun–Thu active by default
      start_time: "09:00",
      end_time: "18:00",
    }))
    if (!initialSchedules || initialSchedules.length === 0) return base
    for (const r of initialSchedules) {
      if (r.day_of_week >= 0 && r.day_of_week <= 6) {
        base[r.day_of_week] = { ...base[r.day_of_week]!, ...r }
      }
    }
    return base
  })

  interface CatalogProduct {
    id: string
    name: string
    sku?: string
    unit_price?: number
    cost_price?: number
    branch_id?: string | null
    income_account_id?: string | null
    expense_account_id?: string | null
  }
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([])
  // v3.74.338 — removed catalogQuery state; the dropdown alone is enough

  // v3.74.319 — اختيار الفرع للخدمة (NULL = متاحة لكل الفروع).
  // المالك والمدير العام (admin) يقدروا يختاروا "كل الفروع" أو فرع محدد.
  // المدير (manager) محصور على فرعه — ندى dropdown أحادى الخيار.
  const { profile } = useAccess()
  const isCompanyScope = !!(profile?.is_owner || profile?.is_admin)
  const userBranchId = profile?.branch_id ?? null

  interface BranchItem { id: string; name: string }
  const [branches, setBranches] = useState<BranchItem[]>([])
  useEffect(() => {
    fetch("/api/branches")
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        const list = json?.branches || json?.data || json
        if (Array.isArray(list)) setBranches(list as BranchItem[])
      })
      .catch(() => { /* non-critical */ })
  }, [])

  // v3.74.343 — Tax codes from /settings/taxes. We read the same
  // tax_codes table the Tax Settings page writes to. ensureDefaults
  // seeds {0%, VAT 5%, VAT 15%} on the first ever read so a brand
  // new company isn't stuck with an empty dropdown.
  const supabase = useSupabase()
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([])
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await ensureDefaultsIfEmpty(supabase)
        const rows = await listTaxCodes(supabase)
        if (cancelled) return
        // Only "sales" or "both" — purchase-only codes don't belong
        // on a sales-facing service.
        const filtered = rows.filter((r) => r.is_active && (r.scope === "sales" || r.scope === "both"))
        setTaxCodes(filtered)
      } catch {
        /* non-critical — the dropdown will just show "no codes" */
      }
    })()
    return () => { cancelled = true }
  }, [supabase])

  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(createServiceSchema),
    defaultValues: {
      service_type: "individual",
      duration_minutes: 60,
      tax_rate: 0,
      commission_rate: 0,
      capacity: 1,
      buffer_minutes: 0,
      advance_booking_days: 30,
      min_advance_hours: 1,
      cancel_before_hours: 24,
      currency_code: "EGP",
      is_bookable: true,
      requires_approval: false,
      description: null,
      category: null,
      notes: null,
      image_url: null,
      color_code: null,
      cost_center_id: null,
      product_catalog_id: undefined as any,
      branch_id: null,
      ...initialData,
    } as any,
  })

  // v3.74.341 — for branch-scope roles (manager), auto-fill the form's
  // branch_id from the user's profile on mount. Without this the form
  // shows the branch name visually but field.value stays null, so the
  // catalog dropdown stays locked even though the user "obviously"
  // already picked their branch. Owner/admin keep their explicit pick.
  useEffect(() => {
    if (!profile) return
    if (isCompanyScope) return
    if (!userBranchId) return
    const current = form.getValues("branch_id" as any)
    if (!current) {
      form.setValue("branch_id" as any, userBranchId as any)
    }
  }, [profile, isCompanyScope, userBranchId, form])

  // v3.74.333 — products are filtered by the service's branch so the
  // owner / admin / manager can only link to a product that lives in
  // (or is shared with) the service's branch.
  //
  // v3.74.340 — strict: until a branch is chosen, we don't fetch
  // anything and the catalog dropdown stays disabled. The previous
  // build was falling back to the unfiltered list when branch was
  // NULL, which let an owner pick a service catalog item BEFORE
  // committing to a branch — the opposite of the scenario the owner
  // wrote up. Branch-scope roles (manager) get their branch_id auto-
  // filled by the dropdown's "disabled + locked on member.branch_id"
  // logic, so this still triggers the fetch immediately for them.
  const watchedServiceBranchId = form.watch("branch_id" as any) as string | null | undefined
  useEffect(() => {
    if (!watchedServiceBranchId) {
      setCatalogProducts([])
      return
    }
    const params = new URLSearchParams({
      item_type: "service",
      limit: "500",
      branch_id: watchedServiceBranchId,
    })
    fetch(`/api/products?${params.toString()}`)
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (json?.products) {
          setCatalogProducts(json.products as CatalogProduct[])
        }
      })
      .catch(() => { /* non-critical */ })
  }, [watchedServiceBranchId])

  // v3.74.333 — if the linked product is no longer in the filtered list
  // (because the branch changed), clear the selection so the user
  // doesn't silently keep a cross-branch link.
  useEffect(() => {
    const current = form.getValues("product_catalog_id" as any) as string | undefined
    if (!current) return
    if (catalogProducts.length === 0) return
    if (!catalogProducts.some((p) => p.id === current)) {
      form.setValue("product_catalog_id" as any, undefined as any)
    }
  }, [catalogProducts, form])

  // Resolved linked product (for inheritance preview)
  const linkedProductId = form.watch("product_catalog_id" as any) as string | undefined
  const linkedProduct = catalogProducts.find((p) => p.id === linkedProductId) || null
  const initialLinkedProductId = (initialData as any)?.product_catalog_id as string | undefined

  const handleSubmit = async (data: ServiceFormValues) => {
    // v3.74.354 — "00:00" on the end side is treated as end-of-day
    // (24:00), so a shift like 18:00 → 00:00 (6pm to midnight) is
    // valid. The ServiceSchedulesEditor's inline validation already
    // mirrors this rule; here we do the same gate at submit time.
    const invalidDay = schedules.find(
      (r) =>
        r.is_active &&
        r.start_time &&
        r.end_time &&
        r.end_time !== "00:00" &&
        r.end_time <= r.start_time,
    )
    if (invalidDay) {
      const dayNames = isAr
        ? ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"]
        : ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
      alert(
        isAr
          ? `يوم ${dayNames[invalidDay.day_of_week]}: وقت الانتهاء يجب أن يكون بعد وقت البداية`
          : `${dayNames[invalidDay.day_of_week]}: End time must be after start time`
      )
      return
    }
    // Warn when the catalog link is being changed on an existing service
    if (
      mode === "edit" &&
      initialLinkedProductId &&
      (data as any).product_catalog_id &&
      (data as any).product_catalog_id !== initialLinkedProductId
    ) {
      const oldP = catalogProducts.find((p) => p.id === initialLinkedProductId)
      const newP = catalogProducts.find((p) => p.id === (data as any).product_catalog_id)
      const msg = isAr
        ? `سيؤدي تغيير صنف الكتالوج إلى تحديث:\n  • الاسم: "${oldP?.name ?? "—"}" ← "${newP?.name ?? "—"}"\n  • السعر: ${oldP?.unit_price ?? "—"} ← ${newP?.unit_price ?? "—"}\n  • التكلفة: ${oldP?.cost_price ?? "—"} ← ${newP?.cost_price ?? "—"}\n  • الحسابات المحاسبية\n\nهل تريد المتابعة؟`
        : `Changing the catalog product will overwrite:\n  • Name: "${oldP?.name ?? "—"}" → "${newP?.name ?? "—"}"\n  • Price: ${oldP?.unit_price ?? "—"} → ${newP?.unit_price ?? "—"}\n  • Cost:  ${oldP?.cost_price ?? "—"} → ${newP?.cost_price ?? "—"}\n  • Accounting accounts\n\nProceed?`
      if (!window.confirm(msg)) return
    }
    await onSubmit(data, schedules)
  }

  return (
    <Form {...form}>
      <form id={formId} onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6" dir={isAr ? "rtl" : "ltr"}>
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic">{t("المعلومات الأساسية", "Basic Info")}</TabsTrigger>
            <TabsTrigger value="booking">{t("إعدادات الحجز", "Booking Settings")}</TabsTrigger>
            <TabsTrigger value="schedules">{t("مواعيد العمل", "Work Schedules")}</TabsTrigger>
          </TabsList>

          {/* ── TAB 1: Basic Info ── */}
          <TabsContent value="basic" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("معلومات الخدمة", "Service Information")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* v3.74.340 — Branch first, ALWAYS.
                    The owner's scenario is explicit: pick the branch
                    before anything else, then the catalog dropdown shows
                    items available in that branch. Re-ordered above the
                    catalog selector so the form reads top-to-bottom in
                    the order the owner wants to think. */}
                <FormField
                  control={form.control}
                  name={"branch_id" as any}
                  render={({ field }) => {
                    const currentVal = (field.value as string | null | undefined) ?? null
                    const selectValue = currentVal ?? (isCompanyScope ? "" : (userBranchId ?? ""))
                    return (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-blue-500" />
                          {t("الفرع", "Branch")} *
                        </FormLabel>
                        <Select
                          value={selectValue || ""}
                          onValueChange={(v) => field.onChange(v)}
                          disabled={!isCompanyScope}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("اختر الفرع", "Pick a branch")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {branches.map((b) => (
                              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          {isCompanyScope
                            ? t(
                                "كل خدمة لازم تكون مرتبطة بفرع — لإن المنتجات والمخزون مرتبطين بفرع.",
                                "Every service must belong to a branch — products and inventory are branch-scoped."
                              )
                            : t(
                                "محدد تلقائياً بفرعك. غيره يحتاج مالك أو مدير عام.",
                                "Auto-set to your branch. Change needs owner / general manager."
                              )}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )
                  }}
                />

                {/* ── Product Catalog Selector (REQUIRED — source of truth) ──
                    v3.74.338 — removed the duplicate search input.
                    v3.74.340 — locked until a branch is chosen. The owner
                    explicitly asked for branch-first; the dropdown stays
                    disabled with a clear hint until watchedServiceBranchId
                    is set. */}
                <FormField
                  control={form.control}
                  name={"product_catalog_id" as any}
                  render={({ field }) => {
                    const branchPicked = !!watchedServiceBranchId
                    return (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5 text-orange-500" />
                          {t("صنف الكتالوج", "Catalog Product")} *
                        </FormLabel>
                        <Select
                          value={(field.value as string) ?? ""}
                          onValueChange={(v) => field.onChange(v)}
                          disabled={!branchPicked}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={
                                !branchPicked
                                  ? t("اختر الفرع أولاً", "Pick a branch first")
                                  : t("اختر صنفاً من كتالوج الخدمات", "Choose a service from catalog")
                              } />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {!branchPicked ? (
                              <div className="p-3 text-sm text-muted-foreground text-center">
                                {t("اختر الفرع لعرض أصنافه.", "Pick a branch to see its items.")}
                              </div>
                            ) : catalogProducts.length === 0 ? (
                              <div className="p-3 text-sm text-muted-foreground text-center">
                                {t(
                                  "لا توجد أصناف خدمات لهذا الفرع. أنشئ صنفاً من نوع «خدمة» فى «المنتجات والخدمات» أولاً.",
                                  "No service items for this branch. Create a product with item_type=service in /products first."
                                )}
                              </div>
                            ) : (
                              catalogProducts.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.sku ? `${p.name} — ${p.sku}` : p.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          {!branchPicked
                            ? t("اختر الفرع أولاً علشان نعرضلك أصناف الخدمات المتاحة فى هذا الفرع.",
                                "Pick a branch first to see the catalog items available in that branch.")
                            : t("💡 الأسعار والحسابات تُنسخ من الصنف وقت إنشاء الخدمة. القائمة مفلترة بفرع الخدمة المختار.",
                                "💡 Pricing and accounts are copied from the catalog item at create time. The list is filtered by the service's branch.")
                          }
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )
                  }}
                />

                {/* ── Inherited Values Preview (read-only) ── */}
                {linkedProduct ? (
                  <div className="rounded-lg border-2 border-dashed border-orange-300 bg-orange-50/40 dark:border-orange-800 dark:bg-orange-950/20 p-4 space-y-2">
                    <p className="text-xs font-medium text-orange-700 dark:text-orange-300">
                      📦 {t("قيم موروثة من الكتالوج (للقراءة فقط)", "Inherited from catalog (read-only)")}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t("الاسم", "Name")}:</span><span className="font-medium">{linkedProduct.name}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t("الكود (SKU)", "SKU")}:</span><span className="font-mono text-xs">{linkedProduct.sku ?? "—"}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t("سعر البيع", "Unit Price")}:</span><span className="font-semibold text-green-700 dark:text-green-400 tabular-nums">{Number(linkedProduct.unit_price ?? 0).toLocaleString()}</span></div>
                      <div className="flex justify-between gap-2"><span className="text-muted-foreground">{t("التكلفة", "Cost Price")}:</span><span className="tabular-nums">{Number(linkedProduct.cost_price ?? 0).toLocaleString()}</span></div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground text-center">
                    {t("اختر صنفاً من الكتالوج لعرض الأسعار والحسابات", "Pick a catalog item to preview its pricing and accounts")}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Service Type */}
                  <FormField
                    control={form.control}
                    name="service_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("نوع الخدمة", "Service Type")} *</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {SERVICE_TYPE_VALUES.map((v) => (
                              <SelectItem key={v} value={v}>
                                {isAr ? SERVICE_TYPE_LABELS[v]!.ar : SERVICE_TYPE_LABELS[v]!.en}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Category */}
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("الفئة", "Category")}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder={t("مثال: العناية بالبشرة", "e.g. Skin Care")}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Tax Rate — v3.74.343: dropdown sourced from /settings/taxes */}
                  <FormField
                    control={form.control}
                    name="tax_rate"
                    render={({ field }) => {
                      const currentRate = Number(field.value ?? 0)
                      // Preserve a legacy rate that doesn't match any defined code
                      // (e.g. an old service with tax_rate=7 when codes are 0/5/15).
                      // We surface it as a "custom" entry so the user sees what's
                      // saved without losing the value on next save.
                      const hasMatch = taxCodes.some((c) => Number(c.rate) === currentRate)
                      const legacyOption =
                        currentRate > 0 && !hasMatch
                          ? { id: `__legacy_${currentRate}`, name: `${currentRate}%`, rate: currentRate, scope: "both" as const, is_active: true, company_id: "" }
                          : null
                      return (
                        <FormItem>
                          <FormLabel>{t("نسبة الضريبة", "Tax Rate")}</FormLabel>
                          <Select
                            value={String(currentRate)}
                            onValueChange={(v) => field.onChange(parseFloat(v) || 0)}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={t("اختر رمز ضريبة", "Pick a tax code")}
                                />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {taxCodes.length === 0 && !legacyOption ? (
                                <SelectItem value="0">{t("بدون ضريبة (0%)", "No tax (0%)")}</SelectItem>
                              ) : (
                                <>
                                  {taxCodes.map((c) => (
                                    <SelectItem key={c.id} value={String(c.rate)}>
                                      {c.name} — {c.rate}%
                                    </SelectItem>
                                  ))}
                                  {legacyOption && (
                                    <SelectItem key={legacyOption.id} value={String(legacyOption.rate)}>
                                      {t("قيمة قديمة", "Legacy")}: {legacyOption.rate}%
                                    </SelectItem>
                                  )}
                                </>
                              )}
                            </SelectContent>
                          </Select>
                          <FormDescription className="text-xs">
                            {t(
                              "ⓘ القائمة تستمد من إعدادات الضرائب. لإضافة رمز جديد افتح ‎/settings/taxes",
                              "ⓘ List comes from Tax Settings. To add a new code open /settings/taxes",
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )
                    }}
                  />

                  {/* Commission Rate */}
                  <FormField
                    control={form.control}
                    name="commission_rate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("نسبة العمولة %", "Commission Rate %")}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            max={100}
                            step={0.01}
                            value={field.value ?? 0}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Color Code */}
                  <FormField
                    control={form.control}
                    name="color_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("لون الخدمة", "Color")}</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={field.value ?? "#f97316"}
                              onChange={(e) => field.onChange(e.target.value)}
                              className="h-9 w-12 rounded border border-input cursor-pointer bg-transparent p-1"
                            />
                            <Input
                              value={field.value ?? ""}
                              onChange={(e) => field.onChange(e.target.value || null)}
                              placeholder="#f97316"
                              className="flex-1"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Image URL */}
                  <FormField
                    control={form.control}
                    name="image_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("رابط الصورة", "Image URL")}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder="https://..."
                            onChange={(e) => field.onChange(e.target.value || null)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Description */}
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("الوصف", "Description")}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value ?? ""}
                          rows={3}
                          placeholder={t("وصف مختصر للخدمة...", "Brief service description...")}
                          onChange={(e) => field.onChange(e.target.value || null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Notes */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("ملاحظات داخلية", "Internal Notes")}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value ?? ""}
                          rows={2}
                          placeholder={t("ملاحظات للموظفين...", "Notes for staff...")}
                          onChange={(e) => field.onChange(e.target.value || null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Flags */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="is_bookable"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3 rounded-lg border p-3">
                        <FormControl>
                          <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div>
                          <FormLabel className="cursor-pointer">{t("قابل للحجز", "Bookable")}</FormLabel>
                          <FormDescription className="text-xs">
                            {t("يمكن للعملاء حجز هذه الخدمة", "Customers can book this service")}
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  {/* v3.74.344 — حذف زر "يتطلب موافقة" بناءً على طلب
                      المالك. الحقل lا يزال موجوداً فى الـ defaults بقيمة
                      false (مرفوض ضمنياً) عشان الـ DB ما يتأثرش بأى
                      backend logic سابق يفترض وجوده، لكن المستخدم مش
                      يقدر يفعّله من الـ UI. */}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB 2: Booking Settings ── */}
          <TabsContent value="booking" className="space-y-4 pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("إعدادات الوقت والحجز", "Time & Booking Settings")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {/* Duration */}
                  <FormField
                    control={form.control}
                    name="duration_minutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("مدة الخدمة (دقيقة)", "Duration (minutes)")} *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={1}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 60)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Buffer */}
                  <FormField
                    control={form.control}
                    name="buffer_minutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("وقت الاستراحة (دقيقة)", "Buffer (minutes)")}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            value={field.value ?? 0}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {t("وقت الفراغ بين الحجوزات", "Gap between bookings")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Capacity */}
                  <FormField
                    control={form.control}
                    name="capacity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("السعة القصوى", "Max Capacity")}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={1}
                            value={field.value ?? 1}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {t("عدد الحجوزات المتزامنة", "Concurrent bookings allowed")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Min Advance Hours */}
                  <FormField
                    control={form.control}
                    name="min_advance_hours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("الحد الأدنى للحجز المسبق (ساعة)", "Min Advance (hours)")}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            value={field.value ?? 1}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Cancel Before Hours */}
                  <FormField
                    control={form.control}
                    name="cancel_before_hours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("إلغاء قبل (ساعة)", "Cancel Before (hours)")}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            value={field.value ?? 24}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Advance Booking Days */}
                  <FormField
                    control={form.control}
                    name="advance_booking_days"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("الحجز المسبق (أيام)", "Advance Booking (days)")}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={1}
                            value={field.value ?? 30}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
                          />
                        </FormControl>
                        <FormDescription className="text-xs">
                          {t("كم يوماً مسبقاً يمكن الحجز", "How many days ahead can be booked")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAB 3: Schedules ── */}
          <TabsContent value="schedules" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("أيام وساعات العمل", "Working Days & Hours")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ServiceSchedulesEditor
                  value={schedules}
                  onChange={setSchedules}
                  lang={lang}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Submit — hidden when the page relocates it below other sections. */}
        {!hideSubmit && (
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-orange-600 hover:bg-orange-700 text-white gap-2 min-w-[140px]"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSubmitting
                ? t("جاري الحفظ...", "Saving...")
                : mode === "create"
                ? t("إنشاء الخدمة", "Create Service")
                : t("حفظ التعديلات", "Save Changes")}
            </Button>
          </div>
        )}
      </form>
    </Form>
  )
}
