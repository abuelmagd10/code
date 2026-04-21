import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/company"
import { FinancialDocumentNotificationService } from "@/lib/services/financial-document-notification.service"
import { createClient } from "@/lib/supabase/server"

type VendorCreditNotificationAction = "created"

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

    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || "") as VendorCreditNotificationAction
    const appLang = body?.appLang === "en" ? "en" : "ar"

    if (action !== "created") {
      return NextResponse.json({ success: false, error: "Unsupported notification action" }, { status: 400 })
    }

    const { data: vendorCredit, error: vendorCreditError } = await supabase
      .from("vendor_credits")
      .select("id")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle()

    if (vendorCreditError || !vendorCredit) {
      return NextResponse.json({ success: false, error: "Vendor credit not found" }, { status: 404 })
    }

    const notificationService = new FinancialDocumentNotificationService(supabase)
    await notificationService.notifyVendorCreditCreated({
      companyId,
      actorUserId: user.id,
      vendorCreditId: id,
      appLang,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error dispatching vendor-credit notification:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to dispatch vendor-credit notification" },
      { status: 500 }
    )
  }
}
