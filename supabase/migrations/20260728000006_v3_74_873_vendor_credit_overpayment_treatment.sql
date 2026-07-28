-- ═══════════════════════════════════════════════════════════════════════════
-- v3.74.873 — إشعار الدائن يُقيَّد بحسب سببه: مرتجعٌ أم زيادةُ دفع
--
-- **المشكلة:** المُشغِّل كان يُقيّد كل إشعارٍ دائنٍ بقيدٍ واحد:
--
--     مدين: الموردين      ← ذمّتنا تنقص
--     دائن: المخزون       ← البضاعة عادت
--
-- وهو **صحيحٌ لمرتجع المشتريات** — بضاعةٌ رجعت فالمخزون ينقص فعلاً.
-- و**خاطئٌ لزيادة الدفع**: لم تَعُد بضاعة، ولا شأن للمخزون بالأمر.
-- فلو وُصِل مسار زيادة الدفع بهذا القيد **لأنقص مخزون الشركة مقابل مالٍ
-- دُفع زيادةً** — عجزٌ فى الجرد لا مصدر له.
--
-- ── المعالجة الصحيحة لزيادة الدفع ───────────────────────────────────────
-- الدفعة الزائدة تكون قد قيَّدت: مدين الموردين / دائن الخزينة. فبقى فى
-- «الموردين» رصيدٌ **مدين** — أى أن المورد صار مديناً لنا. وهذا ليس موضعه
-- فى حساب التزام، بل يُنقل إلى أصل:
--
--     مدين: سلف ومقدمات للموردين   ← المورد مدينٌ لنا بهذا المبلغ
--     دائن: الموردين                ← يعود حساب الالتزام إلى وضعه
--
-- ولا ضريبة فى هذا القيد: زيادةُ الدفع ليست شراءً ولا ردَّ شراء.
--
-- ── حساب السُلف ─────────────────────────────────────────────────────────
-- القياس على الشركات الخمس: الكود `1180` «سلف ومقدمات للموردين»، نوعه
-- `asset` فى كلها. أما `sub_type` **فغير متّسق**: `vendor_credit_liability`
-- فى شركتين وNULL فى ثلاث — ولذلك لا يُعتمد عليه وحده، ويُقيَّد البحث
-- بالنوع `asset` دائماً.
--
-- (ولاحظ أن اسم `sub_type` نفسه مُضلِّل: «liability» على حسابٍ من نوع
--  `asset`. ولم يُغيَّر هنا لأن تغيير تصنيفٍ قائم ليس من شأن هذا الإصلاح،
--  وقد سُجّل ليُنظر فيه على حِدة.)
-- ═══════════════════════════════════════════════════════════════════════════

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
    -- ═══ مرتجع مشتريات: البضاعة عادت فالمخزون ينقص ════════════════════
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

-- ═══════════════════════════════════════════════════════════════════════════
-- تحقُّق
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE p.proname = 'auto_journal_for_vendor_credit';

  IF position('supplier_overpayment' IN v_def) = 0 THEN
    RAISE EXCEPTION 'v3.74.873: the overpayment branch is missing';
  END IF;
  IF position('VENDOR_CREDIT_NO_SUPPLIER_ADVANCE_ACCOUNT' IN v_def) = 0 THEN
    RAISE EXCEPTION 'v3.74.873: a missing advance account would pass silently';
  END IF;
  IF position('create_journal_entry_atomic' IN v_def) = 0 THEN
    RAISE EXCEPTION 'v3.74.873: the trigger no longer routes through the atomic gate';
  END IF;

  RAISE NOTICE 'v3.74.873: vendor-credit journal now branches by reason (return vs overpayment)';
END $$;
