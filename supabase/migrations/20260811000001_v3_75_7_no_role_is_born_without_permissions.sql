-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.7 — ولا تُولَدُ وظيفةٌ بلا صلاحيّات
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ ما الذى كان ═══
--
-- عند إنشاءِ أىِّ شركةٍ يعملُ **بذّاران** لا واحد:
--   • copy_default_permissions_for_company  → يقرأُ القالبَ ويعرفُ ٧ وظائف
--   • trg_auto_seed_role_permissions        → قائمةٌ مكتوبةٌ بيدها تعرفُ ٧ أُخرى
-- ومجموعُهما **عشرُ وظائفَ من إحدى عشرة**. والغائبةُ عن **كليهما**:
-- مسؤولُ الموارد البشريّة.
--
-- فكانت النتيجةُ مقيسةً على القاعدةِ الحيّة: خمسُ شركاتٍ من ستٍّ **بلا صفٍّ
-- واحدٍ** لهذه الوظيفة. وقاعدةُ النظامِ عند غيابِ الصفِّ هى المنعُ لا السماح.
-- والواجهةُ فى الوقتِ نفسِه تفتحُ له عشرَ شاشاتٍ من قائمةِ احتياطٍ فى الكود.
-- فيرى صاحبُها الأبوابَ ولا تُفتَحُ له واحدة.
--
-- **وقائمةٌ تنقصُ اسماً تُخطئ بصمت.**
--
-- ═══ ما الذى تفعلُه هذه الهجرة ═══
--
-- (١) بيتٌ واحدٌ يبذرُ صلاحيّاتِ هذه الوظيفة، على نفسِ نمطِ
--     seed_purchasing_officer_returns_permissions (v3.74.508).
-- (٢) يُنادى من مُشغِّلِ الإنشاء، فتولدُ به كلُّ شركةٍ جديدة.
-- (٣) **ويُنادى البيتُ نفسُه** على الشركاتِ القائمة — فلا يفترقُ القديمُ عن
--     الجديدِ أبداً، لأنّ مصدرَهما واحد.
--
-- ═══ ومن أين جاءت الصفوف ═══
--
-- **لا اختراع.** المصدرُ شركةُ «تست»، وهى الوحيدةُ التى مُنح فيها هذا الدورُ
-- يوماً، ويؤكّدُها بيتُ الكودِ الواحد lib/role-default-pages.ts الذى يُسمّى
-- الشاشاتِ نفسَها. مصدرانِ مستقلّانِ يتّفقان.
--
-- ═══ والأحوطُ صراحةً ═══
--
-- ON CONFLICT DO NOTHING — لا **DO UPDATE**. فإن كان للشركةِ صفٌّ لهذه
-- الوظيفةِ فقرارُ مالكِها أَولى من قرارِنا. **ولا يُكتب فوق اختيارِ صاحبِ
-- البيت.** (وخلافاً لبذّارِ ٥٠٨ الذى يُحدِّث، وذلك عن قصدٍ مذكور.)
--
-- ولا يُمَسُّ صفٌّ قائم، ولا تُحذَفُ صلاحيّةٌ، ولا تُمَسُّ وظيفةٌ أخرى:
-- الضبّاطُ الثلاثةُ الآخرون كاملون فى الشركاتِ الستِّ جميعاً، فلم يُكتب لهم حرف.
--
-- والمقاعدُ لا تُمَسّ: المقعدُ يُشترى للشخصِ لا للوظيفة، والبوّابتانِ
-- متتابعتانِ لا متنافستان. فلا عضوَ يُنشأ، ولا مقعدَ يُستهلك، ولا دفعَ يُتجاوَز.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ (١) بيتُ البذرِ الواحدُ لهذه الوظيفة ═══
CREATE OR REPLACE FUNCTION public.seed_hr_officer_permissions(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- الموارد السبعة كما هى فى الشركة الوحيدة التى مُنح فيها هذا الدور،
  -- ويؤكّدها بيت الكود lib/role-default-pages.ts.
  insert into public.company_role_permissions
    (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access)
  values
    (p_company_id, 'hr_officer', 'employees',    true, true, true,  true,  true,  false),
    (p_company_id, 'hr_officer', 'payroll',      true, true, true,  true,  true,  false),
    (p_company_id, 'hr_officer', 'attendance',   true, true, true,  true,  true,  false),
    (p_company_id, 'hr_officer', 'branches',     true, true, false, false, false, false),
    (p_company_id, 'hr_officer', 'cost_centers', true, true, false, false, false, false),
    (p_company_id, 'hr_officer', 'dashboard',    true, true, false, false, false, false),
    (p_company_id, 'hr_officer', 'reports',      true, true, false, false, false, false)
  on conflict (company_id, role, resource) do nothing;
end;
$function$;

-- **وأقلُّ صلاحيّةٍ تكفى**: دالّةٌ تكتب بصلاحيّاتٍ كاملةٍ لا تُسلَّم للمستخدم.
-- (نفسُ ما فُعل بـ seed_purchasing_officer_returns_permissions و seed_reports_access_v581.)
REVOKE ALL ON FUNCTION public.seed_hr_officer_permissions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_hr_officer_permissions(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.seed_hr_officer_permissions(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.seed_hr_officer_permissions(uuid) TO service_role;

-- ═══ (٢) يُنادى عند إنشاءِ كلِّ شركةٍ جديدة ═══
-- الجسمُ منقولٌ حرفاً بحرفٍ عمّا كان، ولم يُزَدْ فيه إلّا سطرُ النداء.
CREATE OR REPLACE FUNCTION public.trg_auto_seed_role_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  perform public.seed_default_role_permissions(new.id);
  -- v3.74.508 add-on grants
  perform public.seed_purchasing_officer_returns_permissions(new.id);
  -- v3.74.581 reports access matrix
  perform public.seed_reports_access_v581(new.id);
  -- v3.74.597: branch outlets are created by the branches INSERT
  -- trigger (the auto main branch included) — pickup seeding removed.
  -- v3.75.7: مسؤول الموارد البشرية كان غائبًا عن البذّارين معًا.
  perform public.seed_hr_officer_permissions(new.id);
  return new;
end;
$function$;

-- ═══ (٣) والبيتُ نفسُه يُنادى للشركاتِ القائمة ═══
DO $$
DECLARE r record; v_before int; v_after int;
BEGIN
  SELECT count(*) INTO v_before FROM public.company_role_permissions WHERE role = 'hr_officer';
  FOR r IN SELECT id FROM public.companies LOOP
    PERFORM public.seed_hr_officer_permissions(r.id);
  END LOOP;
  SELECT count(*) INTO v_after FROM public.company_role_permissions WHERE role = 'hr_officer';
  RAISE NOTICE 'v3.75.7: صفوف مسؤول الموارد البشرية % ← %', v_before, v_after;
END $$;

-- ═══ (٤) الفحصُ المرجعىّ ═══
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_7_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_vocab   text[] := public.erp_membership_roles();
  v_ncomp   int;
  v_bad     text;
  v_seen    int;
BEGIN
  SELECT count(*) INTO v_ncomp FROM public.companies;
  IF v_ncomp = 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: لا شركةَ واحدةٌ لتُفحَص — بحثٌ لا يجد ليس دليلَ غياب (v3.75.7)';
  END IF;
  IF array_length(v_vocab, 1) IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: مفرداتُ الوظائفِ فارغة (v3.75.7)';
  END IF;

  -- ═══ ولا وظيفةٌ حيّةٌ بلا صلاحيّاتٍ فى شركةٍ واحدة ═══
  SELECT string_agg(t, ' | ') INTO v_bad
  FROM (
    SELECT c.name || ' ← ' || string_agg(r.role, ', ') AS t
    FROM public.companies c
    CROSS JOIN (SELECT unnest(v_vocab) AS role) r
    WHERE NOT EXISTS (
      SELECT 1 FROM public.company_role_permissions p
      WHERE p.company_id = c.id AND p.role = r.role
    )
    GROUP BY c.name
  ) s;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: وظيفةٌ حيّةٌ بلا صلاحيّاتٍ فى شركة: % (v3.75.7)', v_bad;
  END IF;

  -- ═══ والبذّارُ يعرفُ الاسم — وإلّا وُلدت الشركةُ التاليةُ ناقصة ═══
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'seed_hr_officer_permissions'
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: بيتُ بذرِ مسؤولِ الموارد البشريّةِ غائب (v3.75.7)';
  END IF;
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'trg_auto_seed_role_permissions')
       NOT LIKE '%seed_hr_officer_permissions%' THEN
    RAISE EXCEPTION 'BASELINE FAIL: مُشغِّلُ الإنشاءِ لا ينادى بيتَ البذرِ الجديد (v3.75.7)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE c.relname = 'companies' AND p.proname = 'trg_auto_seed_role_permissions'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: مُشغِّلُ البذرِ غيرُ مركَّبٍ على جدولِ الشركات (v3.75.7)';
  END IF;

  -- ═══ ولا تُسلَّم دالّةٌ تكتبُ بصلاحيّاتٍ كاملةٍ لمستخدمٍ نهائىّ ═══
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'seed_hr_officer_permissions'
      AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
        OR has_function_privilege('anon', p.oid, 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: بيتُ البذرِ ممنوحٌ لمستخدمٍ نهائىّ (v3.75.7)';
  END IF;

  -- ═══ والفخُّ يُشغَّل: يُحجَبُ اسمٌ تخيُّلاً فيجب أن تراه الاستعلامةُ نفسُها ═══
  -- **فخٌّ لا يُشغَّل ليس فخّاً** — ويُشغَّل بلا لمسِ صفٍّ واحد.
  SELECT count(*) INTO v_seen
  FROM public.companies c
  CROSS JOIN (SELECT unnest(v_vocab) AS role) r
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_role_permissions p
    WHERE p.company_id = c.id AND p.role = r.role
      AND r.role <> 'hr_officer'
  );
  IF v_seen < v_ncomp THEN
    RAISE EXCEPTION 'BASELINE FAIL: حُجبت صفوفُ وظيفةٍ تخيُّلاً فلم ترها الاستعلامة (رأت % من %) (v3.75.7)', v_seen, v_ncomp;
  END IF;
END;
$function$;
