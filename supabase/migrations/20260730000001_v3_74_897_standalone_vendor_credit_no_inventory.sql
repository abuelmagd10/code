-- =============================================================================
-- v3.74.897 — الإشعار الدائن المستقل لا يلمس المخزون: تسوية سعرية لا بضاعية
-- =============================================================================
-- الحادثة (حية، 30/7 أثناء اختبار المالك من الواجهة): إشعار دائن مستقل
-- CR-59190 بقيمة 20.00 من شاشة الإشعارات ⇒ قيده «مدين موردين / دائن
-- مخزون 20.00» — **بلا أى حركة بضاعة ولا استهلاك FIFO** (مسار الشاشة
-- create_vendor_credit_with_items لا يمس المخزون إطلاقاً) ⇒ انفصل دفتر
-- الأستاذ عن FIFO بقيمة الإشعار بالضبط، واصطاده حارس سلامة الدفاتر فى
-- بطارية 896: «الأستاذ 53677.77 · FIFO 53697.769».
--
-- الجذر: فرع «مرتجع المشتريات» فى auto_journal_for_vendor_credit يفترض
-- أن البضاعة رجعت — وهذا صحيح فقط للإشعارات المولودة من دورة مرتجع
-- (وتلك تصل أصلاً بـjournal_entry_id مضبوط من دوال المرتجعات فيتخطاها
-- الـtrigger، أو تحمل source_purchase_return_id / reference_type =
-- 'bill_return'). الإشعار المستقل تسويةٌ سعرية مع المورد لا بضاعية.
--
-- العلاج: تمييز داخل الفرع —
--   * بضاعة تحركت (source_purchase_return_id موجود أو reference_type =
--     'bill_return') ⇒ دائن المخزون (السلوك الأصلى محفوظ حرفياً).
--   * إشعار مستقل ⇒ دائن «خصم المشتريات المكتسب» (sub_type
--     purchase_discounts، ثم purchase_returns، ثم بالاسم — وإلا رفضٌ
--     صاخب). ضريبة المدخلات كما هى فى الحالتين (دائن vat_input).
--
-- ترميم البيانات (منفصل عن هذه الهجرة، موثَّق فى CHANGELOG): قيد إعادة
-- تصنيف عبر create_journal_entry_atomic «مدين مخزون 20 / دائن 5130 خصم
-- المشتريات 20» لقيد CR-59190 — لا تعديل على قيد مرحَّل أبداً.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.auto_journal_for_vendor_credit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  ap_account        UUID;
  inventory_account UUID;
  vat_account       UUID;
  advance_account   UUID;
  discount_account  UUID;
  v_goods_moved     BOOLEAN;
  v_is_overpayment  BOOLEAN;
  v_lines           JSONB;
  v_result          JSONB;
BEGIN
  IF NEW.journal_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_is_overpayment := COALESCE(NEW.reference_type, '') = 'supplier_overpayment';

  -- ── حساب الموردين (لازمٌ فى الحالتين) ──────────────────────────────
  SELECT id INTO ap_account FROM chart_of_accounts
   WHERE company_id = NEW.company_id
     AND sub_type = 'accounts_payable'
     AND coalesce(is_active, true) = true
   ORDER BY account_code
   LIMIT 1;

  IF ap_account IS NULL THEN
    SELECT id INTO ap_account FROM chart_of_accounts
     WHERE company_id = NEW.company_id
       AND account_type = 'liability'
       AND coalesce(is_active, true) = true
       AND (account_name ILIKE '%accounts payable%'
            OR account_name ILIKE '%trade payable%'
            OR account_name LIKE '%الموردين%'
            OR account_name LIKE '%الموردون%')
     ORDER BY account_code
     LIMIT 1;
  END IF;

  IF ap_account IS NULL THEN
    RAISE EXCEPTION
      'VENDOR_CREDIT_NO_AP_ACCOUNT: company % has no accounts-payable account | لا حساب موردين',
      NEW.company_id;
  END IF;

  IF v_is_overpayment THEN
    -- ═══ زيادة الدفع: إعادة تصنيف من التزامٍ إلى أصل ═══════════════════
    SELECT id INTO advance_account FROM chart_of_accounts
     WHERE company_id = NEW.company_id
       AND account_type = 'asset'
       AND coalesce(is_active, true) = true
       AND sub_type IN ('supplier_advance', 'vendor_credit_liability')
     ORDER BY account_code
     LIMIT 1;

    IF advance_account IS NULL THEN
      SELECT id INTO advance_account FROM chart_of_accounts
       WHERE company_id = NEW.company_id
         AND account_type = 'asset'
         AND coalesce(is_active, true) = true
         AND ((account_name LIKE '%سلف%' AND account_name LIKE '%مورد%')
              OR (account_name ILIKE '%advance%' AND account_name ILIKE '%supplier%')
              OR (account_name ILIKE '%prepayment%' AND account_name ILIKE '%supplier%'))
       ORDER BY account_code
       LIMIT 1;
    END IF;

    IF advance_account IS NULL THEN
      RAISE EXCEPTION
        'VENDOR_CREDIT_NO_SUPPLIER_ADVANCE_ACCOUNT: company % has no supplier-advance asset account | لا حساب سلف للموردين',
        NEW.company_id;
    END IF;

    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_id',    advance_account,
        'debit_amount',  NEW.total_amount,
        'credit_amount', 0,
        'description',   'سلفة لدى المورد — زيادة دفع'
      ),
      jsonb_build_object(
        'account_id',    ap_account,
        'debit_amount',  0,
        'credit_amount', NEW.total_amount,
        'description',   'تسوية رصيد الموردين المدين'
      )
    );

  ELSE
    -- ═══ v3.74.897 — التمييز الحاسم: هل تحرّكت بضاعة فعلاً؟ ═══════════
    v_goods_moved := (NEW.source_purchase_return_id IS NOT NULL)
                  OR COALESCE(NEW.reference_type, '') = 'bill_return';

    IF v_goods_moved THEN
      -- ═══ مرتجع مشتريات فعلى: البضاعة عادت فالمخزون ينقص ═══════════
      SELECT id INTO inventory_account FROM chart_of_accounts
       WHERE company_id = NEW.company_id
         AND sub_type = 'inventory'
         AND coalesce(is_active, true) = true
       ORDER BY account_code
       LIMIT 1;

      IF inventory_account IS NULL THEN
        SELECT id INTO inventory_account FROM chart_of_accounts
         WHERE company_id = NEW.company_id
           AND account_type = 'asset'
           AND coalesce(is_active, true) = true
           AND (account_name ILIKE '%inventory%' OR account_name LIKE '%المخزون%')
         ORDER BY account_code
         LIMIT 1;
      END IF;

      IF inventory_account IS NULL THEN
        RAISE EXCEPTION
          'VENDOR_CREDIT_NO_INVENTORY_ACCOUNT: company % has no inventory account | لا حساب مخزون',
          NEW.company_id;
      END IF;

      v_lines := jsonb_build_array(
        jsonb_build_object(
          'account_id',    ap_account,
          'debit_amount',  NEW.subtotal + COALESCE(NEW.tax_amount, 0),
          'credit_amount', 0,
          'description',   'تخفيض ذمم دائنة'
        ),
        jsonb_build_object(
          'account_id',    inventory_account,
          'debit_amount',  0,
          'credit_amount', NEW.subtotal,
          'description',   'مردودات مشتريات'
        )
      );
    ELSE
      -- ═══ إشعار مستقل: تسوية سعرية بلا حركة بضاعة — لا يُمَسّ المخزون ═══
      -- (الحادثة الحية 30/7: دائنية المخزون هنا فصلت الأستاذ عن FIFO
      -- بقيمة الإشعار بالضبط، لأن مسار الشاشة لا يحرّك بضاعة.)
      SELECT id INTO discount_account FROM chart_of_accounts
       WHERE company_id = NEW.company_id
         AND sub_type = 'purchase_discounts'
         AND coalesce(is_active, true) = true
       ORDER BY account_code
       LIMIT 1;

      IF discount_account IS NULL THEN
        SELECT id INTO discount_account FROM chart_of_accounts
         WHERE company_id = NEW.company_id
           AND sub_type = 'purchase_returns'
           AND coalesce(is_active, true) = true
         ORDER BY account_code
         LIMIT 1;
      END IF;

      IF discount_account IS NULL THEN
        SELECT id INTO discount_account FROM chart_of_accounts
         WHERE company_id = NEW.company_id
           AND coalesce(is_active, true) = true
           AND ((account_name LIKE '%خصم%' AND account_name LIKE '%مشتر%')
                OR (account_name LIKE '%مردودات%' AND account_name LIKE '%مشتر%')
                OR (account_name ILIKE '%purchase%' AND account_name ILIKE '%discount%'))
         ORDER BY account_code
         LIMIT 1;
      END IF;

      IF discount_account IS NULL THEN
        RAISE EXCEPTION
          'VENDOR_CREDIT_NO_DISCOUNT_ACCOUNT: company % has no purchase-discount/returns account for a standalone credit | لا حساب خصم مشتريات لإشعار مستقل',
          NEW.company_id;
      END IF;

      v_lines := jsonb_build_array(
        jsonb_build_object(
          'account_id',    ap_account,
          'debit_amount',  NEW.subtotal + COALESCE(NEW.tax_amount, 0),
          'credit_amount', 0,
          'description',   'تخفيض ذمم دائنة'
        ),
        jsonb_build_object(
          'account_id',    discount_account,
          'debit_amount',  0,
          'credit_amount', NEW.subtotal,
          'description',   'خصم مشتريات مكتسب — إشعار دائن بلا حركة بضاعة'
        )
      );
    END IF;

    -- ضريبة المدخلات — **أصلٌ لا التزام** (المدخلات مستردَّة، المخرجات مستحقَّة)
    SELECT id INTO vat_account FROM chart_of_accounts
     WHERE company_id = NEW.company_id
       AND sub_type = 'vat_input'
       AND coalesce(is_active, true) = true
     ORDER BY account_code
     LIMIT 1;

    IF vat_account IS NULL THEN
      SELECT id INTO vat_account FROM chart_of_accounts
       WHERE company_id = NEW.company_id
         AND account_type = 'asset'
         AND coalesce(is_active, true) = true
         AND (account_name ILIKE '%input vat%'
              OR account_name ILIKE '%vat%input%'
              OR account_name LIKE '%مدخلات%')
       ORDER BY account_code
       LIMIT 1;
    END IF;

    IF COALESCE(NEW.tax_amount, 0) > 0 THEN
      IF vat_account IS NULL THEN
        RAISE EXCEPTION
          'VENDOR_CREDIT_NO_VAT_ACCOUNT: credit % carries tax % but company has no input-VAT account | ضريبة بلا حساب',
          NEW.credit_number, NEW.tax_amount;
      END IF;
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'account_id',    vat_account,
          'debit_amount',  0,
          'credit_amount', NEW.tax_amount,
          'description',   'تعديل ضريبة المشتريات'
        )
      );
    END IF;
  END IF;

  v_result := public.create_journal_entry_atomic(
    NEW.company_id,
    'vendor_credit',
    NEW.id,
    NEW.credit_date,
    CASE WHEN v_is_overpayment
         THEN 'سلفة مورد من زيادة دفع رقم ' || COALESCE(NEW.credit_number, NEW.id::text)
         ELSE 'إشعار دائن مورد رقم ' || COALESCE(NEW.credit_number, NEW.id::text)
    END,
    NEW.branch_id,
    NEW.cost_center_id,
    NULL,
    v_lines
  );

  IF COALESCE((v_result->>'success')::BOOLEAN, false) IS NOT TRUE THEN
    RAISE EXCEPTION
      'VENDOR_CREDIT_JOURNAL_FAILED: credit % — %',
      COALESCE(NEW.credit_number, NEW.id::text), COALESCE(v_result->>'error', 'unknown');
  END IF;

  NEW.journal_entry_id := (v_result->>'entry_id')::UUID;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.auto_journal_for_vendor_credit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_journal_for_vendor_credit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_journal_for_vendor_credit() FROM authenticated;
