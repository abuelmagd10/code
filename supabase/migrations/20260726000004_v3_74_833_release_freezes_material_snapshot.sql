-- ============================================================================
-- v3.74.833 — الإصدار يُجمّد لقطة المواد ويحجز المخزون · ولا استلام بلا صرف
-- ============================================================================
-- **أخطر ما ظهر فى الاختبار الحى حتى الآن.**
--
-- عند اعتماد مسؤول المخزن لاستلام المنتج التام:
--     "Production order requires a material requirements snapshot before
--      inventory execution. production_order_id=20464e69…"
--
-- ── الفجوة الأولى: لقطة المواد لم تكن تُنشأ فى الاستخدام الفعلى أبداً ──────
--
-- «لقطة احتياجات المواد» (production_order_material_requirements) هى قائمة
-- المواد **مجمَّدة على الأمر** لحظة إصداره: هذا الأمر يستهلك هذه الكميات بهذه
-- الأسعار، فلو عُدِّلت قائمة المواد غداً لا يتغير أمر جارٍ. وعلى نفس اللقطة
-- يُبنى **حجز المخزون** للأمر.
--
-- وكانت تُنشأ فى مسار واحد فقط: `POST .../[id]/sync-materials`.
-- وبالبحث فى المشروع كله: **لا يناديه إلا ملفات الاختبار** — لا زر فى الشاشة،
-- ولا مسار آخر، ولا الإصدار. فالنتيجة عملياً:
--   • لا لقطة ⇒ **صرف الخامات يتعذّر**، و**استلام المنتج يتعذّر** برسالة
--     إنجليزية خام فى آخر السلسلة.
--   • لا حجز ⇒ **نفس المخزون قابل للبيع أو الصرف لأمر آخر** بينما هو محسوب
--     لأمر إنتاج جارٍ. وهذا خطر تشغيلى حقيقى (التزام مزدوج بنفس الكمية).
--
-- وأخطر ما فى الأمر أن **اختبار المسار الذهبى كان أخضر** — لأنه ينادى
-- `sync-materials` بنفسه. اختبار يمرّ على طريق لا يسلكه أى مستخدم.
--
-- **العلاج**: `release_manufacturing_production_order_atomic` يُجمّد اللقطة
-- ويحجز المخزون **فى نفس المعاملة**: إما أن يُصدَر الأمر ومواده محجوزة، أو
-- لا يُصدَر. وتُفحص شروط التجميد **قبل** الإصدار بالعربية (إصدار قائمة مواد
-- مرتبط · مخزن الصرف له مركز تكلفة · القائمة بها مكوّنات).
-- ولا خطر من نقص المخزون: الحجز يأخذ المتاح فقط (LEAST) ولا يفشل.
--
-- ── الفجوة الثانية: استلام منتج تام بلا صرف خامات ─────────────────────────
--
-- دالة الاستلام لم تكن تتحقق أبداً من صرف أى خامة. ولو استُلم منتج بلا صرف:
--   • تكلفة المنتج التام = تكلفة التحويل فقط ⇒ **مخزون تام ناقص القيمة**
--   • والخامات تبقى فى الدفاتر كأنها **لم تُستهلك** ⇒ مخزون خام مبالغ فيه
--   • فيظهر ربح غير حقيقى عند بيع المنتج
-- حارس جديد `mpoe_assert_materials_issued_before_receipt` يمنع ذلك برسالة
-- تقول للمستخدم ما يفعله («اصرف الخامات أولاً») لا ما فشل داخلياً.
-- وأُضيف نفس المنع فى المسار (422) حتى يُرفض **الطلب عند إنشائه**، فلا يُرسل
-- إشعاراً لمسؤول المخزن بطلب مستحيل التنفيذ.
--
-- ملاحظة مسجَّلة عن قصد: المنع هنا «لم تُصرف أى خامة». التحقق الأدق (تغطية
-- الكمية المستلمة بالخامات المصروفة نسبياً) يحتاج تصميم الصرف الجزئى كاملاً
-- ولم يُشمل فى هذه النشرة كى لا يُعطِّل صرفاً جزئياً مشروعاً.
--
-- ── إصلاح البيانات القائمة (بالقاعدة المؤسِّسة) ───────────────────────────
-- الأمر MPO-202607-000029 كان «قيد التنفيذ» بلقطة صفرية — أى مُصدَر بلا حجز.
-- نُفِّذ له التحضير: **٢ مكوّنات (زيت تصنيع ١ · قاعدة ماتور ١)** وحجز
-- **fully_reserved**. فصار قابلاً للصرف ثم الاستلام.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.release_manufacturing_production_order_atomic(p_company_id uuid, p_production_order_id uuid, p_updated_by uuid, p_released_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_released_at TIMESTAMPTZ := COALESCE(p_released_at, NOW());
  v_warehouse RECORD;
  v_component_lines INTEGER;
  v_sync JSONB;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT * INTO v_order FROM public.manufacturing_production_orders
   WHERE id = p_production_order_id AND company_id = p_company_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'أمر الإنتاج غير موجود أو لا ينتمى لهذه الشركة. | Manufacturing production order not found or not in company. production_order_id=%', p_production_order_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- v3.74.833 — شروط تجميد اللقطة تُفحص **قبل** الإصدار بالعربية
  IF v_order.bom_version_id IS NULL THEN
    RAISE EXCEPTION 'لا يمكن إصدار أمر الإنتاج قبل ربطه بإصدار قائمة مواد — بدونها لا يُعرف ما يُصرف له. | A production order cannot be released before a BOM version is linked.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_warehouse FROM public.warehouses WHERE id = v_order.issue_warehouse_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'مخزن صرف الخامات غير موجود. | Issue warehouse not found. warehouse_id=%', v_order.issue_warehouse_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_warehouse.cost_center_id IS NULL THEN
    RAISE EXCEPTION 'مخزن صرف الخامات «%» بلا مركز تكلفة — اضبط مركز تكلفة المخزن أولاً حتى تُحمَّل الخامات على الجهة الصحيحة. | Issue warehouse "%" has no cost centre; set it before releasing.',
      v_warehouse.name, v_warehouse.name USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*) INTO v_component_lines FROM public.manufacturing_bom_lines
   WHERE bom_version_id = v_order.bom_version_id AND company_id = p_company_id AND line_type = 'component';
  IF COALESCE(v_component_lines, 0) = 0 THEN
    RAISE EXCEPTION 'قائمة المواد المرتبطة بالأمر بلا أى مكوّن — أضف مكونات القائمة قبل الإصدار. | The linked BOM version has no component lines; add them before releasing.'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.manufacturing_production_orders
     SET status = 'released', released_at = v_released_at, released_by = p_updated_by, updated_by = p_updated_by
   WHERE id = p_production_order_id;

  -- v3.74.833 — الإصدار يُجمّد لقطة الاحتياجات ويحجز المخزون فى نفس المعاملة.
  -- كان هذا يجرى فى مسار `sync-materials` **لا يناديه إلا الاختبارات**، فما
  -- كانت اللقطة تُنشأ فى الاستخدام الفعلى أبداً.
  v_sync := public.mpoe_sync_materials_internal(p_company_id, p_production_order_id, p_updated_by);

  RETURN jsonb_build_object(
    'success', true,
    'production_order_id', p_production_order_id,
    'previous_status', v_order.status,
    'status', 'released',
    'released_at', v_released_at,
    'material_sync', v_sync
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_assert_material_requirements_snapshot_exists(p_production_order_id uuid)
RETURNS void LANGUAGE plpgsql
AS $function$
DECLARE
  v_requirement_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_requirement_count
    FROM public.production_order_material_requirements
   WHERE production_order_id = p_production_order_id;

  IF COALESCE(v_requirement_count, 0) <= 0 THEN
    RAISE EXCEPTION 'لم تُحضَّر احتياجات المواد لهذا الأمر بعد — أعد إصدار الأمر (أو نفّذ «تحضير المواد») حتى تُجمَّد قائمة المواد ويُحجز المخزون، ثم اصرف الخامات. | Material requirements have not been prepared for this order. production_order_id=%',
      p_production_order_id USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_assert_materials_issued_before_receipt(p_production_order_id uuid)
RETURNS void LANGUAGE plpgsql
AS $function$
DECLARE
  v_issued_total  NUMERIC(18,4);
  v_unissued_rows INTEGER;
BEGIN
  SELECT COALESCE(SUM(COALESCE(issued_quantity, 0)), 0),
         COUNT(*) FILTER (WHERE COALESCE(issued_quantity, 0) <= 0)
    INTO v_issued_total, v_unissued_rows
    FROM public.production_order_material_requirements
   WHERE production_order_id = p_production_order_id
     AND COALESCE(is_optional, false) = false;

  IF COALESCE(v_issued_total, 0) <= 0 THEN
    RAISE EXCEPTION 'لا يمكن استلام المنتج التام قبل صرف خاماته — لم تُصرف أى خامة لهذا الأمر (% بند بانتظار الصرف)، فلو استُلم الآن لدخل المخزون بتكلفة ناقصة وبقيت الخامات فى الدفاتر كأنها لم تُستهلك. اصرف الخامات أولاً. | Finished output cannot be received before its materials are issued; no material has been issued (% line(s) pending), so the product would be capitalised understated.',
      v_unissued_rows, v_unissued_rows USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_assert_receipt_execution_ready(p_production_order_id uuid)
RETURNS void LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_assert_order_execution_open(p_production_order_id);
  PERFORM public.mpoe_assert_material_requirements_snapshot_frozen(p_production_order_id);
  -- v3.74.833 — تكلفة المنتج التام = خامات + تحويل؛ فبلا صرف تكون التكلفة ناقصة
  PERFORM public.mpoe_assert_materials_issued_before_receipt(p_production_order_id);
END;
$function$;

-- ── إصلاح البيانات: أوامر مُصدَرة/جارية بلقطة صفرية ───────────────────────
-- تُحضَّر لها الاحتياجات ويُحجز المخزون بأثر لاحق، فلا تبقى معلَّقة بلا مخرج.
DO $repair$
DECLARE
  v_order RECORD;
  v_fixed INTEGER := 0;
BEGIN
  FOR v_order IN
    SELECT po.id, po.company_id, po.order_no, po.created_by
      FROM public.manufacturing_production_orders po
     WHERE po.status IN ('released', 'in_progress')
       AND po.bom_version_id IS NOT NULL
       AND po.issue_warehouse_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.production_order_material_requirements r
          WHERE r.production_order_id = po.id
       )
  LOOP
    BEGIN
      PERFORM public.mpoe_sync_materials_internal(v_order.company_id, v_order.id, v_order.created_by);
      v_fixed := v_fixed + 1;
      RAISE NOTICE 'prepared materials for %', v_order.order_no;
    EXCEPTION WHEN OTHERS THEN
      -- لا يُوقف الترحيل: أمر تعذّر تحضيره (مخزن بلا مركز تكلفة مثلاً) يُسجَّل
      RAISE WARNING 'could not prepare materials for % — %', v_order.order_no, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'material snapshots repaired: %', v_fixed;
END
$repair$;
