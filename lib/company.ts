// Enterprise Logic: جلب الشركة المملوكة فقط للأدوار العليا
export async function getCompanyIdForUser(supabase: any): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    
    // 1️⃣ جلب جميع العضويات للتحقق من وجود أي دور علوي
    const { data: members } = await supabase
      .from("company_members")
      .select("role, company_id")
      .eq("user_id", user.id)
    
    const upperRoles = ["owner", "admin", "manager", "accountant"]
    
    // 2️⃣ التحقق من وجود أي دور علوي في أي عضوية
    const hasUpperRole = members?.some((m: any) => 
      upperRoles.includes((m.role || "").toLowerCase())
    ) || false
    
    // 3️⃣ إذا لم يكن هناك أي عضوية، أو كان هناك دور علوي: محاولة الوصول إلى companies table
    if (!members || members.length === 0 || hasUpperRole) {
      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .eq("user_id", user.id)
        .single()
      return company?.id ?? null
    }
    
    // 4️⃣ للأدوار العادية فقط: استخدام أول شركة من company_members
    return members[0]?.company_id ?? null
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
// 3) Owned company (only for upper roles)
// 4) First company in table (single-company deployments)
export async function getActiveCompanyId(supabase: any): Promise<string | null> {
  try {
    // ✅ التحقق من وجود supabase client قبل الاستخدام
    if (!supabase || !supabase.auth) {
      console.error("❌ Supabase client is not initialized")
      // محاولة استخدام الشركة المحفوظة من localStorage
      if (typeof window !== 'undefined') {
        const cachedId = localStorage.getItem('active_company_id')
        if (cachedId) {
          console.log("✅ Using cached company ID (no supabase):", cachedId)
          return cachedId
        }
      }
      return null
    }

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

      // 2️⃣ Enterprise Logic: جلب جميع الشركات التي المستخدم عضو فيها مع الأدوار
      // هذا يسمح لنا بتحديد مصدر البيانات بناءً على الدور بدلاً من معالجة الأخطاء
      let userCompanies = null
      let userRoles: Record<string, string> = {} // company_id -> role mapping
      try {
        const { data, error } = await supabase
          .from("company_members")
          .select("company_id, role")
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
        // بناء خريطة الأدوار لكل شركة
        if (data) {
          data.forEach((m: any) => {
            userRoles[m.company_id] = (m.role || "").toLowerCase()
          })
        }
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
      
      // تعريف الأدوار العليا (يمكنها الوصول إلى companies table)
      const upperRoles = ["owner", "admin", "manager", "accountant"]

      // 3️⃣ إذا كانت الشركة المحفوظة موجودة وعضو فيها، نستخدمها
      if (savedCompanyId && memberCompanyIds.includes(savedCompanyId)) {
        console.log("✅ Using saved company ID:", savedCompanyId)
        return savedCompanyId
      }

      // 4️⃣ Enterprise Logic: التحقق من ownership فقط للأدوار العليا
      if (savedCompanyId) {
        const savedCompanyRole = userRoles[savedCompanyId] || ""
        const isUpperRole = upperRoles.includes(savedCompanyRole)
        
        if (isUpperRole) {
          // للأدوار العليا فقط: التحقق من ownership في companies table
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
              // للأدوار العليا، إذا فشل الاستعلام، نتابع إلى fallback
              console.warn('⚠️ Ownership check failed for upper role, continuing to fallback')
            } else if (Array.isArray(ownedCompany) && ownedCompany[0]?.id) {
              return savedCompanyId
            }
          } catch (error: any) {
            if (error?.name === 'AbortError' || error.message?.includes('aborted')) {
              console.warn('⚠️ Ownership check aborted, using saved company ID')
              return savedCompanyId
            }
            // للأدوار العليا، إذا فشل الاستعلام، نتابع إلى fallback
            console.warn('⚠️ Ownership check failed for upper role, continuing to fallback')
          }
        }
        // للأدوار العادية: لا نحاول الوصول إلى companies table
        // نتابع مباشرة إلى استخدام أول شركة من العضويات
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

      // 6️⃣ Enterprise Logic: التحقق من الشركات المملوكة فقط للأدوار العليا
      // للأدوار العادية: نتخطى هذه الخطوة تماماً ولا نحاول الوصول إلى companies table
      const hasUpperRole = memberCompanyIds.some((cid: string) => {
        const role = userRoles[cid] || ""
        return upperRoles.includes(role)
      })
      
      if (hasUpperRole) {
        // فقط للأدوار العليا: محاولة الوصول إلى companies table
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
            // للأدوار العليا، إذا فشل الاستعلام، نعود null
            console.warn('⚠️ Owned companies check failed for upper role')
            return null
          }
          
          if (Array.isArray(ownedCompany) && ownedCompany[0]?.id) {
            const cid: string = ownedCompany[0].id
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
          if (error?.name === 'AbortError' || error.message?.includes('aborted')) {
            console.warn('⚠️ Owned companies request aborted')
            return null
          }
          // للأدوار العليا، إذا فشل الاستعلام، نعود null
          console.warn('⚠️ Owned companies check failed for upper role')
          return null
        }
      }
      // للأدوار العادية: نتخطى هذه الخطوة تماماً ولا نحاول الوصول إلى companies table
    }

    // Fallback للحالات بدون مستخدم
    const { data: anyCompanies } = await supabase
      .from("companies")
      .select("id")
      .limit(1)
    if (Array.isArray(anyCompanies) && anyCompanies[0]?.id) {
      console.log("⚠️ Using fallback company ID:", anyCompanies[0].id)
      return anyCompanies[0].id
    }

    console.error("❌ No company ID found!")
    return null
  } catch (error) {
    console.error("❌ Error in getActiveCompanyId:", error)
    return null
  }
}
