-- v3.75.22 — «والشاشةُ لا تُطالبُ بدَينٍ رفضَه الدفتر»
-- =============================================================================
-- ثلاثةُ ثقوبٍ فى عضوٍ واحد: شاشةُ الموردين.
--
-- (أ) **دَينٌ وهمىّ.** فاتورةٌ رُفضتْ بضاعتُها عند الاستلام (`receipt_status =
--     'rejected'`) **لا قيدَ لها فى الأستاذ أبداً** — والقاعدةُ نفسُها تمنعُ
--     قيدَها بلسانِها فى `post_bill_receipt_atomic`. ومع ذلك كانت
--     `get_suppliers_overview` تعدُّها مطلوبات، لأنّها تعدُّ **بقائمةِ منع**
--     (`NOT IN ('draft','cancelled','fully_returned')`) لا تذكرُ `rejected`.
--     بينما فاحصُ سلامةِ الموردين `ic_ap_balance` يعدُّ **بقائمةِ سماح**
--     ومكتوبٌ فيه صراحةً أنّ `rejected` قبلَ الأستاذِ وتبقى مستثناة.
--     **وفمانِ فى بيتٍ واحدٍ يقولانِ فى المالِ الواحدِ قولَين ليس بيتاً.**
--
-- (ب) **حاصلٌ لا يعرفُ نطاقَه.** حين يُصفّى العرضُ بفرعٍ، كانت مجاميعُ المالِ
--     لا تعرفُ بالتصفيةِ شيئاً: تُحسَبُ على الشركةِ كلِّها ثمّ تُعرَضُ تحتَ
--     عنوانِ «مطلوبات فرعك». فمن يرى الفروعَ كلَّها (المالك) ويختارُ فرعاً
--     يقرأُ رقمَ الشركةِ كلِّها منسوباً إلى فرعٍ واحد.
--
-- (ج) **غيابٌ تامّ.** القائمةُ تُصفّى بفرعِ **سجلِّ المورّد**، فمحاسبُ الفرعِ
--     الذى عليه الدَّينُ لا يرى المورّدَ إطلاقاً إن كان سجلُّه فى فرعٍ آخر.
--     **وغيابٌ تامٌّ أسوأُ من رقمٍ ناقص.** وهذا وحدَه يوسّعُ ما يراه إنسان،
--     وقد أذِنَ به صاحبُ المشروع صراحةً.
--
-- والعلاجُ الجذرىُّ للأوّل ليس إضافةَ `rejected` إلى قائمةِ المنع — فقائمةُ
-- المنعِ نفسُها هى المرض: كلُّ حالةٍ جديدةٍ تُولَدُ **مقبولةً** حتى تُذكَر.
-- بل **قانونٌ واحدٌ مُسمّى** يسألُه الجميع، وكلُّ حالةٍ تُولَدُ **مرفوضةً**
-- حتى تُذكَر. **ولا اسمَ بلا بيت.**
-- =============================================================================

-- —— القانونُ الواحد: متى تكونُ فاتورةُ شراءٍ مالاً حقيقيّاً؟ ————————————
-- المعيارُ **عبورُ حدِّ الأستاذ**: من لحظةِ تأكيدِ الاستلامِ فصاعداً. وما قبلَه
-- (مسودّة / بانتظارِ اعتماد / مُرسَلة / **مرفوضةُ الاستلام** / ملغاة / مُبطَلة)
-- لا يُقيَّدُ فى الأستاذِ فلا يُطالَبُ به على الشاشة.
CREATE OR REPLACE FUNCTION public.bill_status_is_payable(p_status text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT COALESCE(p_status, '') IN (
    'received', 'partially_paid', 'paid', 'partially_returned', 'fully_returned'
  );
$function$;

REVOKE ALL ON FUNCTION public.bill_status_is_payable(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bill_status_is_payable(text) TO authenticated;

-- —— هل لهذا المورّدِ حركةٌ عبرتِ الأستاذَ فى فرعى أنا؟ ————————————————
-- **لا تأخذُ فرعاً من الطارق.** تسألُ عضويّتَه عن فرعِه هى بنفسِها، فلا يستطيعُ
-- أحدٌ أن يستجوبَ بها فرعاً ليس فرعَه. ومن لا فرعَ له تُجيبُه بلا — لأنّ
-- `can_access_record_branch` قد سمحتْ له سلفاً، فلا حاجةَ بها إليها.
CREATE OR REPLACE FUNCTION public.supplier_is_active_in_my_branch(p_company_id uuid, p_supplier_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_branch UUID;
  v_found  BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL OR p_company_id IS NULL OR p_supplier_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT cm.branch_id, TRUE
    INTO v_branch, v_found
    FROM public.company_members cm
   WHERE cm.user_id = auth.uid()
     AND cm.company_id = p_company_id
   LIMIT 1;

  IF NOT COALESCE(v_found, FALSE) OR v_branch IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.bills b
     WHERE b.company_id = p_company_id
       AND b.supplier_id = p_supplier_id
       AND b.branch_id = v_branch
       AND public.bill_status_is_payable(b.status)
  ) OR EXISTS (
    SELECT 1 FROM public.vendor_credits vc
     WHERE vc.company_id = p_company_id
       AND vc.supplier_id = p_supplier_id
       AND vc.branch_id = v_branch
  ) OR EXISTS (
    SELECT 1 FROM public.payments pm
     WHERE pm.company_id = p_company_id
       AND pm.supplier_id = p_supplier_id
       AND pm.branch_id = v_branch
       AND COALESCE(pm.status, '') = 'approved'
       AND COALESCE(pm.is_deleted, false) = false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.supplier_is_active_in_my_branch(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supplier_is_active_in_my_branch(uuid, uuid) TO authenticated;

-- —— الرؤية: من عليه دَينٌ فى فرعى أراه، ولو كان سجلُّه فى فرعٍ آخر ————————
-- **ولا يُغيَّرُ ما يستطيعُه إنسانٌ إلّا بقرارِ صاحبِ المشروع** — وقد أذِن.
-- ولم يتّسعْ إلّا **الاطّلاع**: التعديلُ والحذفُ والإضافةُ تبقى كما هى على
-- `can_manage_supplier_row` بلا حرفٍ واحدٍ يتغيّر.
DROP POLICY IF EXISTS suppliers_select_branch_isolation ON public.suppliers;
CREATE POLICY suppliers_select_branch_isolation ON public.suppliers
  FOR SELECT
  USING (
    (company_id IN (SELECT public.get_user_company_ids()))
    AND (
      public.can_access_record_branch(company_id, branch_id)
      OR public.supplier_is_active_in_my_branch(company_id, id)
    )
  );

-- —— فاحصُ سلامةِ الموردين يسألُ القانونَ بدلَ أن يحملَ قائمتَه ————————————
-- قائمتُه كانت **صحيحة**، ولكنّها كانت **قائمتَه**. والصوابُ الذى لا يُشارَكُ
-- يُلتَفُّ عليه من الباب الآخر. **ومكسبٌ لا يُثبَّتُ يُلتَفُّ عليه.**
CREATE OR REPLACE FUNCTION public.ic_ap_balance(p_company_id uuid)
 RETURNS TABLE(severity text, detail jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_bill_net numeric; v_acct_net numeric; v_credit_unapplied numeric; v_diff numeric;
BEGIN
  -- v3.75.22 — القانونُ الواحد `bill_status_is_payable` هو المعيار: عبورُ حدِّ
  -- الأستاذ (من تأكيدِ الاستلامِ فصاعداً). وما قبلَه — مسودّة / بانتظارِ اعتماد /
  -- مُرسَلة / مرفوضةُ الاستلام / مُبطَلة / ملغاة — يبقى مستثنى.
  SELECT COALESCE(SUM(GREATEST(0, total_amount - COALESCE(paid_amount,0) - COALESCE(returned_amount,0))),0)
    INTO v_bill_net FROM bills
  WHERE company_id = p_company_id
    AND public.bill_status_is_payable(status);

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

-- —— إشعارُ الوجودِ خارجَ النطاقِ يسألُ القانونَ نفسَه ————————————————————
CREATE OR REPLACE FUNCTION public.suppliers_with_balance_outside_scope(p_company_id uuid, p_visible_branch uuid)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  IF p_visible_branch IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT DISTINCT b.supplier_id FROM public.bills b
  WHERE b.company_id = p_company_id AND b.supplier_id IS NOT NULL
    AND b.branch_id IS DISTINCT FROM p_visible_branch
    AND public.bill_status_is_payable(b.status)
    AND GREATEST(GREATEST(COALESCE(b.total_amount,0)-COALESCE(b.returned_amount,0),0)
          - COALESCE(b.paid_amount,0), 0) > 0;
END;
$function$;

-- —— شاشةُ الموردين: القانونُ الواحد + مجاميعُ تعرفُ نطاقَها + رؤيةُ من له دَينٌ عندى ——
CREATE OR REPLACE FUNCTION public.get_suppliers_overview(p_company_id uuid, p_branch_filter uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offset integer := GREATEST(0, (COALESCE(p_page, 1) - 1)) * COALESCE(p_page_size, 50);
  v_limit  integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 500);
  v_search text := NULLIF(TRIM(COALESCE(p_search, '')), '');
BEGIN
  RETURN (
    WITH base AS (
      SELECT s.*
      FROM suppliers s
      WHERE s.company_id = p_company_id
        -- v3.75.22 — المورّدُ يظهرُ إن كان سجلُّه فى الفرعِ المعروض **أو**
        -- كانت له حركةٌ عبرتِ الأستاذَ فى فرعِ صاحبِ الشاشة. ودالّةُ الحركةِ
        -- تسألُ عضويّتَه عن فرعِه بنفسِها، فمن يرى الفروعَ كلَّها تُجيبُه بلا
        -- ويبقى تصفيتُه على سجلِّ المورّدِ كما كانت.
        AND (
             p_branch_filter IS NULL
             OR s.branch_id = p_branch_filter
             OR public.supplier_is_active_in_my_branch(p_company_id, s.id)
        )
        AND (
             v_search IS NULL
             OR s.name  ILIKE '%' || v_search || '%'
             OR COALESCE(s.email,'') ILIKE '%' || v_search || '%'
             OR COALESCE(s.phone,'') ILIKE '%' || v_search || '%'
             OR COALESCE(s.tax_id,'') ILIKE '%' || v_search || '%'
        )
    ),
    -- v3.26.3: payables and bill overpayments come from the same scan of bills.
    -- v3.75.22: **القانونُ الواحد** `bill_status_is_payable` بدلَ قائمةِ المنع —
    -- فما لم يعبرْ حدَّ الأستاذِ لا يُطالَبُ به. **والشاشةُ لا تُطالبُ بدَينٍ
    -- رفضَه الدفتر.** والمجاميعُ تعرفُ نطاقَها: إن صُفّىَ العرضُ بفرعٍ صُفّىَ
    -- المالُ به، فلا يُنسَبُ رقمُ الشركةِ كلِّها إلى فرعٍ واحد.
    bill_agg AS (
      SELECT supplier_id,
        COALESCE(SUM(GREATEST(
          GREATEST(COALESCE(total_amount,0) - COALESCE(returned_amount,0), 0)
            - COALESCE(paid_amount,0), 0
        )), 0) AS payables,
        COALESCE(SUM(GREATEST(
          COALESCE(paid_amount,0) - COALESCE(total_amount,0), 0
        )), 0) AS overpayments
      FROM bills
      WHERE company_id = p_company_id
        AND public.bill_status_is_payable(status)
        AND (p_branch_filter IS NULL OR branch_id = p_branch_filter)
      GROUP BY supplier_id
    ),
    credit_agg AS (
      SELECT supplier_id,
        COALESCE(SUM(GREATEST(
          COALESCE(total_amount,0) - COALESCE(applied_amount,0), 0
        )), 0) AS open_credits
      FROM vendor_credits
      WHERE company_id = p_company_id
        AND COALESCE(status,'') = 'open'
        AND (p_branch_filter IS NULL OR branch_id = p_branch_filter)
      GROUP BY supplier_id
    ),
    -- v3.74.158 advance payments: supplier paid in advance, no bill yet.
    -- Prefer unallocated_amount when populated; fall back to amount for
    -- legacy rows.
    advance_agg AS (
      SELECT supplier_id,
        COALESCE(SUM(
          CASE
            WHEN unallocated_amount IS NOT NULL
              THEN GREATEST(COALESCE(unallocated_amount, 0), 0)
            ELSE GREATEST(ABS(COALESCE(amount, 0)), 0)
          END
        ), 0) AS advances
      FROM payments
      WHERE company_id = p_company_id
        AND supplier_id IS NOT NULL
        AND bill_id IS NULL
        AND invoice_id IS NULL
        AND COALESCE(status, '') = 'approved'
        AND COALESCE(is_deleted, false) = false
        AND (p_branch_filter IS NULL OR branch_id = p_branch_filter)
      GROUP BY supplier_id
    ),
    enriched AS (
      SELECT
        b.*,
        jsonb_build_object('branch_name', br.branch_name) AS branches,
        COALESCE(ba.payables, 0)     AS payables,
        COALESCE(ba.overpayments, 0) AS bill_overpayments,
        COALESCE(ca.open_credits, 0) AS open_credits,
        COALESCE(av.advances, 0)     AS advances
      FROM base b
      LEFT JOIN bill_agg ba    ON ba.supplier_id = b.id
      LEFT JOIN credit_agg ca  ON ca.supplier_id = b.id
      LEFT JOIN advance_agg av ON av.supplier_id = b.id
      LEFT JOIN branches br    ON br.id = b.branch_id
    )
    SELECT jsonb_build_object(
      'total', (SELECT COUNT(*) FROM enriched),
      'page',  COALESCE(p_page, 1),
      'page_size', v_limit,
      'rows', COALESCE(
        (SELECT jsonb_agg(to_jsonb(p))
         FROM (SELECT * FROM enriched ORDER BY name ASC NULLS LAST, created_at DESC LIMIT v_limit OFFSET v_offset) p),
        '[]'::jsonb)
    )
  );
END;
$function$;

-- =============================================================================
-- الفحصُ المرجعىُّ — يعيشُ فى القاعدةِ فيحرسُ البيتَ الذى رُكِّب فيه.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_22_check()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_def   TEXT;
  v_qual  TEXT;
  v_name  TEXT;
BEGIN
  -- (١) القانونُ موجودٌ وثابتٌ لا يتبدّل.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'bill_status_is_payable'
       AND p.provolatile = 'i'
  ) THEN
    RAISE EXCEPTION 'v3.75.22: القانونُ الواحدُ bill_status_is_payable مفقودٌ أو غيرُ ثابت (IMMUTABLE).';
  END IF;

  -- (٢) وكلُّ حالةٍ تُولَدُ مرفوضةً حتى تُذكَر — فحصٌ سلوكىٌّ لا نصّىّ.
  FOREACH v_name IN ARRAY ARRAY['draft','cancelled','rejected','pending_approval','sent','voided','approved','pending',''] LOOP
    IF public.bill_status_is_payable(v_name) THEN
      RAISE EXCEPTION 'v3.75.22: القانونُ قبِلَ حالةً لم تعبرِ الأستاذَ: %', v_name;
    END IF;
  END LOOP;
  IF public.bill_status_is_payable(NULL) IS NOT FALSE THEN
    RAISE EXCEPTION 'v3.75.22: القانونُ لم يرفضْ حالةً غائبة.';
  END IF;
  FOREACH v_name IN ARRAY ARRAY['received','partially_paid','paid','partially_returned','fully_returned'] LOOP
    IF NOT public.bill_status_is_payable(v_name) THEN
      RAISE EXCEPTION 'v3.75.22: القانونُ رفضَ حالةً عبرتِ الأستاذَ: %', v_name;
    END IF;
  END LOOP;

  -- (٣) وأفواهُ المالِ الثلاثةُ تسألُ القانونَ ولا تحملُ قائمةً خاصّةً بها.
  FOREACH v_name IN ARRAY ARRAY['get_suppliers_overview','ic_ap_balance','suppliers_with_balance_outside_scope'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_name
     LIMIT 1;
    IF v_def IS NULL THEN
      RAISE EXCEPTION 'v3.75.22: فمُ مالٍ مفقود: %', v_name;
    END IF;
    IF strpos(v_def, 'bill_status_is_payable') = 0 THEN
      RAISE EXCEPTION 'v3.75.22: % لا يسألُ القانونَ الواحد.', v_name;
    END IF;
    IF strpos(v_def, '''draft'',''cancelled'',''fully_returned''') > 0
       OR strpos(v_def, '''draft'', ''cancelled'', ''fully_returned''') > 0 THEN
      RAISE EXCEPTION 'v3.75.22: % عادَ يحملُ قائمةَ منعٍ خاصّةً به.', v_name;
    END IF;
  END LOOP;

  -- (٤) وشاشةُ الموردينَ تبقى بصلاحيّةِ المستدعى — وإلّا رأى محاسبُ الفرعِ مالَ الفروعِ كلِّها.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'get_suppliers_overview' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'v3.75.22: get_suppliers_overview صارت SECURITY DEFINER — عزلُ الفروعِ يسقط.';
  END IF;

  -- (٥) ودالّةُ الحركةِ لا تأخذُ فرعاً من الطارق، وتعملُ بصلاحيّاتٍ كاملةٍ بمسارٍ مثبَّت.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'supplier_is_active_in_my_branch'
       AND p.pronargs = 2 AND p.prosecdef
       AND array_to_string(COALESCE(p.proconfig, ARRAY[]::text[]), ',') LIKE '%search_path%'
  ) THEN
    RAISE EXCEPTION 'v3.75.22: supplier_is_active_in_my_branch مفقودةٌ أو تأخذُ فرعاً من الطارق أو مسارُها غيرُ مثبَّت.';
  END IF;

  -- (٦) وبابُ الاطّلاعِ على الموردينَ يعرفُ الطريقَين: فرعُ السجلِّ وفرعُ الحركة.
  SELECT qual INTO v_qual FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'suppliers' AND policyname = 'suppliers_select_branch_isolation';
  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'v3.75.22: سياسةُ اطّلاعِ الموردينَ مفقودة.';
  END IF;
  IF strpos(v_qual, 'can_access_record_branch') = 0 THEN
    RAISE EXCEPTION 'v3.75.22: سياسةُ اطّلاعِ الموردينَ فقدتْ عزلَ الفروع.';
  END IF;
  IF strpos(v_qual, 'supplier_is_active_in_my_branch') = 0 THEN
    RAISE EXCEPTION 'v3.75.22: سياسةُ اطّلاعِ الموردينَ لا ترى من له دَينٌ فى فرعِ الناظر.';
  END IF;

  -- (٧) ولم يتّسعْ إلّا الاطّلاع: التعديلُ والحذفُ والإضافةُ على حالِها.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='suppliers' AND cmd='UPDATE'
       AND COALESCE(qual,'') LIKE '%can_manage_supplier_row%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='suppliers' AND cmd='DELETE'
       AND COALESCE(qual,'') LIKE '%can_manage_supplier_row%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='suppliers' AND cmd='INSERT'
       AND COALESCE(with_check,'') LIKE '%can_manage_supplier_row%'
  ) THEN
    RAISE EXCEPTION 'v3.75.22: اتّسعَ أكثرُ من الاطّلاع — التعديلُ أو الحذفُ أو الإضافةُ فقدَ حارسَه.';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_22_check() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_22_check() FROM anon;
REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_22_check() FROM authenticated;

SELECT public.assert_baseline_v3_75_22_check();
