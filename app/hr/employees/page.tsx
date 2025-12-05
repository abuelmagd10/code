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
import { Users } from "lucide-react"

export default function EmployeesPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar'|'en'>('ar')
  const [companyId, setCompanyId] = useState<string>("")
  const [employees, setEmployees] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string>("")
  const [editForm, setEditForm] = useState<{ full_name: string; base_salary: number }>({ full_name: "", base_salary: 0 })
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", job_title: "", department: "", base_salary: 0 })
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

  useEffect(() => { (async () => { const cid = await getActiveCompanyId(supabase); if (cid) { setCompanyId(cid); await loadEmployees(cid) } })() }, [supabase])

  const loadEmployees = async (cid: string) => {
    try {
      const res = await fetch(`/api/hr/employees?companyId=${encodeURIComponent(cid)}`)
      const data = res.ok ? await res.json() : []
      setEmployees(Array.isArray(data) ? data : [])
    } catch { setEmployees([]) }
  }

  const addEmployee = async () => {
    if (!companyId || !form.full_name) return
    setLoading(true)
    try {
      const res = await fetch('/api/hr/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, employee: form }) })
      if (res.ok) { await loadEmployees(companyId); setForm({ full_name: "", email: "", phone: "", job_title: "", department: "", base_salary: 0 }); toast({ title: t('Employee added', 'تم إضافة الموظف') }) } else { const j = await res.json(); toast({ title: t('Error', 'خطأ'), description: j?.error || t('Failed to add', 'فشل الإضافة') }) }
    } catch { toast({ title: t('Network error', 'خطأ الشبكة') }) } finally { setLoading(false) }
  }

  const startEdit = (e: any) => { setEditingId(String(e.id)); setEditForm({ full_name: String(e.full_name || ''), base_salary: Number(e.base_salary || 0) }) }
  const cancelEdit = () => { setEditingId(""); setEditForm({ full_name: "", base_salary: 0 }) }
  const saveEdit = async () => {
    if (!companyId || !editingId) return
    setLoading(true)
    try {
      const res = await fetch('/api/hr/employees', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, id: editingId, update: editForm }) })
      if (res.ok) { await loadEmployees(companyId); cancelEdit(); toast({ title: t('Data updated', 'تم تعديل البيانات') }) } else { const j = await res.json(); toast({ title: t('Error', 'خطأ'), description: j?.error || t('Failed to update', 'فشل التعديل') }) }
    } catch { toast({ title: t('Network error', 'خطأ الشبكة') }) } finally { setLoading(false) }
  }

  const deleteEmployee = async (id: string) => {
    if (!companyId || !id) return
    if (!confirm(t('Confirm delete employee?', 'تأكيد حذف الموظف؟'))) return
    setLoading(true)
    try {
      const res = await fetch('/api/hr/employees', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, id }) })
      if (res.ok) { await loadEmployees(companyId); toast({ title: t('Employee deleted', 'تم حذف الموظف') }) } else { const j = await res.json(); toast({ title: t('Error', 'خطأ'), description: j?.error || t('Failed to delete', 'فشل الحذف') }) }
    } catch { toast({ title: t('Network error', 'خطأ الشبكة') }) } finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{t('Employees', 'الموظفين')}</h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{t('Manage employee data', 'إدارة بيانات الموظفين')}</p>
              </div>
            </div>
          </div>
          <Card>
            <CardHeader><CardTitle>{t('Add Employee', 'إضافة موظف')}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><Label>{t('Full Name', 'الاسم الكامل')}</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><Label>{t('Email', 'البريد')}</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>{t('Phone', 'الهاتف')}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>{t('Job Title', 'الوظيفة')}</Label><Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} /></div>
              <div><Label>{t('Department', 'القسم')}</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
              <div><Label>{t('Base Salary', 'الراتب الأساسي')}</Label><Input type="number" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: Number(e.target.value) })} /></div>
              <div className="md:col-span-3"><Button disabled={loading} onClick={addEmployee}>{t('Add', 'إضافة')}</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t('Employees List', 'قائمة الموظفين')}</CardTitle></CardHeader>
            <CardContent>
              {employees.length === 0 ? (<p className="text-gray-600">{t('No employees yet.', 'لا يوجد موظفون بعد.')}</p>) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b"><tr><th className="p-2 text-right">{t('Name', 'الاسم')}</th><th className="p-2 text-right">{t('Email', 'البريد')}</th><th className="p-2 text-right">{t('Phone', 'الهاتف')}</th><th className="p-2 text-right">{t('Job Title', 'الوظيفة')}</th><th className="p-2 text-right">{t('Department', 'القسم')}</th><th className="p-2 text-right">{t('Salary', 'الراتب')}</th><th className="p-2 text-right">{t('Actions', 'الإجراءات')}</th></tr></thead>
                    <tbody>
                      {employees.map((e) => (
                        <tr key={e.id} className="border-b">
                          <td className="p-2">{editingId === e.id ? (<Input value={editForm.full_name} onChange={(ev) => setEditForm({ ...editForm, full_name: ev.target.value })} />) : e.full_name}</td>
                          <td className="p-2">{e.email}</td>
                          <td className="p-2">{e.phone}</td>
                          <td className="p-2">{e.job_title}</td>
                          <td className="p-2">{e.department}</td>
                          <td className="p-2">{editingId === e.id ? (<Input type="number" value={editForm.base_salary} onChange={(ev) => setEditForm({ ...editForm, base_salary: Number(ev.target.value) })} />) : Number(e.base_salary || 0).toFixed(2)}</td>
                          <td className="p-2">
                            {editingId === e.id ? (
                              <div className="flex gap-2">
                                <Button size="sm" onClick={saveEdit} disabled={loading}>{t('Save', 'حفظ')}</Button>
                                <Button size="sm" variant="outline" onClick={cancelEdit} disabled={loading}>{t('Cancel', 'إلغاء')}</Button>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => startEdit(e)} disabled={loading}>{t('Edit', 'تعديل')}</Button>
                                <Button size="sm" variant="destructive" onClick={() => deleteEmployee(String(e.id))} disabled={loading}>{t('Delete', 'حذف')}</Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}