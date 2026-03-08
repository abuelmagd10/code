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
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { usePermissions } from "@/lib/permissions-context"
import { canAdvancedAction, type AdvancedAction } from "@/lib/authz"
import Link from "next/link"
import { Users, UserPlus, Shield, Key, Mail, Trash2, Building2, ChevronRight, UserCog, Lock, Check, X, AlertCircle, Loader2, RefreshCw, MapPin, Warehouse, ArrowRightLeft, Share2, Eye, Edit, GitBranch, Search, Copy } from "lucide-react"

type Member = { id: string; user_id: string; role: string; email?: string; is_current?: boolean; username?: string; display_name?: string; branch_id?: string; cost_center_id?: string; warehouse_id?: string }
type Branch = { id: string; name: string; is_main: boolean }
type CostCenter = { id: string; cost_center_name: string; branch_id: string }
type WarehouseType = { id: string; name: string; branch_id: string; is_main: boolean }
type PermissionSharing = { id: string; grantor_user_id: string; grantee_user_id: string; resource_type: string; can_view: boolean; can_edit: boolean; is_active: boolean; expires_at?: string }
type PermissionTransfer = { id: string; from_user_id: string; to_user_id: string; resource_type: string; records_transferred: number; transferred_at: string; status: string }
type UserBranchAccess = { id: string; user_id: string; branch_id: string; is_primary: boolean; can_view_customers: boolean; can_view_orders: boolean; can_view_prices: boolean; is_active: boolean }

// 🔐 Enterprise Action Mapping
const ADVANCED_ACTIONS_MAP: Record<string, { value: AdvancedAction, label: string }[]> = {
  invoices: [
    { value: "print", label: "طباعة الفاتورة" },
    { value: "send", label: "إرسال فاتورة" },
    { value: "convert_to_bill", label: "تحويل لفاتورة شراء" },
    { value: "void", label: "إبطال" }
  ],
  bills: [
    { value: "record_payment", label: "تسجيل دفعة" },
    { value: "convert_to_invoice", label: "تحويل لفاتورة مبيعات" },
    { value: "void", label: "إبطال" }
  ],
  journal_entries: [
    { value: "post", label: "ترحيل القيد" },
    { value: "unpost", label: "إلغاء ترحيل" }
  ],
  banking: [
    { value: "reconcile", label: "مطابقة" },
    { value: "record_payment", label: "تسجيل دفعة/استلام" }
  ],
  inventory: [
    { value: "adjust", label: "تسوية" },
    { value: "transfer", label: "نقل مخزون" },
    { value: "count", label: "جرد مباشر" }
  ],
  hr: [
    { value: "process", label: "معالجة الرواتب" },
    { value: "approve", label: "اعتماد الرواتب" }
  ],
  payroll: [
    { value: "process", label: "معالجة الرواتب" },
    { value: "approve", label: "اعتماد الرواتب" }
  ],
  fixed_assets: [
    { value: "post_depreciation", label: "ترحيل إهلاك" },
    { value: "approve_depreciation", label: "اعتماد إهلاك" }
  ],
  sales_returns: [
    { value: "partial_return", label: "مرتجع جزئي" },
    { value: "full_return", label: "مرتجع كامل" },
    { value: "reverse_return", label: "عكس مرتجع" }
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

  // 🏢 إدارة فرع الموظف (Single Branch - Mandatory)
  const [showMemberBranchDialog, setShowMemberBranchDialog] = useState(false)
  const [editingMemberId, setEditingMemberId] = useState<string>("")
  const [editingMemberName, setEditingMemberName] = useState<string>("")
  const [memberBranchId, setMemberBranchId] = useState<string>("")
  const [savingMemberBranches, setSavingMemberBranches] = useState(false)
  const [resendingInvite, setResendingInvite] = useState<string | null>(null)

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
        setActionError(typeof err?.message === "string" ? err.message : "تعذر تحميل الأعضاء")
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
          setCompanyName(currentCompany?.name || "الشركة");

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
    } catch (err) {
      console.error("Error loading permission data:", err)
    }
  }

  // تحميل بيانات الصلاحيات عند تحميل الصفحة
  useEffect(() => {
    if (companyId && canManage) {
      loadPermissionData()
    }
  }, [companyId, canManage])

  // 🔄 نقل الصلاحيات
  const handleTransferPermissions = async () => {
    if (!selectedSourceUser || selectedTargetUsers.length === 0) {
      toastActionError(toast, "نقل", "الصلاحيات", "يجب تحديد الموظف المصدر والموظفين الهدف")
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
          ...(transferBranchId ? { branch_id: transferBranchId } : {})
        })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        toastActionSuccess(toast, "نقل", `${data.total_transferred} سجل`)
        setShowPermissionDialog(false)
        resetPermissionForm()
        loadPermissionData()
      } else {
        toastActionError(toast, "نقل", "الصلاحيات", data.error)
      }
    } catch (err: any) {
      toastActionError(toast, "نقل", "الصلاحيات", err.message)
    } finally {
      setPermissionLoading(false)
    }
  }

  // 🔓 فتح الصلاحيات (مشاركة)
  const handleSharePermissions = async () => {
    if (!selectedSourceUser || selectedTargetUsers.length === 0) {
      toastActionError(toast, "مشاركة", "الصلاحيات", "يجب تحديد الموظف المصدر والموظفين الهدف")
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
        toastActionSuccess(toast, "مشاركة", "الصلاحيات")
        setShowPermissionDialog(false)
        resetPermissionForm()
        loadPermissionData()
      } else {
        toastActionError(toast, "مشاركة", "الصلاحيات", data.error)
      }
    } catch (err: any) {
      toastActionError(toast, "مشاركة", "الصلاحيات", err.message)
    } finally {
      setPermissionLoading(false)
    }
  }

  // 🏢 إضافة وصول فروع متعددة
  const handleAddBranchAccess = async () => {
    if (!selectedSourceUser || selectedBranches.length === 0) {
      toastActionError(toast, "إضافة", "وصول الفروع", "يجب تحديد الموظف والفروع")
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
        toastActionSuccess(toast, "إضافة", "وصول الفروع")
        setShowPermissionDialog(false)
        resetPermissionForm()
        loadPermissionData()
      } else {
        toastActionError(toast, "إضافة", "وصول الفروع", data.error)
      }
    } catch (err: any) {
      toastActionError(toast, "إضافة", "وصول الفروع", err.message)
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
    setShareCanEdit(false)
    setShareCanDelete(false)
  }

  // 🏢 فتح dialog إدارة فرع الموظف (Single Branch - Mandatory)
  const openMemberBranchDialog = async (member: Member) => {
    setEditingMemberId(member.user_id)
    setEditingMemberName(member.display_name || member.email || member.username || "")

    // ✅ المستخدم له فرع واحد فقط - استخدام branch_id من company_members
    const memberBranchId = member.branch_id || ""
    setMemberBranchId(memberBranchId)
    setShowMemberBranchDialog(true)
  }

  // 🏢 حفظ فرع الموظف (Single Branch - Mandatory)
  const saveMemberBranches = async () => {
    if (!editingMemberId || !memberBranchId) {
      toastActionError(toast, "حفظ", "الفرع", "يجب تحديد فرع واحد إلزاميًا")
      return
    }
    setSavingMemberBranches(true)
    try {
      // ✅ التحقق من أن branch_id ليس مصفوفة (منع التلاعب)
      if (Array.isArray(memberBranchId)) {
        throw new Error('User can belong to only one branch')
      }

      // 🏢 جلب المخزن التابع للفرع الجديد (إذا كان المستخدم store_manager)
      const currentMember = members.find(m => m.user_id === editingMemberId)
      let warehouseId = null

      if (currentMember?.role === 'store_manager') {
        const { data: branchWarehouse } = await supabase
          .from("warehouses")
          .select("id")
          .eq("company_id", companyId)
          .eq("branch_id", memberBranchId)
          .maybeSingle()

        warehouseId = branchWarehouse?.id || null
        console.log("🏢 Auto-updating warehouse for store_manager:", {
          userId: editingMemberId,
          newBranchId: memberBranchId,
          newWarehouseId: warehouseId
        })
      }

      // ✅ تحديث الفرع في company_members (فرع واحد فقط)
      const { error: updateError } = await supabase
        .from("company_members")
        .update({
          branch_id: memberBranchId,
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
      const { error: accessError } = await supabase
        .from("user_branch_access")
        .upsert({
          company_id: companyId,
          user_id: editingMemberId,
          branch_id: memberBranchId,
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

      // تحديث القائمة المحلية
      setMembers(prev => prev.map(m =>
        m.user_id === editingMemberId ? { ...m, branch_id: memberBranchId, warehouse_id: warehouseId } : m
      ))

      toastActionSuccess(toast, "حفظ", "فرع الموظف")

      // إنشاء إشعار للمستخدم عند تغيير فرعه
      try {
        const { notifyUserBranchChanged } = await import('@/lib/notification-helpers')
        const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'
        await notifyUserBranchChanged({
          companyId,
          userId: editingMemberId,
          branchId: memberBranchId || undefined,
          changedBy: currentUserId,
          appLang
        })
      } catch (notifError) {
        console.error("Error creating notification:", notifError)
        // لا نوقف العملية إذا فشل إنشاء الإشعار
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
      toastActionError(toast, "حفظ", "الفروع", err.message)
    } finally {
      setSavingMemberBranches(false)
    }
  }

  // 🏢 الحصول على أسماء فروع الموظف
  const getMemberBranchNames = (member: Member): string => {
    const memberAccess = userBranchAccess.filter(a => a.user_id === member.user_id && a.is_active)
    if (memberAccess.length > 0) {
      return memberAccess.map(a => {
        const branch = branches.find(b => b.id === a.branch_id)
        return branch?.name || "فرع غير معروف"
      }).join("، ")
    }
    if (member.branch_id) {
      const branch = branches.find(b => b.id === member.branch_id)
      return branch?.name || "فرع غير معروف"
    }
    return "غير محدد"
  }

  const createInvitation = async () => {
    const targetCompanyId = (inviteCompanyId || companyId)
    if (!targetCompanyId || !inviteEmail.trim() || !inviteName.trim()) return
    if (!canManage) { setActionError("ليست لديك صلاحية لإنشاء دعوات"); return }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(inviteEmail.trim())) { setActionError("البريد الإلكتروني غير صالح"); return }
    if (!inviteName.trim()) { setActionError("اسم الموظف مطلوب"); return }
    if (!inviteBranchId) { setActionError("يجب تحديد الفرع"); return }
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
        if (!canManageTarget) { setActionError("ليست لديك صلاحية لإرسال دعوة لهذه الشركة"); return }
      } catch { }

      // إنشاء الدعوة مع الفرع ومركز التكلفة والمخزن
      const invitationData: any = {
        company_id: targetCompanyId,
        email: inviteEmail.trim(),
        employee_name: inviteName.trim() || null,
        role: inviteRole,
        branch_id: inviteBranchId || null,
        cost_center_id: inviteCostCenterId || null,
        warehouse_id: inviteWarehouseId || null
      }

      const { data: created, error } = await supabase
        .from("company_invitations")
        .insert(invitationData)
        .select("id, accept_token")
        .single()
      if (error) { setActionError(error.message || "تعذر إنشاء الدعوة"); return }
      try {
        await fetch("/api/send-invite", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: inviteEmail.trim(),
            employeeName: inviteName.trim() || undefined,
            inviteId: created.id,
            token: created.accept_token,
            companyId: targetCompanyId,
            role: inviteRole,
            branchId: inviteBranchId,
            costCenterId: inviteCostCenterId,
            warehouseId: inviteWarehouseId
          }),
        })
      } catch { }
      setInviteEmail("")
      setInviteName("")
      setInviteRole("staff")
      // جلب الدعوات المعلقة فقط (غير مقبولة وغير منتهية)
      const { data: cinv } = await supabase
        .from("company_invitations")
        .select("id,email,role,expires_at,branch_id,cost_center_id,warehouse_id,accept_token")
        .eq("company_id", companyId)
        .eq("accepted", false)
        .gt("expires_at", new Date().toISOString())
      setInvites((cinv || []) as any)
      toastActionSuccess(toast, "إنشاء", "الدعوة")
    } finally { setLoading(false) }
  }


  const updateRole = async (id: string, role: string) => {
    if (!canManage) { setActionError("ليست لديك صلاحية لتغيير الأدوار"); return }
    setLoading(true)
    try {
      setActionError(null)
      const m = members.find((x) => x.id === id)
      if (!m) { setActionError("العضو غير موجود"); return }
      // منع فقدان آخر مالك
      const owners = members.filter((x) => x.role === "owner")
      if (m.role === "owner" && owners.length === 1 && role !== "owner") { setActionError("لا يمكن تغيير دور آخر مالك"); return }
      // منع خفض دور المستخدم الحالي إلى عرض فقط بدون وجود مدير/مالك آخر
      if (m.user_id === currentUserId && !["owner", "admin"].includes(role)) {
        const hasOtherAdmin = members.some((x) => x.user_id !== currentUserId && ["owner", "admin"].includes(x.role))
        if (!hasOtherAdmin) { setActionError("لا يمكن خفض دورك دون وجود مدير/مالك آخر"); return }
      }
      const oldRole = m.role
      const { error } = await supabase
        .from("company_members")
        .update({ role })
        .eq("id", id)
      if (error) { setActionError(error.message || "تعذر التحديث"); return }

      // إنشاء إشعار للمستخدم عند تغيير دوره
      if (oldRole !== role) {
        try {
          const { notifyUserRoleChanged } = await import('@/lib/notification-helpers')
          const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'
          await notifyUserRoleChanged({
            companyId,
            userId: m.user_id,
            oldRole,
            newRole: role,
            changedBy: currentUserId,
            appLang
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
    if (!canManage) { setActionError("ليست لديك صلاحية لإزالة الأعضاء"); return }
    setLoading(true)
    try {
      setActionError(null)
      const m = members.find((x) => x.id === id)
      if (!m) { setActionError("العضو غير موجود"); return }
      const owners = members.filter((x) => x.role === "owner")
      if (m.role === "owner" && owners.length === 1) { setActionError("لا يمكن إزالة آخر مالك"); return }
      if (m.user_id === currentUserId) { setActionError("لا يمكنك إزالة نفسك"); return }
      const { error } = await supabase
        .from("company_members")
        .delete()
        .eq("id", id)
      if (error) { setActionError(error.message || "تعذر الإزالة"); return }
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

  // تصنيف الموارد حسب الفئات للعرض المنظم - جميع الصفحات الموجودة فعلياً في التطبيق
  const resourceCategories = {
    reports: {
      label: '📊 التقارير واللوحة الرئيسية',
      resources: [
        { value: 'dashboard', label: 'لوحة التحكم' },
        { value: 'reports', label: 'التقارير العامة' },
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
        { value: 'sent_invoice_returns', label: 'مرتجعات الفواتير المرسلة' },
        { value: 'customer_debit_notes', label: 'إشعارات دائن العملاء' },
      ]
    },
    purchases: {
      label: '🛒 المشتريات',
      resources: [
        { value: 'bills', label: 'فواتير المشتريات' },
        { value: 'suppliers', label: 'الموردون' },
        { value: 'purchase_orders', label: 'أوامر الشراء' },
        { value: 'purchase_returns', label: 'مرتجعات المشتريات' },
        { value: 'vendor_credits', label: 'إشعارات دائن الموردين' },
      ]
    },
    inventory: {
      label: '📦 المخزون',
      resources: [
        { value: 'products', label: 'المنتجات' },
        { value: 'inventory', label: 'حركات المخزون' },
        { value: 'inventory_transfers', label: 'تحويلات المخزون' },
        { value: 'write_offs', label: 'إهلاك المخزون' },
        { value: 'third_party_inventory', label: 'مخزون الطرف الثالث' },
        // صفحة توفر المنتجات في الفروع
        { value: 'product_availability', label: 'توفر المنتجات في الفروع' },
        // اعتماد استلام فواتير المشتريات من المخزن (workflow جديد)
        { value: 'inventory_goods_receipt', label: 'اعتماد استلام فواتير المشتريات' },
      ]
    },
    finance: {
      label: '🏦 المالية والمحاسبة',
      resources: [
        { value: 'expenses', label: 'المصروفات' },
        { value: 'drawings', label: 'المسحوبات الشخصية' },
        { value: 'annual_closing', label: 'الإقفال السنوي' },
        { value: 'accounting_periods', label: 'الفترات المحاسبية' },
        { value: 'payments', label: 'المدفوعات' },
        { value: 'journal_entries', label: 'القيود اليومية' },
        { value: 'chart_of_accounts', label: 'الشجرة المحاسبية' },
        { value: 'banking', label: 'الأعمال المصرفية' },
        { value: 'shareholders', label: 'المساهمون' },
        { value: 'fixed_assets', label: 'الأصول الثابتة' },
        { value: 'asset_categories', label: 'فئات الأصول' },
        { value: 'fixed_assets_reports', label: 'تقارير الأصول الثابتة' },
      ]
    },
    hr: {
      label: '👥 الموارد البشرية',
      resources: [
        { value: 'hr', label: 'الموارد البشرية (الرئيسية)' },
        { value: 'employees', label: 'الموظفين' },
        { value: 'attendance', label: 'الحضور والانصراف' },
        { value: 'payroll', label: 'الرواتب' },
        { value: 'instant_payouts', label: 'السلف الفورية' },
      ]
    },
    organization: {
      label: '🏢 الهيكل التنظيمي',
      resources: [
        { value: 'branches', label: 'الفروع' },
        { value: 'cost_centers', label: 'مراكز التكلفة' },
        { value: 'warehouses', label: 'المستودعات' },
      ]
    },
    settings: {
      label: '⚙️ الإعدادات',
      resources: [
        { value: 'settings', label: 'الإعدادات (الرئيسية)' },
        { value: 'system_status', label: 'حالة النظام' },
        { value: 'company_settings', label: 'إعدادات الشركة' },
        { value: 'users', label: 'المستخدمون' },
        { value: 'exchange_rates', label: 'أسعار العملات' },
        { value: 'taxes', label: 'الضرائب' },
        { value: 'audit_log', label: 'سجل التدقيق' },
        { value: 'backup', label: 'النسخ الاحتياطي' },
        { value: 'shipping', label: 'إعدادات الشحن' },
        { value: 'profile', label: 'الملف الشخصي' },
        { value: 'orders_rules', label: 'قواعد الطلبات' },
        { value: 'accounting_maintenance', label: 'صيانة المحاسبة' },
      ]
    },
    permissions: {
      label: '🔐 إدارة الصلاحيات',
      resources: [
        { value: 'permission_sharing', label: 'مشاركة الصلاحيات' },
        { value: 'permission_transfers', label: 'نقل الصلاحيات' },
        { value: 'user_branch_access', label: 'وصول الفروع' },
        { value: 'role_permissions', label: 'صلاحيات الأدوار' },
      ]
    },
  }

  const getResourceLabel = (value: string) => {
    return Object.values(resourceCategories)
      .flatMap((cat) => cat.resources)
      .find((r) => r.value === value)?.label || value
  }

  const defaultSidebarResourcesByRole: Record<string, string[]> = {
    owner: Object.values(resourceCategories).flatMap((cat) => cat.resources.map((r) => r.value)),
    admin: Object.values(resourceCategories).flatMap((cat) => cat.resources.map((r) => r.value)),
    manager: [
      'dashboard', 'reports', 'invoices', 'customers', 'estimates', 'sales_orders', 'sales_returns', 'sent_invoice_returns', 'customer_debit_notes', 'bills', 'suppliers', 'purchase_orders', 'purchase_returns', 'vendor_credits', 'products', 'inventory', 'inventory_transfers', 'write_offs', 'third_party_inventory', 'product_availability', 'inventory_goods_receipt', 'payments', 'expenses', 'drawings', 'journal_entries', 'banking', 'chart_of_accounts', 'fixed_assets', 'asset_categories', 'fixed_assets_reports', 'annual_closing', 'hr', 'employees', 'attendance', 'payroll', 'instant_payouts', 'branches', 'cost_centers', 'warehouses'
    ],
    accountant: [
      'dashboard', 'reports', 'invoices', 'customers', 'sales_returns', 'customer_debit_notes', 'bills', 'suppliers', 'purchase_returns', 'vendor_credits', 'payments', 'expenses', 'drawings', 'journal_entries', 'chart_of_accounts', 'banking', 'annual_closing', 'accounting_periods', 'shareholders', 'fixed_assets', 'asset_categories', 'fixed_assets_reports', 'taxes', 'exchange_rates', 'accounting_maintenance', 'products', 'inventory', 'inventory_transfers', 'write_offs', 'third_party_inventory', 'product_availability', 'inventory_goods_receipt'
    ],
    store_manager: [
      'dashboard', 'products', 'inventory', 'product_availability', 'inventory_transfers', 'third_party_inventory', 'write_offs', 'inventory_goods_receipt', 'purchase_orders', 'sales_orders', 'shipping'
    ],
    staff: [
      'dashboard', 'customers', 'estimates', 'sales_orders', 'invoices', 'inventory', 'product_availability', 'attendance'
    ],
    viewer: [
      'dashboard', 'reports'
    ],
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
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">إدارة أعضاء الشركة وصلاحياتهم</p>
                  {/* 🔐 Governance Notice */}
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    👑 صلاحية إدارية - جميع المستخدمين مرئيين
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
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {m.email && (
                            <span className="text-xs text-muted-foreground">{m.email}</span>
                          )}
                          <Badge className={`text-[10px] ${roleLabels[m.role]?.color || roleLabels.viewer.color}`}>
                            {roleLabels[m.role]?.ar || m.role}
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
                          الفروع
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
                                toastActionSuccess(toast, "تحديث", "الدور")

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
                <DialogTitle>تأكيد حذف العضو</DialogTitle>
              </div>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <p className="text-gray-700 dark:text-gray-300">
                هل أنت متأكد من رغبتك في إزالة <strong>{userToDelete?.email || userToDelete?.username || 'هذا العضو'}</strong> من الشركة؟
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                سيتم التحقق من وجود بيانات مرتبطة بهذا المستخدم قبل الحذف.
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setDeleteConfirmOpen(false); setUserToDelete(null) }} disabled={isDeleting}>
                إلغاء
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
                      toastActionSuccess(toast, "حذف", "العضو")
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
                      toastActionError(toast, "حذف", "العضو", js?.error || js?.error_en || undefined)
                    }
                  } catch (e: any) {
                    toastActionError(toast, "حذف", "العضو", e?.message)
                  } finally {
                    setIsDeleting(false)
                  }
                }}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري الحذف...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    حذف
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
                if (pw.length < 6) { toastActionError(toast, "تحديث", "كلمة المرور", "الحد الأدنى 6 أحرف"); return }
                try {
                  const res = await fetch("/api/member-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: changePassUserId, password: pw, companyId }) })
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

        {/* موديال نقل بيانات وحذف الموظف (Reassignment) */}
        <Dialog open={reassignModalOpen} onOpenChange={(v) => { if (!v) { setReassignModalOpen(false); setUserToReassign(null); setUserDependencies(null); setReassignTargetId("") } }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <DialogTitle>نقل صلاحيات السجلات وملكية البيانات</DialogTitle>
              </div>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-md border border-amber-200 dark:border-amber-800">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-2">
                  لا يمكن حذف المستخدم ({userToReassign?.display_name || userToReassign?.username}) مباشرة لوجود بيانات مرتبطة به:
                </p>
                <ul className="list-disc list-inside text-xs text-amber-700 dark:text-amber-400 space-y-1">
                  {userDependencies?.invoices > 0 && <li>فواتير مبيعات: {userDependencies.invoices}</li>}
                  {userDependencies?.sales_orders > 0 && <li>أوامر بيع: {userDependencies.sales_orders}</li>}
                  {userDependencies?.purchase_orders > 0 && <li>أوامر شراء: {userDependencies.purchase_orders}</li>}
                  {userDependencies?.bills > 0 && <li>فواتير مشتريات: {userDependencies.bills}</li>}
                  {userDependencies?.customers > 0 && <li>عملاء: {userDependencies.customers}</li>}
                  {userDependencies?.suppliers > 0 && <li>موردين: {userDependencies.suppliers}</li>}
                  {userDependencies?.journal_entries > 0 && <li>قيود يومية: {userDependencies.journal_entries}</li>}
                </ul>
                <p className="mt-2 text-xs font-bold text-amber-900 dark:text-amber-200">الإجمالي: {userDependencies?.total} سجل</p>
              </div>

              <div className="space-y-2">
                <Label>اختر الموظف البديل لنقل الملكية إليه</Label>
                <Select value={reassignTargetId} onValueChange={setReassignTargetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر موظفاً (مسموح بالنشطين فقط)" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.filter(m => m.user_id !== userToReassign?.user_id).map(m => (
                      <SelectItem key={m.user_id} value={m.user_id}>{m.display_name || m.username || m.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1 pb-1">سيتم نقل كافة السجلات باسم الموظف المختار أعلاه، ولن يفقد النظام أي بيانات.</p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setReassignModalOpen(false)}>إلغاء</Button>
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
                    toastActionSuccess(toast, "نقل داتا وحذف", "المستخدم القديم")
                    setReassignModalOpen(false)
                  } else {
                    toastActionError(toast, "نقل وحذف", "العضو", js?.error || undefined)
                  }
                } catch (e: any) {
                  toastActionError(toast, "نقل وحذف", "العضو", e?.message)
                } finally {
                  setIsReassigning(false)
                }
              }}>
                {isReassigning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "نقل البيانات والحذف نهائياً"}
              </Button>
            </DialogFooter>
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
                  <DialogTitle>إدارة فروع الموظف</DialogTitle>
                  <p className="text-sm text-gray-500 mt-1">{editingMemberName}</p>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  الفرع التابع له الموظف <span className="text-red-500">*</span>
                </Label>
                <p className="text-xs text-gray-500">اختر الفرع الواحد الذي ينتمي إليه الموظف (إلزامي)</p>
                <Select
                  value={memberBranchId}
                  onValueChange={(value) => setMemberBranchId(value)}
                >
                  <SelectTrigger className="w-full bg-white dark:bg-slate-800">
                    <SelectValue placeholder="اختر الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        <div className="flex items-center gap-2">
                          <span>{branch.name}</span>
                          {branch.is_main && (
                            <Badge className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                              رئيسي
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {memberBranchId && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
                    <strong>الفرع المحدد:</strong> {branches.find(b => b.id === memberBranchId)?.name || "غير محدد"}
                  </p>
                </div>
              )}

              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <AlertCircle className="w-3 h-3 inline ml-1" />
                  <strong>قرار معماري إلزامي:</strong> كل موظف يجب أن ينتمي إلى فرع واحد فقط.
                  هذا يضمن عزل البيانات بين الفروع، منطق الصلاحيات الصحيح، وRealtime مستقر.
                  المدراء والمالكون يمكنهم الوصول لجميع الفروع.
                </p>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowMemberBranchDialog(false)}>إلغاء</Button>
              <Button
                className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-500"
                onClick={saveMemberBranches}
                disabled={savingMemberBranches || !memberBranchId}
              >
                {savingMemberBranches ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                حفظ الفرع
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
                    <UserCog className="w-4 h-4" />
                    اسم الموظف <span className="text-red-500">*</span>
                  </Label>
                  <Input placeholder="الاسم الكامل" value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="bg-gray-50 dark:bg-slate-800" />
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
              </div>

              {/* اختيار الفرع ومركز التكلفة والمخزن */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end mt-4">
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    الفرع <span className="text-red-500">*</span>
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
                      <SelectValue placeholder="اختر الفرع" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">اختر الفرع...</SelectItem>
                      {branches.map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} {b.is_main && '(رئيسي)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    مركز التكلفة
                  </Label>
                  <Select
                    value={inviteCostCenterId || "none"}
                    onValueChange={(v) => setInviteCostCenterId(v === "none" ? "" : v)}
                    disabled={!inviteBranchId}
                  >
                    <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                      <SelectValue placeholder="اختر مركز التكلفة" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون تحديد</SelectItem>
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
                    المخزن
                  </Label>
                  <Select
                    value={inviteWarehouseId || "none"}
                    onValueChange={(v) => setInviteWarehouseId(v === "none" ? "" : v)}
                    disabled={!inviteBranchId}
                  >
                    <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                      <SelectValue placeholder="اختر المخزن" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون تحديد</SelectItem>
                      {warehouses.filter(w => w.branch_id === inviteBranchId).map(w => (
                        <SelectItem key={w.id} value={w.id}>
                          {w.name} {w.is_main && '(رئيسي)'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Button onClick={createInvitation} disabled={loading || !inviteEmail.trim() || !inviteBranchId} className="w-full gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600">
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
                                  toastActionSuccess(toast, "إعادة إرسال", "الدعوة")
                                } else {
                                  toastActionError(toast, "إعادة إرسال", "الدعوة", data.error || "فشل الإرسال")
                                }
                              } catch (err) {
                                toastActionError(toast, "إعادة إرسال", "الدعوة", "حدث خطأ")
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
                            إعادة إرسال
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
                                  toastActionSuccess(toast, "نسخ", "رابط الدعوة")
                                } catch {
                                  // Fallback for older browsers
                                  const textArea = document.createElement("textarea")
                                  textArea.value = inviteLink
                                  document.body.appendChild(textArea)
                                  textArea.select()
                                  document.execCommand("copy")
                                  document.body.removeChild(textArea)
                                  toastActionSuccess(toast, "نسخ", "رابط الدعوة")
                                }
                              }}
                            >
                              <Copy className="w-3 h-3" />
                              نسخ الرابط
                            </Button>
                          )}
                          {/* زر الحذف */}
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
                    المورد (الصفحة)
                  </Label>
                  {defaultSidebarResourcesByRole[permRole] && defaultSidebarResourcesByRole[permRole].length > 0 && (
                    <div className="mb-2 p-3 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700">
                      <p className="text-[11px] text-gray-600 dark:text-gray-300 mb-1">
                        الصفحات الافتراضية في القائمة الجانبية لهذا الدور:
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {defaultSidebarResourcesByRole[permRole].map((res) => (
                          <Badge key={res} variant="outline" className="text-[10px] px-2 py-0.5">
                            {getResourceLabel(res)}
                          </Badge>
                        ))}
                      </div>
                      <p className="mt-2 text-[10px] text-gray-500 dark:text-gray-400">
                        يمكن للأدوار العليا تعديل هذه الافتراضات لكل مستخدم عند الحاجة. هذا يؤثر فقط على عرض الصفحات في القائمة،
                        وليس على صلاحيات القراءة أو التعديل أو الحذف.
                      </p>
                    </div>
                  )}
                  <Select value={permResource} onValueChange={(v) => { setPermResource(v); setResourceSearch("") }}>
                    <SelectTrigger className="bg-gray-50 dark:bg-slate-800">
                      <SelectValue placeholder="اختر المورد..." />
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
                            placeholder="ابحث عن صفحة..."
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
                            <p className="text-sm">لا توجد نتائج لـ "{resourceSearch}"</p>
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
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">صلاحيات الوصول:</p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setPermAccess(true); setPermRead(true); setPermWrite(true); setPermUpdate(true); setPermDelete(true); setPermFull(true) }}
                      className="text-xs h-7 px-2 gap-1"
                    >
                      <Check className="w-3 h-3" /> تحديد الكل
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setPermAccess(false); setPermRead(false); setPermWrite(false); setPermUpdate(false); setPermDelete(false); setPermFull(false) }}
                      className="text-xs h-7 px-2 gap-1"
                    >
                      <X className="w-3 h-3" /> إلغاء الكل
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
                      <span className={`text-sm font-semibold ${permAccess ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-500'}`}>إظهار</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center">في القائمة</span>
                    </label>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap shadow-lg">
                      عرض الصفحة في القائمة الجانبية
                    </div>
                  </div>

                  {/* قراءة */}
                  <div className="relative group">
                    <label className={`flex flex-col items-center gap-2 cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${permRead ? 'bg-blue-50 dark:bg-blue-900/40 border-blue-400 dark:border-blue-500 shadow-md' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 hover:border-blue-300'}`}>
                      <input type="checkbox" checked={permRead} onChange={(e) => setPermRead(e.target.checked)} className="sr-only" />
                      <div className={`p-2 rounded-lg ${permRead ? 'bg-blue-100 dark:bg-blue-800' : 'bg-gray-100 dark:bg-slate-600'}`}>
                        <Eye className={`w-5 h-5 ${permRead ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}`} />
                      </div>
                      <span className={`text-sm font-semibold ${permRead ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500'}`}>قراءة</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center">عرض البيانات</span>
                    </label>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap shadow-lg">
                      عرض وقراءة البيانات فقط
                    </div>
                  </div>

                  {/* كتابة */}
                  <div className="relative group">
                    <label className={`flex flex-col items-center gap-2 cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${permWrite ? 'bg-green-50 dark:bg-green-900/40 border-green-400 dark:border-green-500 shadow-md' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 hover:border-green-300'}`}>
                      <input type="checkbox" checked={permWrite} onChange={(e) => setPermWrite(e.target.checked)} className="sr-only" />
                      <div className={`p-2 rounded-lg ${permWrite ? 'bg-green-100 dark:bg-green-800' : 'bg-gray-100 dark:bg-slate-600'}`}>
                        <UserPlus className={`w-5 h-5 ${permWrite ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`} />
                      </div>
                      <span className={`text-sm font-semibold ${permWrite ? 'text-green-700 dark:text-green-300' : 'text-gray-500'}`}>كتابة</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center">إنشاء جديد</span>
                    </label>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap shadow-lg">
                      إنشاء سجلات وبيانات جديدة
                    </div>
                  </div>

                  {/* تعديل */}
                  <div className="relative group">
                    <label className={`flex flex-col items-center gap-2 cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${permUpdate ? 'bg-amber-50 dark:bg-amber-900/40 border-amber-400 dark:border-amber-500 shadow-md' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 hover:border-amber-300'}`}>
                      <input type="checkbox" checked={permUpdate} onChange={(e) => setPermUpdate(e.target.checked)} className="sr-only" />
                      <div className={`p-2 rounded-lg ${permUpdate ? 'bg-amber-100 dark:bg-amber-800' : 'bg-gray-100 dark:bg-slate-600'}`}>
                        <Edit className={`w-5 h-5 ${permUpdate ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`} />
                      </div>
                      <span className={`text-sm font-semibold ${permUpdate ? 'text-amber-700 dark:text-amber-300' : 'text-gray-500'}`}>تعديل</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center">تحديث البيانات</span>
                    </label>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap shadow-lg">
                      تعديل وتحديث السجلات الموجودة
                    </div>
                  </div>

                  {/* حذف */}
                  <div className="relative group">
                    <label className={`flex flex-col items-center gap-2 cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${permDelete ? 'bg-red-50 dark:bg-red-900/40 border-red-400 dark:border-red-500 shadow-md' : 'bg-white dark:bg-slate-700 border-gray-200 dark:border-slate-600 hover:border-red-300'}`}>
                      <input type="checkbox" checked={permDelete} onChange={(e) => setPermDelete(e.target.checked)} className="sr-only" />
                      <div className={`p-2 rounded-lg ${permDelete ? 'bg-red-100 dark:bg-red-800' : 'bg-gray-100 dark:bg-slate-600'}`}>
                        <Trash2 className={`w-5 h-5 ${permDelete ? 'text-red-600 dark:text-red-400' : 'text-gray-400'}`} />
                      </div>
                      <span className={`text-sm font-semibold ${permDelete ? 'text-red-700 dark:text-red-300' : 'text-gray-500'}`}>حذف</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center">إزالة البيانات</span>
                    </label>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap shadow-lg">
                      ⚠️ حذف السجلات نهائياً - صلاحية حساسة
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
                      <span className={`text-sm font-semibold ${permFull ? 'text-purple-700 dark:text-purple-300' : 'text-gray-500'}`}>تحكم كامل</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center">كل الصلاحيات</span>
                    </label>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap shadow-lg">
                      جميع الصلاحيات + العمليات المتقدمة
                    </div>
                  </div>
                </div>

                {/* 🚀 Enterprise ERP: Action-Level Permissions */}
                {ADVANCED_ACTIONS_MAP[permResource] && ADVANCED_ACTIONS_MAP[permResource].length > 0 && (
                  <div className="mt-6 pt-4 border-t border-gray-100 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">الإجراءات المتقدمة (Action-Level Permissions):</p>
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 gap-1">
                        <Lock className="w-3 h-3" />
                        صلاحيات دقيقة
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
                            <span className="text-sm font-medium">{action.label}</span>
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
                    <span className="font-medium">💡 ملاحظات:</span>
                    <span className="mr-2">إلغاء "إظهار" يخفي الصفحة من القائمة.</span>
                    <span>"تحكم كامل" يفعّل جميع الصلاحيات تلقائياً.</span>
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
                  if (error) { setActionError(error.message || "تعذر الحفظ"); return }
                  const { data: perms } = await supabase
                    .from("company_role_permissions")
                    .select("id,role,resource,can_read,can_write,can_update,can_delete,all_access,can_access,allowed_actions")
                    .eq("company_id", companyId)
                    .eq("role", permRole)
                  setRolePerms(perms || [])
                  setActionError(null)
                  toastActionSuccess(toast, "حفظ", "الصلاحيات")

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
                حفظ الصلاحيات
              </Button>

              {/* عرض الصلاحيات المحفوظة - محسن */}
              <div className="space-y-4 mt-6">
                <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 rounded-xl border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 dark:bg-purple-800 rounded-lg">
                      <Shield className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">الصلاحيات المحفوظة</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">للدور: <Badge className={roleLabels[permRole]?.color || 'bg-gray-100'}>{roleLabels[permRole]?.ar || permRole}</Badge></p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {rolePerms.filter((p) => p.role === permRole).length} صلاحية
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
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400 font-medium">مخفي</span>
                                )}
                                {p.all_access && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-200 text-purple-700 dark:bg-purple-800 dark:text-purple-300 font-medium">تحكم كامل</span>
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
                                    if (matched) label = matched.label;
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
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${p.can_access !== false ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`} title="إظهار">
                                <Eye className="w-3 h-3" />
                                {p.can_access !== false ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              </div>
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${p.can_read ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`} title="قراءة">
                                <Eye className="w-3 h-3" />
                                {p.can_read ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              </div>
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${p.can_write ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`} title="كتابة">
                                <UserPlus className="w-3 h-3" />
                                {p.can_write ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              </div>
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${p.can_update ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`} title="تعديل">
                                <Edit className="w-3 h-3" />
                                {p.can_update ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              </div>
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${p.can_delete ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'}`} title="حذف">
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
                    <p className="text-base font-medium text-gray-600 dark:text-gray-400 mb-1">لا توجد صلاحيات مُحددة</p>
                    <p className="text-sm text-gray-500 dark:text-gray-500">اختر مورداً وحدد الصلاحيات ثم اضغط "حفظ الصلاحيات"</p>
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
                    <CardTitle className="text-base">نقل وفتح الصلاحيات</CardTitle>
                    <p className="text-xs text-gray-500 mt-1">نقل ملكية البيانات أو مشاركة الوصول بين الموظفين</p>
                  </div>
                </div>
                <Button
                  onClick={() => { setShowPermissionDialog(true); setPermissionAction('share') }}
                  className="gap-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                >
                  <Share2 className="w-4 h-4" />
                  إدارة الصلاحيات
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              <Tabs defaultValue="sharing" className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-4">
                  <TabsTrigger value="sharing" className="gap-2">
                    <Share2 className="w-4 h-4" />
                    المشاركات
                  </TabsTrigger>
                  <TabsTrigger value="transfers" className="gap-2">
                    <ArrowRightLeft className="w-4 h-4" />
                    النقل
                  </TabsTrigger>
                  <TabsTrigger value="branches" className="gap-2">
                    <GitBranch className="w-4 h-4" />
                    الفروع
                  </TabsTrigger>
                </TabsList>

                {/* الصلاحيات المشتركة */}
                <TabsContent value="sharing">
                  {permissionSharing.length > 0 ? (
                    <div className="space-y-2">
                      {permissionSharing.map((ps) => {
                        const grantor = members.find(m => m.user_id === ps.grantor_user_id)
                        const grantee = members.find(m => m.user_id === ps.grantee_user_id)
                        return (
                          <div key={ps.id} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                            <div className="flex items-center gap-3">
                              <Share2 className="w-4 h-4 text-green-600" />
                              <div>
                                <p className="text-sm font-medium">
                                  <span className="text-gray-700 dark:text-gray-300">{grantor?.display_name || grantor?.email || 'موظف'}</span>
                                  <span className="mx-2 text-gray-400">←</span>
                                  <span className="text-green-700 dark:text-green-400">{grantee?.display_name || grantee?.email || 'موظف'}</span>
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-[10px]">
                                    {ps.resource_type === 'all' ? 'الكل' : ps.resource_type === 'customers' ? 'العملاء' : 'أوامر البيع'}
                                  </Badge>
                                  {ps.can_edit && <Badge className="text-[10px] bg-amber-100 text-amber-700">تعديل</Badge>}
                                  {ps.is_active && <Badge className="text-[10px] bg-green-100 text-green-700">نشط</Badge>}
                                </div>
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={async () => {
                              await supabase.from("permission_sharing").update({ is_active: false }).eq("id", ps.id)
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
                      <Share2 className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">لا توجد صلاحيات مشتركة حالياً</p>
                    </div>
                  )}
                </TabsContent>

                {/* سجل النقل */}
                <TabsContent value="transfers">
                  {permissionTransfers.length > 0 ? (
                    <div className="space-y-2">
                      {permissionTransfers.map((pt) => {
                        const fromUser = members.find(m => m.user_id === pt.from_user_id)
                        const toUser = members.find(m => m.user_id === pt.to_user_id)
                        return (
                          <div key={pt.id} className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center gap-3">
                              <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                              <div>
                                <p className="text-sm font-medium">
                                  <span className="text-gray-700 dark:text-gray-300">{fromUser?.display_name || fromUser?.email || 'موظف'}</span>
                                  <span className="mx-2 text-blue-500">→</span>
                                  <span className="text-blue-700 dark:text-blue-400">{toUser?.display_name || toUser?.email || 'موظف'}</span>
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-[10px]">
                                    {pt.resource_type === 'all' ? 'الكل' : pt.resource_type === 'customers' ? 'العملاء' : 'أوامر البيع'}
                                  </Badge>
                                  <Badge className="text-[10px] bg-blue-100 text-blue-700">{pt.records_transferred} سجل</Badge>
                                  <span className="text-[10px] text-gray-500">{new Date(pt.transferred_at).toLocaleDateString('ar-EG')}</span>
                                </div>
                              </div>
                            </div>
                            <Badge className={pt.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
                              {pt.status === 'completed' ? 'مكتمل' : 'قيد التنفيذ'}
                            </Badge>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <ArrowRightLeft className="w-10 h-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">لا توجد عمليات نقل سابقة</p>
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
                                  {user?.display_name || user?.email || 'موظف'}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-[10px]">{branch?.name || 'فرع'}</Badge>
                                  {uba.is_primary && <Badge className="text-[10px] bg-purple-100 text-purple-700">رئيسي</Badge>}
                                  {uba.can_view_prices && <Badge className="text-[10px] bg-amber-100 text-amber-700">أسعار</Badge>}
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
                      <p className="text-sm">لا يوجد وصول متعدد للفروع</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* موديال إدارة الصلاحيات */}
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
                <Button
                  variant={permissionAction === 'branch_access' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPermissionAction('branch_access')}
                  className="flex-1 gap-2"
                >
                  <GitBranch className="w-4 h-4" />
                  فروع متعددة
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
                  <Label>الموظفين الهدف (يمكن اختيار أكثر من واحد)</Label>
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
                  <Label>الفروع (يمكن اختيار أكثر من فرع)</Label>
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
                        {b.is_main && <Badge className="text-[10px] bg-purple-100 text-purple-700">رئيسي</Badge>}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* نوع البيانات (للنقل والمشاركة) */}
              {permissionAction !== 'branch_access' && (
                <div className="space-y-2">
                  <Label>نوع البيانات</Label>
                  <Select value={selectedResourceType} onValueChange={setSelectedResourceType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">الكل (عملاء + أوامر بيع)</SelectItem>
                      <SelectItem value="customers">العملاء فقط</SelectItem>
                      <SelectItem value="sales_orders">أوامر البيع فقط</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* الفرع (للنقل فقط): نقل عملاء/أوامر فرع معين للموظف الجديد */}
              {permissionAction === 'transfer' && (
                <div className="space-y-2">
                  <Label>الفرع (اختياري)</Label>
                  <Select value={transferBranchId || "all_branches"} onValueChange={(v) => setTransferBranchId(v === "all_branches" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="الكل — نقل كل البيانات" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_branches">الكل — نقل كل البيانات</SelectItem>
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
                  <Label className="text-sm font-medium">صلاحيات إضافية</Label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={shareCanEdit} onCheckedChange={(c) => setShareCanEdit(!!c)} />
                      <span className="text-sm">تعديل</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={shareCanDelete} onCheckedChange={(c) => setShareCanDelete(!!c)} />
                      <span className="text-sm">حذف</span>
                    </label>
                  </div>
                </div>
              )}

              {/* تحذير للنقل */}
              {permissionAction === 'transfer' && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>⚠️ النقل سيغير ملكية البيانات نهائياً. الموظف المصدر سيفقد الوصول.</span>
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