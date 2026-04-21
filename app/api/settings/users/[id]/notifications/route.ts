import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/company"
import { createClient } from "@/lib/supabase/server"
import { UserGovernanceNotificationService } from "@/lib/services/user-governance-notification.service"

type SettingsUserNotificationAction = "role_changed" | "branch_changed"

const ALLOWED_ROLES = ["owner", "admin", "general_manager", "manager"]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)

    if (!companyId) {
      return NextResponse.json({ success: false, error: "Company not found" }, { status: 400 })
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { data: company } = await supabase
      .from("companies")
      .select("user_id")
      .eq("id", companyId)
      .maybeSingle()

    const { data: actorMember } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()

    const actorRole = company?.user_id === user.id ? "owner" : String(actorMember?.role || "")
    if (!ALLOWED_ROLES.includes(actorRole)) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || "") as SettingsUserNotificationAction
    const appLang = body?.appLang === "en" ? "en" : "ar"

    if (!["role_changed", "branch_changed"].includes(action)) {
      return NextResponse.json({ success: false, error: "Unsupported notification action" }, { status: 400 })
    }

    const { data: member, error: memberError } = await supabase
      .from("company_members")
      .select("user_id, role, branch_id, cost_center_id, warehouse_id")
      .eq("company_id", companyId)
      .eq("user_id", id)
      .maybeSingle()

    if (memberError || !member) {
      return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 })
    }

    const notificationService = new UserGovernanceNotificationService(supabase)

    if (action === "role_changed") {
      const oldRole = String(body?.oldRole || "").trim()
      const newRole = String(body?.newRole || "").trim()

      if (!oldRole || !newRole) {
        return NextResponse.json({ success: false, error: "Old role and new role are required" }, { status: 400 })
      }

      if (String(member.role || "").trim() !== newRole) {
        return NextResponse.json(
          { success: false, error: "Member role does not match the requested notification payload" },
          { status: 409 }
        )
      }

      await notificationService.notifyRoleChanged({
        companyId,
        changedBy: user.id,
        userId: id,
        oldRole,
        newRole,
        branchId: member.branch_id,
        warehouseId: member.warehouse_id,
        costCenterId: member.cost_center_id,
        appLang,
      })

      return NextResponse.json({ success: true })
    }

    const branchId = body?.branchId ? String(body.branchId) : null
    if (!branchId) {
      return NextResponse.json({ success: false, error: "Branch id is required" }, { status: 400 })
    }

    if ((member.branch_id || null) !== branchId) {
      return NextResponse.json(
        { success: false, error: "Member branch does not match the requested notification payload" },
        { status: 409 }
      )
    }

    const { data: branch } = await supabase
      .from("branches")
      .select("name")
      .eq("company_id", companyId)
      .eq("id", branchId)
      .maybeSingle()

    await notificationService.notifyBranchChanged({
      companyId,
      changedBy: user.id,
      userId: id,
      branchId,
      branchName: branch?.name || null,
      role: member.role,
      warehouseId: member.warehouse_id,
      costCenterId: member.cost_center_id,
      appLang,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error dispatching settings-user notification:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to dispatch settings-user notification" },
      { status: 500 }
    )
  }
}
