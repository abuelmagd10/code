"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Plus, Trash2 } from "lucide-react"
import { useSupabase } from "@/lib/supabase/hooks"

interface Employee {
    id: string;
    full_name: string;
    biometric_id: string | null;
}

interface Branch {
    id: string;
    name: string;
}

export function AddDeviceModal({ companyId, appLang, onSuccess }: { companyId: string, appLang: 'ar' | 'en', onSuccess: (deviceId: string) => void }) {
    const t = (en: string, ar: string) => appLang === 'en' ? en : ar
    const { toast } = useToast()
    const supabase = useSupabase()

    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)

    // Form state
    const [name, setName] = useState('')
    const [ip, setIp] = useState('')
    const [port, setPort] = useState('4370')
    const [branchId, setBranchId] = useState('')
    const [status, setStatus] = useState('online')
    const [deviceType, setDeviceType] = useState('Fingerprint')
    const [apiToken, setApiToken] = useState('')

    // Employee mappings
    const [mappings, setMappings] = useState<{ employee_id: string, biometric_id: string }[]>([])

    // Data state
    const [branches, setBranches] = useState<Branch[]>([])
    const [employees, setEmployees] = useState<Employee[]>([])

    useEffect(() => {
        if (open && companyId) {
            loadData()
        }
    }, [open, companyId])

    const loadData = async () => {
        try {
            const [brRes, empRes] = await Promise.all([
                supabase.from('branches').select('id, name').eq('company_id', companyId).order('name'),
                fetch(`/api/hr/employees?companyId=${companyId}`).then(res => res.json())
            ])
            if (brRes.data) setBranches(brRes.data)
            if (empRes) setEmployees(Array.isArray(empRes.data) ? empRes.data : Array.isArray(empRes) ? empRes : [])
        } catch (e) {
            console.error("Failed to load reference data", e)
        }
    }

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen)
        if (!isOpen) {
            // Reset form
            setName('')
            setIp('')
            setPort('4370')
            setBranchId('')
            setStatus('online')
            setDeviceType('Fingerprint')
            setApiToken('')
            setMappings([])
        }
    }

    const addMapping = () => {
        setMappings([...mappings, { employee_id: '', biometric_id: '' }])
    }

    const updateMapping = (index: number, field: 'employee_id' | 'biometric_id', value: string) => {
        const newMappings = [...mappings]
        newMappings[index][field] = value
        setMappings(newMappings)
    }

    const removeMapping = (index: number) => {
        setMappings(mappings.filter((_, i) => i !== index))
    }

    const handleSubmit = async () => {
        if (!name || !branchId || !ip) {
            toast({ title: t('Validation Error', 'خطأ في التحقق'), description: t('Name, IP, and Branch are required', 'الاسم، IP، والفرع مطلوبين'), variant: "destructive" })
            return
        }

        const portNum = parseInt(port)
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
            toast({ title: t('Validation Error', 'خطأ في التحقق'), description: t('Invalid Port', 'منفذ غير صحيح'), variant: "destructive" })
            return
        }

        // Validate mapping duplicates
        const mappedIds = mappings.map(m => m.biometric_id).filter(Boolean)
        if (new Set(mappedIds).size !== mappedIds.length) {
            toast({ title: t('Validation Error', 'خطأ في التحقق'), description: t('Duplicate Biometric IDs found', 'تم العثور على أرقام بصمة مكررة'), variant: "destructive" })
            return
        }

        setLoading(true)
        try {
            const fullIp = `${ip}:${port}`
            const payload = {
                device_name: name,
                device_ip: fullIp,
                branch_id: branchId,
                status,
                device_type: deviceType,
                api_token: apiToken || undefined,
                employee_mappings: mappings.filter(m => m.employee_id && m.biometric_id)
            }

            const res = await fetch(`/api/hr/attendance/devices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            const data = await res.json()

            if (res.ok) {
                toast({ title: t('Success', 'تم بنجاح'), description: t('Device added successfully', 'تمت إضافة الجهاز بنجاح') })
                onSuccess(data.data?.device?.id)
                handleOpenChange(false)
            } else {
                toast({ title: t('Error', 'خطأ'), description: data.error || t('Failed to add device', 'فشل إضافة الجهاز'), variant: "destructive" })
            }
        } catch (e: any) {
            toast({ title: t('Error', 'خطأ'), description: e.message, variant: "destructive" })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0" />
                    {t('Add Device', 'إضافة جهاز')}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('Add Biometric Device', 'إضافة جهاز بصمة')}</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-4 py-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('Device Name', 'اسم الجهاز')} *</label>
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Main Gate" />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('Branch', 'الفرع')} *</label>
                        <Select value={branchId} onValueChange={setBranchId}>
                            <SelectTrigger>
                                <SelectValue placeholder={t('Select Branch', 'اختر الفرع')} />
                            </SelectTrigger>
                            <SelectContent>
                                {branches.map(b => (
                                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('IP Address', 'عنوان IP')} *</label>
                        <Input value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.1.200" dir="ltr" />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('Port', 'المنفذ')} *</label>
                        <Input value={port} onChange={e => setPort(e.target.value)} type="number" dir="ltr" />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('Device Type', 'نوع الجهاز')}</label>
                        <Select value={deviceType} onValueChange={setDeviceType}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Fingerprint">{t('Fingerprint', 'بصمة إصبع')}</SelectItem>
                                <SelectItem value="Face">{t('Face Recognition', 'بصمة وجه')}</SelectItem>
                                <SelectItem value="Hybrid">{t('Hybrid', 'مزدوج')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">{t('Status', 'الحالة')}</label>
                        <Select value={status} onValueChange={setStatus}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="online">{t('Online', 'متصل')}</SelectItem>
                                <SelectItem value="offline">{t('Offline', 'مفصول')}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2 col-span-2">
                        <label className="text-sm font-medium">{t('API Token (Optional)', 'رمز التوثيق API (اختياري)')}</label>
                        <Input value={apiToken} onChange={e => setApiToken(e.target.value)} placeholder={t('Leave blank to auto-generate', 'اتركه فارغاً للتوليد التلقائي')} />
                    </div>
                </div>

                <div className="border-t pt-4 mt-2">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold">{t('Employee Mapping', 'ربط الموظفين')}</h4>
                        <Button variant="outline" size="sm" onClick={addMapping}>
                            <Plus className="w-4 h-4 mr-1 rtl:ml-1 rtl:mr-0" />
                            {t('Add Link', 'إضافة ربط')}
                        </Button>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">
                        {t('Link employee records with their Biometric User IDs on this device.', 'اربط سجلات الموظفين بأرقام البصمة الخاصة بهم على هذا الجهاز.')}
                    </p>

                    <div className="space-y-3">
                        {mappings.map((mapping, idx) => (
                            <div key={idx} className="flex gap-2 items-end bg-gray-50 dark:bg-slate-800 p-3 rounded-lg">
                                <div className="flex-1 space-y-1">
                                    <label className="text-xs text-gray-500">{t('Employee', 'الموظف')}</label>
                                    <Select value={mapping.employee_id} onValueChange={(val) => updateMapping(idx, 'employee_id', val)}>
                                        <SelectTrigger className="bg-white dark:bg-slate-900">
                                            <SelectValue placeholder={t('Select Employee', 'اختر الموظف')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {employees.map(emp => (
                                                <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex-1 space-y-1">
                                    <label className="text-xs text-gray-500">{t('Biometric ID', 'رقم البصمة في الجهاز')}</label>
                                    <Input
                                        className="bg-white dark:bg-slate-900"
                                        value={mapping.biometric_id}
                                        onChange={e => updateMapping(idx, 'biometric_id', e.target.value)}
                                        placeholder="e.g. 101"
                                    />
                                </div>
                                <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => removeMapping(idx)}>
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        ))}
                        {mappings.length === 0 && (
                            <div className="text-center text-sm text-gray-400 py-4 border-2 border-dashed rounded-lg">
                                {t('No mappings added. Click "Add Link" to start linking employees.', 'لم يتم إضافة أي ربط. اضغط على "إضافة ربط" للبدء بربط الموظفين.')}
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="mt-6">
                    <Button variant="outline" onClick={() => handleOpenChange(false)}>
                        {t('Cancel', 'إلغاء')}
                    </Button>
                    <Button onClick={handleSubmit} disabled={loading}>
                        {loading ? t('Saving...', 'جاري الحفظ...') : t('Save Device', 'حفظ الجهاز')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
} 
