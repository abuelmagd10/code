"use client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { PageHeaderList } from "@/components/PageHeader"
import { Settings, Save } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export default function AttendanceSettingsPage() {
    const supabase = useSupabase()
    const { toast } = useToast()
    const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
    const [companyId, setCompanyId] = useState<string>("")
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)

    const [settings, setSettings] = useState({
        deduct_late: true,
        late_deduction_type: 'exact_minutes',
        late_multiplier: 1.0,
        deduct_early_leave: true,
        early_leave_multiplier: 1.0,
        pay_overtime: true,
        overtime_multiplier: 1.5,
        deduct_absence: true,
        absence_day_deduction: 1.0,
    })

    useEffect(() => {
        const handler = () => {
            try {
                const v = localStorage.getItem('app_language') || 'ar'
                setAppLang(v === 'en' ? 'en' : 'ar')
            } catch { }
        }
        handler()
        window.addEventListener('app_language_changed', handler)
        return () => window.removeEventListener('app_language_changed', handler)
    }, [])
    const t = (en: string, ar: string) => appLang === 'en' ? en : ar

    useEffect(() => {
        (async () => {
            const cid = await getActiveCompanyId(supabase);
            if (cid) {
                setCompanyId(cid);
                loadSettings(cid);
            }
        })()
    }, [supabase])

    const loadSettings = async (cid: string) => {
        setLoading(true)
        try {
            const res = await fetch(`/api/hr/attendance/settings?companyId=${cid}`)
            const data = await res.json()
            if (res.ok && data && Object.keys(data).length > 0) {
                setSettings(prev => ({ ...prev, ...data }))
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    const saveSettings = async () => {
        setSaving(true)
        try {
            const res = await fetch('/api/hr/attendance/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyId, ...settings })
            })
            if (res.ok) {
                toast({ title: t('Settings Saved', 'تم حفظ الإعدادات بنجاح') })
            } else {
                toast({ title: t('Error saving', 'خطأ في الحفظ'), variant: 'destructive' })
            }
        } catch {
            toast({ title: t('Network error', 'خطأ في الاتصال'), variant: 'destructive' })
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div className="p-8 text-center">{t('Loading...', 'جاري التحميل...')}</div>

    return (
        <div className="space-y-6 max-w-4xl">
            <PageHeaderList
                title={t('Payroll Integration Settings', 'إعدادات ربط الرواتب')}
                description={t('Configure how attendance records affect payroll processing', 'حدد كيفية تأثير الحضور والانصراف على مسير الرواتب')}
                icon={Settings}
                additionalActions={[
                    {
                        label: t('Save Settings', 'حفظ الإعدادات'),
                        icon: Save,
                        onClick: saveSettings,
                        variant: "default",
                        className: "bg-blue-600 hover:bg-blue-700 text-white"
                    }
                ]}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg text-amber-600">{t('Late Policy', 'سياسة التأخير')}</CardTitle>
                        <CardDescription>{t('How to handle late check-ins', 'كيفية التعامل مع التأخير في الحضور')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <label className="font-medium text-sm">{t('Deduct from Payroll', 'خصم من الراتب')}</label>
                            <Switch checked={settings.deduct_late} onCheckedChange={(v) => setSettings({ ...settings, deduct_late: v })} />
                        </div>
                        {settings.deduct_late && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('Multiplier (e.g. 1 min late = 1 min deduct, or 1.5)', 'معامل الخصم (مثال: دقيقة التأخير بـ 1.5 دقيقة خصم)')}</label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={settings.late_multiplier}
                                    onChange={(e) => setSettings({ ...settings, late_multiplier: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg text-emerald-600">{t('Overtime Policy', 'سياسة العمل الإضافي')}</CardTitle>
                        <CardDescription>{t('How to handle overtime worked hours', 'كيفية مكافأة العمل الإضافي')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <label className="font-medium text-sm">{t('Pay Overtime Allowance', 'صرف كإضافي مالي')}</label>
                            <Switch checked={settings.pay_overtime} onCheckedChange={(v) => setSettings({ ...settings, pay_overtime: v })} />
                        </div>
                        {settings.pay_overtime && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('Multiplier (Standard is 1.5x)', 'معامل الإضافة (المعتاد هو 1.5)')}</label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={settings.overtime_multiplier}
                                    onChange={(e) => setSettings({ ...settings, overtime_multiplier: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg text-rose-600">{t('Early Leave Policy', 'سياسة الخروج المبكر')}</CardTitle>
                        <CardDescription>{t('How to handle leaving before shift ends', 'كيفية التعامل مع الانصراف قبل نهاية الدوام')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <label className="font-medium text-sm">{t('Deduct from Payroll', 'خصم من الراتب')}</label>
                            <Switch checked={settings.deduct_early_leave} onCheckedChange={(v) => setSettings({ ...settings, deduct_early_leave: v })} />
                        </div>
                        {settings.deduct_early_leave && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('Multiplier', 'معامل الخصم')}</label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={settings.early_leave_multiplier}
                                    onChange={(e) => setSettings({ ...settings, early_leave_multiplier: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg text-red-600">{t('Absence Policy', 'سياسة الغياب')}</CardTitle>
                        <CardDescription>{t('How to handle unexcused absences', 'كيفية التعامل مع الغياب بدون عذر')}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex items-center justify-between">
                            <label className="font-medium text-sm">{t('Deduct Absence Days', 'خصم أيام الغياب')}</label>
                            <Switch checked={settings.deduct_absence} onCheckedChange={(v) => setSettings({ ...settings, deduct_absence: v })} />
                        </div>
                        {settings.deduct_absence && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('Days Deduction Per Absence (e.g. 1 or 2 days)', 'عدد أيام الخصم ليوم الغياب (مثلاً خصم يوم أو يومين)')}</label>
                                <Input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={settings.absence_day_deduction}
                                    onChange={(e) => setSettings({ ...settings, absence_day_deduction: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
