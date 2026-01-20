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
    } catch { }
  }
  return companyId
}

// More resilient resolver that works even without an authenticated user.
// Order of resolution:
// 1) Check localStorage/Cookie for active_company_id AND verify user has access
// 2) First company from company_members
// 3) Owned company
// 4) First company in table (single-company deployments)
export async function getActiveCompanyId(supabase: any): Promise<string | null> {
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    // معالجة AbortError بشكل صريح
    if (authError) {
      if (authError.name === 'AbortError' || authError.message?.includes('aborted')) {
        console.warn('⚠️ Auth request was aborted, using cached company ID')
        // محاولة استخدام الشركة المحفوظة من localStorage
        if (typeof window !== 'undefined') {
          const cachedId = localStorage.getItem('active_company_id')
          if (cachedId) {
            return cachedId
          }
        }
        return null
      }
    }
    
    if (user) {
      // 1️⃣ أولاً: نتحقق من الشركة المحفوظة في localStorage أو Cookie
      let savedCompanyId: string | null = null
      try {
        if (typeof window !== 'undefined') {
          // Client-side: نحاول من Cookie أولاً
          const cookieMatch = document.cookie.split('; ').find(c => c.startsWith('active_company_id='))
          savedCompanyId = cookieMatch?.split('=')[1] || localStorage.getItem('active_company_id') || null
        } else {
          // Server-side: نقرأ من cookies() من Next.js
          try {
            const { cookies } = await import('next/headers')
            const cookieStore = await cookies()
            savedCompanyId = cookieStore.get('active_company_id')?.value || null
            console.log('🔍 [Server] Reading company ID from cookie:', savedCompanyId)
          } catch (e) {
            console.error('❌ [Server] Failed to read cookie:', e)
          }
        }
      } catch { }

      // 2️⃣ جلب جميع الشركات التي المستخدم عضو فيها
      let userCompanies = null
      try {
        const { data, error } = await supabase
          .from("company_members")
          .select("company_id")
          .eq("user_id", user.id)
        
        if (error) {
          if (error.name === 'AbortError' || error.message?.includes('aborted')) {
            console.warn('⚠️ Company members request was aborted, using saved company ID')
            if (savedCompanyId) {
              return savedCompanyId
            }
            return null
          }
          throw error
        }
        userCompanies = data
      } catch (error: any) {
        if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
          console.warn('⚠️ Request aborted, using saved company ID')
          if (savedCompanyId) {
            return savedCompanyId
          }
          return null
        }
        throw error
      }

      const memberCompanyIds = (userCompanies || []).map((c: any) => c.company_id)

      // 3️⃣ إذا كانت الشركة المحفوظة موجودة وعضو فيها، نستخدمها
      if (savedCompanyId && memberCompanyIds.includes(savedCompanyId)) {
        console.log("✅ Using saved company ID:", savedCompanyId)
        return savedCompanyId
      }

      // 4️⃣ نتحقق إذا كان المستخدم مالكاً للشركة المحفوظة
      if (savedCompanyId) {
        try {
          const { data: ownedCompany, error } = await supabase
            .from("companies")
            .select("id")
            .eq("id", savedCompanyId)
            .eq("user_id", user.id)
            .limit(1)
          
          if (error) {
            if (error.name === 'AbortError' || error.message?.includes('aborted')) {
              console.warn('⚠️ Ownership check aborted, using saved company ID')
              return savedCompanyId
            }
          }
          
          if (Array.isArray(ownedCompany) && ownedCompany[0]?.id) {
            return savedCompanyId
          }
        } catch (error: any) {
          if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
            console.warn('⚠️ Ownership check aborted, using saved company ID')
            return savedCompanyId
          }
        }
      }

      // 5️⃣ إذا لم تكن الشركة المحفوظة صالحة، نأخذ أول شركة من العضويات
      if (memberCompanyIds.length > 0) {
        const newActiveCompany = memberCompanyIds[0]
        console.log("✅ Using first member company ID:", newActiveCompany)
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem('active_company_id', newActiveCompany)
            document.cookie = `active_company_id=${newActiveCompany}; path=/; max-age=31536000`
          }
        } catch { }
        return newActiveCompany
      }

      // 6️⃣ نتحقق من الشركات المملوكة
      try {
        const { data: ownedCompany, error } = await supabase
          .from("companies")
          .select("id")
          .eq("user_id", user.id)
          .limit(1)
        
        if (error) {
          if (error.name === 'AbortError' || error.message?.includes('aborted')) {
            console.warn('⚠️ Owned companies request aborted')
            return null
          }
        }
        
        if (Array.isArray(ownedCompany) && ownedCompany[0]?.id) {
          const cid = ownedCompany[0].id
          console.log("✅ Using owned company ID:", cid)
          try {
            if (typeof window !== 'undefined') {
              localStorage.setItem('active_company_id', cid)
              document.cookie = `active_company_id=${cid}; path=/; max-age=31536000`
            }
          } catch { }
          return cid
        }
      } catch (error: any) {
        if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
          console.warn('⚠️ Owned companies request aborted')
          return null
        }
        throw error
      }
    }

    // Fallback للحالات بدون مستخدم
    try {
      const { data: anyCompanies, error } = await supabase
        .from("companies")
        .select("id")
        .limit(1)
      
      if (error) {
        if (error.name === 'AbortError' || error.message?.includes('aborted')) {
          console.warn('⚠️ Fallback companies request aborted')
          // محاولة استخدام الشركة المحفوظة من localStorage
          if (typeof window !== 'undefined') {
            const cachedId = localStorage.getItem('active_company_id')
            if (cachedId) {
              return cachedId
            }
          }
          return null
        }
      }
      
      if (Array.isArray(anyCompanies) && anyCompanies[0]?.id) {
        console.log("⚠️ Using fallback company ID:", anyCompanies[0].id)
        return anyCompanies[0].id
      }
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
        console.warn('⚠️ Fallback request aborted, using cached company ID')
        if (typeof window !== 'undefined') {
          const cachedId = localStorage.getItem('active_company_id')
          if (cachedId) {
            return cachedId
          }
        }
        return null
      }
      throw error
    }

    console.error("❌ No company ID found!")
    return null
  } catch (error: any) {
    // معالجة AbortError بشكل صريح
    if (error?.name === 'AbortError' || error?.message?.includes('aborted')) {
      console.warn('⚠️ Request aborted in getActiveCompanyId, using cached company ID')
      if (typeof window !== 'undefined') {
        const cachedId = localStorage.getItem('active_company_id')
        if (cachedId) {
          return cachedId
        }
      }
      return null
    }
    console.error("❌ Error in getActiveCompanyId:", error)
    return null
  }
}
