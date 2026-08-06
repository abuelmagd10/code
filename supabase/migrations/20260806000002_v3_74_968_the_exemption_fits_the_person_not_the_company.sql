-- v3.74.968 — الاستثناءُ على قدرِ الشخص لا على قدرِ الشركة
-- ============================================================================
-- ٩٦٦ ورث من الحرّاس الثلاثة القدامى شرطاً واحداً: «لا فصلَ مهامٍّ إلا إذا كان
-- فى الشركة أكثرُ من مسؤولٍ أعلى». وحُجّتُه سليمة: شركةٌ بمالكٍ واحدٍ لا
-- تستطيع الفصل، وإلزامُها به إقفالٌ لا حماية.
--
-- لكنّ الشرطَ كُتب على **الشركة كلِّها**، لا على الشخص. فصار يستثنى الجميع:
-- المحاسبُ فى شركةٍ بمالكٍ واحدٍ يستطيع أن يُنشئ المستندَ ويعتمدَه بنفسه،
-- **والمالكُ كان يستطيع اعتمادَه بدلاً منه**. فلا إقفالَ هنا يُخشى، وإنّما
-- ثقبٌ فى الضبط الداخلى.
--
-- وقِيس: فى شركة «تست» عددُ المسؤولين الأعلين = ١، وفيها محاسبٌ ومديرٌ
-- ومسؤولُ مخزنٍ ومسؤولُ مشتريات — كلُّهم كانوا مستثنين.
--
-- الدواء: الاستثناءُ يُقاس على الشخص لا على الشركة.
--   • المالكُ مستثنًى دائماً (كما كان).
--   • ومَن كان **هو نفسُه المسؤولَ الأعلى الوحيد** مستثنًى — إذ لا بديلَ عنه.
--   • وكلُّ مَن سواه: مَن كتب لا يوقّع.
--
-- وأثرُ التطبيق على البيانات القائمة: **صفرُ صفوفٍ** تصير مخالفة — قِيست
-- الثلاثون زوجاً كلُّها قبل التطبيق.
--
-- وأُثبت على قاعدة الاختبار فى ثمانية اتّجاهات، منها الثقبُ القديم نفسُه:
-- المحاسبُ يُنشئ ويعتمد فى شركةٍ بمسؤولٍ واحد — كان يمرّ، وصار يُرفض.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_is_company_senior(p_company_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT p_user_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.company_members
             WHERE company_id = p_company_id AND user_id = p_user_id
               AND lower(role) IN ('owner','admin','general_manager','gm','generalmanager','superadmin','super_admin'))
    OR EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id AND user_id = p_user_id));
$$;

COMMENT ON FUNCTION public.erp_is_company_senior(uuid, uuid) IS
  'v3.74.968: هل هذا الشخصُ مسؤولٌ أعلى فى هذه الشركة؟ يُستعمل ليكون استثناءُ فصلِ المهامّ على قدرِ الشخص لا على قدرِ الشركة.';

CREATE OR REPLACE FUNCTION public.erp_sod_guard()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  v_row     jsonb := to_jsonb(NEW);
  v_company uuid;
  v_spec    text;
  v_parts   text[];
  v_earlier uuid;
  v_later   uuid;
BEGIN
  v_company := nullif(v_row->>'company_id','')::uuid;
  IF v_company IS NULL THEN RETURN NEW; END IF;

  FOREACH v_spec IN ARRAY TG_ARGV LOOP
    v_parts := string_to_array(v_spec, '|');
    IF array_length(v_parts, 1) IS DISTINCT FROM 3 THEN
      RAISE EXCEPTION 'v3.74.966: وصفُ فصلِ المهامّ معطوبٌ على %: %', TG_TABLE_NAME, v_spec;
    END IF;
    IF NOT jsonb_exists(v_row, v_parts[1]) OR NOT jsonb_exists(v_row, v_parts[2]) THEN
      RAISE EXCEPTION 'v3.74.966: عمودٌ غيرُ موجودٍ فى % — % أو %', TG_TABLE_NAME, v_parts[1], v_parts[2];
    END IF;
    v_earlier := nullif(v_row->>v_parts[1], '')::uuid;
    v_later   := nullif(v_row->>v_parts[2], '')::uuid;

    -- v3.74.968: الاستثناءُ على قدرِ الشخص لا الشركة.
    IF v_earlier IS NOT NULL AND v_later IS NOT NULL AND v_earlier = v_later
       AND NOT public.erp_is_company_owner(v_company, v_earlier)
       AND NOT (public.erp_company_senior_count(v_company) <= 1
                AND public.erp_is_company_senior(v_company, v_earlier)) THEN
      RAISE EXCEPTION 'SoD violation: %', v_parts[3] USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END
$fn$;

DO $do$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pg_trigger tg JOIN pg_proc p ON p.oid=tg.tgfoid
    JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE NOT tg.tgisinternal AND n.nspname='public' AND p.proname='erp_sod_guard';
  IF v_n <> 26 THEN RAISE EXCEPTION 'v3.74.968: المتوقَّع ٢٦ مُشغِّلاً والموجود %.', v_n; END IF;
END
$do$;

COMMIT;
