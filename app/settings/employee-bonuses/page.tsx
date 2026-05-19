"use client"
/**
 * Per-Employee Bonus Configuration Page (Phase 4-B)
 *
 * Lists all active employees with their bonus configuration overrides.
 * Empty config rows mean "use company defaults".
 *
 * Permissions: owner / admin only (enforced by API).
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { ArrowLeft, Coins, Pencil, RotateCcw, Save, Loader2, Eye } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"

interface Employee {
  id: string
  user_id: string | null
  full_name: string
  email: string | null
  job_title: string | null
  department: string | null
}

interface BonusConfig {
  id?: string
  user_id: string
  employee_id?: string | null
  bonus_enabled: boolean | null
  bonus_type: "percentage" | "fixed" | "points" | null
  bonus_percentage: number | null
  bonus_fixed_amount: number | null
  bonus_points_per_value: number | null
  bonus_daily_cap: number | null
  bonus_monthly_cap: number | null
  bonus_payout_mode: "immediate" | "payroll" | null
  is_active: boolean
  notes: string | null
}

interface ConfigWithEmployee extends BonusConfig {
  id: string
  created_at: string
  updated_at: string
  employees: Employee | null
}

export default function EmployeeBonusesPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [language, setLanguage] = useState<"ar" | "en">("ar")
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string>("")
  const [employees, setEmployees] = useState<Employee[]>([])
  const [configs, setConfigs] = useState<ConfigWithEmployee[]>([])
  const [editing, setEditing] = useState<BonusConfig | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [isCompanyOwner, setIsCompanyOwner] = useState(false)

  useEffect(() => {
    try {
      setLanguage(localStorage.getItem("app_language") === "en" ? "en" : "ar")
    } catch {}
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return
      setCompanyId(cid)

      // Check role
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: company } = await supabase
          .from("companies")
          .select("user_id")
          .eq("id", cid)
          .single()
        const { data: member } = await supabase
          .from("company_members")
          .select("role")
          .eq("company_id", cid)
          .eq("user_id", user.id)
          .maybeSingle()
        setIsCompanyOwner(
          company?.user_id === user.id || member?.role === "owner" || member?.role === "admin"
        )
      }

      // Load employees (active only) with their user_id
      const { data: emps } = await supabase
        .from("employees")
        .select("id, user_id, full_name, email, job_title, department")
        .eq("company_id", cid)
        .not("user_id", "is", null)
        .order("full_name")

      setEmployees((emps as Employee[]) || [])

      // Load existing configs
      const res = await fetch("/api/employee-bonus-configs")
      if (res.ok) {
        const json = await res.json()
        setConfigs((json?.data?.configs || json?.configs || []) as ConfigWithEmployee[])
      }
    } catch (err) {
      console.error("[EmployeeBonuses] load error:", err)
    } finally {
      setLoading(false)
    }
  }

  // Map user_id → existing config (if any)
  const configByUserId = useMemo(() => {
    const m = new Map<string, ConfigWithEmployee>()
    for (const c of configs) m.set(c.user_id, c)
    return m
  }, [configs])

  const openEditor = (emp: Employee) => {
    if (!emp.user_id) return
    const existing = configByUserId.get(emp.user_id)
    setEditing(
      existing
        ? { ...existing }
        : {
            user_id: emp.user_id,
            employee_id: emp.id,
            bonus_enabled: null,
            bonus_type: null,
            bonus_percentage: null,
            bonus_fixed_amount: null,
            bonus_points_per_value: null,
            bonus_daily_cap: null,
            bonus_monthly_cap: null,
            bonus_payout_mode: null,
            is_active: true,
            notes: null,
          }
    )
  }

  const closeEditor = () => setEditing(null)

  const saveConfig = async () => {
    if (!editing || !isCompanyOwner) return
    setSavingId(editing.user_id)
    try {
      const res = await fetch("/api/employee-bonus-configs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toastActionError(
          toast,
          language === "en" ? "Save" : "حفظ",
          language === "en" ? "Employee Bonus" : "بونص الموظف",
          body?.message || body?.error || `HTTP ${res.status}`
        )
        return
      }
      toastActionSuccess(
        toast,
        language === "en" ? "Save" : "حفظ",
        language === "en" ? "Employee Bonus" : "بونص الموظف"
      )
      closeEditor()
      await loadData()
    } catch (e: any) {
      toastActionError(
        toast,
        language === "en" ? "Save" : "حفظ",
        language === "en" ? "Employee Bonus" : "بونص الموظف",
        e?.message
      )
    } finally {
      setSavingId(null)
    }
  }

  const removeConfig = async (userId: string) => {
    if (!isCompanyOwner) return
    setSavingId(userId)
    try {
      const res = await fetch(`/api/employee-bonus-configs?userId=${userId}`, { method: "DELETE" })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toastActionError(
          toast,
          language === "en" ? "Reset" : "إعادة تعيين",
          language === "en" ? "Employee Bonus" : "بونص الموظف",
          body?.message || `HTTP ${res.status}`
        )
        return
      }
      toastActionSuccess(
        toast,
        language === "en" ? "Reset" : "إعادة تعيين",
        language === "en" ? "Employee Bonus" : "بونص الموظف"
      )
      await loadData()
    } catch (e: any) {
      toastActionError(
        toast,
        language === "en" ? "Reset" : "إعادة تعيين",
        language === "en" ? "Employee Bonus" : "بونص الموظف",
        e?.message
      )
    } finally {
      setSavingId(null)
    }
  }

  const fmt = (v: number | null, suffix = "") =>
    v == null ? <span className="text-muted-foreground text-xs">{language === "en" ? "default" : "افتراضي"}</span> : `${v}${suffix}`

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/settings">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              {language === "en" ? "Back" : "رجوع"}
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Coins className="w-6 h-6 text-emerald-600" />
            <h1 className="text-2xl font-bold">
              {language === "en" ? "Per-Employee Bonus Configuration" : "إعدادات بونص الموظفين"}
            </h1>
          </div>
        </div>
        {!isCompanyOwner && (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
            <Eye className="w-3 h-3 mr-1" />
            {language === "en" ? "View only" : "عرض فقط"}
          </Badge>
        )}
      </div>

      <Card className="border-blue-200 bg-blue-50/40 dark:bg-blue-900/10">
        <CardContent className="pt-4 text-sm text-blue-800 dark:text-blue-200">
          {language === "en"
            ? "Fields left empty inherit from the company-level bonus settings. Set is_active=false to suspend an override without deleting it. The bonus goes to the sales order creator (or invoice creator if no sales order exists)."
            : "الحقول الفارغة ترث من إعدادات بونص الشركة العامة. اجعل is_active=false لتعليق إعداد بدون حذفه. البونص يذهب لمنشئ أمر البيع (أو الفاتورة إن لم يوجد أمر بيع)."}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {language === "en"
              ? `Employees (${employees.length})`
              : `الموظفون (${employees.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              {language === "en" ? "Loading..." : "جاري التحميل..."}
            </div>
          ) : employees.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              {language === "en"
                ? "No employees with linked user accounts found."
                : "لا يوجد موظفون مرتبطون بحسابات مستخدمين."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{language === "en" ? "Employee" : "الموظف"}</TableHead>
                    <TableHead>{language === "en" ? "Job Title" : "المسمى الوظيفي"}</TableHead>
                    <TableHead>{language === "en" ? "Status" : "الحالة"}</TableHead>
                    <TableHead>{language === "en" ? "Type" : "النوع"}</TableHead>
                    <TableHead>{language === "en" ? "Rate" : "النسبة"}</TableHead>
                    <TableHead>{language === "en" ? "Monthly Cap" : "حد شهري"}</TableHead>
                    <TableHead>{language === "en" ? "Actions" : "إجراءات"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((emp) => {
                    const cfg = emp.user_id ? configByUserId.get(emp.user_id) : undefined
                    const isCustom = !!cfg
                    return (
                      <TableRow key={emp.id}>
                        <TableCell>
                          <div className="font-medium">{emp.full_name}</div>
                          {emp.email && (
                            <div className="text-xs text-muted-foreground">{emp.email}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {emp.job_title || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isCustom ? (
                            <Badge
                              variant="outline"
                              className={
                                cfg?.is_active
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                  : "bg-gray-50 text-gray-600 border-gray-300"
                              }
                            >
                              {cfg?.is_active
                                ? language === "en"
                                  ? "Custom"
                                  : "مخصص"
                                : language === "en"
                                ? "Suspended"
                                : "معلق"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              {language === "en" ? "Default" : "افتراضي"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {cfg?.bonus_type || (
                            <span className="text-muted-foreground">
                              {language === "en" ? "default" : "افتراضي"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {cfg?.bonus_type === "percentage"
                            ? fmt(cfg.bonus_percentage, "%")
                            : cfg?.bonus_type === "fixed"
                            ? fmt(cfg.bonus_fixed_amount)
                            : cfg?.bonus_type === "points"
                            ? fmt(cfg.bonus_points_per_value, " pts")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{cfg ? fmt(cfg.bonus_monthly_cap) : "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditor(emp)}
                              disabled={!isCompanyOwner || !emp.user_id}
                            >
                              <Pencil className="w-3 h-3 mr-1" />
                              {language === "en" ? "Edit" : "تعديل"}
                            </Button>
                            {isCustom && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={!isCompanyOwner || savingId === emp.user_id}
                                  >
                                    <RotateCcw className="w-3 h-3 mr-1" />
                                    {language === "en" ? "Reset" : "إعادة"}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      {language === "en" ? "Reset to default?" : "إعادة للافتراضي؟"}
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {language === "en"
                                        ? `This removes ${emp.full_name}'s custom bonus configuration. They will use the company-level defaults.`
                                        : `سيُحذف الإعداد المخصص لـ ${emp.full_name} وسيستخدم إعدادات الشركة العامة.`}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      {language === "en" ? "Cancel" : "إلغاء"}
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => emp.user_id && removeConfig(emp.user_id)}
                                    >
                                      {language === "en" ? "Confirm" : "تأكيد"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Editor Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && closeEditor()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {language === "en" ? "Edit Employee Bonus" : "تعديل بونص الموظف"}
            </DialogTitle>
            <DialogDescription>
              {language === "en"
                ? "Leave any field empty to inherit from company defaults."
                : "اترك أي حقل فارغ ليرث من إعدادات الشركة."}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="is_active">
                  {language === "en" ? "Configuration active" : "الإعداد مُفعَّل"}
                </Label>
                <Switch
                  id="is_active"
                  checked={editing.is_active}
                  onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="bonus_enabled">
                  {language === "en" ? "Bonus enabled for this employee" : "البونص مُفعَّل لهذا الموظف"}
                </Label>
                <Select
                  value={
                    editing.bonus_enabled == null
                      ? "_default"
                      : editing.bonus_enabled
                      ? "true"
                      : "false"
                  }
                  onValueChange={(v) =>
                    setEditing({
                      ...editing,
                      bonus_enabled: v === "_default" ? null : v === "true",
                    })
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_default">
                      {language === "en" ? "Use default" : "افتراضي"}
                    </SelectItem>
                    <SelectItem value="true">{language === "en" ? "Enabled" : "مفعَّل"}</SelectItem>
                    <SelectItem value="false">
                      {language === "en" ? "Disabled" : "معطَّل"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{language === "en" ? "Bonus Type" : "نوع البونص"}</Label>
                <Select
                  value={editing.bonus_type ?? "_default"}
                  onValueChange={(v) =>
                    setEditing({ ...editing, bonus_type: v === "_default" ? null : (v as any) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_default">
                      {language === "en" ? "Use company default" : "افتراضي الشركة"}
                    </SelectItem>
                    <SelectItem value="percentage">
                      {language === "en" ? "Percentage" : "نسبة مئوية"}
                    </SelectItem>
                    <SelectItem value="fixed">{language === "en" ? "Fixed amount" : "مبلغ ثابت"}</SelectItem>
                    <SelectItem value="points">{language === "en" ? "Points" : "نقاط"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editing.bonus_type === "percentage" && (
                <div className="space-y-1">
                  <Label>{language === "en" ? "Percentage (%)" : "النسبة المئوية (%)"}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editing.bonus_percentage ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        bonus_percentage: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
              )}
              {editing.bonus_type === "fixed" && (
                <div className="space-y-1">
                  <Label>{language === "en" ? "Fixed amount" : "المبلغ الثابت"}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editing.bonus_fixed_amount ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        bonus_fixed_amount: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
              )}
              {editing.bonus_type === "points" && (
                <div className="space-y-1">
                  <Label>{language === "en" ? "Points per value" : "النقاط لكل قيمة"}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editing.bonus_points_per_value ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        bonus_points_per_value: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{language === "en" ? "Daily cap" : "حد يومي"}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder={language === "en" ? "default" : "افتراضي"}
                    value={editing.bonus_daily_cap ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        bonus_daily_cap: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>{language === "en" ? "Monthly cap" : "حد شهري"}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder={language === "en" ? "default" : "افتراضي"}
                    value={editing.bonus_monthly_cap ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        bonus_monthly_cap: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{language === "en" ? "Payout mode" : "وضع الدفع"}</Label>
                <Select
                  value={editing.bonus_payout_mode ?? "_default"}
                  onValueChange={(v) =>
                    setEditing({
                      ...editing,
                      bonus_payout_mode: v === "_default" ? null : (v as any),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_default">
                      {language === "en" ? "Use company default" : "افتراضي الشركة"}
                    </SelectItem>
                    <SelectItem value="immediate">
                      {language === "en" ? "Immediate" : "فوري"}
                    </SelectItem>
                    <SelectItem value="payroll">{language === "en" ? "With payroll" : "مع الراتب"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{language === "en" ? "Notes" : "ملاحظات"}</Label>
                <Input
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value || null })}
                  placeholder={
                    language === "en" ? "Optional context for this override" : "سبب اختياري"
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeEditor}>
              {language === "en" ? "Cancel" : "إلغاء"}
            </Button>
            <Button
              onClick={saveConfig}
              disabled={!isCompanyOwner || savingId === editing?.user_id}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Save className="w-4 h-4 mr-1" />
              {savingId === editing?.user_id
                ? language === "en"
                  ? "Saving..."
                  : "جاري الحفظ..."
                : language === "en"
                ? "Save"
                : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
