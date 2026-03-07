"use client"
import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Settings } from "lucide-react"

interface PayrollSettingsDialogProps {
    companyId: string
    appLang: 'ar' | 'en'
}

export function PayrollSettingsDialog({ companyId, appLang }: PayrollSettingsDialogProps) {
    const { toast } = useToast()
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    const [settings, setSettings] = useState({
        deduct_late: true,
        late_deduction_type: 'exact_minutes',
        late_multiplier: 1.0,
        deduct_early_leave: true,
        early_leave_multiplier: 1.0,
        pay_overtime: true,
        overtime_multiplier: 1.5,
        deduct_absence: true,
        absence_day_deduction: 1.0
    })

    const t = (en: string, ar: string) => appLang === 'en' ? en : ar

    useEffect(() => {
        if (open && companyId) {
            loadSettings()
        }
    }, [open, companyId])

    const loadSettings = async () => {
        try {
            setLoading(true)
            const res = await fetch(`/api/hr/payroll/settings?companyId=${companyId}`)
            if (res.ok) {
                const data = await res.json()
                setSettings(data)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        try {
            setLoading(true)
            const res = await fetch(`/api/hr/payroll/settings?companyId=${companyId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            })
            if (res.ok) {
                toast({
                    title: t('Saved successfully', 'تم الحفظ بنجاح'),
                    description: t('Payroll settings updated.', 'تم تحديث إعدادات مسير الرواتب.')
                })
                setOpen(false)
            } else {
                const err = await res.json()
                toast({
                    title: t('Error', 'خطأ'),
                    description: err.error || t('Failed to save', 'فشل الحفظ'),
                    variant: 'destructive'
                })
            }
        } catch (err) {
            toast({
                title: t('Network Error', 'خطأ في الشبكة'),
                variant: 'destructive'
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="no-print">
                    <Settings className="h-4 w-4 mr-2 ml-2" />
                    {t('Payroll Settings', 'إعدادات المرتبات')}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('Attendance & Payroll Policies', 'سياسات الحضور والمرتبات')}</DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">

                    {/* Late Policy */}
                    <div className="space-y-4 rounded-lg border p-4">
                        <div className="flex items-center justify-between">
                            <Label className="text-base font-semibold">{t('Deduct for Late Arrival', 'خصم التأخير')}</Label>
                            <Switch checked={settings.deduct_late} onCheckedChange={(v) => setSettings({ ...settings, deduct_late: v })} />
                        </div>
                        {settings.deduct_late && (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <Label>{t('Deduction Type', 'نوع الخصم')}</Label>
                                    <select
                                        className="w-full px-3 py-2 border rounded-md mt-1 text-sm bg-background"
                                        value={settings.late_deduction_type}
                                        onChange={(e) => setSettings({ ...settings, late_deduction_type: e.target.value })}
                                    >
                                        <option value="exact_minutes">{t('Exact Minutes', 'بالدقيقة الدقيقة')}</option>
                                    </select>
                                </div>
                                <div>
                                    <Label>{t('Multiplier (e.g., 1.5x)', 'المضاعف (مثال 1.5x)')}</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        step="0.1"
                                        value={settings.late_multiplier}
                                        onChange={(e) => setSettings({ ...settings, late_multiplier: Number(e.target.value) })}
                                        className="mt-1"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Early Leave Policy */}
                    <div className="space-y-4 rounded-lg border p-4">
                        <div className="flex items-center justify-between">
                            <Label className="text-base font-semibold">{t('Deduct for Early Leave', 'خصم المغادرة المبكرة')}</Label>
                            <Switch checked={settings.deduct_early_leave} onCheckedChange={(v) => setSettings({ ...settings, deduct_early_leave: v })} />
                        </div>
                        {settings.deduct_early_leave && (
                            <div>
                                <Label>{t('Multiplier (e.g., 1.0x)', 'المضاعف (مثال 1.0x)')}</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    step="0.1"
                                    value={settings.early_leave_multiplier}
                                    onChange={(e) => setSettings({ ...settings, early_leave_multiplier: Number(e.target.value) })}
                                    className="mt-1 max-w-xs"
                                />
                            </div>
                        )}
                    </div>

                    {/* Overtime Policy */}
                    <div className="space-y-4 rounded-lg border p-4">
                        <div className="flex items-center justify-between">
                            <Label className="text-base font-semibold">{t('Pay Overtime', 'احتساب الوقت الإضافي')}</Label>
                            <Switch checked={settings.pay_overtime} onCheckedChange={(v) => setSettings({ ...settings, pay_overtime: v })} />
                        </div>
                        {settings.pay_overtime && (
                            <div>
                                <Label>{t('Overtime Multiplier (Standard: 1.5x)', 'مضاعف الإضافي (الافتراضي 1.5x)')}</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    step="0.1"
                                    value={settings.overtime_multiplier}
                                    onChange={(e) => setSettings({ ...settings, overtime_multiplier: Number(e.target.value) })}
                                    className="mt-1 max-w-xs"
                                />
                            </div>
                        )}
                    </div>

                    {/* Absence Policy */}
                    <div className="space-y-4 rounded-lg border p-4">
                        <div className="flex items-center justify-between">
                            <Label className="text-base font-semibold">{t('Deduct for Absence', 'خصم الغياب')}</Label>
                            <Switch checked={settings.deduct_absence} onCheckedChange={(v) => setSettings({ ...settings, deduct_absence: v })} />
                        </div>
                        {settings.deduct_absence && (
                            <div>
                                <Label>{t('Days to Deduct for 1 Day Absent', 'أيام الخصم لكل يوم غياب (مثال 1 أو 2)')}</Label>
                                <Input
                                    type="number"
                                    min="1"
                                    step="0.1"
                                    value={settings.absence_day_deduction}
                                    onChange={(e) => setSettings({ ...settings, absence_day_deduction: Number(e.target.value) })}
                                    className="mt-1 max-w-xs"
                                />
                            </div>
                        )}
                    </div>

                </div>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>{t('Cancel', 'إلغاء')}</Button>
                    <Button onClick={handleSave} disabled={loading}>{t('Save Settings', 'حفظ الإعدادات')}</Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
