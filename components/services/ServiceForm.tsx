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

  const [schedules, setSchedules] = useState<ScheduleRow[]>(
    initialSchedules ?? []
  )

  const [catalogProducts, setCatalogProducts] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    fetch("/api/products?item_type=service&limit=200")
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        if (json?.products) {
          setCatalogProducts(
            json.products.map((p: any) => ({ id: p.id, name: p.name ?? p.product_name ?? p.id }))
          )
        }
      })
      .catch(() => { /* non-critical */ })
  }, [])

  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(createServiceSchema),
    defaultValues: {
      service_name: "",
      service_type: "individual",
      unit_price: 0,
      duration_minutes: 60,
      cost_price: 0,
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
      revenue_account_id: null,
      expense_account_id: null,
      cost_center_id: null,
      product_catalog_id: null,
      branch_id: null,
      ...initialData,
    },
  })

  const handleSubmit = async (data: ServiceFormValues) => {
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Service Name */}
                  <FormField
                    control={form.control}
                    name="service_name"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>{t("اسم الخدمة", "Service Name")} *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder={t("مثال: تدليك الوجه", "e.g. Facial Massage")} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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

                  {/* Unit Price */}
                  <FormField
                    control={form.control}
                    name="unit_price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("السعر", "Price")} *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            step={0.01}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Cost Price */}
                  <FormField
                    control={form.control}
                    name="cost_price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("سعر التكلفة", "Cost Price")}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={0}
                            step={0.01}
                            value={field.value ?? 0}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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

                {/* Product Catalog Link */}
                <FormField
                  control={form.control}
                  name="product_catalog_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5" />
                        {t("ربط بكتالوج المنتجات", "Link to Product Catalog")}
                      </FormLabel>
                      <Select
                        value={field.value ?? "none"}
                        onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("اختر منتج (اختياري)", "Select product (optional)")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">{t("بدون ربط", "No link")}</SelectItem>
                          {catalogProducts.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">
                        {t(
                          "ربط اختياري بمنتج من نوع «خدمة» في كتالوج المبيعات. عند إتمام الحجز سيُستخدم هذا المنتج لإنشاء بند في الفاتورة والترحيل المحاسبي تلقائياً.",
                          "Optional link to a service-type product in the sales catalog. When a booking is completed, this product will be used to create an invoice line item and trigger automatic GL posting."
                        )}
                      </FormDescription>
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
