// =============================================
// API للبحث عن مستخدم بـ username أو email
// يُستخدم لدعم تسجيل الدخول بـ username
// =============================================
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { login } = body
    
    if (!login || login.trim().length === 0) {
      return NextResponse.json({ error: "البريد الإلكتروني أو اسم المستخدم مطلوب" }, { status: 400 })
    }

    const supabase = await createClient()
    const cleanLogin = login.toLowerCase().trim()
    
    // إذا كان يحتوي على @ فهو بريد إلكتروني
    if (cleanLogin.includes("@")) {
      return NextResponse.json({ email: cleanLogin, type: "email" })
    }
    
    // البحث عن username في user_profiles
    const { data: profile, error } = await supabase
      .from("user_profiles")
      .select("user_id, username")
      .eq("username", cleanLogin)
      .maybeSingle()
    
    if (error) {
      console.error("Error finding user:", error)
      return NextResponse.json({ error: "حدث خطأ في البحث" }, { status: 500 })
    }
    
    if (!profile) {
      // لم يتم العثور على username، ربما هو بريد إلكتروني بدون @
      return NextResponse.json({ 
        found: false, 
        error: "اسم المستخدم غير موجود. جرب البريد الإلكتروني" 
      }, { status: 404 })
    }
    
    // جلب البريد الإلكتروني للمستخدم باستخدام service role
    // لأن auth.users غير متاح للـ client
    // نستخدم الـ user_id للبحث في الـ auth
    // ملاحظة: هذا يحتاج إلى access عبر server-side فقط
    
    // كحل بديل، نخزن البريد في user_profiles أو نستخدم الـ RPC
    // هنا سنفترض أن الـ client سيستخدم البريد مباشرة
    
    return NextResponse.json({ 
      found: true,
      user_id: profile.user_id,
      username: profile.username,
      type: "username",
      // سنحتاج لجلب البريد من auth.users عبر service role
      message: "تم العثور على المستخدم"
    })
    
  } catch (err) {
    console.error("Error:", err)
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 })
  }
}

