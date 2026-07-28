-- ═══════════════════════════════════════════════════════════════════════════
-- v3.74.880 — إشعارٌ دائن يُرحَّل بلا بندٍ تحته
--
-- **الحادثة:** شاشة «إشعار دائن جديد» تحفظ على خطوتين: الرأس أولاً، ثم
-- السطور. وإدراج السطور **يفشل دائماً** إن كان فيها منتج:
--
--     auto_inventory_for_vendor_credit()
--       INSERT INTO inventory_transactions
--         (company_id, product_id, transaction_type, quantity_change,
--          reference_id, journal_entry_id, notes)      ← لا فرع، لا مخزن،
--                                                        لا مركز تكلفة
--
-- وهذه الثلاثة `NOT NULL` بلا قيمةٍ افتراضية. **فالدالة لا يمكن أن تنجح
-- أبداً**، ولا تُنتج إلا إبطال عمل المستخدم.
--
-- والأثر أسوأ من الفشل: الرأس يكون قد حُفظ **وقُيِّد فى الأستاذ بمبلغه
-- كاملاً** قبل أن تُدرَج السطور. أُثبت على الإنتاج داخل معاملةٍ مُلغاة:
--
--     STEP 1 (header): journal_entry=b329… status=posted lines=3
--     STEP 2 (items):  *** FAILED *** -> Branch does not belong to company
--     AFTERWARDS: credit rows=1  items=0  journal lines=3  amount=1140
--
-- ⇒ **إشعارٌ دائن مُرحَّل بمبلغه، بلا بندٍ واحد تحته، والمستخدم يظن أن
--   العملية فشلت.**
--
-- ولم يشتكِ أحد لأن **صفر إشعارٍ دائن أُنشئ منذ بدء النظام** — الشاشة لم
-- تُستعمل قط. ⇒ **ما لم يُنفَّذ قط لم يُختبر قط.**
--
-- ── والتعليق كان يعرف ──────────────────────────────────────────────────
-- تعليق الدالة نفسها يقول إنها تتخطّى مسار المرتجعات
-- «to avoid duplicates and **missing branch_id issues**» — ثم السطر الذى
-- تحته يفعل ما حذّر منه التعليق بالضبط.
-- ⇒ **التعليق الذى يصف ضماناً ليس هو الضمان. اقرأ السطر الذى تحته.**
--
-- ═══ ثلاثة إصلاحات ═══════════════════════════════════════════════════════
-- (١) تُوقَف حركة المخزون من الإشعار الدائن — لا تُصلَح.
-- (٢) الرأس والسطور فى عمليةٍ واحدة: يُحفظان معاً أو لا يُحفظ شىء.
-- (٣) رسالة الحوكمة تُفرّق بين الغائب والخاطئ.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ (١) الإشعار الدائن لا يحرّك مخزوناً ═════════════════════════════════
-- ولا يُصلَح المُشغِّل بملء الفرع، لأن المشكلة ليست فى نقص البيانات:
--
--   • إشعارٌ من مرتجع مشتريات ⇒ الحركة **تُنشئها شاشة المرتجعات بالفعل**.
--     قِيس على الإنتاج: حركتا `purchase_return` كلتاهما مرجعهما
--     `purchase_returns` لا `vendor_credits`، وكلتاهما مربوطة بقيد.
--     ⇒ فإحياء هذا المُشغِّل يُنتج **حركةً مكرَّرة**.
--
--   • إشعارٌ لا يأتى من مرتجع (زيادة دفع، تسوية سعر، خصم لاحق)
--     ⇒ **لا بضاعة فيه تتحرّك أصلاً.** فإحياؤه يُنتج **حركةً وهمية**.
--
-- ⇒ **مُشغِّلٌ لا يُنتج إلا تكراراً أو وهماً لا يُصلَح، بل يُوقَف.**

DROP TRIGGER IF EXISTS trg_auto_inventory_vendor_credit_item ON public.vendor_credit_items;
DROP FUNCTION IF EXISTS public.auto_inventory_for_vendor_credit();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'auto_inventory_for_vendor_credit') THEN
    RAISE EXCEPTION 'v3.74.880: auto_inventory_for_vendor_credit still exists';
  END IF;
  RAISE NOTICE 'v3.74.880 (1): vendor credits no longer touch inventory';
END $$;

-- ═══ (٢) الرأس والسطور معاً، أو لا شىء ═══════════════════════════════════
-- الشاشة كانت تُصدر نداءين مستقلّين. والنداء الأول يُرحِّل قيداً. فأى فشلٍ
-- فى الثانى يترك الأول قائماً فى الدفاتر.
-- ⇒ **كل ما لا يصحّ أن يوجد نصفه يوجد فى نداءٍ واحد.**
--
-- ولا تحمل هذه الدالة `SECURITY DEFINER`: تعمل بصلاحيات المستخدم نفسه،
-- فتبقى سياسات RLS هى الحَكَم كما لو كتب الجدولين مباشرةً.

CREATE OR REPLACE FUNCTION public.create_vendor_credit_with_items(
  p_credit JSONB,
  p_items  JSONB
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
  v_item JSONB;
  v_count INT;
BEGIN
  IF p_credit IS NULL OR jsonb_typeof(p_credit) <> 'object' THEN
    RAISE EXCEPTION 'p_credit must be a JSON object';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array';
  END IF;

  -- الأعمدة مذكورةٌ بأسمائها لا مُمرَّرة كما جاءت: جسمٌ يُكتب كما هو يسمح
  -- للمُرسِل أن يضع ما لم يُقصد (درس check-request-body-written-raw).
  INSERT INTO public.vendor_credits (
    company_id, supplier_id, credit_number, credit_date,
    subtotal, tax_amount, total_amount,
    discount_type, discount_value, discount_position, tax_inclusive,
    shipping, shipping_tax_rate, adjustment, notes,
    original_currency, original_subtotal, original_tax_amount,
    original_total_amount, exchange_rate_used, exchange_rate_id,
    branch_id, cost_center_id,
    status, applied_amount,
    bill_id, source_purchase_invoice_id, source_purchase_return_id,
    reference_type, reference_id, journal_entry_id
  ) VALUES (
    (p_credit->>'company_id')::UUID,
    (p_credit->>'supplier_id')::UUID,
     p_credit->>'credit_number',
    (p_credit->>'credit_date')::DATE,
    COALESCE((p_credit->>'subtotal')::NUMERIC, 0),
    COALESCE((p_credit->>'tax_amount')::NUMERIC, 0),
    COALESCE((p_credit->>'total_amount')::NUMERIC, 0),
     p_credit->>'discount_type',
    COALESCE((p_credit->>'discount_value')::NUMERIC, 0),
     p_credit->>'discount_position',
    COALESCE((p_credit->>'tax_inclusive')::BOOLEAN, false),
    COALESCE((p_credit->>'shipping')::NUMERIC, 0),
    COALESCE((p_credit->>'shipping_tax_rate')::NUMERIC, 0),
    COALESCE((p_credit->>'adjustment')::NUMERIC, 0),
     p_credit->>'notes',
    COALESCE(p_credit->>'original_currency', 'EGP'),
    (p_credit->>'original_subtotal')::NUMERIC,
    (p_credit->>'original_tax_amount')::NUMERIC,
    (p_credit->>'original_total_amount')::NUMERIC,
    COALESCE((p_credit->>'exchange_rate_used')::NUMERIC, 1),
    (p_credit->>'exchange_rate_id')::UUID,
    (p_credit->>'branch_id')::UUID,
    (p_credit->>'cost_center_id')::UUID,
    COALESCE(p_credit->>'status', 'open'),
    COALESCE((p_credit->>'applied_amount')::NUMERIC, 0),
    (p_credit->>'bill_id')::UUID,
    (p_credit->>'source_purchase_invoice_id')::UUID,
    (p_credit->>'source_purchase_return_id')::UUID,
     p_credit->>'reference_type',
    (p_credit->>'reference_id')::UUID,
    (p_credit->>'journal_entry_id')::UUID
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.vendor_credit_items (
      vendor_credit_id, product_id, description, quantity, unit_price,
      tax_rate, tax_code_id, discount_percent, account_id, line_total
    ) VALUES (
      v_id,
      (v_item->>'product_id')::UUID,
       v_item->>'description',
      (v_item->>'quantity')::INT,
      (v_item->>'unit_price')::NUMERIC,
      COALESCE((v_item->>'tax_rate')::NUMERIC, 0),
      (v_item->>'tax_code_id')::UUID,
      COALESCE((v_item->>'discount_percent')::NUMERIC, 0),
      (v_item->>'account_id')::UUID,
      (v_item->>'line_total')::NUMERIC
    );
  END LOOP;

  -- إشعارٌ برأسٍ بلا بند هو ما جاءت هذه الدالة لتمنعه. فإن أُرسلت سطورٌ
  -- ولم تُدرَج، تسقط العملية كلها بدل أن يبقى الرأس مُرحَّلاً وحده.
  SELECT count(*) INTO v_count FROM public.vendor_credit_items WHERE vendor_credit_id = v_id;
  IF jsonb_array_length(p_items) > 0 AND v_count <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'vendor credit % : % line(s) sent but % stored', v_id, jsonb_array_length(p_items), v_count;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_vendor_credit_with_items(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_vendor_credit_with_items(JSONB, JSONB) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'create_vendor_credit_with_items') THEN
    RAISE EXCEPTION 'v3.74.880: create_vendor_credit_with_items was not created';
  END IF;
  -- لا تعمل بصلاحيات المالك: لو صارت SECURITY DEFINER لتخطّت RLS بلا أن يُلاحظ.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'create_vendor_credit_with_items'
                AND p.prosecdef) THEN
    RAISE EXCEPTION 'v3.74.880: create_vendor_credit_with_items must NOT be SECURITY DEFINER';
  END IF;
  RAISE NOTICE 'v3.74.880 (2): header and lines are now one operation';
END $$;

-- ═══ (٣) رسالةٌ تُفرّق بين الغائب والخاطئ ════════════════════════════════
-- `NOT EXISTS (… WHERE id = NEW.branch_id)` تصدق حين تكون القيمة NULL،
-- فتقول «الفرع لا يتبع الشركة» عن فرعٍ **لم يُذكر أصلاً**.
--
-- وقد كلّفت هذه الرسالةُ وقتاً وأخفت السبب الحقيقى ساعةً كاملة. ⇒ **رسالةٌ
-- تصف عرَضاً غير الذى وقع تُطيل العطب بقدر ما يُطيله الصمت** — بل أسوأ،
-- لأن الصمت يدفعك للبحث، والرسالة الكاذبة تدفعك للبحث فى المكان الخطأ.
--
-- ولا يتغيّر ما تقبله الدالة ولا ما ترفضه: **الحكم واحد، والبيان أدقّ.**

CREATE OR REPLACE FUNCTION public.check_governance_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'Branch is required (%.branch_id is null)', TG_TABLE_NAME;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM branches WHERE id = NEW.branch_id AND company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Branch does not belong to company';
  END IF;

  IF NEW.warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse is required (%.warehouse_id is null)', TG_TABLE_NAME;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM warehouses WHERE id = NEW.warehouse_id AND company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Warehouse does not belong to company';
  END IF;

  IF NEW.cost_center_id IS NULL THEN
    RAISE EXCEPTION 'Cost center is required (%.cost_center_id is null)', TG_TABLE_NAME;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cost_centers WHERE id = NEW.cost_center_id AND company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'Cost center does not belong to company';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE v_tables TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO v_tables
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal AND p.proname = 'check_governance_scope';

  -- الثلاثة التى كانت مربوطةً به قبل التعديل. لو نقص أحدها فقد فُقد حارس.
  IF v_tables IS DISTINCT FROM 'inventory_transactions, invoices, sales_orders' THEN
    RAISE EXCEPTION 'v3.74.880: governance scope trigger now covers [%] - expected the original three', coalesce(v_tables, 'none');
  END IF;
  RAISE NOTICE 'v3.74.880 (3): scope messages distinguish missing from mismatched, on %', v_tables;
END $$;
