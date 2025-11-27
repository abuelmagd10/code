"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useEffect, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { Users, Plus } from "lucide-react"
import { PageContainer } from "@/components/ui/page-container"
import { PageHeader } from "@/components/ui/page-header"

export default function EmployeesPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [companyId, setCompanyId] = useState<string>("")
  const [employees, setEmployees] = useState<any[]>([])
  const [editingId, setEditingId] = useState<string>("")
  const [editForm, setEditForm] = useState<{ full_name: string; base_salary: number }>({ full_name: "", base_salary: 0 })
  const [form, setForm] = useState({ full_name: "", email: "", phone: "", job_title: "", department: "", base_salary: 0 })
  const [loading, setLoading] = useState(false)

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
      if (res.ok) { await loadEmployees(companyId); setForm({ full_name: "", email: "", phone: "", job_title: "", department: "", base_salary: 0 }); toast({ title: 'تم إضافة الموظف' }) } else { const j = await res.json(); toast({ title: 'خطأ', description: j?.error || 'فشل الإضافة' }) }
    } catch { toast({ title: 'خطأ الشبكة' }) } finally { setLoading(false) }
  }

  const startEdit = (e: any) => { setEditingId(String(e.id)); setEditForm({ full_name: String(e.full_name || ''), base_salary: Number(e.base_salary || 0) }) }
  const cancelEdit = () => { setEditingId(""); setEditForm({ full_name: "", base_salary: 0 }) }
  const saveEdit = async () => {
    if (!companyId || !editingId) return
    setLoading(true)
    try {
      const res = await fetch('/api/hr/employees', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, id: editingId, update: editForm }) })
      if (res.ok) { await loadEmployees(companyId); cancelEdit(); toast({ title: 'تم تعديل البيانات' }) } else { const j = await res.json(); toast({ title: 'خطأ', description: j?.error || 'فشل التعديل' }) }
    } catch { toast({ title: 'خطأ الشبكة' }) } finally { setLoading(false) }
  }

  const deleteEmployee = async (id: string) => {
    if (!companyId || !id) return
    if (!confirm('تأكيد حذف الموظف؟')) return
    setLoading(true)
    try {
      const res = await fetch('/api/hr/employees', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, id }) })
      if (res.ok) { await loadEmployees(companyId); toast({ title: 'تم حذف الموظف' }) } else { const j = await res.json(); toast({ title: 'خطأ', description: j?.error || 'فشل الحذف' }) }
    } catch { toast({ title: 'خطأ الشبكة' }) } finally { setLoading(false) }
  }

  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  return (
    <PageContainer>
      <PageHeader
        title="إدارة الموظفين"
        titleEn="Employee Management"
        description="إضافة وتعديل وحذف بيانات الموظفين"
        descriptionEn="Add, edit and delete employee data"
        icon={Users}
        iconColor="indigo"
        lang={appLang}
      >
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800">
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              {appLang==='en' ? 'Add Employee' : 'إضافة موظف'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>{appLang==='en' ? 'Full Name' : 'الاسم الكامل'}</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><Label>{appLang==='en' ? 'Email' : 'البريد'}</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>{appLang==='en' ? 'Phone' : 'الهاتف'}</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>{appLang==='en' ? 'Job Title' : 'الوظيفة'}</Label><Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} /></div>
            <div><Label>{appLang==='en' ? 'Department' : 'القسم'}</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
            <div><Label>{appLang==='en' ? 'Base Salary' : 'الراتب الأساسي'}</Label><Input type="number" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: Number(e.target.value) })} /></div>
            <div className="md:col-span-3"><Button disabled={loading} onClick={addEmployee}><Plus className="w-4 h-4 ml-2" />{appLang==='en' ? 'Add' : 'إضافة'}</Button></div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800">
            <CardTitle>{appLang==='en' ? 'Employees List' : 'قائمة الموظفين'}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
              </div>
            ) : employees.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400 py-8 text-center">{appLang==='en' ? 'No employees yet.' : 'لا يوجد موظفون بعد.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="p-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Name' : 'الاسم'}</th>
                      <th className="p-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Email' : 'البريد'}</th>
                      <th className="p-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Phone' : 'الهاتف'}</th>
                      <th className="p-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Job Title' : 'الوظيفة'}</th>
                      <th className="p-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Department' : 'القسم'}</th>
                      <th className="p-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Salary' : 'الراتب'}</th>
                      <th className="p-3 text-right font-semibold text-gray-600 dark:text-gray-300">{appLang==='en' ? 'Actions' : 'الإجراءات'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {employees.map((e) => (
                      <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-3">{editingId === e.id ? (<Input value={editForm.full_name} onChange={(ev) => setEditForm({ ...editForm, full_name: ev.target.value })} />) : e.full_name}</td>
                        <td className="p-3">{e.email}</td>
                        <td className="p-3">{e.phone}</td>
                        <td className="p-3">{e.job_title}</td>
                        <td className="p-3">{e.department}</td>
                        <td className="p-3">{editingId === e.id ? (<Input type="number" value={editForm.base_salary} onChange={(ev) => setEditForm({ ...editForm, base_salary: Number(ev.target.value) })} />) : Number(e.base_salary || 0).toFixed(2)}</td>
                        <td className="p-3">
                          {editingId === e.id ? (
                            <div className="flex gap-2">
                              <Button size="sm" onClick={saveEdit} disabled={loading}>{appLang==='en' ? 'Save' : 'حفظ'}</Button>
                              <Button size="sm" variant="outline" onClick={cancelEdit} disabled={loading}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => startEdit(e)} disabled={loading}>{appLang==='en' ? 'Edit' : 'تعديل'}</Button>
                              <Button size="sm" variant="destructive" onClick={() => deleteEmployee(String(e.id))} disabled={loading}>{appLang==='en' ? 'Delete' : 'حذف'}</Button>
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
      </PageHeader>
    </PageContainer>
  )
}