"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { Eye, Pencil, Archive, Clock, Users, Link2 } from "lucide-react"
import Link from "next/link"
import type { Service } from "@/types/services"

interface ServicesTableProps {
  data: Service[]
  lang?: string
  onArchive?: (service: Service) => void
  canEdit?: boolean
  canDelete?: boolean
  productsMap?: Record<string, { name: string; sku?: string }>
}

const SERVICE_TYPE_LABELS: Record<string, { ar: string; en: string; color: string }> = {
  individual: { ar: "فردي",    en: "Individual", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  group:      { ar: "جماعي",  en: "Group",       color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  hourly:     { ar: "بالساعة",en: "Hourly",      color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  session:    { ar: "بالجلسة",en: "Session",     color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  daily:      { ar: "يومي",   en: "Daily",       color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
}

export function ServicesTable({
  data,
  lang = "ar",
  onArchive,
  canEdit = true,
  canDelete = false,
  productsMap = {},
}: ServicesTableProps) {
  const isAr = lang !== "en"
  const t = (ar: string, en: string) => (isAr ? ar : en)

  const columns: DataTableColumn<Service>[] = [
    {
      key: "service_code",
      header: t("الكود", "Code"),
      format: (_, row) => (
        <span className="font-mono text-xs text-muted-foreground">{row.service_code}</span>
      ),
    },
    {
      key: "service_name",
      header: t("اسم الخدمة", "Service Name"),
      format: (_, row) => (
        <div className="flex items-center gap-2">
          {row.color_code && (
            <span
              className="w-3 h-3 rounded-full flex-shrink-0 border border-border"
              style={{ backgroundColor: row.color_code }}
            />
          )}
          <span className="font-medium">{row.service_name}</span>
        </div>
      ),
    },
    {
      key: "service_type",
      header: t("النوع", "Type"),
      format: (_, row) => {
        const meta = SERVICE_TYPE_LABELS[row.service_type] ?? SERVICE_TYPE_LABELS.individual!
        return (
          <Badge className={`${meta.color} border-0 text-xs`}>
            {isAr ? meta.ar : meta.en}
          </Badge>
        )
      },
    },
    {
      key: "unit_price",
      header: t("السعر", "Price"),
      align: "right" as const,
      format: (_, row) => (
        <span className="font-semibold text-green-700 dark:text-green-400 tabular-nums">
          {Number(row.unit_price).toLocaleString("ar-EG", { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: "duration_minutes",
      header: t("المدة", "Duration"),
      format: (_, row) => (
        <span className="flex items-center gap-1 text-muted-foreground text-sm">
          <Clock className="w-3.5 h-3.5" />
          {row.duration_minutes} {t("د", "m")}
        </span>
      ),
    },
    {
      key: "capacity",
      header: t("السعة", "Cap."),
      format: (_, row) => (
        <span className="flex items-center gap-1 text-muted-foreground text-sm">
          <Users className="w-3.5 h-3.5" />
          {row.capacity}
        </span>
      ),
    },
    {
      key: "product_catalog_id",
      header: t("صنف الكتالوج", "Catalog SKU"),
      align: "center" as const,
      format: (_, row) => {
        if (!row.product_catalog_id) {
          return <span className="text-muted-foreground text-xs">—</span>
        }
        const p = productsMap[row.product_catalog_id]
        return (
          <span
            title={p?.name ?? t("مرتبط بكتالوج المنتجات", "Linked to product catalog")}
            className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 font-mono text-xs"
          >
            <Link2 className="w-3.5 h-3.5" />
            {p?.sku ?? row.product_catalog_id.slice(0, 8)}
          </span>
        )
      },
    },
    {
      key: "is_bookable",
      header: t("قابل للحجز", "Bookable"),
      align: "center" as const,
      format: (_, row) => (
        <Badge
          variant={row.is_bookable ? "default" : "secondary"}
          className={row.is_bookable
            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-0"
            : ""}
        >
          {row.is_bookable ? t("نعم", "Yes") : t("لا", "No")}
        </Badge>
      ),
    },
    {
      key: "is_active",
      header: t("الحالة", "Status"),
      align: "center" as const,
      format: (_, row) => (
        <Badge
          className={row.is_active
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0"
            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-0"}
        >
          {row.is_active ? t("نشط", "Active") : t("مؤرشف", "Archived")}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: t("إجراءات", "Actions"),
      align: "center" as const,
      type: "actions" as const,
      format: (_, row) => (
        <div className="flex items-center justify-center gap-1">
          <Link href={`/services/${row.id}`} prefetch={false}>
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
              <Eye className="w-4 h-4" />
            </Button>
          </Link>
          {canEdit && row.is_active && (
            <Link href={`/services/${row.id}/edit`} prefetch={false}>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                <Pencil className="w-4 h-4" />
              </Button>
            </Link>
          )}
          {canDelete && row.is_active && onArchive && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              onClick={() => onArchive(row)}
            >
              <Archive className="w-4 h-4" />
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={data}
      keyField="id"
      emptyMessage={t("لا توجد خدمات", "No services found")}
      lang={isAr ? "ar" : "en"}
    />
  )
}
