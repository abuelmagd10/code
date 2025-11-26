"use client"
import { useEffect, useState } from "react"
export const dynamic = "force-dynamic"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import Link from "next/link"
import { Users, UserPlus, Shield, Key, Mail, Trash2, Building2, ChevronRight, UserCog, Lock, Check, X } from "lucide-react"

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

  const roleLabels: Record<string, { ar: string; en: string; color: string }> = {
    owner: { ar: 'مالك', en: 'Owner', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
    admin: { ar: 'مدير', en: 'Admin', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    manager: { ar: 'مدير', en: 'Manager', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
    accountant: { ar: 'محاسب', en: 'Accountant', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    staff: { ar: 'موظف', en: 'Staff', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    viewer: { ar: 'عرض فقط', en: 'Viewer', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        {/* رأس الصفحة */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg shadow-blue-500/20">
                  <Users className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">المستخدمون والصلاحيات</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">إدارة أعضاء الشركة وأدوارهم</p>
                </div>
              </div>
              <Link href="/settings">
                <Button variant="outline" className="gap-2">
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  العودة للإعدادات
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* أعضاء الشركة */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <UserCog className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-base">أعضاء الشركة</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">يمكن للمالك تعديل الأدوار، تغيير كلمة المرور، أو حذف العضو</p>
                </div>
              </div>
              <Badge variant="outline" className="gap-1">
                <Users className="w-3 h-3" />
                {members.length} عضو
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {members.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>لا يوجد أعضاء حالياً</p>
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((m) => (
                  <div key={m.user_id} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-800 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                        {(m.email || 'U')[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{m.email || m.user_id}</p>
                        <Badge className={`text-[10px] mt-1 ${roleLabels[m.role]?.color || roleLabels.viewer.color}`}>
                          {roleLabels[m.role]?.ar || m.role}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={m.role} onValueChange={async (nr) => {
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
                      }}>
                        <SelectTrigger className="w-32 h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">مالك</SelectItem>
                          <SelectItem value="admin">مدير</SelectItem>
                          <SelectItem value="manager">إدارة</SelectItem>
                          <SelectItem value="accountant">محاسب</SelectItem>
                          <SelectItem value="staff">موظف</SelectItem>
                          <SelectItem value="viewer">عرض فقط</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" onClick={() => { setChangePassUserId(m.user_id); setNewMemberPass("") }} className="gap-1">
                        <Lock className="w-3.5 h-3.5" />
                        كلمة المرور
                      </Button>
                      <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={async () => {
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
                      }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* موديال تغيير كلمة المرور */}
        <Dialog open={!!changePassUserId} onOpenChange={(v) => { if (!v) { setChangePassUserId(null); setNewMemberPass("") } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <Key className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <DialogTitle>تغيير كلمة مرور العضو</DialogTitle>
              </div>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Label className="text-gray-600 dark:text-gray-400">كلمة المرور الجديدة</Label>
              <Input type="password" value={newMemberPass} onChange={(e) => setNewMemberPass(e.target.value)} placeholder="أدخل كلمة المرور الجديدة" className="bg-gray-50 dark:bg-slate-800" />
              <p className="text-xs text-gray-500">الحد الأدنى 6 أحرف</p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setChangePassUserId(null); setNewMemberPass("") }}>إلغاء</Button>
              <Button className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500" onClick={async () => {
                const pw = (newMemberPass || '').trim()
                if (pw.length < 6) { toastActionError(toast, "تحديث", "كلمة المرور", "الحد الأدنى 6 أحرف") ; return }
                try {
                  const res = await fetch("/api/member-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: changePassUserId, password: pw }) })
                  const js = await res.json()
                  if (res.ok && js?.ok) { toastActionSuccess(toast, "تحديث", "كلمة المرور"); setChangePassUserId(null); setNewMemberPass("") } else { toastActionError(toast, "تحديث", "كلمة المرور", js?.error || undefined) }
                } catch (e: any) { toastActionError(toast, "تحديث", "كلمة المرور", e?.message) }
              }}>
                <Lock className="w-4 h-4" />
                حفظ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* دعوات عبر البريد */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <UserPlus className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle className="text-base">دعوات عبر البريد</CardTitle>
                <p className="text-xs text-gray-500 mt-1">إرسال دعوات للانضمام للشركة</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            {actionError && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{actionError}</p>}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  الشركة الهدف
                </Label>
                <Select value={inviteCompanyId || companyId} onValueChange={(v) => setInviteCompanyId(v)} disabled={(myCompanies || []).length <= 1}>
                  <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(myCompanies || []).length === 0 ? (
                      <SelectItem value={companyId || ''}>{companyId || ""}</SelectItem>
                    ) : (
                      myCompanies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  البريد الإلكتروني
                </Label>
                <Input placeholder="example@domain.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="bg-gray-50 dark:bg-slate-800" />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  الدور
                </Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v)}>
                  <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">مالك</SelectItem>
                    <SelectItem value="admin">مدير</SelectItem>
                    <SelectItem value="manager">إدارة</SelectItem>
                    <SelectItem value="accountant">محاسب</SelectItem>
                    <SelectItem value="staff">موظف</SelectItem>
                    <SelectItem value="viewer">عرض فقط</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Button onClick={createInvitation} disabled={!canManage || loading || !inviteEmail.trim()} className="w-full gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600">
                  <UserPlus className="w-4 h-4" />
                  إنشاء دعوة
                </Button>
              </div>
            </div>
            <p className="text-xs text-gray-500 bg-gray-50 dark:bg-slate-800 p-3 rounded-lg">روابط الانضمام تُدار تلقائيًا عبر البريد وصفحة القبول</p>
          </CardContent>
        </Card>

        {/* صلاحيات الأدوار */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-base">صلاحيات الأدوار</CardTitle>
                <p className="text-xs text-gray-500 mt-1">تحديد صلاحيات كل دور</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            {actionError && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">{actionError}</p>}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">الدور</Label>
                <Select value={permRole} onValueChange={(v) => setPermRole(v)}>
                  <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">مالك</SelectItem>
                    <SelectItem value="admin">مدير</SelectItem>
                    <SelectItem value="accountant">محاسب</SelectItem>
                    <SelectItem value="viewer">عرض فقط</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">المورد</Label>
                <Select value={permResource} onValueChange={(v) => setPermResource(v)}>
                  <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoices">فواتير المبيعات</SelectItem>
                    <SelectItem value="bills">فواتير المشتريات</SelectItem>
                    <SelectItem value="inventory">المخزون</SelectItem>
                    <SelectItem value="products">المنتجات</SelectItem>
                    <SelectItem value="purchase_orders">أوامر الشراء</SelectItem>
                    <SelectItem value="vendor_credits">مرتجعات الموردين</SelectItem>
                    <SelectItem value="estimates">العروض السعرية</SelectItem>
                    <SelectItem value="sales_orders">أوامر المبيعات</SelectItem>
                    <SelectItem value="customers">العملاء</SelectItem>
                    <SelectItem value="suppliers">الموردون</SelectItem>
                    <SelectItem value="payments">المدفوعات</SelectItem>
                    <SelectItem value="journal">القيود اليومية</SelectItem>
                    <SelectItem value="banking">الأعمال المصرفية</SelectItem>
                    <SelectItem value="reports">التقارير</SelectItem>
                    <SelectItem value="chart_of_accounts">الشجرة المحاسبية</SelectItem>
                    <SelectItem value="dashboard">لوحة التحكم</SelectItem>
                    <SelectItem value="taxes">الضرائب</SelectItem>
                    <SelectItem value="shareholders">المساهمون</SelectItem>
                    <SelectItem value="settings">الإعدادات</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* صلاحيات الوصول */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors">
                <input type="checkbox" checked={permRead} onChange={(e) => setPermRead(e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
                <span className="text-sm font-medium">قراءة</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors">
                <input type="checkbox" checked={permWrite} onChange={(e) => setPermWrite(e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
                <span className="text-sm font-medium">كتابة</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors">
                <input type="checkbox" checked={permUpdate} onChange={(e) => setPermUpdate(e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
                <span className="text-sm font-medium">تعديل</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors">
                <input type="checkbox" checked={permDelete} onChange={(e) => setPermDelete(e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
                <span className="text-sm font-medium">حذف</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors bg-purple-50 dark:bg-purple-900/20">
                <input type="checkbox" checked={permFull} onChange={(e) => setPermFull(e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
                <span className="text-sm font-medium text-purple-700 dark:text-purple-400">تحكم كامل</span>
              </label>
            </div>
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
              toastActionSuccess(toast, "حفظ", "الصلاحيات")
            }} className="gap-2 bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600">
              <Shield className="w-4 h-4" />
              حفظ الصلاحيات
            </Button>

            {/* عرض الصلاحيات المحفوظة */}
            <div className="space-y-2 mt-4">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">الصلاحيات المحفوظة:</p>
              {rolePerms.length > 0 ? rolePerms.filter((p) => p.role === permRole).map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{p.resource}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`flex items-center gap-1 ${p.can_read ? 'text-green-600' : 'text-gray-400'}`}>
                      {p.can_read ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} قراءة
                    </span>
                    <span className={`flex items-center gap-1 ${p.can_write ? 'text-green-600' : 'text-gray-400'}`}>
                      {p.can_write ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} كتابة
                    </span>
                    <span className={`flex items-center gap-1 ${p.can_update ? 'text-green-600' : 'text-gray-400'}`}>
                      {p.can_update ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} تعديل
                    </span>
                    <span className={`flex items-center gap-1 ${p.can_delete ? 'text-green-600' : 'text-gray-400'}`}>
                      {p.can_delete ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} حذف
                    </span>
                    <span className={`flex items-center gap-1 ${p.all_access ? 'text-purple-600' : 'text-gray-400'}`}>
                      {p.all_access ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} كامل
                    </span>
                  </div>
                </div>
              )) : <p className="text-sm text-gray-500 text-center py-4">لا توجد صلاحيات مُحددة لهذا الدور</p>}
            </div>
          </CardContent>
        </Card>

        {/* إنشاء دور مخصص */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <UserPlus className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-base">إنشاء دور مخصص</CardTitle>
                <p className="text-xs text-gray-500 mt-1">إنشاء دور جديد بصلاحيات مخصصة</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">اسم الدور</Label>
                <Input placeholder="مثال: supervisor" value={permRole} onChange={(e) => setPermRole(e.target.value)} className="bg-gray-50 dark:bg-slate-800" />
              </div>
              <Button onClick={async () => {
                if (!companyId || !permRole.trim()) return
                const resources = [
                  'invoices','bills','inventory','products','purchase_orders','vendor_credits','estimates','sales_orders','customers','suppliers','payments','journal','banking','reports','chart_of_accounts','dashboard','taxes','shareholders','settings'
                ]
                const rows = resources.map((r) => ({ company_id: companyId, role: permRole.trim(), resource: r, can_read: false, can_write: false, can_update: false, can_delete: false, all_access: false }))
                const { error } = await supabase.from('company_role_permissions').upsert(rows, { onConflict: 'company_id,role,resource' })
                if (error) { setActionError(error.message || 'تعذر إنشاء الدور') } else { toastActionSuccess(toast, 'إنشاء', 'الدور') }
              }} className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
                <UserPlus className="w-4 h-4" />
                إنشاء دور
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}