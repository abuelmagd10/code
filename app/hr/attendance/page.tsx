"use client"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"

export default function AttendancePage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar'|'en'>('ar')
  const [companyId, setCompanyId] = useState<string>("")
  const [employees, setEmployees] = useState<any[]>([])
  const [employeeId, setEmployeeId] = useState<string>("")
  const [dayDate, setDayDate] = useState<string>(new Date().toISOString().slice(0,10))
  const [status, setStatus] = useState<string>('present')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])
  const t = (en: string, ar: string) => appLang === 'en' ? en : ar

  useEffect(() => { (async () => { const cid = await getActiveCompanyId(supabase); if (cid) { setCompanyId(cid); const res = await fetch(`/api/hr/employees?companyId=${encodeURIComponent(cid)}`); const data = res.ok ? await res.json() : []; setEmployees(Array.isArray(data) ? data : []) } })() }, [supabase])

  const recordAttendance = async () => {
    if (!companyId || !employeeId || !dayDate) return
    setLoading(true)
    try {
      const res = await fetch('/api/hr/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, employeeId, dayDate, status }) })
      if (res.ok) { toast({ title: t('Attendance recorded', 'تم تسجيل الحضور') }) } else { const j = await res.json(); toast({ title: t('Error', 'خطأ'), description: j?.error || t('Failed to record', 'فشل التسجيل') }) }
    } catch { toast({ title: t('Network error', 'خطأ الشبكة') }) } finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">{t('Attendance', 'الحضور والانصراف')}</h1>
          <Card>
            <CardHeader><CardTitle>{t('Record Attendance', 'تسجيل حضور')}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label>{t('Employee', 'الموظف')}</Label>
                <select className="w-full border rounded p-2" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                  <option value="">{t('Select Employee', 'اختر الموظف')}</option>
                  {employees.map((e) => (<option key={e.id} value={e.id}>{e.full_name}</option>))}
                </select>
              </div>
              <div><Label>{t('Date', 'التاريخ')}</Label><Input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} /></div>
              <div>
                <Label>{t('Status', 'الحالة')}</Label>
                <select className="w-full border rounded p-2" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="present">{t('Present', 'حضور')}</option>
                  <option value="absent">{t('Absent', 'غياب')}</option>
                  <option value="leave">{t('Leave', 'إجازة')}</option>
                  <option value="sick">{t('Sick', 'مرضية')}</option>
                </select>
              </div>
              <div className="md:col-span-3"><Button disabled={loading} onClick={recordAttendance}>{t('Record', 'تسجيل')}</Button></div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}