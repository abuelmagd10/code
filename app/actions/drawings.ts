'use server'

import { createClient } from "@/lib/supabase/server"
import { EquityTransactionService } from "@/lib/equity-transaction-service"
import { revalidatePath } from "next/cache"
import { drawingSchema, type DrawingFormValues } from "@/lib/schemas/drawings"

export interface ActionState {
    success: boolean
    message: string
    errors?: { [key: string]: string[] }
}

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

        // Get company ID from headers or cookies (assuming active company context)
        // For now, we'll fetch it from the user's active company membership or similar logic
        // This part might need adjustment based on how company context is handled globally
        // We will attempt to get it from a cookie or a default company fetch for now

        // Fallback: fetch the first company for the user if not strictly passed
        // Ideally this should be passed as a hidden field or retrieved from a reliable server-side store
        let companyId = rawData.companyId as string

        if (!companyId) {
            const { data: membership } = await supabase
                .from('company_members')
                .select('company_id')
                .eq('user_id', user.id)
                .limit(1)
                .single()

            if (membership) {
                companyId = membership.company_id
            } else {
                return { success: false, message: "No active company found" }
            }
        }

        // Determine drawings account (usually based on shareholder or general drawings account)
        // The service requires drawingsAccountId. We can look up the shareholder's specific drawings account
        // or use a default one from Chart of Accounts (Code 3300 typically or similar)

        let drawingsAccountId = rawData.drawingsAccountId as string

        // If not provided, try to find it on the shareholder record
        if (!drawingsAccountId) {
            const { data: shareholder } = await supabase
                .from('shareholders')
                .select('drawings_account_id')
                .eq('id', validatedFields.data.shareholderId)
                .single()

            if (shareholder && shareholder.drawings_account_id) {
                drawingsAccountId = shareholder.drawings_account_id
            } else {
                // Fallback to searching CoA for a default drawings account
                const { data: coaAccount } = await supabase
                    .from('chart_of_accounts')
                    .select('id')
                    .eq('company_id', companyId)
                    .ilike('account_name', '%Masroob%') // Broad search, ideally should be precise
                    .limit(1)
                    .maybeSingle()

                if (coaAccount) {
                    drawingsAccountId = coaAccount.id
                } else {
                    return { success: false, message: "Drawings account configuration is missing for this shareholder." }
                }
            }
        }


        const equityService = new EquityTransactionService(supabase)

        const result = await equityService.recordDrawing({
            companyId,
            shareholderId: validatedFields.data.shareholderId,
            amount: validatedFields.data.amount,
            drawingDate: validatedFields.data.drawingDate,
            paymentAccountId: validatedFields.data.paymentAccountId,
            drawingsAccountId: drawingsAccountId,
            description: validatedFields.data.description,
            userId: user.id
        })

        if (!result.success) {
            return {
                success: false,
                message: result.error || "Failed to record drawing",
            }
        }

        revalidatePath('/drawings')
        return { success: true, message: "Drawing recorded successfully" }

    } catch (error: any) {
        console.error("Create drawing error:", error)
        return { success: false, message: "Internal server error" }
    }
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
