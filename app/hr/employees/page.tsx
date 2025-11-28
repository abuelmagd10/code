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

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          {/* رأس الصفحة */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                <Users className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">إدارة الموظفين</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">إضافة وتعديل وحذف بيانات الموظفين</p>
              </div>
            </div>
          </div>
          <Card>
            <CardHeader><CardTitle>إضافة موظف</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div><Label>الاسم الكامل</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><Label>البريد</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>الهاتف</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>الوظيفة</Label><Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} /></div>
              <div><Label>القسم</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
              <div><Label>الراتب الأساسي</Label><Input type="number" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: Number(e.target.value) })} /></div>
              <div className="md:col-span-3"><Button disabled={loading} onClick={addEmployee}>إضافة</Button></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>قائمة الموظفين</CardTitle></CardHeader>
            <CardContent>
              {employees.length === 0 ? (<p className="text-gray-600">لا يوجد موظفون بعد.</p>) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b"><tr><th className="p-2 text-right">الاسم</th><th className="p-2 text-right">البريد</th><th className="p-2 text-right">الهاتف</th><th className="p-2 text-right">الوظيفة</th><th className="p-2 text-right">القسم</th><th className="p-2 text-right">الراتب</th><th className="p-2 text-right">الإجراءات</th></tr></thead>
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
                                <Button size="sm" onClick={saveEdit} disabled={loading}>حفظ</Button>
                                <Button size="sm" variant="outline" onClick={cancelEdit} disabled={loading}>إلغاء</Button>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <Button size="sm" variant="outline" onClick={() => startEdit(e)} disabled={loading}>تعديل</Button>
                                <Button size="sm" variant="destructive" onClick={() => deleteEmployee(String(e.id))} disabled={loading}>حذف</Button>
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