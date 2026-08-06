-- v3.74.972 — القارئُ المفتوحُ يُغلق.
--
-- لوحةُ التحكّم صاحت: «دوالُّ تقرأ بياناتِ شركةٍ ويمكن نداؤها بدون تسجيل دخول».
-- والسببُ أنّ PostgreSQL يمنح PUBLIC حقَّ التنفيذِ على كلِّ دالّةٍ جديدةٍ
-- تلقائياً، ودورُ anon يرث PUBLIC. فكلُّ دالّةِ SECURITY DEFINER تقرأ بيانات
-- شركةٍ ولا تسأل عن هويّة المُنادى تصير باباً مفتوحاً لمن لم يسجّل دخولاً.
--
-- ═══ وهذا انتكاسٌ لا اكتشاف ═══
--
-- ٩٦٣ عالج هذا المرضَ بعينه وأغلق البابَ على ١٥٥ دالة. ثمّ فتحتُه أنا مرّةً
-- أخرى: ٩٦٤ كتب can_delete_data غلافاً، و٩٦٨ كتب erp_is_company_senior،
-- و٩٧٠ كتب can_access_bill غلافاً — وكلُّ دالّةٍ جديدةٍ تولد ومعها منحةُ
-- PUBLIC تلقائياً. فعاد الانحرافُ ثلاثةً.
--
-- والأسوأُ أنّ الحارسَ كان موجوداً: scripts/check-anon-reachable-functions.js
-- كُتب فى ٩٦٣ ويقيس نفسَ الخاصّيّة حرفاً بحرف. لكنّه لم يكن فى قائمةِ الحُرّاس
-- التى تُنسخ يدوياً فى كلِّ سكربتِ دفع — فبقى مكتوباً ولم يُشغَّل. حارسٌ لا
-- يُشغَّل ليس حارساً.
--
-- ولا يُغلق البابُ بأسماءٍ أعدّها بيدى اليوم — فما نسيتُه يبقى مفتوحاً. يُغلق
-- بالخاصّيّة نفسِها التى يقيسها الفحصُ ic_anon_reachable_readers حرفاً بحرف،
-- فما يجده الفحصُ غداً يكون قد أُغلق اليوم.
--
-- والمستثنَون بحقّ (لا يُمسّون):
--   • ما تستعمله قواعدُ الرؤية RLS — لأنّ الزائرَ غيرَ المسجَّل يحتاجها ليُقاس
--     عليه المنعُ فيُردّ بلا صفوف، لا أن يُردَّ بخطأ.
--   • دوالُّ تسجيل الدخول (البحثُ عن مستخدم، توفّرُ اسم) — بابُها مفتوحٌ عمداً.
--   • ما يكتب، وما يسأل auth.uid() بنفسه، ودوالُّ الزناد.
--
-- ويبقى المسجَّلون: GRANT للمصادَق عليه ولدور الخدمة — فلا ينكسر عملٌ قائم.
--
-- ═══ القياسُ قبل وبعد ═══
--
-- الاختبار : ١٠ قرّاءٍ مفتوحين → صفر. مسجَّلٌ يرى ٣ فواتير و٦ بنودٍ كما كان.
-- الإنتاج  : ٣ قرّاءٍ مفتوحين → صفر. مسؤولُ المخزن يرى ٦ فواتير و١٠ بنودٍ
--            كما كان تماماً. والمجهولُ يُردّ: permission denied.
--            ولوحةُ السلامة: انحرافٌ واحد → صفر.

DO $$
DECLARE
  v_sig  text;
  v_n    int := 0;
BEGIN
  FOR v_sig IN
    WITH policy_text AS (
      SELECT string_agg(coalesce(pg_get_expr(pol.polqual, pol.polrelid),'') || ' ' ||
                        coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),''), ' ') AS body
      FROM pg_policy pol
    )
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    CROSS JOIN policy_text pt
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.prorettype <> 'trigger'::regtype
      AND p.prosrc !~* '\m(INSERT INTO|UPDATE |DELETE FROM)\M'
      AND p.prosrc NOT ILIKE '%assert_company_access%'
      AND p.prosrc NOT ILIKE '%auth.uid()%'
      AND p.prosrc ~* 'company_id'
      AND pg_get_function_identity_arguments(p.oid) <> ''
      AND pt.body !~ ('\m' || p.proname || '\s*\(')
      AND p.proname NOT IN ('find_user_by_login','check_username_available',
                            'generate_username_from_email','get_user_company_status')
    ORDER BY 1
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO authenticated', v_sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role', v_sig);
    v_n := v_n + 1;
    RAISE NOTICE 'v3.74.972 أُغلق: %', v_sig;
  END LOOP;

  RAISE NOTICE 'v3.74.972 — أُغلق % قارئاً مفتوحاً.', v_n;
END $$;
