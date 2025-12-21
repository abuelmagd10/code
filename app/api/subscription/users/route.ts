import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { apiError, HTTP_STATUS } from "@/lib/api-error-handler"

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!url || !key) {
    return null
  }
  
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ success: false, message: 'Service not configured' })
    }
    
    const { companyId, additionalUsers } = await req.json()

    if (!companyId || !additionalUsers || additionalUsers < 1) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "بيانات غير صحيحة", "Invalid data")
    }

    const monthlyCost = additionalUsers * 5
    const newMaxUsers = 1 + additionalUsers

    // Update company subscription
    const { error: updateError } = await supabase
      .from('companies')
      .update({
        max_users: newMaxUsers,
        subscription_plan: 'paid',
        monthly_cost: monthlyCost,
        subscription_status: 'active'
      })
      .eq('id', companyId)

    if (updateError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في تحديث الاشتراك", updateError.message)
    }

    return NextResponse.json({
      success: true,
      message: `تم إضافة ${additionalUsers} مستخدم إضافي`,
      newMaxUsers,
      monthlyCost
    })

  } catch (error: any) {
    return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في الخادم", error.message)
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ success: false, message: 'Service not configured' })
    }
    
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('companyId')

    if (!companyId) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "معرف الشركة مطلوب", "Company ID required")
    }

    const { data: company, error } = await supabase
      .from('companies')
      .select('max_users, monthly_cost, subscription_status, subscription_plan')
      .eq('id', companyId)
      .single()

    if (error) {
      return apiError(HTTP_STATUS.NOT_FOUND, "الشركة غير موجودة", error.message)
    }

    const { count: currentUsers } = await supabase
      .from('company_members')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)

    return NextResponse.json({
      success: true,
      maxUsers: company.max_users || 1,
      currentUsers: currentUsers || 0,
      monthlyCost: company.monthly_cost || 0,
      subscriptionStatus: company.subscription_status || 'free'
    })

  } catch (error: any) {
    return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في الخادم", error.message)
  }
}