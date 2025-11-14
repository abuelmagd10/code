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
  const { data, error } = await supabase
    .from("tax_codes")
    .select("id, company_id, name, rate, scope, is_active, created_at")
    .eq("company_id", cid)
    .order("rate", { ascending: true })
  if (error) throw error
  return data || []
}

export async function createTaxCode(
  supabase: any,
  input: { name: string; rate: number; scope: "sales" | "purchase" | "both"; is_active?: boolean },
  companyId?: string,
): Promise<TaxCode> {
  const cid = companyId || (await getActiveCompanyId(supabase))
  if (!cid) throw new Error("لا توجد شركة فعالة")
  const payload = { company_id: cid, name: input.name.trim(), rate: Math.max(0, input.rate), scope: input.scope, is_active: input.is_active ?? true }
  const { data, error } = await supabase
    .from("tax_codes")
    .insert(payload)
    .select("id, company_id, name, rate, scope, is_active, created_at")
    .single()
  if (error) throw error
  return data
}

export async function deleteTaxCode(supabase: any, id: string): Promise<void> {
  const { error } = await supabase.from("tax_codes").delete().eq("id", id)
  if (error) throw error
}

export async function ensureDefaultsIfEmpty(supabase: any, companyId?: string): Promise<void> {
  const cid = companyId || (await getActiveCompanyId(supabase))
  if (!cid) return
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
}

