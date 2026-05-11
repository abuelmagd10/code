"use client"

import { useState, useEffect } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ERPPageHeader } from "@/components/erp-page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ServiceSchedulesEditor, schedulesFromApi } from "@/components/services/ServiceSchedulesEditor"
import { ServiceStaffManager } from "@/components/services/ServiceStaffManager"
import { ServiceArchiveDialog } from "@/components/services/ServiceArchiveDialog"
import { LoadingState } from "@/components/ui/loading-state"
import { useSupabase } from "@/lib/supabase/hooks"
import { canAction } from "@/lib/authz"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { Pencil, Archive, Clock, Users, DollarSign, Calendar, Info } from "lucide-react"
import type { Service } from "@/types/services"

const SERVICE_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  individual: { ar: "فردي",    en: "Individual" },
  group:      { ar: "جماعي",  en: "Group" },
  hourly:     { ar: "بالساعة",en: "Hourly" },
  session:    { ar: "بالجلسة",en: "Session" },
  daily:      { ar: "يومي",   en: "Daily" },
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">{value}</span>
    </div>
  )
}

export default function ServiceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const appLang = searchParams.get("lang") === "en" ? "en" : "ar"
  const isAr = appLang !== "en"
  const t = (ar: string, en: string) => (isAr ? ar : en)
  const q = appLang === "en" ? "?lang=en" : ""

  const supabase = useSupabase()
  const { toast } = useToast()

  const [service, setService]     = useState<Service | null>(null)
  const [schedules, setSchedules] = useState<ReturnType<typeof schedulesFromApi>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [canEdit, setCanEdit]     = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [archiveOpen, setArchiveOpen]   = useState(false)
  const [isArchiving, setIsArchiving]   = useState(false)

  useEffect(() => {
    const checkPermissions = async () => {
      const [editOk, deleteOk] = await Promise.all([
        canAction(supabase, "services", "update"),
        canAction(supabase, "services", "delete"),
      ])
      setCanEdit(editOk)
      setCanDelete(deleteOk)
    }
    checkPermissions()
  }, [supabase])

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const res = await fetch(`/api/services/${id}`)
        if (!res.ok) throw new Error("Not found")
        const json = await res.json()
        setService(json.service)
        if (json.service?.schedules) {
          setSchedules(schedulesFromApi(json.service.schedules))
        }
      } catch {
        router.push(`/services${q}`)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id, q, router])

  const handleArchive = async () => {
    if (!service) return
    setIsArchiving(true)
    try {
      const res  = await fetch(`/api/services/${id}/archive`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toastActionSuccess(toast, t("تمت الأرشفة بنجاح", "Service archived"))
      setArchiveOpen(false)
      router.push(`/services${q}`)
    } catch (err: any) {
      toastActionError(toast, t("خطأ", "Error"), err.message)
    } finally {
      setIsArchiving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <LoadingState message={t("جاري تحميل بيانات الخدمة...", "Loading service...")} />
        </main>
      </div>
    )
  }

  if (!service) return null

  const typeLabel = SERVICE_TYPE_LABELS[service.service_type]

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <ERPPageHeader
          title={service.service_name}
          description={`${service.service_code} · ${isAr ? typeLabel?.ar : typeLabel?.en}`}
          variant="detail"
          backHref={`/services${q}`}
          actions={
            <div className="flex items-center gap-2">
              {canDelete && service.is_active && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setArchiveOpen(true)}
                  className="gap-2 text-orange-600 border-orange-300 hover:bg-orange-50"
                >
                  <Archive className="w-4 h-4" />
                  {t("أرشفة", "Archive")}
                </Button>
              )}
              {canEdit && service.is_active && (
                <Link href={`/services/${id}/edit${q}`} prefetch={false}>
                  <Button className="bg-orange-600 hover:bg-orange-700 text-white gap-2" size="sm">
                    <Pencil className="w-4 h-4" />
                    {t("تعديل", "Edit")}
                  </Button>
                </Link>
              )}
            </div>
          }
          extra={
            <div className="flex items-center gap-2 mt-1">
              <Badge
                className={service.is_active
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-0"}
              >
                {service.is_active ? t("نشط", "Active") : t("مؤرشف", "Archived")}
              </Badge>
              {service.is_bookable && (
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-0">
                  {t("قابل للحجز", "Bookable")}
                </Badge>
              )}
              {service.requires_approval && (
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0">
                  {t("يتطلب موافقة", "Requires Approval")}
                </Badge>
              )}
            </div>
          }
        />

        <Tabs defaultValue="details" className="mt-6" dir={isAr ? "rtl" : "ltr"}>
          <TabsList>
            <TabsTrigger value="details">{t("التفاصيل", "Details")}</TabsTrigger>
            <TabsTrigger value="schedules">{t("مواعيد العمل", "Schedules")}</TabsTrigger>
            <TabsTrigger value="staff">{t("الموظفون", "Staff")}</TabsTrigger>
          </TabsList>

          {/* ── Details Tab ── */}
          <TabsContent value="details" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="w-4 h-4 text-orange-500" />
                    {t("المعلومات الأساسية", "Basic Information")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <InfoRow label={t("كود الخدمة", "Service Code")} value={<span className="font-mono">{service.service_code}</span>} />
                  <InfoRow label={t("اسم الخدمة", "Service Name")} value={service.service_name} />
                  <InfoRow label={t("النوع", "Type")} value={isAr ? typeLabel?.ar : typeLabel?.en} />
                  <InfoRow label={t("الفئة", "Category")} value={service.category ?? <span className="text-muted-foreground">—</span>} />
                  <InfoRow label={t("الوصف", "Description")} value={service.description ?? <span className="text-muted-foreground">—</span>} />
                  {service.color_code && (
                    <InfoRow
                      label={t("اللون", "Color")}
                      value={
                        <span className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full border" style={{ backgroundColor: service.color_code }} />
                          {service.color_code}
                        </span>
                      }
                    />
                  )}
                </CardContent>
              </Card>

              {/* Pricing */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-orange-500" />
                    {t("التسعير", "Pricing")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <InfoRow
                    label={t("سعر البيع", "Unit Price")}
                    value={
                      <span className="text-green-700 dark:text-green-400 font-semibold tabular-nums">
                        {Number(service.unit_price).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} {service.currency_code}
                      </span>
                    }
                  />
                  <InfoRow
                    label={t("سعر التكلفة", "Cost Price")}
                    value={<span className="tabular-nums">{Number(service.cost_price).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} {service.currency_code}</span>}
                  />
                  <InfoRow label={t("نسبة الضريبة", "Tax Rate")}       value={`${Number(service.tax_rate).toFixed(2)}%`} />
                  <InfoRow label={t("نسبة العمولة", "Commission Rate")} value={`${Number(service.commission_rate).toFixed(2)}%`} />
                </CardContent>
              </Card>

              {/* Booking Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-500" />
                    {t("إعدادات الحجز", "Booking Settings")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <InfoRow label={t("مدة الخدمة", "Duration")}             value={`${service.duration_minutes} ${t("دقيقة", "min")}`} />
                  <InfoRow label={t("وقت الاستراحة", "Buffer")}            value={`${service.buffer_minutes} ${t("دقيقة", "min")}`} />
                  <InfoRow label={t("السعة القصوى", "Max Capacity")}        value={`${service.capacity} ${t("حجز", "booking(s)")}`} />
                  <InfoRow label={t("الحد الأدنى للحجز المسبق", "Min Advance")} value={`${service.min_advance_hours} ${t("ساعة", "hr(s)")}`} />
                  <InfoRow label={t("إلغاء قبل", "Cancel Before")}          value={`${service.cancel_before_hours} ${t("ساعة", "hr(s)")}`} />
                  <InfoRow label={t("أيام الحجز المسبق", "Advance Days")}   value={`${service.advance_booking_days} ${t("يوم", "day(s)")}`} />
                </CardContent>
              </Card>

              {/* Notes */}
              {service.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("ملاحظات", "Notes")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{service.notes}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ── Schedules Tab ── */}
          <TabsContent value="schedules" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-orange-500" />
                  {t("مواعيد العمل", "Working Schedules")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ServiceSchedulesEditor
                  value={schedules}
                  onChange={() => {}}
                  lang={appLang}
                  disabled
                />
                {canEdit && service.is_active && (
                  <div className="mt-4 flex justify-end">
                    <Link href={`/services/${id}/edit${q}`} prefetch={false}>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Pencil className="w-4 h-4" />
                        {t("تعديل المواعيد", "Edit Schedules")}
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Staff Tab ── */}
          <TabsContent value="staff" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-orange-500" />
                  {t("الموظفون المؤهلون", "Qualified Staff")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ServiceStaffManager
                  serviceId={id}
                  lang={appLang}
                  canEdit={canEdit && service.is_active}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Archive Dialog */}
        <ServiceArchiveDialog
          service={service}
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
          onConfirm={handleArchive}
          isLoading={isArchiving}
          lang={appLang}
        />
      </main>
    </div>
  )
}
