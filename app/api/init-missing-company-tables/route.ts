import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { createClient } from "@supabase/supabase-js"

// Admin client to bypass RLS for table creation checks
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * ERP Maintenance Tool: Initialize missing company tables
 * 
 * This endpoint creates missing accounting tables for a company.
 * It is protected by requireOwnerOrAdmin and logs all operations to audit_logs.
 * 
 * Additive Only: Does not modify existing business logic or data.
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
        },
      }
    )

    // === تحصين أمني: استخدام requireOwnerOrAdmin ===
    const { user, companyId, member, error: authError } = await requireOwnerOrAdmin(request)
    if (authError) {
      return NextResponse.json({ error: authError }, { status: 403 })
    }

    if (!user || !companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check which tables are missing
    const missingTables: string[] = []
    const initializedTables: string[] = []

    // Check profit_distribution_settings
    try {
      const { error: checkError } = await admin
        .from("profit_distribution_settings")
        .select("id")
        .eq("company_id", companyId)
        .limit(1)
      
      if (checkError) {
        if (checkError.code === 'PGRST116' || checkError.code === 'PGRST205') {
          missingTables.push("profit_distribution_settings")
        } else {
          throw checkError
        }
      } else {
        initializedTables.push("profit_distribution_settings")
      }
    } catch (error: any) {
      if (error.code === 'PGRST116' || error.code === 'PGRST205') {
        missingTables.push("profit_distribution_settings")
      } else {
        console.error("Error checking profit_distribution_settings:", error)
      }
    }

    // If no tables are missing, return success
    if (missingTables.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All required tables are already initialized",
        initializedTables,
        missingTables: []
      })
    }

    // Initialize missing tables
    const results: Record<string, { success: boolean; error?: string }> = {}

    for (const tableName of missingTables) {
      try {
        if (tableName === "profit_distribution_settings") {
          // First, try to create the record (table might exist but record doesn't)
          const { error: insertError, data: insertedData } = await admin
            .from("profit_distribution_settings")
            .insert([{ company_id: companyId }])
            .select("id")
            .single()

          if (insertError) {
            if (insertError.code === 'PGRST116' || insertError.code === 'PGRST205') {
              // Table does not exist - provide clear instructions
              results[tableName] = {
                success: false,
                error: `Table 'profit_distribution_settings' does not exist in database. Please run SQL migration script: scripts/123_ensure_profit_distribution_settings.sql or scripts/006_profit_distribution_settings.sql in Supabase SQL Editor.`
              }
            } else if (insertError.code === '23505') {
              // Unique constraint violation - record already exists
              results[tableName] = { 
                success: true,
                error: "Record already exists for this company"
              }
              initializedTables.push(tableName)
            } else {
              results[tableName] = {
                success: false,
                error: `Failed to create record: ${insertError.message}`
              }
            }
          } else {
            results[tableName] = { success: true }
            initializedTables.push(tableName)
          }
        }
      } catch (error: any) {
        results[tableName] = {
          success: false,
          error: error.message || "Unknown error"
        }
      }
    }

    // Log to audit_logs
    try {
      await admin.from("audit_logs").insert([
        {
          company_id: companyId,
          user_id: user.id,
          action: "init_missing_tables",
          resource_type: "system",
          resource_id: companyId,
          details: {
            missingTables,
            initializedTables,
            results,
            performedBy: user.email || user.id,
            role: member?.role || "unknown"
          },
          ip_address: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown"
        }
      ])
    } catch (auditError) {
      console.error("Failed to log to audit_logs:", auditError)
      // Don't fail the request if audit logging fails
    }

    const allSuccess = Object.values(results).every(r => r.success)
    
    return NextResponse.json({
      success: allSuccess,
      message: allSuccess 
        ? "All missing tables initialized successfully"
        : "Some tables could not be initialized. Please check errors.",
      initializedTables,
      missingTables: missingTables.filter(t => !results[t]?.success),
      results
    })

  } catch (error: any) {
    console.error("Error in init-missing-company-tables:", error)
    return NextResponse.json(
      { 
        error: "Internal server error",
        message: error.message || "Unknown error"
      },
      { status: 500 }
    )
  }
}

