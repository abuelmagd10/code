import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/company"
import { FinancialDocumentNotificationService } from "@/lib/services/financial-document-notification.service"
import { createClient } from "@/lib/supabase/server"

type CustomerDebitNoteNotificationAction = "created"

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
    const action = String(body?.action || "") as CustomerDebitNoteNotificationAction
    const appLang = body?.appLang === "en" ? "en" : "ar"

    if (action !== "created") {
      return NextResponse.json({ success: false, error: "Unsupported notification action" }, { status: 400 })
    }

    const { data: debitNote, error: debitNoteError } = await supabase
      .from("customer_debit_notes")
      .select("id")
      .eq("company_id", companyId)
      .eq("id", id)
      .maybeSingle()

    if (debitNoteError || !debitNote) {
      return NextResponse.json({ success: false, error: "Customer debit note not found" }, { status: 404 })
    }

    const notificationService = new FinancialDocumentNotificationService(supabase)
    await notificationService.notifyCustomerDebitNoteCreated({
      companyId,
      actorUserId: user.id,
      debitNoteId: id,
      appLang,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error dispatching customer-debit-note notification:", error)
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to dispatch customer-debit-note notification" },
      { status: 500 }
    )
  }
}
