import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import fs from "fs"
import path from "path"

/**
 * 🧾 API Endpoint: تطبيق قاعدة حوكمة الإهلاك على قاعدة البيانات
 * هذا الـ endpoint ينفذ SQL script تلقائياً
 */
export async function POST(request: NextRequest) {
  try {
    // التحقق من الأمان - يجب أن يكون المستخدم owner أو admin
    const { user, error } = await requireOwnerOrAdmin(request)

    if (error) return error

    // قراءة SQL script
    const sqlFilePath = path.join(process.cwd(), 'scripts', '042_write_off_governance_validation.sql')
    
    if (!fs.existsSync(sqlFilePath)) {
      return NextResponse.json(
        { success: false, error: `SQL file not found: ${sqlFilePath}` },
        { status: 404 }
      )
    }

    const sqlScript = fs.readFileSync(sqlFilePath, 'utf8')

    // استخدام Service Role Key لتنفيذ SQL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json(
        { success: false, error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
        { status: 500 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      return NextResponse.json(
        { success: false, error: "NEXT_PUBLIC_SUPABASE_URL not configured" },
        { status: 500 }
      )
    }

    // تقسيم SQL إلى statements وتنفيذها
    const statements = sqlScript
      .split(/;\s*(?=CREATE|DROP|ALTER)/i)
      .map(s => s.trim())
      .filter(s => {
        const trimmed = s.trim()
        return trimmed.length > 20 && 
               !trimmed.startsWith('--') && 
               !trimmed.startsWith('/*') &&
               (trimmed.toUpperCase().startsWith('CREATE') || 
                trimmed.toUpperCase().startsWith('DROP'))
      })

    const results = {
      total: statements.length,
      success: 0,
      failed: 0,
      errors: [] as string[]
    }

    // تنفيذ كل statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';'
      
      try {
        // استخدام REST API مباشرة
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': serviceRoleKey,
            'Authorization': `Bearer ${serviceRoleKey}`
          },
          body: JSON.stringify({ sql_query: statement })
        })

        if (response.ok) {
          results.success++
        } else {
          const errorText = await response.text()
          results.failed++
          results.errors.push(`Statement ${i + 1}: ${errorText.substring(0, 200)}`)
        }
      } catch (err: any) {
        results.failed++
        results.errors.push(`Statement ${i + 1}: ${err.message}`)
      }
    }

    // التحقق من التطبيق
    let verification = {
      functionExists: false,
      functionWorks: false,
      error: null as string | null
    }

    try {
      const { data, error: testError } = await supabase.rpc('get_available_inventory_quantity', {
        p_company_id: '00000000-0000-0000-0000-000000000000',
        p_branch_id: null,
        p_warehouse_id: null,
        p_cost_center_id: null,
        p_product_id: '00000000-0000-0000-0000-000000000000'
      })

      if (!testError) {
        verification.functionExists = true
        verification.functionWorks = true
      } else if (testError.code === '42883' || testError.message?.includes('does not exist')) {
        verification.functionExists = false
        verification.error = 'Function does not exist'
      } else {
        verification.functionExists = true
        verification.functionWorks = false
        verification.error = testError.message
      }
    } catch (err: any) {
      verification.error = err.message
    }

    return NextResponse.json({
      success: results.failed === 0,
      results,
      verification,
      message: results.failed === 0 
        ? 'SQL script applied successfully'
        : `Applied with ${results.failed} errors. Check errors array for details.`
    })

  } catch (err: any) {
    console.error('Error applying write-off governance:', err)
    return NextResponse.json(
      {
        success: false,
        error: err.message || 'Failed to apply SQL script'
      },
      { status: 500 }
    )
  }
}
