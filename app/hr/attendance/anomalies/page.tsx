"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { AlertTriangle, CheckCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

export default function AnomaliesPage() {
    const supabase = useSupabase()
    const { toast } = useToast()
    const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
    const [companyId, setCompanyId] = useState<string>("")
    const [anomalies, setAnomalies] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [resolving, setResolving] = useState(false)
    const [selectedLog, setSelectedLog] = useState<any>(null)
    const [resolutionNotes, setResolutionNotes] = useState("")

    useEffect(() => {
        const handler = () => {
            const v = localStorage.getItem('app_language') || 'ar'
            setAppLang(v === 'en' ? 'en' : 'ar')
        }
        handler()
    }, [])
    const t = (en: string, ar: string) => appLang === 'en' ? en : ar

    useEffect(() => {
        (async () => {
            const cid = await getActiveCompanyId(supabase)
            if (cid) {
                setCompanyId(cid)
                loadAnomalies(cid)
            }
        })()
    }, [supabase])

    const loadAnomalies = async (cid: string) => {
        setLoading(true)
        try {
            const res = await fetch(`/api/hr/attendance/anomalies`)
            const data = res.ok ? await res.json() : []
            setAnomalies(Array.isArray(data.data || data) ? (data.data || data) : [])
        } catch {
            setAnomalies([])
        } finally {
            setLoading(false)
        }
    }

    const handleResolve = async () => {
        if (!selectedLog) return
        setResolving(true)
        try {
            const res = await fetch('/api/hr/attendance/anomalies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    log_id: selectedLog.id,
                    action: 'resolve',
                    resolution_notes: resolutionNotes
                })
            })

            if (res.ok) {
                toast({ title: t('Anomaly Resolved', 'تم حل الحالة الشاذة') })
                setSelectedLog(null)
                setResolutionNotes("")
                loadAnomalies(companyId)
            } else {
                toast({ title: t('Error', 'خطأ'), variant: "destructive" })
            }
        } catch {
            toast({ title: t('Network Error', 'خطأ في الشبكة'), variant: "destructive" })
        } finally {
            setResolving(false)
        }
    }

    const columns: DataTableColumn[] = [
        {
            key: "log_time",
            header: t("Time", "الوقت"),
            type: "date",
            width: "w-[180px]",
            sortable: true
        },
        {
            key: "employee",
            header: t("Employee", "الموظف"),
            type: "text",
            format: (val, row) => row.employees?.full_name || 'Unknown'
        },
        {
            key: "log_type",
            header: t("Type", "النوع"),
            type: "text",
            align: "center",
            format: (val) => (
                <span className={`px-2 py-1 text-xs rounded-full font-medium ${val === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {val}
                </span>
            )
        },
        {
            key: "anomaly_reason",
            header: t("Reason", "السبب"),
            type: "text",
            format: (val) => (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{val}</span>
                </div>
            )
        },
        {
            key: 'actions',
            header: t('Actions', 'إجراءات'),
            type: 'custom',
            align: 'center',
            format: (val, row) => (
                <Button size="sm" variant="outline" onClick={() => setSelectedLog(row)}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {t('Resolve', 'معالجة')}
                </Button>
            )
        }
    ]

    return (
        <div className="space-y-4">
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-8 text-center text-gray-500">{t('Loading...', 'جاري التحميل...')}</div>
                    ) : (
                        <DataTable
                            columns={columns}
                            data={anomalies}
                            keyField="id"
                            lang={appLang}
                            emptyMessage={t('No anomalies found, all good!', 'لا توجد حالات شاذة، الأمور ممتازة!')}
                        />
                    )}
                </CardContent>
            </Card>

            <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('Resolve Anomaly', 'معالجة الحالة الشاذة')}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-gray-500 mb-4">
                            {t('Record notes for resolving this anomaly:', 'اكتب ملاحظات حول كيفية معالجة هذه الحالة:')}
                        </p>
                        <Label>{t('Resolution Notes', 'ملاحظات المعالجة')}</Label>
                        <Input
                            value={resolutionNotes}
                            onChange={e => setResolutionNotes(e.target.value)}
                            placeholder={t('e.g. Approved extra overtime, or ignored duplicate...', 'مثال: تم اعتماد تأخير مبرر، أو تجاهل المكرر')}
                            className="mt-2"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedLog(null)}>{t('Cancel', 'إلغاء')}</Button>
                        <Button disabled={resolving} onClick={handleResolve}>{t('Confirm Resolve', 'تأكيد المعالجة')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
