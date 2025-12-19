import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/company'
import fs from 'fs'
import path from 'path'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: 'No active company' }, { status: 400 })
    }

    // قراءة ملف الإصلاح
    const fixFilePath = path.join(process.cwd(), 'fix_post_depreciation.sql')
    const fixSQL = fs.readFileSync(fixFilePath, 'utf8')

    // تنفيذ الإصلاح
    const { error } = await supabase.rpc('exec_sql', { sql: fixSQL })

    if (error) {
      console.error('Error applying fixes:', error)
      return NextResponse.json({
        error: 'Failed to apply fixes',
        details: error.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Fixed Assets depreciation fixes applied successfully'
    })
  } catch (error: any) {
    console.error('Error in apply fixes:', error)
    return NextResponse.json({
      error: 'Failed to apply fixes',
      details: error?.message
    }, { status: 500 })
  }
}