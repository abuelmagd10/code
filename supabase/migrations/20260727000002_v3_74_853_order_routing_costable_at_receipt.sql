-- ============================================================================
-- v3.74.853 — تكلفة التحويل تُفحص عند **استلام المنتج** لا عند اعتماد المسار فقط
-- ============================================================================
--
-- **الحادثة**: أكمل المالك دورة إنتاج حيّة (MPO-202607-000030) بعد أن فعّل
-- نسخة المسار الصحيحة ROUT-002 v2 — ودخل المنتج المخزون بتكلفة **٦٠٫٠٠**
-- بدل **١١٨٫٥٠**: المواد وحدها، بلا أجور ولا أعباء.
--
-- **والسبب ليس خطأ فى التفعيل**: أمر الإنتاج **يُثبّت نسخة المسار عند
-- إنشائه**، وهذا سليم — أمرٌ بدأ لا تتغيّر تكلفته تحته. لكن الأمر كان مربوطاً
-- بـ`ROUT-002 v1` وزمنها صفر، فتفعيل v2 لاحقاً لم يمسّه.
--
-- **والثغرة**: حارس ٨٤٥ (`mr_assert_routing_operations_costable`) يعمل عند
-- **اعتماد المسار وتفعيله** — أى بوابة أخرى تماماً. ولا شىء كان يفحص تكلفة
-- التحويل عند البوابة التى يدخل منها المنتج فعلاً: **الاستلام**.
--
-- ⇒ **الدرس (الرابع من عائلته بعد ٨٣٣ و٨٤٥ و٨٥١)**: الحارس عند بوابة لا
--   يحمى بوابة أخرى. يُسأل عند كل بوابة: ما الذى يمرّ من هنا، ومن يملك منعه؟
--
-- وأثر العطب لا يظهر عند الإنتاج بل **عند البيع**: ربحٌ أعلى من حقيقته
-- بفارق التكلفة، ومخزونٌ مُقوَّم بأقل من قيمته.
--
-- (إصلاح البيانات تمّ بقيد JE-000068 + رفع تكلفة دفعة FIFO — الاثنان معاً،
--  فالقيد وحده يترك المخزون مُقوَّماً بالخطأ ويُباع بتكلفة ناقصة.)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mpoe_assert_order_routing_is_costable(p_production_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v RECORD;
BEGIN
  -- أمر الإنتاج يُثبّت نسخة المسار عند إنشائه، فتفعيل نسخة أحدث لا يُصلحه.
  -- وحارس ٨٤٥ يعمل عند اعتماد المسار وتفعيله — أى **بوابة أخرى**. فمرّ الأمر
  -- ٣٠ على نسخة زمنها صفر ودخل المنتج بتكلفة المواد وحدها (٦٠ بدل ١١٨٫٥٠).
  -- ⇒ يُفحص هنا أيضاً: عند البوابة التى يُستلَم عندها المنتج فعلاً.
  SELECT rt.routing_code, rv.version_no,
         SUM(
           (COALESCE(ro.labor_time_minutes,0)   / 60.0) * COALESCE(wc.labor_cost_rate,0)
         + (COALESCE(ro.machine_time_minutes,0) / 60.0) * COALESCE(wc.machine_cost_rate,0)
         + (CASE WHEN wc.overhead_absorption_base = 'labour_hours'
                   THEN COALESCE(ro.labor_time_minutes,0)   / 60.0
                   ELSE COALESCE(ro.machine_time_minutes,0) / 60.0 END)
           * (COALESCE(wc.variable_overhead_rate,0) + COALESCE(wc.fixed_overhead_rate,0))
         ) AS conversion_cost,
         SUM(COALESCE(wc.labor_cost_rate,0) + COALESCE(wc.machine_cost_rate,0)
           + COALESCE(wc.variable_overhead_rate,0) + COALESCE(wc.fixed_overhead_rate,0)) AS rates
    INTO v
    FROM public.manufacturing_production_orders po
    JOIN public.manufacturing_routing_versions rv ON rv.id = po.routing_version_id
    JOIN public.manufacturing_routings rt         ON rt.id = rv.routing_id
    JOIN public.manufacturing_routing_operations ro ON ro.routing_version_id = rv.id
    JOIN public.manufacturing_work_centers wc     ON wc.id = ro.work_center_id
   WHERE po.id = p_production_order_id
   GROUP BY rt.routing_code, rv.version_no;

  -- بلا مسار أصلاً: لا اعتراض — أوامر بلا عمليات تُسعَّر بالمواد عمداً.
  IF NOT FOUND THEN RETURN; END IF;

  -- مراكز عملٍ كل أسعارها صفر ⇒ الشركة لم تُسعّر التصنيع بعد، لا خطأ إدخال.
  IF COALESCE(v.rates,0) <= 0 THEN RETURN; END IF;

  IF COALESCE(v.conversion_cost,0) <= 0 THEN
    RAISE EXCEPTION 'هذا الأمر مربوط بنسخة المسار % v% وتكلفة تحويلها صفر، فلو استُلم المنتج الآن لدخل المخزون بتكلفة المواد وحدها بلا أجور ولا أعباء — ويظهر ربحك أعلى من حقيقته عند البيع. مراكز العمل لها أسعار، لكن أزمنة العمليات صفر. أنشئ نسخة مسار بأزمنة صحيحة وأمر إنتاج جديداً عليها. | This order is bound to routing % v% whose conversion cost is zero; the finished goods would be capitalised at materials only.',
      v.routing_code, v.version_no, v.routing_code, v.version_no
      USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.mpoe_assert_order_routing_is_costable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mpoe_assert_order_routing_is_costable(uuid) TO authenticated, service_role;

-- ── ويُركَّب على بوابة الاستلام بجوار حارس صرف الخامات ──────────────────────
CREATE OR REPLACE FUNCTION public.mpoe_assert_receipt_execution_ready(p_production_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_assert_order_execution_open(p_production_order_id);
  PERFORM public.mpoe_assert_material_requirements_snapshot_frozen(p_production_order_id);
  PERFORM public.mpoe_assert_materials_issued_before_receipt(p_production_order_id);
  -- v3.74.853 — وتكلفة التحويل أيضاً. أمر الإنتاج يُثبّت نسخة المسار عند
  -- إنشائه، فتفعيل نسخة أحدث لا يُصلح أمراً قائماً؛ وحارس ٨٤٥ يعمل عند
  -- اعتماد المسار وتفعيله أى **بوابة أخرى**. فمرّ الأمر MPO-202607-000030
  -- على نسخة زمنها صفر ودخل المنتج بتكلفة المواد وحدها (٦٠ بدل ١١٨٫٥٠).
  PERFORM public.mpoe_assert_order_routing_is_costable(p_production_order_id);
END;
$function$;
