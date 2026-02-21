/**
 * جلب الفرع الافتراضي للشركة (أول فرع رئيسي أو أول فرع نشط).
 * مطلوب بعد migration 20260221_010: journal_entries.branch_id NOT NULL.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * يُرجع branch_id للفرع الرئيسي أو أول فرع نشط للشركة.
 * يُستخدم كاحتياطي عند إنشاء قيود يومية عندما لا يكون للمستند/المستخدم فرع محدد.
 */
export async function getDefaultBranchIdForCompany(
  supabase: SupabaseClient,
  companyId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("branches")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("is_main", { ascending: false })
    .order("name")
    .limit(1)
    .maybeSingle()

  return data?.id ?? null
}
