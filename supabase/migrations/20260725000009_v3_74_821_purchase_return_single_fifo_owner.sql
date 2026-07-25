-- ============================================================================
-- v3.74.821 — مرتجع المشتريات: مالك واحد لخفض الدفعات + القيد يطابق التقييم
-- ============================================================================
-- **الفجوة الأولى (🔴 خطيرة ولم تُختبر بعد)**: خفض مزدوج لدفعات FIFO.
--
-- تنقص دفعات المخزون عند المرتجع **مرتين**:
--   ١. الحارس `trg_fifo_on_purchase_return` المعلَّق على حركة المخزون نفسها
--      (v3.74.702) ⇒ يستدعى `reduce_fifo_lots_on_purchase_return`.
--   ٢. بلوك مكرر **داخل** `confirm_purchase_return_delivery_v2` يخفض من
--      دفعات الفاتورة يدوياً.
--
-- فأى مرتجع يمر بالمسار الحى يستهلك **ضعف الكمية** من الدفعات ⇒ مخزون
-- ينضب من العدم، وتكلفة بضاعة مباعة متضخّمة، ثم أخطاء «كمية غير كافية».
-- لم يظهر بعد لأن المرتجعين الوحيدين نُفذا قبل وجود الحارس. المرتجع القادم
-- كان سيصطدم به. **مالك واحد للعملية: الحارس** (درس 804: الكود الزومبى
-- يُعطَّل صراحةً لا يُترك يعمل بالتوازى).
--
-- بروفة على قاعدة الاختبار: دفعة 10 وحدات، مرتجع 2 ⇒ المتبقى **8** وسطر
-- استهلاك **واحد** بتكلفة **2.40** (2 × 1.20 شاملة الشحن) ✓
--
-- **الفجوة الثانية**: القيد يُنقص المخزون بسعر **مستند المرتجع** بينما
-- الدفعات تخرج **بتكلفتها الحقيقية شاملة الشحن المرسمل** ⇒ انحراف دائم
-- بمقدار نصيب الشحن فى الوحدات المرتجعة، يتراكم مع كل مرتجع.
--
-- **المعالجة المحاسبية**: المورد يرد **ثمن البضاعة** ولا يرد **الشحن**،
-- فالفرق يُعترف به **مصروف نقل مشتريات (5140)**:
--     مدين الموردين            بسعر المستند (ما سيرده المورد)
--         دائن المخزون          بتكلفة FIFO الحقيقية
--     مدين فرق شحن مرتجع        بالفارق
-- والسطران المضافان متساويان مديناً ودائناً فيبقى القيد متوازناً بالبناء.
--
-- ============================================================================
-- **إصلاح البيانات القائمة** (بمقتضى قاعدة المالك المكتملة):
--
-- حساب المخزون 1140 = **140.63** بينما تقييم الدفعات = **140.77** ⇒ فجوة
-- **0.14** لاحقتنا عبر جلسات. مصدرها: مرتجعان (PRET-5689 و PRET-79328)
-- نُفذا 3 و9 يوليو — أى **قبل** إصلاح v3.74.702 — فسجّلا خروج البضاعة
-- بسعر المستند بدل تكلفة الدفعة الحقيقية.
--
-- التصحيح بقيد تسوية تقييم مخزون (JE-000064) لا بتعديل قيد مرحّل:
--     مدين 1140 المخزون                     0.14
--         دائن 5140 مصاريف نقل المشتريات          0.14
--
-- **التحقق بعده**: حساب المخزون **140.77** = تقييم الدفعات **140.77** ✓
-- وميزان المراجعة **0.00** ✓ — الفجوة أُغلقت نهائياً.
-- (نُفّذ على الإنتاج عبر بوابة app.allow_direct_post وموثَّق هنا بأرقامه.)
-- ============================================================================

DO $$
DECLARE
  d text;
  a1 text := 'IF v_bill_id IS NOT NULL AND v_remaining_to_return > 0 THEN';
  a2 text := $anchor$  END LOOP;

  IF v_bill_id IS NOT NULL THEN
    UPDATE bills$anchor$;
  marker text := 'v3.74.821 single fifo owner';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'confirm_purchase_return_delivery_v2';

  IF d IS NULL THEN RAISE EXCEPTION 'confirm_purchase_return_delivery_v2 not found'; END IF;
  IF d LIKE '%' || marker || '%' THEN RAISE NOTICE 'already patched'; RETURN; END IF;
  IF (length(d) - length(replace(d, a1, ''))) / length(a1) <> 1 THEN
    RAISE EXCEPTION 'anchor1 not unique'; END IF;
  IF (length(d) - length(replace(d, a2, ''))) / length(a2) <> 1 THEN
    RAISE EXCEPTION 'anchor2 not unique'; END IF;

  -- (أ) تعطيل الخفض المزدوج للدفعات — الحارس هو المالك الوحيد
  d := replace(d, a1,
    'IF FALSE THEN  -- ' || marker || chr(10) ||
    '      -- كان هذا البلوك يُنقص دفعات FIFO مرة ثانية بعد أن أنقصها' || chr(10) ||
    '      -- الحارس trg_fifo_on_purchase_return المعلّق على حركة المخزون' || chr(10) ||
    '      -- نفسها (v3.74.702) ⇒ كل مرتجع كان سيستهلك ضعف الكمية من' || chr(10) ||
    '      -- الدفعات. مالك واحد للعملية: الحارس. (درس 804.)'
  );

  -- (ب) مطابقة سطر المخزون فى القيد مع تكلفة FIFO الفعلية
  d := replace(d, a2,
    '  END LOOP;' || chr(10) || chr(10) ||
    '  -- ' || marker || ': القيد كان يُنقص المخزون بسعر مستند المرتجع بينما' || chr(10) ||
    '  -- الدفعات تخرج بتكلفتها الحقيقية (شاملة الشحن المرسمل) ⇒ انحراف دائم.' || chr(10) ||
    '  -- الفرق = نصيب الشحن فى الوحدات المرتجعة، والمورد لا يرده — فيُعترف' || chr(10) ||
    '  -- به مصروف نقل مشتريات بدل تركه فجوة صامتة بين الدفاتر والتقييم.' || chr(10) ||
    '  SELECT COALESCE(SUM(total_cost), 0) INTO v_fifo_cost' || chr(10) ||
    '    FROM fifo_lot_consumptions' || chr(10) ||
    '   WHERE consumption_type = ''purchase_return''' || chr(10) ||
    '     AND reference_id = p_purchase_return_id;' || chr(10) || chr(10) ||
    '  v_cost_gap := ROUND(v_fifo_cost - COALESCE(v_pr.subtotal, 0), 2);' || chr(10) ||
    '  IF ABS(v_cost_gap) >= 0.01 AND v_inventory_account_id IS NOT NULL THEN' || chr(10) ||
    '    SELECT id INTO v_freight_account_id FROM chart_of_accounts' || chr(10) ||
    '     WHERE company_id = v_company_id AND account_code = ''5140'' LIMIT 1;' || chr(10) ||
    '    IF v_freight_account_id IS NULL THEN' || chr(10) ||
    '      SELECT id INTO v_freight_account_id FROM chart_of_accounts' || chr(10) ||
    '       WHERE company_id = v_company_id AND account_code = ''5100'' LIMIT 1;' || chr(10) ||
    '    END IF;' || chr(10) ||
    '    IF v_freight_account_id IS NOT NULL THEN' || chr(10) ||
    '      PERFORM set_config(''app.allow_direct_post'', ''true'', true);' || chr(10) ||
    '      INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id)' || chr(10) ||
    '      VALUES (v_je_id, v_inventory_account_id,' || chr(10) ||
    '              CASE WHEN v_cost_gap < 0 THEN ABS(v_cost_gap) ELSE 0 END,' || chr(10) ||
    '              CASE WHEN v_cost_gap > 0 THEN v_cost_gap ELSE 0 END,' || chr(10) ||
    '              ''تسوية تكلفة المخزون المرتجع لتطابق الدفعات'', v_branch_id, v_cc_id),' || chr(10) ||
    '             (v_je_id, v_freight_account_id,' || chr(10) ||
    '              CASE WHEN v_cost_gap > 0 THEN v_cost_gap ELSE 0 END,' || chr(10) ||
    '              CASE WHEN v_cost_gap < 0 THEN ABS(v_cost_gap) ELSE 0 END,' || chr(10) ||
    '              ''نصيب الشحن فى الوحدات المرتجعة (غير مسترد من المورد)'', v_branch_id, v_cc_id);' || chr(10) ||
    '      PERFORM set_config(''app.allow_direct_post'', ''false'', true);' || chr(10) ||
    '    END IF;' || chr(10) ||
    '  END IF;' || chr(10) || chr(10) ||
    '  IF v_bill_id IS NOT NULL THEN' || chr(10) ||
    '    UPDATE bills'
  );

  -- (ج) إعلان المتغيرات الجديدة
  d := replace(d, 'DECLARE', 'DECLARE' || chr(10) ||
    '  v_fifo_cost NUMERIC := 0;' || chr(10) ||
    '  v_cost_gap NUMERIC := 0;' || chr(10) ||
    '  v_freight_account_id UUID;');

  EXECUTE d;
END $$;
