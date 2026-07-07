"use client"
// v3.42.1 — force Turbopack rebuild
import { useEffect, useState } from "react"
export const dynamic = "force-dynamic"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MultiSelect } from "@/components/ui/multi-select"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { usePermissions } from "@/lib/permissions-context"
import { canAdvancedAction, type AdvancedAction } from "@/lib/authz"
import Link from "next/link"
import { Users, UserPlus, Shield, Key, Mail, Trash2, Building2, ChevronRight, UserCog, Lock, Check, X, AlertCircle, Loader2, RefreshCw, MapPin, Warehouse, ArrowRightLeft, Share2, Eye, Edit, GitBranch, Search, Copy, CreditCard, Calendar, UserCheck } from "lucide-react"
import SeatStatusBanner from "@/components/billing/SeatStatusBanner"
import { ModulesSubscriptionCard } from "@/components/settings/ModulesSubscriptionCard"

type Member = { id: string; user_id: string; role: string; email?: string; is_current?: boolean; username?: string; display_name?: string; branch_id?: string; cost_center_id?: string; warehouse_id?: string; employee_id?: string; employee_name?: string; employee_job_title?: string }
type Employee = { id: string; full_name: string; job_title?: string; email?: string; department?: string }
type Branch = { id: string; name: string; is_main: boolean }
type CostCenter = { id: string; cost_center_name: string; branch_id: string }
type WarehouseType = { id: string; name: string; branch_id: string; is_main: boolean }
type PermissionSharing = { id: string; grantor_user_id: string; grantee_user_id: string; resource_type: string; can_view: boolean; can_edit: boolean; is_active: boolean; expires_at?: string }
type PermissionTransfer = { id: string; from_user_id: string; to_user_id: string; resource_type: string; records_transferred: number; transferred_at: string; status: string }
type UserBranchAccess = { id: string; user_id: string; branch_id: string; is_primary: boolean; can_view_customers: boolean; can_view_orders: boolean; can_view_prices: boolean; is_active: boolean }

// 🔐 Enterprise Action Mapping
const ADVANCED_ACTIONS_MAP: Record<string, { value: AdvancedAction, label: string, labelEn: string }[]> = {
  invoices: [
    { value: "print", label: "طباعة الفاتورة", labelEn: "Print Invoice" },
    { value: "send", label: "إرسال فاتورة", labelEn: "Send Invoice" },
    { value: "convert_to_bill", label: "تحويل لفاتورة شراء", labelEn: "Convert to Purchase Bill" },
    { value: "void", label: "إبطال", labelEn: "Void" }
  ],
  bills: [
    { value: "record_payment", label: "تسجيل دفعة", labelEn: "Record Payment" },
    { value: "convert_to_invoice", label: "تحويل لفاتورة مبيعات", labelEn: "Convert to Sales Invoice" },
    { value: "void", label: "إبطال", labelEn: "Void" }
  ],
  journal_entries: [
    { value: "post", label: "ترحيل القيد", labelEn: "Post Entry" },
    { value: "unpost", label: "إلغاء ترحيل", labelEn: "Unpost" }
  ],
  banking: [
    { value: "reconcile", label: "مطابقة", labelEn: "Reconcile" },
    { value: "record_payment", label: "تسجيل دفعة/استلام", labelEn: "Record Payment/Receipt" }
  ],
  inventory: [
    { value: "adjust", label: "تسوية", labelEn: "Adjust" },
    { value: "transfer", label: "نقل مخزون", labelEn: "Transfer Stock" },
    { value: "count", label: "جرد مباشر", labelEn: "Physical Count" }
  ],
  hr: [
    { value: "process", label: "معالجة الرواتب", labelEn: "Process Payroll" },
    { value: "approve", label: "اعتماد الرواتب", labelEn: "Approve Payroll" }
  ],
  payroll: [
    { value: "process", label: "معالجة الرواتب", labelEn: "Process Payroll" },
    { value: "approve", label: "اعتماد الرواتب", labelEn: "Approve Payroll" }
  ],
  fixed_assets: [
    { value: "post_depreciation", label: "ترحيل إهلاك", labelEn: "Post Depreciation" },
    { value: "approve_depreciation", label: "اعتماد إهلاك", labelEn: "Approve Depreciation" }
  ],
  sales_returns: [
    { value: "partial_return", label: "مرتجع جزئي", labelEn: "Partial Return" },
    { value: "full_return", label: "مرتجع كامل", labelEn: "Full Return" },
    { value: "reverse_return", label: "عكس مرتجع", labelEn: "Reverse Return" }
  ]
}

export default function UsersSettingsPage() {

  const supabase = useSupabase()
  const { toast } = useToast()
  const { refreshPermissions } = usePermissions()
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
  const [inviteName, setInviteName] = useState("")
  const [inviteRole, setInviteRole] = useState("staff")
  const [invites, setInvites] = useState<Array<{ id: string; email: string; role: string; expires_at: string; status?: string; accept_token?: string }>>([])
  const [memberEmails, setMemberEmails] = useState<Record<string, string>>({})
  const [permRole, setPermRole] = useState("staff")
  const [permResource, setPermResource] = useState("invoices")
  const [resourceSearch, setResourceSearch] = useState("") // بحث في الموارد
  const [permRead, setPermRead] = useState(true)
  const [permWrite, setPermWrite] = useState(false)
  const [permUpdate, setPermUpdate] = useState(false)
  const [permDelete, setPermDelete] = useState(false)
  const [permFull, setPermFull] = useState(false)
  const [permAccess, setPermAccess] = useState(true) // صلاحية الوصول للصفحة
  const [permAllowedActions, setPermAllowedActions] = useState<AdvancedAction[]>([])
  const [rolePerms, setRolePerms] = useState<any[]>([])
  const [myCompanies, setMyCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [inviteCompanyId, setInviteCompanyId] = useState<string>("")
  const [changePassUserId, setChangePassUserId] = useState<string | null>(null)
  const [newMemberPass, setNewMemberPass] = useState("")
  const [refreshing, setRefreshing] = useState(false)

  // User Reassignment
  const [reassignModalOpen, setReassignModalOpen] = useState(false)
  const [userToReassign, setUserToReassign] = useState<Member | null>(null)
  const [userDependencies, setUserDependencies] = useState<any>(null)
  const [reassignTargetId, setReassignTargetId] = useState("")
  const [isReassigning, setIsReassigning] = useState(false)

  // 🔐 Enterprise ERP: Delete Confirmation Modal
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<Member | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Branch, Cost Center, Warehouse for invitations
  const [branches, setBranches] = useState<Branch[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([])
  const [inviteBranchId, setInviteBranchId] = useState<string>("")
  const [inviteCostCenterId, setInviteCostCenterId] = useState<string>("")
  const [inviteWarehouseId, setInviteWarehouseId] = useState<string>("")

  // 🔐 نقل وفتح الصلاحيات
  const [permissionSharing, setPermissionSharing] = useState<PermissionSharing[]>([])
  // v3.71.0 — inbound shares (what was shared WITH the current user)
  const [sharedWithMe, setSharedWithMe] = useState<any[]>([])
  // v3.74.1 — archived (deactivated / expired) shares for audit history
  const [archivedSharing, setArchivedSharing] = useState<any[]>([])
  const [archivedSharedWithMe, setArchivedSharedWithMe] = useState<any[]>([])
  const [showSharingArchive, setShowSharingArchive] = useState(false)
  const [showSharedWithMeArchive, setShowSharedWithMeArchive] = useState(false)
  const [permissionTransfers, setPermissionTransfers] = useState<PermissionTransfer[]>([])
  const [userBranchAccess, setUserBranchAccess] = useState<UserBranchAccess[]>([])
  const [showPermissionDialog, setShowPermissionDialog] = useState(false)
  const [permissionAction, setPermissionAction] = useState<'transfer' | 'share' | 'branch_access'>('share')
  const [selectedSourceUser, setSelectedSourceUser] = useState<string>("")
  const [selectedTargetUsers, setSelectedTargetUsers] = useState<string[]>([])
  const [selectedResourceType, setSelectedResourceType] = useState<string>("all")
  const [transferBranchId, setTransferBranchId] = useState<string>("") // اختياري: نقل عملاء/أوامر فرع معين فقط
  const [selectedBranches, setSelectedBranches] = useState<string[]>([])
  const [shareCanEdit, setShareCanEdit] = useState(false)
  const [shareCanDelete, setShareCanDelete] = useState(false)
  const [permissionLoading, setPermissionLoading] = useState(false)

  // 🌴 v3.72.0 — Vacation Cover dialog state
  const [showVacationDialog, setShowVacationDialog] = useState(false)
  const [vacGrantorId, setVacGrantorId] = useState<string>("")
  const [vacGranteeIds, setVacGranteeIds] = useState<string[]>([])
  const [vacStartDate, setVacStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [vacEndDate, setVacEndDate] = useState<string>("")
  const [vacResourceType, setVacResourceType] = useState<string>("all")
  const [vacReason, setVacReason] = useState<string>("")
  const [vacLoading, setVacLoading] = useState(false)

  // 🧮 v3.73.1 — counts of records owned by the currently-selected source user.
  // Used by both vacation-cover and share-permission dialogs to hide resource
  // types where the source has nothing to share.
  const [sourceUserCounts, setSourceUserCounts] = useState<{
    customers: number; estimates: number; sales_orders: number; bookings: number;
  } | null>(null)
  const [sourceCountsLoading, setSourceCountsLoading] = useState(false)

  // v3.74.63 — multi-select to cherry-pick which customers to transfer.
  // Empty selection = legacy move-ALL behaviour.
  const [sourceCustomers, setSourceCustomers] = useState<
    { id: string; name: string; phone: string | null; branch_id: string | null }[]
  >([])
  const [sourceCustomersLoading, setSourceCustomersLoading] = useState(false)
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([])
  const [customerSearchQuery, setCustomerSearchQuery] = useState("")

  // 🏢 إدارة فرع الموظف (Single Branch - Mandatory)
  const [showMemberBranchDialog, setShowMemberBranchDialog] = useState(false)
  const [editingMemberId, setEditingMemberId] = useState<string>("")
  const [editingMemberName, setEditingMemberName] = useState<string>("")
  // v3.74.329 — role of the member currently being edited in the
  // branch-assignment dialog. Drives whether the "بدون فرع" option
  // appears (booking_officer only).
  const [editingMemberRole, setEditingMemberRole] = useState<string>("")
  const [memberBranchId, setMemberBranchId] = useState<string>("")
  const [savingMemberBranches, setSavingMemberBranches] = useState(false)
  const [resendingInvite, setResendingInvite] = useState<string | null>(null)

  // 🔗 ربط العضو بالموظف
  const [showLinkEmployeeDialog, setShowLinkEmployeeDialog] = useState(false)
  const [linkingMember, setLinkingMember] = useState<Member | null>(null)
  const [employeesList, setEmployeesList] = useState<Employee[]>([])
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("")
  const [linkingEmployee, setLinkingEmployee] = useState(false)

  // 🌐 Bilingual (Arabic/English) UI support
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])
  const t = (en: string, ar: string) => appLang === 'en' ? en : ar

  const getAppLang = () => {
    if (typeof window === "undefined") return "ar"
    return (localStorage.getItem("app_language") || "ar") === "en" ? "en" : "ar"
  }

  const dispatchUserWorkflowNotification = async (
    userId: string,
    payload:
      | { action: "branch_changed"; branchId: string }
      | { action: "role_changed"; oldRole: string; newRole: string }
  ) => {
    const response = await fetch(`/api/settings/users/${userId}/notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...payload,
        appLang: getAppLang(),
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data?.error || "Failed to dispatch user workflow notification")
    }
  }

  useEffect(() => {
    const load = async () => {
      setPageLoading(true)
      try {
        const { data: userRes } = await supabase.auth.getUser()
        const uid = userRes?.user?.id || ""
        setCurrentUserId(uid)
        const cid = await getActiveCompanyId(supabase)
        console.log('📊 [Users Page] Loading data for company:', cid);
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
        setCompanyName(currentCompany?.name || (getAppLang() === "en" ? "Company" : "الشركة"))

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
            setMyCompanies((companies || []).map((c: any) => ({ id: String(c.id), name: String(c.name || (getAppLang() === "en" ? "Company" : "شركة")) })))
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
        } catch { }

        // جلب الدعوات المعلقة للشركة الحالية فقط (غير مقبولة وغير منتهية)
        const { data: cinv } = await supabase
          .from("company_invitations")
          .select("id,email,role,expires_at,branch_id,cost_center_id,warehouse_id,accept_token")
          .eq("company_id", cid)
          .eq("accepted", false)
          .gt("expires_at", new Date().toISOString())
        setInvites((cinv || []) as any)

        // جلب الفروع ومراكز التكلفة والمخازن
        const { data: branchData } = await supabase
          .from("branches")
          .select("id, name, is_main")
          .eq("company_id", cid)
          .eq("is_active", true)
          .order("is_main", { ascending: false })
        setBranches(branchData || [])

        // تعيين الفرع الرئيسي كفرع افتراضي للدعوة
        const mainBranch = branchData?.find((b: Branch) => b.is_main)
        if (mainBranch) {
          setInviteBranchId(mainBranch.id)
        }

        const { data: costCenterData } = await supabase
          .from("cost_centers")
          .select("id, cost_center_name, branch_id")
          .eq("company_id", cid)
          .eq("is_active", true)
        setCostCenters(costCenterData || [])

        // تعيين مركز التكلفة الافتراضي
        if (mainBranch) {
          const mainCC = costCenterData?.find((cc: CostCenter) => cc.branch_id === mainBranch.id)
          if (mainCC) setInviteCostCenterId(mainCC.id)
        }

        const { data: warehouseData } = await supabase
          .from("warehouses")
          .select("id, name, branch_id, is_main")
          .eq("company_id", cid)
          .eq("is_active", true)
        setWarehouses(warehouseData || [])

        // تعيين المخزن الافتراضي
        if (mainBranch) {
          const mainWH = warehouseData?.find((w: WarehouseType) => w.branch_id === mainBranch.id && w.is_main)
          if (mainWH) setInviteWarehouseId(mainWH.id)
        }

        // جلب الصلاحيات للشركة الحالية فقط
        const { data: perms } = await supabase
          .from("company_role_permissions")
          .select("id,role,resource,can_read,can_write,can_update,can_delete,all_access,can_access,allowed_actions")
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
          // 🔐 Enterprise ERP: السماح للأدوار الإدارية بإدارة المستخدمين (Owner, Admin, Manager فقط)
          admin = ["owner", "admin", "manager"].includes(r)
        }
        setCanManage(owner || admin)
      } catch (err: any) {
        setActionError(typeof err?.message === "string" ? err.message : (getAppLang() === "en" ? "Failed to load members" : "تعذر تحميل الأعضاء"))
      } finally {
        setPageLoading(false)
      }
    }
    load()
  }, [])

  // ✅ Realtime تحديث الدعوات المعلقة عند قبولها/إنشائها بدون الحاجة لرفرش يدوي
  useEffect(() => {
    if (!companyId) return

    try {
      const channel = supabase
        .channel(`company_invitations_realtime:${companyId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'company_invitations',
            filter: `company_id=eq.${companyId}`,
          },
          (payload: any) => {
            const nowIso = new Date().toISOString()
            if (payload.eventType === 'INSERT') {
              const inv = payload.new as any
              // نضيف الدعوة فقط إذا كانت غير مقبولة وغير منتهية
              if (!inv.accepted && inv.expires_at > nowIso) {
                setInvites((prev) => {
                  const exists = prev.some((p) => p.id === inv.id)
                  return exists ? prev : [...prev, inv]
                })
              }
              return
            }

            if (payload.eventType === 'UPDATE') {
              const inv = payload.new as any
              // إذا تم قبول الدعوة أو انتهت صلاحيتها → نحذفها من القائمة
              if (inv.accepted || inv.expires_at <= nowIso) {
                setInvites((prev) => prev.filter((p) => p.id !== inv.id))
              } else {
                // تحديث بيانات الدعوة في الواجهة إن بقيت معلّقة
                setInvites((prev) =>
                  prev.map((p) => (p.id === inv.id ? { ...p, ...inv } : p)),
                )
              }
              return
            }

            if (payload.eventType === 'DELETE') {
              const oldInv = payload.old as any
              setInvites((prev) => prev.filter((p) => p.id !== oldInv.id))
            }
          },
        )
        .subscribe()

      return () => {
        // استخدام unsubscribe لإغلاق الاشتراك من جهة الخادم بشكل صحيح
        channel.unsubscribe()
      }
    } catch {
      // في حال فشل الاشتراك لا نكسر الصفحة، فقط نتجاهل الـ realtime وسيبقى الرفرش اليدوي يعمل
    }
  }, [companyId, supabase])

  // ✅ Realtime تحديث أعضاء الشركة عند إضافة/تحديث/حذف عضو بدون الحاجة لرفرش يدوي
  useEffect(() => {
    if (!companyId || !currentUserId) return

    try {
      const channel = supabase
        .channel(`company_members_realtime:${companyId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'company_members',
            filter: `company_id=eq.${companyId}`,
          },
          async (payload: any) => {
            if (payload.eventType === 'INSERT') {
              // عند إضافة عضو جديد (مثل قبول دعوة)
              const newMember = payload.new as any
              // جلب بيانات العضو الكاملة من API
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
              } catch (err) {
                console.error('Error refreshing members after INSERT:', err)
              }
              return
            }

            if (payload.eventType === 'UPDATE') {
              // عند تحديث بيانات عضو (مثل تغيير الدور)
              const updatedMember = payload.new as any
              setMembers((prev) =>
                prev.map((m) =>
                  m.id === updatedMember.id
                    ? { ...m, ...updatedMember, is_current: updatedMember.user_id === currentUserId }
                    : m
                )
              )
              return
            }

            if (payload.eventType === 'DELETE') {
              // عند حذف عضو
              const deletedMember = payload.old as any
              setMembers((prev) => prev.filter((m) => m.id !== deletedMember.id))
            }
          },
        )
        .subscribe()

      return () => {
        channel.unsubscribe()
      }
    } catch (err) {
      console.error('Failed to subscribe to company_members realtime:', err)
      // في حال فشل الاشتراك لا نكسر الصفحة، فقط نتجاهل الـ realtime وسيبقى الرفرش اليدوي يعمل
    }
  }, [companyId, currentUserId, supabase])

  // ✅ الاستماع لتغيير الشركة
  useEffect(() => {
    const handleCompanyChange = async () => {
      const newCompanyId = localStorage.getItem('active_company_id');
      console.log('🔄 [Users Page] Company change detected:', {
        current: companyId,
        new: newCompanyId
      });

      if (newCompanyId && newCompanyId !== companyId) {
        console.log('🔄 [Users Page] Company changed, reloading data...');
        setPageLoading(true);

        try {
          setCompanyId(newCompanyId);

          // جلب اسم الشركة الجديدة
          const { data: currentCompany } = await supabase
            .from("companies")
            .select("id, name, user_id")
            .eq("id", newCompanyId)
            .maybeSingle();
          setCompanyName(currentCompany?.name || (getAppLang() === "en" ? "Company" : "الشركة"));

          // جلب أعضاء الشركة الجديدة
          const res = await fetch(`/api/company-members?companyId=${newCompanyId}`);
          const js = await res.json();
          if (res.ok && Array.isArray(js?.members)) {
            const membersWithCurrent = js.members.map((m: Member) => ({
              ...m,
              is_current: m.user_id === currentUserId
            }));
            setMembers(membersWithCurrent);
          }

          // جلب الدعوات المعلقة للشركة الجديدة
          const { data: cinv } = await supabase
            .from("company_invitations")
            .select("id,email,role,expires_at,branch_id,cost_center_id,warehouse_id,accept_token")
            .eq("company_id", newCompanyId)
            .eq("accepted", false)
            .gt("expires_at", new Date().toISOString());
          setInvites((cinv || []) as any);

          // جلب الفروع ومراكز التكلفة والمخازن للشركة الجديدة
          const { data: branchData } = await supabase
            .from("branches")
            .select("id, name, is_main")
            .eq("company_id", newCompanyId)
            .eq("is_active", true)
            .order("is_main", { ascending: false });
          setBranches(branchData || []);

          const { data: costCenterData } = await supabase
            .from("cost_centers")
            .select("id, cost_center_name, branch_id")
            .eq("company_id", newCompanyId)
            .eq("is_active", true);
          setCostCenters(costCenterData || []);

          const { data: warehouseData } = await supabase
            .from("warehouses")
            .select("id, name, branch_id, is_main")
            .eq("company_id", newCompanyId)
            .eq("is_active", true);
          setWarehouses(warehouseData || []);

          console.log('✅ [Users Page] Data reloaded successfully');
        } catch (error) {
          console.error('❌ [Users Page] Error reloading data:', error);
        } finally {
          setPageLoading(false);
        }
      }
    };

    // ✅ الاستماع للـ event الصحيح: company_updated
    window.addEventListener('company_updated', handleCompanyChange);

    return () => {
      window.removeEventListener('company_updated', handleCompanyChange);
    };
  }, [companyId, currentUserId, supabase]);

  useEffect(() => {
    (async () => {
      if (!companyId) return
      const { data: perms } = await supabase
        .from("company_role_permissions")
        .select("id,role,resource,can_read,can_write,can_update,can_delete,all_access,can_access,allowed_actions")
        .eq("company_id", companyId)
        .eq("role", permRole)
      setRolePerms(perms || [])
    })()
  }, [companyId, permRole])

  // Sync the form states when role/resource or permissions change
  useEffect(() => {
    if (!rolePerms || rolePerms.length === 0) {
      // إذا لم يتم تحميل صلاحيات بعد، نستخدم الافتراضيات
      setPermAccess(true)
      setPermRead(true)
      setPermWrite(false)
      setPermUpdate(false)
      setPermDelete(false)
      setPermFull(false)
      setPermAllowedActions([])
      return
    }

    const currentPerm = rolePerms.find(p => p.resource === permResource)

    if (currentPerm) {
      // تحديث الحالة بناءً على الصلاحيات المحفوظة في قاعدة البيانات
      setPermAccess(currentPerm.can_access !== false)
      setPermRead(currentPerm.can_read !== false)
      setPermWrite(currentPerm.can_write === true)
      setPermUpdate(currentPerm.can_update === true)
      setPermDelete(currentPerm.can_delete === true)
      setPermFull(currentPerm.all_access === true)

      // ✅ Enterprise ERP Action-Level Control Update
      // Format allowed_actions from DB
      let actions: AdvancedAction[] = []
      if (currentPerm.allowed_actions && Array.isArray(currentPerm.allowed_actions)) {
        actions = currentPerm.allowed_actions.map((a: string) => {
          if (a === "*") {
            return "*" as any // Special case
          }
          if (a.includes(':')) {
            return a.split(':')[1] as AdvancedAction
          }
          return a as AdvancedAction
        }).filter((a: any) => a !== "*") // Skip '*' if permFull is true anyway

        // If * is present, populate all available advanced actions for the resource
        if (currentPerm.allowed_actions.includes("*") && ADVANCED_ACTIONS_MAP[permResource]) {
          actions = ADVANCED_ACTIONS_MAP[permResource].map((a: any) => a.value)
        }
      }
      setPermAllowedActions(actions)

    } else {
      // إذا لم يوجد صلاحية مخصصة لهذا المورد وهذا الدور، نضع الافتراضيات
      setPermAccess(true)
      setPermRead(true)
      setPermWrite(false)
      setPermUpdate(false)
      setPermDelete(false)
      setPermFull(false)
      setPermAllowedActions([])
    }
  }, [permRole, permResource, rolePerms])

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
      // تحديث الدعوات أيضاً (غير مقبولة وغير منتهية)
      const { data: cinv } = await supabase
        .from("company_invitations")
        .select("id,email,role,expires_at,accept_token")
        .eq("company_id", companyId)
        .eq("accepted", false)
        .gt("expires_at", new Date().toISOString())
      setInvites((cinv || []) as any)
    } catch { } finally {
      setRefreshing(false)
    }
  }

  // 🔐 جلب بيانات الصلاحيات المشتركة والمنقولة
  const loadPermissionData = async () => {
    if (!companyId) return
    try {
      // جلب الصلاحيات المشتركة
      const sharingRes = await fetch(`/api/permissions?company_id=${companyId}&type=sharing`)
      const sharingData = await sharingRes.json()
      console.log("📌 Sharing API response:", sharingRes.ok, sharingData)
      if (sharingRes.ok) {
        const sharingList = sharingData.data || []
        console.log("📌 Setting permissionSharing:", sharingList.length, "items")
        setPermissionSharing(sharingList)
      }

      // جلب سجل النقل
      const transfersRes = await fetch(`/api/permissions?company_id=${companyId}&type=transfers`)
      const transfersData = await transfersRes.json()
      console.log("📌 Transfers API response:", transfersRes.ok, transfersData)
      if (transfersRes.ok) setPermissionTransfers(transfersData.data || [])

      // جلب وصول الفروع
      const branchAccessRes = await fetch(`/api/permissions/branch-access?company_id=${companyId}`)
      const branchAccessData = await branchAccessRes.json()
      console.log("📌 Branch Access API response:", branchAccessRes.ok, branchAccessData)
      if (branchAccessRes.ok) setUserBranchAccess(branchAccessData.data || [])

      // v3.71.0 — جلب "مُشارَك مَعى" (inbound shares to current user)
      const swmRes = await fetch(`/api/permissions/shared-with-me?company_id=${companyId}`)
      if (swmRes.ok) {
        const swmData = await swmRes.json()
        setSharedWithMe(swmData.data || [])
      }

      // v3.74.1 — جلب الأرشيف (مَحذوف / مُنتَهى) لتَدقيق وحفظ السِّجل
      const archSharingRes = await fetch(`/api/permissions?company_id=${companyId}&type=sharing&include_inactive=true`)
      if (archSharingRes.ok) {
        const archData = await archSharingRes.json()
        const all = (archData.data || []) as any[]
        // Show only the inactive ones in the archive view (active ones already in main tab)
        setArchivedSharing(all.filter((p: any) => p.is_active === false))
      }

      const archSwmRes = await fetch(`/api/permissions/shared-with-me?company_id=${companyId}&include_inactive=true`)
      if (archSwmRes.ok) {
        const archSwmData = await archSwmRes.json()
        const allSwm = (archSwmData.data || []) as any[]
        setArchivedSharedWithMe(
          allSwm.filter((p: any) => {
            // Inactive OR expired
            const isInactive = p.is_active === false
            const isExpired = p.expires_at && new Date(p.expires_at) < new Date()
            return isInactive || isExpired
          })
        )
      }
    } catch (err) {
      console.error("Error loading permission data:", err)
    }
  }

  // 🧮 v3.73.1 — fetch record counts owned by the source user.
  // Called from both Vacation Cover and Share Permissions dialogs.
  const fetchSourceUserCounts = async (sourceUserId: string) => {
    if (!companyId || !sourceUserId) {
      setSourceUserCounts(null)
      return
    }
    setSourceCountsLoading(true)
    try {
      const { data, error } = await supabase.rpc("get_user_record_counts", {
        p_company_id: companyId,
        p_user_id: sourceUserId,
      })
      if (!error && data) {
        setSourceUserCounts({
          customers:    Number((data as any).customers    || 0),
          estimates:    Number((data as any).estimates    || 0),
          sales_orders: Number((data as any).sales_orders || 0),
          bookings:     Number((data as any).bookings     || 0),
        })
      } else {
        setSourceUserCounts(null)
      }
    } catch {
      setSourceUserCounts(null)
    } finally {
      setSourceCountsLoading(false)
    }
  }

  // 🧮 v3.73.1 — reactive: whenever the source user changes in either dialog,
  // refresh counts and auto-narrow resource_type if "all" was selected but
  // only one category has records.
  useEffect(() => {
    const sourceId = vacGrantorId || selectedSourceUser
    if (sourceId) {
      fetchSourceUserCounts(sourceId)
    } else {
      setSourceUserCounts(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vacGrantorId, selectedSourceUser, companyId])

  // 🧮 v3.73.1 — auto-narrow: if user picked "all" but the source actually
  // only has one type of record, set the dropdown to that type for them.
  useEffect(() => {
    if (!sourceUserCounts) return
    const entries = (Object.entries(sourceUserCounts) as Array<[string, number]>)
      .filter(([, n]) => n > 0)
    if (entries.length === 1) {
      const onlyKey = entries[0][0]
      if (vacResourceType === "all" && vacGrantorId) setVacResourceType(onlyKey)
      if (selectedResourceType === "all" && selectedSourceUser) setSelectedResourceType(onlyKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUserCounts])

  // تحميل بيانات الصلاحيات عند تحميل الصفحة
  useEffect(() => {
    if (companyId && canManage) {
      loadPermissionData()
    }
  }, [companyId, canManage])

  // v3.74.63 — fetch source's owned customers when in transfer/customers mode
  useEffect(() => {
    if (
      permissionAction !== "transfer" ||
      selectedResourceType !== "customers" ||
      !selectedSourceUser ||
      !companyId
    ) {
      setSourceCustomers([])
      setSelectedCustomerIds([])
      setCustomerSearchQuery("")
      return
    }
    let cancelled = false
    setSourceCustomersLoading(true)
    ;(async () => {
      try {
        let q = supabase
          .from("customers")
          .select("id, name, phone, branch_id")
          .eq("company_id", companyId)
          .eq("created_by_user_id", selectedSourceUser)
          .order("name")
        if (transferBranchId) q = q.eq("branch_id", transferBranchId)
        const { data, error } = await q
        if (cancelled) return
        if (error) { setSourceCustomers([]); return }
        setSourceCustomers((data as any) || [])
        setSelectedCustomerIds([])
      } finally {
        if (!cancelled) setSourceCustomersLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionAction, selectedResourceType, selectedSourceUser, transferBranchId, companyId])

  // 🔄 نقل الصلاحيات
  const handleTransferPermissions = async () => {
    if (!selectedSourceUser || selectedTargetUsers.length === 0) {
      toastActionError(toast, t("Transfer", "نقل"), t("Permissions", "الصلاحيات"), t("You must select the source employee and the target employees", "يجب تحديد الموظف المصدر والموظفين الهدف"))
      return
    }
    setPermissionLoading(true)
    try {
      const res = await fetch("/api/permissions/transfer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          from_user_id: selectedSourceUser,
          to_user_ids: selectedTargetUsers,
          resource_type: selectedResourceType,
          ...(transferBranchId ? { branch_id: transferBranchId } : {}),
          // v3.74.63 — hand-picked customer IDs (empty = move ALL legacy)
          ...(selectedResourceType === "customers" && selectedCustomerIds.length > 0
            ? { customer_ids: selectedCustomerIds }
            : {})
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toastActionSuccess(toast, t("Transfer", "نقل"), t(`${data.total_transferred} records`, `${data.total_transferred} سجل`))
        setShowPermissionDialog(false)
        resetPermissionForm()
        loadPermissionData()
      } else {
        toastActionError(toast, t("Transfer", "نقل"), t("Permissions", "الصلاحيات"), data.error)
      }
    } catch (err: any) {
      toastActionError(toast, t("Transfer", "نقل"), t("Permissions", "الصلاحيات"), err.message)
    } finally {
      setPermissionLoading(false)
    }
  }

  // 🔓 فتح الصلاحيات (مشاركة)
  const handleSharePermissions = async () => {
    if (!selectedSourceUser || selectedTargetUsers.length === 0) {
      toastActionError(toast, t("Share", "مشاركة"), t("Permissions", "الصلاحيات"), t("You must select the source employee and the target employees", "يجب تحديد الموظف المصدر والموظفين الهدف"))
      return
    }
    setPermissionLoading(true)
    try {
      const res = await fetch("/api/permissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          action: "share",
          grantor_user_id: selectedSourceUser,
          grantee_user_ids: selectedTargetUsers,
          resource_type: selectedResourceType,
          can_view: true,
          can_edit: shareCanEdit,
          can_delete: shareCanDelete
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toastActionSuccess(toast, t("Share", "مشاركة"), t("Permissions", "الصلاحيات"))
        setShowPermissionDialog(false)
        resetPermissionForm()
        loadPermissionData()
      } else {
        toastActionError(toast, t("Share", "مشاركة"), t("Permissions", "الصلاحيات"), data.error)
      }
    } catch (err: any) {
      toastActionError(toast, t("Share", "مشاركة"), t("Permissions", "الصلاحيات"), err.message)
    } finally {
      setPermissionLoading(false)
    }
  }

  // 🌴 v3.72.0 — Vacation Cover one-click delegation.
  // Thin wrapper around the existing share API: same endpoint, plus an
  // expires_at and a structured note so the receiving user knows it's a
  // vacation cover and the cron auto-deactivates it on the end date.
  const handleVacationCover = async () => {
    if (!vacGrantorId || vacGranteeIds.length === 0 || !vacEndDate) {
      toastActionError(toast, t("Delegate", "تَفويض"), t("Vacation", "إجازة"), t("You must select the absent employee, the substitute, and the end date", "يجب تَحديد الموظف الغائب، البَديل، وتاريخ الانتهاء"))
      return
    }
    if (vacEndDate < vacStartDate) {
      toastActionError(toast, t("Delegate", "تَفويض"), t("Vacation", "إجازة"), t("The end date must be after the start date", "تاريخ الانتهاء يجب أن يكون بعد تاريخ البَدء"))
      return
    }
    setVacLoading(true)
    try {
      const grantor = members.find(m => m.user_id === vacGrantorId)
      const grantorLabel = grantor?.display_name || grantor?.email || "موظف"
      const note = `[تَفويض إجازة] ${grantorLabel} — من ${vacStartDate} إلى ${vacEndDate}${vacReason ? ` — ${vacReason}` : ""}`

      // expires_at is end-of-day in UTC for the picked end date
      const expiresAt = new Date(`${vacEndDate}T23:59:59Z`).toISOString()

      const res = await fetch("/api/permissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          action: "share",
          grantor_user_id: vacGrantorId,
          grantee_user_ids: vacGranteeIds,
          resource_type: vacResourceType,
          can_view: true,
          can_edit: true,    // vacation cover defaults to edit so the delegate can actually work
          can_delete: false,
          expires_at: expiresAt,
          notes: note,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toastActionSuccess(toast, t("Vacation cover", "تَفويض إجازة"), t(`${vacGranteeIds.length} substitute(s) until ${vacEndDate}`, `${vacGranteeIds.length} بديل حتى ${vacEndDate}`))
        setShowVacationDialog(false)
        setVacGrantorId("")
        setVacGranteeIds([])
        setVacStartDate(new Date().toISOString().slice(0, 10))
        setVacEndDate("")
        setVacResourceType("all")
        setVacReason("")
        loadPermissionData()
      } else {
        toastActionError(toast, t("Vacation cover", "تَفويض إجازة"), t("Failed", "فشل"), data.error || t("Error", "خطأ"))
      }
    } catch (err: any) {
      toastActionError(toast, t("Vacation cover", "تَفويض إجازة"), t("Error", "خطأ"), err.message)
    } finally {
      setVacLoading(false)
    }
  }

  // 🏢 إضافة وصول فروع متعددة
  const handleAddBranchAccess = async () => {
    if (!selectedSourceUser || selectedBranches.length === 0) {
      toastActionError(toast, t("Add", "إضافة"), t("Branch access", "وصول الفروع"), t("You must select the employee and the branches", "يجب تحديد الموظف والفروع"))
      return
    }
    setPermissionLoading(true)
    try {
      const res = await fetch("/api/permissions/branch-access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          user_id: selectedSourceUser,
          branch_ids: selectedBranches
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toastActionSuccess(toast, t("Add", "إضافة"), t("Branch access", "وصول الفروع"))
        setShowPermissionDialog(false)
        resetPermissionForm()
        loadPermissionData()
      } else {
        toastActionError(toast, t("Add", "إضافة"), t("Branch access", "وصول الفروع"), data.error)
      }
    } catch (err: any) {
      toastActionError(toast, t("Add", "إضافة"), t("Branch access", "وصول الفروع"), err.message)
    } finally {
      setPermissionLoading(false)
    }
  }

  // إعادة تعيين النموذج
  const resetPermissionForm = () => {
    setSelectedSourceUser("")
    setSelectedTargetUsers([])
    setSelectedResourceType("all")
    setSelectedBranches([])
    // v3.74.63
    setSourceCustomers([])
    setSelectedCustomerIds([])
    setCustomerSearchQuery("")
    setShareCanEdit(false)
    setShareCanDelete(false)
  }

  // 🏢 فتح dialog إدارة فرع الموظف (Single Branch - Mandatory)
  const openMemberBranchDialog = async (member: Member) => {
    setEditingMemberId(member.user_id)
    setEditingMemberName(member.display_name || member.email || member.username || "")
    // v3.74.329 — keep the member's role around so the dialog can decide
    // whether to expose the "بدون فرع" option.
    setEditingMemberRole(member.role || "")

    // ✅ المستخدم له فرع واحد فقط - استخدام branch_id من company_members
    // v3.74.329 — booking_officer قد يكون بدون فرع؛ نعرض الـ sentinel
    // الخاص فى الـ select ليطابق "عدم الربط بفرع".
    const memberBranchId = member.branch_id
      || (member.role === 'booking_officer' ? '__NONE__' : '')
    setMemberBranchId(memberBranchId)
    setShowMemberBranchDialog(true)
  }

  // 🏢 حفظ فرع الموظف (Single Branch - Mandatory for most roles)
  // v3.74.329 — booking_officer may legitimately have NO branch (a
  // floating reception role for the whole company); validation is
  // relaxed for that role only.
  const NO_BRANCH = "__NONE__"
  const saveMemberBranches = async () => {
    if (!editingMemberId) {
      toastActionError(toast, t("Save", "حفظ"), t("Branch", "الفرع"), t("Not specified", "غير محدد"))
      return
    }
    const isBookingOfficer = editingMemberRole === "booking_officer"
    const isUnassigned     = memberBranchId === NO_BRANCH || memberBranchId === ""
    if (isUnassigned && !isBookingOfficer) {
      toastActionError(toast, t("Save", "حفظ"), t("Branch", "الفرع"), t("Selecting one branch is mandatory", "يجب تحديد فرع واحد إلزاميًا"))
      return
    }
    setSavingMemberBranches(true)
    try {
      // ✅ التحقق من أن branch_id ليس مصفوفة (منع التلاعب)
      if (Array.isArray(memberBranchId)) {
        throw new Error('User can belong to only one branch')
      }

      // v3.74.329 — Resolve the actual branch_id to persist. The dialog
      // uses the sentinel "__NONE__" (NO_BRANCH) for the booking_officer
      // "بدون فرع" choice; everywhere else we want NULL on the row.
      const effectiveBranchId: string | null = isUnassigned ? null : memberBranchId

      // 🏢 جلب المخزن التابع للفرع الجديد (إذا كان المستخدم store_manager)
      const currentMember = members.find(m => m.user_id === editingMemberId)
      let warehouseId = null

      if (currentMember?.role === 'store_manager' && effectiveBranchId) {
        const { data: branchWarehouse } = await supabase
          .from("warehouses")
          .select("id")
          .eq("company_id", companyId)
          .eq("branch_id", effectiveBranchId)
          .maybeSingle()

        warehouseId = branchWarehouse?.id || null
        console.log("🏢 Auto-updating warehouse for store_manager:", {
          userId: editingMemberId,
          newBranchId: effectiveBranchId,
          newWarehouseId: warehouseId
        })
      }

      // ✅ تحديث الفرع في company_members (فرع واحد، يقبل NULL لمسؤول الحجز)
      const { error: updateError } = await supabase
        .from("company_members")
        .update({
          branch_id: effectiveBranchId,
          warehouse_id: warehouseId // 🏢 تحديث المخزن تلقائياً
        })
        .eq("company_id", companyId)
        .eq("user_id", editingMemberId)

      if (updateError) throw updateError

      // ✅ تحديث user_branch_access - فرع واحد فقط
      // حذف جميع الفروع القديمة أولاً
      await supabase
        .from("user_branch_access")
        .update({ is_active: false })
        .eq("company_id", companyId)
        .eq("user_id", editingMemberId)

      // إضافة الفرع الجديد كفرع أساسي
      // v3.74.329 — لو مسؤول حجز بدون فرع، نتخطى user_branch_access entry
      // لإنه يطلب branch_id NOT NULL.
      if (effectiveBranchId) {
        const { error: accessError } = await supabase
          .from("user_branch_access")
          .upsert({
            company_id: companyId,
            user_id: editingMemberId,
            branch_id: effectiveBranchId,
            is_primary: true,
            access_type: 'full',
            can_view_customers: true,
            can_view_orders: true,
            can_view_invoices: true,
            can_view_inventory: true,
            can_view_prices: false,
            is_active: true,
            created_by: currentUserId
          }, { onConflict: "company_id,user_id,branch_id" })

        if (accessError) throw accessError
      }

      // تحديث القائمة المحلية
      setMembers(prev => prev.map(m =>
        m.user_id === editingMemberId ? { ...m, branch_id: effectiveBranchId ?? undefined, warehouse_id: warehouseId ?? undefined } : m
      ))

      // v3.74.332 — also refresh userBranchAccess state in place.
      // getMemberBranchNames() reads from this state first; if we only
      // update setMembers, an "بدون فرع" save would still render the
      // stale branch name until the next page reload because the old
      // user_branch_access rows live on in the local state with
      // is_active=true. We just deactivated them all in the DB above;
      // mirror that locally, then add the new row if there is one.
      setUserBranchAccess(prev => {
        const others = prev.filter(a => a.user_id !== editingMemberId)
        if (effectiveBranchId) {
          others.push({
            id: 'local-' + Date.now(),
            user_id: editingMemberId,
            branch_id: effectiveBranchId,
            is_primary: true,
            can_view_customers: true,
            can_view_orders: true,
            can_view_prices: false,
            is_active: true,
          } as UserBranchAccess)
        }
        return others
      })

      toastActionSuccess(toast, t("Save", "حفظ"), t("Employee branch", "فرع الموظف"))

      // إنشاء إشعار للمستخدم عند تغيير فرعه من الخلفية فقط
      if ((currentMember?.branch_id || "") !== memberBranchId) {
        try {
          await dispatchUserWorkflowNotification(editingMemberId, {
            action: "branch_changed",
            branchId: memberBranchId,
          })
        } catch (notifError) {
          console.error("Error creating notification:", notifError)
          // لا نوقف العملية إذا فشل إنشاء الإشعار
        }
      }

      setShowMemberBranchDialog(false)
      loadPermissionData()

      // 🔄 إطلاق event لإعادة تحميل البيانات في الصفحات الأخرى
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('user_context_changed'))
          console.log("🔄 Dispatched user_context_changed event after branch/warehouse update")
        }
      } catch { }
    } catch (err: any) {
      toastActionError(toast, t("Save", "حفظ"), t("Branches", "الفروع"), err.message)
    } finally {
      setSavingMemberBranches(false)
    }
  }

  // 🔗 فتح dialog ربط العضو بالموظف
  const openLinkEmployeeDialog = async (member: Member) => {
    setLinkingMember(member)
    setSelectedEmployeeId(member.employee_id || "")
    setShowLinkEmployeeDialog(true)

    // Load employees list
    try {
      const res = await fetch("/api/hr/employees")
      if (res.ok) {
        const data = await res.json()
        setEmployeesList(Array.isArray(data) ? data : data.data || [])
      }
    } catch (err) {
      console.error("Error loading employees:", err)
    }
  }

  // 🔗 حفظ ربط العضو بالموظف
  const saveLinkEmployee = async () => {
    if (!linkingMember) return
    setLinkingEmployee(true)
    try {
      const res = await fetch("/api/company-members/link-employee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberUserId: linkingMember.user_id,
          employeeId: selectedEmployeeId || null,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || t("Failed to link member to employee", "فشل ربط العضو بالموظف"))

      // Update local state
      const emp = employeesList.find(e => e.id === selectedEmployeeId)
      setMembers(prev => prev.map(m =>
        m.user_id === linkingMember.user_id
          ? {
              ...m,
              employee_id: selectedEmployeeId || undefined,
              employee_name: emp?.full_name,
              display_name: emp?.full_name || m.display_name,
            }
          : m
      ))

      toastActionSuccess(toast, t("Link", "ربط"), selectedEmployeeId ? t("Member to employee", "العضو بالموظف") : t("Unlink", "إلغاء الربط"))
      setShowLinkEmployeeDialog(false)
      // Notify sidebar to refresh display_name only
      window.dispatchEvent(new Event('profile_updated'))
    } catch (err: any) {
      toastActionError(toast, t("Link", "ربط"), t("Member to employee", "العضو بالموظف"), err.message)
    } finally {
      setLinkingEmployee(false)
    }
  }

  // 🏢 الحصول على أسماء فروع الموظف
  const getMemberBranchNames = (member: Member): string => {
    const memberAccess = userBranchAccess.filter(a => a.user_id === member.user_id && a.is_active)
    if (memberAccess.length > 0) {
      return memberAccess.map(a => {
        const branch = branches.find(b => b.id === a.branch_id)
        return branch?.name || t("Unknown branch", "فرع غير معروف")
      }).join(t(", ", "، "))
    }
    if (member.branch_id) {
      const branch = branches.find(b => b.id === member.branch_id)
      return branch?.name || t("Unknown branch", "فرع غير معروف")
    }
    return t("Not assigned", "غير محدد")
  }

  const createInvitation = async () => {
    const targetCompanyId = (inviteCompanyId || companyId)
    if (!targetCompanyId || !inviteEmail.trim() || !inviteName.trim()) return
    if (!canManage) { setActionError(t("You do not have permission to create invitations", "ليست لديك صلاحية لإنشاء دعوات")); return }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(inviteEmail.trim())) { setActionError(t("Invalid email address", "البريد الإلكتروني غير صالح")); return }
    if (!inviteName.trim()) { setActionError(t("Employee name is required", "اسم الموظف مطلوب")); return }
    if (!inviteBranchId) { setActionError(t("Branch selection is required", "يجب تحديد الفرع")); return }
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
        // 🔐 السماح للأدوار الإدارية بإرسال دعوات
        const canManageTarget = ["owner", "admin", "general_manager", "manager"].includes(String(myMemberTarget?.role || ""))
        if (!canManageTarget) { setActionError(t("You do not have permission to send an invitation for this company", "ليست لديك صلاحية لإرسال دعوة لهذه الشركة")); return }
      } catch { }

      // ✅ Always go through API — enforces seat checks server-side
      const res = await fetch("/api/send-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          employeeName: inviteName.trim(),
          role: inviteRole,
          branch_id: inviteBranchId || null,
          cost_center_id: inviteCostCenterId || null,
          warehouse_id: inviteWarehouseId || null,
        }),
      })
      const data = await res.json()

      // ✅ Handle 402: No seats available
      if (res.status === 402) {
        setActionError(t("No seats available. To send a new invitation, please add a paid seat to the company subscription.", "لا توجد مقاعد متاحة. لإرسال دعوة جديدة، يرجى إضافة مقعد مدفوع إلى اشتراك الشركة."))
        return
      }

      if (!res.ok) {
        setActionError(data?.error || data?.message || t("Failed to create the invitation", "تعذر إنشاء الدعوة"))
        return
      }

      setInviteEmail("")
      setInviteName("")
      setInviteRole("staff")
      const { data: cinv } = await supabase
        .from("company_invitations")
        .select("id,email,role,expires_at,branch_id,cost_center_id,warehouse_id,accept_token")
        .eq("company_id", companyId)
        .eq("accepted", false)
        .gt("expires_at", new Date().toISOString())
      setInvites((cinv || []) as any)
      // v3.74.294 — Surface the case where the invitation was created but
      // Resend rejected the email (unverified domain / expired API key /
      // network). The row is in the DB, the link is valid; the inviter
      // just needs to copy it with the "نسخ الرابط" button below.
      if (data?.email_delivered === false || data?.type === "manual") {
        setActionError(
          data?.warning ||
          t("The invitation was saved but the email was not sent (Resend rejected it). Copy the link using the 'Copy Link' button in the pending invitations and send it manually.", "الدعوة اتسجّلت لكن الإيميل ما اتبعتش (Resend رفض الإرسال). انسخ الرابط من زرار 'نسخ الرابط' فى الدعوات المعلقة وابعته يدوياً.")
        )
      } else {
        toastActionSuccess(toast, t("Create", "إنشاء"), t("Invitation", "الدعوة"))
      }
    } catch (e) {
      setActionError((e as any)?.message || t("An error occurred while creating the invitation", "حدث خطأ أثناء إنشاء الدعوة"))
    } finally { setLoading(false) }
  }


  const updateRole = async (id: string, role: string) => {
    if (!canManage) { setActionError(t("You do not have permission to change roles", "ليست لديك صلاحية لتغيير الأدوار")); return }
    setLoading(true)
    try {
      setActionError(null)
      const m = members.find((x) => x.id === id)
      if (!m) { setActionError(t("Member not found", "العضو غير موجود")); return }
      // منع فقدان آخر مالك
      const owners = members.filter((x) => x.role === "owner")
      if (m.role === "owner" && owners.length === 1 && role !== "owner") { setActionError(t("Cannot change the role of the last owner", "لا يمكن تغيير دور آخر مالك")); return }
      // منع خفض دور المستخدم الحالي إلى عرض فقط بدون وجود مدير/مالك آخر
      if (m.user_id === currentUserId && !["owner", "admin"].includes(role)) {
        const hasOtherAdmin = members.some((x) => x.user_id !== currentUserId && ["owner", "admin"].includes(x.role))
        if (!hasOtherAdmin) { setActionError(t("You cannot downgrade your own role without another admin/owner", "لا يمكن خفض دورك دون وجود مدير/مالك آخر")); return }
      }
      const oldRole = m.role
      const { error } = await supabase
        .from("company_members")
        .update({ role })
        .eq("id", id)
      if (error) { setActionError(error.message || t("Update failed", "تعذر التحديث")); return }

      // إنشاء إشعار للمستخدم عند تغيير دوره
      if (oldRole !== role) {
        try {
          await dispatchUserWorkflowNotification(m.user_id, {
            action: "role_changed",
            oldRole,
            newRole: role,
          })
        } catch (notifError) {
          console.error("Error creating notification:", notifError)
          // لا نوقف العملية إذا فشل إنشاء الإشعار
        }
      }

      await refreshMembers()

      // ✅ تحديث الصلاحيات فقط إذا كان المستخدم الذي تم تغيير صلاحياته هو المستخدم الحالي
      // في حالة تغيير الدور، نتحقق من ذلك في مكان آخر (عند تغيير الدور مباشرة)
      // هنا نحن فقط نحدث الـ Sidebar لأن تغيير الدور تم في مكان آخر
      if (typeof window !== 'undefined') {
        // نرسل event للـ Sidebar فقط (لن يسبب إعادة تحميل الصلاحيات)
        window.dispatchEvent(new Event('sidebar_refresh'))
      }
    } finally {
      setLoading(false)
    }
  }

  const removeMember = async (id: string) => {
    if (!canManage) { setActionError(t("You do not have permission to remove members", "ليست لديك صلاحية لإزالة الأعضاء")); return }
    setLoading(true)
    try {
      setActionError(null)
      const m = members.find((x) => x.id === id)
      if (!m) { setActionError(t("Member not found", "العضو غير موجود")); return }
      const owners = members.filter((x) => x.role === "owner")
      if (m.role === "owner" && owners.length === 1) { setActionError(t("Cannot remove the last owner", "لا يمكن إزالة آخر مالك")); return }
      if (m.user_id === currentUserId) { setActionError(t("You cannot remove yourself", "لا يمكنك إزالة نفسك")); return }
      const { error } = await supabase
        .from("company_members")
        .delete()
        .eq("id", id)
      if (error) { setActionError(error.message || t("Removal failed", "تعذر الإزالة")); return }
      await refreshMembers()
    } finally {
      setLoading(false)
    }
  }

  const roleLabels: Record<string, { ar: string; en: string; color: string; description: string; descriptionEn: string }> = {
    owner: { ar: 'مالك', en: 'Owner', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', description: 'صلاحيات كاملة على كل شيء', descriptionEn: 'Full permissions over everything' },
    admin: { ar: 'مدير عام', en: 'Admin', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', description: 'إدارة كاملة للنظام', descriptionEn: 'Full system administration' },
    manager: { ar: 'مدير', en: 'Manager', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400', description: 'إدارة العمليات اليومية', descriptionEn: 'Manages daily operations' },
    accountant: { ar: 'محاسب', en: 'Accountant', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', description: 'إدارة الحسابات والفواتير', descriptionEn: 'Manages accounts and invoices' },
    store_manager: { ar: 'مسؤول مخزن', en: 'Store Manager', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', description: 'إدارة المخزون والمنتجات', descriptionEn: 'Manages inventory and products' },
    // ── الأدوار الجديدة ──────────────────────────────────────────
    manufacturing_officer: { ar: 'مسؤول التصنيع', en: 'Manufacturing Officer', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300', description: 'إدارة قوائم المواد والإنتاج', descriptionEn: 'Manages BOMs and production' },
    booking_officer: { ar: 'مسؤول الحجوزات', en: 'Booking Officer', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400', description: 'إدارة الحجوزات والخدمات', descriptionEn: 'Manages bookings and services' },
    purchasing_officer: { ar: 'مسؤول المشتريات', en: 'Purchasing Officer', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', description: 'إدارة المشتريات والموردين', descriptionEn: 'Manages purchasing and suppliers' },
    hr_officer: { ar: 'مسؤول الموارد البشرية', en: 'HR Officer', color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400', description: 'إدارة الموظفين والمرتبات والحضور', descriptionEn: 'Manages employees, payroll, and attendance' },
    staff: { ar: 'موظف', en: 'Staff', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', description: 'صلاحيات محدودة', descriptionEn: 'Limited permissions' },
    viewer: { ar: 'عرض فقط', en: 'Viewer', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400', description: 'عرض البيانات فقط', descriptionEn: 'View data only' },
  }

  // 🌐 Bilingual role name helper (display only)
  const roleName = (r: string) => (appLang === 'en' ? roleLabels[r]?.en : roleLabels[r]?.ar) || r

  // تصنيف الموارد حسب الفئات للعرض المنظم - جميع الصفحات الموجودة فعلياً في التطبيق
  const resourceCategories = {
    reports: {
      label: t('📊 Reports & Dashboard', '📊 التقارير واللوحة الرئيسية'),
      resources: [
        { value: 'dashboard', label: t('Dashboard', 'لوحة التحكم') },
        { value: 'reports', label: t('General Reports', 'التقارير العامة') },
      ]
    },
    sales: {
      label: t('💰 Sales', '💰 المبيعات'),
      resources: [
        { value: 'invoices', label: t('Sales Invoices', 'فواتير المبيعات') },
        { value: 'customers', label: t('Customers', 'العملاء') },
        { value: 'estimates', label: t('Estimates', 'العروض السعرية') },
        { value: 'sales_orders', label: t('Sales Orders', 'أوامر المبيعات') },
        { value: 'sales_returns', label: t('Sales Returns', 'مرتجعات المبيعات') },
        { value: 'sent_invoice_returns', label: t('Sent Invoice Returns', 'مرتجعات الفواتير المرسلة') },
        { value: 'customer_debit_notes', label: t('Customer Debit Notes', 'إشعارات دائن العملاء') },
        { value: 'customer_credits', label: t('Customer Credit Balances', 'الأرصدة الدائنة للعملاء') },
        // v3.74.492 — sales_return_requests resource retired. The
        // approval workflow now lives in the unified /approvals inbox
        // (resource: 'approvals').
        { value: 'customer_refund_requests', label: t('Customer Refund Requests', 'طلبات استرداد العملاء') },
      ]
    },
    services_bookings: {
      label: t('🎫 Services & Bookings', '🎫 الخدمات والحجوزات'),
      resources: [
        { value: 'services', label: t('Services', 'الخدمات') },
        { value: 'bookings', label: t('Bookings', 'الحجوزات') },
      ]
    },
    purchases: {
      label: t('🛒 Purchases', '🛒 المشتريات'),
      resources: [
        { value: 'bills', label: t('Purchase Bills', 'فواتير المشتريات') },
        { value: 'suppliers', label: t('Suppliers', 'الموردون') },
        { value: 'purchase_orders', label: t('Purchase Orders', 'أوامر الشراء') },
        { value: 'purchase_returns', label: t('Purchase Returns', 'مرتجعات المشتريات') },
        { value: 'vendor_credits', label: t('Vendor Credit Notes', 'إشعارات دائن الموردين') },
        { value: 'vendor_payment_correction_requests', label: t('Vendor Payment Correction Requests', 'طلبات تصحيح مدفوعات الموردين') },
      ]
    },
    inventory: {
      label: t('📦 Inventory', '📦 المخزون'),
      resources: [
        { value: 'products', label: t('Products', 'المنتجات') },
        { value: 'inventory', label: t('Inventory Movements', 'حركات المخزون') },
        { value: 'inventory_transfers', label: t('Inventory Transfers', 'تحويلات المخزون') },
        { value: 'write_offs', label: t('Inventory Write-offs', 'إهلاك المخزون') },
        { value: 'third_party_inventory', label: t('Third-Party Inventory', 'مخزون الطرف الثالث') },
        // صفحة توفر المنتجات في الفروع
        { value: 'product_availability', label: t('Product Availability by Branch', 'توفر المنتجات في الفروع') },
        // v3.74.492 — dispatch_approvals resource retired. The
        // warehouse dispatch flow (including approve-with-shipping
        // for API-integrated providers) lives in the unified
        // /approvals inbox now (resource: 'approvals', tab: disp).
        // v3.74.490 — inventory_goods_receipt resource retired.
        // Bill receipt + manufacturing product receive both live in
        // the unified /approvals inbox now (resource: 'approvals').
      ]
    },
    manufacturing: {
      label: t('🏭 Manufacturing', '🏭 التصنيع'),
      resources: [
        { value: 'manufacturing_boms', label: t('Manufacturing (BOMs, Routings, Production Orders)', 'التصنيع (هياكل المواد، مسارات التشغيل، أوامر الإنتاج)') },
      ]
    },
    // v3.74.482 — Approvals is now cross-cutting (not manufacturing-only),
    // so it gets its own top-level group in the role permissions grid.
    approvals: {
      label: t('🔔 Approvals Inbox', '🔔 صندوق الموافقات'),
      resources: [
        { value: 'approvals', label: t('Approvals Inbox (all categories: manufacturing, discounts, vendor payments, purchase & sales returns, refunds, corrections, dispatch, receiving, write-offs, transfers, and misc requests)', 'صندوق الموافقات (كل الفئات: تصنيع، خصومات، دفعات موردين، مرتجعات مشتريات ومبيعات، استرداد، تصحيح، صرف، استلام، إهلاك، تحويلات، وطلبات متنوعة)') },
      ]
    },
    finance: {
      label: t('🏦 Finance & Accounting', '🏦 المالية والمحاسبة'),
      resources: [
        { value: 'expenses', label: t('Expenses', 'المصروفات') },
        { value: 'drawings', label: t('Owner Drawings', 'المسحوبات الشخصية') },
        { value: 'annual_closing', label: t('Annual Closing', 'الإقفال السنوي') },
        { value: 'accounting_periods', label: t('Accounting Periods', 'الفترات المحاسبية') },
        { value: 'payments', label: t('Payments', 'المدفوعات') },
        { value: 'journal_entries', label: t('Journal Entries', 'القيود اليومية') },
        { value: 'chart_of_accounts', label: t('Chart of Accounts', 'الشجرة المحاسبية') },
        { value: 'banking', label: t('Banking', 'الأعمال المصرفية') },
        { value: 'shareholders', label: t('Shareholders', 'المساهمون') },
        { value: 'fixed_assets', label: t('Fixed Assets', 'الأصول الثابتة') },
        { value: 'asset_categories', label: t('Asset Categories', 'فئات الأصول') },
        { value: 'fixed_assets_reports', label: t('Fixed Asset Reports', 'تقارير الأصول الثابتة') },
        { value: 'fx_revaluation', label: t('FX Revaluation', 'إعادة تقييم العملات') },
        { value: 'fix_cogs', label: t('Fix COGS', 'إصلاح تكلفة البضاعة المباعة') },
      ]
    },
    hr: {
      label: t('👥 Human Resources', '👥 الموارد البشرية'),
      resources: [
        { value: 'hr', label: t('HR (Main)', 'الموارد البشرية (الرئيسية)') },
        { value: 'employees', label: t('Employees', 'الموظفين') },
        { value: 'attendance', label: t('Attendance', 'الحضور والانصراف') },
        { value: 'payroll', label: t('Payroll', 'الرواتب') },
        { value: 'instant_payouts', label: t('Instant Payouts', 'السلف الفورية') },
        { value: 'employee_bonuses', label: t('Employee Bonuses', 'حوافز الموظفين') },
      ]
    },
    organization: {
      label: t('🏢 Organization Structure', '🏢 الهيكل التنظيمي'),
      resources: [
        { value: 'branches', label: t('Branches', 'الفروع') },
        { value: 'cost_centers', label: t('Cost Centers', 'مراكز التكلفة') },
        { value: 'warehouses', label: t('Warehouses', 'المستودعات') },
      ]
    },
    settings: {
      label: t('⚙️ Settings', '⚙️ الإعدادات'),
      resources: [
        { value: 'settings', label: t('Settings (Main)', 'الإعدادات (الرئيسية)') },
        { value: 'system_status', label: t('System Status', 'حالة النظام') },
        { value: 'company_settings', label: t('Company Settings', 'إعدادات الشركة') },
        { value: 'users', label: t('Users', 'المستخدمون') },
        { value: 'exchange_rates', label: t('Exchange Rates', 'أسعار العملات') },
        { value: 'taxes', label: t('Taxes', 'الضرائب') },
        { value: 'audit_log', label: t('Audit Log', 'سجل التدقيق') },
        { value: 'backup', label: t('Backup', 'النسخ الاحتياطي') },
        { value: 'shipping', label: t('Shipping Settings', 'إعدادات الشحن') },
        { value: 'profile', label: t('Profile', 'الملف الشخصي') },
        { value: 'orders_rules', label: t('Order Rules', 'قواعد الطلبات') },
        { value: 'accounting_maintenance', label: t('Accounting Maintenance', 'صيانة المحاسبة') },
        { value: 'commissions', label: t('Commission Rules', 'قواعد العمولات') },
        { value: 'notifications', label: t('Notification Preferences', 'تفضيلات الإشعارات') },
        { value: 'billing', label: t('Billing & Subscription', 'الفوترة والاشتراك') },
        { value: 'seats', label: t('Seat Management', 'إدارة المقاعد') },
        { value: 'tooltips', label: t('UI Tooltips', 'نَصائح الواجهة') },
      ]
    },
    permissions: {
      label: t('🔐 Permissions Management', '🔐 إدارة الصلاحيات'),
      resources: [
        { value: 'permission_sharing', label: t('Permission Sharing', 'مشاركة الصلاحيات') },
        { value: 'permission_transfers', label: t('Permission Transfers', 'نقل الصلاحيات') },
        { value: 'user_branch_access', label: t('Branch Access', 'وصول الفروع') },
        { value: 'role_permissions', label: t('Role Permissions', 'صلاحيات الأدوار') },
      ]
    },
  }

  const getResourceLabel = (value: string) => {
    return Object.values(resourceCategories)
      .flatMap((cat) => cat.resources)
      .find((r) => r.value === value)?.label || value
  }

  // 🔐 v3.69.0 — VERBATIM defaults per Ahmed's spec. Mirror of DB function
  // public.seed_default_role_permissions(p_company_id). The DB trigger on
  // companies INSERT auto-seeds these for every NEW company. Admins can
  // override per-company from /settings/users → صلاحيات الأدوار.
  // dashboard appears ONLY where Ahmed explicitly listed it (accountant + manager).
  const defaultSidebarResourcesByRole: Record<string, string[]> = {
    owner: Object.values(resourceCategories).flatMap((cat) => cat.resources.map((r) => r.value)),
    admin: Object.values(resourceCategories).flatMap((cat) => cat.resources.map((r) => r.value)),
    // 1. الموظف (sales rep) — 4 pages verbatim
    staff: ['customers', 'estimates', 'sales_orders', 'inventory'],
    // 2. المحاسب — 17 pages (dashboard explicit in spec)
    // v3.74.484 — 'approvals' added so accountant can act on discount
    // + payment + bill amendment approvals directly from the unified inbox.
    accountant: [
      'dashboard',
      'approvals',
      'invoices', 'sales_returns', 'customer_credits',
      'bills', 'purchase_returns',
      'products', 'services',
      'inventory', 'inventory_transfers', 'third_party_inventory', 'write_offs',
            'payments', 'expenses', 'banking',
    ],
    // 3. مسؤول المشتريات — 5 pages verbatim
    // v3.74.484 — 'approvals' added so purchasing officer sees
    // purchase-request + PO discount approvals in the inbox.
    purchasing_officer: [
      'approvals',
      'suppliers', 'purchase_orders', 'inventory',
          ],
    // 4. مسؤول الحجوزات — 2 pages verbatim
    booking_officer: ['bookings', 'customers'],
    // 5. مسؤول التصنيع — 2 entries verbatim (umbrella covers 7 sub-pages)
    manufacturing_officer: ['manufacturing_boms', 'approvals'],
    // 6. مسؤول المخزن — 6 pages verbatim
    // v3.74.484 — 'approvals' added so warehouse notifications
    // (goods receipt, dispatch, inventory transfers, write-offs) land
    // on the unified inbox with the store manager's warehouse filter
    // preserved via RLS + get_user_approval_badges.
    store_manager: [
      'approvals',
      'inventory', 'inventory_transfers', 'third_party_inventory', 'write_offs',
          ],
    // 7. المدير (branch manager) — 25 pages, union, ALL READ-ONLY
    manager: [
      'dashboard',
      'customers', 'estimates', 'sales_orders',
      'invoices', 'sales_returns', 'customer_credits',
      'bills', 'purchase_returns',
      'products', 'services',
      'inventory', 'inventory_transfers', 'third_party_inventory', 'write_offs',
            'payments', 'expenses', 'banking',
      'suppliers', 'purchase_orders',
      'bookings',
      'manufacturing_boms', 'approvals',
    ],
    // HR officer (kept from v3.65.4 — not redefined in Ahmed's spec)
    hr_officer: [
      'dashboard', 'reports', 'hr', 'employees', 'payroll', 'attendance',
      'instant_payouts', 'employee_bonuses', 'branches', 'cost_centers',
    ],
    // Read-only auditor (company-wide)
    viewer: ['dashboard', 'reports'],
  }

  // حالة التحميل
  if (pageLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-4 md:p-8 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 mx-auto mb-4 text-blue-500 animate-spin" />
            <p className="text-gray-500 dark:text-gray-400">{t("Loading user data...", "جاري تحميل بيانات المستخدمين...")}</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
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
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{t("Users", "المستخدمون")}</h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">{t("Manage company members and their permissions", "إدارة أعضاء الشركة وصلاحياتهم")}</p>
                  {/* 🔐 Governance Notice */}
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    {t("👑 Administrative access - all users are visible", "👑 صلاحية إدارية - جميع المستخدمين مرئيين")}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs">
                      <Building2 className="w-3 h-3 ml-1" />
                      {companyName}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={refreshMembers} disabled={refreshing} className="gap-2">
                  <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  {t("Refresh", "تحديث")}
                </Button>
                <Link href="/settings">
                  <Button variant="outline" className="gap-2">
                    <ChevronRight className="w-4 h-4 rotate-180" />
                    {t("Back to Settings", "العودة للإعدادات")}
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
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t("View-only mode", "وضع العرض فقط")}</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{t("You do not have permission to edit users. Contact the company administrator for access.", "ليس لديك صلاحية لتعديل المستخدمين. تواصل مع مدير الشركة للحصول على الصلاحيات.")}</p>
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
                  <CardTitle className="text-base">{t("Company Members", "أعضاء الشركة")}</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">{t("The owner and admins can edit roles and manage members", "يمكن للمالك والمدير تعديل الأدوار وإدارة الأعضاء")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="gap-1">
                  <Users className="w-3 h-3" />
                  {members.length} {t("members", "عضو")}
                </Badge>
                {currentRole && (
                  <Badge className={roleLabels[currentRole]?.color || roleLabels.viewer.color}>
                    {t("Your role:", "دورك:")} {roleName(currentRole)}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {members.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t("No members yet", "لا يوجد أعضاء حالياً")}</p>
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
                          {m.is_current && <Badge className="text-[10px] bg-blue-500 text-white">{t("You", "أنت")}</Badge>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {m.email && (
                            <span className="text-xs text-muted-foreground">{m.email}</span>
                          )}
                          <Badge className={`text-[10px] ${roleLabels[m.role]?.color || roleLabels.viewer.color}`}>
                            {roleName(m.role)}
                          </Badge>
                          {/* 🏢 عرض الفروع المرتبطة */}
                          <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800">
                            <MapPin className="w-2.5 h-2.5" />
                            {getMemberBranchNames(m)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* 🏢 زر إدارة الفروع */}
                      {canManage && !m.is_current && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openMemberBranchDialog(m)}
                          className="gap-1 h-8 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        >
                          <GitBranch className="w-3 h-3" />
                          {t("Branches", "الفروع")}
                        </Button>
                      )}
                      {/* 🔗 زر ربط بالموظف */}
                      {canManage && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openLinkEmployeeDialog(m)}
                          className={`gap-1 h-8 text-xs ${m.employee_id
                            ? "text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20 border-purple-200"
                            : "text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                          }`}
                        >
                          <UserCog className="w-3 h-3" />
                          {m.employee_id ? (m.employee_name || t("Linked", "مرتبط")) : t("Link to Employee", "ربط بموظف")}
                        </Button>
                      )}
                      {canManage && !m.is_current && (
                        <>
                          <Select value={m.role} onValueChange={async (nr) => {
                            try {
                              const res = await fetch("/api/member-role", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId, userId: m.user_id, role: nr }) })
                              const js = await res.json()
                              if (res.ok && js?.ok) {
                                setMembers((prev) => prev.map((x) => x.user_id === m.user_id ? { ...x, role: nr } : x))
                                toastActionSuccess(toast, t("Update", "تحديث"), t("Role", "الدور"))

                                // ✅ تحديث الصلاحيات فقط إذا كنا نغير دور المستخدم الحالي
                                if (m.user_id === currentUserId) {
                                  // نحن نغير دور المستخدم الحالي - نحدث الصلاحيات
                                  setTimeout(async () => {
                                    try {
                                      await refreshPermissions()
                                      if (typeof window !== 'undefined') {
                                        window.dispatchEvent(new Event('permissions_updated'))
                                      }
                                    } catch (err) {
                                      console.error('Error refreshing permissions:', err)
                                    }
                                  }, 500)
                                } else {
                                  // نغير دور مستخدم آخر - نحدث فقط الـ Sidebar
                                  if (typeof window !== 'undefined') {
                                    window.dispatchEvent(new Event('sidebar_refresh'))
                                  }
                                }
                              } else {
                                toastActionError(toast, t("Update", "تحديث"), t("Role", "الدور"), js?.error || undefined)
                              }
                            } catch (err: any) { toastActionError(toast, t("Update", "تحديث"), t("Role", "الدور"), err?.message) }
                          }}>
                            <SelectTrigger className="w-28 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="owner">{t("Owner", "مالك")}</SelectItem>
                              <SelectItem value="admin">{t("Admin", "مدير عام")}</SelectItem>
                              <SelectItem value="manager">{t("Manager", "مدير")}</SelectItem>
                              <SelectItem value="accountant">{t("Accountant", "محاسب")}</SelectItem>
                              <SelectItem value="store_manager">{t("Store Manager", "مسؤول مخزن")}</SelectItem>
                              <SelectItem value="manufacturing_officer">{t("Manufacturing Officer", "مسؤول التصنيع")}</SelectItem>
                              <SelectItem value="booking_officer">{t("Booking Officer", "مسؤول الحجوزات")}</SelectItem>
                              <SelectItem value="purchasing_officer">{t("Purchasing Officer", "مسؤول المشتريات")}</SelectItem>
                              <SelectItem value="hr_officer">{t("HR Officer", "مسؤول الموارد البشرية")}</SelectItem>
                              <SelectItem value="staff">{t("Staff", "موظف")}</SelectItem>
                              <SelectItem value="viewer">{t("Viewer", "عرض فقط")}</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="outline" size="sm" onClick={() => { setChangePassUserId(m.user_id); setNewMemberPass("") }} className="gap-1 h-8 text-xs">
                            <Lock className="w-3 h-3" />
                            {t("Password", "كلمة المرور")}
                          </Button>
                        </>
                      )}
                      {canManage && !m.is_current && m.role !== 'owner' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          onClick={() => {
                            setUserToDelete(m)
                            setDeleteConfirmOpen(true)
                          }}
                        >
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

        {/* 🔐 Enterprise ERP: Delete Confirmation Modal */}
        <Dialog open={deleteConfirmOpen} onOpenChange={(v) => { if (!v) { setDeleteConfirmOpen(false); setUserToDelete(null) } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <DialogTitle>{t("Confirm Member Deletion", "تأكيد حذف العضو")}</DialogTitle>
              </div>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <p className="text-gray-700 dark:text-gray-300">
                {t("Are you sure you want to remove", "هل أنت متأكد من رغبتك في إزالة")} <strong>{userToDelete?.email || userToDelete?.username || t('this member', 'هذا العضو')}</strong> {t("from the company?", "من الشركة؟")}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t("Linked data for this user will be checked before deletion.", "سيتم التحقق من وجود بيانات مرتبطة بهذا المستخدم قبل الحذف.")}
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setDeleteConfirmOpen(false); setUserToDelete(null) }} disabled={isDeleting}>
                {t("Cancel", "إلغاء")}
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!userToDelete) return
                  setIsDeleting(true)
                  try {
                    const res = await fetch("/api/member-delete", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ userId: userToDelete.user_id, companyId, fullDelete: true })
                    })
                    const js = await res.json()
                    if (res.ok && js?.ok) {
                      setMembers((prev) => prev.filter((x) => x.user_id !== userToDelete.user_id))
                      toastActionSuccess(toast, t("Delete", "حذف"), t("Member", "العضو"))
                      setDeleteConfirmOpen(false)
                      setUserToDelete(null)
                    } else if (res.status === 409 && js?.reason === "HAS_DEPENDENCIES") {
                      // Trigger Reassignment Modal
                      setDeleteConfirmOpen(false)
                      setUserToReassign(userToDelete)
                      setUserDependencies(js.dependencies)
                      setReassignTargetId("")
                      setReassignModalOpen(true)
                      setUserToDelete(null)
                    } else {
                      toastActionError(toast, t("Delete", "حذف"), t("Member", "العضو"), js?.error || js?.error_en || undefined)
                    }
                  } catch (e: any) {
                    toastActionError(toast, t("Delete", "حذف"), t("Member", "العضو"), e?.message)
                  } finally {
                    setIsDeleting(false)
                  }
                }}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("Deleting...", "جاري الحذف...")}
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    {t("Delete", "حذف")}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* موديال تغيير كلمة المرور */}
        <Dialog open={!!changePassUserId} onOpenChange={(v) => { if (!v) { setChangePassUserId(null); setNewMemberPass("") } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <Key className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <DialogTitle>{t("Change Member Password", "تغيير كلمة مرور العضو")}</DialogTitle>
              </div>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <Label className="text-gray-600 dark:text-gray-400">{t("New Password", "كلمة المرور الجديدة")}</Label>
              <Input type="password" value={newMemberPass} onChange={(e) => setNewMemberPass(e.target.value)} placeholder={t("Enter the new password", "أدخل كلمة المرور الجديدة")} className="bg-gray-50 dark:bg-slate-800" />
              <p className="text-xs text-gray-500">{t("Minimum 6 characters", "الحد الأدنى 6 أحرف")}</p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setChangePassUserId(null); setNewMemberPass("") }}>{t("Cancel", "إلغاء")}</Button>
              <Button className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500" onClick={async () => {
                const pw = (newMemberPass || '').trim()
                if (pw.length < 6) { toastActionError(toast, t("Update", "تحديث"), t("Password", "كلمة المرور"), t("Minimum 6 characters", "الحد الأدنى 6 أحرف")); return }
                try {
                  const res = await fetch("/api/member-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: changePassUserId, password: pw, companyId }) })
                  const js = await res.json()
                  if (res.ok && js?.ok) { toastActionSuccess(toast, t("Update", "تحديث"), t("Password", "كلمة المرور")); setChangePassUserId(null); setNewMemberPass("") } else { toastActionError(toast, t("Update", "تحديث"), t("Password", "كلمة المرور"), js?.error || undefined) }
                } catch (e: any) { toastActionError(toast, t("Update", "تحديث"), t("Password", "كلمة المرور"), e?.message) }
              }}>
                <Lock className="w-4 h-4" />
                {t("Save", "حفظ")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* موديال نقل بيانات وحذف الموظف (Reassignment) */}
        <Dialog open={reassignModalOpen} onOpenChange={(v) => { if (!v) { setReassignModalOpen(false); setUserToReassign(null); setUserDependencies(null); setReassignTargetId("") } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <DialogTitle>{t("Transfer Record Permissions and Data Ownership", "نقل صلاحيات السجلات وملكية البيانات")}</DialogTitle>
              </div>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md border border-amber-200 dark:border-amber-800">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                  {t(`The user (${userToReassign?.display_name || userToReassign?.username}) cannot be deleted directly because they have linked data:`, `لا يمكن حذف المستخدم (${userToReassign?.display_name || userToReassign?.username}) مباشرة لوجود بيانات مرتبطة به:`)}
                </p>
                <ul className="list-disc list-inside text-xs text-amber-700 dark:text-amber-400 space-y-1">
                  {userDependencies?.invoices > 0 && <li>{t("Sales invoices:", "فواتير مبيعات:")} {userDependencies.invoices}</li>}
                  {userDependencies?.sales_orders > 0 && <li>{t("Sales orders:", "أوامر بيع:")} {userDependencies.sales_orders}</li>}
                  {userDependencies?.purchase_orders > 0 && <li>{t("Purchase orders:", "أوامر شراء:")} {userDependencies.purchase_orders}</li>}
                  {userDependencies?.bills > 0 && <li>{t("Purchase bills:", "فواتير مشتريات:")} {userDependencies.bills}</li>}
                  {userDependencies?.customers > 0 && <li>{t("Customers:", "عملاء:")} {userDependencies.customers}</li>}
                  {userDependencies?.suppliers > 0 && <li>{t("Suppliers:", "موردين:")} {userDependencies.suppliers}</li>}
                  {userDependencies?.journal_entries > 0 && <li>{t("Journal entries:", "قيود يومية:")} {userDependencies.journal_entries}</li>}
                </ul>
                <p className="mt-2 text-xs font-bold text-amber-900 dark:text-amber-200">{t("Total:", "الإجمالي:")} {userDependencies?.total} {t("records", "سجل")}</p>
              </div>

              <div className="space-y-2">
                <Label>{t("Select the replacement employee to transfer ownership to", "اختر الموظف البديل لنقل الملكية إليه")}</Label>
                <Select value={reassignTargetId} onValueChange={setReassignTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("Select an employee (active members only)", "اختر موظفاً (مسموح بالنشطين فقط)")} />
                  </SelectTrigger>
                  <SelectContent>
                    {members.filter(m => m.user_id !== userToReassign?.user_id).map(m => (
                      <SelectItem key={m.user_id} value={m.user_id}>{m.display_name || m.username || m.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1 pb-1">{t("All records will be transferred to the employee selected above; no data will be lost.", "سيتم نقل كافة السجلات باسم الموظف المختار أعلاه، ولن يفقد النظام أي بيانات.")}</p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setReassignModalOpen(false)}>{t("Cancel", "إلغاء")}</Button>
              <Button className="gap-2 bg-red-600 hover:bg-red-700 text-white" disabled={!reassignTargetId || isReassigning} onClick={async () => {
                setIsReassigning(true)
                try {
                  const res = await fetch("/api/member-delete", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      userId: userToReassign?.user_id,
                      companyId,
                      fullDelete: true,
                      targetUserId: reassignTargetId
                    })
                  })
                  const js = await res.json()
                  if (res.ok && js?.ok) {
                    setMembers((prev) => prev.filter((x) => x.user_id !== userToReassign?.user_id))
                    toastActionSuccess(toast, t("Transfer data & delete", "نقل داتا وحذف"), t("old user", "المستخدم القديم"))
                    setReassignModalOpen(false)
                  } else {
                    toastActionError(toast, t("Transfer & delete", "نقل وحذف"), t("Member", "العضو"), js?.error || undefined)
                  }
                } catch (e: any) {
                  toastActionError(toast, t("Transfer & delete", "نقل وحذف"), t("Member", "العضو"), e?.message)
                } finally {
                  setIsReassigning(false)
                }
              }}>
                {isReassigning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : t("Transfer Data and Delete Permanently", "نقل البيانات والحذف نهائياً")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 🔗 موديال ربط العضو بالموظف */}
        <Dialog open={showLinkEmployeeDialog} onOpenChange={(v) => { if (!v) setShowLinkEmployeeDialog(false) }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <UserCog className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <DialogTitle>{t("Link Member to Employee", "ربط العضو بموظف")}</DialogTitle>
                  <DialogDescription>
                    {linkingMember?.display_name || linkingMember?.email}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>{t("Select the employee from the employee records", "اختر الموظف من سجل الموظفين")}</Label>
                <p className="text-xs text-gray-500 mt-1">{t("When linked, the member's name will be updated across the system (sidebar, audit log, etc.)", "عند الربط سيتم تحديث اسم العضو في جميع أنحاء النظام (القائمة الجانبية، سجل المراجعة، إلخ)")}</p>
              </div>
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("Select an employee...", "اختر موظفاً...")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("— No link —", "— بدون ربط —")}</SelectItem>
                  {employeesList.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name}{emp.job_title ? ` — ${emp.job_title}` : ""}{emp.department ? ` (${emp.department})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {linkingMember?.employee_id && (
                <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-xs">
                  <Check className="w-3 h-3 text-purple-600" />
                  <span>{t("Currently linked to:", "مرتبط حالياً بـ:")} <strong>{linkingMember.employee_name}</strong></span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowLinkEmployeeDialog(false)} disabled={linkingEmployee}>
                {t("Cancel", "إلغاء")}
              </Button>
              <Button
                onClick={() => {
                  // Handle __none__ synchronously before calling save
                  if (selectedEmployeeId === "__none__") {
                    setSelectedEmployeeId("")
                  }
                  // Pass the resolved value directly
                  const resolvedId = selectedEmployeeId === "__none__" ? "" : selectedEmployeeId
                  setLinkingEmployee(true)
                  fetch("/api/company-members/link-employee", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      memberUserId: linkingMember?.user_id,
                      employeeId: resolvedId || null,
                    }),
                  })
                    .then(res => res.json().then(result => ({ res, result })))
                    .then(({ res, result }) => {
                      if (!res.ok) throw new Error(result.error || t("Failed to link member to employee", "فشل ربط العضو بالموظف"))
                      const emp = employeesList.find(e => e.id === resolvedId)
                      setMembers(prev => prev.map(m =>
                        m.user_id === linkingMember?.user_id
                          ? { ...m, employee_id: resolvedId || undefined, employee_name: emp?.full_name, display_name: emp?.full_name || m.display_name }
                          : m
                      ))
                      toastActionSuccess(toast, t("Link", "ربط"), resolvedId ? t("Member to employee", "العضو بالموظف") : t("Unlink", "إلغاء الربط"))
                      setShowLinkEmployeeDialog(false)
                      // Notify sidebar to refresh display_name only
                      window.dispatchEvent(new Event('profile_updated'))
                    })
                    .catch((err: any) => toastActionError(toast, t("Link", "ربط"), t("Member to employee", "العضو بالموظف"), err.message))
                    .finally(() => setLinkingEmployee(false))
                }}
                disabled={linkingEmployee}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {linkingEmployee ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                {selectedEmployeeId && selectedEmployeeId !== "__none__" ? t("Link and Update Name", "ربط وتحديث الاسم") : t("Unlink", "إلغاء الربط")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* 🏢 موديال إدارة فروع الموظف */}
        <Dialog open={showMemberBranchDialog} onOpenChange={(v) => { if (!v) setShowMemberBranchDialog(false) }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                  <GitBranch className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <DialogTitle>{t("Manage Employee Branches", "إدارة فروع الموظف")}</DialogTitle>
                  <p className="text-sm text-gray-500 mt-1">{editingMemberName}</p>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {t("Employee's branch", "الفرع التابع له الموظف")}
                  {editingMemberRole !== 'booking_officer' && <span className="text-red-500">*</span>}
                </Label>
                <p className="text-xs text-gray-500">
                  {editingMemberRole === 'booking_officer'
                    ? t('A booking officer can be linked to a branch or serve the whole company (no branch).', 'مسؤول الحجز ممكن يكون مرتبط بفرع أو يخدم الشركة كلها (بدون فرع).')
                    : t('Select the single branch this employee belongs to (required)', 'اختر الفرع الواحد الذي ينتمي إليه الموظف (إلزامي)')}
                </p>
                <Select
                  value={memberBranchId}
                  onValueChange={(value) => setMemberBranchId(value)}
                >
                  <SelectTrigger className="w-full bg-white dark:bg-slate-800">
                    <SelectValue placeholder={t("Select a branch", "اختر الفرع")} />
                  </SelectTrigger>
                  <SelectContent>
                    {/* v3.74.329 — "بدون فرع" option, only for booking_officer */}
                    {editingMemberRole === 'booking_officer' && (
                      <SelectItem value="__NONE__">
                        <div className="flex items-center gap-2">
                          <span>{t("No branch assignment", "عدم الربط بفرع")}</span>
                          <Badge className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                            {t("All branches", "كل الفروع")}
                          </Badge>
                        </div>
                      </SelectItem>
                    )}
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        <div className="flex items-center gap-2">
                          <span>{branch.name}</span>
                          {branch.is_main && (
                            <Badge className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                              {t("Main", "رئيسي")}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {memberBranchId === "__NONE__" ? (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    <strong>{t("Selected branch:", "الفرع المحدد:")}</strong> {t("Booking officer with no branch — can receive and handle customers from all branches.", "مسؤول حجز بدون فرع — يقدر يستقبل ويتعامل مع عملاء كل الفروع.")}
                  </p>
                </div>
              ) : memberBranchId ? (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
                    <strong>{t("Selected branch:", "الفرع المحدد:")}</strong> {branches.find(b => b.id === memberBranchId)?.name || t("Not specified", "غير محدد")}
                  </p>
                </div>
              ) : null}

              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <AlertCircle className="w-3 h-3 inline ml-1" />
                  <strong>{t("Mandatory architectural decision:", "قرار معماري إلزامي:")}</strong> {t("Every employee must belong to exactly one branch. This ensures data isolation between branches, correct permission logic, and stable realtime updates. Admins and owners can access all branches.", "كل موظف يجب أن ينتمي إلى فرع واحد فقط. هذا يضمن عزل البيانات بين الفروع، منطق الصلاحيات الصحيح، وRealtime مستقر. المدراء والمالكون يمكنهم الوصول لجميع الفروع.")}
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowMemberBranchDialog(false)}>{t("Cancel", "إلغاء")}</Button>
              <Button
                className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-500"
                onClick={saveMemberBranches}
                disabled={savingMemberBranches || !memberBranchId}
              >
                {savingMemberBranches ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {t("Save Branch", "حفظ الفرع")}
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
                    <CardTitle className="text-base">{t("Email Invitations", "دعوات عبر البريد")}</CardTitle>
                    <p className="text-xs text-gray-500 mt-1">{t("Send invitations to join the company", "إرسال دعوات للانضمام للشركة")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {invites.length > 0 && (
                    <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-700 border-amber-200">
                      <Mail className="w-3 h-3" />
                      {invites.length} {t("pending invitation(s)", "دعوة معلقة")}
                    </Badge>
                  )}
                  <Link href="/settings/billing">
                    <Button variant="outline" size="sm" className="gap-1.5 text-violet-600 border-violet-200 hover:bg-violet-50 dark:text-violet-400 dark:border-violet-800 dark:hover:bg-violet-900/20">
                      <CreditCard className="w-3.5 h-3.5" />
                      {t("Manage Subscription", "إدارة الاشتراك")}
                    </Button>
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              {/* ✅ Seat Status Banner */}
              {companyId && (
                <SeatStatusBanner
                  companyId={companyId}
                  onAddSeat={() => { window.location.href = "/settings/billing" }}
                  className="mb-2"
                />
              )}
              {actionError && (
                <div className="flex flex-col gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{actionError}</span>
                  </div>
                  {actionError.includes("مقاعد") && (
                    <a href="/settings/billing" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 text-xs font-semibold rounded-lg transition-colors border border-red-300 w-fit">
                      <CreditCard className="w-3.5 h-3.5" />
                      {t("Add a monthly seat", "إضافة مقعد شهري")}
                    </a>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    {t("Target Company", "الشركة الهدف")}
                  </Label>
                  <Select value={inviteCompanyId || companyId || 'none'} onValueChange={(v) => setInviteCompanyId(v)} disabled={(myCompanies || []).length <= 1}>
                    <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(myCompanies || []).length === 0 ? (
                        <SelectItem value={companyId || 'none'}>{companyName || t("Not specified", "غير محدد")}</SelectItem>
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
                    <UserCog className="w-4 h-4" />
                    {t("Employee Name", "اسم الموظف")} <span className="text-red-500">*</span>
                  </Label>
                  <Input placeholder={t("Full name", "الاسم الكامل")} value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="bg-gray-50 dark:bg-slate-800" />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    {t("Email Address", "البريد الإلكتروني")}
                  </Label>
                  <Input placeholder="example@domain.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="bg-gray-50 dark:bg-slate-800" />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    {t("Role", "الدور")}
                  </Label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v)}>
                    <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{t("Admin", "مدير عام")}</SelectItem>
                      <SelectItem value="manager">{t("Manager", "مدير")}</SelectItem>
                      <SelectItem value="accountant">{t("Accountant", "محاسب")}</SelectItem>
                      <SelectItem value="store_manager">{t("Store Manager", "مسؤول مخزن")}</SelectItem>
                      <SelectItem value="manufacturing_officer">{t("Manufacturing Officer", "مسؤول التصنيع")}</SelectItem>
                      <SelectItem value="booking_officer">{t("Booking Officer", "مسؤول الحجوزات")}</SelectItem>
                      <SelectItem value="purchasing_officer">{t("Purchasing Officer", "مسؤول المشتريات")}</SelectItem>
                      <SelectItem value="hr_officer">{t("HR Officer", "مسؤول الموارد البشرية")}</SelectItem>
                      <SelectItem value="staff">{t("Staff", "موظف")}</SelectItem>
                      <SelectItem value="viewer">{t("Viewer", "عرض فقط")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* اختيار الفرع ومركز التكلفة والمخزن */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mt-4">
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    {t("Branch", "الفرع")} <span className="text-red-500">*</span>
                  </Label>
                  <Select value={inviteBranchId || "none"} onValueChange={(v) => {
                    const newBranchId = v === "none" ? "" : v
                    setInviteBranchId(newBranchId)
                    // إعادة تعيين مركز التكلفة والمخزن عند تغيير الفرع
                    if (newBranchId) {
                      const firstCC = costCenters.find(cc => cc.branch_id === newBranchId)
                      setInviteCostCenterId(firstCC?.id || "")
                      const firstWH = warehouses.find(w => w.branch_id === newBranchId)
                      setInviteWarehouseId(firstWH?.id || "")
                    } else {
                      setInviteCostCenterId("")
                      setInviteWarehouseId("")
                    }
                  }}>
                    <SelectTrigger className={`bg-gray-50 dark:bg-slate-800 ${!inviteBranchId ? 'border-red-300' : ''}`}>
                      <SelectValue placeholder={t("Select a branch", "اختر الفرع")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("Select a branch...", "اختر الفرع...")}</SelectItem>
                      {branches.map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} {b.is_main && t('(Main)', '(رئيسي)')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    {t("Cost Center", "مركز التكلفة")}
                  </Label>
                  <Select
                    value={inviteCostCenterId || "none"}
                    onValueChange={(v) => setInviteCostCenterId(v === "none" ? "" : v)}
                    disabled={!inviteBranchId}
                  >
                    <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                      <SelectValue placeholder={t("Select a cost center", "اختر مركز التكلفة")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("Not specified", "بدون تحديد")}</SelectItem>
                      {costCenters.filter(cc => cc.branch_id === inviteBranchId).map(cc => (
                        <SelectItem key={cc.id} value={cc.id}>
                          {cc.cost_center_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Warehouse className="w-4 h-4" />
                    {t("Warehouse", "المخزن")}
                  </Label>
                  <Select
                    value={inviteWarehouseId || "none"}
                    onValueChange={(v) => setInviteWarehouseId(v === "none" ? "" : v)}
                    disabled={!inviteBranchId}
                  >
                    <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                      <SelectValue placeholder={t("Select a warehouse", "اختر المخزن")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("Not specified", "بدون تحديد")}</SelectItem>
                      {warehouses.filter(w => w.branch_id === inviteBranchId).map(w => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name} {w.is_main && t('(Main)', '(رئيسي)')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Button onClick={createInvitation} disabled={loading || !inviteEmail.trim() || !inviteBranchId} className="w-full gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    {t("Create Invitation", "إنشاء دعوة")}
                  </Button>
                </div>
              </div>

              {/* الدعوات المعلقة */}
              {invites.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("Pending invitations:", "الدعوات المعلقة:")}</p>
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
                                {roleName(inv.role)}
                              </Badge>
                              <span className="text-xs text-gray-500">
                                {t("Expires:", "تنتهي:")} {new Date(inv.expires_at).toLocaleDateString('ar-EG')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* زر إعادة الإرسال */}
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-blue-600 hover:bg-blue-50 gap-1"
                            disabled={resendingInvite === inv.id}
                            onClick={async () => {
                              setResendingInvite(inv.id)
                              try {
                                const res = await fetch("/api/resend-invite", {
                                  method: "POST",
                                  headers: { "content-type": "application/json" },
                                  body: JSON.stringify({ inviteId: inv.id, email: inv.email }),
                                })
                                const data = await res.json()
                                if (res.ok && data.ok) {
                                  toastActionSuccess(toast, t("Resend", "إعادة إرسال"), t("Invitation", "الدعوة"))
                                } else {
                                  toastActionError(toast, t("Resend", "إعادة إرسال"), t("Invitation", "الدعوة"), data.error || t("Sending failed", "فشل الإرسال"))
                                }
                              } catch (err) {
                                toastActionError(toast, t("Resend", "إعادة إرسال"), t("Invitation", "الدعوة"), t("An error occurred", "حدث خطأ"))
                              } finally {
                                setResendingInvite(null)
                              }
                            }}
                          >
                            {resendingInvite === inv.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3" />
                            )}
                            {t("Resend", "إعادة إرسال")}
                          </Button>
                          {/* زر نسخ رابط الدعوة */}
                          {inv.accept_token && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-green-600 hover:bg-green-50 gap-1"
                              onClick={async () => {
                                const inviteLink = `${window.location.origin}/invitations/accept?token=${inv.accept_token}`
                                try {
                                  await navigator.clipboard.writeText(inviteLink)
                                  toastActionSuccess(toast, t("Copy", "نسخ"), t("Invitation link", "رابط الدعوة"))
                                } catch {
                                  // Fallback for older browsers
                                  const textArea = document.createElement("textarea")
                                  textArea.value = inviteLink
                                  document.body.appendChild(textArea)
                                  textArea.select()
                                  document.execCommand("copy")
                                  document.body.removeChild(textArea)
                                  toastActionSuccess(toast, t("Copy", "نسخ"), t("Invitation link", "رابط الدعوة"))
                                }
                              }}
                            >
                              <Copy className="w-3 h-3" />
                              {t("Copy Link", "نسخ الرابط")}
                            </Button>
                          )}
                          {/* زر الحذف */}
                          <Button variant="outline" size="sm" className="h-7 text-xs text-red-600 hover:bg-red-50" onClick={async () => {
                            const { error } = await supabase.from("company_invitations").delete().eq("id", inv.id)
                            if (!error) {
                              setInvites((prev) => prev.filter((x) => x.id !== inv.id))
                              toastActionSuccess(toast, t("Delete", "حذف"), t("Invitation", "الدعوة"))
                            }
                          }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-500 bg-gray-50 dark:bg-slate-800 p-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {t("Join links are managed automatically via email and the acceptance page. Invitations are valid for 7 days.", "روابط الانضمام تُدار تلقائيًا عبر البريد وصفحة القبول. صلاحية الدعوة 7 أيام.")}
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
                  <CardTitle className="text-base">{t("Role Permissions", "صلاحيات الأدوار")}</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">{t("Define each role's permissions over system resources", "تحديد صلاحيات كل دور على موارد النظام")}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              {/* v3.74.260 — الوحدات المُشتَرَك بها (owner-only; self-hides) */}
              <ModulesSubscriptionCard />
              <div className="border-t border-gray-100 dark:border-slate-800 my-2" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <UserCog className="w-4 h-4" />
                    {t("Role", "الدور")}
                  </Label>
                  <Select value={permRole} onValueChange={(v) => setPermRole(v)}>
                    <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          {t("Admin", "مدير عام")}
                        </div>
                      </SelectItem>
                      <SelectItem value="manager">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                          {t("Manager", "مدير")}
                        </div>
                      </SelectItem>
                      <SelectItem value="accountant">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500"></span>
                          {t("Accountant", "محاسب")}
                        </div>
                      </SelectItem>
                      <SelectItem value="store_manager">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                          {t("Store Manager", "مسؤول مخزن")}
                        </div>
                      </SelectItem>
                      <SelectItem value="manufacturing_officer">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                          {t("Manufacturing Officer", "مسؤول التصنيع")}
                        </div>
                      </SelectItem>
                      <SelectItem value="booking_officer">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                          {t("Booking Officer", "مسؤول الحجوزات")}
                        </div>
                      </SelectItem>
                      <SelectItem value="purchasing_officer">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                          {t("Purchasing Officer", "مسؤول المشتريات")}
                        </div>
                      </SelectItem>
                      <SelectItem value="hr_officer">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-pink-500"></span>
                          {t("HR Officer", "مسؤول الموارد البشرية")}
                        </div>
                      </SelectItem>
                      <SelectItem value="staff">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                          {t("Staff", "موظف")}
                        </div>
                      </SelectItem>
                      <SelectItem value="viewer">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                          {t("Viewer", "عرض فقط")}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {roleLabels[permRole] && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{appLang === 'en' ? roleLabels[permRole].descriptionEn : roleLabels[permRole].description}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    {t("Resource (Page)", "المورد (الصفحة)")}
                  </Label>
                  {defaultSidebarResourcesByRole[permRole] && defaultSidebarResourcesByRole[permRole].length > 0 && (
                    <div className="mb-2 p-3 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
                      <p className="text-[11px] text-gray-600 dark:text-gray-300 mb-1">
                        {t("Default sidebar pages for this role:", "الصفحات الافتراضية في القائمة الجانبية لهذا الدور:")}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {defaultSidebarResourcesByRole[permRole].map((res) => (
                          <Badge key={res} variant="outline" className="text-[10px] px-2 py-0.5">
                            {getResourceLabel(res)}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-2 text-[10px] text-gray-500 dark:text-gray-400">
                        {t("Higher roles can adjust these defaults per user when needed. This only affects which pages appear in the sidebar, not read, edit, or delete permissions.", "يمكن للأدوار العليا تعديل هذه الافتراضات لكل مستخدم عند الحاجة. هذا يؤثر فقط على عرض الصفحات في القائمة، وليس على صلاحيات القراءة أو التعديل أو الحذف.")}
                      </p>
                    </div>
                  )}
                  <Select value={permResource} onValueChange={(v) => { setPermResource(v); setResourceSearch("") }}>
                    <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                      <SelectValue placeholder={t("Select a resource...", "اختر المورد...")} />
                    </SelectTrigger>
                    <SelectContent className="max-h-96">
                      {/* حقل البحث */}
                      <div className="p-2 sticky top-0 bg-white dark:bg-slate-900 z-10 border-b border-gray-100 dark:border-slate-700">
                        <div className="relative">
                          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <Input
                            type="text"
                            value={resourceSearch}
                            onChange={(e) => setResourceSearch(e.target.value)}
                            placeholder={t("Search for a page...", "ابحث عن صفحة...")}
                            className="pr-9 h-9 text-sm bg-gray-50 dark:bg-slate-800"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          />
                          {resourceSearch && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setResourceSearch("") }}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* عرض الموارد مع التصفية */}
                      {Object.entries(resourceCategories).map(([key, category]) => {
                        const filteredResources = category.resources.filter(res =>
                          resourceSearch === "" ||
                          res.label.toLowerCase().includes(resourceSearch.toLowerCase()) ||
                          res.value.toLowerCase().includes(resourceSearch.toLowerCase())
                        )
                        if (filteredResources.length === 0) return null
                        return (
                          <div key={key}>
                            <div className="px-3 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-700 sticky top-[52px] z-[5] border-b border-gray-100 dark:border-slate-700">
                              {category.label}
                              <Badge variant="outline" className="mr-2 text-[10px] px-1.5 py-0">{filteredResources.length}</Badge>
                            </div>
                            {filteredResources.map((res) => (
                              <SelectItem key={res.value} value={res.value} className="pr-6 py-2.5 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${permResource === res.value ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                                  <span className="font-medium">{res.label}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </div>
                        )
                      })}

                      {/* رسالة عدم وجود نتائج */}
                      {resourceSearch && Object.values(resourceCategories).every(cat =>
                        cat.resources.every(res =>
                          !res.label.toLowerCase().includes(resourceSearch.toLowerCase()) &&
                          !res.value.toLowerCase().includes(resourceSearch.toLowerCase())
                        )
                      ) && (
                          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">{t(`No results for "${resourceSearch}"`, `لا توجد نتائج لـ "${resourceSearch}"`)}</p>
                          </div>
                        )}
                    </SelectContent>
                  </Select>
                  {/* عرض المورد المختار */}
                  {permResource && (
                    <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                      <Check className="w-4 h-4 text-blue-500" />
                      <span className="text-sm text-blue-700 dark:text-blue-400 font-medium">
                        {Object.values(resourceCategories).flatMap(cat => cat.resources).find(r => r.value === permResource)?.label || permResource}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {/* صلاحيات الوصول - محسنة */}
              <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("Access permissions:", "صلاحيات الوصول:")}</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setPermAccess(true); setPermRead(true); setPermWrite(true); setPermUpdate(true); setPermDelete(true); setPermFull(true) }}
                      className="text-xs h-7 px-2 gap-1"
                    >
                      <Check className="w-3 h-3" /> {t("Select all", "تحديد الكل")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setPermAccess(false); setPermRead(false); setPermWrite(false); setPermUpdate(false); setPermDelete(false); setPermFull(false) }}
                      className="text-xs h-7 px-2 gap-1"
                    >
                      <X className="w-3 h-3" /> {t("Clear all", "إلغاء الكل")}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {/* إظهار في القائمة */}
                  <div className="relative group">
                    <label className={`flex flex-col items-center gap-2 cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${permAccess ? 'bg-indigo-50 dark:bg-indigo-900/40 border-indigo-400 dark:border-indigo-500 shadow-md' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 hover:border-indigo-300'}`}>
                      <input type="checkbox" checked={permAccess} onChange={(e) => setPermAccess(e.target.checked)} className="sr-only" />
                      <div className={`p-2 rounded-lg ${permAccess ? 'bg-indigo-100 dark:bg-indigo-800' : 'bg-gray-100 dark:bg-slate-600'}`}>
                        <Eye className={`w-5 h-5 ${permAccess ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                      </div>
                      <span className={`text-sm font-semibold ${permAccess ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-500'}`}>{t("Show", "إظهار")}</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center">{t("in the menu", "في القائمة")}</span>
                    </label>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap shadow-lg">
                      {t("Show the page in the sidebar", "عرض الصفحة في القائمة الجانبية")}
                    </div>
                  </div>

                  {/* قراءة */}
                  <div className="relative group">
                    <label className={`flex flex-col items-center gap-2 cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${permRead ? 'bg-blue-50 dark:bg-blue-900/40 border-blue-400 dark:border-blue-500 shadow-md' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 hover:border-blue-300'}`}>
                      <input type="checkbox" checked={permRead} onChange={(e) => setPermRead(e.target.checked)} className="sr-only" />
                      <div className={`p-2 rounded-lg ${permRead ? 'bg-blue-100 dark:bg-blue-800' : 'bg-gray-100 dark:bg-slate-600'}`}>
                        <Eye className={`w-5 h-5 ${permRead ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`} />
                      </div>
                      <span className={`text-sm font-semibold ${permRead ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500'}`}>{t("Read", "قراءة")}</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center">{t("View data", "عرض البيانات")}</span>
                    </label>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap shadow-lg">
                      {t("View and read data only", "عرض وقراءة البيانات فقط")}
                    </div>
                  </div>

                  {/* كتابة */}
                  <div className="relative group">
                    <label className={`flex flex-col items-center gap-2 cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${permWrite ? 'bg-green-50 dark:bg-green-900/40 border-green-400 dark:border-green-500 shadow-md' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 hover:border-green-300'}`}>
                      <input type="checkbox" checked={permWrite} onChange={(e) => setPermWrite(e.target.checked)} className="sr-only" />
                      <div className={`p-2 rounded-lg ${permWrite ? 'bg-green-100 dark:bg-green-800' : 'bg-gray-100 dark:bg-slate-600'}`}>
                        <UserPlus className={`w-5 h-5 ${permWrite ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`} />
                      </div>
                      <span className={`text-sm font-semibold ${permWrite ? 'text-green-700 dark:text-green-300' : 'text-gray-500'}`}>{t("Write", "كتابة")}</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center">{t("Create new", "إنشاء جديد")}</span>
                    </label>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap shadow-lg">
                      {t("Create new records and data", "إنشاء سجلات وبيانات جديدة")}
                    </div>
                  </div>

                  {/* تعديل */}
                  <div className="relative group">
                    <label className={`flex flex-col items-center gap-2 cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${permUpdate ? 'bg-amber-50 dark:bg-amber-900/40 border-amber-400 dark:border-amber-500 shadow-md' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 hover:border-amber-300'}`}>
                      <input type="checkbox" checked={permUpdate} onChange={(e) => setPermUpdate(e.target.checked)} className="sr-only" />
                      <div className={`p-2 rounded-lg ${permUpdate ? 'bg-amber-100 dark:bg-amber-800' : 'bg-gray-100 dark:bg-slate-600'}`}>
                        <Edit className={`w-5 h-5 ${permUpdate ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`} />
                      </div>
                      <span className={`text-sm font-semibold ${permUpdate ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500'}`}>{t("Edit", "تعديل")}</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center">{t("Update data", "تحديث البيانات")}</span>
                    </label>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap shadow-lg">
                      {t("Edit and update existing records", "تعديل وتحديث السجلات الموجودة")}
                    </div>
                  </div>

                  {/* حذف */}
                  <div className="relative group">
                    <label className={`flex flex-col items-center gap-2 cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${permDelete ? 'bg-red-50 dark:bg-red-900/40 border-red-400 dark:border-red-500 shadow-md' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 hover:border-red-300'}`}>
                      <input type="checkbox" checked={permDelete} onChange={(e) => setPermDelete(e.target.checked)} className="sr-only" />
                      <div className={`p-2 rounded-lg ${permDelete ? 'bg-red-100 dark:bg-red-800' : 'bg-gray-100 dark:bg-slate-600'}`}>
                        <Trash2 className={`w-5 h-5 ${permDelete ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`} />
                      </div>
                      <span className={`text-sm font-semibold ${permDelete ? 'text-red-700 dark:text-red-300' : 'text-gray-500'}`}>{t("Delete", "حذف")}</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center">{t("Remove data", "إزالة البيانات")}</span>
                    </label>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap shadow-lg">
                      {t("⚠️ Permanently delete records - a sensitive permission", "⚠️ حذف السجلات نهائياً - صلاحية حساسة")}
                    </div>
                  </div>

                  {/* تحكم كامل */}
                  <div className="relative group">
                    <label className={`flex flex-col items-center gap-2 cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${permFull ? 'bg-purple-50 dark:bg-purple-900/40 border-purple-400 dark:border-purple-500 shadow-md ring-2 ring-purple-300 dark:ring-purple-600' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 hover:border-purple-300'}`}>
                      <input
                        type="checkbox"
                        checked={permFull}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setPermFull(checked)
                          if (checked) {
                            setPermAccess(true)
                            setPermRead(true)
                            setPermWrite(true)
                            setPermUpdate(true)
                            setPermDelete(true)
                          }
                        }}
                        className="sr-only"
                      />
                      <div className={`p-2 rounded-lg ${permFull ? 'bg-purple-100 dark:bg-purple-800' : 'bg-gray-100 dark:bg-slate-600'}`}>
                        <Shield className={`w-5 h-5 ${permFull ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400'}`} />
                      </div>
                      <span className={`text-sm font-semibold ${permFull ? 'text-purple-700 dark:text-purple-300' : 'text-gray-500'}`}>{t("Full control", "تحكم كامل")}</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center">{t("All permissions", "كل الصلاحيات")}</span>
                    </label>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap shadow-lg">
                      {t("All permissions + advanced actions", "جميع الصلاحيات + العمليات المتقدمة")}
                    </div>
                  </div>
                </div>

                {/* 🚀 Enterprise ERP: Action-Level Permissions */}
                {ADVANCED_ACTIONS_MAP[permResource] && ADVANCED_ACTIONS_MAP[permResource].length > 0 && (
                  <div className="mt-6 pt-4 border-t border-gray-100 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t("Advanced Actions (Action-Level Permissions):", "الإجراءات المتقدمة (Action-Level Permissions):")}</p>
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 gap-1">
                        <Lock className="w-3 h-3" />
                        {t("Fine-grained permissions", "صلاحيات دقيقة")}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ADVANCED_ACTIONS_MAP[permResource].map((action) => {
                        const isSelected = permAllowedActions.includes(action.value) || permFull;
                        return (
                          <label key={action.value} className={`flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition-all duration-200 ${isSelected ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-900/40 dark:border-indigo-700 dark:text-indigo-300 shadow-sm' : 'bg-white border-gray-200 text-gray-600 dark:bg-slate-700 dark:border-slate-600 hover:border-indigo-300'}`}>
                            <Checkbox
                              checked={isSelected}
                              disabled={permFull}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setPermAllowedActions(prev => [...prev, action.value])
                                } else {
                                  setPermAllowedActions(prev => prev.filter(v => v !== action.value))
                                }
                              }}
                              className={isSelected ? "border-indigo-500 text-indigo-600" : ""}
                            />
                            <span className="text-sm font-medium">{appLang === 'en' ? action.labelEn : action.label}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* شريط معلومات */}
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  <div className="text-xs text-blue-700 dark:text-blue-400">
                    <span className="font-medium">{t('💡 Notes:', '💡 ملاحظات:')}</span>
                    <span className="mr-2">{t('Unchecking "Show" hides the page from the menu.', 'إلغاء "إظهار" يخفي الصفحة من القائمة.')}</span>
                    <span>{t('"Full control" enables all permissions automatically.', '"تحكم كامل" يفعّل جميع الصلاحيات تلقائياً.')}</span>
                  </div>
                </div>
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
                      can_access: permAccess,
                      allowed_actions: permFull ? ["*"] : permAllowedActions.map(action => `${permResource}:${action}`)
                    }, { onConflict: "company_id,role,resource" })
                  if (error) { setActionError(error.message || t("Save failed", "تعذر الحفظ")); return }
                  const { data: perms } = await supabase
                    .from("company_role_permissions")
                    .select("id,role,resource,can_read,can_write,can_update,can_delete,all_access,can_access,allowed_actions")
                    .eq("company_id", companyId)
                    .eq("role", permRole)
                  setRolePerms(perms || [])
                  setActionError(null)
                  toastActionSuccess(toast, t("Save", "حفظ"), t("Permissions", "الصلاحيات"))

                  // ✅ تحديث الصلاحيات فقط إذا كنا نحفظ صلاحيات للمستخدم الحالي
                  // إذا كنا نحفظ صلاحيات لدور آخر، لا نحدث الصلاحيات (لأنها لا تتأثر)
                  if (permRole === currentRole) {
                    // نحفظ صلاحيات لدور المستخدم الحالي - نحدث الصلاحيات
                    setTimeout(async () => {
                      try {
                        // تحديث الصلاحيات مباشرة من hook
                        await refreshPermissions()
                        // إرسال حدث لتحديث الـ Sidebar (بعد التأكد من تحديث الصلاحيات)
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(new Event('permissions_updated'))
                        }
                      } catch (err) {
                        console.error('Error refreshing permissions:', err)
                      }
                    }, 500) // تأخير 500ms للتأكد من حفظ البيانات أولاً
                  } else {
                    // نحفظ صلاحيات لدور آخر - نحدث فقط الـ Sidebar بدون إعادة تحميل الصلاحيات
                    // هذا يمنع إعادة التوجيه غير الضرورية
                    if (typeof window !== 'undefined') {
                      // نرسل event منفصل للـ Sidebar فقط (بدون permissions_updated)
                      window.dispatchEvent(new Event('sidebar_refresh'))
                    }
                  }
                } finally {
                  setLoading(false)
                }
              }} disabled={loading} className="gap-2 bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                {t("Save Permissions", "حفظ الصلاحيات")}
              </Button>

              {/* عرض الصلاحيات المحفوظة - محسن */}
              <div className="space-y-4 mt-6">
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 dark:bg-purple-800 rounded-lg">
                      <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t("Saved Permissions", "الصلاحيات المحفوظة")}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t("For role:", "للدور:")} <Badge className={roleLabels[permRole]?.color || 'bg-gray-100'}>{roleName(permRole)}</Badge></p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {rolePerms.filter((p) => p.role === permRole).length} {t("permission(s)", "صلاحية")}
                  </Badge>
                </div>

                {rolePerms.filter((p) => p.role === permRole).length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {rolePerms.filter((p) => p.role === permRole).map((p) => {
                      const resourceLabel = Object.values(resourceCategories)
                        .flatMap(cat => cat.resources)
                        .find(r => r.value === p.resource)?.label || p.resource
                      const activeCount = [p.can_access !== false, p.can_read, p.can_write, p.can_update, p.can_delete].filter(Boolean).length
                      return (
                        <div key={p.id} className={`relative overflow-hidden rounded-xl border-2 transition-all duration-200 ${p.can_access === false ? 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 opacity-70' : p.all_access ? 'bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/30 dark:to-violet-900/30 border-purple-300 dark:border-purple-700' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600'}`}>
                          {/* شريط علوي ملون */}
                          <div className={`h-1 ${p.all_access ? 'bg-gradient-to-r from-purple-500 to-violet-500' : p.can_access === false ? 'bg-gray-300 dark:bg-gray-600' : 'bg-gradient-to-r from-blue-400 to-indigo-400'}`} />

                          <div className="p-4">
                            {/* اسم المورد */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                {p.can_access === false && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400 font-medium">{t("Hidden", "مخفي")}</span>
                                )}
                                {p.all_access && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-200 text-purple-700 dark:bg-purple-800 dark:text-purple-300 font-medium">{t("Full control", "تحكم كامل")}</span>
                                )}
                              </div>
                              <span className="text-[10px] text-gray-400">{activeCount}/5</span>
                            </div>

                            <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-3">{resourceLabel}</h4>

                            {/* Actions Mapping rendering */}
                            {p.allowed_actions && p.allowed_actions.length > 0 && !p.all_access && (
                              <div className="flex flex-wrap gap-1 mb-3">
                                {p.allowed_actions.map((act: string) => {
                                  if (act === "*") return null;
                                  const rawAction = act.includes(':') ? act.split(':')[1] : act;
                                  // Look up label
                                  let label = rawAction;
                                  if (ADVANCED_ACTIONS_MAP[p.resource]) {
                                    const matched = ADVANCED_ACTIONS_MAP[p.resource].find(a => a.value === rawAction);
                                    if (matched) label = appLang === 'en' ? matched.labelEn : matched.label;
                                  }
                                  return (
                                    <Badge key={act} variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                                      {label}
                                    </Badge>
                                  )
                                })}
                              </div>
                            )}

                            {/* أيقونات الصلاحيات */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${p.can_access !== false ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`} title={t("Show", "إظهار")}>
                                <Eye className="w-3 h-3" />
                                {p.can_access !== false ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              </div>
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${p.can_read ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`} title={t("Read", "قراءة")}>
                                <Eye className="w-3 h-3" />
                                {p.can_read ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              </div>
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${p.can_write ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`} title={t("Write", "كتابة")}>
                                <UserPlus className="w-3 h-3" />
                                {p.can_write ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              </div>
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${p.can_update ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`} title={t("Edit", "تعديل")}>
                                <Edit className="w-3 h-3" />
                                {p.can_update ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              </div>
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${p.can_delete ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`} title={t("Delete", "حذف")}>
                                <Trash2 className="w-3 h-3" />
                                {p.can_delete ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-900 rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-700">
                    <div className="p-4 bg-gray-100 dark:bg-slate-700 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                      <Shield className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                    </div>
                    <p className="text-base font-medium text-gray-600 dark:text-gray-400 mb-1">{t("No permissions defined", "لا توجد صلاحيات مُحددة")}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">{t('Select a resource, set the permissions, then click "Save Permissions"', 'اختر مورداً وحدد الصلاحيات ثم اضغط "حفظ الصلاحيات"')}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 🔐 إدارة نقل وفتح الصلاحيات بين الموظفين */}
        {canManage && (
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-orange-100 to-amber-100 dark:from-orange-900/30 dark:to-amber-900/30 rounded-lg">
                    <ArrowRightLeft className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{t("Transfer & Share Permissions", "نقل وفتح الصلاحيات")}</CardTitle>
                    <p className="text-xs text-gray-500 mt-1">{t("Transfer data ownership or share access between employees", "نقل ملكية البيانات أو مشاركة الوصول بين الموظفين")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* v3.72.0 — Vacation Cover one-click */}
                  <Button
                    onClick={() => setShowVacationDialog(true)}
                    variant="outline"
                    className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/20"
                  >
                    <Calendar className="w-4 h-4" />
                    {t("Vacation Cover", "تَفويض إجازة")}
                  </Button>
                  <Button
                    onClick={() => { setShowPermissionDialog(true); setPermissionAction('share') }}
                    className="gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                  >
                    <Share2 className="w-4 h-4" />
                    {t("Manage Permissions", "إدارة الصلاحيات")}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              <Tabs defaultValue="sharing" className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-4">
                  <TabsTrigger value="sharing" className="gap-2">
                    <Share2 className="w-4 h-4" />
                    {t("Shares", "المشاركات")}
                  </TabsTrigger>
                  <TabsTrigger value="shared_with_me" className="gap-2">
                    <Eye className="w-4 h-4" />
                    {t("Shared with Me", "مُشارَك مَعى")}
                  </TabsTrigger>
                  <TabsTrigger value="transfers" className="gap-2">
                    <ArrowRightLeft className="w-4 h-4" />
                    {t("Transfers", "النقل")}
                  </TabsTrigger>
                  <TabsTrigger value="branches" className="gap-2">
                    <GitBranch className="w-4 h-4" />
                    {t("Branches", "الفروع")}
                  </TabsTrigger>
                </TabsList>

                {/* الصلاحيات المشتركة — v3.74.1 with role labels, expiry, archive */}
                <TabsContent value="sharing">
                  {/* Archive toggle */}
                  {archivedSharing.length > 0 && (
                    <div className="flex items-center justify-end mb-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSharingArchive(!showSharingArchive)}
                        className="text-xs gap-1.5"
                      >
                        {showSharingArchive ? <Eye className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                        {showSharingArchive
                          ? t(`Hide archived`, `إخفاء المُؤرشَفة`)
                          : t(`Show archived (${archivedSharing.length})`, `إظهار المُؤرشَفة (${archivedSharing.length})`)}
                      </Button>
                    </div>
                  )}

                  {(() => {
                    const rows: any[] = [
                      ...permissionSharing,
                      ...(showSharingArchive ? archivedSharing : []),
                    ]
                    if (rows.length === 0) {
                      return (
                        <div className="text-center py-8 text-gray-400">
                          <Share2 className="w-10 h-10 mx-auto mb-3 opacity-50" />
                          <p className="text-sm">{t("No shared permissions currently", "لا توجد صلاحيات مشتركة حالياً")}</p>
                        </div>
                      )
                    }
                    return (
                      <div className="space-y-2">
                        {rows.map((ps: any) => {
                          const grantor = members.find(m => m.user_id === ps.grantor_user_id)
                          const grantee = members.find(m => m.user_id === ps.grantee_user_id)
                          const grantorRoleAr = grantor?.role ? roleName(grantor.role) : ''
                          const granteeRoleAr = grantee?.role ? roleName(grantee.role) : ''
                          const isInactive = ps.is_active === false
                          const isExpired = ps.expires_at && new Date(ps.expires_at) < new Date()
                          const expiryLabel = ps.expires_at
                            ? `${t("Expires", "ينتهى")} ${new Date(ps.expires_at).toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                            : t('Permanent', 'دائم')
                          const cardCls = isInactive
                            ? 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 opacity-70'
                            : isExpired
                              ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                              : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          const isVacation = (ps.notes || '').includes('[تَفويض إجازة]')
                          return (
                            <div key={ps.id} className={`p-3 rounded-lg border ${cardCls}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                  {isVacation ? <Calendar className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" /> : <Share2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />}
                                  <div className="min-w-0 flex-1">
                                    {/* Names + roles */}
                                    <p className="text-sm font-medium">
                                      <span className="text-gray-700 dark:text-gray-300">{grantor?.display_name || grantor?.email || t('Employee', 'موظف')}</span>
                                      {grantorRoleAr && <span className="text-[10px] text-gray-500 mx-1">({grantorRoleAr})</span>}
                                      <span className="mx-2 text-gray-400">←</span>
                                      <span className={isInactive ? 'text-gray-600' : 'text-green-700 dark:text-green-400'}>{grantee?.display_name || grantee?.email || t('Employee', 'موظف')}</span>
                                      {granteeRoleAr && <span className="text-[10px] text-gray-500 mx-1">({granteeRoleAr})</span>}
                                    </p>
                                    {/* Badges */}
                                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                      <Badge variant="outline" className="text-[10px]">
                                        {ps.resource_type === 'all' ? t('All', 'الكل') :
                                          ps.resource_type === 'customers' ? t('Customers', 'العملاء') :
                                          ps.resource_type === 'estimates' ? t('Estimates', 'عروض الأسعار') :
                                          ps.resource_type === 'sales_orders' ? t('Sales Orders', 'أوامر البيع') :
                                          ps.resource_type === 'bookings' ? t('Bookings', 'الحجوزات') :
                                          ps.resource_type}
                                      </Badge>
                                      {ps.can_edit && !isInactive && <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{t("Edit", "تعديل")}</Badge>}
                                      {ps.can_delete && !isInactive && <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{t("Delete", "حذف")}</Badge>}
                                      {isInactive ? (
                                        <Badge className="text-[10px] bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300">{t("Archived", "مُؤرشَف")}</Badge>
                                      ) : isExpired ? (
                                        <Badge className="text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">{t("Expired", "انتَهى")}</Badge>
                                      ) : (
                                        <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{t("Active", "نَشِط")}</Badge>
                                      )}
                                      <Badge className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400">
                                        🗓 {expiryLabel}
                                      </Badge>
                                      {isVacation && (
                                        <Badge className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/20 dark:text-purple-400">
                                          {t("🌴 Vacation cover", "🌴 تَفويض إجازة")}
                                        </Badge>
                                      )}
                                    </div>
                                    {/* Notes — esp. useful in archive to see why it was deactivated */}
                                    {ps.notes && (
                                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 italic line-clamp-2">{ps.notes}</p>
                                    )}
                                    {/* Dates */}
                                    <p className="text-[10px] text-gray-400 mt-1">
                                      {t("Created", "أُنشئت")} {new Date(ps.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                                    </p>
                                  </div>
                                </div>
                                {!isInactive && (
                                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50 flex-shrink-0" onClick={async () => {
                                    if (!window.confirm(t('This share will be archived. You can review it later via the "Show archived" button. Confirm?', 'سَيتم أرشَفة هذه المُشاركة. يُمكن مُراجعتها لاحقاً من زر "إظهار المُؤرشَفة". تَأكيد؟'))) return
                                    await supabase.from("permission_sharing").update({ is_active: false }).eq("id", ps.id)
                                    loadPermissionData()
                                  }}>
                                    <X className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </TabsContent>

                {/* v3.71.0 — مُشارَك مَعى — v3.74.1 with roles + expiry + archive */}
                <TabsContent value="shared_with_me">
                  {archivedSharedWithMe.length > 0 && (
                    <div className="flex items-center justify-end mb-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSharedWithMeArchive(!showSharedWithMeArchive)}
                        className="text-xs gap-1.5"
                      >
                        {showSharedWithMeArchive ? <Eye className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                        {showSharedWithMeArchive
                          ? t(`Hide archived`, `إخفاء المُؤرشَفة`)
                          : t(`Show archived (${archivedSharedWithMe.length})`, `إظهار المُؤرشَفة (${archivedSharedWithMe.length})`)}
                      </Button>
                    </div>
                  )}

                  {(() => {
                    const rows: any[] = [
                      ...sharedWithMe,
                      ...(showSharedWithMeArchive ? archivedSharedWithMe : []),
                    ]
                    if (rows.length === 0) {
                      return (
                        <div className="text-center py-8 text-gray-400">
                          <Eye className="w-10 h-10 mx-auto mb-3 opacity-50" />
                          <p className="text-sm">{t("No data is shared with me currently", "لا يوجد بَيانات مُشارَكة مَعى حالياً")}</p>
                          <p className="text-xs mt-2 text-gray-500">{t("When another employee shares their data with you, it will appear here.", "عند مُشاركة موظف آخر بَياناته معك، سيظهر هنا.")}</p>
                        </div>
                      )
                    }
                    return (
                      <div className="space-y-2">
                        {rows.map((sw: any) => {
                          const resourceLabel =
                            sw.resource_type === 'all' ? t('All (customers + estimates + orders + bookings)', 'الكل (عملاء + عروض + أوامر + حجوزات)') :
                            sw.resource_type === 'customers' ? t('Customers', 'العملاء') :
                            sw.resource_type === 'estimates' ? t('Estimates', 'عروض الأسعار') :
                            sw.resource_type === 'sales_orders' ? t('Sales Orders', 'أوامر البيع') :
                            sw.resource_type === 'bookings' ? t('Bookings', 'الحجوزات') :
                            sw.resource_type
                          const grantor = members.find(m => m.user_id === sw.grantor_user_id)
                          const grantorDisplay = grantor?.display_name || grantor?.email || sw.grantor_name || sw.grantor_email || t('Employee (unknown)', 'موظف (غير معروف)')
                          const grantorRoleAr = grantor?.role ? roleName(grantor.role) : ''
                          const isInactive = sw.is_active === false
                          const isExpired = sw.expires_at && new Date(sw.expires_at) < new Date()
                          const expiresLabel = sw.expires_at
                            ? `${t("Expires", "ينتهى")} ${new Date(sw.expires_at).toLocaleDateString('ar-EG', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                            : t('Permanent', 'دائم')
                          const isVacation = (sw.notes || '').includes('[تَفويض إجازة]')
                          const cardCls = isInactive
                            ? 'bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 opacity-70'
                            : isExpired
                              ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                              : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                          return (
                            <div key={sw.id} className={`p-3 rounded-lg border ${cardCls}`}>
                              <div className="flex items-start gap-3">
                                {isVacation ? <Calendar className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" /> : <Eye className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />}
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium">
                                    <span className="text-gray-600 dark:text-gray-400">{t("From:", "من:")}</span>{' '}
                                    <span className={isInactive ? 'text-gray-600' : 'text-blue-700 dark:text-blue-400 font-semibold'}>{grantorDisplay}</span>
                                    {grantorRoleAr && <span className="text-[10px] text-gray-500 mx-1">({grantorRoleAr})</span>}
                                  </p>
                                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                    <Badge variant="outline" className="text-[10px]">{resourceLabel}</Badge>
                                    {sw.can_edit && !isInactive && <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{t("Edit", "تعديل")}</Badge>}
                                    {sw.can_delete && !isInactive && <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{t("Delete", "حذف")}</Badge>}
                                    {isInactive ? (
                                      <Badge className="text-[10px] bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300">{t("Archived", "مُؤرشَف")}</Badge>
                                    ) : isExpired ? (
                                      <Badge className="text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">{t("Expired", "انتَهى")}</Badge>
                                    ) : (
                                      <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{t("Active", "نَشِط")}</Badge>
                                    )}
                                    <Badge className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400">
                                      🗓 {expiresLabel}
                                    </Badge>
                                    {isVacation && (
                                      <Badge className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-900/20 dark:text-purple-400">
                                        {t("🌴 Vacation cover", "🌴 تَفويض إجازة")}
                                      </Badge>
                                    )}
                                  </div>
                                  {sw.notes && (
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 italic line-clamp-2">{sw.notes}</p>
                                  )}
                                  <p className="text-[10px] text-gray-400 mt-1">
                                    {t("Created", "أُنشئت")} {new Date(sw.created_at).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </TabsContent>

                {/* سجل النقل — v3.73.0 with two-eye approval workflow */}
                <TabsContent value="transfers">
                  {permissionTransfers.length > 0 ? (
                    <div className="space-y-2">
                      {permissionTransfers.map((pt: any) => {
                        const fromUser = members.find(m => m.user_id === pt.from_user_id)
                        const toUser = members.find(m => m.user_id === pt.to_user_id)
                        const isPending = pt.status === 'pending'
                        const isInitiator = pt.transferred_by === currentUserId
                        // v3.74.67 — single-owner exemption: if I'm the only senior
                        // in the company, allow self-approve/reject (backend enforces too).
                        const seniorCount = members.filter(m =>
                          ['owner','admin','general_manager'].includes(String(m.role || ''))
                        ).length
                        const isSoloSenior = isInitiator && seniorCount === 1 &&
                          ['owner','admin','general_manager'].includes(String(currentRole || ''))
                        const canActOnRequest = isPending && canManage && (!isInitiator || isSoloSenior)
                        const resourceLabel =
                          pt.resource_type === 'all' ? t('All', 'الكل') :
                          pt.resource_type === 'customers' ? t('Customers', 'العملاء') :
                          pt.resource_type === 'sales_orders' ? t('Sales Orders', 'أوامر البيع') :
                          pt.resource_type === 'estimates' ? t('Estimates', 'عروض الأسعار') :
                          pt.resource_type === 'bookings' ? t('Bookings', 'الحجوزات') :
                          pt.resource_type
                        const statusBadge =
                          pt.status === 'completed' ? { cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', label: t('✓ Completed', '✓ مُنفَّذ') } :
                          pt.status === 'pending'   ? { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label: t('⏳ Awaiting approval', '⏳ بانتظار اعتماد') } :
                          pt.status === 'approved'  ? { cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', label: t('✓ Approved', '✓ مُعتَمَد') } :
                          pt.status === 'rejected'  ? { cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', label: t('✕ Rejected', '✕ مَرفوض') } :
                          pt.status === 'failed'    ? { cls: 'bg-red-100 text-red-700', label: t('⚠ Failed', '⚠ فَشل') } :
                                                       { cls: 'bg-gray-100 text-gray-700', label: pt.status }
                        return (
                          <div key={pt.id} className={`p-3 rounded-lg border ${isPending ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <ArrowRightLeft className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium truncate">
                                    <span className="text-gray-700 dark:text-gray-300">{fromUser?.display_name || fromUser?.email || t('Employee', 'موظف')}</span>
                                    <span className="mx-2 text-blue-500">→</span>
                                    <span className="text-blue-700 dark:text-blue-400">{toUser?.display_name || toUser?.email || t('Employee', 'موظف')}</span>
                                  </p>
                                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <Badge variant="outline" className="text-[10px]">{resourceLabel}</Badge>
                                    {pt.status === 'completed' && (
                                      <Badge className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{pt.records_transferred} {t("records", "سجل")}</Badge>
                                    )}
                                    <span className="text-[10px] text-gray-500">{new Date(pt.transferred_at).toLocaleDateString('ar-EG')}</span>
                                  </div>
                                  {pt.status === 'rejected' && pt.rejected_reason && (
                                    <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{t("Rejection reason:", "سَبَب الرَّفض:")} {pt.rejected_reason}</p>
                                  )}
                                  {isPending && isInitiator && !isSoloSenior && (
                                    <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">{t("You requested this transfer yourself — it needs approval from another administrator.", "طَلَبت هذا النَّقل بنفسك — يَحتاج اعتماد مَسؤول آخر.")}</p>
                                  )}
                                  {isPending && isInitiator && isSoloSenior && (
                                    <p className="text-[11px] text-blue-700 dark:text-blue-400 mt-1">{t("You are the only owner — you can approve your own request (self-approval).", "أَنت المالك الوَحيد — يُمكِنك اعتماد طَلَبك بنَفسك (اعتماد ذاتى).")}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Badge className={`text-[10px] ${statusBadge.cls}`}>{statusBadge.label}</Badge>
                                {canActOnRequest && (
                                  <>
                                    {/* v3.73.2 — single Approve button opens a small Hybrid dialog */}
                                    <Button
                                      size="sm"
                                      variant="default"
                                      className="h-7 px-2 bg-green-600 hover:bg-green-700 text-white text-[11px] gap-1"
                                      onClick={async () => {
                                        // Fetch current scope counts vs snapshot before showing the chooser
                                        const { data: counts } = await supabase.rpc("get_transfer_scope_counts", { p_transfer_id: pt.id })
                                        const c = counts as any
                                        const snapTotal    = c?.snapshot_total    ?? 0
                                        const currentTotal = c?.current_total     ?? 0
                                        const hasDrift     = c?.has_drift         ?? false
                                        const prompt = hasDrift
                                          ? t(
                                              `Choose the scope:\n` +
                                              `———————————\n` +
                                              `OK = scope recorded at request time (${snapTotal} records)\n` +
                                              `Cancel = we will then ask you about the current scope (${currentTotal} records)`,
                                              `اختر النَطاق:\n` +
                                              `———————————\n` +
                                              `OK = نَطاق مُسَجَّل وقت الطَلَب (${snapTotal} سَجل)\n` +
                                              `Cancel = ثم سَنَسألك عن النَطاق الحالى (${currentTotal} سَجل)`
                                            )
                                          : t(
                                              `Approve transferring ${resourceLabel} from ${fromUser?.display_name || t('Employee', 'موظف')} to ${toUser?.display_name || t('Employee', 'موظف')}?\n(${snapTotal} records — no changes since the request)`,
                                              `اعتماد نَقل ${resourceLabel} من ${fromUser?.display_name || t('Employee', 'موظف')} إلى ${toUser?.display_name || t('Employee', 'موظف')}؟\n(${snapTotal} سَجل — لا يوجد تَغيير منذ الطَلَب)`
                                            )

                                        let mode: 'snapshot' | 'dynamic' = 'snapshot'
                                        if (hasDrift) {
                                          const useSnapshot = window.confirm(prompt)
                                          if (!useSnapshot) {
                                            const useDynamic = window.confirm(
                                              t(
                                                `Approving with the current scope = transferring all of ${fromUser?.display_name || t('the employee', 'الموظف')}'s current records (${currentTotal} records, including those created after the request).\n\nConfirm?`,
                                                `اعتماد بالنَطاق الحالى = نَقل كل سَجلات ${fromUser?.display_name || t('the employee', 'الموظف')} الحالية (${currentTotal} سَجل، بما فيها الجَديدة بعد الطَلَب).\n\nتَأكيد؟`
                                              )
                                            )
                                            if (!useDynamic) return
                                            mode = 'dynamic'
                                          }
                                        } else {
                                          const ok = window.confirm(prompt)
                                          if (!ok) return
                                          // No drift: snapshot == dynamic, doesn't matter which
                                        }

                                        try {
                                          const res = await fetch(`/api/permissions/transfer/${pt.id}/approve`, {
                                            method: 'POST',
                                            headers: { 'content-type': 'application/json' },
                                            body: JSON.stringify({ mode }),
                                          })
                                          const data = await res.json()
                                          if (res.ok && data.success) {
                                            toastActionSuccess(toast, t(`Transfer approved (${mode === 'snapshot' ? 'recorded' : 'current'})`, `اعتماد النَّقل (${mode === 'snapshot' ? 'مُسَجَّل' : 'حالى'})`), t(`${data.result?.records_transferred ?? 0} records`, `${data.result?.records_transferred ?? 0} سجل`))
                                            loadPermissionData()
                                          } else {
                                            toastActionError(toast, t('Approve', 'اعتماد'), t('Transfer', 'النَّقل'), data.error || t('Failed', 'فَشل'))
                                          }
                                        } catch (err: any) {
                                          toastActionError(toast, t('Approve', 'اعتماد'), t('Transfer', 'النَّقل'), err?.message || t('Error', 'خطأ'))
                                        }
                                      }}
                                    >
                                      <Check className="w-3 h-3" />
                                      {t("Approve", "اعتماد")}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 px-2 border-red-300 text-red-700 hover:bg-red-50 text-[11px] gap-1"
                                      onClick={async () => {
                                        const reason = window.prompt(t('Rejection reason (required):', 'سَبَب الرَّفض (مَطلوب):'))
                                        if (!reason || !reason.trim()) return
                                        try {
                                          const res = await fetch(`/api/permissions/transfer/${pt.id}/reject`, {
                                            method: 'POST',
                                            headers: { 'content-type': 'application/json' },
                                            body: JSON.stringify({ reason: reason.trim() }),
                                          })
                                          const data = await res.json()
                                          if (res.ok && data.success) {
                                            toastActionSuccess(toast, t('Reject transfer', 'رفض النَّقل'), t('Done', 'تم'))
                                            loadPermissionData()
                                          } else {
                                            toastActionError(toast, t('Reject', 'رفض'), t('Transfer', 'النَّقل'), data.error || t('Failed', 'فَشل'))
                                          }
                                        } catch (err: any) {
                                          toastActionError(toast, t('Reject', 'رفض'), t('Transfer', 'النَّقل'), err?.message || t('Error', 'خطأ'))
                                        }
                                      }}
                                    >
                                      <X className="w-3 h-3" />
                                      {t("Reject", "رفض")}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <ArrowRightLeft className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">{t("No previous transfers", "لا توجد عمليات نقل سابقة")}</p>
                    </div>
                  )}
                </TabsContent>

                {/* وصول الفروع */}
                <TabsContent value="branches">
                  {userBranchAccess.length > 0 ? (
                    <div className="space-y-2">
                      {userBranchAccess.map((uba) => {
                        const user = members.find(m => m.user_id === uba.user_id)
                        const branch = branches.find(b => b.id === uba.branch_id)
                        return (
                          <div key={uba.id} className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                            <div className="flex items-center gap-3">
                              <GitBranch className="w-4 h-4 text-purple-600" />
                              <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                  {user?.display_name || user?.email || t('Employee', 'موظف')}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-[10px]">{branch?.name || t('Branch', 'فرع')}</Badge>
                                  {uba.is_primary && <Badge className="text-[10px] bg-purple-100 text-purple-700">{t('Primary', 'رئيسي')}</Badge>}
                                  {uba.can_view_prices && <Badge className="text-[10px] bg-amber-100 text-amber-700">{t('Prices', 'أسعار')}</Badge>}
                                </div>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={async () => {
                              await supabase.from("user_branch_access").update({ is_active: false }).eq("id", uba.id)
                              loadPermissionData()
                            }}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">{t('No multi-branch access', 'لا يوجد وصول متعدد للفروع')}</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* موديال إدارة الصلاحيات */}
        {/* 🌴 v3.72.0 — Vacation Cover Dialog */}
        <Dialog open={showVacationDialog} onOpenChange={setShowVacationDialog}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
                <Calendar className="w-5 h-5" />
                تَفويض إجازة (Vacation Cover)
              </DialogTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                تَفويض بَيانات الموظف الغائب إلى البَديل لفَترة مَحدودة. تنتهى المُشاركة تلقائياً فى تاريخ الانتهاء.
              </p>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* الموظف الغائب */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  الموظف الذاهب فى إجازة
                </Label>
                <Select value={vacGrantorId} onValueChange={setVacGrantorId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الموظف" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map(m => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.display_name || m.email}
                        <span className="text-xs text-gray-400 mr-2">({roleLabels[m.role]?.ar || m.role})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* البَدائل */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4" />
                  الموظف(ون) البَدائل
                </Label>
                <div className="border border-gray-200 dark:border-slate-700 rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
                  {members
                    .filter(m => m.user_id !== vacGrantorId)
                    .map(m => {
                      const checked = vacGranteeIds.includes(m.user_id)
                      return (
                        <label key={m.user_id} className="flex items-center gap-2 p-2 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(c) => {
                              setVacGranteeIds(prev =>
                                c ? [...prev, m.user_id] : prev.filter(id => id !== m.user_id)
                              )
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{m.display_name || m.email}</p>
                            <p className="text-xs text-gray-500">{roleLabels[m.role]?.ar || m.role}</p>
                          </div>
                        </label>
                      )
                    })}
                  {members.filter(m => m.user_id !== vacGrantorId).length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-3">{t('No other employees', 'لا يوجد موظفون آخرون')}</p>
                  )}
                </div>
                {vacGranteeIds.length > 0 && (
                  <p className="text-xs text-blue-600 dark:text-blue-400">
                    تم اختيار {vacGranteeIds.length} بَديل
                  </p>
                )}
              </div>

              {/* تواريخ */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t('Start date', 'تاريخ البَدء')}</Label>
                  <Input
                    type="date"
                    value={vacStartDate}
                    onChange={(e) => setVacStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('End date', 'تاريخ الانتهاء')}</Label>
                  <Input
                    type="date"
                    value={vacEndDate}
                    min={vacStartDate}
                    onChange={(e) => setVacEndDate(e.target.value)}
                  />
                </div>
              </div>

              {/* نوع البَيانات — v3.73.1: smart filter on source user's record counts */}
              <div className="space-y-2">
                <Label className="flex items-center justify-between">
                  <span>{t('Delegated data type', 'نوع البَيانات المُفَوَّضة')}</span>
                  {sourceCountsLoading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                </Label>
                <Select value={vacResourceType} onValueChange={setVacResourceType} disabled={!vacGrantorId}>
                  <SelectTrigger>
                    <SelectValue placeholder={vacGrantorId ? "اختر النوع" : "اختر الموظف المصدر أولاً"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const c = sourceUserCounts
                      const total = c ? (c.customers + c.estimates + c.sales_orders + c.bookings) : 0
                      const allDisabled = !!c && total === 0
                      return (
                        <>
                          <SelectItem value="all" disabled={allDisabled}>
                            الكل {c ? `(${total} سجل)` : ''}
                          </SelectItem>
                          <SelectItem value="customers" disabled={!!c && c.customers === 0}>
                            العملاء {c ? `(${c.customers})` : ''}
                          </SelectItem>
                          <SelectItem value="estimates" disabled={!!c && c.estimates === 0}>
                            عروض الأسعار {c ? `(${c.estimates})` : ''}
                          </SelectItem>
                          <SelectItem value="sales_orders" disabled={!!c && c.sales_orders === 0}>
                            أوامر البيع {c ? `(${c.sales_orders})` : ''}
                          </SelectItem>
                          <SelectItem value="bookings" disabled={!!c && c.bookings === 0}>
                            الحجوزات {c ? `(${c.bookings})` : ''}
                          </SelectItem>
                        </>
                      )
                    })()}
                  </SelectContent>
                </Select>
                {sourceUserCounts &&
                 (sourceUserCounts.customers + sourceUserCounts.estimates + sourceUserCounts.sales_orders + sourceUserCounts.bookings) === 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                    ⚠ هذا الموظف لا يَمتلك أى سَجلات (عملاء/عروض/أوامر/حجوزات) قابلة للتَفويض.
                  </p>
                )}
              </div>

              {/* السَّبَب (اختيارى) */}
              <div className="space-y-2">
                <Label>{t('Reason or notes (optional)', 'السَّبَب أو مُلاحظات (اختيارى)')}</Label>
                <Input
                  type="text"
                  value={vacReason}
                  onChange={(e) => setVacReason(e.target.value)}
                  placeholder="مثال: إجازة سَنوية"
                  maxLength={200}
                />
              </div>

              {/* مُلَخّص */}
              {vacGrantorId && vacGranteeIds.length > 0 && vacEndDate && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
                  <p className="font-medium mb-1">📋 {t('Summary:', 'المُلَخّص:')}</p>
                  <p>{t('Data of', 'سَيتم تَفويض بَيانات')} <strong>{members.find(m => m.user_id === vacGrantorId)?.display_name || t('the absent employee', 'الموظف الغائب')}</strong> {t('will be delegated to', 'إلى')} <strong>{vacGranteeIds.length} {t('substitute(s)', 'بَديل')}</strong></p>
                  <p>{t('From', 'من')} <strong>{vacStartDate}</strong> {t('to', 'إلى')} <strong>{vacEndDate}</strong> — {t('ends automatically.', 'ستنتهى تلقائياً.')}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowVacationDialog(false)} disabled={vacLoading}>
                إلغاء
              </Button>
              <Button
                onClick={handleVacationCover}
                disabled={vacLoading || !vacGrantorId || vacGranteeIds.length === 0 || !vacEndDate}
                className="gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
              >
                {vacLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                تَأكيد التَفويض
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showPermissionDialog} onOpenChange={setShowPermissionDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  {permissionAction === 'transfer' ? <ArrowRightLeft className="w-5 h-5 text-orange-600" /> :
                    permissionAction === 'share' ? <Share2 className="w-5 h-5 text-green-600" /> :
                      <GitBranch className="w-5 h-5 text-purple-600" />}
                </div>
                <DialogTitle>
                  {permissionAction === 'transfer' ? 'نقل الصلاحيات' :
                    permissionAction === 'share' ? 'فتح الصلاحيات (مشاركة)' :
                      'إضافة وصول فروع'}
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* اختيار نوع العملية */}
              <div className="flex gap-2">
                <Button
                  variant={permissionAction === 'share' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPermissionAction('share')}
                  className="flex-1 gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  فتح صلاحيات
                </Button>
                <Button
                  variant={permissionAction === 'transfer' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPermissionAction('transfer')}
                  className="flex-1 gap-2"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  نقل ملكية
                </Button>
                {/* v3.74.68 — disabled. Data-filtering layer ignores allowed_branches[].
                    Re-enable in v3.75.0 after the filter layer is unified. */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="flex-1 gap-2 cursor-not-allowed opacity-60"
                  title="ميزَة قَيد التَّطوير — تَتَطَلَّب تَوحيد طَبَقَة الفَلتَرَة (v3.75.0)"
                >
                  <GitBranch className="w-4 h-4" />
                  فروع متعددة 🚧
                </Button>
              </div>

              {/* الموظف المصدر */}
              <div className="space-y-2">
                <Label>{permissionAction === 'branch_access' ? 'الموظف' : 'الموظف المصدر (صاحب البيانات)'}</Label>
                <Select value={selectedSourceUser} onValueChange={setSelectedSourceUser}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الموظف..." />
                  </SelectTrigger>
                  <SelectContent>
                    {members.filter(m => !m.is_current).map(m => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.display_name || m.email || m.user_id}
                        <Badge className={`mr-2 text-[10px] ${roleLabels[m.role]?.color}`}>{roleLabels[m.role]?.ar}</Badge>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* الموظفين الهدف (للنقل والمشاركة) */}
              {permissionAction !== 'branch_access' && (
                <div className="space-y-2">
                  <Label>{t('Target employees (multiple allowed)', 'الموظفين الهدف (يمكن اختيار أكثر من واحد)')}</Label>
                  <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                    {members.filter(m => m.user_id !== selectedSourceUser && !m.is_current).map(m => (
                      <label key={m.user_id} className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-slate-800 rounded cursor-pointer">
                        <Checkbox
                          checked={selectedTargetUsers.includes(m.user_id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedTargetUsers([...selectedTargetUsers, m.user_id])
                            } else {
                              setSelectedTargetUsers(selectedTargetUsers.filter(id => id !== m.user_id))
                            }
                          }}
                        />
                        <span className="text-sm">{m.display_name || m.email}</span>
                        <Badge className={`text-[10px] ${roleLabels[m.role]?.color}`}>{roleLabels[m.role]?.ar}</Badge>
                      </label>
                    ))}
                  </div>
                  {selectedTargetUsers.length > 0 && (
                    <p className="text-xs text-blue-600">تم اختيار {selectedTargetUsers.length} موظف</p>
                  )}
                </div>
              )}

              {/* اختيار الفروع (للوصول المتعدد) */}
              {permissionAction === 'branch_access' && (
                <div className="space-y-2">
                  <Label>{t('Branches (multiple allowed)', 'الفروع (يمكن اختيار أكثر من فرع)')}</Label>
                  <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                    {branches.map(b => (
                      <label key={b.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 dark:hover:bg-slate-800 rounded cursor-pointer">
                        <Checkbox
                          checked={selectedBranches.includes(b.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedBranches([...selectedBranches, b.id])
                            } else {
                              setSelectedBranches(selectedBranches.filter(id => id !== b.id))
                            }
                          }}
                        />
                        <span className="text-sm">{b.name}</span>
                        {b.is_main && <Badge className="text-[10px] bg-purple-100 text-purple-700">{t('Main', 'رئيسي')}</Badge>}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* نوع البيانات — v3.73.1: smart filter based on source user's record counts */}
              {permissionAction !== 'branch_access' && (
                <div className="space-y-2">
                  <Label className="flex items-center justify-between">
                    <span>{t('Data type', 'نوع البيانات')}</span>
                    {sourceCountsLoading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                  </Label>
                  <Select value={selectedResourceType} onValueChange={setSelectedResourceType} disabled={!selectedSourceUser}>
                    <SelectTrigger>
                      <SelectValue placeholder={selectedSourceUser ? 'اختر النوع' : 'اختر الموظف المصدر أولاً'} />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const c = sourceUserCounts
                        const total = c ? (c.customers + c.estimates + c.sales_orders + c.bookings) : 0
                        const allDisabled = !!c && total === 0
                        return (
                          <>
                            <SelectItem value="all" disabled={allDisabled}>
                              الكل {c ? `(${total} سجل)` : ''}
                            </SelectItem>
                            <SelectItem value="customers" disabled={!!c && c.customers === 0}>
                              العملاء {c ? `(${c.customers})` : ''}
                            </SelectItem>
                            <SelectItem value="estimates" disabled={!!c && c.estimates === 0}>
                              عروض الأسعار {c ? `(${c.estimates})` : ''}
                            </SelectItem>
                            <SelectItem value="sales_orders" disabled={!!c && c.sales_orders === 0}>
                              أوامر البيع {c ? `(${c.sales_orders})` : ''}
                            </SelectItem>
                            <SelectItem value="bookings" disabled={!!c && c.bookings === 0}>
                              الحجوزات {c ? `(${c.bookings})` : ''}
                            </SelectItem>
                          </>
                        )
                      })()}
                    </SelectContent>
                  </Select>
                  {sourceUserCounts &&
                   (sourceUserCounts.customers + sourceUserCounts.estimates + sourceUserCounts.sales_orders + sourceUserCounts.bookings) === 0 && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                      ⚠ هذا الموظف لا يَمتلك أى سَجلات قابلة للنَقل أو المُشاركة.
                    </p>
                  )}
                </div>
              )}

              {/* v3.74.65 - cherry-pick which customers to transfer (uses the project's shared MultiSelect for visual consistency with the rest of the app) */}
              {permissionAction === 'transfer' && selectedResourceType === 'customers' && selectedSourceUser && (
                <div className="space-y-2">
                  <Label className="flex items-center justify-between">
                    <span>{t('Select customers (leave empty to transfer all)', 'اختر العُملاء (اتركه فارغاً لنَقل الكُل)')}</span>
                    {sourceCustomersLoading && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
                  </Label>
                  {sourceCustomers.length === 0 && !sourceCustomersLoading ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                      لا يَملِك المُوظَّف المَصدَر أَى عُملاء{transferBranchId ? ' فى الفَرع المُحَدَّد' : ''}.
                    </p>
                  ) : (
                    <MultiSelect
                      options={sourceCustomers.map((c) => ({
                        value: c.id,
                        label: c.phone ? `${c.name} — ${c.phone}` : c.name,
                      }))}
                      selected={selectedCustomerIds}
                      onChange={setSelectedCustomerIds}
                      placeholder={`جَميع العُملاء (${sourceCustomers.length}) — اتركه فارغاً للنَقل الكامِل`}
                      searchPlaceholder="ابحث بالاسم أو الهاتف..."
                      emptyMessage="لا تُوجَد نَتائج"
                      maxDisplay={3}
                    />
                  )}
                  {selectedCustomerIds.length > 0 && (
                    <p className="text-xs text-blue-700 dark:text-blue-400 px-1">
                      سَيَتم نَقل {selectedCustomerIds.length} عَميل فَقَط من إِجمالى {sourceCustomers.length}.
                    </p>
                  )}
                </div>
              )}

              {/* الفرع (للنقل فقط): نقل عملاء/أوامر فرع معين للموظف الجديد */}
              {permissionAction === 'transfer' && (
                <div className="space-y-2">
                  <Label>{t('Branch (optional)', 'الفرع (اختياري)')}</Label>
                  <Select value={transferBranchId || "all_branches"} onValueChange={(v) => setTransferBranchId(v === "all_branches" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="الكل — نقل كل البيانات" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_branches">{t('All — transfer all data', 'الكل — نقل كل البيانات')}</SelectItem>
                      {branches.map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                          {b.is_main && ' (رئيسي)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    عند نقل موظف لفرع آخر: اختر فرع الموظف السابق لنقل عملائه وأوامره فيه إلى الموظف الذي يحل محله.
                  </p>
                </div>
              )}

              {/* صلاحيات إضافية للمشاركة */}
              {permissionAction === 'share' && (
                <div className="space-y-2 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                  <Label className="text-sm font-medium">{t('Additional permissions', 'صلاحيات إضافية')}</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={shareCanEdit} onCheckedChange={(c) => setShareCanEdit(!!c)} />
                      <span className="text-sm">{t('Edit', 'تعديل')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={shareCanDelete} onCheckedChange={(c) => setShareCanDelete(!!c)} />
                      <span className="text-sm">{t('Delete', 'حذف')}</span>
                    </label>
                  </div>
                </div>
              )}

              {/* تحذير للنقل */}
              {permissionAction === 'transfer' && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>⚠️ {t('Transfer permanently changes data ownership. The source employee loses access.', 'النقل سيغير ملكية البيانات نهائياً. الموظف المصدر سيفقد الوصول.')}</span>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setShowPermissionDialog(false); resetPermissionForm() }}>
                إلغاء
              </Button>
              <Button
                onClick={() => {
                  if (permissionAction === 'transfer') handleTransferPermissions()
                  else if (permissionAction === 'share') handleSharePermissions()
                  else handleAddBranchAccess()
                }}
                disabled={permissionLoading}
                className={`gap-2 ${permissionAction === 'transfer' ? 'bg-blue-500 hover:bg-blue-600' :
                  permissionAction === 'share' ? 'bg-green-500 hover:bg-green-600' :
                    'bg-purple-500 hover:bg-purple-600'
                  }`}
              >
                {permissionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                  permissionAction === 'transfer' ? <ArrowRightLeft className="w-4 h-4" /> :
                    permissionAction === 'share' ? <Share2 className="w-4 h-4" /> :
                      <GitBranch className="w-4 h-4" />}
                {permissionAction === 'transfer' ? 'نقل الصلاحيات' :
                  permissionAction === 'share' ? 'فتح الصلاحيات' :
                    'إضافة الفروع'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
