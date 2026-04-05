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
            .select('invoice_number, branch_id, customer_id, paid_amount, created_by_user_id, posted_by_user_id')
            .eq('id', invoiceId)
            .eq('company_id', companyId)
            .maybeSingle()

        if (!invoice) {
            return NextResponse.json({ success: false, error: "الفاتورة غير موجودة" }, { status: 404 })
        }

        // من سيستلم إشعار الرفض: تفضيل posted_by (من رحّل الفاتورة)، وإلا created_by (fallback)
        const invoiceSenderId = invoice.posted_by_user_id || invoice.created_by_user_id

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
        const revertedToDraft: boolean = rpcData?.reverted_to_draft ?? false

        // ================================================================
        // 5. SCENARIO A — Reverted to Draft (unpaid invoice)
        // ================================================================
        if (revertedToDraft) {
            const nowTs = Date.now()

            // A1. إشعار محاسب الفرع (Accountant)
            try {
                await supabase.rpc('create_notification', {
                    p_company_id: companyId,
                    p_reference_type: 'invoice',
                    p_reference_id: invoiceId,
                    p_title: 'تم إرجاع الفاتورة إلى مسودة',
                    p_message: `تم إرجاع الفاتورة رقم (${invoice.invoice_number}) إلى حالة المسودة بسبب رفض مسؤول المخزن إخراج البضاعة. لا توجد دفعات مسجلة — لا يوجد أي تأثير محاسبي. ملاحظات: ${notes || 'لا يوجد'}`,
                    p_created_by: user.id,
                    p_branch_id: invoice.branch_id || null,
                    p_cost_center_id: null,
                    p_warehouse_id: null,
                    p_assigned_to_role: 'accountant',
                    p_assigned_to_user: null,
                    p_priority: 'medium',
                    p_event_key: `invoice:${invoiceId}:warehouse_rejected_draft:accountant:${nowTs}`,
                    p_severity: 'warning',
                    p_category: 'inventory'
                })
            } catch (notifErr: any) {
                console.warn('⚠️ [WAREHOUSE_REJECT] Accountant draft-revert notification failed:', notifErr.message)
            }

            // A2. إشعار شخصي لمُرسِل الفاتورة (invoiceSenderId = posted_by أو created_by)
            if (invoiceSenderId) {
                try {
                    await supabase.rpc('create_notification', {
                        p_company_id: companyId,
                        p_reference_type: 'invoice',
                        p_reference_id: invoiceId,
                        p_title: 'رفض المخزن إخراج بضاعة فاتورتك',
                        p_message: `تم رفض إخراج بضاعة الفاتورة رقم (${invoice.invoice_number}) من قِبل مسؤول المخزن. الفاتورة لم تكن مدفوعة وتم إرجاعها إلى مسودة تلقائياً. سبب الرفض: ${notes || 'لم يتم تحديد سبب'}. يمكنك مراجعة الفاتورة وإعادة إرسالها.`,
                        p_created_by: user.id,
                        p_branch_id: invoice.branch_id || null,
                        p_cost_center_id: null,
                        p_warehouse_id: null,
                        p_assigned_to_role: null,
                        p_assigned_to_user: invoiceSenderId,
                        p_priority: 'high',
                        p_event_key: `invoice:${invoiceId}:warehouse_rejected_draft:sender:${nowTs}`,
                        p_severity: 'error',
                        p_category: 'inventory'
                    })
                } catch (notifErr: any) {
                    console.warn('⚠️ [WAREHOUSE_REJECT] Sender draft-revert notification failed:', notifErr.message)
                }
            }

            // A3. إشعار الأدوار العليا (Owner / General Manager)
            try {
                await supabase.rpc('create_notification', {
                    p_company_id: companyId,
                    p_reference_type: 'invoice',
                    p_reference_id: invoiceId,
                    p_title: 'رفض تسليم فاتورة — إرجاع إلى مسودة',
                    p_message: `تم رفض تسليم الفاتورة رقم (${invoice.invoice_number}) من قِبل مسؤول المخزن. الفاتورة لم تكن مدفوعة وتم إرجاعها إلى مسودة تلقائياً بدون تأثير محاسبي. سبب الرفض: ${notes || 'لم يتم تحديد سبب'}`,
                    p_created_by: user.id,
                    p_branch_id: invoice.branch_id || null,
                    p_cost_center_id: null,
                    p_warehouse_id: null,
                    p_assigned_to_role: 'owner',
                    p_assigned_to_user: null,
                    p_priority: 'medium',
                    p_event_key: `invoice:${invoiceId}:warehouse_rejected_draft:owner:${nowTs}`,
                    p_severity: 'info',
                    p_category: 'inventory'
                })
            } catch (notifErr: any) {
                console.warn('⚠️ [WAREHOUSE_REJECT] Owner draft-revert notification failed:', notifErr.message)
            }

            return NextResponse.json({
                success: true,
                message: 'تم رفض التسليم وإرجاع الفاتورة إلى مسودة (لا توجد دفعات — لا تأثير محاسبي)',
                reverted_to_draft: true,
                credit_created: false,
                credit_amount: 0
            })
        }

        // ================================================================
        // 6. SCENARIO B — Rejected with Customer Credit (paid invoice)
        // ================================================================
        const nowTsB = Date.now()

        // B1. إشعار محاسب الفرع (Accountant)
        try {
            await supabase.rpc('create_notification', {
                p_company_id: companyId,
                p_reference_type: 'invoice',
                p_reference_id: invoiceId,
                p_title: 'تم رفض إخراج البضاعة — رصيد دائن للعميل',
                p_message: `تم رفض إخراج البضاعة للفاتورة رقم (${invoice.invoice_number}) من قِبل مسؤول المخزن. تم تحويل مبلغ ${creditAmount} إلى رصيد دائن للعميل تلقائياً. ملاحظات: ${notes || 'لا يوجد'}`,
                p_created_by: user.id,
                p_branch_id: invoice.branch_id || null,
                p_cost_center_id: null,
                p_warehouse_id: null,
                p_assigned_to_role: 'accountant',
                p_assigned_to_user: null,
                p_priority: 'high',
                p_event_key: `invoice:${invoiceId}:warehouse_rejected:accountant:${nowTsB}`,
                p_severity: 'error',
                p_category: 'inventory'
            })
        } catch (notifErr: any) {
            console.warn('⚠️ [WAREHOUSE_REJECT] Accountant notification failed:', notifErr.message)
        }

        // B2. إشعار شخصي لمُرسِل الفاتورة (invoiceSenderId = posted_by أو created_by)
        if (invoiceSenderId) {
            try {
                await supabase.rpc('create_notification', {
                    p_company_id: companyId,
                    p_reference_type: 'invoice',
                    p_reference_id: invoiceId,
                    p_title: 'رفض المخزن إخراج بضاعة فاتورتك المدفوعة',
                    p_message: `تم رفض إخراج بضاعة الفاتورة رقم (${invoice.invoice_number}) من قِبل مسؤول المخزن. الفاتورة كانت مدفوعة جزئياً مبلغ ${creditAmount} وتم تحويل هذا المبلغ إلى رصيد دائن للعميل. سبب الرفض: ${notes || 'لم يتم تحديد سبب'}.`,
                    p_created_by: user.id,
                    p_branch_id: invoice.branch_id || null,
                    p_cost_center_id: null,
                    p_warehouse_id: null,
                    p_assigned_to_role: null,
                    p_assigned_to_user: invoiceSenderId,
                    p_priority: 'high',
                    p_event_key: `invoice:${invoiceId}:warehouse_rejected:sender:${nowTsB}`,
                    p_severity: 'error',
                    p_category: 'inventory'
                })
            } catch (notifErr: any) {
                console.warn('⚠️ [WAREHOUSE_REJECT] Sender notification failed:', notifErr.message)
            }
        }

        // B3. إشعار الأدوار العليا (Owner)
        try {
            await supabase.rpc('create_notification', {
                p_company_id: companyId,
                p_reference_type: 'invoice',
                p_reference_id: invoiceId,
                p_title: 'رفض تسليم فاتورة مدفوعة',
                p_message: `الفاتورة رقم (${invoice.invoice_number}) كانت مدفوعة جزئياً (${creditAmount}) وتم رفض تسليمها من المخزن. تم تحويل مبلغ الدفعة إلى رصيد دائن للعميل تلقائياً. سبب الرفض: ${notes || 'لم يتم تحديد سبب'}`,
                p_created_by: user.id,
                p_branch_id: invoice.branch_id || null,
                p_cost_center_id: null,
                p_warehouse_id: null,
                p_assigned_to_role: 'owner',
                p_assigned_to_user: null,
                p_priority: 'high',
                p_event_key: `invoice:${invoiceId}:warehouse_rejected_paid:owner:${nowTsB}`,
                p_severity: 'warning',
                p_category: 'finance'
            })
        } catch (notifErr: any) {
            console.warn('⚠️ [WAREHOUSE_REJECT] Owner notification failed:', notifErr.message)
        }

        return NextResponse.json({
            success: true,
            message: 'تم رفض التسليم وتحويل الدفعة إلى رصيد دائن للعميل',
            reverted_to_draft: false,
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
