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

// More resilient resolver that works even without an authenticated user.
// Order of resolution:
// 1) Company for current user
// 2) First company in table (single-company deployments)
// 3) Infer from any existing bills
// 4) Infer from any existing invoices
export async function getActiveCompanyId(supabase: any): Promise<string | null> {
  try {
    try {
      if (typeof window !== 'undefined') {
        const cid = String(localStorage.getItem('active_company_id') || '')
        if (cid) return cid
      }
    } catch {}
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const metaCompany = String((user as any)?.user_metadata?.active_company_id || '')
      if (metaCompany) {
        try {
          const { data: exists } = await supabase.from('companies').select('id').eq('id', metaCompany).limit(1)
          if (Array.isArray(exists) && exists[0]?.id) return exists[0].id
        } catch {}
      }
      const { data: memberCompany } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", user.id)
        .limit(1)
      if (Array.isArray(memberCompany) && memberCompany[0]?.company_id) return memberCompany[0].company_id
      const { data: ownedCompany } = await supabase
        .from("companies")
        .select("id")
        .eq("user_id", user.id)
        .single()
      if (ownedCompany?.id) return ownedCompany.id
    }

    const { data: anyCompanies } = await supabase
      .from("companies")
      .select("id")
      .limit(1)
    if (Array.isArray(anyCompanies) && anyCompanies[0]?.id) return anyCompanies[0].id

    const { data: anyBills } = await supabase
      .from("bills")
      .select("company_id")
      .limit(1)
    if (Array.isArray(anyBills) && anyBills[0]?.company_id) return anyBills[0].company_id

    const { data: anyInvoices } = await supabase
      .from("invoices")
      .select("company_id")
      .limit(1)
    if (Array.isArray(anyInvoices) && anyInvoices[0]?.company_id) return anyInvoices[0].company_id

    return null
  } catch {
    return null
  }
}
