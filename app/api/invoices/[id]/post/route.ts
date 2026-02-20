
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { AccountingTransactionService } from "@/lib/accounting-transaction-service"
import { checkPeriodLock } from "@/lib/accounting-period-lock"

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

        // 2. Idempotency Key (Phase 2: Double Submission Protection)
        const idempotencyKey = request.headers.get('Idempotency-Key')

        // 3. جلب تاريخ الفاتورة للتحقق من Period Lock
        const { data: invoice } = await supabase
            .from('invoices')
            .select('invoice_date, status')
            .eq('id', invoiceId)
            .eq('company_id', companyId)
            .maybeSingle()

        if (!invoice) {
            return NextResponse.json({ success: false, error: "الفاتورة غير موجودة" }, { status: 404 })
        }

        if (invoice.status === 'posted') {
            return NextResponse.json({
                success: true,
                idempotent: true,
                message: "الفاتورة مُرحَّلة مسبقاً"
            })
        }

        // 4. Period Lock Check (Phase 2: يمنع الترحيل في فترة مقفلة)
        if (invoice.invoice_date) {
            const lockResult = await checkPeriodLock(supabase, {
                companyId,
                date: invoice.invoice_date
            })
            if (lockResult.isLocked) {
                return NextResponse.json({
                    success: false,
                    error: lockResult.error || `الفترة المحاسبية "${lockResult.periodName}" مقفلة`
                }, { status: 400 })
            }
        }

        // 5. Initialize Service
        const accountingService = new AccountingTransactionService(supabase)

        // 6. Execute Atomic Transaction
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
