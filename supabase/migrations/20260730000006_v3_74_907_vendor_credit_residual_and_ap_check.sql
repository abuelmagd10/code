-- ═══════════════════════════════════════════════════════════════════
-- v3.74.907 — قيدُ الإشعار الدائن يساوى المستند، والفاحصُ يرى الإشعارات
--             غير المطبَّقة
-- ═══════════════════════════════════════════════════════════════════
--
-- الحادثة (30/7، على شركة «تست»): صرخ فاحص السلامة أن حساب الموردين
-- مدينٌ بـ1.22 بلا فاتورةٍ قائمة. والرقم كان يخفى **خطأين متقاصَّين**:
--
--   (١) عطبٌ حقيقى: `vendor_credit_post_journal` تبنى مدين الموردين من
--       `subtotal + tax_amount` وحدهما — فتُسقط **الشحن** و**التسوية**.
--       إشعار CR-51543 مجموعه 26.22 (18 أصناف + 5 شحن + 3.22 ضريبة)
--       رُحّل بـ21.22: قيدٌ متوازنٌ فى ذاته — ولذلك لم يصطده حارس
--       التوازن — لكنه **لا يساوى المستند**. الفارق 5.00 = الشحن.
--
--   (٢) ثغرةٌ فى الفاحص: `ic_ap_balance` يقارن الموردين بالفواتير
--       القائمة ولا يطرح **الإشعارات الدائنة غير المطبَّقة**. وإشعارٌ
--       معتمدٌ لم يُطبَّق بعدُ يترك رصيداً مديناً **مشروعاً** فى حساب
--       الموردين. فلو كان القيد سليماً لصرخ الفاحص على دفترٍ سليم
--       بـ6.22 — وحارسٌ يصرخ على البريء يُعلِّم الناسَ تجاهلَه.
--
--   1.22 = 6.22 المشروعة − 5.00 المفقودة. رقمٌ لا يدلّ على أىٍّ منهما.
--
-- القرار (بنص المالك بعد عرض الخيارات):
--   * الشحن والتسوية فى إشعارٍ **بلا حركة بضاعة** → حساب خصم المشتريات
--     نفسه (5130): لا بضاعة تحركت فلا يُمَسّ المخزون ولا FIFO — وهو
--     درس 897 المكتوب فى الكود بعد حادثة الأستاذ وFIFO.
--   * وإشعارٌ **بحركة بضاعة** يحمل شحناً → **يُرفض ترحيله بصوتٍ عالٍ**
--     حتى يُبرهَن أثره على طبقات FIFO (تحمل التكلفة الواصلة بالشحن، وقد
--     يُعكس الشحن مرتين). لا مستند من هذا الشكل موجودٌ اليوم.
--   * والقيد المرحَّل الناقص يُصحَّح بقيدٍ مؤرَّخٍ منسوبٍ لا بتعديلٍ صامت.
--
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════ (أ) القيد يساوى المستند — أو لا يُرحَّل ═══════════

CREATE OR REPLACE FUNCTION public.vendor_credit_post_journal(p_vc public.vendor_credits)
 RETURNS uuid
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
  v_residual        NUMERIC;
  v_lines           JSONB;
  v_result          JSONB;
  v_debit           NUMERIC := 0;
  v_credit          NUMERIC := 0;
  v_line            JSONB;
BEGIN
  v_is_overpayment := COALESCE(p_vc.reference_type, '') = 'supplier_overpayment';

  -- ما لا يفسّره الأصناف ولا الضريبة: الشحن والتسوية. كان يُهمَل صامتاً.
  v_residual := ROUND(COALESCE(p_vc.total_amount, 0)
                    - COALESCE(p_vc.subtotal, 0)
                    - COALESCE(p_vc.tax_amount, 0), 2);

  -- ── حساب الموردين (لازمٌ فى الحالتين) ──────────────────────────────
  SELECT id INTO ap_account FROM chart_of_accounts
   WHERE company_id = p_vc.company_id
     AND sub_type = 'accounts_payable'
     AND coalesce(is_active, true) = true
   ORDER BY account_code
   LIMIT 1;

  IF ap_account IS NULL THEN
    SELECT id INTO ap_account FROM chart_of_accounts
     WHERE company_id = p_vc.company_id
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
      p_vc.company_id;
  END IF;

  IF v_is_overpayment THEN
    SELECT id INTO advance_account FROM chart_of_accounts
     WHERE company_id = p_vc.company_id
       AND account_type = 'asset'
       AND coalesce(is_active, true) = true
       AND sub_type IN ('supplier_advance', 'vendor_credit_liability')
     ORDER BY account_code
     LIMIT 1;

    IF advance_account IS NULL THEN
      SELECT id INTO advance_account FROM chart_of_accounts
       WHERE company_id = p_vc.company_id
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
        p_vc.company_id;
    END IF;

    v_lines := jsonb_build_array(
      jsonb_build_object(
        'account_id',    advance_account,
        'debit_amount',  p_vc.total_amount,
        'credit_amount', 0,
        'description',   'سلفة لدى المورد — زيادة دفع'
      ),
      jsonb_build_object(
        'account_id',    ap_account,
        'debit_amount',  0,
        'credit_amount', p_vc.total_amount,
        'description',   'تسوية رصيد الموردين المدين'
      )
    );

  ELSE
    v_goods_moved := (p_vc.source_purchase_return_id IS NOT NULL)
                  OR COALESCE(p_vc.reference_type, '') = 'bill_return';

    IF v_goods_moved THEN
      -- v3.74.907 — شحنٌ على إشعارٍ بحركة بضاعة: يُرفض بصوتٍ عالٍ لا
      -- يُخمَّن. الفاتورة ترسمل الشحن داخل المخزون، وطبقات FIFO تحمل
      -- التكلفة الواصلة به؛ فعكسه هنا قد يعكسه مرتين.
      IF v_residual <> 0 THEN
        RAISE EXCEPTION
          'VENDOR_CREDIT_GOODS_RESIDUAL_UNPROVEN: credit % carries % beyond items+tax while goods moved; the FIFO effect is not proven yet | شحن أو تسوية على إشعارٍ بحركة بضاعة: أثره على طبقات FIFO غير مبرهَن',
          COALESCE(p_vc.credit_number, p_vc.id::text), v_residual;
      END IF;

      SELECT id INTO inventory_account FROM chart_of_accounts
       WHERE company_id = p_vc.company_id
         AND sub_type = 'inventory'
         AND coalesce(is_active, true) = true
       ORDER BY account_code
       LIMIT 1;

      IF inventory_account IS NULL THEN
        SELECT id INTO inventory_account FROM chart_of_accounts
         WHERE company_id = p_vc.company_id
           AND account_type = 'asset'
           AND coalesce(is_active, true) = true
           AND (account_name ILIKE '%inventory%' OR account_name LIKE '%المخزون%')
         ORDER BY account_code
         LIMIT 1;
      END IF;

      IF inventory_account IS NULL THEN
        RAISE EXCEPTION
          'VENDOR_CREDIT_NO_INVENTORY_ACCOUNT: company % has no inventory account | لا حساب مخزون',
          p_vc.company_id;
      END IF;

      v_lines := jsonb_build_array(
        jsonb_build_object(
          'account_id',    ap_account,
          'debit_amount',  p_vc.total_amount,
          'credit_amount', 0,
          'description',   'تخفيض ذمم دائنة'
        ),
        jsonb_build_object(
          'account_id',    inventory_account,
          'debit_amount',  0,
          'credit_amount', p_vc.subtotal,
          'description',   'مردودات مشتريات'
        )
      );
    ELSE
      SELECT id INTO discount_account FROM chart_of_accounts
       WHERE company_id = p_vc.company_id
         AND sub_type = 'purchase_discounts'
         AND coalesce(is_active, true) = true
       ORDER BY account_code
       LIMIT 1;

      IF discount_account IS NULL THEN
        SELECT id INTO discount_account FROM chart_of_accounts
         WHERE company_id = p_vc.company_id
           AND sub_type = 'purchase_returns'
           AND coalesce(is_active, true) = true
         ORDER BY account_code
         LIMIT 1;
      END IF;

      IF discount_account IS NULL THEN
        SELECT id INTO discount_account FROM chart_of_accounts
         WHERE company_id = p_vc.company_id
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
          p_vc.company_id;
      END IF;

      v_lines := jsonb_build_array(
        jsonb_build_object(
          'account_id',    ap_account,
          'debit_amount',  p_vc.total_amount,
          'credit_amount', 0,
          'description',   'تخفيض ذمم دائنة'
        ),
        jsonb_build_object(
          'account_id',    discount_account,
          'debit_amount',  0,
          'credit_amount', p_vc.subtotal,
          'description',   'خصم مشتريات مكتسب — إشعار دائن بلا حركة بضاعة'
        )
      );

      -- v3.74.907 — الشحن والتسوية: بنصّ المالك إلى حساب خصم المشتريات
      -- نفسه. سطرٌ مستقلٌّ باسمه كى يُقرأ فى الأستاذ لا كى يُخبَّأ داخل رقم.
      IF v_residual > 0 THEN
        v_lines := v_lines || jsonb_build_array(
          jsonb_build_object(
            'account_id',    discount_account,
            'debit_amount',  0,
            'credit_amount', v_residual,
            'description',   'شحن/تسوية على إشعار دائن — بلا حركة بضاعة'
          )
        );
      ELSIF v_residual < 0 THEN
        v_lines := v_lines || jsonb_build_array(
          jsonb_build_object(
            'account_id',    discount_account,
            'debit_amount',  ABS(v_residual),
            'credit_amount', 0,
            'description',   'تسوية سالبة على إشعار دائن — بلا حركة بضاعة'
          )
        );
      END IF;
    END IF;

    SELECT id INTO vat_account FROM chart_of_accounts
     WHERE company_id = p_vc.company_id
       AND sub_type = 'vat_input'
       AND coalesce(is_active, true) = true
     ORDER BY account_code
     LIMIT 1;

    IF vat_account IS NULL THEN
      SELECT id INTO vat_account FROM chart_of_accounts
       WHERE company_id = p_vc.company_id
         AND account_type = 'asset'
         AND coalesce(is_active, true) = true
         AND (account_name ILIKE '%input vat%'
              OR account_name ILIKE '%vat%input%'
              OR account_name LIKE '%مدخلات%')
       ORDER BY account_code
       LIMIT 1;
    END IF;

    IF COALESCE(p_vc.tax_amount, 0) > 0 THEN
      IF vat_account IS NULL THEN
        RAISE EXCEPTION
          'VENDOR_CREDIT_NO_VAT_ACCOUNT: credit % carries tax % but company has no input-VAT account | ضريبة بلا حساب',
          p_vc.credit_number, p_vc.tax_amount;
      END IF;
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'account_id',    vat_account,
          'debit_amount',  0,
          'credit_amount', p_vc.tax_amount,
          'description',   'تعديل ضريبة المشتريات'
        )
      );
    END IF;
  END IF;

  -- v3.74.907 — القيد يساوى المستند أو لا يُرحَّل. القيد السابق كان
  -- متوازناً فى ذاته وناقصاً عن مستنده، فمرّ من حارس التوازن سالماً.
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    v_debit  := v_debit  + COALESCE((v_line->>'debit_amount')::numeric, 0);
    v_credit := v_credit + COALESCE((v_line->>'credit_amount')::numeric, 0);
  END LOOP;

  IF ABS(v_debit - v_credit) > 0.005 THEN
    RAISE EXCEPTION
      'VENDOR_CREDIT_UNBALANCED: credit % builds % debit vs % credit | قيد غير متوازن',
      COALESCE(p_vc.credit_number, p_vc.id::text), v_debit, v_credit;
  END IF;

  IF ABS(v_debit - COALESCE(p_vc.total_amount, 0)) > 0.005 THEN
    RAISE EXCEPTION
      'VENDOR_CREDIT_JE_NOT_DOCUMENT: credit % totals % but its entry moves % | القيد لا يساوى المستند',
      COALESCE(p_vc.credit_number, p_vc.id::text), p_vc.total_amount, v_debit;
  END IF;

  v_result := public.create_journal_entry_atomic(
    p_vc.company_id,
    'vendor_credit',
    p_vc.id,
    p_vc.credit_date,
    CASE WHEN v_is_overpayment
         THEN 'سلفة مورد من زيادة دفع رقم ' || COALESCE(p_vc.credit_number, p_vc.id::text)
         ELSE 'إشعار دائن مورد رقم ' || COALESCE(p_vc.credit_number, p_vc.id::text)
    END,
    p_vc.branch_id,
    p_vc.cost_center_id,
    NULL,
    v_lines
  );

  IF COALESCE((v_result->>'success')::BOOLEAN, false) IS NOT TRUE THEN
    RAISE EXCEPTION
      'VENDOR_CREDIT_JOURNAL_FAILED: credit % — %',
      COALESCE(p_vc.credit_number, p_vc.id::text), COALESCE(v_result->>'error', 'unknown');
  END IF;

  RETURN (v_result->>'entry_id')::UUID;
END;
$function$;

-- ═══════════ (ب) الفاحص يرى الإشعارات غير المطبَّقة ═══════════

CREATE OR REPLACE FUNCTION public.ic_ap_balance(p_company_id uuid)
 RETURNS TABLE(severity text, detail jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_bill_net numeric; v_acct_net numeric; v_credit_unapplied numeric; v_diff numeric;
BEGIN
  -- v3.74.135 — count only bills that have crossed the GL boundary
  -- (confirm-receipt onward). draft / pending_approval / sent /
  -- rejected / voided / cancelled are pre-GL and stay excluded.
  SELECT COALESCE(SUM(GREATEST(0, total_amount - COALESCE(paid_amount,0) - COALESCE(returned_amount,0))),0)
    INTO v_bill_net FROM bills
  WHERE company_id = p_company_id
    AND COALESCE(status,'') IN ('received','partially_paid','paid','partially_returned','fully_returned');

  -- v3.74.907 — إشعارٌ دائنٌ معتمدٌ لم يُطبَّق بعدُ على فاتورة يترك
  -- رصيداً مديناً **مشروعاً** فى حساب الموردين: قيدُه خفّض الالتزام،
  -- ولا فاتورة تحمله. إغفاله كان يجعل الفاحص يصرخ على دفترٍ سليم.
  -- والمقياس هو **وجود قيدٍ مرحَّل** لا اسم الحالة: ما لم يدخل الأستاذ
  -- لا يُطرح منه. وزيادةُ الدفع مستثناةٌ لأن قيدها يعمل فى الاتجاه
  -- المعاكس (يُعيد التصنيف إلى أصل).
  SELECT COALESCE(SUM(GREATEST(0, vc.total_amount - COALESCE(vc.applied_amount,0))),0)
    INTO v_credit_unapplied
    FROM vendor_credits vc
    JOIN journal_entries je ON je.id = vc.journal_entry_id
                           AND je.status = 'posted'
                           AND COALESCE(je.is_deleted, false) = false
   WHERE vc.company_id = p_company_id
     AND COALESCE(vc.reference_type,'') <> 'supplier_overpayment';

  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount),0) INTO v_acct_net
  FROM journal_entry_lines jel
  -- v3.74.702 — soft-deleted journals must not count toward the AP ledger.
  JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.status='posted'
                         AND COALESCE(je.is_deleted, false) = false
  JOIN chart_of_accounts coa ON coa.id=jel.account_id
  WHERE coa.company_id=p_company_id AND coa.account_code='2110'
    AND COALESCE(je.reference_type,'') NOT IN
        ('fx_period_end_revaluation','fx_revaluation','fx_ar_revaluation','fx_ap_revaluation');

  v_diff := ROUND((v_bill_net - v_credit_unapplied) - v_acct_net, 2);
  IF ABS(v_diff) > 0.10 THEN
    severity := CASE WHEN ABS(v_diff)>100 THEN 'high' ELSE 'medium' END;
    detail := jsonb_build_object('bill_remaining',v_bill_net,'account_2110',v_acct_net,
      'credit_unapplied',v_credit_unapplied,
      'difference',v_diff,
      'hint','AP ledger (excluding FX revaluation) does not match outstanding bills less unapplied vendor credits.');
    RETURN NEXT;
  END IF;
END
$function$;

-- ═══════════ (ج) تصحيح ما رُحّل ناقصاً — بقيدٍ منسوبٍ لا بتعديلٍ صامت ═══

DO $do$
DECLARE
  r         RECORD;
  v_ap      uuid;
  v_disc    uuid;
  v_gap     numeric;
  v_res     jsonb;
  v_fixed   int := 0;
BEGIN
  FOR r IN
    SELECT vc.id, vc.company_id, vc.credit_number, vc.total_amount,
           vc.branch_id, vc.cost_center_id,
           COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0) AS ap_debit
      FROM vendor_credits vc
      JOIN journal_entries je ON je.id = vc.journal_entry_id
                             AND je.status = 'posted'
                             AND COALESCE(je.is_deleted, false) = false
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      JOIN chart_of_accounts coa ON coa.id = jel.account_id
                                AND coa.company_id = vc.company_id
                                AND coa.sub_type = 'accounts_payable'
     WHERE COALESCE(vc.reference_type,'') <> 'supplier_overpayment'
     GROUP BY vc.id, vc.company_id, vc.credit_number, vc.total_amount,
              vc.branch_id, vc.cost_center_id
  LOOP
    v_gap := ROUND(COALESCE(r.total_amount,0) - r.ap_debit, 2);
    CONTINUE WHEN v_gap = 0;

    -- تصحيحٌ واحدٌ لا يتكرر: الهجرة تُعاد فلا تُضاعف الدفتر.
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM journal_entries
       WHERE company_id = r.company_id
         AND reference_type = 'vendor_credit_residual_correction'
         AND reference_id = r.id
         AND COALESCE(is_deleted, false) = false
    );

    SELECT id INTO v_ap FROM chart_of_accounts
     WHERE company_id = r.company_id AND sub_type = 'accounts_payable'
       AND coalesce(is_active, true) = true ORDER BY account_code LIMIT 1;

    SELECT id INTO v_disc FROM chart_of_accounts
     WHERE company_id = r.company_id AND sub_type = 'purchase_discounts'
       AND coalesce(is_active, true) = true ORDER BY account_code LIMIT 1;
    IF v_disc IS NULL THEN
      SELECT id INTO v_disc FROM chart_of_accounts
       WHERE company_id = r.company_id AND sub_type = 'purchase_returns'
         AND coalesce(is_active, true) = true ORDER BY account_code LIMIT 1;
    END IF;

    IF v_ap IS NULL OR v_disc IS NULL THEN
      RAISE EXCEPTION
        'VENDOR_CREDIT_CORRECTION_NO_ACCOUNT: company % lacks AP or purchase-discount account for credit %',
        r.company_id, COALESCE(r.credit_number, r.id::text);
    END IF;

    v_res := public.create_journal_entry_atomic(
      r.company_id,
      'vendor_credit_residual_correction',
      r.id,
      CURRENT_DATE,
      'تكملة قيد إشعار دائن ' || COALESCE(r.credit_number, r.id::text) ||
      ' — الشحن/التسوية لم تُرحَّل مع الأصناف والضريبة (v3.74.907)',
      r.branch_id,
      r.cost_center_id,
      NULL,
      CASE WHEN v_gap > 0 THEN
        jsonb_build_array(
          jsonb_build_object('account_id', v_ap,   'debit_amount', v_gap, 'credit_amount', 0,
                             'description','تخفيض ذمم دائنة — تكملة إشعار دائن'),
          jsonb_build_object('account_id', v_disc, 'debit_amount', 0,     'credit_amount', v_gap,
                             'description','شحن/تسوية على إشعار دائن — تكملة')
        )
      ELSE
        jsonb_build_array(
          jsonb_build_object('account_id', v_disc, 'debit_amount', ABS(v_gap), 'credit_amount', 0,
                             'description','تسوية سالبة على إشعار دائن — تكملة'),
          jsonb_build_object('account_id', v_ap,   'debit_amount', 0,          'credit_amount', ABS(v_gap),
                             'description','زيادة ذمم دائنة — تكملة إشعار دائن')
        )
      END
    );

    IF COALESCE((v_res->>'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'VENDOR_CREDIT_CORRECTION_FAILED: credit % — %',
        COALESCE(r.credit_number, r.id::text), COALESCE(v_res->>'error','unknown');
    END IF;

    v_fixed := v_fixed + 1;
    RAISE NOTICE 'v3.74.907 corrected credit % by %', COALESCE(r.credit_number, r.id::text), v_gap;
  END LOOP;

  RAISE NOTICE 'v3.74.907 — vendor-credit residual corrections posted: %', v_fixed;
END
$do$;
