-- ============================================================================
-- v3.74.829 — إصدار أمر الإنتاج: المستودعان مطلوبان، والرسائل تُفهم
-- ============================================================================
-- **كُشف أثناء الاختبار الحى** (المالك يضغط «إصدار الأمر للتنفيذ»):
--     "Production order release requires issue and receipt warehouses.
--      production_order_id=20464e69-…"
--
-- **السبب الحقيقى ليس فى الحارس بل فى النموذج**: مستودع صرف الخامات ومستودع
-- استلام المنتج التام **شرطان للإصدار** — بدونهما لا يعرف النظام من أين
-- تخرج المواد ولا أين يدخل المنتج. ومع ذلك كانا مدفونين داخل قسم مطوى
-- اسمه **«إعدادات متقدمة»**، بلا نجمة، بلا تحقق. فيُنشئ المستخدم الأمر
-- ويبدو سليماً (مسودة · معتمد)، ثم يصطدم بالجدار عند التنفيذ — برسالة
-- إنجليزية خام تذكر معرّف الأمر ولا تقول **أى مستودع** ينقص ولا **أين**
-- يُضبط. (الأمر MPO-202607-000029 كان ينقصه مستودع الاستلام وحده.)
--
-- **العلاج بثلاث طبقات:**
--   ١. **النموذج**: القسم لم يعد «متقدماً» — صار «المستودعات (مطلوبة)»
--      **مفتوحاً افتراضياً**، وبنجمة حمراء على كل حقل، ومع تحقق يمنع
--      الإنشاء ناقصاً ويسمّى الناقص تحديداً.
--   ٢. **المسار** (`/release`): يفحص المستودعين قبل النداء ويقول أيهما
--      ينقص وأين يُضبط — بدل تمرير الطلب ليُصد فى القاعدة.
--   ٣. **الحارس** (هذه الهجرة): رسائله الثلاث صارت **ثنائية اللغة** بكود
--      `check_violation`، فلو تسرّب مسار مستقبلى تصل رسالة مفهومة.
--
-- الرسائل الثلاث المعدَّلة: أمر غير مسودة · مستودعان ناقصان · بلا خطوات.
-- ============================================================================

DO $$
DECLARE d text; marker text := 'v3.74.829 bilingual release guard';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'mpo_assert_order_release_ready';

  IF d IS NULL THEN RAISE EXCEPTION 'mpo_assert_order_release_ready not found'; END IF;
  IF d LIKE '%' || marker || '%' THEN RAISE NOTICE 'already patched'; RETURN; END IF;

  d := replace(d,
    $old$    RAISE EXCEPTION 'Only draft production orders can be released. production_order_id=%, status=%',
      p_production_order_id, v_order.status;$old$,
    $new$    -- v3.74.829 bilingual release guard
    RAISE EXCEPTION 'لا يمكن إصدار أمر إنتاج إلا وهو مسودة — حالته الحالية: %. | Only draft production orders can be released (current status: %).',
      v_order.status, v_order.status USING ERRCODE = 'check_violation';$new$);

  d := replace(d,
    $old$    RAISE EXCEPTION 'Production order release requires issue and receipt warehouses. production_order_id=%', p_production_order_id;$old$,
    $new$    RAISE EXCEPTION 'لا يمكن إصدار أمر الإنتاج قبل تحديد مخزن صرف الخامات ومخزن استلام المنتج التام. | A production order cannot be released before both the issue and receipt warehouses are set.'
      USING ERRCODE = 'check_violation';$new$);

  d := replace(d,
    $old$    RAISE EXCEPTION 'Production order release requires at least one operation snapshot. production_order_id=%', p_production_order_id;$old$,
    $new$    RAISE EXCEPTION 'لا يمكن إصدار أمر الإنتاج بلا خطوة تصنيع واحدة على الأقل — أعد بناء الخطوات من المسار. | A production order needs at least one operation step; rebuild the steps from its routing.'
      USING ERRCODE = 'check_violation';$new$);

  EXECUTE d;
END $$;
