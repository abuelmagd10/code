import { getActiveCompanyId } from "@/lib/company"

export type TaxCode = {
  id: string
  company_id: string
  name: string
  rate: number
  scope: "sales" | "purchase" | "both"
  is_active: boolean
  created_at?: string
}

export async function listTaxCodes(supabase: any, companyId?: string): Promise<TaxCode[]> {
  const cid = companyId || (await getActiveCompanyId(supabase))
  if (!cid) return []
  try {
    const { data, error } = await supabase
      .from("tax_codes")
      .select("id, company_id, name, rate, scope, is_active, created_at")
      .eq("company_id", cid)
      .order("rate", { ascending: true })
    if (error) throw error
    return data || []
  } catch (err) {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("tax_codes") : null
      const parsed = raw ? JSON.parse(raw) : []
      return (parsed || []).filter((c: any) => c.company_id === cid)
    } catch {
      return []
    }
  }
}

export async function createTaxCode(
  supabase: any,
  input: { name: string; rate: number; scope: "sales" | "purchase" | "both"; is_active?: boolean },
  companyId?: string,
): Promise<TaxCode> {
  const cid = companyId || (await getActiveCompanyId(supabase))
  if (!cid) throw new Error("لا توجد شركة فعالة")
  const payload = { company_id: cid, name: input.name.trim(), rate: Math.max(0, input.rate), scope: input.scope, is_active: input.is_active ?? true }
  try {
    const { data, error } = await supabase
      .from("tax_codes")
      .insert(payload)
      .select("id, company_id, name, rate, scope, is_active, created_at")
      .single()
    if (error) throw error
    // also persist to localStorage snapshot
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("tax_codes") : null
      const arr = raw ? JSON.parse(raw) : []
      const next = Array.isArray(arr) ? arr : []
      next.push(data)
      if (typeof window !== "undefined") localStorage.setItem("tax_codes", JSON.stringify(next))
    } catch {}
    return data
  } catch (err) {
    // Fallback to localStorage if server insert fails
    const fallback: TaxCode = {
      id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      company_id: cid,
      name: payload.name,
      rate: payload.rate,
      scope: payload.scope,
      is_active: payload.is_active,
      created_at: new Date().toISOString(),
    }
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("tax_codes") : null
      const arr = raw ? JSON.parse(raw) : []
      const next = Array.isArray(arr) ? arr : []
      next.push(fallback)
      if (typeof window !== "undefined") localStorage.setItem("tax_codes", JSON.stringify(next))
    } catch {}
    return fallback
  }
}

export async function deleteTaxCode(supabase: any, id: string): Promise<void> {
  try {
    const { error } = await supabase.from("tax_codes").delete().eq("id", id)
    if (error) throw error
  } catch (err) {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("tax_codes") : null
      const arr = raw ? JSON.parse(raw) : []
      const next = (Array.isArray(arr) ? arr : []).filter((c: any) => c.id !== id)
      if (typeof window !== "undefined") localStorage.setItem("tax_codes", JSON.stringify(next))
    } catch {}
  }
}

export async function ensureDefaultsIfEmpty(supabase: any, companyId?: string): Promise<void> {
  const cid = companyId || (await getActiveCompanyId(supabase))
  if (!cid) return
  try {
    const { data, error } = await supabase
      .from("tax_codes")
      .select("id")
      .eq("company_id", cid)
      .limit(1)
    if (error) throw error
    if (Array.isArray(data) && data.length > 0) return
    const defaults = [
      { company_id: cid, name: "بدون ضريبة", rate: 0, scope: "both", is_active: true },
      { company_id: cid, name: "VAT 5%", rate: 5, scope: "both", is_active: true },
      { company_id: cid, name: "VAT 15%", rate: 15, scope: "both", is_active: true },
    ]
    const { error: insertError } = await supabase.from("tax_codes").insert(defaults)
    if (insertError) throw insertError
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("tax_codes") : null
      const arr = raw ? JSON.parse(raw) : []
      const next = Array.isArray(arr) ? arr : []
      next.push(...defaults.map((d, i) => ({ id: `seed-${cid}-${i}`, created_at: new Date().toISOString(), ...d })))
      if (typeof window !== "undefined") localStorage.setItem("tax_codes", JSON.stringify(next))
    } catch {}
  } catch (err) {
    // Fallback seed in localStorage when table is missing or RLS blocks
    try {
      const defaults = [
        { company_id: cid, name: "بدون ضريبة", rate: 0, scope: "both", is_active: true },
        { company_id: cid, name: "VAT 5%", rate: 5, scope: "both", is_active: true },
        { company_id: cid, name: "VAT 15%", rate: 15, scope: "both", is_active: true },
      ]
      const raw = typeof window !== "undefined" ? localStorage.getItem("tax_codes") : null
      const arr = raw ? JSON.parse(raw) : []
      const next = Array.isArray(arr) ? arr : []
      next.push(...defaults.map((d, i) => ({ id: `seed-${cid}-${i}`, created_at: new Date().toISOString(), ...d })))
      if (typeof window !== "undefined") localStorage.setItem("tax_codes", JSON.stringify(next))
    } catch {}
  }
}

