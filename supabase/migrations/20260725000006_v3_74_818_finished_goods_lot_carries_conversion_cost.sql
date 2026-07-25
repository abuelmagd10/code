-- ============================================================================
-- v3.74.818 — دفعة المنتج التام تحمل تكلفة التحويل (لا المواد وحدها)
-- ============================================================================
-- **الفجوة** — انفصال بين ما يُحمَّل على الدفاتر وما يُسعَّر به المخزون:
--
--   • القيد (`postProductReceiptJournal`) يُدين «المنتج التام» بـ
--     **المواد + تكلفة التحويل** (أجور + أعباء صناعية) — وهو الصحيح بمعيار
--     IAS 2، ويُنشئ التزام الأجور وحساب الأعباء المحمَّلة.
--   • بينما `receipt_manufacturing_production_order_output_atomic` تُسعّر
--     حركة المخزون **ودفعة FIFO** من `v_total_issued_cost` وحده — أى
--     **تكلفة المواد فقط**.
--
-- النتيجة عند تشغيل أسعار مراكز العمل (أجور/أعباء > صفر):
--   ١. **انحراف دائم** بين حساب المخزون وتقييم الدفعات = تكلفة التحويل،
--      يتراكم مع كل أمر إنتاج ولا يمكن تفسيره لاحقاً.
--   ٢. **تكلفة البضاعة المباعة ناقصة** عند بيع المنتج التام (تخرج بتكلفة
--      المواد فقط) ⇒ **ربح مبالغ فيه** فى قائمة الدخل، وهو أخطر أثر.
--   ٣. تقارير تكلفة المنتج تُظهر منتجاً أرخص من حقيقته ⇒ قرارات تسعير خاطئة.
--
-- لم يظهر الأثر فى الدورة التجريبية الأولى لأن مراكز العمل كانت بأسعار
-- صفرية (المنتج التام دخل بـ60 = مواد فقط، وخرج COGS بـ60 — متطابقان
-- بالمصادفة). أول مركز عمل بسعر أجر حقيقى كان سيفتح الفجوة.
--
-- **العلاج**: تُحسب تكلفة التحويل داخل القاعدة بنفس معادلة الواجهة حرفياً،
-- وتُضاف لتكلفة الاستلام **قبل** إنشاء حركة المخزون ودفعة FIFO — فيتطابق
-- المصدران بالبناء لا بالمصادفة.
-- ============================================================================

-- ─── (١) توأم المعادلة فى SQL ──────────────────────────────────────────────
-- نسخة مطابقة لـ calculateConversionCost فى lib/manufacturing/manufacturing-accounting.ts:
--   labor  = (دقائق العمالة ÷ 60) × سعر العمالة × (100 ÷ نسبة الكفاءة)
--   machine/var_oh/fixed_oh = (دقائق الآلة ÷ 60) × السعر المقابل
-- وتُحتسب العمليات المكتملة وحدها (status='completed').
CREATE OR REPLACE FUNCTION public.mpoe_conversion_cost(p_production_order_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(ROUND(SUM(
      (COALESCE(op.labor_time_minutes, 0) / 60.0)
        * COALESCE(wc.labor_cost_rate, 0)
        * CASE WHEN COALESCE(wc.efficiency_percent, 100) > 0
               THEN 100.0 / wc.efficiency_percent ELSE 1 END
    + (COALESCE(op.machine_time_minutes, 0) / 60.0)
        * (COALESCE(wc.machine_cost_rate, 0)
         + COALESCE(wc.variable_overhead_rate, 0)
         + COALESCE(wc.fixed_overhead_rate, 0))
  ), 2), 0)
  FROM public.manufacturing_production_order_operations op
  JOIN public.manufacturing_work_centers wc ON wc.id = op.work_center_id
  WHERE op.production_order_id = p_production_order_id
    AND op.status = 'completed';
$function$;

-- ─── (٢) الترقيع بالمرساة الموثقة ──────────────────────────────────────────
-- تُعدَّل الدالة الذرية بحيث تُضاف تكلفة التحويل لتكلفة الاستلام. المرساة
-- هى كتلة حساب v_receipt_total_cost كاملةً — يُتحقق أنها تطابق **مرة واحدة
-- بالضبط** قبل الاستبدال، وعلامة idempotency تمنع الترقيع المكرر.
DO $$
DECLARE
  d text;
  a text := $anchor$  IF v_remaining_receivable_qty = v_received_qty THEN
    v_receipt_total_cost := GREATEST(v_total_issued_cost - v_total_receipted_cost, 0)::NUMERIC(18,4);
  ELSE
    v_receipt_total_cost := public.mpoe_round_qty(
      (COALESCE(v_total_issued_cost, 0) / v_order.planned_quantity) * v_received_qty
    );
  END IF;$anchor$;
  marker text := 'v3.74.818 conversion cost';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'receipt_manufacturing_production_order_output_atomic';

  IF d IS NULL THEN
    RAISE EXCEPTION 'receipt_manufacturing_production_order_output_atomic not found';
  END IF;
  IF d LIKE '%' || marker || '%' THEN
    RAISE NOTICE 'already patched'; RETURN;
  END IF;
  IF (length(d) - length(replace(d, a, ''))) / length(a) <> 1 THEN
    RAISE EXCEPTION 'anchor not unique in receipt_manufacturing_production_order_output_atomic';
  END IF;

  d := replace(d, a,
    '  -- ' || marker || ': تكلفة الدفعة = المواد + التحويل، تماماً كما يُحمّل' || chr(10) ||
    '  -- القيد. كانت المواد وحدها فينشأ انحراف دائم بين الدفاتر وتقييم' || chr(10) ||
    '  -- الدفعات، وتخرج البضاعة المباعة بتكلفة ناقصة فيتضخم الربح.' || chr(10) ||
    '  v_conversion_cost := public.mpoe_conversion_cost(p_production_order_id);' || chr(10) ||
    chr(10) ||
    '  IF v_remaining_receivable_qty = v_received_qty THEN' || chr(10) ||
    '    v_receipt_total_cost := GREATEST(' || chr(10) ||
    '      (v_total_issued_cost + COALESCE(v_conversion_cost, 0)) - v_total_receipted_cost, 0' || chr(10) ||
    '    )::NUMERIC(18,4);' || chr(10) ||
    '  ELSE' || chr(10) ||
    '    -- استلام جزئى: تُوزَّع المواد والتحويل معاً بنسبة الكمية المستلمة' || chr(10) ||
    '    v_receipt_total_cost := public.mpoe_round_qty(' || chr(10) ||
    '      ((COALESCE(v_total_issued_cost, 0) + COALESCE(v_conversion_cost, 0))' || chr(10) ||
    '        / v_order.planned_quantity) * v_received_qty' || chr(10) ||
    '    );' || chr(10) ||
    '  END IF;'
  );

  -- إعلان المتغيّر الجديد فى كتلة DECLARE — مرساة سطر الإعلان بالكامل
  -- (لا الاسم وحده، فهو يتكرر داخل الجسم — نفس درس فخ المرساة غير الفريدة)
  IF (length(d) - length(replace(d, '  v_total_issued_cost NUMERIC(18,4);', '')))
     / length('  v_total_issued_cost NUMERIC(18,4);') <> 1 THEN
    RAISE EXCEPTION 'declare anchor not unique';
  END IF;
  d := replace(d,
    '  v_total_issued_cost NUMERIC(18,4);',
    '  v_conversion_cost NUMERIC(18,4) := 0;' || chr(10) || '  v_total_issued_cost NUMERIC(18,4);'
  );

  EXECUTE d;
END $$;
