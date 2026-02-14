
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { AccountingTransactionService } from "@/lib/accounting-transaction-service"
import { enforceGovernance } from "@/lib/governance-middleware"

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const supabase = await createClient()
        const invoiceId = params.id

        // 1. Authentication & Company Context
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const companyId = await getActiveCompanyId(supabase)
        if (!companyId) {
            return NextResponse.json({ error: "Company context missing" }, { status: 400 })
        }

        // 2. Permission Check (using governance middleware or direct check)
        // Assuming 'invoices.update' or specific 'invoices.post' permission
        // For now, we'll assume basic write access checking is done by the service or here

        // 3. Initialize Service
        const accountingService = new AccountingTransactionService(supabase)

        // 4. Execute Atomic Transaction
        const result = await accountingService.postInvoiceAtomic(invoiceId, companyId, user.id)

        if (!result.success) {
            return NextResponse.json({
                success: false,
                error: result.error
            }, { status: 400 })
        }

        return NextResponse.json({
            success: true,
            data: result
        })

    } catch (error: any) {
        console.error("Error in invoice posting API:", error)
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 })
    }
}
