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
import { Loader2, Save, Link2 } from "lucide-react"
import { createServiceSchema, SERVICE_TYPE_VALUES } from "@/lib/services/booking-api"
import {
  ServiceSchedulesEditor,
  schedulesToUpsertInput,
  type ScheduleRow,
} from "@/components/services/ServiceSchedulesEditor"
import { useState, useEffect } from "react"
import type { Service, ServiceSchedule } from "@/types/services"

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
}

export function ServiceForm({
  mode,
  initialData,
  initialSchedules,
  onSubmit,
  isSubmitting = false,
  lang = "ar",
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
    income_account_id?: string | null
    expense_account_id?: string | null
  }
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([])
  const [catalogQuery, setCatalogQuery] = useState("")
  useEffect(() => {
    fetch("/api/products?item_type=service&limit=500")
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (json?.products) {
          setCatalogProducts(json.products as CatalogProduct[])
        }
      })
      .catch(() => { /* non-critical */ })
  }, [])

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

  // Resolved linked product (for inheritance preview)
  const linkedProductId = form.watch("product_catalog_id" as any) as string | undefined
  const linkedProduct = catalogProducts.find((p) => p.id === linkedProductId) || null
  const initialLinkedProductId = (initialData as any)?.product_catalog_id as string | undefined

  // Filtered list for the search input
  const filteredCatalog = catalogQuery.trim().length === 0
    ? catalogProducts
    : catalogProducts.filter((p) => {
        const q = catalogQuery.toLowerCase()
        return (p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
      })

  const handleSubmit = async (data: ServiceFormValues) => {
    // Validate schedule times before submitting
    const invalidDay = schedules.find(
      (r) => r.is_active && r.start_time && r.end_time && r.end_time <= r.start_time
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
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6" dir={isAr ? "rtl" : "ltr"}>
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
                {/* ── Product Catalog Selector (REQUIRED — source of truth) ── */}
                <FormField
                  control={form.control}
                  name={"product_catalog_id" as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5 text-orange-500" />
                        {t("صنف الكتالوج", "Catalog Product")} *
                      </FormLabel>
                      <Input
                        type="search"
                        placeholder={t("ابحث بالاسم أو الكود (SKU)...", "Search by name or SKU…")}
                        value={catalogQuery}
                        onChange={(e) => setCatalogQuery(e.target.value)}
                        className="mb-2"
                      />
                      <Select
                        value={(field.value as string) ?? ""}
                        onValueChange={(v) => field.onChange(v)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("اختر صنفاً من كتالوج الخدمات", "Choose a service from catalog")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredCatalog.length === 0 ? (
                            <div className="p-3 text-sm text-muted-foreground text-center">
                              {t(
                                "لا توجد أصناف خدمات. أنشئ صنفاً من نوع «خدمة» في المنتجات والخدمات أولاً.",
                                "No service items. Create a product with item_type=service first."
                              )}
                            </div>
                          ) : (
                            filteredCatalog.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.sku ? `${p.name} — ${p.sku}` : p.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">
                        {t(
                          "💡 الأسعار والحسابات تُسحب من هذا الصنف وتُحدَّث تلقائياً عند أي تعديل على المنتج.",
                          "💡 Pricing and accounts are inherited from this catalog item and refresh automatically whenever the product changes."
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
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

                  {/* Tax Rate */}
                  <FormField
                    control={form.control}
                    name="tax_rate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("نسبة الضريبة %", "Tax Rate %")}</FormLabel>
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
                        <FormDescription className="text-xs">
                          {t("ⓘ معدل الضريبة مستقل عن صنف الكتالوج", "ⓘ Tax rate is independent of the catalog item")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
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

                  <FormField
                    control={form.control}
                    name="requires_approval"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3 rounded-lg border p-3">
                        <FormControl>
                          <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div>
                          <FormLabel className="cursor-pointer">{t("يتطلب موافقة", "Requires Approval")}</FormLabel>
                          <FormDescription className="text-xs">
                            {t("يحتاج الحجز لموافقة الإدارة", "Booking needs management approval")}
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
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

        {/* Submit */}
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
      </form>
    </Form>
  )
}
