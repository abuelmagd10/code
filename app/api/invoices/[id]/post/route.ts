
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { AccountingTransactionService } from "@/lib/accounting-transaction-service"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"
import { ERPError } from "@/lib/core/errors/erp-errors"
import { resolveFinancialIdempotencyKey, buildFinancialRequestHash } from "@/lib/financial-operation-utils"
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

        // 2. Idempotency Key (Phase 2: Double Submission Protection)
        const idempotencyKey = resolveFinancialIdempotencyKey(
            request.headers.get('Idempotency-Key'),
            ['invoice-post', companyId, invoiceId]
        )

        // 3. جلب تاريخ الفاتورة للتحقق من Period Lock
        const { data: invoice } = await supabase
            .from('invoices')
            .select('invoice_date, status, invoice_number, branch_id, warehouse_status')
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

        // 4. Period Lock Check (Enterprise hard guard via DB RPC)
        if (invoice.invoice_date) {
            try {
                await requireOpenFinancialPeriod(companyId, invoice.invoice_date)
            } catch (lockErr: any) {
                if (lockErr instanceof ERPError && lockErr.code === 'ERR_PERIOD_CLOSED') {
                    return NextResponse.json({
                        success: false,
                        error: lockErr.message
                    }, { status: 400 })
                }
                return NextResponse.json({
                    success: false,
                    error: lockErr?.message || 'فشل التحقق من الفترة المحاسبية'
                }, { status: 400 })
            }
        }

        // 5. Initialize Service
        const accountingService = new AccountingTransactionService(supabase)
        const requestHash = buildFinancialRequestHash({
            invoiceId,
            companyId,
            actorId: user.id,
            invoiceDate: invoice.invoice_date,
        })

        // ✅ تحديد إذا كانت هذه إعادة إرسال بعد رفض مخزني
        const isRepost = invoice.warehouse_status === 'rejected'

        // ✅ الدافع: إذا كانت warehouse_status = 'rejected' (مرفوضة سابقاً) وتم إعادة الإرسال → نعيدها إلى pending
        if (isRepost) {
            const { error: resetErr } = await supabase
                .from('invoices')
                .update({ warehouse_status: 'pending', posted_by_user_id: user.id, status: 'sent' })
                .eq('id', invoiceId)
                .eq('company_id', companyId)

            if (resetErr) {
                console.warn('⚠️ [INVOICE_POST] Failed to reset warehouse_status to pending:', resetErr.message)
            } else {
                console.log('✅ [INVOICE_POST] Re-post after rejection: warehouse_status=pending, status=sent for invoice:', invoice.invoice_number)
            }
        } else {
            // حفظ من قام بالترحيل لأول مرة
            const { error: posterErr } = await supabase
                .from('invoices')
                .update({ posted_by_user_id: user.id })
                .eq('id', invoiceId)
                .eq('company_id', companyId)

            if (posterErr) {
                console.warn('⚠️ [INVOICE_POST] Failed to save posted_by_user_id:', posterErr.message)
            }
        }

        // 6. Execute Atomic Transaction (فقط في حالة الترحيل الأول — ليس عند إعادة الإرسال بعد الرفض)
        let postingResult: Awaited<ReturnType<AccountingTransactionService["postInvoiceAtomic"]>> | null = null
        if (!isRepost) {
            postingResult = await accountingService.postInvoiceAtomic(invoiceId, companyId, user.id, {
                idempotencyKey,
                requestHash,
            })

            if (!postingResult.success) {
                return NextResponse.json({
                    success: false,
                    error: postingResult.error
                }, { status: 400 })
            }
        } else {
            console.log('✅ [INVOICE_POST] Skipping postInvoiceAtomic for re-post (journal entries already exist)')
        }

        if (enterpriseFinanceFlags.observabilityEvents && postingResult?.success) {
            await emitEvent(supabase, {
                companyId,
                eventName: 'invoice.posted',
                entityType: 'invoice',
                entityId: invoiceId,
                actorId: user.id,
                idempotencyKey: `invoice.posted:${postingResult.transactionId || idempotencyKey}`,
                payload: {
                    transactionId: postingResult.transactionId,
                    sourceEntity: postingResult.sourceEntity,
                    sourceId: postingResult.sourceId,
                    eventType: postingResult.eventType,
                    requestHash,
                }
            })
        }

        // ✅ المرحلة 1: إشعار مسؤول المخزن عند اعتماد الفاتورة (Draft → Sent)
        // نرسل للمستخدمين المعيّنين فعلياً في الفرع بأدوار المخزن (store_manager / warehouse_manager)
        try {
            const warehouseRoles = ['warehouse_manager', 'store_manager']
            
            // جلب جميع أعضاء الفرع ذو الأدوار المخزنية
            const { data: warehouseManagers } = await supabase
                .from('company_members')
                .select('user_id, role')
                .eq('company_id', companyId)
                .in('role', warehouseRoles)
                .eq('branch_id', invoice?.branch_id || '')

            if (warehouseManagers && warehouseManagers.length > 0) {
                // إرسال إشعار مخصص لكل مدير مخزن في الفرع
                for (const manager of warehouseManagers) {
                    // استخدام timestamp في event_key لتجنّب خطأ idempotency عند إعادة الإرسال بعد الرفض
                    const nowTs = Date.now()
                    const { error: notifErr } = await supabase.rpc('create_notification', {
                        p_company_id: companyId,
                        p_reference_type: 'invoice',
                        p_reference_id: invoiceId,
                        p_title: 'فاتورة جاهزة للشحن',
                        p_message: `الفاتورة رقم (${invoice?.invoice_number || invoiceId}) اعتُمدت من المحاسبة — يرجى تجهيز البضاعة وتأكيد الإخراج من المخزن`,
                        p_created_by: user.id,
                        p_branch_id: invoice?.branch_id || null,
                        p_cost_center_id: null,
                        p_warehouse_id: null,
                        p_assigned_to_role: manager.role,
                        p_assigned_to_user: manager.user_id,
                        p_priority: 'high',
                        p_event_key: `invoice:${invoiceId}:sent:${manager.user_id}:${nowTs}`,
                        p_severity: 'warning',
                        p_category: 'inventory'
                    })
                    if (notifErr) {
                        console.warn(`⚠️ [INVOICE_POST] Notification failed for user ${manager.user_id}:`, notifErr.message)
                    } else {
                        console.log(`✅ [INVOICE_POST] Notification sent to ${manager.role} (${manager.user_id}) for invoice:`, invoice?.invoice_number)
                    }
                }
            } else {
                // لا يوجد مدير مخزن في الفرع — إرسال بالدور فقط كـ fallback
                console.warn(`⚠️ [INVOICE_POST] No warehouse/store managers found in branch ${invoice?.branch_id}. Sending role-based fallback notification.`)
                await supabase.rpc('create_notification', {
                    p_company_id: companyId,
                    p_reference_type: 'invoice',
                    p_reference_id: invoiceId,
                    p_title: 'فاتورة جاهزة للشحن',
                    p_message: `الفاتورة رقم (${invoice?.invoice_number || invoiceId}) اعتُمدت من المحاسبة — يرجى تجهيز البضاعة وتأكيد الإخراج من المخزن`,
                    p_created_by: user.id,
                    p_branch_id: invoice?.branch_id || null,
                    p_cost_center_id: null,
                    p_warehouse_id: null,
                    p_assigned_to_role: 'store_manager',
                    p_assigned_to_user: null,
                    p_priority: 'high',
                    p_event_key: `invoice:${invoiceId}:sent:store_manager:${Date.now()}`,
                    p_severity: 'warning',
                    p_category: 'inventory'
                })
            }
        } catch (notifErr: any) {
            // الإشعار غير حرج — لا نوقف العملية بسببه
            console.warn('⚠️ [INVOICE_POST] Warehouse notification failed:', notifErr.message)
        }


        return NextResponse.json({
            success: true,
            transactionId: postingResult?.transactionId || null,
            eventType: postingResult?.eventType || 'invoice_posting'
        })

    } catch (error: any) {
        console.error("Error in invoice posting API:", error)
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 })
    }
}
