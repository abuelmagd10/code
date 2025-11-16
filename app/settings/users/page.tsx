"use client"
import { useEffect, useState } from "react"
export const dynamic = "force-dynamic"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"

type Member = { id: string; user_id: string; role: string }

export default function UsersSettingsPage() {
  const supabase = useSupabase()
  const [companyId, setCompanyId] = useState<string>("")
  const [members, setMembers] = useState<Member[]>([])
  const [newUserId, setNewUserId] = useState("")
  const [newRole, setNewRole] = useState("viewer")
  const [loading, setLoading] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser()
        const currentUserId = userRes?.user?.id || ""
        const cid = await getActiveCompanyId(supabase)
        if (!cid) return
        setCompanyId(cid)
        const { data: cmembers } = await supabase
          .from("company_members")
          .select("id, user_id, role")
          .eq("company_id", cid)
        setMembers((cmembers || []) as any)
        let owner = false
        let admin = false
        if (currentUserId) {
          const { data: comp } = await supabase
            .from("companies")
            .select("id, user_id")
            .eq("id", cid)
            .maybeSingle()
          owner = comp?.user_id === currentUserId
          const { data: myMember } = await supabase
            .from("company_members")
            .select("role")
            .eq("company_id", cid)
            .eq("user_id", currentUserId)
            .maybeSingle()
          admin = ["owner", "admin"].includes(String(myMember?.role || ""))
        }
        setCanManage(owner || admin)
      } catch (err: any) {
        setActionError(typeof err?.message === "string" ? err.message : "تعذر تحميل الأعضاء")
      }
    }
    load()
  }, [])

  const refreshMembers = async () => {
    if (!companyId) return
    const { data } = await supabase
      .from("company_members")
      .select("id, user_id, role")
      .eq("company_id", companyId)
    setMembers((data || []) as any)
  }

  const addMember = async () => {
    if (!companyId || !newUserId.trim()) return
    if (!canManage) { setActionError("ليست لديك صلاحية لإضافة أعضاء لهذه الشركة") ; return }
    setLoading(true)
    try {
      setActionError(null)
      const { error } = await supabase
        .from("company_members")
        .insert({ company_id: companyId, user_id: newUserId.trim(), role: newRole })
      if (error) { setActionError(error.message || "تعذر الإضافة") ; return }
      setNewUserId("")
      setNewRole("viewer")
      await refreshMembers()
    } finally {
      setLoading(false)
    }
  }

  const updateRole = async (id: string, role: string) => {
    if (!canManage) { setActionError("ليست لديك صلاحية لتغيير الأدوار") ; return }
    setLoading(true)
    try {
      setActionError(null)
      const { error } = await supabase
        .from("company_members")
        .update({ role })
        .eq("id", id)
      if (error) { setActionError(error.message || "تعذر التحديث") ; return }
      await refreshMembers()
    } finally {
      setLoading(false)
    }
  }

  const removeMember = async (id: string) => {
    if (!canManage) { setActionError("ليست لديك صلاحية لإزالة الأعضاء") ; return }
    setLoading(true)
    try {
      setActionError(null)
      const { error } = await supabase
        .from("company_members")
        .delete()
        .eq("id", id)
      if (error) { setActionError(error.message || "تعذر الإزالة") ; return }
      await refreshMembers()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">المستخدمون والصلاحيات</h1>
          <span className="text-sm text-gray-500 dark:text-gray-400">إدارة أعضاء الشركة وأدوارهم</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>إضافة مستخدم</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {actionError && <p className="text-sm text-red-600">{actionError}</p>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <Label>معرّف المستخدم (UUID)</Label>
                <Input placeholder="مثال: 00000000-0000-0000-0000-000000000000" value={newUserId} onChange={(e) => setNewUserId(e.target.value)} />
              </div>
              <div>
                <Label>الدور</Label>
                <select className="w-full border rounded p-2" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                  <option value="owner">مالك</option>
                  <option value="admin">مدير</option>
                  <option value="accountant">محاسب</option>
                  <option value="viewer">عرض فقط</option>
                </select>
              </div>
              <div>
                <Button onClick={addMember} disabled={loading || !newUserId.trim() || !canManage}>إضافة</Button>
              </div>
            </div>
            <p className="text-xs text-gray-500">للعثور على المعرّف يمكنك نسخ قيمة المستخدم من لوحة Supabase Auth. سيتم تمكين الدعوات بالبريد قريباً.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>الأعضاء الحاليون</CardTitle>
          </CardHeader>
          <CardContent>
            {members.length > 0 ? (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <div className="text-sm">User: {m.user_id}</div>
                      <div className="text-xs text-gray-500">Role: {m.role}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select className="border rounded p-1 text-sm" value={m.role} onChange={(e) => updateRole(m.id, e.target.value)} disabled={!canManage}>
                        <option value="owner">مالك</option>
                        <option value="admin">مدير</option>
                        <option value="accountant">محاسب</option>
                        <option value="viewer">عرض فقط</option>
                      </select>
                      <Button variant="outline" onClick={() => removeMember(m.id)} disabled={loading || !canManage}>إزالة</Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">لا يوجد أعضاء بعد.</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}