-- =============================================================================
-- v3.74.900 — مصفوفة اعتماد 865 تُطبَّق حرفياً على الإشعار الدائن (م٤ بنص المالك)
-- =============================================================================
-- ملاحظة المالك الحية (30/7): «اليوم لا اعتماد ولا إشعار على الإشعار
-- الدائن — يُنشأ ويُرحَّل قيده فوراً بأى دور، حتى محاسب الفرع. وهذا
-- يخالف مصفوفتك التى حكّمناها فى القيد اليدوى (865)». وعلاجها بنصه:
--
--   | الدور        | الإنشاء              | الترحيل                        |
--   |--------------|----------------------|--------------------------------|
--   | المالك       | ينشئ                 | يُرحَّل مباشرة                  |
--   | المدير العام | ينشئ                 | باعتماد المالك                  |
--   | محاسب الفرع  | ينشئ (مقيداً بفرعه)  | باعتماد المالك أو المدير العام  |
--   | ما عداهم     | ممنوع                | —                              |
--
-- وفصل المهام مطلق كما فى 865: لا أحد يعتمد إشعاراً أنشأه بنفسه.
-- والاعتماد من صندوق الموافقات الموحَّد (تبويبه وسجلّه) — بطلب المالك.
--
-- البناء:
--   (أ) منطق التقييد يُستخرج إلى vendor_credit_post_journal(p_vc) — نفس
--       جسد 897 حرفياً على صفٍّ ممرَّر — يستدعيه الترحيل الفورى للمالك
--       والاعتمادُ اللاحق لغيره، فلا ازدواج نصوص.
--   (ب) الـtrigger يصير حكماً بالمصفوفة: مالك ⇒ ترحيل فورى؛ مدير عام /
--       محاسب فرع ⇒ pending_approval بلا قيد + إخطار المالك؛ محاسبٌ خارج
--       فرعه أو بلا فرع مسجَّل ⇒ رفض (العجز عن التحقق ليس إذناً — 865)؛
--       ما عداهم ⇒ رفض؛ فاعلٌ لا يُستبان ⇒ رفض.
--   (ج) approve_vendor_credit / reject_vendor_credit: فحص الرتبة وفصل
--       المهام والحالة ذرّياً، الترحيل عبر (أ)، وإخطار المنشئ بالقرار.
--   (د) create_vendor_credit_with_items تسجّل منشئها (auth.uid()) — كانت
--       تتركه فارغاً فلا يُعرف مَن أنشأ.
--   (هـ) تطبيق إشعارٍ غير مرحَّل على فاتورة ⇒ رفض صاخب.
-- =============================================================================

-- ═══════════ (أ) منطق التقييد مُستخرَجاً — جسد 897 حرفياً على صفٍّ ممرَّر ═══════════

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
  v_lines           JSONB;
  v_result          JSONB;
BEGIN
  v_is_overpayment := COALESCE(p_vc.reference_type, '') = 'supplier_overpayment';

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
    -- ═══ زيادة الدفع: إعادة تصنيف من التزامٍ إلى أصل ═══════════════════
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
    -- ═══ v3.74.897 — التمييز الحاسم: هل تحرّكت بضاعة فعلاً؟ ═══════════
    v_goods_moved := (p_vc.source_purchase_return_id IS NOT NULL)
                  OR COALESCE(p_vc.reference_type, '') = 'bill_return';

    IF v_goods_moved THEN
      -- ═══ مرتجع مشتريات فعلى: البضاعة عادت فالمخزون ينقص ═══════════
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
          'debit_amount',  p_vc.subtotal + COALESCE(p_vc.tax_amount, 0),
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
      -- ═══ إشعار مستقل: تسوية سعرية بلا حركة بضاعة — لا يُمَسّ المخزون ═══
      -- (الحادثة الحية 30/7: دائنية المخزون هنا فصلت الأستاذ عن FIFO
      -- بقيمة الإشعار بالضبط، لأن مسار الشاشة لا يحرّك بضاعة.)
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
          'debit_amount',  p_vc.subtotal + COALESCE(p_vc.tax_amount, 0),
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
    END IF;

    -- ضريبة المدخلات — **أصلٌ لا التزام** (المدخلات مستردَّة، المخرجات مستحقَّة)
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

REVOKE EXECUTE ON FUNCTION public.vendor_credit_post_journal(public.vendor_credits) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vendor_credit_post_journal(public.vendor_credits) FROM anon;
REVOKE EXECUTE ON FUNCTION public.vendor_credit_post_journal(public.vendor_credits) FROM authenticated;

-- ═══════════ (ب) الـtrigger حكماً بالمصفوفة ═══════════

CREATE OR REPLACE FUNCTION public.auto_journal_for_vendor_credit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid;
  v_role text;
  v_member_branch uuid;
BEGIN
  -- إشعارات دورات المرتجعات تصل بقيدها المضبوط مسبقاً — لا شأن للمصفوفة بها.
  IF NEW.journal_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_actor := COALESCE(auth.uid(), NEW.created_by_user_id);
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'VENDOR_CREDIT_NO_ACTOR: cannot resolve who is creating this credit | تعذّر استبانة منشئ الإشعار — والعجز عن التحقق ليس إذناً (865)';
  END IF;

  SELECT lower(btrim(cm.role)), cm.branch_id INTO v_role, v_member_branch
    FROM company_members cm
   WHERE cm.company_id = NEW.company_id AND cm.user_id = v_actor
   LIMIT 1;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'VENDOR_CREDIT_ROLE_FORBIDDEN: user % is not a member of company % | ليس عضواً فى الشركة', v_actor, NEW.company_id;
  END IF;

  NEW.created_by_user_id := COALESCE(NEW.created_by_user_id, v_actor);

  IF v_role = 'owner' THEN
    -- المالك: يُرحَّل مباشرة (المصفوفة).
    NEW.journal_entry_id := public.vendor_credit_post_journal(NEW);
    RETURN NEW;
  ELSIF v_role IN ('general_manager', 'accountant') THEN
    IF v_role = 'accountant' THEN
      -- محاسب الفرع مقيَّد بفرعه — ومحاسبٌ بلا فرعٍ مسجَّل يُرفض (865).
      IF v_member_branch IS NULL OR NEW.branch_id IS DISTINCT FROM v_member_branch THEN
        RAISE EXCEPTION 'VENDOR_CREDIT_BRANCH_SCOPE: branch accountant may only create credits for their own branch | محاسب الفرع مقيَّد بفرعه';
      END IF;
    END IF;
    NEW.status := 'pending_approval';
    -- إخطار المالك (صف واحد لدورٍ واحد — احتراماً لحارس ازدواج الجمهور).
    INSERT INTO notifications (
      company_id, branch_id, reference_type, reference_id,
      created_by, assigned_to_role,
      title, message, priority, status, event_key
    ) VALUES (
      NEW.company_id, NEW.branch_id, 'vendor_credit_pending', NEW.id,
      v_actor, 'owner',
      'إشعار دائن بانتظار الاعتماد',
      'أُنشئ إشعار دائن ' || COALESCE(NEW.credit_number, '') || ' بقيمة ' || NEW.total_amount ||
        ' بواسطة ' || CASE WHEN v_role = 'general_manager' THEN 'المدير العام' ELSE 'محاسب الفرع' END ||
        ' — يحتاج اعتماداً قبل الترحيل (مصفوفة 865).',
      'high', 'unread',
      'vendor_credit_pending:' || NEW.id::text
    );
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'VENDOR_CREDIT_ROLE_FORBIDDEN: role % may not create vendor credits | هذا الدور لا يُنشئ إشعارات دائنة (مصفوفة 865)', v_role;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.auto_journal_for_vendor_credit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_journal_for_vendor_credit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_journal_for_vendor_credit() FROM authenticated;

-- ═══════════ (ج) الاعتماد والرفض — رتبةٌ وفصل مهامٍ وذرّية ═══════════

CREATE OR REPLACE FUNCTION public.approve_vendor_credit(p_credit_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_vc public.vendor_credits%ROWTYPE;
  v_approver_role text;
  v_creator_role text;
  v_je uuid;
  v_rows int;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ACTOR');
  END IF;

  SELECT * INTO v_vc FROM vendor_credits WHERE id = p_credit_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;
  PERFORM public.assert_company_access(v_vc.company_id);

  IF v_vc.status <> 'pending_approval' THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_PENDING', 'status', v_vc.status);
  END IF;

  SELECT lower(btrim(role)) INTO v_approver_role
    FROM company_members WHERE company_id = v_vc.company_id AND user_id = v_actor LIMIT 1;
  IF v_approver_role NOT IN ('owner', 'general_manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'APPROVER_RANK');
  END IF;

  -- فصل المهام مطلق (865): لا أحد يعتمد إشعاراً أنشأه بنفسه.
  IF v_vc.created_by_user_id IS NOT NULL AND v_vc.created_by_user_id = v_actor THEN
    RETURN jsonb_build_object('success', false, 'error', 'SELF_APPROVAL');
  END IF;

  SELECT lower(btrim(role)) INTO v_creator_role
    FROM company_members WHERE company_id = v_vc.company_id AND user_id = v_vc.created_by_user_id LIMIT 1;
  -- قيد المدير العام لا يعتمده إلا المالك؛ قيد المحاسب يعتمده المالك أو
  -- المدير العام؛ والمجهول منشئُه لا يُعتمد إلا بقرار المالك (865 حرفياً).
  IF COALESCE(v_creator_role, '') = 'general_manager' AND v_approver_role <> 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'APPROVER_RANK_FOR_CREATOR');
  END IF;
  IF v_creator_role IS NULL AND v_approver_role <> 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'APPROVER_RANK_FOR_CREATOR');
  END IF;

  v_je := public.vendor_credit_post_journal(v_vc);

  UPDATE vendor_credits
     SET journal_entry_id = v_je, status = 'open', updated_at = now()
   WHERE id = p_credit_id AND status = 'pending_approval';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'VENDOR_CREDIT_APPROVE_RACE: % rows updated, expected 1', v_rows;
  END IF;

  IF v_vc.created_by_user_id IS NOT NULL THEN
    INSERT INTO notifications (
      company_id, branch_id, reference_type, reference_id,
      created_by, assigned_to_user,
      title, message, priority, status, event_key
    ) VALUES (
      v_vc.company_id, v_vc.branch_id, 'vendor_credit_approved', p_credit_id,
      v_actor, v_vc.created_by_user_id,
      'اعتُمد الإشعار الدائن',
      'اعتُمد إشعارك ' || COALESCE(v_vc.credit_number, '') || ' ورُحّل قيده.',
      'normal', 'unread',
      'vendor_credit_approved:' || p_credit_id::text
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'entry_id', v_je);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_vendor_credit(p_credit_id uuid, p_reason text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_vc public.vendor_credits%ROWTYPE;
  v_approver_role text;
  v_creator_role text;
  v_rows int;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_ACTOR');
  END IF;

  SELECT * INTO v_vc FROM vendor_credits WHERE id = p_credit_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;
  PERFORM public.assert_company_access(v_vc.company_id);

  IF v_vc.status <> 'pending_approval' THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_PENDING', 'status', v_vc.status);
  END IF;

  SELECT lower(btrim(role)) INTO v_approver_role
    FROM company_members WHERE company_id = v_vc.company_id AND user_id = v_actor LIMIT 1;
  IF v_approver_role NOT IN ('owner', 'general_manager') THEN
    RETURN jsonb_build_object('success', false, 'error', 'APPROVER_RANK');
  END IF;
  IF v_vc.created_by_user_id IS NOT NULL AND v_vc.created_by_user_id = v_actor THEN
    RETURN jsonb_build_object('success', false, 'error', 'SELF_APPROVAL');
  END IF;
  SELECT lower(btrim(role)) INTO v_creator_role
    FROM company_members WHERE company_id = v_vc.company_id AND user_id = v_vc.created_by_user_id LIMIT 1;
  IF (COALESCE(v_creator_role, '') = 'general_manager' OR v_creator_role IS NULL)
     AND v_approver_role <> 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'APPROVER_RANK_FOR_CREATOR');
  END IF;

  UPDATE vendor_credits
     SET status = 'rejected',
         notes = COALESCE(notes, '') ||
                 CASE WHEN COALESCE(btrim(p_reason), '') <> ''
                      THEN E'\n' || 'سبب الرفض: ' || btrim(p_reason) ELSE '' END,
         updated_at = now()
   WHERE id = p_credit_id AND status = 'pending_approval';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'VENDOR_CREDIT_REJECT_RACE: % rows updated, expected 1', v_rows;
  END IF;

  IF v_vc.created_by_user_id IS NOT NULL THEN
    INSERT INTO notifications (
      company_id, branch_id, reference_type, reference_id,
      created_by, assigned_to_user,
      title, message, priority, status, event_key
    ) VALUES (
      v_vc.company_id, v_vc.branch_id, 'vendor_credit_rejected', p_credit_id,
      v_actor, v_vc.created_by_user_id,
      'رُفض الإشعار الدائن',
      'رُفض إشعارك ' || COALESCE(v_vc.credit_number, '') ||
        CASE WHEN COALESCE(btrim(p_reason), '') <> '' THEN ' — السبب: ' || btrim(p_reason) ELSE '.' END,
      'normal', 'unread',
      'vendor_credit_rejected:' || p_credit_id::text
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- درس 844: تُضبط المنح — الدالتان تفحصان الرتبة داخلياً فتُمنحان للمسجَّلين.
REVOKE EXECUTE ON FUNCTION public.approve_vendor_credit(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_vendor_credit(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_vendor_credit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_vendor_credit(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.reject_vendor_credit(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_vendor_credit(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.reject_vendor_credit(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_vendor_credit(uuid, text) TO service_role;

-- ═══════════ (د) تسجيل المنشئ فى create_vendor_credit_with_items ═══════════
-- كانت تترك created_by_user_id فارغاً (إشعار CR-59190 وصل بلا منشئ) —
-- والمصفوفة بلا منشئٍ عمياء. يُسجَّل من auth.uid() لا من الحمولة.

CREATE OR REPLACE FUNCTION public.create_vendor_credit_with_items(p_credit jsonb, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
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
    reference_type, reference_id, journal_entry_id,
    created_by_user_id
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
    (p_credit->>'journal_entry_id')::UUID,
    auth.uid()
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
$function$;

-- ═══════════ (هـ) لا تطبيقَ لإشعارٍ غير مرحَّل ═══════════

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
  v_vc_posted BOOLEAN;
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
  v_vc_posted := (vc_record.journal_entry_id IS NOT NULL)
             AND vc_record.status NOT IN ('pending_approval', 'rejected');

  IF vc_record.supplier_id IS DISTINCT FROM bill_record.supplier_id THEN
    RAISE EXCEPTION 'VENDOR_CREDIT_APPLICATION_SUPPLIER_MISMATCH: credit % belongs to another supplier than bill % | الإشعار لمورد آخر غير مورد الفاتورة',
      vc_record.credit_number, bill_record.bill_number;
  END IF;

  -- v3.74.900 — إشعارٌ بانتظار الاعتماد أو مرفوض لم تدخل قيمته الدفاتر
  -- أصلاً — تطبيقه على فاتورة يستهلك حقاً لم يثبت بعد.
  IF v_vc_posted IS NOT TRUE THEN
    RAISE EXCEPTION 'VENDOR_CREDIT_NOT_POSTED: credit % is % and has no posted journal — approve it first | لا يُطبَّق إشعارٌ غير مرحَّل',
      vc_record.credit_number, vc_record.status;
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

REVOKE EXECUTE ON FUNCTION public.update_bill_on_credit_application() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_bill_on_credit_application() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_bill_on_credit_application() FROM authenticated;

-- ═══════════ (و) trigger الحالة القديم كان يدهس حالات المصفوفة ═══════════
-- update_vendor_credit_status يعيد حساب الحالة من applied_amount فى كل
-- INSERT/UPDATE، ويجرى أبجدياً بعد حكم المصفوفة — فكان يحوّل
-- pending_approval إلى open فى نفس الإدراج (اصطادته برهنة 900 نفسها).
-- الحارس: لا إعادة حساب لحالة إشعارٍ غير مرحَّل أو مرفوض.

CREATE OR REPLACE FUNCTION public.update_vendor_credit_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- v3.74.900 — حالات المصفوفة لا تُعاد كتابتها من المبالغ: إشعارٌ بلا
  -- قيدٍ مرحَّل (بانتظار الاعتماد) أو مرفوضٌ يحتفظ بحالته.
  IF NEW.status IN ('pending_approval', 'rejected') OR NEW.journal_entry_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- تحديث حالة vendor_credit بناءً على المبلغ المطبق
  IF NEW.applied_amount >= NEW.total_amount THEN
    NEW.status = 'closed';
  ELSIF NEW.applied_amount > 0 THEN
    NEW.status = 'applied';
  ELSE
    NEW.status = 'open';
  END IF;

  RETURN NEW;
END;
$function$;
