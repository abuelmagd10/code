import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { apiError, HTTP_STATUS } from "@/lib/api-error-handler"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
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

    // Create company
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .insert({
        user_id: authData.user.id,
        name: companyName,
        email,
        phone,
        country,
        city,
        subscription_plan: 'free',
        max_users: 1,
        subscription_status: 'active'
      })
      .select()
      .single()

    if (companyError) {
      await supabase.auth.admin.deleteUser(authData.user.id)
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إنشاء الشركة", companyError.message)
    }

    // Create company member
    await supabase.from('company_members').insert({
      company_id: company.id,
      user_id: authData.user.id,
      role: 'owner',
      email,
      full_name: contactName
    })

    return NextResponse.json({
      success: true,
      message: "تم إنشاء الحساب بنجاح",
      redirectUrl: `/welcome?company=${company.id}`,
      tempPassword
    })

  } catch (error: any) {
    return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في الخادم", error.message)
  }
}