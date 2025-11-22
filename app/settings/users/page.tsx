"use client"
import { useEffect, useState } from "react"
export const dynamic = "force-dynamic"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import Link from "next/link"

type Member = { id: string; user_id: string; role: string; email?: string }

export default function UsersSettingsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [companyId, setCompanyId] = useState<string>("")
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [canManage, setCanManage] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string>("")
  const [currentRole, setCurrentRole] = useState<string>("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("viewer")
  const [invites, setInvites] = useState<Array<{ id: string; email: string; role: string; expires_at: string }>>([])
  const [memberEmails, setMemberEmails] = useState<Record<string, string>>({})
  const [permRole, setPermRole] = useState("viewer")
  const [permResource, setPermResource] = useState("invoices")
  const [permRead, setPermRead] = useState(true)
  const [permWrite, setPermWrite] = useState(false)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)
  const [permFull, setPermFull] = useState(false)
  const [rolePerms, setRolePerms] = useState<any[]>([])
  const [myCompanies, setMyCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [inviteCompanyId, setInviteCompanyId] = useState<string>("")
  const [changePassUserId, setChangePassUserId] = useState<string | null>(null)
  const [newMemberPass, setNewMemberPass] = useState("")

  useEffect(() => {
    const load = async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser()
        const uid = userRes?.user?.id || ""
        setCurrentUserId(uid)
        const cid = await getActiveCompanyId(supabase)
        if (!cid) return
        setCompanyId(cid)
        try {
          const memberIds: string[] = []
          if (uid) {
            const { data: myMemberships } = await supabase
              .from("company_members")
              .select("company_id")
              .eq("user_id", uid)
            const mids = (myMemberships || []).map((m: any) => String(m.company_id))
            mids.forEach((id: string) => { if (id && !memberIds.includes(id)) memberIds.push(id) })
            if (!memberIds.includes(cid)) memberIds.push(cid)
          }
          if (memberIds.length > 0) {
            const { data: companies } = await supabase
              .from("companies")
              .select("id,name")
              .in("id", memberIds)
            setMyCompanies((companies || []).map((c: any) => ({ id: String(c.id), name: String(c.name || "شركة") })))
            setInviteCompanyId(cid)
          } else {
            setMyCompanies([])
            setInviteCompanyId(cid)
          }
        } catch {}

        try {
          const res = await fetch(`/api/company-members?companyId=${cid}`)
          const js = await res.json()
          if (res.ok && Array.isArray(js?.members)) {
            setMembers(js.members as any)
          }
        } catch {}
        const { data: cinv } = await supabase
          .from("company_invitations")
          .select("id,email,role,expires_at")
          .eq("company_id", cid)
        setInvites((cinv || []) as any)
        const { data: perms } = await supabase
          .from("company_role_permissions")
          .select("id,role,resource,can_read,can_write,can_update,can_delete,all_access")
          .eq("company_id", cid)
        setRolePerms(perms || [])
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

  useEffect(() => { (async () => {
    if (!companyId) return
    const { data: perms } = await supabase
      .from("company_role_permissions")
      .select("id,role,resource,can_read,can_write,can_update,can_delete,all_access")
      .eq("company_id", companyId)
      .eq("role", permRole)
    setRolePerms(perms || [])
  })() }, [companyId, permRole])

  const refreshMembers = async () => {
    if (!companyId) return
    try {
      const res = await fetch(`/api/company-members?companyId=${companyId}`)
      const js = await res.json()
      if (res.ok && Array.isArray(js?.members)) setMembers(js.members as any)
    } catch {}
  }

  const createInvitation = async () => {
    const targetCompanyId = (inviteCompanyId || companyId)
    if (!targetCompanyId || !inviteEmail.trim()) return
    if (!canManage) { setActionError("ليست لديك صلاحية لإنشاء دعوات") ; return }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(inviteEmail.trim())) { setActionError("البريد الإلكتروني غير صالح") ; return }
    setLoading(true)
    try {
      setActionError(null)
      try {
        const { data: myMemberTarget } = await supabase
          .from("company_members")
          .select("role")
          .eq("company_id", targetCompanyId)
          .eq("user_id", currentUserId)
          .maybeSingle()
        const canManageTarget = ["owner", "admin"].includes(String(myMemberTarget?.role || ""))
        if (!canManageTarget) { setActionError("ليست لديك صلاحية لإرسال دعوة لهذه الشركة") ; return }
      } catch {}
      const { data: created, error } = await supabase
        .from("company_invitations")
        .insert({ company_id: targetCompanyId, email: inviteEmail.trim(), role: inviteRole })
        .select("id, accept_token")
        .single()
      if (error) { setActionError(error.message || "تعذر إنشاء الدعوة") ; return }
      try {
        await fetch("/api/send-invite", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: inviteEmail.trim(), inviteId: created.id, token: created.accept_token, companyId: targetCompanyId, role: inviteRole }),
        })
      } catch {}
      setInviteEmail("")
      setInviteRole("viewer")
      const { data: cinv } = await supabase
        .from("company_invitations")
        .select("id,email,role,expires_at")
        .eq("company_id", companyId)
      setInvites((cinv || []) as any)
    } finally { setLoading(false) }
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
            <CardTitle>أعضاء الشركة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-gray-600">يمكن للمالك تعديل الأدوار، تغيير كلمة المرور، أو حذف العضو نهائيًا.</div>
            {members.length === 0 ? (
              <p className="text-sm text-gray-600">لا يوجد أعضاء حالياً.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-slate-900">
                      <th className="p-2 text-right">البريد</th>
                      <th className="p-2 text-right">الدور</th>
                      <th className="p-2 text-right">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.user_id} className="border-b">
                        <td className="p-2">{m.email || m.user_id}</td>
                        <td className="p-2">
                          <select
                            className="border rounded p-2"
                            value={m.role}
                            onChange={async (e) => {
                              const nr = e.target.value
                              try {
                                const res = await fetch("/api/member-role", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId, userId: m.user_id, role: nr }) })
                                const js = await res.json()
                                if (res.ok && js?.ok) {
                                  setMembers((prev) => prev.map((x) => x.user_id === m.user_id ? { ...x, role: nr } : x))
                                  toastActionSuccess(toast, "تحديث", "الدور")
                                  try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('permissions_updated')) } catch {}
                                } else {
                                  toastActionError(toast, "تحديث", "الدور", js?.error || undefined)
                                }
                              } catch (err: any) { toastActionError(toast, "تحديث", "الدور", err?.message) }
                            }}
                          >
                            <option value="owner">مالك</option>
                            <option value="admin">مدير</option>
                          <option value="manager">مدير</option>
                          <option value="accountant">محاسب</option>
                          <option value="staff">موظف</option>
                            <option value="viewer">عرض فقط</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => { setChangePassUserId(m.user_id); setNewMemberPass("") }}>تغيير كلمة المرور</Button>
                            <Button variant="destructive" onClick={async () => {
                              try {
                                const ok = confirm("تأكيد حذف العضو نهائيًا؟")
                                if (!ok) return
                                const res = await fetch("/api/member-delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: m.user_id, companyId, fullDelete: true }) })
                                const js = await res.json()
                                if (res.ok && js?.ok) {
                                  setMembers((prev) => prev.filter((x) => x.user_id !== m.user_id))
                                  toastActionSuccess(toast, "حذف", "العضو")
                                } else { toastActionError(toast, "حذف", "العضو", js?.error || undefined) }
                              } catch (e: any) { toastActionError(toast, "حذف", "العضو", e?.message) }
                            }}>حذف</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!changePassUserId} onOpenChange={(v) => { if (!v) { setChangePassUserId(null); setNewMemberPass("") } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تغيير كلمة مرور العضو</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Label>كلمة المرور الجديدة</Label>
              <Input type="password" value={newMemberPass} onChange={(e) => setNewMemberPass(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setChangePassUserId(null); setNewMemberPass("") }}>إلغاء</Button>
              <Button onClick={async () => {
                const pw = (newMemberPass || '').trim()
                if (pw.length < 6) { toastActionError(toast, "تحديث", "كلمة المرور", "الحد الأدنى 6 أحرف") ; return }
                try {
                  const res = await fetch("/api/member-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: changePassUserId, password: pw }) })
                  const js = await res.json()
                  if (res.ok && js?.ok) { toastActionSuccess(toast, "تحديث", "كلمة المرور"); setChangePassUserId(null); setNewMemberPass("") } else { toastActionError(toast, "تحديث", "كلمة المرور", js?.error || undefined) }
                } catch (e: any) { toastActionError(toast, "تحديث", "كلمة المرور", e?.message) }
              }}>حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle>دعوات عبر البريد</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {actionError && <p className="text-sm text-red-600">{actionError}</p>}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <Label>الشركة الهدف</Label>
                <select
                  className="w-full border rounded p-2"
                  value={inviteCompanyId || companyId}
                  onChange={(e) => setInviteCompanyId(e.target.value)}
                  disabled={(myCompanies || []).length <= 1}
                >
                  {(myCompanies || []).length === 0 ? (
                    <option value={companyId}>{companyId || ""}</option>
                  ) : (
                    myCompanies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <Label>البريد الإلكتروني</Label>
                <Input placeholder="example@domain.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              </div>
              <div>
                <Label>الدور</Label>
                          <select className="w-full border rounded p-2" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  <option value="owner">مالك</option>
                  <option value="admin">مدير</option>
                  <option value="manager">إدارة</option>
                  <option value="accountant">محاسب</option>
                  <option value="staff">موظف</option>
                  <option value="viewer">عرض فقط</option>
                </select>
              </div>
              <div>
                <Button onClick={createInvitation} disabled={!canManage || loading || !inviteEmail.trim()}>إنشاء دعوة</Button>
              </div>
            </div>
            <div className="text-sm text-gray-600">روابط الانضمام تُدار تلقائيًا عبر البريد وصفحة القبول، ولا حاجة لعرضها هنا.</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>صلاحيات الأدوار</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {actionError && <p className="text-sm text-red-600">{actionError}</p>}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
              <div>
                <Label>الدور</Label>
                <select className="w-full border rounded p-2" value={permRole} onChange={(e) => setPermRole(e.target.value)}>
                  <option value="owner">مالك</option>
                  <option value="admin">مدير</option>
                  <option value="accountant">محاسب</option>
                  <option value="viewer">عرض فقط</option>
                </select>
              </div>
              <div>
                <Label>المورد</Label>
                <select className="w-full border rounded p-2" value={permResource} onChange={(e) => setPermResource(e.target.value)}>
                  <option value="invoices">فواتير المبيعات</option>
                  <option value="bills">فواتير المشتريات</option>
                  <option value="inventory">المخزون</option>
                  <option value="products">المنتجات</option>
                  <option value="purchase_orders">أوامر الشراء</option>
                  <option value="vendor_credits">مرتجعات الموردين</option>
                  <option value="estimates">العروض السعرية</option>
                  <option value="sales_orders">أوامر المبيعات</option>
                  <option value="customers">العملاء</option>
                  <option value="suppliers">الموردون</option>
                  <option value="payments">المدفوعات</option>
                  <option value="journal">القيود اليومية</option>
                  <option value="banking">الأعمال المصرفية</option>
                  <option value="reports">التقارير</option>
                  <option value="chart_of_accounts">الشجرة المحاسبية</option>
                  <option value="dashboard">لوحة التحكم</option>
                  <option value="taxes">الضرائب</option>
                  <option value="shareholders">المساهمون</option>
                  <option value="settings">الإعدادات</option>
                </select>
              </div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={permRead} onChange={(e) => setPermRead(e.target.checked)} /><Label>قراءة</Label></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={permWrite} onChange={(e) => setPermWrite(e.target.checked)} /><Label>كتابة</Label></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={permUpdate} onChange={(e) => setPermUpdate(e.target.checked)} /><Label>تعديل</Label></div>
              <div className="flex items-center gap-2"><input type="checkbox" checked={permDelete} onChange={(e) => setPermDelete(e.target.checked)} /><Label>حذف</Label></div>
              <div className="flex items-center gap-2 md:col-span-2"><input type="checkbox" checked={permFull} onChange={(e) => setPermFull(e.target.checked)} /><Label>تحكم كامل</Label></div>
              <div className="md:col-span-2">
                <Button onClick={async () => {
                  if (!canManage || !companyId) return
                  const { error } = await supabase
                    .from("company_role_permissions")
                    .upsert({ company_id: companyId, role: permRole, resource: permResource, can_read: permRead, can_write: permWrite, can_update: permUpdate, can_delete: permDelete, all_access: permFull }, { onConflict: "company_id,role,resource" })
                  if (error) { setActionError(error.message || "تعذر الحفظ") ; return }
                  const { data: perms } = await supabase
                    .from("company_role_permissions")
                    .select("id,role,resource,can_read,can_write,can_update,can_delete,all_access")
                    .eq("company_id", companyId)
                    .eq("role", permRole)
                  setRolePerms(perms || [])
                }}>حفظ الصلاحيات</Button>
              </div>
            </div>
            
            <div className="space-y-2">
              {rolePerms.length > 0 ? rolePerms.filter((p) => p.role === permRole).map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2 border rounded">
                  <div className="text-sm">{p.role} • {p.resource}</div>
                  <div className="text-xs text-gray-500">قراءة {p.can_read ? '✓' : '✗'} • كتابة {p.can_write ? '✓' : '✗'} • تعديل {p.can_update ? '✓' : '✗'} • حذف {p.can_delete ? '✓' : '✗'} • كامل {p.all_access ? '✓' : '✗'}</div>
                </div>
              )) : <p className="text-sm text-gray-600">لا توجد صلاحيات مُحددة.</p>}
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
                      <div className="text-sm">User: {m.email || memberEmails[m.user_id] || m.user_id}</div>
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
        <Card>
          <CardHeader>
            <CardTitle>إنشاء دور مخصص</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <Label>اسم الدور</Label>
                <Input placeholder="مثال: supervisor" value={permRole} onChange={(e) => setPermRole(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Button onClick={async () => {
                  if (!companyId || !permRole.trim()) return
                  const resources = [
                    'invoices','bills','inventory','products','purchase_orders','vendor_credits','estimates','sales_orders','customers','suppliers','payments','journal','banking','reports','chart_of_accounts','dashboard','taxes','shareholders','settings'
                  ]
                  const rows = resources.map((r) => ({ company_id: companyId, role: permRole.trim(), resource: r, can_read: false, can_write: false, can_update: false, can_delete: false, all_access: false }))
                  const { error } = await supabase.from('company_role_permissions').upsert(rows, { onConflict: 'company_id,role,resource' })
                  if (error) { setActionError(error.message || 'تعذر إنشاء الدور') } else { toastActionSuccess(toast, 'إنشاء', 'الدور') }
                }}>إنشاء دور</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}