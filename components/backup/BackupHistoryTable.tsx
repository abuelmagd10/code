"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Download,
  Trash2,
  Loader2,
  ShieldCheck,
  ShieldOff,
  Clock,
  HardDrive,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export interface BackupHistoryRow {
  id: string
  created_at: string
  created_by: string | null
  storage_path: string
  file_size_bytes: number
  is_encrypted: boolean
  system_version: string
  schema_version: string | null
  total_records: number
  table_count: number
  checksum: string | null
  status: string
  expires_at: string | null
  notes: string | null
}

export interface BackupHistoryTableProps {
  language: "ar" | "en"
  /** Bump this number whenever a new backup is created to force a refresh. */
  refreshKey?: number
  /** Whether the current user can delete (owner-only). */
  canDelete?: boolean
}

const L = {
  ar: {
    title: "سجل النسخ الاحتياطية",
    subtitle: "أحدث النسخ المحفوظة على الخادم (تبقى لمدة 30 يوماً)",
    refresh: "تحديث",
    empty: "لا توجد نسخ احتياطية محفوظة بعد. اضغط على \"تصدير\" لإنشاء أول نسخة.",
    loading: "جاري التحميل...",
    encrypted: "مُشفَّر",
    plain: "نص واضح",
    download: "تحميل",
    delete: "حذف",
    columns: {
      created: "التاريخ",
      size: "الحجم",
      records: "السجلات",
      version: "الإصدار",
      security: "الأمان",
      expires: "ينتهى",
      actions: "إجراءات",
    },
    confirmDeleteTitle: "تأكيد حذف النسخة",
    confirmDeleteBody: "هل أنت متأكد من حذف هذه النسخة الاحتياطية نهائياً؟ لا يمكن التراجع عن هذا الإجراء.",
    confirmDeleteOk: "نعم، احذف",
    confirmDeleteCancel: "إلغاء",
    expiresIn: "بعد",
    days: "يوم",
    today: "اليوم",
    expired: "منتهية",
  },
  en: {
    title: "Backup history",
    subtitle: "Most recent backups stored on the server (kept for 30 days)",
    refresh: "Refresh",
    empty: 'No backups stored yet. Click "Export" to create your first.',
    loading: "Loading...",
    encrypted: "Encrypted",
    plain: "Plain",
    download: "Download",
    delete: "Delete",
    columns: {
      created: "Date",
      size: "Size",
      records: "Records",
      version: "Version",
      security: "Security",
      expires: "Expires",
      actions: "Actions",
    },
    confirmDeleteTitle: "Confirm delete",
    confirmDeleteBody: "Are you sure you want to permanently delete this backup? This cannot be undone.",
    confirmDeleteOk: "Yes, delete",
    confirmDeleteCancel: "Cancel",
    expiresIn: "in",
    days: "days",
    today: "today",
    expired: "expired",
  },
}

function formatBytes(bytes: number, lang: "ar" | "en"): string {
  const locale = lang === "ar" ? "ar-EG" : "en-US"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString(locale, { maximumFractionDigits: 1 })} KB`
  return `${(bytes / (1024 * 1024)).toLocaleString(locale, { maximumFractionDigits: 2 })} MB`
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  return Math.ceil(diff / (24 * 60 * 60 * 1000))
}

export function BackupHistoryTable({
  language,
  refreshKey = 0,
  canDelete = false,
}: BackupHistoryTableProps) {
  const t = L[language]
  const dir = language === "ar" ? "rtl" : "ltr"

  const [rows, setRows] = useState<BackupHistoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/backup/list?limit=20", { credentials: "same-origin" })
      const payload = await response.json()
      setRows(Array.isArray(payload?.backups) ? payload.backups : [])
    } catch (err) {
      console.error("[BackupHistory] load error:", err)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const handleDownload = async (id: string) => {
    setDownloadingId(id)
    try {
      const response = await fetch(`/api/backup/${id}/download`, { credentials: "same-origin" })
      const payload = await response.json()
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "Failed")
      }
      // The signed URL now carries Content-Disposition: attachment (set
      // server-side), so navigating to it triggers a real file download.
      // We must NOT use target="_blank" — that opens a new tab and the
      // browser renders the JSON inline instead of saving it.
      const a = document.createElement("a")
      a.href = payload.url
      if (payload.filename) a.download = payload.filename
      a.rel = "noopener"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err) {
      console.error("[BackupHistory] download error:", err)
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/backup/${deleteId}`, {
        method: "DELETE",
        credentials: "same-origin",
      })
      if (response.ok) {
        setRows((cur) => cur.filter((r) => r.id !== deleteId))
      }
    } catch (err) {
      console.error("[BackupHistory] delete error:", err)
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  const locale = language === "ar" ? "ar-EG" : "en-US"

  return (
    <Card dir={dir}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-blue-600" />
            {t.title}
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ms-2">{t.refresh}</span>
        </Button>
      </CardHeader>
      <CardContent>
        {loading && rows.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            {t.loading}
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">{t.empty}</div>
        )}
        {rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-2 py-2 text-start font-medium">{t.columns.created}</th>
                  <th className="px-2 py-2 text-start font-medium">{t.columns.size}</th>
                  <th className="px-2 py-2 text-start font-medium">{t.columns.records}</th>
                  <th className="px-2 py-2 text-start font-medium">{t.columns.version}</th>
                  <th className="px-2 py-2 text-start font-medium">{t.columns.security}</th>
                  <th className="px-2 py-2 text-start font-medium">{t.columns.expires}</th>
                  <th className="px-2 py-2 text-end font-medium">{t.columns.actions}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const days = daysUntil(row.expires_at)
                  let expiresLabel = ""
                  if (days === null) expiresLabel = "—"
                  else if (days <= 0) expiresLabel = t.expired
                  else if (days === 1) expiresLabel = `${t.expiresIn} 1 ${t.days}`
                  else expiresLabel = `${t.expiresIn} ${days} ${t.days}`

                  const expiresWarn = days !== null && days >= 0 && days <= 3

                  return (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-2 py-2 whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString(locale, {
                          year: "numeric", month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">{formatBytes(row.file_size_bytes, language)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {row.total_records.toLocaleString(locale)}
                        <span className="ms-1 text-xs text-muted-foreground">/ {row.table_count}</span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <Badge variant="outline" className="text-[10px]">{row.system_version}</Badge>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {row.is_encrypted ? (
                          <Badge className="bg-emerald-600 text-white"><ShieldCheck className="me-1 h-3 w-3" />{t.encrypted}</Badge>
                        ) : (
                          <Badge variant="secondary"><ShieldOff className="me-1 h-3 w-3" />{t.plain}</Badge>
                        )}
                      </td>
                      <td className={"px-2 py-2 whitespace-nowrap " + (expiresWarn ? "text-amber-600 font-medium" : "")}>
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {expiresLabel}
                        </span>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-end">
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={downloadingId === row.id}
                            onClick={() => void handleDownload(row.id)}
                          >
                            {downloadingId === row.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                            <span className="ms-1 hidden sm:inline">{t.download}</span>
                          </Button>
                          {canDelete && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => setDeleteId(row.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir={dir}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.confirmDeleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.confirmDeleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.confirmDeleteCancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={(e) => { e.preventDefault(); void handleDeleteConfirm() }}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : <Trash2 className="me-1 h-4 w-4" />}
              {t.confirmDeleteOk}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
