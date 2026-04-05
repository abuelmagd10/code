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

        // 2. Fetch invoice to get basic info for the notification
        const { data: invoice } = await supabase
            .from('invoices')
            .select('invoice_number, branch_id', { count: 'exact' })
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

        // 4. Call RPC
        const { data: rpcData, error: rpcError } = await supabase.rpc('approve_sales_delivery', {
            p_invoice_id: invoiceId,
            p_confirmed_by: user.id,
            p_notes: notes
        })

        if (rpcError) {
            console.error("[WAREHOUSE_APPROVE] RPC Error:", rpcError);
            return NextResponse.json({ success: false, error: rpcError.message }, { status: 400 })
        }

        if (!rpcData?.success) {
            return NextResponse.json({ success: false, error: rpcData?.error || 'Unknown error' }, { status: 400 })
        }

        // 5. Notify Accountant
        try {
            const { error: notifErr } = await supabase.rpc('create_notification', {
                p_company_id: companyId,
                p_reference_type: 'invoice',
                p_reference_id: invoiceId,
                p_title: 'تم إخراج البضاعة',
                p_message: `تم اعتماد إخراج البضاعة للفاتورة رقم (${invoice?.invoice_number}) من قِبل مسؤول المخزن`,
                p_created_by: user.id,
                p_branch_id: invoice?.branch_id || null,
                p_cost_center_id: null,
                p_warehouse_id: null,
                p_assigned_to_role: 'accountant',
                p_assigned_to_user: null,
                p_priority: 'normal',
                p_event_key: `invoice:${invoiceId}:warehouse_approved:accountant`,
                p_severity: 'success',
                p_category: 'inventory'
            })
            if (notifErr) {
                console.warn('⚠️ [WAREHOUSE_APPROVE] Notification failed:', notifErr.message)
            }
        } catch (notifErr: any) {
            console.warn('⚠️ [WAREHOUSE_APPROVE] Notification failed:', notifErr.message)
        }

        return NextResponse.json({
            success: true,
            message: "تم اعتماد إخراج البضاعة بنجاح"
        })

    } catch (error: any) {
        console.error("Error in warehouse approve API:", error)
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 })
    }
}
