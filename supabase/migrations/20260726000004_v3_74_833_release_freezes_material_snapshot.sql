-- ============================================================================
-- v3.74.833 — تتبّع صرف الخامات كان مُجمَّداً على صفر · والإصدار لا يحجز
-- ============================================================================
-- سؤال المالك: «هل يعقل أن يُستلم المنتج النهائى قبل استلام المواد الخام؟»
-- لا يعقل، وهو خطأ محاسبى. وبتقصّى الأمر تبيّن **ثلاث فجوات متراكبة**، وكانت
-- المحاولة الأولى لسدّ الثالثة **ستُعطِّل التصنيع كله** — فلنبدأ بها.
--
-- ── ⚠️ تصحيح ذاتى: الحارس الأول كان سيمنع كل استلام مشروع ─────────────────
-- كتبت أولاً حارساً يقرأ `production_order_material_requirements.issued_quantity`.
-- ثم فحصت أمراً مكتملاً فعلاً (MPO-202607-000028): الخامات **استُهلكت حقاً**
-- (دفعات FIFO نقصت: زيت ٣→٢ · قاعدة ٣→٢، والمنتج التام دخل بتكلفة ٦٠.٠٠)،
-- ومع ذلك كانت سطور الاحتياجات تقول `issued_quantity = 0` و`pending`.
-- فلو نُشر ذلك الحارس لرفض **كل** استلام فى المشروع. القاعدة المؤسِّسة عملت:
-- «لا نُصلح شيئاً ونُعطِّل آخر» — ولهذا نفحص البيانات قبل النشر لا بعده.
--
-- ── الفجوة الجوهرية: أعمدة تتبّع الصرف مُجمَّدة، والفشل صامت ───────────────
-- جدول الاحتياجات محمى بحارس «لقطة مجمَّدة — UPDATE ممنوع». والحارس يمنع
-- **كل** تحديث، بما فيه أعمدة تتبّع التنفيذ (`issued_quantity` ·
-- `approved_quantity` · `shortage_quantity` · `line_issue_status`).
-- ومسار اعتماد الصرف يُحدِّث هذه الأعمدة **بلا فحص نتيجة** (unchecked write)
-- — فالتحديث يفشل ولا يعلم أحد. والنتيجة:
--   • كل أمر إنتاج يبقى «بانتظار الصرف» للأبد، وإن صُرف بالكامل.
--   • حساب «المتبقى للصرف» فى المسار يرى الكمية كاملة، فيسمح بطلب صرف
--     **ثانٍ** لخامات مصروفة (تمنعه الدالة الذرية برسالة إنجليزية خام، فلا
--     يقع استهلاك مزدوج — لكن المستخدم يواجه خطأً غامضاً).
--   • تتبّع الصرف الجزئى والنقص وسلسلة إشعار أمر الشراء **لا تعمل أصلاً**.
--
-- والسبب الجذرى: الترحيل `20260508000200_allow_material_issue_tracking_updates`
-- موجود فى المستودع، و**كائناته غائبة عن قاعدة الإنتاج**: لا الدالة
-- `refresh_material_requirement_issue_tracking` ولا المُشغِّل عليها. أى ملف
-- ترحيل مكتوب ولم يصل للقاعدة الحيّة. (وكذلك قاعدة الاختبار — تحقق.)
-- فيُعاد سنّ محتواه هنا صريحاً على القاعدتين.
--
-- ── الفجوة الثانية: الإصدار لا يحجز المخزون ────────────────────────────────
-- لقطة الاحتياجات كانت تُنشأ **متأخرة** عند أول صرف (داخل الدالة الذرية)، لا
-- عند الإصدار. فبين الإصدار وأول صرف يكون المخزون **غير محجوز**: نفس الكمية
-- قابلة للبيع أو الصرف لأمر آخر وهى محسوبة لأمر إنتاج جارٍ.
-- الإصدار الآن يُجمّد اللقطة ويحجز فى **نفس المعاملة**، وشروطه تُفحص قبله
-- بالعربية (قائمة مواد مرتبطة · مخزن الصرف له مركز تكلفة · القائمة بها
-- مكوّنات). ولا خطر من نقص المخزون: الحجز يأخذ المتاح فقط ولا يفشل.
--
-- ── الفجوة الثالثة: استلام منتج تام بلا صرف خامات ─────────────────────────
-- تكلفة المنتج التام = خامات + تكلفة تحويل. فبلا صرف: مخزون تام ناقص القيمة ·
-- خامات باقية كأنها لم تُستهلك · وربح غير حقيقى عند البيع. حارس جديد يمنع
-- ذلك، **ويقرأ من `production_order_issue_lines`** — مصدر الحقيقة الذى تحسب
-- منه الدالة الذرية نفسها — لا من عمود مُشتق قد يتخلّف مرة أخرى.
--
-- ── إصلاح البيانات القائمة (بالقاعدة المؤسِّسة) ───────────────────────────
-- تُعاد حوسبة تتبّع الصرف لكل سطور الاحتياجات من سطور الصرف الفعلية.
-- النتيجة على الإنتاج: MPO-202607-000028 صار **fully_issued** بكميات ١ و١
-- ونقص صفر (بعد أن كان pending/0 وهو مكتمل)، وMPO-202607-000029 يبقى
-- pending بحق لأنه لم يُصرف بعد.
-- وتُحضَّر الاحتياجات لأى أمر مُصدَر/جارٍ بلقطة صفرية.
-- ============================================================================

-- ── (١) اللقطة تبقى مجمَّدة، إلا أعمدة تتبّع التنفيذ ───────────────────────
CREATE OR REPLACE FUNCTION public.mpoe_guard_material_requirement_immutability()
RETURNS TRIGGER LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.mpoe_assert_material_requirement_mutation_forbidden(OLD.id, TG_OP);
    RETURN OLD;
  END IF;

  -- كل ما يصف **ما طُلب** يبقى غير قابل للتغيير؛ وما يصف **ما نُفِّذ** يُحدَّث
  IF TG_OP = 'UPDATE'
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
     AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
     AND NEW.production_order_id IS NOT DISTINCT FROM OLD.production_order_id
     AND NEW.source_bom_line_id IS NOT DISTINCT FROM OLD.source_bom_line_id
     AND NEW.warehouse_id IS NOT DISTINCT FROM OLD.warehouse_id
     AND NEW.cost_center_id IS NOT DISTINCT FROM OLD.cost_center_id
     AND NEW.line_no IS NOT DISTINCT FROM OLD.line_no
     AND NEW.requirement_type IS NOT DISTINCT FROM OLD.requirement_type
     AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id
     AND NEW.issue_uom IS NOT DISTINCT FROM OLD.issue_uom
     AND NEW.is_optional IS NOT DISTINCT FROM OLD.is_optional
     AND NEW.bom_base_output_qty IS NOT DISTINCT FROM OLD.bom_base_output_qty
     AND NEW.order_planned_qty IS NOT DISTINCT FROM OLD.order_planned_qty
     AND NEW.quantity_per IS NOT DISTINCT FROM OLD.quantity_per
     AND NEW.scrap_percent IS NOT DISTINCT FROM OLD.scrap_percent
     AND NEW.net_required_qty IS NOT DISTINCT FROM OLD.net_required_qty
     AND NEW.gross_required_qty IS NOT DISTINCT FROM OLD.gross_required_qty
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    RETURN NEW;
  END IF;

  PERFORM public.mpoe_assert_material_requirement_mutation_forbidden(OLD.id, TG_OP);
  RETURN NEW;
END;
$function$;

-- ── (٢) التتبّع يُحدَّث تلقائياً من سطور الصرف — فلا يعتمد على مسار يتذكّر ──
CREATE OR REPLACE FUNCTION public.refresh_material_requirement_issue_tracking()
RETURNS TRIGGER LANGUAGE plpgsql
AS $function$
DECLARE
  v_issued_qty NUMERIC;
  v_required_qty NUMERIC;
  v_approved_qty NUMERIC;
BEGIN
  SELECT COALESCE(SUM(issued_qty), 0) INTO v_issued_qty
    FROM public.production_order_issue_lines
   WHERE material_requirement_id = NEW.material_requirement_id;

  SELECT gross_required_qty, COALESCE(approved_quantity, 0)
    INTO v_required_qty, v_approved_qty
    FROM public.production_order_material_requirements
   WHERE id = NEW.material_requirement_id;

  UPDATE public.production_order_material_requirements
     SET issued_quantity = COALESCE(v_issued_qty, 0),
         shortage_quantity = GREATEST(v_required_qty - GREATEST(COALESCE(v_approved_qty,0), COALESCE(v_issued_qty,0)), 0),
         line_issue_status = CASE
           WHEN GREATEST(COALESCE(v_approved_qty,0), COALESCE(v_issued_qty,0)) >= v_required_qty THEN 'fully_issued'
           WHEN GREATEST(COALESCE(v_approved_qty,0), COALESCE(v_issued_qty,0)) > 0 THEN 'partially_issued'
           ELSE 'pending'
         END
   WHERE id = NEW.material_requirement_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_refresh_material_requirement_issue_tracking
  ON public.production_order_issue_lines;

CREATE TRIGGER trg_refresh_material_requirement_issue_tracking
AFTER INSERT ON public.production_order_issue_lines
FOR EACH ROW EXECUTE FUNCTION public.refresh_material_requirement_issue_tracking();

-- ── (٣) الإصدار يُجمّد اللقطة ويحجز المخزون فى نفس المعاملة ───────────────
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

  -- شروط تجميد اللقطة تُفحص **قبل** الإصدار وبالعربية
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

  -- الحجز عند الإصدار لا عند أول صرف: بينهما كان المخزون قابلاً للبيع
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

-- ── (٤) رسالة اللقطة الغائبة بلغة العمل ────────────────────────────────────
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
    RAISE EXCEPTION 'لم تُحضَّر احتياجات المواد لهذا الأمر بعد — أعد إصدار الأمر حتى تُجمَّد قائمة المواد ويُحجز المخزون، ثم اصرف الخامات. | Material requirements have not been prepared for this order. production_order_id=%',
      p_production_order_id USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

-- ── (٥) لا استلام لمنتج تام قبل صرف خاماته — من سطور الصرف مباشرة ─────────
CREATE OR REPLACE FUNCTION public.mpoe_assert_materials_issued_before_receipt(p_production_order_id uuid)
RETURNS void LANGUAGE plpgsql
AS $function$
DECLARE
  v_issued_total  NUMERIC(18,4);
  v_pending_lines INTEGER;
BEGIN
  -- مصدر الحقيقة: سطور الصرف الفعلية، وهى ما تحسب منه الدالة الذرية المتبقى
  SELECT COALESCE(SUM(il.issued_qty), 0)::NUMERIC(18,4) INTO v_issued_total
    FROM public.production_order_issue_lines il
   WHERE il.production_order_id = p_production_order_id;

  SELECT COUNT(*) INTO v_pending_lines
    FROM public.production_order_material_requirements r
   WHERE r.production_order_id = p_production_order_id
     AND COALESCE(r.is_optional, false) = false
     AND NOT EXISTS (
       SELECT 1 FROM public.production_order_issue_lines il
        WHERE il.material_requirement_id = r.id AND il.issued_qty > 0
     );

  IF COALESCE(v_issued_total, 0) <= 0 THEN
    RAISE EXCEPTION 'لا يمكن استلام المنتج التام قبل صرف خاماته — لم تُصرف أى خامة لهذا الأمر (% بند بانتظار الصرف)، فلو استُلم الآن لدخل المخزون بتكلفة ناقصة وبقيت الخامات فى الدفاتر كأنها لم تُستهلك. اصرف الخامات أولاً. | Finished output cannot be received before its materials are issued; nothing has been issued (% line(s) pending), so the product would be capitalised understated.',
      v_pending_lines, v_pending_lines USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_assert_receipt_execution_ready(p_production_order_id uuid)
RETURNS void LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_assert_order_execution_open(p_production_order_id);
  PERFORM public.mpoe_assert_material_requirements_snapshot_frozen(p_production_order_id);
  PERFORM public.mpoe_assert_materials_issued_before_receipt(p_production_order_id);
END;
$function$;

-- ── (٦) إصلاح البيانات: إعادة حوسبة التتبّع من سطور الصرف الفعلية ─────────
WITH issued AS (
  SELECT r.id, r.gross_required_qty,
         COALESCE((SELECT SUM(il.issued_qty) FROM public.production_order_issue_lines il
                    WHERE il.material_requirement_id = r.id), 0) AS iss
  FROM public.production_order_material_requirements r
)
UPDATE public.production_order_material_requirements r
   SET issued_quantity   = i.iss,
       approved_quantity  = GREATEST(COALESCE(r.approved_quantity, 0), i.iss),
       shortage_quantity  = GREATEST(i.gross_required_qty - GREATEST(COALESCE(r.approved_quantity, 0), i.iss), 0),
       line_issue_status  = CASE
         WHEN GREATEST(COALESCE(r.approved_quantity, 0), i.iss) >= i.gross_required_qty THEN 'fully_issued'
         WHEN GREATEST(COALESCE(r.approved_quantity, 0), i.iss) > 0 THEN 'partially_issued'
         ELSE 'pending' END
  FROM issued i
 WHERE i.id = r.id
   AND r.issued_quantity IS DISTINCT FROM i.iss;

-- ── (٧) إصلاح البيانات: أوامر مُصدَرة/جارية بلقطة صفرية ───────────────────
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
  RAISE NOTICE 'material snapshots prepared: %', v_fixed;
END
$repair$;
