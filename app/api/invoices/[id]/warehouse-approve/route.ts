import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { AccountingTransactionService } from "@/lib/accounting-transaction-service"
import { buildFinancialRequestHash, resolveFinancialIdempotencyKey } from "@/lib/financial-operation-utils"
import { emitEvent } from "@/lib/event-bus"
import { enterpriseFinanceFlags } from "@/lib/enterprise-finance-flags"

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
            .select('invoice_number, branch_id, warehouse_status, approval_status')
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

        const idempotencyKey = resolveFinancialIdempotencyKey(
            request.headers.get('Idempotency-Key'),
            ['warehouse-approval', companyId, invoiceId]
        )
        const requestHash = buildFinancialRequestHash({
            invoiceId,
            companyId,
            actorId: user.id,
            notes: notes || null,
        })

        // 4. Call atomic service / RPC
        const accountingService = new AccountingTransactionService(supabase as any)
        const approvalResult = await accountingService.approveSalesDeliveryAtomic({
            invoiceId,
            companyId,
            confirmedBy: user.id,
            notes,
        }, {
            idempotencyKey,
            requestHash,
        })

        if (!approvalResult.success) {
            console.error("[WAREHOUSE_APPROVE] Atomic Error:", approvalResult.error)
            return NextResponse.json({ success: false, error: approvalResult.error || 'Unknown error' }, { status: 400 })
        }

        if (enterpriseFinanceFlags.observabilityEvents) {
            await emitEvent(supabase as any, {
                companyId,
                eventName: 'delivery.approved',
                entityType: 'invoice',
                entityId: invoiceId,
                actorId: user.id,
                idempotencyKey: `delivery.approved:${approvalResult.transactionId || idempotencyKey}`,
                payload: {
                    transactionId: approvalResult.transactionId,
                    sourceEntity: approvalResult.sourceEntity,
                    sourceId: approvalResult.sourceId,
                    eventType: approvalResult.eventType,
                    requestHash,
                }
            })
        }

        try {
            await supabase.from('audit_logs').insert({
                company_id: companyId,
                user_id: user.id,
                action: 'UPDATE',
                target_table: 'invoices',
                record_id: invoiceId,
                record_identifier: invoice.invoice_number,
                old_data: {
                    warehouse_status: invoice.warehouse_status || 'pending',
                    approval_status: invoice.approval_status || invoice.warehouse_status || 'pending',
                },
                new_data: {
                    warehouse_status: 'approved',
                    approval_status: 'approved',
                    approval_reason: notes || null,
                    approved_by: user.id,
                    approval_date: new Date().toISOString(),
                }
            })
        } catch (auditErr: any) {
            console.warn('⚠️ [WAREHOUSE_APPROVE] Audit log failed:', auditErr.message)
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
            message: "تم اعتماد إخراج البضاعة بنجاح",
            transactionId: approvalResult.transactionId || null,
            eventType: approvalResult.eventType || 'warehouse_approval'
        })

    } catch (error: any) {
        console.error("Error in warehouse approve API:", error)
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 })
    }
}
