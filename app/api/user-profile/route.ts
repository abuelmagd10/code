// =============================================
// API لإدارة ملف المستخدم (username, display_name, etc.)
// =============================================
import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// GET: جلب ملف المستخدم الحالي
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
    }

    // جلب ملف المستخدم
    const { data: profile, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()

    if (error) {
      console.error("Error fetching profile:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // إذا لم يوجد ملف، أنشئ واحد
    if (!profile) {
      const username = user.email?.split("@")[0]?.toLowerCase().replace(/[^a-z0-9_]/g, "") || "user"
      const { data: newProfile, error: insertError } = await supabase
        .from("user_profiles")
        .insert({
          user_id: user.id,
          username: username.length >= 3 ? username : username + "user",
          display_name: user.email?.split("@")[0] || "User"
        })
        .select()
        .single()

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
      return NextResponse.json({ profile: newProfile, email: user.email })
    }

    return NextResponse.json({ profile, email: user.email })
  } catch (err) {
    console.error("Error:", err)
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 })
  }
}

// PATCH: تحديث ملف المستخدم
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
    }

    const body = await request.json()
    const { username, display_name, phone, bio, language, theme } = body

    // التحقق من username إذا تم إرساله
    if (username !== undefined) {
      const cleanUsername = username.toLowerCase().trim()
      
      // التحقق من الطول
      if (cleanUsername.length < 3) {
        return NextResponse.json({ error: "اسم المستخدم قصير جداً (3 أحرف على الأقل)" }, { status: 400 })
      }
      if (cleanUsername.length > 30) {
        return NextResponse.json({ error: "اسم المستخدم طويل جداً (30 حرف كحد أقصى)" }, { status: 400 })
      }
      
      // التحقق من الأحرف المسموحة
      if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
        return NextResponse.json({ 
          error: "يُسمح فقط بالأحرف الإنجليزية الصغيرة والأرقام والشرطة السفلية" 
        }, { status: 400 })
      }
      
      // التحقق من عدم وجود username مكرر
      const { data: existing } = await supabase
        .from("user_profiles")
        .select("user_id")
        .eq("username", cleanUsername)
        .neq("user_id", user.id)
        .maybeSingle()
        
      if (existing) {
        return NextResponse.json({ error: "اسم المستخدم مستخدم بالفعل" }, { status: 400 })
      }
    }

    // بناء البيانات للتحديث
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (username !== undefined) updateData.username = username.toLowerCase().trim()
    if (display_name !== undefined) updateData.display_name = display_name
    if (phone !== undefined) updateData.phone = phone
    if (bio !== undefined) updateData.bio = bio
    if (language !== undefined) updateData.language = language
    if (theme !== undefined) updateData.theme = theme

    const { data: profile, error } = await supabase
      .from("user_profiles")
      .update(updateData)
      .eq("user_id", user.id)
      .select()
      .single()

    if (error) {
      console.error("Error updating profile:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ profile, success: true })
  } catch (err) {
    console.error("Error:", err)
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 })
  }
}

// POST: التحقق من توفر username
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: "غير مصرح" }, { status: 401 })
    }

    const body = await request.json()
    const { username } = body
    
    if (!username) {
      return NextResponse.json({ error: "اسم المستخدم مطلوب" }, { status: 400 })
    }

    const cleanUsername = username.toLowerCase().trim()
    
    // التحقق من الطول والأحرف
    if (cleanUsername.length < 3) {
      return NextResponse.json({ available: false, error: "اسم المستخدم قصير جداً" })
    }
    if (cleanUsername.length > 30) {
      return NextResponse.json({ available: false, error: "اسم المستخدم طويل جداً" })
    }
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      return NextResponse.json({ available: false, error: "أحرف غير مسموحة" })
    }
    
    // التحقق من التوفر
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("user_id")
      .eq("username", cleanUsername)
      .neq("user_id", user.id)
      .maybeSingle()

    return NextResponse.json({ 
      available: !existing, 
      username: cleanUsername,
      error: existing ? "اسم المستخدم مستخدم بالفعل" : null 
    })
  } catch (err) {
    console.error("Error:", err)
    return NextResponse.json({ error: "حدث خطأ" }, { status: 500 })
  }
}

