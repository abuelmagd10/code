'use server'

import { createClient } from "@/lib/supabase/server"
import { EquityTransactionService } from "@/lib/equity-transaction-service"
import { revalidatePath } from "next/cache"
import { drawingSchema } from "@/lib/schemas/drawings"
import { createNotification } from "@/lib/governance-layer"

export interface ActionState {
    success: boolean
    message: string
    drawingId?: string
    errors?: { [key: string]: string[] }
}

/** إنشاء مسحوبة كمسودة (تحتاج إرسال للاعتماد ثم اعتماد من الأدوار العليا) */
export async function createDrawing(prevState: ActionState, formData: FormData): Promise<ActionState> {
    try {
        const rawData: Record<string, any> = {}
        formData.forEach((value, key) => {
            rawData[key] = value
        })

        const validatedFields = drawingSchema.safeParse(rawData)

        if (!validatedFields.success) {
            return {
                success: false,
                message: "Please correct the errors below",
                errors: validatedFields.error.flatten().fieldErrors,
            }
        }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return { success: false, message: "Unauthorized" }
        }

        let companyId = rawData.companyId as string
        if (!companyId) {
            const { data: membership } = await supabase
                .from('company_members')
                .select('company_id')
                .eq('user_id', user.id)
                .limit(1)
                .single()
            if (membership) companyId = membership.company_id
            else return { success: false, message: "No active company found" }
        }

        // Enterprise: resolve drawings account by priority (no name-based fallback)
        // 1) shareholder.drawings_account_id  2) company_drawings_settings.default_drawings_account_id
        let drawingsAccountId = rawData.drawingsAccountId as string
        if (!drawingsAccountId) {
            const { data: shareholder } = await supabase
                .from('shareholders')
                .select('drawings_account_id')
                .eq('id', validatedFields.data.shareholderId)
                .single()
            if (shareholder?.drawings_account_id) {
                drawingsAccountId = shareholder.drawings_account_id
            } else {
                const { data: companySettings } = await supabase
                    .from('company_drawings_settings')
                    .select('default_drawings_account_id')
                    .eq('company_id', companyId)
                    .maybeSingle()
                if (companySettings?.default_drawings_account_id) {
                    drawingsAccountId = companySettings.default_drawings_account_id
                } else {
                    console.warn('[drawings] No drawings account: shareholder has no drawings_account_id and company has no default_drawings_account_id.', { companyId, shareholderId: validatedFields.data.shareholderId })
                    return {
                        success: false,
                        message: "Drawings account is not configured. Set it for this shareholder or set a company default in Company Drawings Settings.",
                    }
                }
            }
        }

        const amount = validatedFields.data.amount
        const currencyCode = (rawData.currencyCode as string) || 'EGP'
        const exchangeRate = Math.max(0.000001, Number(rawData.exchangeRate) || 1)
        const baseAmount = amount * exchangeRate

        const { data: drawing, error } = await supabase
            .from('shareholder_drawings')
            .insert({
                company_id: companyId,
                shareholder_id: validatedFields.data.shareholderId,
                drawing_date: validatedFields.data.drawingDate,
                amount,
                currency_code: currencyCode,
                exchange_rate: exchangeRate,
                base_amount: baseAmount,
                description: validatedFields.data.description || null,
                status: 'draft',
                created_by: user.id,
                payment_account_id: validatedFields.data.paymentAccountId,
                drawings_account_id: drawingsAccountId,
            })
            .select('id')
            .single()

        if (error) {
            console.error("Create drawing insert error:", error)
            return { success: false, message: error.message }
        }

        revalidatePath('/drawings')
        return { success: true, message: "Drawing saved as draft", drawingId: drawing.id }
    } catch (error: any) {
        console.error("Create drawing error:", error)
        return { success: false, message: "Internal server error" }
    }
}

/** إرسال المسحوبة للاعتماد (دraft/rejected → pending_approval) */
export async function submitDrawingForApproval(drawingId: string): Promise<{ success: boolean; message: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: "Unauthorized" }

    const { data: row, error: fetchErr } = await supabase
        .from('shareholder_drawings')
        .select('id, status, created_by')
        .eq('id', drawingId)
        .single()

    if (fetchErr || !row) return { success: false, message: "Drawing not found" }
    if (row.status !== 'draft' && row.status !== 'rejected') return { success: false, message: "Drawing is not in draft or rejected state" }
    if (row.created_by !== user.id) return { success: false, message: "Only the creator can submit for approval" }

    const { error: updateErr } = await supabase
        .from('shareholder_drawings')
        .update({
            status: 'pending_approval',
            approval_status: 'pending',
            rejected_by: null,
            rejected_at: null,
            rejection_reason: null,
            last_status_changed_at: new Date().toISOString(),
        })
        .eq('id', drawingId)

    if (updateErr) return { success: false, message: updateErr.message }
    revalidatePath('/drawings')
    revalidatePath(`/drawings/${drawingId}`)
    return { success: true, message: "Submitted for approval" }
}

/** اعتماد المسحوبة (إنشاء القيد وتحديث الحالة) - للأدوار العليا فقط */
export async function approveDrawing(drawingId: string): Promise<{ success: boolean; message: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: "Unauthorized" }

    const { data: row, error: fetchErr } = await supabase
        .from('shareholder_drawings')
        .select('company_id, created_by')
        .eq('id', drawingId)
        .single()
    if (fetchErr || !row) return { success: false, message: "Drawing not found" }

    const { data, error } = await supabase.rpc('approve_shareholder_drawing', {
        p_drawing_id: drawingId,
        p_approved_by: user.id
    })
    if (error) return { success: false, message: error.message }

    if (row.company_id && row.created_by && row.created_by !== user.id) {
        try {
            await createNotification({
                companyId: row.company_id,
                referenceType: 'shareholder_drawing',
                referenceId: drawingId,
                title: 'تم اعتماد المسحوبة',
                message: 'تم اعتماد المسحوبة التي قدمتها وإنشاء القيد المحاسبي.',
                createdBy: user.id,
                assignedToUser: row.created_by,
                priority: 'normal',
                eventKey: `drawing:${drawingId}:approved:${Date.now()}`,
                severity: 'info',
            })
        } catch (_) { /* ignore */ }
    }

    revalidatePath('/drawings')
    revalidatePath(`/drawings/${drawingId}`)
    return { success: true, message: "Drawing approved" }
}

/** رفض المسحوبة - للأدوار العليا فقط */
export async function rejectDrawing(drawingId: string, reason: string): Promise<{ success: boolean; message: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: "Unauthorized" }
    if (!reason?.trim()) return { success: false, message: "Rejection reason is required" }

    const { data: row, error: fetchErr } = await supabase
        .from('shareholder_drawings')
        .select('company_id, created_by')
        .eq('id', drawingId)
        .eq('status', 'pending_approval')
        .single()

    if (fetchErr || !row) return { success: false, message: "Drawing not found or not pending approval" }

    const { error } = await supabase
        .from('shareholder_drawings')
        .update({
            status: 'rejected',
            approval_status: 'rejected',
            rejected_by: user.id,
            rejected_at: new Date().toISOString(),
            rejection_reason: reason.trim(),
            last_status_changed_at: new Date().toISOString(),
        })
        .eq('id', drawingId)
        .eq('status', 'pending_approval')

    if (error) return { success: false, message: error.message }

    if (row.company_id && row.created_by && row.created_by !== user.id) {
        try {
            await createNotification({
                companyId: row.company_id,
                referenceType: 'shareholder_drawing',
                referenceId: drawingId,
                title: 'تم رفض المسحوبة',
                message: `تم رفض المسحوبة. السبب: ${reason.trim()}`,
                createdBy: user.id,
                assignedToUser: row.created_by,
                priority: 'high',
                eventKey: `drawing:${drawingId}:rejected:${Date.now()}`,
                severity: 'warning',
            })
        } catch (_) { /* ignore */ }
    }

    revalidatePath('/drawings')
    revalidatePath(`/drawings/${drawingId}`)
    return { success: true, message: "Drawing rejected" }
}

export async function getShareholders(companyId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('shareholders')
        .select('id, name, drawings_account_id')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .order('name')

    if (error) {
        console.error('Error fetching shareholders:', error)
        return []
    }

    return data
}

export async function getDrawings(companyId: string) {
    const supabase = await createClient()
    const equityService = new EquityTransactionService(supabase)
    return await equityService.getDrawingsHistory(companyId)
}

export async function getDrawingById(drawingId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('shareholder_drawings')
        .select(`
            *,
            shareholders (id, name),
            journal_entries (id, entry_number)
        `)
        .eq('id', drawingId)
        .single()
    if (error || !data) return null
    return data
}
