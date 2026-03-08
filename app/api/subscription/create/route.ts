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

    const { plan = 'free', billingCycle = 'monthly', companyName, contactName, email, phone, country, city } = await req.json()

    if (!companyName || !contactName || !email || !phone) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "جميع الحقول مطلوبة", "All fields required")
    }

    // Create user
    const tempPassword = Math.random().toString(36).slice(-12)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: contactName, company_name: companyName }
    })

    if (authError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إنشاء الحساب", authError.message)
    }

    // 🏢 إنشاء هيكل الشركة بالكامل بشكل ذري (Atomic Transaction via RPC)
    // يشمل: Company, Member(Owner), Main Branch, Cost Center, Warehouse
    const { data: rpcResult, error: rpcError } = await supabase.rpc('create_company_atomic', {
      p_user_id: authData.user.id,
      p_email: email,
      p_company_name: companyName,
      p_contact_name: contactName,
      p_phone: phone,
      p_country: country || null,
      p_city: city || null
    })

    if (rpcError || !rpcResult?.success) {
      // 🔙 Rollback: Delete the user if infrastructure creation fails
      await supabase.auth.admin.deleteUser(authData.user.id)
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في بناء هيكل الشركة وملحقاتها", rpcError?.message || 'Unknown RPC error')
    }

    return NextResponse.json({
      success: true,
      message: "تم إنشاء حساب الشركة والهيكل الإداري بنجاح",
      redirectUrl: `/welcome?company=${rpcResult.company_id}`,
      tempPassword
    })

  } catch (error: any) {
    return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في الخادم", error.message)
  }
}