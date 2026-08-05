-- v3.74.962 — لا نداءَ مرتفعَ الصلاحية بلا جلسة
-- ============================================================================
-- لوحةُ سلامة النظام رفعت انحرافاً واحداً: «دوالُّ تقرأ بيانات شركة ويمكن
-- نداؤها بدون تسجيل دخول». وهو صحيحٌ وأخطرُ ممّا يبدو.
--
-- المقيسُ على الإنتاج: دوالٌّ SECURITY DEFINER — أى تعمل بصلاحية مالك
-- القاعدة وتتجاوز حمايةَ الصفوف — مُنح PUBLIC حقَّ نداءِها، وPUBLIC يشمل
-- الزائرَ المجهول. وأكثرُها لا يسأل عن هوية المنادِى أصلاً، بل **يستقبل
-- هوية الفاعل وسيطاً** (p_user_id, p_approver_id, p_actor_user_id) فيصدّقها
-- كما جاءت.
--
-- وأُثبت الاستغلالُ فعلاً، بهوية anon داخل معاملةٍ مُرجَعة:
--     select public.get_user_company_status('<uuid المالك>')
-- فأعادت رقمَ الشركة وحالةَ الاشتراك وعددَ المقاعد — بلا تسجيل دخول.
--
-- وفى القائمة ما هو أخطرُ من القراءة: void_invoice_atomic و void_bill_atomic
-- و reverse_journal_entry و restore_company_backup و
-- reassign_user_data_and_remove — أفعالٌ ماليةٌ وإداريةٌ ثقيلة.
--
-- والعلاج: يُسحب حقُّ النداء من PUBLIC ومن anon، ويُمنح صراحةً للمستخدم
-- المسجَّل وللخادم الداخلىّ. ولا يُمسّ:
--   • ما لا يلمس بيانات شركة (find_user_by_login مثلاً — وعليه يقوم الدخول).
--   • دوالُّ الحراسة can_% و ic_user_can% — فهى تُنادى داخل سياسات الرؤية
--     نفسِها، وسحبُها من anon يُحوّل «لا ترى شيئاً» إلى خطأ.
--
-- الإثباتُ على الاختبار ثمّ على الإنتاج، داخل معاملاتٍ مُرجَعة:
--   anon يقرأ حالةَ الشركة        → permission denied
--   anon يبحث عن مستخدمٍ للدخول   → باقٍ يعمل (الدخولُ سليم)
--   المستخدمُ المسجَّل يقرأ حالتَه  → باقٍ يعمل
--   والباقى مفتوحاً للمجهول بعد التنفيذ: صفر.
-- ============================================================================

DO $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
      JOIN pg_type t ON t.oid = p.prorettype
     WHERE ns.nspname = 'public'
       AND p.prokind = 'f'
       AND p.prosecdef
       AND t.typname <> 'trigger'
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND p.prosrc ~* 'company_id|companies'
       AND p.prosrc !~* 'auth\.uid\(\)|assert_company_access|can_modify_data|is_owner_or_admin|is_company_member|has_company_access|get_user_company_ids|can_delete_data|ic_user_can'
       AND p.proname !~ '^(can_|ic_user_can)'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'v3.74.962: أُغلق نداءُ % دالةً على الزائر المجهول.', n;
END $$;
