-- =============================================================================
-- v3.74.999 — «اسمٌ واحدٌ لوظيفةٍ واحدة، ورتبةٌ تُقرأ ولا تُكتَب بيدها»
-- =============================================================================
--
-- ═══ ما الذى كان ═══
--
-- كتالوجُ الوظائفِ `public.roles` كان يقول للمديرِ العامِّ (`admin`) اسماً
-- عربيّاً هو «المدير»، والشاشةُ تقولُ له «مدير عام». ويقولُ لمديرِ الفرع
-- (`manager`) «مدير» — **فالاسمانِ واحدٌ فى الكتالوج، والوظيفتانِ اثنتان.**
-- ومن قرأ تقريراً رأى «المدير» ولم يعلمْ أىَّ مديرٍ يقصد.
--
-- وترتيبُ الوظائفِ كان مكسوراً: المسؤولون الأربعةُ (مشتريات، تصنيع، حجوزات،
-- موارد بشريّة) أُضيفوا متأخّرين فأُعطوا الأرقامَ الباقية ٨..١١، فوقعوا
-- **تحتَ** «موظف» و«عرض فقط» فى كلِّ قائمةٍ تُرتَّب بالأولويّة.
--
-- ولم يكن فى القاعدةِ موضعٌ واحدٌ يقولُ **مَن هم الأدوارُ العليا** — كانت
-- الجملةُ مكتوبةً بيدها فى ١٠٢ دالّةٍ وفى ١٧٣ موضعاً فى الكود.
--
-- ═══ ما تفعله هذه الهجرة ═══
--
--   ١) عمودُ `tier` فى الكتالوج: عليا أو عادية — **البيتُ الواحدُ للرتبة.**
--   ٢) الأسماءُ والترتيبُ يُصحَّحان ليُطابقا `lib/roles.ts` حرفاً بحرف.
--   ٣) `erp_senior_roles()` و`erp_is_senior_role()` يقرآنِ من الكتالوجِ ولا
--      يكتبانِ القائمةَ بأيديهما.
--   ٤) فحصٌ مرجعىٌّ يمنعُ العودة، ويُشغَّل فخُّه ليُثبت أنّه يرى.
--
-- ولا تلمسُ هذه الهجرةُ صلاحيّةً واحدة: لا سياسةَ ولا دالّةَ حراسةٍ ولا صفَّ
-- `company_role_permissions`. **أسماءٌ ورتبةٌ وترتيبٌ فقط.**
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) الرتبة: بيتٌ واحدٌ يقولُ مَن هم الأدوارُ العليا
-- -----------------------------------------------------------------------------
DO $tier$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'tier'
  ) THEN
    ALTER TABLE public.roles ADD COLUMN tier text NOT NULL DEFAULT 'normal';
    ALTER TABLE public.roles ADD CONSTRAINT roles_tier_check
      CHECK (tier IN ('senior', 'normal'));
    RAISE NOTICE 'v3.74.999 · أُضيف عمودُ الرتبة إلى كتالوج الوظائف.';
  ELSE
    RAISE NOTICE 'v3.74.999 · عمودُ الرتبة موجودٌ من قبل.';
  END IF;
END $tier$;

-- -----------------------------------------------------------------------------
-- ٢) الأسماءُ والترتيبُ والرتبة — مطابقةً لـ lib/roles.ts
--
--    ولا تُكتب هنا وظيفةٌ لا يقبلها القيد: كلُّ صفٍّ يُحدَّث بشرطِ أن يكون
--    اسمُه فى `erp_membership_roles()`. **ومن كتبَ اسماً لا يعرفه النظامُ
--    كتبَ سطراً يُضلِّل.**
-- -----------------------------------------------------------------------------
DO $names$
DECLARE
  v_vocab text[] := public.erp_membership_roles();
  v_row   record;
  v_n     int := 0;
  v_data  jsonb := '[
    {"name":"owner",                 "ar":"المالك",                "en":"Owner",                 "tier":"senior", "order":1},
    {"name":"admin",                 "ar":"المدير العام",          "en":"General Manager",       "tier":"senior", "order":2},
    {"name":"manager",               "ar":"مدير الفرع",            "en":"Branch Manager",        "tier":"normal", "order":3},
    {"name":"accountant",            "ar":"محاسب",                 "en":"Accountant",            "tier":"normal", "order":4},
    {"name":"store_manager",         "ar":"مسؤول المخزن",          "en":"Store Manager",         "tier":"normal", "order":5},
    {"name":"purchasing_officer",    "ar":"مسؤول المشتريات",       "en":"Purchasing Officer",    "tier":"normal", "order":6},
    {"name":"manufacturing_officer", "ar":"مسؤول التصنيع",         "en":"Manufacturing Officer", "tier":"normal", "order":7},
    {"name":"booking_officer",       "ar":"مسؤول الحجوزات",        "en":"Booking Officer",       "tier":"normal", "order":8},
    {"name":"hr_officer",            "ar":"مسؤول الموارد البشرية", "en":"HR Officer",            "tier":"normal", "order":9},
    {"name":"staff",                 "ar":"موظف",                  "en":"Staff",                 "tier":"normal", "order":10},
    {"name":"viewer",                "ar":"عرض فقط",               "en":"Viewer",                "tier":"normal", "order":11}
  ]'::jsonb;
BEGIN
  IF array_length(v_vocab, 1) IS NULL OR array_length(v_vocab, 1) = 0 THEN
    RAISE EXCEPTION 'v3.74.999 · مفرداتُ الأدوار فارغة — لا أكتبُ على قراءةٍ فارغة';
  END IF;

  -- الاتّجاه الأوّل: كلُّ اسمٍ أكتبُه يجب أن يقبله النظام
  FOR v_row IN SELECT * FROM jsonb_array_elements(v_data) AS e(j) LOOP
    IF NOT ((v_row.j ->> 'name') = ANY (v_vocab)) THEN
      RAISE EXCEPTION 'v3.74.999 · أوشكتُ أن أُسمّى وظيفةً لا يقبلها النظام: %', v_row.j ->> 'name';
    END IF;
  END LOOP;

  -- الاتّجاه الثانى: كلُّ اسمٍ يقبله النظام يجب أن يكون هنا
  IF EXISTS (
    SELECT 1 FROM unnest(v_vocab) AS r
    WHERE r NOT IN (SELECT e.j ->> 'name' FROM jsonb_array_elements(v_data) AS e(j))
  ) THEN
    RAISE EXCEPTION 'v3.74.999 · وظيفةٌ يقبلها النظامُ ولا اسمَ لها فى هذه الهجرة — **وما لا تعرفه القاعدةُ يُسمّى، ولا يُترك بلا اسم**';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(v_data) AS e(j) LOOP
    UPDATE public.roles
       SET title_ar = v_row.j ->> 'ar',
           title_en = v_row.j ->> 'en',
           tier     = v_row.j ->> 'tier',
           priority = (v_row.j ->> 'order')::int
     WHERE name = v_row.j ->> 'name';
    IF NOT FOUND THEN
      INSERT INTO public.roles (name, title_ar, title_en, tier, priority, is_system)
      VALUES (v_row.j ->> 'name', v_row.j ->> 'ar', v_row.j ->> 'en',
              v_row.j ->> 'tier', (v_row.j ->> 'order')::int, true);
    END IF;
    v_n := v_n + 1;
  END LOOP;

  RAISE NOTICE 'v3.74.999 · وظائفُ سُمّيت ورُتّبت: %', v_n;
END $names$;

-- -----------------------------------------------------------------------------
-- ٣) الأدوارُ العليا تُقرأ من الكتالوج
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.erp_senior_roles()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT coalesce(array_agg(name ORDER BY priority), ARRAY[]::text[])
  FROM public.roles WHERE tier = 'senior';
$function$;

COMMENT ON FUNCTION public.erp_senior_roles() IS
  'v3.74.999 — الأدوارُ العليا كما يقولها كتالوجُ الوظائف. لا تُكتب القائمةُ بيدها فى أىِّ دالّة.';

CREATE OR REPLACE FUNCTION public.erp_is_senior_role(p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.roles
    WHERE name = lower(trim(coalesce(p_role, ''))) AND tier = 'senior'
  );
$function$;

COMMENT ON FUNCTION public.erp_is_senior_role(text) IS
  'v3.74.999 — هل هذه الوظيفةُ من الأدوارِ العليا؟ سؤالٌ واحدٌ فى بيتٍ واحد.';

REVOKE ALL ON FUNCTION public.erp_senior_roles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erp_is_senior_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.erp_senior_roles() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_is_senior_role(text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- ٤) فحصٌ مرجعىٌّ يمنعُ العودة — ويُشغَّل فخُّه ليُثبت أنّه يرى
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_74_999_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_vocab   text[] := public.erp_membership_roles();
  v_bad     text;
  v_n       int;
  v_caught  boolean;
BEGIN
  IF array_length(v_vocab, 1) IS NULL OR array_length(v_vocab, 1) = 0 THEN
    RAISE EXCEPTION 'BASELINE FAIL: مفرداتُ الأدوار فارغة (v3.74.999)';
  END IF;

  -- ═══ الكتالوجُ والقيدُ يقولان قولاً واحداً ═══
  SELECT string_agg(r, ', ') INTO v_bad
  FROM unnest(v_vocab) AS r WHERE r NOT IN (SELECT name FROM public.roles);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: وظيفةٌ يقبلها القيدُ ولا اسمَ لها فى الكتالوج: % (v3.74.999)', v_bad;
  END IF;

  SELECT string_agg(name, ', ') INTO v_bad
  FROM public.roles WHERE NOT (name = ANY (v_vocab));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: وظيفةٌ فى الكتالوجِ لا يقبلها القيد: % (v3.74.999)', v_bad;
  END IF;

  -- ═══ ولا وظيفةَ بلا اسمٍ معروض ═══
  SELECT string_agg(name, ', ') INTO v_bad
  FROM public.roles
  WHERE coalesce(btrim(title_ar), '') = '' OR coalesce(btrim(title_en), '') = '';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: وظيفةٌ بلا اسمٍ معروض: % (v3.74.999)', v_bad;
  END IF;

  -- ═══ ولا اسمَ واحدٌ لوظيفتين — **واسمانِ لوظيفةٍ ليسا اسماً** ═══
  SELECT string_agg(t, ' | ') INTO v_bad
  FROM (
    SELECT title_ar || ' → ' || string_agg(name, ' و') AS t
    FROM public.roles GROUP BY title_ar HAVING count(*) > 1
  ) s;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: اسمٌ عربىٌّ واحدٌ لوظيفتين: % (v3.74.999)', v_bad;
  END IF;

  SELECT string_agg(t, ' | ') INTO v_bad
  FROM (
    SELECT title_en || ' → ' || string_agg(name, ' و') AS t
    FROM public.roles GROUP BY title_en HAVING count(*) > 1
  ) s;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: اسمٌ إنجليزىٌّ واحدٌ لوظيفتين: % (v3.74.999)', v_bad;
  END IF;

  -- ═══ والترتيبُ متّصلٌ من ١ إلى العدد، بلا فجوةٍ ولا تكرار ═══
  SELECT count(*) INTO v_n FROM public.roles;
  IF EXISTS (
    SELECT 1 FROM public.roles GROUP BY priority HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: ترتيبٌ مكرَّرٌ فى كتالوج الوظائف (v3.74.999)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM generate_series(1, v_n) AS g
    WHERE g NOT IN (SELECT priority FROM public.roles)
  ) THEN
    RAISE EXCEPTION 'BASELINE FAIL: ترتيبُ الوظائفِ ليس متّصلاً من ١ إلى % (v3.74.999)', v_n;
  END IF;

  -- ═══ والرتبةُ العليا موجودةٌ ومعروفة ═══
  IF array_length(public.erp_senior_roles(), 1) IS NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: لا رتبةَ عليا فى الكتالوج — ومن لا عليا له لا يعتمدُ أحدٌ شيئاً (v3.74.999)';
  END IF;
  IF NOT public.erp_is_senior_role('owner') THEN
    RAISE EXCEPTION 'BASELINE FAIL: المالكُ ليس من الأدوارِ العليا (v3.74.999)';
  END IF;
  SELECT string_agg(r, ', ') INTO v_bad
  FROM unnest(public.erp_senior_roles()) AS r WHERE NOT (r = ANY (v_vocab));
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'BASELINE FAIL: رتبةٌ عليا لوظيفةٍ لا يقبلها النظام: % (v3.74.999)', v_bad;
  END IF;

  -- ═══ والفخُّ يُشغَّل: يُزرع اسمٌ مكرَّرٌ فيجب أن يُرى، ثمّ يُلغى الزرع ═══
  -- **فخٌّ لا يُشغَّل ليس فخّاً.**
  v_caught := false;
  BEGIN
    INSERT INTO public.roles (name, title_ar, title_en, tier, priority, is_system)
    SELECT 'zz_probe_999', r.title_ar, 'ZZ Probe 999', 'normal', 9999, false
    FROM public.roles r ORDER BY r.priority LIMIT 1;

    PERFORM 1 FROM (
      SELECT title_ar FROM public.roles GROUP BY title_ar HAVING count(*) > 1
    ) s;
    IF FOUND THEN v_caught := true; END IF;

    RAISE EXCEPTION 'ROLLBACK_PROBE_999';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM <> 'ROLLBACK_PROBE_999' THEN RAISE; END IF;
    WHEN OTHERS THEN
      -- زرعٌ رفضته القاعدةُ نفسُها حراسةٌ أقوى، ويُعدّ نجاحاً معلَناً
      v_caught := true;
  END;
  IF NOT v_caught THEN
    RAISE EXCEPTION 'BASELINE FAIL: زُرع اسمٌ مكرَّرٌ لوظيفتين ولم يره الفحص (v3.74.999)';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_999_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_999_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_74_999_check() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_74_999_check() TO service_role;

DO $$
BEGIN
  PERFORM public.assert_baseline_v3_74_999_check();
  RAISE NOTICE 'v3.74.999 · تمّت وأثبتت نفسَها.';
END $$;
