-- ---------------------------------------------------------------------------
-- v3.75.61 — **وبابٌ لا يحتاجُه الزائرُ يُغلَق.**
--
-- ═══ أوّلاً: أُصحِّحُ نفسى — سمّيتُ الأخفَّ أثقلَ ═══
--
-- أعلنتُ فى دفعاتٍ أنّ **٢٨ كاتباً يبلغُهم الزائرُ** هم «أثقلُ ما تبقّى».
-- والبرهانُ الحىُّ يقولُ غيرَ ذلك، وقد جُرِّبَ لا استُنتِج:
--
--     كتابةٌ بدورِ الزائرِ (anon) على كلِّ جدولٍ فى public:
--       جداولُ جُرِّبت ................  ٢٥٦
--       محاولاتٌ (إدراجٌ وحذفٌ لكلٍّ) ..  ٥١٢
--       **رُفِضت بـ 42501** ...........  ٥١٢   ← بلا استثناءٍ واحد
--       جداولُ يملكُ الزائرُ الكتابةَ فيها  ٠
--
-- **فالـ٢٨ أبوابٌ مفتوحةٌ على جدارٍ مصمَت**: الدالّةُ تُنادى، ثمّ تُرَدُّ عند
-- أوّلِ كتابةٍ لأنّها **بصلاحيّاتِ مُنادِيها** والزائرُ لا يملكُ فى أىِّ جدولٍ
-- حقَّ كتابة. **والحكمُ بالأثرِ لا بالاسم** — والأثرُ هنا أخفُّ ممّا قلت.
--
-- ═══ وثانياً: الجذرُ أوسعُ ممّا كنتُ أُلاحق ═══
--
--     دوالُّنا يبلغُها الزائرُ ..........  ٢٥٢
--       يحتاجُها فعلاً ................   ٣٩   ← ٣٥ تنادِيها سياساتُ حمايةِ
--                                              الصفوف · ٢ مُعلَنتانِ لما قبلَ
--                                              الدخول · وباقيها فى منظورٍ
--                                              أو قيمةٍ افتراضيّة
--       **لا يحتاجُها** ...............  ٢١٣   ← تُغلَقُ هنا
--
-- **ولا واحدةَ من الـ٢١٣ بصلاحيّاتٍ كاملة** — فالـ٣٥ ذاتُ الصلاحيّاتِ الكاملةِ
-- كلُّها فى المُبقى، **لأنّ سياساتِ الحمايةِ لا تعملُ بدونِها**. فلا يُنزَعُ
-- حقٌّ من دالّةٍ مُمتازةٍ واحدة.
--
-- ═══ وثالثاً: منحةُ PUBLIC هى البابُ الذى دخلَ منه العطبُ أصلاً ═══
--
-- Postgres يمنحُ EXECUTE لـ**عمومِ الأدوار** على كلِّ دالّةٍ تُنشَأُ ما لم
-- تُنزَع. **وكلُّ واحدةٍ من الـ٢١٣ تحملُ هذه المنحةَ** — فنزعُها من `anon`
-- وحدَه **لا يُغلقُ شيئاً**، لأنّ عمومَ الأدوارِ يشملُ الزائر. **ونصفُ جراحةٍ
-- أسوأُ من لا جراحة**، فتُنزَعُ المنحتانِ معاً.
--
-- ═══ ورابعاً: ما قِيسَ قبلَ الكتابةِ لئلّا ينكسرَ شىء ═══
--
--     من الـ٢١٣ يبقى بالغاً للمستخدِمِ المسجَّلِ بمنحةٍ صريحة .....  ٢١٢
--     ويبقى بالغاً لمفتاحِ الخدمةِ بمنحةٍ صريحة .................  ٢١٣
--     **يُصبحُ لا يبلغُه أحدٌ (يتيماً)** ........................    ٠
--
-- **وواحدةٌ كانت ستنكسر**: `close_accounting_period` يبلغُها المستخدِمُ
-- المسجَّلُ **عبرَ منحةِ عمومِ الأدوارِ وحدَها** — فنزعُها بلا تدبيرٍ كان
-- **يُعطِّلُ إغلاقَ الفترةِ المحاسبيّة**. فتُمنَحُ صراحةً **قبلَ** النزع، ويُقاسُ
-- أثرُ ذلك فى المعاملةِ نفسِها. **ولا يُصلَحُ عطبٌ بعطبٍ آخَر.**
--
-- **والبيتانِ يقولانِ قولاً واحداً**: ٢٥٢ · ٣٩ · ٢١٣ على كليهما، وأسماءُ
-- الـ٣٩ متطابقةٌ حرفاً بحرف — فالشرطُ يُكتَبُ ويُطبَّقُ على ما يُطابقُه فى كلِّ بيت.
--
-- **ولا يُكتَبُ فى هذا الملفِّ شرطةٌ مزدوجةٌ داخلَ نصّ**: نمطُ حجبِ التعليقاتِ
-- يُبنى بـ`chr(45)` لا بكتابتِه حرفاً، **لئلّا يخدعَ حاجبَ تعليقاتٍ فيبتلعَ سطراً
-- كاملاً ويمرَّ فحصٌ سلبىٌّ لسببٍ خاطئ**. **وفخٌّ يمرُّ لسببٍ خاطئ ليس فخّاً.**
-- ---------------------------------------------------------------------------

-- ═══ (١) قبلَ النزع: من يبلغُه المستخدِمُ عبرَ عمومِ الأدوارِ وحدَها يُمنَحُ صراحةً ═══
DO $pre$
DECLARE r record; n_fixed int := 0; n_left int;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
     WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
       AND l.lanname IN ('plpgsql', 'sql')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
       AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) ae
                        WHERE ae.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
                          AND ae.privilege_type = 'EXECUTE')
     ORDER BY p.oid::regprocedure::text
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    n_fixed := n_fixed + 1;
  END LOOP;

  SELECT count(*) INTO n_left
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
     AND l.lanname IN ('plpgsql', 'sql')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND NOT EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) ae
                      WHERE ae.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'authenticated')
                        AND ae.privilege_type = 'EXECUTE');

  IF n_left <> 0 THEN
    RAISE EXCEPTION 'v3.75.61: بقىَ % يبلغُه المستخدِمُ عبرَ عمومِ الأدوارِ وحدَها — والنزعُ بعدَها يكسِرُه.', n_left
      USING ERRCODE = '23514';
  END IF;

  RAISE NOTICE 'v3.75.61: مُنحت صراحةً للمستخدِمِ المسجَّل %', n_fixed;
END
$pre$;

-- ═══ (٢) النزع — بالخاصّيّةِ لا بقائمة، ومن الجهتَين معاً ═══
DO $migration$
DECLARE
  r              record;
  n_revoked      int := 0;
  n_definer_hit  int := 0;
  n_auth_before  int;
  n_auth_after   int;
  n_anon_after   int;
  n_orphan       int;
  n_outside      int;
  KEEP           text[] := ARRAY[
    'ai_current_user_allowed_resources','ai_current_user_is_full_access','ai_normalize_for_fts',
    'auth_email_state','can_access_bank_rec_lines','can_access_bill_items','can_access_bill_row',
    'can_access_booking','can_access_booking_row','can_access_invoice_items','can_access_journal_lines',
    'can_access_purchase_order_items','can_access_purchase_order_row','can_access_purchase_return_item_row',
    'can_access_purchase_return_row','can_access_record_branch','can_access_vc_items','can_approve_discount',
    'can_delete_resource','can_manage_supplier_row','can_modify_data','can_modify_invoice_items',
    'can_review_company_ai','current_user_branch_id','current_user_is_branch_unbounded',
    'current_user_resource_visibility','find_user_by_login','fn_user_company_access','fn_user_company_ids',
    'get_inventory_reservation_balances','get_user_company_ids','has_shared_access','ic_user_can_access_company',
    'ic_user_can_access_consolidation_group','ic_user_can_access_legal_entity','ic_user_can_manage_company',
    'is_company_member','is_owner_or_admin','supplier_is_active_in_my_branch'];
BEGIN
  SELECT count(*) INTO n_auth_before
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND l.lanname IN ('plpgsql','sql')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig, p.prosecdef
      FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
     WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
       AND l.lanname IN ('plpgsql', 'sql')
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND NOT (p.proname = ANY(KEEP))
     ORDER BY p.oid::regprocedure::text
  LOOP
    -- **ولا تُنزَعُ صلاحيّةٌ عن دالّةٍ مُمتازة**: قِيسَ أنّهنّ صفرٌ، والفخُّ يُشغَّل.
    IF r.prosecdef THEN
      n_definer_hit := n_definer_hit + 1;
      RAISE EXCEPTION 'v3.75.61: % بصلاحيّاتٍ كاملةٍ ووقعت فى مجموعةِ النزع — ولا يُنزَعُ حقٌّ لم يُدرَس.', r.sig
        USING ERRCODE = '23514';
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    n_revoked := n_revoked + 1;
  END LOOP;

  -- (أ) **لم يبقَ للزائرِ بابٌ خارجَ المُعلَن.**
  SELECT count(*) INTO n_outside
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
     AND l.lanname IN ('plpgsql', 'sql')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT (p.proname = ANY(KEEP));

  IF n_outside <> 0 THEN
    RAISE EXCEPTION 'v3.75.61: بقىَ % باباً يبلغُه الزائرُ خارجَ المُعلَن — ونصفُ جراحةٍ أسوأُ من لا جراحة.', n_outside
      USING ERRCODE = '23514';
  END IF;

  -- (ب) **ولا يتيمَ**: كلُّ ما نُزع ما زال يبلغُه المستخدِمُ أو مفتاحُ الخدمة.
  SELECT count(*) INTO n_orphan
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
     AND l.lanname IN ('plpgsql', 'sql')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
     AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE');

  IF n_orphan <> 0 THEN
    RAISE EXCEPTION 'v3.75.61: % دالّةً لم يعُدْ يبلغُها المستخدِمُ ولا مفتاحُ الخدمة — بابٌ أُغلقَ على أهلِه.', n_orphan
      USING ERRCODE = '23514';
  END IF;

  -- (ج) **ولم ينقصْ ما يبلغُه المستخدِمُ المسجَّل** — بل زادَ بمن مُنح صراحةً.
  SELECT count(*) INTO n_auth_after
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' AND l.lanname IN ('plpgsql','sql')
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  IF n_auth_after < n_auth_before THEN
    RAISE EXCEPTION 'v3.75.61: نقصَ ما يبلغُه المستخدِمُ المسجَّل من % إلى % — النزعُ أصابَ أهلَ البيت.', n_auth_before, n_auth_after
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO n_anon_after
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
     AND l.lanname IN ('plpgsql', 'sql')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  RAISE NOTICE 'v3.75.61: نُزعت % · يبلغُ الزائرَ الآن % · المستخدِمُ % ← % · يتامى % · مُمتازةٌ نُزعت %',
    n_revoked, n_anon_after, n_auth_before, n_auth_after, n_orphan, n_definer_hit;
END
$migration$;

-- ═══ (٣) ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه ═══
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_61_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $check$
DECLARE
  n_anon      int;
  n_outside   int;
  n_missing   int;
  n_orphan    int;
  n_writers   int;
  KEEP        text[] := ARRAY[
    'ai_current_user_allowed_resources','ai_current_user_is_full_access','ai_normalize_for_fts',
    'auth_email_state','can_access_bank_rec_lines','can_access_bill_items','can_access_bill_row',
    'can_access_booking','can_access_booking_row','can_access_invoice_items','can_access_journal_lines',
    'can_access_purchase_order_items','can_access_purchase_order_row','can_access_purchase_return_item_row',
    'can_access_purchase_return_row','can_access_record_branch','can_access_vc_items','can_approve_discount',
    'can_delete_resource','can_manage_supplier_row','can_modify_data','can_modify_invoice_items',
    'can_review_company_ai','current_user_branch_id','current_user_is_branch_unbounded',
    'current_user_resource_visibility','find_user_by_login','fn_user_company_access','fn_user_company_ids',
    'get_inventory_reservation_balances','get_user_company_ids','has_shared_access','ic_user_can_access_company',
    'ic_user_can_access_consolidation_group','ic_user_can_access_legal_entity','ic_user_can_manage_company',
    'is_company_member','is_owner_or_admin','supplier_is_active_in_my_branch'];
BEGIN
  -- (أ) **لا بابَ للزائرِ خارجَ المُعلَنِ بالاسم** — والاسمُ مُثبَّتٌ لا العددُ وحدَه.
  SELECT count(*) INTO n_outside
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
     AND l.lanname IN ('plpgsql', 'sql')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND NOT (p.proname = ANY(KEEP));

  IF n_outside <> 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % باباً يبلغُه الزائرُ خارجَ المُعلَن (v3.75.61)', n_outside
      USING ERRCODE = '23514';
  END IF;

  -- (ب) **وغيابُ اسمٍ من المُعلَنِ يُرفَضُ كما تُرفَضُ زيادةٌ**: حارسُ حمايةِ
  --     صفوفٍ فقدَ منحتَه يُعطِّلُ السياسةَ التى تنادِيه — وبحثٌ لا يجد ليس دليلَ غياب.
  SELECT count(*) INTO n_missing
    FROM unnest(KEEP) AS k(nm)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace AND p.proname = k.nm
        AND has_function_privilege('anon', p.oid, 'EXECUTE'));

  IF n_missing <> 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % اسماً من المُعلَنِ لم يعُدْ يبلغُه الزائرُ (v3.75.61)', n_missing
      USING ERRCODE = '23514';
  END IF;

  -- (ج) **ولا بابَ أُغلقَ على أهلِه.**
  SELECT count(*) INTO n_orphan
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
     AND l.lanname IN ('plpgsql', 'sql')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
     AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
     AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE');

  IF n_orphan <> 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % دالّةً لا يبلغُها المستخدِمُ ولا مفتاحُ الخدمة (v3.75.61)', n_orphan
      USING ERRCODE = '23514';
  END IF;

  -- (د) **ولا كاتبَ يبلغُه الزائرُ** — الحكمُ بالأثر: من يذكرُ كتابةً فى جسدِه.
  --     ونمطُ حجبِ التعليقاتِ يُبنى بـchr(45) لا بكتابةِ الشرطتَين حرفاً،
  --     **لئلّا يبتلعَ حاجبُ التعليقاتِ سطرَه فيمرَّ فحصٌ سلبىٌّ لسببٍ خاطئ**.
  SELECT count(*) INTO n_writers
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
     AND l.lanname IN ('plpgsql', 'sql')
     AND has_function_privilege('anon', p.oid, 'EXECUTE')
     AND (lower(regexp_replace(pg_get_functiondef(p.oid), chr(45) || chr(45) || '[^' || chr(10) || ']*', ' ', 'g')) LIKE '%insert into%'
       OR lower(regexp_replace(pg_get_functiondef(p.oid), chr(45) || chr(45) || '[^' || chr(10) || ']*', ' ', 'g')) LIKE '%update %'
       OR lower(regexp_replace(pg_get_functiondef(p.oid), chr(45) || chr(45) || '[^' || chr(10) || ']*', ' ', 'g')) LIKE '%delete from%');

  IF n_writers <> 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: % كاتباً يبلغُه الزائرُ (v3.75.61)', n_writers
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO n_anon
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
   WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
     AND l.lanname IN ('plpgsql', 'sql')
     AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e')
     AND has_function_privilege('anon', p.oid, 'EXECUTE');

  RETURN format('v3.75.61 ok — يبلغُ الزائرَ %s بابا كلُّها مُعلَنةٌ بالاسم · خارجَ المُعلَن %s · مفقودٌ من المُعلَن %s · يتامى %s · كُتّابٌ يبلغُهم الزائرُ %s',
                n_anon, n_outside, n_missing, n_orphan, n_writers);
END
$check$;

-- **وحارسٌ يُفتَحُ بابُه ليس حارساً**: المنحةُ الافتراضيّةُ لعمومِ الأدوارِ تُنزَع.
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_61_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_61_check() TO service_role;

COMMENT ON FUNCTION public.assert_baseline_v3_75_61_check() IS 'v3.75.61 — وبابٌ لا يحتاجُه الزائرُ يُغلَق. يُثبِّتُ أنّ ما يبلغُه الزائرُ من دوالِّنا هو المُعلَنُ بالاسم لا غير: يرفضُ زيادةً (بابٌ جديدٌ فُتح) ويرفضُ نقصاناً (حارسُ حمايةِ صفوفٍ فقدَ منحتَه فتعطَّلت سياستُه)، ويرفضُ أن تصيرَ دالّةٌ يتيمةً لا يبلغُها المستخدِمُ ولا مفتاحُ الخدمة، ويرفضُ أن يبلغَ الزائرُ كاتباً. ولحمُ الامتداداتِ مستثنًى بخاصّيّةِ العضويّةِ فى pg_depend لا باسم.';
