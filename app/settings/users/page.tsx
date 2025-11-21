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
import Link from "next/link"

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
  const [currentUserId, setCurrentUserId] = useState<string>("")
  const [currentRole, setCurrentRole] = useState<string>("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("viewer")
  const [invites, setInvites] = useState<Array<{ id: string; email: string; role: string; expires_at: string }>>([])

  useEffect(() => {
    const load = async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser()
        const uid = userRes?.user?.id || ""
        setCurrentUserId(uid)
        const cid = await getActiveCompanyId(supabase)
        if (!cid) return
        setCompanyId(cid)
        const { data: cmembers } = await supabase
          .from("company_members")
          .select("id, user_id, role")
          .eq("company_id", cid)
        setMembers((cmembers || []) as any)
        const { data: cinv } = await supabase
          .from("company_invitations")
          .select("id,email,role,expires_at")
          .eq("company_id", cid)
        setInvites((cinv || []) as any)
        let owner = false
        let admin = false
        if (uid) {
          const { data: comp } = await supabase
            .from("companies")
            .select("id, user_id")
            .eq("id", cid)
            .maybeSingle()
          owner = comp?.user_id === uid
          const { data: myMember } = await supabase
            .from("company_members")
            .select("role")
            .eq("company_id", cid)
            .eq("user_id", uid)
            .maybeSingle()
          const r = String(myMember?.role || "")
          setCurrentRole(r)
          admin = ["owner", "admin"].includes(r)
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

  const createInvitation = async () => {
    if (!companyId || !inviteEmail.trim()) return
    if (!canManage) { setActionError("ليست لديك صلاحية لإنشاء دعوات") ; return }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(inviteEmail.trim())) { setActionError("البريد الإلكتروني غير صالح") ; return }
    setLoading(true)
    try {
      setActionError(null)
      const { error } = await supabase
        .from("company_invitations")
        .insert({ company_id: companyId, email: inviteEmail.trim(), role: inviteRole })
      if (error) { setActionError(error.message || "تعذر إنشاء الدعوة") ; return }
      setInviteEmail("")
      setInviteRole("viewer")
      const { data: cinv } = await supabase
        .from("company_invitations")
        .select("id,email,role,expires_at")
        .eq("company_id", companyId)
      setInvites((cinv || []) as any)
    } finally { setLoading(false) }
  }

  const addMember = async () => {
    if (!companyId || !newUserId.trim()) return
    if (!canManage) { setActionError("ليست لديك صلاحية لإضافة أعضاء لهذه الشركة") ; return }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(newUserId.trim())) { setActionError("معرّف المستخدم ليس UUID صالحًا") ; return }
    setLoading(true)
    try {
      setActionError(null)
      const { data: exists } = await supabase
        .from("company_members")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", newUserId.trim())
        .limit(1)
      if (exists && exists.length > 0) { setActionError("المستخدم موجود بالفعل ضمن أعضاء الشركة") ; return }
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
      const m = members.find((x) => x.id === id)
      if (!m) { setActionError("العضو غير موجود") ; return }
      // منع فقدان آخر مالك
      const owners = members.filter((x) => x.role === "owner")
      if (m.role === "owner" && owners.length === 1 && role !== "owner") { setActionError("لا يمكن تغيير دور آخر مالك") ; return }
      // منع خفض دور المستخدم الحالي إلى عرض فقط بدون وجود مدير/مالك آخر
      if (m.user_id === currentUserId && !["owner","admin"].includes(role)) {
        const hasOtherAdmin = members.some((x) => x.user_id !== currentUserId && ["owner","admin"].includes(x.role))
        if (!hasOtherAdmin) { setActionError("لا يمكن خفض دورك دون وجود مدير/مالك آخر") ; return }
      }
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
      const m = members.find((x) => x.id === id)
      if (!m) { setActionError("العضو غير موجود") ; return }
      const owners = members.filter((x) => x.role === "owner")
      if (m.role === "owner" && owners.length === 1) { setActionError("لا يمكن إزالة آخر مالك") ; return }
      if (m.user_id === currentUserId) { setActionError("لا يمكنك إزالة نفسك") ; return }
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
            <CardTitle>دعوات عبر البريد</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {actionError && <p className="text-sm text-red-600">{actionError}</p>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <Label>البريد الإلكتروني</Label>
                <Input placeholder="example@domain.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              </div>
              <div>
                <Label>الدور</Label>
                <select className="w-full border rounded p-2" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  <option value="owner">مالك</option>
                  <option value="admin">مدير</option>
                  <option value="accountant">محاسب</option>
                  <option value="viewer">عرض فقط</option>
                </select>
              </div>
              <div>
                <Button onClick={createInvitation} disabled={!canManage || loading || !inviteEmail.trim()}>إنشاء دعوة</Button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm text-gray-600">روابط الانضمام تظهر للمستخدم بعد تسجيل الدخول عبر صفحة القبول.</div>
              {invites.length > 0 ? (
                <div className="space-y-2">
                  {invites.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <div className="text-sm">{inv.email}</div>
                        <div className="text-xs text-gray-500">الدور: {inv.role} • ينتهي: {new Date(inv.expires_at).toLocaleDateString('ar')}</div>
                      </div>
                      <div>
                        <Link href="/invitations/accept" className="text-blue-600 hover:underline">رابط القبول</Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-600">لا توجد دعوات حالياً.</p>
              )}
            </div>
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
                      <div className="text-xs text-gray-500">Role: {m.role}{m.user_id === currentUserId ? " (أنت)" : ""}</div>
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