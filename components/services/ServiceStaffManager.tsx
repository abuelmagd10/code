"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
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
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [isPrimary, setIsPrimary] = useState(false)
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

  const handleAdd = async () => {
    if (!selectedUserId) return
    setIsAdding(true)
    try {
      const res = await fetch(`/api/services/${serviceId}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_user_id: selectedUserId, is_primary: isPrimary }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "failed")
      toastActionSuccess(toast, t("تمت إضافة الموظف بنجاح", "Staff member added"))
      setSelectedUserId("")
      setIsPrimary(false)
      await loadStaff()
    } catch (err: any) {
      toastActionError(toast, t("خطأ", "Error"), err.message)
    } finally {
      setIsAdding(false)
    }
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

      {/* Add staff form */}
      {canEdit && (
        <div className="border border-dashed rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            {t("إضافة موظف", "Add Staff Member")}
          </p>
          <div className="flex gap-2">
            {availableEmployees.length > 0 ? (
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={t("اختر موظفاً...", "Select employee...")} />
                </SelectTrigger>
                <SelectContent>
                  {availableEmployees.map((e) => (
                    <SelectItem key={e.user_id} value={e.user_id}>
                      {e.display_name || e.email || e.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex-1 text-sm text-muted-foreground px-3 py-2 border rounded-md bg-muted/40">
                {t("جميع الموظفين مضافون بالفعل", "All employees already assigned")}
              </div>
            )}
            <Button
              onClick={handleAdd}
              disabled={!selectedUserId || isAdding}
              className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
              size="sm"
            >
              <UserPlus className="w-4 h-4" />
              {isAdding ? t("جاري الإضافة...", "Adding...") : t("إضافة", "Add")}
            </Button>
          </div>
          {availableEmployees.length > 0 && (
            <div className="flex items-center gap-2">
              <Switch
                id="is_primary"
                checked={isPrimary}
                onCheckedChange={setIsPrimary}
              />
              <Label htmlFor="is_primary" className="text-sm cursor-pointer">
                {t("موظف رئيسي", "Primary staff")}
              </Label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
