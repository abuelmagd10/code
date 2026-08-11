-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.8 — البذّارُ كبِرَ والقديمُ لم يُسَقْ معه
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ ما الذى كان ═══
--
-- خمسةَ عشرَ مورداً مستعمَلاً فعلاً غيرُ موجودٍ فى كتالوجِ الصلاحيّات، فلا
-- يستطيعُ بذّارُ القالبِ إنتاجَها أبداً (فهو يقرأُ منه). فتُركت لبذّارٍ مكتوبٍ
-- بيده — **وهذا البذّارُ كبِرَ مع الزمنِ ولم يلحقْ به أحدٌ من القدامى**:
--
--   • موافقاتُ الصرف · استلامُ البضاعة · طلباتُ مرتجعِ المبيعات
--     البذّارُ يعرفُها، وهى موجودةٌ فى **الشركتينِ الأحدثِ فقط**
--     (٢٠٢٦-٠٧-٢٧ و ٢٠٢٦-٠٨-٠٧). وناقصةٌ فى أربعٍ ولدت قبلَ أن يعرفَها.
--   • طلباتُ ردِّ أموالِ العملاء · طلباتُ تصحيحِ دفعِ الموردين
--     **لا يعرفُهما أىُّ بذّار**، وموجودتانِ فى شركةٍ واحدةٍ بمنحٍ قديم.
--     فلن تصلا إلى شركةٍ جديدةٍ أبداً — رغم أنّ بيتَ الكودِ الواحد
--     lib/role-default-pages.ts يُسمّيهما للمحاسبِ ومديرِ الفرع.
--
-- **وما يبذرُه البذّارُ اليومَ ليس ما تحملُه الشركاتُ القديمة.**
--
-- ═══ ولماذا وجودُ الصفِّ ليس قراراً للمالك ═══
--
-- شاشةُ «صلاحيّات الأدوار» **تُحدِّث ولا تحذف** (upsert فقط). فاختيارُ المالكِ
-- يسكنُ فى الأعلامِ (`can_access`) لا فى وجودِ الصفّ. ولذلك إضافةُ صفٍّ غائبٍ
-- لا تُلغى قراراً لأحد: هى تُعطيه المفتاحَ ليُقرِّر. **ومن لا صفَّ له لا يملكُ
-- أن يقول لا.**
--
-- ═══ ومن أين جاءت الصفوف ═══
--
-- **لا اختراع**: نُسخت حرفاً بحرفٍ عن الشركاتِ التى تملكُها اليوم — الشركتانِ
-- الأحدثُ للثلاثةِ الأُوَل، و«تست» للاثنينِ الأخيرَين. ويؤكّدُها بيتُ الكودِ
-- الواحدُ الذى يُسمّى هذه الشاشاتِ لهذه الوظائفِ بعينِها.
--
-- ═══ والأثرُ مقيسٌ ومُعلَن ═══
--
-- ٥٤ صفّاً يُضاف. منها ٤٣ فى ثلاثِ شركاتٍ ليس فيها إلّا المالكُ فلا أثرَ
-- لإنسان، و١١ فى شركةٍ واحدةٍ تمنحُ أربعةَ أشخاصٍ يعملون ثلاثَ شاشاتٍ
-- **بموافقةِ صاحبِ المشروعِ صراحةً بعدَ عرضِ الأثرِ عليه**.
-- ولا صفٌّ قائمٌ يُعدَّل (DO NOTHING)، ولا صفٌّ يُحذَف.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ (١) بيتُ بذرٍ واحدٌ للموارد التى تأخّرت ═══
CREATE OR REPLACE FUNCTION public.seed_late_added_resources_permissions(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  insert into public.company_role_permissions
    (company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access)
  values
    -- موافقات الصرف (منقولة عن الشركتين الأحدث)
    (p_company_id, 'accountant',         'dispatch_approvals',      true, true, false, false, false, false),
    (p_company_id, 'manager',            'dispatch_approvals',      true, true, false, false, false, false),
    (p_company_id, 'purchasing_officer', 'dispatch_approvals',      true, true, false, false, false, false),
    (p_company_id, 'store_manager',      'dispatch_approvals',      true, true, true,  true,  true,  false),
    -- استلام البضاعة
    (p_company_id, 'accountant',         'inventory_goods_receipt', true, true, false, false, false, false),
    (p_company_id, 'manager',            'inventory_goods_receipt', true, true, false, false, false, false),
    (p_company_id, 'purchasing_officer', 'inventory_goods_receipt', true, true, false, false, false, false),
    (p_company_id, 'store_manager',      'inventory_goods_receipt', true, true, true,  true,  true,  false),
    -- طلبات مرتجع المبيعات
    (p_company_id, 'accountant',         'sales_return_requests',   true, true, true,  true,  false, false),
    (p_company_id, 'manager',            'sales_return_requests',   true, true, false, false, false, false),
    (p_company_id, 'store_manager',      'sales_return_requests',   true, true, true,  true,  false, false),
    -- طلبات رد أموال العملاء (منقولة عن الشركة الوحيدة التى تملكها)
    (p_company_id, 'accountant',         'customer_refund_requests', true, true, false, false, false, false),
    -- طلبات تصحيح دفع الموردين
    (p_company_id, 'accountant',         'vendor_payment_correction_requests', true, true, true, false, false, false),
    -- التقارير المالية: موجودة فى الشركات الست كلها بهجرة قديمة، ولا بذّار
    -- يعرفها — فشركة تولد غدًا لا تأخذها. **وما يُصلَح للقديم يجب أن يُولد به الجديد.**
    (p_company_id, 'owner',              'financial_reports',       true, true, false, false, false, false),
    (p_company_id, 'admin',              'financial_reports',       true, true, false, false, false, false)
  on conflict (company_id, role, resource) do nothing;
end;
$function$;

-- **وأقلُّ صلاحيّةٍ تكفى**
REVOKE ALL ON FUNCTION public.seed_late_added_resources_permissions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_late_added_resources_permissions(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.seed_late_added_resources_permissions(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.seed_late_added_resources_permissions(uuid) TO service_role;

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
  -- v3.75.8: موارد تأخّرت عن الشركات القديمة، واثنان لم يعرفهما بذّار قط.
  perform public.seed_late_added_resources_permissions(new.id);
  return new;
end;
$function$;

-- ═══ (٣) والبيتُ نفسُه يُنادى للشركاتِ القائمة ═══
DO $$
DECLARE r record; v_before int; v_after int;
BEGIN
  SELECT count(*) INTO v_before FROM public.company_role_permissions;
  FOR r IN SELECT id FROM public.companies LOOP
    PERFORM public.seed_late_added_resources_permissions(r.id);
  END LOOP;
  SELECT count(*) INTO v_after FROM public.company_role_permissions;
  RAISE NOTICE 'v3.75.8: صفوف الصلاحيات % ← % (أُضيف %)', v_before, v_after, v_after - v_before;
END $$;

-- ═══ (٤) الفحصُ المرجعىّ ═══
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_8_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_ncomp  int;
  v_nres   int;
  v_bad    text;
  v_seen   int;
BEGIN
  SELECT count(*) INTO v_ncomp FROM public.companies;
  SELECT count(DISTINCT resource) INTO v_nres FROM public.company_role_permissions;
  IF v_ncomp = 0 OR v_nres = 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: لا شركةَ أو لا مورد — بحثٌ لا يجد ليس دليلَ غياب (v3.75.8)';
  END IF;

  -- ═══ ولا موردٌ يعرفُه بعضُ الشركاتِ ويجهلُه بعضُها ═══
  -- وجودُ الصفِّ ليس قرارَ المالك: شاشتُه تُحدِّث ولا تحذف.
  SELECT string_agg(t, ' | ') INTO v_bad
  FROM (
    SELECT x.resource || ' ← ينقص ' || count(*)::text || ' شركة' AS t
    FROM (SELECT DISTINCT resource FROM public.company_role_permissions) x
    CROSS JOIN public.companies c
    WHERE NOT EXISTS (
      SELECT 1 FROM public.company_role_permissions p
      WHERE p.company_id = c.id AND p.resource = x.resource
    )
    GROUP BY x.resource
  ) s;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: موردٌ موجودٌ فى شركةٍ وغائبٌ عن أخرى: % (v3.75.8)', v_bad;
  END IF;

  -- ═══ والبذّارُ الجديدُ مُنادًى ومحجوبٌ عن المستخدم ═══
  IF (SELECT prosrc FROM pg_proc WHERE proname = 'trg_auto_seed_role_permissions')
       NOT LIKE '%seed_late_added_resources_permissions%' THEN
    RAISE EXCEPTION 'BASELINE FAIL: مُشغِّلُ الإنشاءِ لا ينادى بيتَ البذرِ الجديد (v3.75.8)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'seed_late_added_resources_permissions'
      AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
        OR has_function_privilege('anon', p.oid, 'EXECUTE'))
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: بيتُ البذرِ ممنوحٌ لمستخدمٍ نهائىّ (v3.75.8)';
  END IF;

  -- ═══ وما تحملُه الشركاتُ يجب أن يُولَدَ به الجديد ═══
  -- موردٌ مستعمَلٌ لا يعرفُه بذّارٌ ولا كتالوجٌ = شركةٌ تُولدُ غداً بلا هذا الباب.
  SELECT string_agg(x.resource, ', ') INTO v_bad
  FROM (SELECT DISTINCT resource FROM public.company_role_permissions) x
  WHERE NOT EXISTS (SELECT 1 FROM public.permissions pm WHERE pm.resource = x.resource)
    AND (SELECT string_agg(prosrc, E'\n') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND (
           p.proname = 'trg_auto_seed_role_permissions'
           OR p.proname IN (SELECT m[1] FROM pg_proc q,
                 LATERAL regexp_matches(q.prosrc, 'perform\s+public\.([a-z_]+)\s*\(', 'gi') m
               WHERE q.proname = 'trg_auto_seed_role_permissions')))
        NOT LIKE '%''' || x.resource || '''%';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: موردٌ تحملُه الشركاتُ ولا يعرفُه مسارُ البذر — الشركةُ التاليةُ تُولدُ بلا: % (v3.75.8)', v_bad;
  END IF;

  -- ═══ والفخُّ يُشغَّل: يُحجَبُ موردٌ تخيُّلاً فيجب أن تراه الاستعلامةُ نفسُها ═══
  -- **فخٌّ لا يُشغَّل ليس فخّاً** — ويُشغَّل بلا لمسِ صفٍّ واحد.
  SELECT count(*) INTO v_seen
  FROM (SELECT DISTINCT resource FROM public.company_role_permissions) x
  CROSS JOIN public.companies c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_role_permissions p
    WHERE p.company_id = c.id AND p.resource = x.resource
      AND x.resource <> 'dispatch_approvals'
  );
  IF v_seen < v_ncomp THEN
    RAISE EXCEPTION 'BASELINE FAIL: حُجب موردٌ تخيُّلاً فلم ترهُ الاستعلامة (رأت % من %) (v3.75.8)', v_seen, v_ncomp;
  END IF;
END;
$function$;
