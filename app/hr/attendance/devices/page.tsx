"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { Wifi, RefreshCw, Cpu } from "lucide-react"
import { AddDeviceModal } from "./AddDeviceModal"

export default function DevicesPage() {
    const supabase = useSupabase()
    const { toast } = useToast()
    const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
    const [companyId, setCompanyId] = useState<string>("")
    const [devices, setDevices] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [syncingId, setSyncingId] = useState<string | null>(null)

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
                loadDevices(cid)
            }
        })()
    }, [supabase])

    const loadDevices = async (cid: string) => {
        setLoading(true)
        try {
            const res = await fetch(`/api/hr/attendance/devices`)
            const data = res.ok ? await res.json() : []
            setDevices(Array.isArray(data.data || data) ? (data.data || data) : [])
        } catch {
            setDevices([])
        } finally {
            setLoading(false)
        }
    }

    const handleTestConnection = async (deviceId: string) => {
        setSyncingId(deviceId)
        try {
            const res = await fetch('/api/biometric/device/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ company_id: companyId, device_id: deviceId })
            })

            if (res.ok) {
                const j = await res.json()
                toast({ title: t('Connection Successful', 'الاتصال ناجح'), description: j.message })
                loadDevices(companyId)
            } else {
                const err = await res.json()
                toast({ title: t('Connection Failed', 'فشل الاتصال'), description: err.error, variant: "destructive" })
            }
        } catch {
            toast({ title: t('Network Error', 'خطأ في الشبكة'), variant: "destructive" })
        } finally {
            setSyncingId(null)
        }
    }

    const columns: DataTableColumn[] = [
        {
            key: "device_name",
            header: t("Device Name", "اسم الجهاز"),
            type: "text"
        },
        {
            key: "branch",
            header: t("Branch", "الفرع"),
            type: "text",
            format: (val, row) => row.branches?.name || '-'
        },
        {
            key: "device_ip",
            header: "IP",
            type: "text",
        },
        {
            key: "status",
            header: t("Status", "الحالة"),
            type: "custom",
            align: "center",
            format: (val) => (
                <span className={`flex items-center gap-1 text-sm font-medium ${val === 'online' ? 'text-emerald-600' : 'text-gray-500'}`}>
                    <Wifi className="w-4 h-4" />
                    {val === 'online' ? t('Online', 'متصل') : t('Offline', 'مفصول')}
                </span>
            )
        },
        {
            key: "last_sync_at",
            header: t("Last Sync", "آخر مزامنة"),
            type: "date",
        },
        {
            key: 'actions',
            header: t('Actions', 'إجراءات'),
            type: 'custom',
            align: 'center',
            format: (val, row) => (
                <Button size="sm" variant="outline" onClick={() => handleTestConnection(row.id)} disabled={syncingId === row.id}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${syncingId === row.id ? 'animate-spin' : ''}`} />
                    {t('Test Connection', 'اختبار الاتصال')}
                </Button>
            )
        }
    ]

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-2">
                    <Cpu className="text-emerald-500 w-8 h-8" />
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            {t('Biometric Devices', 'أجهزة البصمة')}
                        </h1>
                        <p className="text-sm text-gray-500">
                            {t('Manage attendance devices and link employee biometric IDs.', 'إدارة أجهزة الحضور وربط بصمات الموظفين.')}
                        </p>
                    </div>
                </div>

                <AddDeviceModal
                    companyId={companyId}
                    appLang={appLang}
                    onSuccess={() => loadDevices(companyId)}
                />
            </div>

            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-8 text-center text-gray-500">{t('Loading...', 'جاري التحميل...')}</div>
                    ) : (
                        <DataTable
                            columns={columns}
                            data={devices}
                            keyField="id"
                            lang={appLang}
                            emptyMessage={t('No devices found', 'لا توجد أجهزة مضافة')}
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
