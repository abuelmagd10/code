import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient()
        const invoiceId = id

        // 1. Authentication & Company Context
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const companyId = await getActiveCompanyId(supabase)
        if (!companyId) {
            return NextResponse.json({ error: "Company context missing" }, { status: 400 })
        }

        // 2. Fetch invoice
        const { data: invoice } = await supabase
            .from('invoices')
            .select('invoice_number, branch_id, customer_id, paid_amount')
            .eq('id', invoiceId)
            .eq('company_id', companyId)
            .maybeSingle()

        if (!invoice) {
            return NextResponse.json({ success: false, error: "الفاتورة غير موجودة" }, { status: 404 })
        }

        // 3. Optional User Notes
        let notes: string | null = null;
        try {
            const body = await request.json()
            if (body && body.notes) {
                notes = body.notes;
            }
        } catch (e) {
            // No body provided, ignore
        }

        // 4. Call upgraded RPC (now handles Customer Credit internally)
        const { data: rpcData, error: rpcError } = await supabase.rpc('reject_sales_delivery', {
            p_invoice_id: invoiceId,
            p_confirmed_by: user.id,
            p_notes: notes
        })

        if (rpcError) {
            console.error("[WAREHOUSE_REJECT] RPC Error:", rpcError);
            return NextResponse.json({ success: false, error: rpcError.message }, { status: 400 })
        }

        if (!rpcData?.success) {
            return NextResponse.json({ success: false, error: rpcData?.error || 'Unknown error' }, { status: 400 })
        }

        const creditCreated: boolean = rpcData?.credit_created ?? false
        const creditAmount: number = rpcData?.credit_amount ?? 0

        // 5. Notify Accountant (always)
        try {
            const creditNote = creditCreated
                ? ` | تم تحويل ${creditAmount} إلى رصيد دائن للعميل.`
                : ''

            await supabase.rpc('create_notification', {
                p_company_id: companyId,
                p_reference_type: 'invoice',
                p_reference_id: invoiceId,
                p_title: 'تم رفض إخراج البضاعة من المخزن',
                p_message: `تم رفض إخراج البضاعة للفاتورة رقم (${invoice.invoice_number}) من قِبل مسؤول المخزن.${creditNote} ملاحظات: ${notes || 'لا يوجد'}`,
                p_created_by: user.id,
                p_branch_id: invoice.branch_id || null,
                p_cost_center_id: null,
                p_warehouse_id: null,
                p_assigned_to_role: 'accountant',
                p_assigned_to_user: null,
                p_priority: 'high',
                p_event_key: `invoice:${invoiceId}:warehouse_rejected:accountant`,
                p_severity: 'error',
                p_category: 'inventory'
            })
        } catch (notifErr: any) {
            console.warn('⚠️ [WAREHOUSE_REJECT] Accountant notification failed:', notifErr.message)
        }

        // 6. Notify Management (new — only if payment was involved)
        if (creditCreated) {
            try {
                await supabase.rpc('create_notification', {
                    p_company_id: companyId,
                    p_reference_type: 'invoice',
                    p_reference_id: invoiceId,
                    p_title: 'رفض تسليم فاتورة مدفوعة',
                    p_message: `الفاتورة رقم (${invoice.invoice_number}) كانت مدفوعة وتم رفض تسليمها من المخزن. تم تحويل مبلغ ${creditAmount} إلى رصيد دائن للعميل تلقائياً.`,
                    p_created_by: user.id,
                    p_branch_id: invoice.branch_id || null,
                    p_cost_center_id: null,
                    p_warehouse_id: null,
                    p_assigned_to_role: 'general_manager',
                    p_assigned_to_user: null,
                    p_priority: 'high',
                    p_event_key: `invoice:${invoiceId}:warehouse_rejected_paid:management`,
                    p_severity: 'warning',
                    p_category: 'finance'
                })
            } catch (notifErr: any) {
                console.warn('⚠️ [WAREHOUSE_REJECT] Management notification failed:', notifErr.message)
            }
        }

        return NextResponse.json({
            success: true,
            message: "تم رفض العملية بنجاح",
            credit_created: creditCreated,
            credit_amount: creditAmount
        })

    } catch (error: any) {
        console.error("Error in warehouse reject API:", error)
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 })
    }
}
