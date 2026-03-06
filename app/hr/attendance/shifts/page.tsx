"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { Plus, CheckCircle, XCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"

export default function ShiftsPage() {
    const supabase = useSupabase()
    const { toast } = useToast()
    const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
    const [companyId, setCompanyId] = useState<string>("")
    const [shifts, setShifts] = useState<any[]>([])
    const [branches, setBranches] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [isDialogOpen, setIsDialogOpen] = useState(false)

    const [formData, setFormData] = useState({
        shift_name: "",
        branch_id: "all",
        start_time: "09:00",
        end_time: "17:00",
        is_cross_day: false,
        grace_period_minutes: 15,
        late_threshold_minutes: 30,
        early_leave_threshold_minutes: 15,
    })

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
                loadShifts(cid)
                loadBranches(cid)
            }
        })()
    }, [supabase])

    const loadBranches = async (cid: string) => {
        try {
            const res = await fetch(`/api/branches?companyId=${cid}`)
            const data = res.ok ? await res.json() : []
            setBranches(Array.isArray(data) ? data : [])
        } catch { }
    }

    const loadShifts = async (cid: string) => {
        setLoading(true)
        try {
            const res = await fetch(`/api/hr/attendance/shifts`)
            const data = res.ok ? await res.json() : []
            setShifts(Array.isArray(data.data || data) ? (data.data || data) : [])
        } catch {
            setShifts([])
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            const res = await fetch('/api/hr/attendance/shifts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    branch_id: formData.branch_id === 'all' ? null : formData.branch_id
                })
            })

            if (res.ok) {
                toast({ title: t('Success', 'تم الحفظ بنجاح') })
                setIsDialogOpen(false)
                loadShifts(companyId)
            } else {
                toast({ title: t('Error', 'خطأ'), variant: "destructive" })
            }
        } catch {
            toast({ title: t('Network Error', 'خطأ في الشبكة'), variant: "destructive" })
        } finally {
            setSaving(false)
        }
    }

    const columns: DataTableColumn[] = [
        {
            key: "shift_name",
            header: t("Shift Name", "اسم الوردية"),
            type: "text",
        },
        {
            key: "branch",
            header: t("Branch", "الفرع"),
            type: "text",
            format: (val, row) => row.branches?.name || t('All Branches', 'جميع الفروع')
        },
        {
            key: "start_time",
            header: t("Start", "بداية"),
            type: "text",
            align: "center",
            format: (val) => val.slice(0, 5)
        },
        {
            key: "end_time",
            header: t("End", "نهاية"),
            type: "text",
            align: "center",
            format: (val) => val.slice(0, 5)
        },
        {
            key: "is_cross_day",
            header: t("Cross Day", "عبر منتصف الليل"),
            type: "custom",
            align: "center",
            format: (val) => val ? <CheckCircle className="w-5 h-5 text-emerald-500 mx-auto" /> : <XCircle className="w-5 h-5 text-gray-300 mx-auto" />
        },
        {
            key: "grace_period_minutes",
            header: t("Grace (min)", "السماح (دقيقة)"),
            type: "number",
            align: "center"
        }
    ]

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button onClick={() => setIsDialogOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                    <Plus className="w-4 h-4" />
                    {t('Add Shift', 'إضافة وردية')}
                </Button>
            </div>

            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-8 text-center text-gray-500">{t('Loading...', 'جاري التحميل...')}</div>
                    ) : (
                        <DataTable
                            columns={columns}
                            data={shifts}
                            keyField="id"
                            lang={appLang}
                            emptyMessage={t('No shifts defined', 'لا يوجد ورديات معرفة')}
                        />
                    )}
                </CardContent>
            </Card>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('Add Shift', 'إضافة وردية')}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>{t('Shift Name', 'اسم الوردية')}</Label>
                            <Input value={formData.shift_name} onChange={e => setFormData({ ...formData, shift_name: e.target.value })} />
                        </div>

                        <div className="grid gap-2">
                            <Label>{t('Apply to Branch', 'تطبيق على الفرع')}</Label>
                            <Select value={formData.branch_id} onValueChange={v => setFormData({ ...formData, branch_id: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t('All Branches', 'جميع الفروع')}</SelectItem>
                                    {branches.map(b => (
                                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>{t('Start Time', 'وقت البداية')}</Label>
                                <Input type="time" value={formData.start_time} onChange={e => setFormData({ ...formData, start_time: e.target.value })} />
                            </div>
                            <div className="grid gap-2">
                                <Label>{t('End Time', 'وقت النهاية')}</Label>
                                <Input type="time" value={formData.end_time} onChange={e => setFormData({ ...formData, end_time: e.target.value })} />
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-3 border rounded-lg bg-gray-50 dark:bg-slate-800">
                            <div>
                                <Label className="text-base">{t('Cross Day Shift', 'وردية ليلية')}</Label>
                                <p className="text-xs text-gray-500">{t('Enable if shift spans across midnight.', 'فعل هذا الخيار إذا كانت الوردية تعبر منتصف الليل.')}</p>
                            </div>
                            <Switch checked={formData.is_cross_day} onCheckedChange={checked => setFormData({ ...formData, is_cross_day: checked })} />
                        </div>

                        <div className="grid grid-cols-2 gap-4 border-t pt-4">
                            <div className="grid gap-2">
                                <Label>{t('Grace Minutes', 'دقائق السماح (تأخير)')}</Label>
                                <Input type="number" min={0} value={formData.grace_period_minutes} onChange={e => setFormData({ ...formData, grace_period_minutes: Number(e.target.value) })} />
                            </div>
                            <div className="grid gap-2">
                                <Label>{t('Late Threshold', 'احتساب الغياب (دقائق)')}</Label>
                                <Input type="number" min={0} value={formData.late_threshold_minutes} onChange={e => setFormData({ ...formData, late_threshold_minutes: Number(e.target.value) })} />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{t('Cancel', 'إلغاء')}</Button>
                        <Button disabled={saving} onClick={handleSave}>{t('Save', 'حفظ')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
