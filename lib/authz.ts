import { getActiveCompanyId } from "@/lib/company"

export async function canAction(supabase: any, resource: string, action: "read"|"write"|"update"|"delete") {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const cid = await getActiveCompanyId(supabase)
  if (!cid) return false
  const { data: myMember } = await supabase
    .from("company_members")
    .select("role")
    .eq("company_id", cid)
    .eq("user_id", user.id)
    .maybeSingle()
  const role = String(myMember?.role || "")
  if (["owner","admin"].includes(role)) return true
  const { data: perm } = await supabase
    .from("company_role_permissions")
    .select("can_read,can_write,can_update,can_delete,all_access")
    .eq("company_id", cid)
    .eq("role", role)
    .eq("resource", resource)
    .maybeSingle()
  if (!perm) return false
  if ((perm as any).all_access) return true
  if (action === "read") return !!perm.can_read
  if (action === "write") return !!perm.can_write
  if (action === "update") return !!perm.can_update
  if (action === "delete") return !!perm.can_delete
  return false
}