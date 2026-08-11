-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.13 — **ولا اسمَ بلا بيت**
-- ═══════════════════════════════════════════════════════════════════════════
-- ثلاثةُ أعمدةٍ تحملُ أسماءَ وظائفَ وصلاحيّات، وكلٌّ منها كان يُحرَسُ بطريقةٍ
-- أخرى — أو لا يُحرَسُ أصلاً:
--
--   • `company_role_permissions.role` : قيدٌ نصّىٌّ مكتوبٌ بيدٍ يقبل **١٢** اسماً.
--   • `company_members.role`          : قيدٌ نصّىٌّ يقبل **١١** — وهو مصدرُ
--                                        `erp_membership_roles()`، أى المفرداتُ الحيّة.
--   • `role_default_permissions`      : **بلا قيدٍ إطلاقاً** — يقبلُ أىَّ نصٍّ يُكتب.
--
-- فالاسمُ الثانى عشر (`general_manager`) بابٌ فى قيدٍ لا يسكنُه أحد: **صفرُ
-- صفوفٍ وصفرُ أعضاء**. وقالبُ البذرِ يقرأُ من عمودٍ بلا قيد، فخطأٌ مطبعىٌّ فى
-- هجرةٍ يمرُّ صامتاً ولا يشتكى أحد — والشركةُ التاليةُ تُولدُ ناقصةً.
--
-- ═══ فالعلاجُ بيتٌ واحدٌ للأسماء ═══
--
-- جدولُ `roles` هو بيتُ الأسماء (١١ اسماً)، ومنه يقرأُ بذّارُ القالبِ أصلاً.
-- فتُربَطُ به الأعمدةُ برباطٍ حقيقىّ لا بقائمةٍ مكتوبةٍ بيد. **ولا يُنادى اسمٌ
-- يسكنُه غيرُه** — وما ليس فى البيتِ لا يدخلُ عموداً.
--
-- ولا يُمَسُّ `company_members`: قيدُه هو **البيتُ المُعلَنُ للعضويّة** وتقرؤه
-- دالّةُ المفردات. ويحرسُ الفحصُ المرجعىُّ أن يبقى البيتانِ قولاً واحداً،
-- فلا يُضافُ اسمٌ إلى أحدِهما ويُنسى الآخَر.
--
-- ═══ ما قِيس قبل أن يُلمَسَ شىء ═══
--
--   • الأسماءُ فى `roles` ≡ المفرداتُ الحيّة ≡ المستعمَلُ فى الصلاحيّات: ١١، متطابقة.
--   • **صفرُ صفوفٍ يتيمة** فى الأعمدةِ الثلاثةِ جميعاً (١٤٦٦ + ٩٦٩ صفّاً).
--   • الكاتبُ الوحيدُ لجدولِ الصلاحيّاتِ شاشةُ «صلاحيّات الأدوار»، وقائمتُها
--     تُبنى من `ERP_ROLES` فى `lib/roles.ts` — **ولا `general_manager` فيها**.
--   • ولا سطرَ فى المشروعِ كلِّه يكتبُ فى `role_default_permissions`.
--   • وكلُّ ذكرٍ لـ`general_manager` فى الكودِ **داخلَ تعليقٍ** يشرحُ أنّه أُزيل.
--
-- **فلا أحدَ يفقدُ شيئاً يفعلُه اليوم.**
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ (١) عمودُ الصلاحيّاتِ يُربَطُ ببيتِ الأسماءِ لا بقائمةٍ مكتوبةٍ بيد ═══
ALTER TABLE public.company_role_permissions
  DROP CONSTRAINT IF EXISTS company_role_permissions_role_check_v2;

ALTER TABLE public.company_role_permissions
  ADD CONSTRAINT company_role_permissions_role_fkey
  FOREIGN KEY (role) REFERENCES public.roles(name)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

-- ═══ (٢) وقالبُ البذرِ لا يقرأُ من عمودٍ بلا قيد ═══
ALTER TABLE public.role_default_permissions
  ADD CONSTRAINT role_default_permissions_role_name_fkey
  FOREIGN KEY (role_name) REFERENCES public.roles(name)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

ALTER TABLE public.role_default_permissions
  ADD CONSTRAINT role_default_permissions_permission_action_fkey
  FOREIGN KEY (permission_action) REFERENCES public.permissions(action)
  ON UPDATE RESTRICT ON DELETE RESTRICT;

-- ═══ (٣) الفحصُ المرجعىّ ═══
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_13_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_home   text[];
  v_live   text[];
  v_invite text[];
  v_bad    text;
  v_ok     boolean;
BEGIN
  -- ═══ (أ) البيوتُ تقولُ قولاً واحداً ═══
  SELECT array_agg(name ORDER BY name) INTO v_home FROM public.roles;
  SELECT array_agg(x ORDER BY x) INTO v_live FROM unnest(public.erp_membership_roles()) x;
  SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_invite
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  CROSS JOIN LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') m
  WHERE n.nspname = 'public' AND t.relname = 'company_invitations'
    AND c.conname = 'company_invitations_role_check';

  IF v_home IS NULL OR array_length(v_home, 1) = 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: بيتُ الأسماءِ فارغ — بحثٌ لا يجد ليس دليلَ غياب (v3.75.13)';
  END IF;
  IF v_home IS DISTINCT FROM v_live THEN
    RAISE EXCEPTION 'BASELINE FAIL: بيتُ الأسماءِ يخالفُ المفرداتِ الحيّة: % مقابل % (v3.75.13)', v_home, v_live;
  END IF;
  IF v_home IS DISTINCT FROM v_invite THEN
    RAISE EXCEPTION 'BASELINE FAIL: بيتُ الأسماءِ يخالفُ قيدَ الدعوات: % مقابل % (v3.75.13)', v_home, v_invite;
  END IF;

  -- ═══ (ب) والأعمدةُ الثلاثةُ مربوطةٌ ببيتٍ حقيقىّ — تُقاسُ بالرباطِ لا بالاسم ═══
  SELECT string_agg(t, ' · ') INTO v_bad FROM (
    SELECT x.tbl || '.' || x.col AS t
    FROM (VALUES
      ('company_role_permissions', 'role', 'roles'),
      ('role_default_permissions', 'role_name', 'roles'),
      ('role_default_permissions', 'permission_action', 'permissions')
    ) AS x(tbl, col, ref)
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class src ON src.oid = c.conrelid
      JOIN pg_class tgt ON tgt.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = src.oid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND src.relname = x.tbl AND tgt.relname = x.ref
        AND a.attname = x.col AND array_length(c.conkey, 1) = 1
    )
  ) s;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: عمودٌ يحملُ اسماً بلا رباطٍ ببيتِه: % (v3.75.13)', v_bad;
  END IF;

  -- ═══ (ج) ولا قائمةَ أسماءٍ مكتوبةً بيدٍ تعودُ بجانبِ الرباط ═══
  -- **وبابٌ ثانٍ بجوارِ البابِ المحروسِ يُبطلُ الحراسة**، وقائمةٌ نصّيّةٌ تجمُد
  -- بينما البيتُ ينمو.
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'company_role_permissions'
      AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ~ '''owner''::text'
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: عادت قائمةُ أسماءٍ مكتوبةٌ بيدٍ على جدولِ الصلاحيّات (v3.75.13)';
  END IF;

  -- ═══ (د) والفخُّ يُشغَّلُ حقّاً — ثمّ يُلغى ═══
  -- **فخٌّ لا يُشغَّل ليس فخّاً**: يُحاوَلُ إدخالُ اسمٍ لا بيتَ له، فيجب أن
  -- ترفضَه القاعدةُ نفسُها. والمحاولةُ فى معاملةٍ فرعيّةٍ تُلغى فلا يبقى أثر.
  -- **ولا يُقرأُ فراغٌ ويُسمّى سلاماً**: بلا شركةٍ لا يُشغَّلُ الفخُّ أصلاً.
  IF NOT EXISTS (SELECT 1 FROM public.companies) THEN
    RAISE EXCEPTION 'BASELINE FAIL: لا شركةَ واحدةً فلا يُشغَّلُ الفخّ — بحثٌ لا يجد ليس دليلَ غياب (v3.75.13)';
  END IF;
  v_ok := false;
  BEGIN
    INSERT INTO public.company_role_permissions (company_id, role, resource)
    SELECT c.id, 'zz_no_such_role', 'zz_probe_v3_75_13' FROM public.companies c LIMIT 1;
    -- إن وصلنا هنا فالبابُ مفتوح
  EXCEPTION
    WHEN foreign_key_violation THEN v_ok := true;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'BASELINE FAIL: قُبِل اسمُ وظيفةٍ لا بيتَ له (v3.75.13)';
  END IF;

  -- **ولا يصرخُ على البرىء**: اسمٌ له بيتٌ يجب أن يُقبَل.
  v_ok := true;
  BEGIN
    INSERT INTO public.company_role_permissions (company_id, role, resource)
    SELECT c.id, r.name, 'zz_probe_v3_75_13' FROM public.companies c, public.roles r
    WHERE r.name = 'accountant' LIMIT 1;
    RAISE EXCEPTION 'ZZ_ROLLBACK_PROBE';
  EXCEPTION
    WHEN foreign_key_violation THEN v_ok := false;
    WHEN others THEN
      IF SQLERRM <> 'ZZ_ROLLBACK_PROBE' THEN RAISE; END IF;
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'BASELINE FAIL: رُفض اسمٌ له بيتٌ — الحارسُ يصرخ على البرىء (v3.75.13)';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_13_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_13_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_13_check() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_13_check() TO service_role;
