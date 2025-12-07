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
import { Users, UserPlus, Shield, Key, Mail, Trash2, Building2, ChevronRight, UserCog, Lock, Check, X, AlertCircle, Loader2, RefreshCw } from "lucide-react"

type Member = { id: string; user_id: string; role: string; email?: string; is_current?: boolean; username?: string; display_name?: string }

export default function UsersSettingsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [companyId, setCompanyId] = useState<string>("")
  const [companyName, setCompanyName] = useState<string>("")
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [canManage, setCanManage] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string>("")
  const [currentRole, setCurrentRole] = useState<string>("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("staff")
  const [invites, setInvites] = useState<Array<{ id: string; email: string; role: string; expires_at: string; status?: string }>>([])
  const [memberEmails, setMemberEmails] = useState<Record<string, string>>({})
  const [permRole, setPermRole] = useState("staff")
  const [permResource, setPermResource] = useState("invoices")
  const [permRead, setPermRead] = useState(true)
  const [permWrite, setPermWrite] = useState(false)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)
  const [permFull, setPermFull] = useState(false)
  const [permAccess, setPermAccess] = useState(true) // صلاحية الوصول للصفحة
  const [rolePerms, setRolePerms] = useState<any[]>([])
  const [myCompanies, setMyCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [inviteCompanyId, setInviteCompanyId] = useState<string>("")
  const [changePassUserId, setChangePassUserId] = useState<string | null>(null)
  const [newMemberPass, setNewMemberPass] = useState("")
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const load = async () => {
      setPageLoading(true)
      try {
        const { data: userRes } = await supabase.auth.getUser()
        const uid = userRes?.user?.id || ""
        setCurrentUserId(uid)
        const cid = await getActiveCompanyId(supabase)
        if (!cid) {
          setPageLoading(false)
          return
        }
        setCompanyId(cid)

        // جلب اسم الشركة الحالية
        const { data: currentCompany } = await supabase
          .from("companies")
          .select("id, name, user_id")
          .eq("id", cid)
          .maybeSingle()
        setCompanyName(currentCompany?.name || "الشركة")

        // جلب الشركات التي ينتمي إليها المستخدم فقط
        if (uid) {
          const { data: myMemberships } = await supabase
            .from("company_members")
            .select("company_id")
            .eq("user_id", uid)
          const memberIds = (myMemberships || []).map((m: any) => String(m.company_id))
          if (!memberIds.includes(cid)) memberIds.push(cid)

          if (memberIds.length > 0) {
            const { data: companies } = await supabase
              .from("companies")
              .select("id,name")
              .in("id", memberIds)
            setMyCompanies((companies || []).map((c: any) => ({ id: String(c.id), name: String(c.name || "شركة") })))
          }
        }
        setInviteCompanyId(cid)

        // جلب أعضاء الشركة الحالية فقط
        try {
          const res = await fetch(`/api/company-members?companyId=${cid}`)
          const js = await res.json()
          if (res.ok && Array.isArray(js?.members)) {
            // تحديد المستخدم الحالي
            const membersWithCurrent = js.members.map((m: Member) => ({
              ...m,
              is_current: m.user_id === uid
            }))
            setMembers(membersWithCurrent)
          }
        } catch {}

        // جلب الدعوات المعلقة للشركة الحالية فقط
        const { data: cinv } = await supabase
          .from("company_invitations")
          .select("id,email,role,expires_at")
          .eq("company_id", cid)
        setInvites((cinv || []) as any)

        // جلب الصلاحيات للشركة الحالية فقط
        const { data: perms } = await supabase
          .from("company_role_permissions")
          .select("id,role,resource,can_read,can_write,can_update,can_delete,all_access")
          .eq("company_id", cid)
        setRolePerms(perms || [])

        // تحديد صلاحيات المستخدم الحالي
        let owner = currentCompany?.user_id === uid
        let admin = false
        if (uid) {
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
      } finally {
        setPageLoading(false)
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
    setRefreshing(true)
    try {
      const res = await fetch(`/api/company-members?companyId=${companyId}`)
      const js = await res.json()
      if (res.ok && Array.isArray(js?.members)) {
        const membersWithCurrent = js.members.map((m: Member) => ({
          ...m,
          is_current: m.user_id === currentUserId
        }))
        setMembers(membersWithCurrent)
      }
      // تحديث الدعوات أيضاً
      const { data: cinv } = await supabase
        .from("company_invitations")
        .select("id,email,role,expires_at")
        .eq("company_id", companyId)
      setInvites((cinv || []) as any)
    } catch {} finally {
      setRefreshing(false)
    }
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

  const roleLabels: Record<string, { ar: string; en: string; color: string; description: string }> = {
    owner: { ar: 'مالك', en: 'Owner', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', description: 'صلاحيات كاملة على كل شيء' },
    admin: { ar: 'مدير عام', en: 'Admin', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', description: 'إدارة كاملة للنظام' },
    manager: { ar: 'مدير', en: 'Manager', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400', description: 'إدارة العمليات اليومية' },
    accountant: { ar: 'محاسب', en: 'Accountant', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', description: 'إدارة الحسابات والفواتير' },
    store_manager: { ar: 'مسؤول مخزن', en: 'Store Manager', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', description: 'إدارة المخزون والمنتجات' },
    staff: { ar: 'موظف', en: 'Staff', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', description: 'صلاحيات محدودة' },
    viewer: { ar: 'عرض فقط', en: 'Viewer', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400', description: 'عرض البيانات فقط' },
  }

  // تصنيف الموارد حسب الفئات للعرض المنظم - فقط الصفحات الموجودة فعلياً
  const resourceCategories = {
    inventory: {
      label: '📦 المخزون',
      resources: [
        { value: 'products', label: 'المنتجات' },
        { value: 'inventory', label: 'حركات المخزون' },
        { value: 'write_offs', label: 'إهلاك المخزون' },
      ]
    },
    sales: {
      label: '💰 المبيعات',
      resources: [
        { value: 'invoices', label: 'فواتير المبيعات' },
        { value: 'customers', label: 'العملاء' },
        { value: 'estimates', label: 'العروض السعرية' },
        { value: 'sales_orders', label: 'أوامر المبيعات' },
        { value: 'sales_returns', label: 'مرتجعات المبيعات' },
      ]
    },
    purchases: {
      label: '🛒 المشتريات',
      resources: [
        { value: 'bills', label: 'فواتير المشتريات' },
        { value: 'suppliers', label: 'الموردون' },
        { value: 'purchase_orders', label: 'أوامر الشراء' },
        { value: 'vendor_credits', label: 'مرتجعات الموردين' },
      ]
    },
    finance: {
      label: '🏦 المالية والمحاسبة',
      resources: [
        { value: 'payments', label: 'المدفوعات' },
        { value: 'journal_entries', label: 'القيود اليومية' },
        { value: 'chart_of_accounts', label: 'الشجرة المحاسبية' },
        { value: 'banking', label: 'الأعمال المصرفية' },
        { value: 'shareholders', label: 'المساهمون' },
      ]
    },
    reports: {
      label: '📊 التقارير',
      resources: [
        { value: 'reports', label: 'التقارير العامة' },
        { value: 'dashboard', label: 'لوحة التحكم' },
      ]
    },
    settings: {
      label: '⚙️ الإعدادات',
      resources: [
        { value: 'company_settings', label: 'إعدادات الشركة' },
        { value: 'users', label: 'المستخدمون' },
        { value: 'exchange_rates', label: 'أسعار العملات' },
        { value: 'taxes', label: 'الضرائب' },
        { value: 'audit_log', label: 'سجل التدقيق' },
        { value: 'maintenance', label: 'الصيانة' },
      ]
    },
  }

  // حالة التحميل
  if (pageLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-4 md:p-8 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 mx-auto mb-4 text-blue-500 animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">جاري تحميل بيانات المستخدمين...</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* رأس الصفحة - تحسين للهاتف */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardContent className="py-4 sm:py-6">
            <div className="flex items-center justify-between flex-wrap gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg sm:rounded-xl shadow-lg shadow-blue-500/20 flex-shrink-0">
                  <Users className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">المستخدمون</h1>
                  <div className="flex items-center gap-2 mt-0.5 sm:mt-1 flex-wrap">
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs">
                      <Building2 className="w-3 h-3 ml-1" />
                      {companyName}
                    </Badge>
                    <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hidden sm:inline">• إدارة الأعضاء</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={refreshMembers} disabled={refreshing} className="gap-2">
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  تحديث
                </Button>
                <Link href="/settings">
                  <Button variant="outline" className="gap-2">
                    <ChevronRight className="w-4 h-4 rotate-180" />
                    العودة للإعدادات
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* تنبيه عدم وجود صلاحية */}
        {!canManage && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">وضع العرض فقط</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">ليس لديك صلاحية لتعديل المستخدمين. تواصل مع مدير الشركة للحصول على الصلاحيات.</p>
            </div>
          </div>
        )}

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
                  <p className="text-xs text-gray-500 mt-1">يمكن للمالك والمدير تعديل الأدوار وإدارة الأعضاء</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <Users className="w-3 h-3" />
                  {members.length} عضو
                </Badge>
                {currentRole && (
                  <Badge className={roleLabels[currentRole]?.color || roleLabels.viewer.color}>
                    دورك: {roleLabels[currentRole]?.ar || currentRole}
                  </Badge>
                )}
              </div>
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
                  <div key={m.user_id} className={`flex items-center justify-between p-4 rounded-xl transition-colors ${m.is_current ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' : 'bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700'}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ${m.is_current ? 'bg-gradient-to-br from-blue-600 to-indigo-700 ring-2 ring-blue-300' : 'bg-gradient-to-br from-gray-500 to-gray-600'}`}>
                        {(m.display_name || m.username || m.email || 'U')[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {m.display_name || m.email || m.user_id}
                          </p>
                          {m.is_current && <Badge className="text-[10px] bg-blue-500 text-white">أنت</Badge>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {m.username && (
                            <span className="text-xs text-muted-foreground">@{m.username}</span>
                          )}
                          <Badge className={`text-[10px] ${roleLabels[m.role]?.color || roleLabels.viewer.color}`}>
                            {roleLabels[m.role]?.ar || m.role}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canManage && !m.is_current && (
                        <>
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
                            <SelectTrigger className="w-28 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="owner">مالك</SelectItem>
                              <SelectItem value="admin">مدير عام</SelectItem>
                              <SelectItem value="manager">مدير</SelectItem>
                              <SelectItem value="accountant">محاسب</SelectItem>
                              <SelectItem value="store_manager">مسؤول مخزن</SelectItem>
                              <SelectItem value="staff">موظف</SelectItem>
                              <SelectItem value="viewer">عرض فقط</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="outline" size="sm" onClick={() => { setChangePassUserId(m.user_id); setNewMemberPass("") }} className="gap-1 h-8 text-xs">
                            <Lock className="w-3 h-3" />
                            كلمة المرور
                          </Button>
                        </>
                      )}
                      {canManage && !m.is_current && m.role !== 'owner' && (
                        <Button variant="outline" size="sm" className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={async () => {
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
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
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
        {canManage && (
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <UserPlus className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">دعوات عبر البريد</CardTitle>
                    <p className="text-xs text-gray-500 mt-1">إرسال دعوات للانضمام للشركة</p>
                  </div>
                </div>
                {invites.length > 0 && (
                  <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-700 border-amber-200">
                    <Mail className="w-3 h-3" />
                    {invites.length} دعوة معلقة
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              {actionError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {actionError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    الشركة الهدف
                  </Label>
                  <Select value={inviteCompanyId || companyId || 'none'} onValueChange={(v) => setInviteCompanyId(v)} disabled={(myCompanies || []).length <= 1}>
                    <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(myCompanies || []).length === 0 ? (
                        <SelectItem value={companyId || 'none'}>{companyName || "غير محدد"}</SelectItem>
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
                      <SelectItem value="admin">مدير عام</SelectItem>
                      <SelectItem value="manager">مدير</SelectItem>
                      <SelectItem value="accountant">محاسب</SelectItem>
                      <SelectItem value="store_manager">مسؤول مخزن</SelectItem>
                      <SelectItem value="staff">موظف</SelectItem>
                      <SelectItem value="viewer">عرض فقط</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Button onClick={createInvitation} disabled={loading || !inviteEmail.trim()} className="w-full gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    إنشاء دعوة
                  </Button>
                </div>
              </div>

              {/* الدعوات المعلقة */}
              {invites.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">الدعوات المعلقة:</p>
                  <div className="space-y-2">
                    {invites.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                            <Mail className="w-4 h-4 text-amber-600" />
                          </div>
                          <div>
                            <p className="font-medium text-sm text-gray-900 dark:text-white">{inv.email}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge className={`text-[10px] ${roleLabels[inv.role]?.color || roleLabels.viewer.color}`}>
                                {roleLabels[inv.role]?.ar || inv.role}
                              </Badge>
                              <span className="text-xs text-gray-500">
                                تنتهي: {new Date(inv.expires_at).toLocaleDateString('ar-EG')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" className="h-7 text-xs text-red-600 hover:bg-red-50" onClick={async () => {
                          const { error } = await supabase.from("company_invitations").delete().eq("id", inv.id)
                          if (!error) {
                            setInvites((prev) => prev.filter((x) => x.id !== inv.id))
                            toastActionSuccess(toast, "حذف", "الدعوة")
                          }
                        }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-500 bg-gray-50 dark:bg-slate-800 p-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                روابط الانضمام تُدار تلقائيًا عبر البريد وصفحة القبول. صلاحية الدعوة 7 أيام.
              </p>
            </CardContent>
          </Card>
        )}

        {/* صلاحيات الأدوار */}
        {canManage && (
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-base">صلاحيات الأدوار</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">تحديد صلاحيات كل دور على موارد النظام</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <UserCog className="w-4 h-4" />
                    الدور
                  </Label>
                  <Select value={permRole} onValueChange={(v) => setPermRole(v)}>
                    <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          مدير عام
                        </div>
                      </SelectItem>
                      <SelectItem value="manager">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                          مدير
                        </div>
                      </SelectItem>
                      <SelectItem value="accountant">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500"></span>
                          محاسب
                        </div>
                      </SelectItem>
                      <SelectItem value="store_manager">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                          مسؤول مخزن
                        </div>
                      </SelectItem>
                      <SelectItem value="staff">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                          موظف
                        </div>
                      </SelectItem>
                      <SelectItem value="viewer">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                          عرض فقط
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {roleLabels[permRole] && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{roleLabels[permRole].description}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    المورد
                  </Label>
                  <Select value={permResource} onValueChange={(v) => setPermResource(v)}>
                    <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                      {Object.entries(resourceCategories).map(([key, category]) => (
                        <div key={key}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800 sticky top-0">
                            {category.label}
                          </div>
                          {category.resources.map((res) => (
                            <SelectItem key={res.value} value={res.value} className="pr-4">
                              {res.label}
                            </SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* صلاحيات الوصول */}
              <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">صلاحيات الوصول:</p>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 hover:border-indigo-400 transition-colors">
                    <input type="checkbox" checked={permAccess} onChange={(e) => setPermAccess(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-indigo-600" />
                    <div>
                      <span className="text-sm font-medium text-indigo-700 dark:text-indigo-400">إظهار</span>
                      <p className="text-[10px] text-indigo-500 dark:text-indigo-400">في القائمة</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 hover:border-blue-300 transition-colors">
                    <input type="checkbox" checked={permRead} onChange={(e) => setPermRead(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                    <span className="text-sm font-medium">قراءة</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 hover:border-green-300 transition-colors">
                    <input type="checkbox" checked={permWrite} onChange={(e) => setPermWrite(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-green-600" />
                    <span className="text-sm font-medium">كتابة</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 hover:border-amber-300 transition-colors">
                    <input type="checkbox" checked={permUpdate} onChange={(e) => setPermUpdate(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-amber-600" />
                    <span className="text-sm font-medium">تعديل</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg bg-white dark:bg-slate-700 border border-gray-200 dark:border-slate-600 hover:border-red-300 transition-colors">
                    <input type="checkbox" checked={permDelete} onChange={(e) => setPermDelete(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-red-600" />
                    <span className="text-sm font-medium">حذف</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-lg bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 hover:border-purple-400 transition-colors">
                    <input type="checkbox" checked={permFull} onChange={(e) => setPermFull(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-purple-600" />
                    <span className="text-sm font-medium text-purple-700 dark:text-purple-400">تحكم كامل</span>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-2">💡 إلغاء "إظهار" يخفي الصفحة من القائمة الجانبية للمستخدم</p>
              </div>
              <Button onClick={async () => {
                if (!canManage || !companyId) return
                setLoading(true)
                try {
                  const { error } = await supabase
                    .from("company_role_permissions")
                    .upsert({
                      company_id: companyId,
                      role: permRole,
                      resource: permResource,
                      can_read: permRead,
                      can_write: permWrite,
                      can_update: permUpdate,
                      can_delete: permDelete,
                      all_access: permFull,
                      can_access: permAccess
                    }, { onConflict: "company_id,role,resource" })
                  if (error) { setActionError(error.message || "تعذر الحفظ") ; return }
                  const { data: perms } = await supabase
                    .from("company_role_permissions")
                    .select("id,role,resource,can_read,can_write,can_update,can_delete,all_access,can_access")
                    .eq("company_id", companyId)
                    .eq("role", permRole)
                  setRolePerms(perms || [])
                  setActionError(null)
                  toastActionSuccess(toast, "حفظ", "الصلاحيات")
                  // إرسال حدث لتحديث الـ Sidebar
                  try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('permissions_updated')) } catch {}
                } finally {
                  setLoading(false)
                }
              }} disabled={loading} className="gap-2 bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                حفظ الصلاحيات
              </Button>

              {/* عرض الصلاحيات المحفوظة */}
              <div className="space-y-2 mt-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">الصلاحيات المحفوظة للدور: <Badge className={roleLabels[permRole]?.color || 'bg-gray-100'}>{roleLabels[permRole]?.ar || permRole}</Badge></p>
                </div>
                {rolePerms.filter((p) => p.role === permRole).length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {rolePerms.filter((p) => p.role === permRole).map((p) => {
                      // البحث عن اسم المورد بالعربي
                      const resourceLabel = Object.values(resourceCategories)
                        .flatMap(cat => cat.resources)
                        .find(r => r.value === p.resource)?.label || p.resource
                      return (
                        <div key={p.id} className={`flex items-center justify-between p-3 rounded-lg border ${p.can_access === false ? 'bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 opacity-60' : 'bg-white dark:bg-slate-700 border-gray-100 dark:border-slate-600'}`}>
                          <div className="flex items-center gap-2">
                            {p.can_access === false && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">مخفي</span>
                            )}
                            <Badge variant="outline" className="text-xs">{resourceLabel}</Badge>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs flex-wrap justify-end">
                            <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${p.can_access !== false ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`}>
                              {p.can_access !== false ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />} ظ
                            </span>
                            <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${p.can_read ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`}>
                              {p.can_read ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />} ق
                            </span>
                            <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${p.can_write ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`}>
                              {p.can_write ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />} ك
                            </span>
                            <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${p.can_update ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`}>
                              {p.can_update ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />} ت
                            </span>
                            <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded ${p.can_delete ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`}>
                              {p.can_delete ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />} ح
                            </span>
                            {p.all_access && (
                              <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                <Check className="w-2.5 h-2.5" /> الكل
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-6 bg-gray-50 dark:bg-slate-800 rounded-lg">
                    <Shield className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">لا توجد صلاحيات مُحددة لهذا الدور</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}