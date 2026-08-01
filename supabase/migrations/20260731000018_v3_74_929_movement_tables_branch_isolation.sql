-- ═══════════════════════════════════════════════════════════════════
-- v3.74.929 — جداول الحركة تُعزل بالفرع، وبابان نائمان يُغلقان
-- ═══════════════════════════════════════════════════════════════════
--
-- آخرُ ثلاثة جداولٍ من التسعة عشر، وفيها التكلفة **عاريةً** لا فى بندِ
-- مستند.
--
-- ═══════════ (أ) `inventory_transactions` — مصيدة 928 ثانيةً ═══════════
--
-- على الجدول سياسةُ عزلٍ بالفرع **صحيحةٌ تماماً**
-- (`inventory_transactions_select_branch_isolation` تستعمل
-- `can_access_record_branch`)، وبجوارها `..._select_members` — عضويةُ
-- شركةٍ وحدها **تبتلعها**. ونفسُ الازدواج على التعديل والحذف. ومعهما
-- سياسةٌ ثالثةٌ ميتة على `app.current_company_id` (كالتى حُذفت فى 922).
--
-- **خامسُ مرة** تكون القاعدةُ معروفةً وغيرَ نافذة، **وثانى مرة** تكون
-- مكتوبةً على الجدول نفسه ومعطَّلةً بجاره. فلا سؤال هنا: تُحذف المتساهلات
-- وتبقى العزلة كما كُتبت.
--
-- ═══════════ (ب) `fifo_cost_lots` و`cogs_transactions` ═══════════
--
-- الأولى سياسةٌ واحدة `is_company_member` تشمل القراءة والكتابة معاً،
-- والثانية قراءةٌ على مستوى الشركة. وفى كلتيهما `unit_cost`.
--
-- **وقرار المالك: تُقرآن بقيد الفرع** — إتمامٌ لحجب التكلفة من 906 إلى
-- 916، وإلا فالرقمُ المحجوب فى المنتج يُقرأ من الدفعة.
--
-- ⚠️ **ولا تُكتب سياسةُ الكتابة بـ`FOR ALL`** (درس 926): سياسةُ ALL تشمل
-- القراءة، والمتساهلات تُجمع بـOR، فتُعيد فتحَ ما أُغلق. فقُسّمت الكتابة
-- إلى إدراجٍ وتعديلٍ وحذفٍ **بنصّها القديم حرفاً بحرف**.
--
-- ═══════════ (ج) وأثرُ ذلك على الدفاتر: صفر — وقد قِيس ═══════════
--
-- استهلاكُ FIFO فى `consume_fifo_lots`، وقيدُ التكلفة فى محفِّز
-- `auto_create_cogs_journal` — **وكلاهما `SECURITY DEFINER`**، فلا تمسّهما
-- سياساتُ القراءة. فعزلُ القراءة لا يغيّر رقماً واحداً فى الترحيل.
--
-- ═══════════ (د) وبابان نائمان — درس 915 حرفياً ═══════════
--
-- `calculate_fifo_cogs` و`calculate_fifo_cost` دالّتان **`SECURITY
-- INVOKER`** تقرآن الدفعات بصلاحية المُنادى، وفيهما عطبان:
--
-- **الأول: تفشلان مفتوحتين.** إن لم ترَيا دفعاتٍ كافية **تُرجعان تكلفةً
-- أقلّ** ولا ترفعان خطأً — `RAISE WARNING` وحده. فلو نودِيتا من جلسة
-- مستخدمٍ بعد العزل لأنتجتا تكلفةً منقوصةً **بصمت**.
--
-- **والثانى: لا تسألان عن الشركة أصلاً** (`WHERE product_id = ...`
-- وحده). فما يحميهما اليوم هو RLS. ولو نودِيتا بمفتاح الخدمة — الذى
-- يتخطى RLS — **لقرأتا دفعات شركاتٍ أخرى**.
--
-- وهما نائمتان: لا محفِّز يستدعيهما ولا سطرَ فى التطبيق (قِيس — المحفِّز
-- الحىّ `auto_create_cogs_journal` غيرُهما). **لكن «نائم» ليس «غير
-- ممكن»**، وهى عبارة 919 نفسها.
--
-- فتُصلحان بثلاثة: `SECURITY DEFINER` (فتقرآن الحقيقة لا ما يُرى)،
-- وقيدُ الشركة **مشتقٌّ من المنتج** (فلا يتغير توقيعُهما ولا يُكسر
-- مُنادٍ)، و**الخطأُ الصاخب** بدل التحذير عند نقص الدفعات.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════ (١) حركات المخزون: تُحذف الأبواب التى تبتلع العزلة ═══════

DROP POLICY IF EXISTS inventory_company_isolation            ON public.inventory_transactions;
DROP POLICY IF EXISTS inventory_transactions_select_members  ON public.inventory_transactions;
DROP POLICY IF EXISTS inventory_transactions_update_members  ON public.inventory_transactions;
DROP POLICY IF EXISTS inventory_transactions_delete_members  ON public.inventory_transactions;

-- ═══════ (٢) دفعات FIFO ═══════

DROP POLICY IF EXISTS fifo_lots_company_isolation ON public.fifo_cost_lots;

CREATE POLICY fifo_cost_lots_select_branch_isolation ON public.fifo_cost_lots
FOR SELECT
USING (
  company_id IN (SELECT get_user_company_ids())
  AND public.can_access_record_branch(company_id, branch_id)
);

CREATE POLICY fifo_cost_lots_insert_company ON public.fifo_cost_lots
FOR INSERT
WITH CHECK (is_company_member(company_id));

CREATE POLICY fifo_cost_lots_update_company ON public.fifo_cost_lots
FOR UPDATE
USING (is_company_member(company_id))
WITH CHECK (is_company_member(company_id));

CREATE POLICY fifo_cost_lots_delete_company ON public.fifo_cost_lots
FOR DELETE
USING (is_company_member(company_id));

-- ═══════ (٣) قيود التكلفة ═══════

DROP POLICY IF EXISTS "Users can view COGS for their companies" ON public.cogs_transactions;

CREATE POLICY cogs_transactions_select_branch_isolation ON public.cogs_transactions
FOR SELECT
USING (
  company_id IN (SELECT get_user_company_ids())
  AND public.can_access_record_branch(company_id, branch_id)
);

-- ═══════ (٤) البابان النائمان ═══════

CREATE OR REPLACE FUNCTION public.calculate_fifo_cogs(p_product_id uuid, p_quantity numeric, OUT total_cogs numeric, OUT lots_used jsonb)
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

  -- v3.74.929 — قيدُ الشركة مشتقٌّ من المنتج، فلا يتغير التوقيع.
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

  -- v3.74.929 — كان تحذيراً فتمرّ تكلفةٌ منقوصةٌ بصمت. صار خطأً صاخباً.
  IF v_remaining_qty > 0 THEN
    RAISE EXCEPTION 'FIFO_LOTS_INSUFFICIENT: product % is short by % - refusing to report an understated cost',
      p_product_id, v_remaining_qty;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_fifo_cost(p_product_id uuid, p_warehouse_id uuid, p_quantity numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_total_cost NUMERIC := 0;
  v_remaining_qty NUMERIC := p_quantity;
  v_lot RECORD;
  v_company_id UUID;
BEGIN
  -- v3.74.929 — قيدُ الشركة مشتقٌّ من المنتج، فلا يتغير التوقيع.
  SELECT p.company_id INTO v_company_id FROM public.products p WHERE p.id = p_product_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'FIFO_PRODUCT_NOT_FOUND: product % has no company', p_product_id;
  END IF;

  FOR v_lot IN
    SELECT id, remaining_quantity, unit_cost
    FROM public.fifo_cost_lots
    WHERE product_id = p_product_id
      AND company_id = v_company_id
      AND (warehouse_id = p_warehouse_id OR warehouse_id IS NULL)
      AND remaining_quantity > 0
    ORDER BY COALESCE(purchase_date, created_at::DATE) ASC, created_at ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;

    DECLARE
      v_qty_from_lot NUMERIC := LEAST(v_lot.remaining_quantity, v_remaining_qty);
    BEGIN
      v_total_cost := v_total_cost + (v_qty_from_lot * v_lot.unit_cost);
      v_remaining_qty := v_remaining_qty - v_qty_from_lot;
    END;
  END LOOP;

  -- v3.74.929 — كانت تُرجع تكلفةً منقوصةً بصمت. صارت ترفض.
  IF v_remaining_qty > 0 THEN
    RAISE EXCEPTION 'FIFO_LOTS_INSUFFICIENT: product % is short by % - refusing to report an understated cost',
      p_product_id, v_remaining_qty;
  END IF;

  RETURN v_total_cost;
END;
$function$;

COMMENT ON POLICY inventory_transactions_select_branch_isolation ON public.inventory_transactions IS
  'v3.74.929 — كانت مكتوبةً وصحيحةً ومعطَّلةً بسياسةٍ متساهلةٍ بجوارها. حُذفت الثانية فصارت نافذة.';
COMMENT ON POLICY fifo_cost_lots_select_branch_isolation ON public.fifo_cost_lots IS
  'v3.74.929 — دفعةُ التكلفة تُقرأ بقيد فرعها. والترحيل لا يتأثر: يجرى بدوالّ definer.';
COMMENT ON POLICY cogs_transactions_select_branch_isolation ON public.cogs_transactions IS
  'v3.74.929 — قيدُ التكلفة يُقرأ بقيد فرعه — إتمامٌ لحجب التكلفة من 906 إلى 916.';

-- ═══════ (٥) وأثرٌ جانبىٌّ للعلاج، أمسكه حارسُ الدفعة ═══════
--
-- جعلُ الدالّتين `SECURITY DEFINER` فتح لهما باباً آخر: **Postgres يمنح
-- `EXECUTE` لـ`PUBLIC` تلقائياً عند إنشاء أى دالة**، وPUBLIC يشمل `anon`.
-- فصارتا دالّتَى تكلفةٍ بصلاحياتٍ كاملة **يناديهما زائرٌ مجهول**.
--
-- وهو الدرس المكتوب فى فخِّ 919 حرفاً بحرف، وقد أمسكه فاحصُ الدفعة قبل
-- الدفع لا بعده. **فالعلاجُ نفسُه يُقاس، لا يُفترض أنه علاج.**
--
-- وليستا مستعملتين فى أى سياسة RLS (قِيس)، ولا يناديهما التطبيق — فتُقصران
-- على مفتاح الخدمة: أقلُّ صلاحيةٍ ممكنة (قاعدة 919).

REVOKE ALL ON FUNCTION public.calculate_fifo_cogs(uuid, numeric)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calculate_fifo_cost(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_fifo_cogs(uuid, numeric)      TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_fifo_cost(uuid, uuid, numeric) TO service_role;
