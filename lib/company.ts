export async function getCompanyIdForUser(supabase: any): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .single()
    return company?.id ?? null
  } catch {
    return null
  }
}

export async function ensureCompanyId(supabase: any, toast?: any): Promise<string | null> {
  const companyId = await getCompanyIdForUser(supabase)
  if (!companyId && toast) {
    try {
      const { toastActionError } = await import("@/lib/notifications")
      toastActionError(toast, "الوصول", "بيانات الشركة", "تعذر الحصول على الشركة، يرجى تسجيل الدخول")
    } catch {}
  }
  return companyId
}

