-- ═══════════════════════════════════════════════════════════════════════════
-- v3.74.980 — البصمةُ لا تُبتلع: فحصٌ يرى ما لم يُعالَج
-- ═══════════════════════════════════════════════════════════════════════════
--
-- الشيفرةُ عولجت فى هذه الدفعة: مسارُ البصمة صار يقود المحرّكَ الذى يعمل،
-- والبصمةُ التى لا يُعرف نوعُها تُوسم شاذّةً باسمها بدل أن تدور بلا نهاية.
--
-- لكنّ إصلاحَ الشيفرة يمنع **هذا** العطب، ولا يرى العطبَ القادم. والبصمةُ
-- التى تُدفع ثمّ لا تصير سجلَّ حضورٍ **لا تصرخ**: لا رسالةَ خطأٍ ولا شاشةَ
-- تنقص، والموظّفُ يظهر غائباً يومَ كان حاضراً — ولا أحدَ يعلم حتى يأتى
-- كشفُ الرواتب.
--
-- فيُضاف فحصُ سلامةٍ يقيس **الواقعَ لا النصّ**: بصماتٌ مضى على وقتها أكثرُ
-- من يومٍ ولم تُعالَج بعد. وهو ينكشف على لوحة التحكّم مع بقيّة الفحوص،
-- ويُشغَّل فى كلِّ دفعةٍ ضمن الفحوص المرجعيّة.
--
-- والحدُّ يومٌ كامل لا ساعة: الطابورُ قد يتأخّر، والجهازُ قد يُدفع دفعةً
-- متأخّرة. وحارسٌ يصرخ على البطءِ العاديّ يُطفأ ثمّ لا يحرس شيئاً.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.ic_attendance_log_stuck(p_company_id uuid)
 RETURNS TABLE(severity text, detail jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  r record;
  v_total int := 0;
BEGIN
  SELECT count(*) INTO v_total
  FROM attendance_raw_logs
  WHERE company_id = p_company_id
    AND is_processed = false
    AND log_time < NOW() - INTERVAL '1 day';

  IF v_total = 0 THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT id, employee_id, log_time, log_type, source, anomaly_reason
    FROM attendance_raw_logs
    WHERE company_id = p_company_id
      AND is_processed = false
      AND log_time < NOW() - INTERVAL '1 day'
    ORDER BY log_time ASC
    LIMIT 10
  LOOP
    severity := 'medium';
    detail := jsonb_build_object(
      'type', 'attendance_raw_log',
      'id', r.id,
      'employee_id', r.employee_id,
      'log_time', r.log_time,
      'log_type', r.log_type,
      'source', r.source,
      'anomaly_reason', r.anomaly_reason,
      'total_stuck', v_total,
      'hint', 'بصمة مدفوعة لم تصر سجل حضور بعد أكثر من يوم. الموظف يظهر غائبا يوم كان حاضرا.'
    );
    RETURN NEXT;
  END LOOP;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  RETURN;
END $function$;

-- لا تُولد مفتوحةً للزائر المجهول (درس ٩٧٢). والمنحُ يطابق أخواتِها:
-- لوحةُ التحكّم تنادى الفحوصَ بحساب مستخدمٍ مسجَّل.
REVOKE EXECUTE ON FUNCTION public.ic_attendance_log_stuck(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ic_attendance_log_stuck(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.ic_attendance_log_stuck(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.ic_attendance_log_stuck(uuid) TO service_role;

-- والتسجيلُ فى فهرس الفحوص — وإلّا فهى دالّةٌ لا يُنادِيها أحد،
-- وحارسٌ لا يُشغَّل ليس حارساً (درس ٩٧٨).
INSERT INTO public.integrity_check_definitions
  (code, name_ar, name_en, category, fn_name, active, severity_default, description)
VALUES
  ('attendance_log_stuck',
   'بَصَمات لَم تُعالَج',
   'Unprocessed attendance punches',
   'operational',
   'ic_attendance_log_stuck',
   true,
   'medium',
   'بصمة مدفوعة من الجهاز مضى على وقتها أكثر من يوم ولم تصر سجل حضور. لا تصرخ من نفسها: الموظف يظهر غائبا يوم كان حاضرا، ولا يظهر الخطأ حتى كشف الرواتب.')
ON CONFLICT (code) DO UPDATE
  SET name_ar = EXCLUDED.name_ar,
      name_en = EXCLUDED.name_en,
      category = EXCLUDED.category,
      fn_name = EXCLUDED.fn_name,
      active = EXCLUDED.active,
      severity_default = EXCLUDED.severity_default,
      description = EXCLUDED.description;

-- ─────────────────────────────────────────────────────────────────────────
-- والملفُّ يُصدّق على نفسه.
-- ─────────────────────────────────────────────────────────────────────────
DO $mig$
DECLARE v_n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'ic_attendance_log_stuck') THEN
    RAISE EXCEPTION 'v3.74.980: الدالّة غير موجودة بعد التطبيق';
  END IF;

  IF has_function_privilege('anon', 'public.ic_attendance_log_stuck(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'v3.74.980: الفحص قابل للنداء من الزائر المجهول';
  END IF;

  SELECT count(*) INTO v_n FROM integrity_check_definitions
   WHERE code = 'attendance_log_stuck' AND active AND fn_name = 'ic_attendance_log_stuck';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'v3.74.980: الفحص غير مسجَّل فى الفهرس - فلن يُنادى';
  END IF;

  -- ويُشغَّل فعلاً على كلِّ شركةٍ قائمة: دالّةٌ تُسجَّل ولا تعمل أسوأُ من غيابها.
  PERFORM public.ic_attendance_log_stuck(c.id) FROM companies c;

  RAISE NOTICE 'v3.74.980: الفحص مبنىٌّ ومسجَّلٌ ويعمل على كلّ شركة.';
END $mig$;

COMMIT;
