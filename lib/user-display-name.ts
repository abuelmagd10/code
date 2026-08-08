/**
 * lib/user-display-name.ts — بيتٌ واحدٌ لاسمِ المستخدم.
 * ---------------------------------------------------------------------------
 * سؤالٌ يتكرّر فى المشروع: «ما اسمُ صاحبِ هذا المعرِّف؟» وكان يُجاب عليه فى
 * كلِّ شاشةٍ على حِدة، فاختلفت الإجابات، وفى موضعٍ منها سُئل جدولٌ اسمُه
 * `profiles` **لا وجودَ له فى القاعدة**، فكان الجوابُ دائماً «Unknown».
 *
 * والترتيبُ هنا هو الترتيبُ الذى استقرّ عليه المشروع فى مسار طاقم الخدمات:
 *   ١) `employees.full_name` — الاسمُ الرسمىُّ فى الموارد البشريّة، وهو
 *      الأصدق لأنّه الاسمُ الذى تتعامل به الشركة.
 *   ٢) `user_profiles.display_name` ثمّ `username`.
 *   ٣) `company_members.email`.
 *
 * ولا يُختلق اسم: إن لم يُعرف، يعود `null` — **ولا يُقال «Unknown»**.
 * فرسالةٌ تمنعك وتأبى أن تقول لك مِمَّن تطلب أسوأُ من رسالةٍ لا تدّعى معرفة.
 * ---------------------------------------------------------------------------
 */

export async function resolveUserDisplayName(
  supabase: any,
  companyId: string,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!companyId || !userId) return null

  const { data: member } = await supabase
    .from("company_members")
    .select("email, employee_id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle()

  if (member?.employee_id) {
    const { data: emp } = await supabase
      .from("employees")
      .select("full_name")
      .eq("id", member.employee_id)
      .maybeSingle()
    const full = (emp?.full_name || "").trim()
    if (full) return full
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name, username")
    .eq("user_id", userId)
    .maybeSingle()

  const display = (profile?.display_name || "").trim()
  if (display) return display
  const username = (profile?.username || "").trim()
  if (username) return username

  const email = (member?.email || "").trim()
  if (email) return email

  return null
}
