-- =============================================================================
-- v3.74.894 — إصلاح دورة تطبيق إشعار دائن المورد على الفاتورة
-- =============================================================================
-- المسار الحى الثانى الذى كشفه قياس 893. شاشة الإشعار الدائن تُدرج فى
-- `vendor_credit_applications` فيشتعل هذا الـtrigger — وكان معطوباً بثلاثة
-- أعطاب مجتمعة، فالميزة **لم تنجح مرة واحدة** (صفر صفوف فى الجدولين):
--
--   1. قيده يولد `posted` عبر افتراضى العمود بلا سياق موثوق ⇒ حارس
--      `enforce_je_integrity` يرفضه (DIRECT_POST_BLOCKED) ⇒ الإدراج كله
--      يفشل بخطأ خام فى وجه العميل.
--   2. حتى لو نفذ: سطراه يدينان ويُدائنان **حساب الموردين نفسه**
--      (المتغير `vc_liability` مُعلن ولا يُملأ) — قيد صفرى بلا معنى.
--   3. والأخطر محاسبياً: قيد الإنشاء (auto_journal_for_vendor_credit،
--      موجود على القاعدتين ويقيّد عبر الدالة الذرّية) **خفّض الموردين
--      بكامل قيمة الإشعار لحظة إنشائه** (مدين موردين / دائن مخزون +
--      ضريبة مدخلات). فأى قيد يمس الموردين عند التطبيق = تخفيض مزدوج.
--
-- **التصميم المحاسبى الصحيح** (من قراءة قيد الإنشاء لكل نوع):
--   * إشعار من مرتجع مشتريات (الأصل): الموردون خُفّضوا عند الإنشاء —
--     التطبيق على فاتورة بعينها عملُ دفترِ مساعدٍ فقط (bills.paid_amount
--     تحدّثه الواجهة، وapplied_amount يعيد حسابه trigger مرافق) ⇒
--     **لا قيد يومية عند التطبيق إطلاقاً**.
--   * إشعار من زيادة دفع (reference_type='supplier_overpayment'):
--     قيد إنشائه «مدين سلف موردين / دائن موردين» — القيمة راقدة فى أصل
--     السلف ⇒ التطبيق يستهلكها: **مدين موردين / دائن سلف الموردين**
--     بقيمة المطبَّق، عبر create_journal_entry_atomic (طريق الحارس
--     المشروع)، بمرجع 'vendor_credit_application' → صف التطبيق.
--
-- تشديدات مصاحبة (كلها صاخبة لا صامتة — عقيدة 884→890):
--   * سقوط «التخطى الصامت عند غياب حساب الموردين» (كان RETURN NEW).
--   * رفض تطبيقٍ يتجاوز قيمة الإشعار (الجمع شامل الصف الجديد).
--   * رفض عدم تطابق الشركة أو المورد بين الإشعار والفاتورة.
--
-- تصحيح لسجل 893 (وتدقيقه): trigger الإنشاء موجود على القاعدتين، لكن
-- **جسد الدالة منحرف**: الإنتاج يحمل النسخة الحديثة (تقيّد عبر الدالة
-- الذرّية)، وقاعدة الاختبار نسخةً قديمة تُدرج مباشرةً بلا status —
-- فإنشاء الإشعار نفسه على قاعدة الاختبار كان يفشل بـDIRECT_POST_BLOCKED
-- (أُثبت بمعاملة ملغاة 29/7). لذا الجزء (أ) أدناه يثبّت نسخة الإنتاج
-- الحديثة نصاً على القاعدتين — محو الانحراف لا ترقيعه.
-- =============================================================================

-- ═════════════════ (أ) قيد إنشاء الإشعار — نسخة الإنتاج تُثبَّت نصاً ═════════════════

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

REVOKE EXECUTE ON FUNCTION public.auto_journal_for_vendor_credit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_journal_for_vendor_credit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_journal_for_vendor_credit() FROM authenticated;

-- ═════════════════ (ب) قيد تطبيق الإشعار على الفاتورة — التصميم الصحيح ═════════════════

CREATE OR REPLACE FUNCTION public.update_bill_on_credit_application()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  vc_record RECORD;
  bill_record RECORD;
  ap_account UUID;
  advance_account UUID;
  v_total_applied NUMERIC;
  v_result JSONB;
BEGIN
  SELECT * INTO vc_record FROM vendor_credits WHERE id = NEW.vendor_credit_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VENDOR_CREDIT_APPLICATION_NO_CREDIT: application % references missing vendor credit % | تطبيق على إشعار غير موجود',
      NEW.id, NEW.vendor_credit_id;
  END IF;

  SELECT * INTO bill_record FROM bills WHERE id = NEW.bill_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'VENDOR_CREDIT_APPLICATION_NO_BILL: application % references missing bill % | تطبيق على فاتورة غير موجودة',
      NEW.id, NEW.bill_id;
  END IF;

  -- v3.74.894 — تطابق الشركة والمورد شرطُ صحةٍ لا افتراض واجهة.
  IF vc_record.company_id <> NEW.company_id OR bill_record.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'VENDOR_CREDIT_APPLICATION_COMPANY_MISMATCH: credit/bill/application belong to different companies | عدم تطابق شركة';
  END IF;
  IF vc_record.supplier_id IS DISTINCT FROM bill_record.supplier_id THEN
    RAISE EXCEPTION 'VENDOR_CREDIT_APPLICATION_SUPPLIER_MISMATCH: credit % belongs to another supplier than bill % | الإشعار لمورد آخر غير مورد الفاتورة',
      vc_record.credit_number, bill_record.bill_number;
  END IF;

  IF COALESCE(NEW.amount_applied, 0) <= 0 THEN
    RAISE EXCEPTION 'VENDOR_CREDIT_APPLICATION_BAD_AMOUNT: amount must be positive | قيمة التطبيق يجب أن تكون موجبة';
  END IF;

  -- v3.74.894 — لا استهلاك يتجاوز قيمة الإشعار (الجمع شامل هذا الصف؛ AFTER INSERT).
  SELECT COALESCE(SUM(amount_applied), 0) INTO v_total_applied
    FROM vendor_credit_applications
   WHERE vendor_credit_id = NEW.vendor_credit_id;
  IF v_total_applied > COALESCE(vc_record.total_amount, 0) THEN
    RAISE EXCEPTION 'VENDOR_CREDIT_OVERAPPLIED: total applied % exceeds credit total % on % | التطبيق يتجاوز قيمة الإشعار',
      v_total_applied, vc_record.total_amount, vc_record.credit_number;
  END IF;

  IF COALESCE(vc_record.reference_type, '') = 'supplier_overpayment' THEN
    -- ═══ إشعار زيادة دفع: القيمة راقدة فى أصل سلف الموردين — تُستهلك الآن ═══
    -- بحث الحسابات بنفس نمط auto_journal_for_vendor_credit المجرَّب.
    SELECT id INTO ap_account FROM chart_of_accounts
     WHERE company_id = NEW.company_id
       AND sub_type = 'accounts_payable'
       AND coalesce(is_active, true) = true
     ORDER BY account_code LIMIT 1;
    IF ap_account IS NULL THEN
      SELECT id INTO ap_account FROM chart_of_accounts
       WHERE company_id = NEW.company_id
         AND account_type = 'liability'
         AND coalesce(is_active, true) = true
         AND (account_name ILIKE '%accounts payable%'
              OR account_name ILIKE '%trade payable%'
              OR account_name LIKE '%الموردين%'
              OR account_name LIKE '%الموردون%')
       ORDER BY account_code LIMIT 1;
    END IF;
    IF ap_account IS NULL THEN
      -- v3.74.894 — كان هنا تخطٍّ صامت (RETURN NEW). الغياب عطبٌ يُعلن.
      RAISE EXCEPTION 'VENDOR_CREDIT_NO_AP_ACCOUNT: company % has no accounts-payable account | لا حساب موردين',
        NEW.company_id;
    END IF;

    SELECT id INTO advance_account FROM chart_of_accounts
     WHERE company_id = NEW.company_id
       AND account_type = 'asset'
       AND coalesce(is_active, true) = true
       AND sub_type IN ('supplier_advance', 'vendor_credit_liability')
     ORDER BY account_code LIMIT 1;
    IF advance_account IS NULL THEN
      SELECT id INTO advance_account FROM chart_of_accounts
       WHERE company_id = NEW.company_id
         AND account_type = 'asset'
         AND coalesce(is_active, true) = true
         AND ((account_name LIKE '%سلف%' AND account_name LIKE '%مورد%')
              OR (account_name ILIKE '%advance%' AND account_name ILIKE '%supplier%')
              OR (account_name ILIKE '%prepayment%' AND account_name ILIKE '%supplier%'))
       ORDER BY account_code LIMIT 1;
    END IF;
    IF advance_account IS NULL THEN
      RAISE EXCEPTION 'VENDOR_CREDIT_NO_SUPPLIER_ADVANCE_ACCOUNT: company % has no supplier-advance asset account | لا حساب سلف للموردين',
        NEW.company_id;
    END IF;

    v_result := public.create_journal_entry_atomic(
      NEW.company_id,
      'vendor_credit_application',
      NEW.id,
      NEW.applied_date,
      'تطبيق إشعار دائن ' || COALESCE(vc_record.credit_number, vc_record.id::text) ||
        ' على فاتورة ' || COALESCE(bill_record.bill_number, bill_record.id::text),
      vc_record.branch_id,
      vc_record.cost_center_id,
      NULL,
      jsonb_build_array(
        jsonb_build_object(
          'account_id',    ap_account,
          'debit_amount',  NEW.amount_applied,
          'credit_amount', 0,
          'description',   'تخفيض ذمم الموردين بتطبيق الإشعار'
        ),
        jsonb_build_object(
          'account_id',    advance_account,
          'debit_amount',  0,
          'credit_amount', NEW.amount_applied,
          'description',   'استهلاك سلفة المورد'
        )
      )
    );
    IF COALESCE((v_result->>'success')::BOOLEAN, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'VENDOR_CREDIT_APPLICATION_JOURNAL_FAILED: % on % | فشل قيد التطبيق',
        COALESCE(v_result->>'error', 'unknown'), vc_record.credit_number;
    END IF;
  END IF;

  -- إشعار المرتجع: لا قيد — الموردون خُفّضوا بكامل الإشعار عند إنشائه
  -- (مدين موردين / دائن مخزون + ضريبة مدخلات). التطبيق هنا توزيعُ
  -- دفترِ مساعدٍ على فاتورة بعينها، وقيدٌ ثانٍ = تخفيض مزدوج.

  RETURN NEW;
END;
$function$;

-- درس 844: CREATE OR REPLACE يعيد منح EXECUTE للعموم — يُسحب (دالة trigger
-- لا تُستدعى عبر RPC أصلاً، والسحب نظافةٌ واجبة).
REVOKE EXECUTE ON FUNCTION public.update_bill_on_credit_application() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_bill_on_credit_application() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_bill_on_credit_application() FROM authenticated;
