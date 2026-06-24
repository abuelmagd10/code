"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MultiSelect } from "@/components/ui/multi-select"
import { Trash2, UserPlus, Star } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"

interface StaffMember {
  id: string          // service_staff record id
  employee_user_id: string
  is_primary: boolean
  display_name?: string
  email?: string
}

interface CompanyEmployee {
  user_id: string
  display_name: string
  email?: string
  role: string
  branch_id?: string | null
}

interface ServiceStaffManagerProps {
  serviceId: string
  // v3.74.333 — required for branch-scoped employee filtering.
  // Pass the service's branch_id so the picker only shows employees
  // from the same branch (mirrors the rule for products).
  serviceBranchId?: string | null
  lang?: string
  canEdit?: boolean
}

export function ServiceStaffManager({
  serviceId,
  serviceBranchId,
  lang = "ar",
  canEdit = true,
}: ServiceStaffManagerProps) {
  const isAr = lang !== "en"
  const t = (ar: string, en: string) => (isAr ? ar : en)
  const { toast } = useToast()

  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [employees, setEmployees] = useState<CompanyEmployee[]>([])
  const [isLoading, setIsLoading] = useState(true)
  // v3.74.336 — multi-select: pick several employees and add them in a batch
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const loadStaff = async () => {
    try {
      const res = await fetch(`/api/services/${serviceId}/staff`)
      if (!res.ok) throw new Error("failed")
      const json = await res.json()
      setStaffList(json.staff ?? [])
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }

  const loadEmployees = async () => {
    try {
      // Reuse company_members API to get employees
      const res = await fetch(`/api/company-members`)
      if (res.ok) {
        const json = await res.json()
        setEmployees(json.members ?? [])
      }
    } catch {
      // Fallback: empty, user can still manually select
    }
  }

  useEffect(() => {
    loadStaff()
    loadEmployees()
  }, [serviceId])

  // v3.74.336 — add a batch of employees in one click. Each one is
  // POSTed individually; we count failures and report a friendly
  // summary at the end. is_primary is intentionally NOT exposed in
  // multi-add (it only makes sense for a single row) — the owner can
  // toggle it later from a per-row action.
  const handleAdd = async () => {
    if (selectedUserIds.length === 0) return
    setIsAdding(true)
    let success = 0
    const failures: string[] = []
    for (const userId of selectedUserIds) {
      try {
        const res = await fetch(`/api/services/${serviceId}/staff`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employee_user_id: userId, is_primary: false }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "failed")
        success += 1
      } catch (err: any) {
        const emp = employees.find((e) => e.user_id === userId)
        failures.push(`${emp?.display_name || emp?.email || userId}: ${err.message}`)
      }
    }
    if (success > 0) {
      toastActionSuccess(
        toast,
        t(`تمت إضافة ${success} موظف`, `${success} staff member(s) added`),
        failures.length > 0
          ? t(`فشل ${failures.length} موظف`, `${failures.length} failed`)
          : undefined
      )
    }
    if (failures.length > 0 && success === 0) {
      toastActionError(toast, t("فشل الإضافة", "Add failed"), failures.join(" — "))
    }
    setSelectedUserIds([])
    await loadStaff()
    setIsAdding(false)
  }

  // v3.74.333 — DELETE expects employee_user_id (not staff_id). The UI
  // was sending the wrong param so removal silently 400-ed.
  const handleRemove = async (staffRecord: StaffMember) => {
    setRemovingId(staffRecord.id)
    try {
      const res = await fetch(
        `/api/services/${serviceId}/staff?employee_user_id=${encodeURIComponent(staffRecord.employee_user_id)}`,
        { method: "DELETE" }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "failed")
      toastActionSuccess(toast, t("تمت إزالة الموظف", "Staff member removed"))
      await loadStaff()
    } catch (err: any) {
      toastActionError(toast, t("خطأ", "Error"), err.message)
    } finally {
      setRemovingId(null)
    }
  }

  const assignedUserIds = new Set(staffList.map((s) => s.employee_user_id))
  // v3.74.333 — filter employees to the service's branch. NULL branch
  // (legacy services or company-level members) is treated as available.
  const branchScopedEmployees = serviceBranchId
    ? employees.filter((e) => !e.branch_id || e.branch_id === serviceBranchId)
    : employees
  const availableEmployees = branchScopedEmployees.filter((e) => !assignedUserIds.has(e.user_id))

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        {t("جاري التحميل...", "Loading...")}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Current staff list */}
      {staffList.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg">
          {t("لا يوجد موظفون مرتبطون بهذه الخدمة بعد", "No staff assigned to this service yet")}
        </div>
      ) : (
        <div className="space-y-2">
          {staffList.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-3 border rounded-lg bg-card"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-sm font-bold">
                  {(s.display_name || s.email || "?")[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {s.display_name || s.email || s.employee_user_id}
                  </p>
                  {s.email && s.display_name && (
                    <p className="text-xs text-muted-foreground">{s.email}</p>
                  )}
                </div>
                {s.is_primary && (
                  <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-0 text-xs flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    {t("رئيسي", "Primary")}
                  </Badge>
                )}
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  disabled={removingId === s.id}
                  onClick={() => handleRemove(s)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* v3.74.336 — Add staff form (multi-select) */}
      {canEdit && (
        <div className="border border-dashed rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            {t("إضافة موظفين (اختيار متعدد)", "Add Staff Members (Multi-select)")}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            {availableEmployees.length > 0 ? (
              <div className="flex-1">
                <MultiSelect
                  options={availableEmployees.map((e) => ({
                    value: e.user_id,
                    label: e.display_name || e.email || e.user_id,
                  }))}
                  selected={selectedUserIds}
                  onChange={setSelectedUserIds}
                  placeholder={t("اختر موظف أو أكثر...", "Pick one or more employees...")}
                  emptyMessage={t("لا توجد نتائج", "No results found.")}
                  searchPlaceholder={t("بحث بالاسم...", "Search by name...")}
                  maxDisplay={3}
                />
              </div>
            ) : (
              <div className="flex-1 text-sm text-muted-foreground px-3 py-2 border rounded-md bg-muted/40">
                {t("جميع الموظفين مضافون بالفعل", "All employees already assigned")}
              </div>
            )}
            <Button
              onClick={handleAdd}
              disabled={selectedUserIds.length === 0 || isAdding}
              className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
              size="sm"
            >
              <UserPlus className="w-4 h-4" />
              {isAdding
                ? t("جاري الإضافة...", "Adding...")
                : selectedUserIds.length > 1
                  ? t(`إضافة ${selectedUserIds.length}`, `Add ${selectedUserIds.length}`)
                  : t("إضافة", "Add")
              }
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "💡 اختر أكتر من موظف للإضافة دفعة واحدة. اترك بدون اختيار لتترك الخدمة متاحة لجميع موظفى الفرع.",
              "💡 Pick several employees to add in one batch. Leave empty to keep the service open to every employee in the branch."
            )}
          </p>
        </div>
      )}
    </div>
  )
}
