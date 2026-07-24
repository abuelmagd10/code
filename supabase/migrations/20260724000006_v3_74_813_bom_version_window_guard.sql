-- ============================================================================
-- v3.74.813 — نافذة سريان نسخة الـBOM: رفض مبكر برسالة مفهومة
-- ============================================================================
-- المالك اصطدم بها حياً: ملء «سارى من/حتى» بنفس اللحظة كان يموت عند
-- قيد الجدول chk_manufacturing_bom_versions_effective_window برمز 23514
-- غامض. الدالة تفشل الآن مبكراً برسالة ثنائية واضحة. (طُبقت بترقيع
-- مرساة موثق على القاعدتين وقت الاكتشاف؛ هذا الملف يوثقها بنفس أسلوب
-- الترقيع الآمن idempotent.)
-- ============================================================================

DO $$
DECLARE d text; a text := 'PERFORM public.assert_company_access(p_company_id);';
        marker text := 'v3.74.813 window guard';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='create_manufacturing_bom_version_atomic';

  IF d LIKE '%' || marker || '%' THEN RAISE NOTICE 'already patched'; RETURN; END IF;
  IF (length(d) - length(replace(d, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'anchor not unique in create_manufacturing_bom_version_atomic';
  END IF;

  d := replace(d, a,
    a || chr(10) ||
    '  -- ' || marker || ': a zero/negative validity window used to die at the' || chr(10) ||
    '  -- table check constraint with an opaque 23514. Fail fast, in words.' || chr(10) ||
    '  IF p_effective_from IS NOT NULL AND p_effective_to IS NOT NULL' || chr(10) ||
    '     AND p_effective_to <= p_effective_from THEN' || chr(10) ||
    '    RAISE EXCEPTION ''تاريخ «سارى حتى» يجب أن يكون بعد «سارى من» — أو اتركه فارغاً لنسخة مفتوحة النهاية. | "Effective to" must be after "effective from" — or leave it empty for an open-ended version.'';' || chr(10) ||
    '  END IF;'
  );
  EXECUTE d;
END $$;
