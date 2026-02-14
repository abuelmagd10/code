'use server'

import { createClient } from "@/lib/supabase/server"
import { EquityReportingService } from "@/lib/equity-reporting-service"

export async function getEquityStatement(companyId: string, fromDate: string, toDate: string) {
    const supabase = await createClient()
    const service = new EquityReportingService(supabase)

    try {
        const data = await service.getStatementOfChanges(companyId, fromDate, toDate)
        return { success: true, data }
    } catch (error: any) {
        console.error("Error fetching equity statement:", error)
        return { success: false, error: error.message }
    }
}
