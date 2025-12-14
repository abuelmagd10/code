// =============================================
// API: تطبيق إصلاح مشكلة إهلاك المخزون
// Apply Write-off Balance Fix
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // التحقق من المستخدم
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    // التحقق من الصلاحيات (يجب أن يكون admin أو owner)
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!company) {
      return NextResponse.json({ error: 'لم يتم العثور على الشركة' }, { status: 404 })
    }

    // التحقق من الصلاحيات
    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", company.id)
      .eq("user_id", user.id)
      .single()

    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ 
        error: 'ليس لديك صلاحية لتطبيق هذا الإصلاح. يجب أن تكون admin أو owner' 
      }, { status: 403 })
    }

    // تطبيق الإصلاح عبر RPC
    // ملاحظة: يجب أولاً تطبيق ملف scripts/apply_write_off_fix_function.sql في SQL Editor
    // لإنشاء الدالة apply_write_off_balance_fix()
    
    const { data, error } = await supabase.rpc('apply_write_off_balance_fix')
    
    if (error) {
      // إذا لم تكن الدالة موجودة، نعطي تعليمات
      if (error.message.includes('function') || error.message.includes('does not exist')) {
        return NextResponse.json({
          success: false,
          message: 'الدالة غير موجودة. يجب تطبيق الإصلاح أولاً من SQL Editor',
          instructions: [
            '1. افتح Supabase Dashboard',
            '2. اذهب إلى Database → SQL Editor',
            '3. افتح ملف: scripts/apply_write_off_fix_function.sql',
            '4. انسخ المحتوى والصقه في SQL Editor',
            '5. اضغط Run',
            '6. ثم أعد المحاولة من هنا'
          ],
          file_path: 'scripts/apply_write_off_fix_function.sql'
        }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({
      success: data?.success || false,
      message: data?.message || 'تم تطبيق الإصلاح',
      changes: data?.changes,
      error: data?.error
    })

  } catch (error: any) {
    console.error('Apply fix error:', error)
    return NextResponse.json({ 
      error: error.message || 'حدث خطأ أثناء محاولة تطبيق الإصلاح' 
    }, { status: 500 })
  }
}
