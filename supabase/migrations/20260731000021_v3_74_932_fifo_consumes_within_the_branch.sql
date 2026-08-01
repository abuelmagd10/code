-- ═══════════════════════════════════════════════════════════════════
-- v3.74.932 — استهلاكُ FIFO يقع داخل الفرع
-- ═══════════════════════════════════════════════════════════════════
--
-- **وهذه أول دفعةٍ تغيّر رقماً محاسبياً، لا من يراه.**
--
-- ═══════════ المشكلة ═══════════
--
-- حين يبيع فرعٌ صنفاً، يبحث النظام عن **أقدم طبقة شراء** لذلك الصنف —
-- بشرط الشركة والصنف فقط، **بلا سؤالٍ عن الفرع**. فلو كان للصنف طبقةٌ
-- أقدمُ فى الفرع الرئيسى، أخذت مبيعاتُ نصر تكلفتَها منها.
--
-- والنتيجة: **ربحُ الفرع البائع يظهر خطأً**، ومخزونٌ يُستنزف من فرعٍ لم
-- يبع.
--
-- ═══════════ ولماذا الآن، ولماذا بلا أثرٍ رجعى ═══════════
--
-- ثلاثةُ قياساتٍ على الإنتاج:
--
-- **(١) لم تقع الحالةُ ولا مرة**: ١٧ عمليةَ استهلاكٍ حتى الآن (بيع ·
-- مرتجع شراء · صرف تصنيع · استهلاك خدمة) — **كلُّها أخذت الطبقةَ من نفس
-- فرع الحركة**. صفر تجاوز.
--
-- **(٢) ولا صنفَ له رصيدٌ مفتوحٌ فى الفرعين معاً**: ثلاثةٌ فى الرئيسى
-- واثنان فى نصر. فأصنافُك لم تتشابك بعد — وأولُ صنفٍ يُشترى للفرعين تبدأ
-- الأرقام تختلط.
--
-- **(٣) وكلُّ طبقةٍ تحمل فرعَها**: ١٦ من ١٦، والثمانى المفتوحة كلُّها.
-- فلا غموضَ فى «طبقةٍ بلا فرع».
--
-- **فالتصحيحُ اليوم بلا تصحيح قيودٍ قديمة. وكلُّ يومٍ يمرّ يجعله أغلى.**
--
-- ═══════════ والعلاج: تمريرُ الفرع، لا اختراعُه ═══════════
--
-- المُنادِيان **يعرفان الفرع بالفعل**: محفِّزُ قيد التكلفة عنده
-- `NEW.branch_id`، ودالةُ استهلاك الخدمة عندها `r.branch_id`. فلا يُشتقّ
-- الفرعُ ولا يُخمَّن — **يُمرَّر**.
--
-- والبارامتر **اختيارىٌّ فى آخر التوقيع** (`DEFAULT NULL`)، فأى مُنادٍ
-- قديمٍ لم يُحدَّث يبقى عاملاً بالسلوك السابق بدل أن ينكسر.
--
-- **وحين يُمرَّر الفرع**: تُقصر الطبقاتُ على `branch_id = p_branch_id`،
-- **أو `branch_id IS NULL`** — وهى طبقةٌ قديمةٌ على مستوى الشركة، تُقبل كى
-- لا يُحجب مخزونٌ مشروعٌ عن صاحبه. (صفرُ طبقاتٍ من هذا الشكل اليوم.)
--
-- ═══════════ وعطبٌ ثالث: الدالةُ الحيّة تفشل مفتوحة ═══════════
--
-- `consume_fifo_lots` — وهى **الدالة الحيّة** لا النائمة — إن لم تجد
-- طبقاتٍ كافية **تُرجع تكلفةً أقلّ** بـ`RAISE WARNING` لا بخطأ. نفس عطب
-- 929، لكن على المسار العامل.
--
-- **وقرار المالك: يرفض بخطأٍ صاخب.** ولا يُرحَّل قيدٌ بتكلفةٍ منقوصة أبداً.
-- وأثرُه اليوم **صفر**: قِيس أن رصيدَ كل صنفٍ يساوى طبقاتِه بالضبط —
-- ماتور ١/١ · كشاف ١٠/١٠ · زيت ٣/٣ · متوسيكل ٢/٢ · booto ٢/٢. فلا بيعَ
-- ممكنٌ اليوم يقع فى النقص.
--
-- ═══════════ وتصحيحٌ لِما قيل فى 929 ═══════════
--
-- قيل هناك إن `calculate_fifo_cogs` **نائمة**. وهذا خطأ: القياسُ الأدقّ
-- يقول إنها **على المسار الحىّ** — يناديها محفِّزُ قيد التكلفة فى الفرع
-- الحديث (حين يرسل التطبيق حمولة FIFO)، ويستعمل `consume_fifo_lots` فى
-- الفرع القديم. والتحويلُ إلى الخطأ الصاخب فى 929 كان إذن على مسارٍ عامل،
-- وأثرُه صفرٌ **بالقياس** لا بالحظّ.
--
-- ═══════════ وكيف تُعدَّل الدالّتان المُنادِيتان ═══════════
--
-- **لا يُنسخ جسدُهما هنا.** تُقرأ الدالةُ من القاعدة، ويُضاف الفرعُ عند
-- **موضع النداء وحده**، ويُعاد إنشاؤها. فإن لم يوجد موضعُ النداء المكتوب
-- أدناه حرفياً، **تُرفع استثناءٌ وتتوقف الهجرة** — فلا تمرّ صامتةً على
-- دالةٍ تغيّر شكلُها.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════ (١) الاستهلاك: بالفرع، ويفشل مغلقاً ═══════

DROP FUNCTION IF EXISTS public.consume_fifo_lots(uuid, uuid, numeric, text, text, uuid, date);

CREATE OR REPLACE FUNCTION public.consume_fifo_lots(p_company_id uuid, p_product_id uuid, p_quantity numeric, p_consumption_type text, p_reference_type text, p_reference_id uuid, p_consumption_date date DEFAULT CURRENT_DATE, p_branch_id uuid DEFAULT NULL)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_lot RECORD;
  v_remaining_qty NUMERIC := p_quantity;
  v_qty_from_lot NUMERIC;
  v_cost_from_lot NUMERIC;
  v_total_cogs NUMERIC := 0;
BEGIN
  -- v3.74.730 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access(p_company_id);

  FOR v_lot IN
    SELECT id, remaining_quantity, unit_cost
    FROM fifo_cost_lots
    WHERE product_id = p_product_id
      AND company_id = p_company_id
      AND remaining_quantity > 0
      -- v3.74.932 — الفرعُ حين يُمرَّر: طبقاتُ فرعه، وطبقةٌ بلا فرع (قديمة
      -- على مستوى الشركة). ولا يأخذ من فرعٍ آخر أبداً.
      AND (p_branch_id IS NULL OR branch_id = p_branch_id OR branch_id IS NULL)
    ORDER BY lot_date ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_qty <= 0;

    v_qty_from_lot := LEAST(v_lot.remaining_quantity, v_remaining_qty);
    v_cost_from_lot := v_qty_from_lot * v_lot.unit_cost;

    INSERT INTO fifo_lot_consumptions (
      company_id, lot_id, product_id, consumption_type,
      reference_type, reference_id, quantity_consumed,
      unit_cost, total_cost, consumption_date
    ) VALUES (
      p_company_id, v_lot.id, p_product_id, p_consumption_type,
      p_reference_type, p_reference_id, v_qty_from_lot,
      v_lot.unit_cost, v_cost_from_lot, p_consumption_date
    );

    UPDATE fifo_cost_lots
       SET remaining_quantity = remaining_quantity - v_qty_from_lot,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = v_lot.id;

    v_total_cogs := v_total_cogs + v_cost_from_lot;
    v_remaining_qty := v_remaining_qty - v_qty_from_lot;
  END LOOP;

  -- v3.74.932 — كان تحذيراً فتمرّ تكلفةٌ منقوصةٌ بصمت. صار رفضاً.
  IF v_remaining_qty > 0 THEN
    RAISE EXCEPTION 'FIFO_LOTS_INSUFFICIENT: product % short by % in branch % - refusing to post an understated cost',
      p_product_id, v_remaining_qty, COALESCE(p_branch_id::text, '(company)');
  END IF;

  RETURN v_total_cogs;
END;
$function$;

-- ⚠️ درس 929: كل CREATE FUNCTION يمنح EXECUTE لـPUBLIC تلقائياً.
REVOKE ALL ON FUNCTION public.consume_fifo_lots(uuid, uuid, numeric, text, text, uuid, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_fifo_lots(uuid, uuid, numeric, text, text, uuid, date, uuid) TO service_role;

-- ═══════ (٢) التسعير: بالفرع كذلك ═══════

DROP FUNCTION IF EXISTS public.calculate_fifo_cogs(uuid, numeric);

CREATE OR REPLACE FUNCTION public.calculate_fifo_cogs(p_product_id uuid, p_quantity numeric, p_branch_id uuid DEFAULT NULL, OUT total_cogs numeric, OUT lots_used jsonb)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_lot RECORD;
  v_remaining_qty NUMERIC := p_quantity;
  v_qty_from_lot NUMERIC;
  v_cost_from_lot NUMERIC;
  v_lots_array JSONB := '[]'::JSONB;
  v_company_id UUID;
BEGIN
  total_cogs := 0;

  SELECT p.company_id INTO v_company_id FROM public.products p WHERE p.id = p_product_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'FIFO_PRODUCT_NOT_FOUND: product % has no company', p_product_id;
  END IF;

  FOR v_lot IN
    SELECT id, remaining_quantity, unit_cost, lot_date
    FROM public.fifo_cost_lots
    WHERE product_id = p_product_id
      AND company_id = v_company_id
      AND remaining_quantity > 0
      AND (p_branch_id IS NULL OR branch_id = p_branch_id OR branch_id IS NULL)
    ORDER BY lot_date ASC, created_at ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;

    v_qty_from_lot := LEAST(v_lot.remaining_quantity, v_remaining_qty);
    v_cost_from_lot := v_qty_from_lot * v_lot.unit_cost;

    total_cogs := total_cogs + v_cost_from_lot;

    v_lots_array := v_lots_array || jsonb_build_object(
      'lot_id', v_lot.id,
      'quantity', v_qty_from_lot,
      'unit_cost', v_lot.unit_cost,
      'total_cost', v_cost_from_lot,
      'lot_date', v_lot.lot_date
    );

    v_remaining_qty := v_remaining_qty - v_qty_from_lot;
  END LOOP;

  lots_used := v_lots_array;

  IF v_remaining_qty > 0 THEN
    RAISE EXCEPTION 'FIFO_LOTS_INSUFFICIENT: product % short by % in branch % - refusing to report an understated cost',
      p_product_id, v_remaining_qty, COALESCE(p_branch_id::text, '(company)');
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.calculate_fifo_cogs(uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_fifo_cogs(uuid, numeric, uuid) TO service_role;

-- ═══════ (٣) والمُنادِيان: يُضاف الفرعُ عند موضع النداء وحده ═══════

DO $patch$
DECLARE
  v_def TEXT;
  v_anchor_cogs TEXT := 'public.calculate_fifo_cogs(NEW.product_id, ABS(NEW.quantity_change))';
  v_anchor_date TEXT := 'COALESCE(NEW.created_at::date, CURRENT_DATE)';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'auto_create_cogs_journal';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'auto_create_cogs_journal not found';
  END IF;
  IF position(v_anchor_cogs IN v_def) = 0 OR position(v_anchor_date IN v_def) = 0 THEN
    RAISE EXCEPTION 'call site changed in auto_create_cogs_journal - refusing to patch blindly';
  END IF;

  v_def := replace(v_def, v_anchor_cogs,
    'public.calculate_fifo_cogs(NEW.product_id, ABS(NEW.quantity_change), NEW.branch_id)');
  v_def := replace(v_def, v_anchor_date, v_anchor_date || ', NEW.branch_id');

  EXECUTE v_def;
END
$patch$;

DO $patch$
DECLARE
  v_def TEXT;
  v_anchor TEXT := 'COALESCE(r.created_at::date, CURRENT_DATE)';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_post_service_consumption_cogs';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'fn_post_service_consumption_cogs not found';
  END IF;
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'call site changed in fn_post_service_consumption_cogs - refusing to patch blindly';
  END IF;

  v_def := replace(v_def, v_anchor, v_anchor || ', r.branch_id');

  EXECUTE v_def;
END
$patch$;

COMMENT ON FUNCTION public.consume_fifo_lots(uuid, uuid, numeric, text, text, uuid, date, uuid) IS
  'v3.74.932 — يستهلك من طبقات الفرع الممرَّر (ومن طبقةٍ بلا فرع)، ولا يأخذ من فرعٍ آخر. ويرفض بخطأٍ صاخب عند النقص بدل تكلفةٍ منقوصة.';
