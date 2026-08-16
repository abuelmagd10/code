-- ═══════════════════════════════════════════════════════════════════════════
-- v3.75.40 — «ورقمٌ له بيتان ليس له بيت»
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ═══ ما كُشف ═══
--
-- بعدَ v3.75.38 بقىَ ١٣٩ باباً «بلا قفل»: دالّةٌ بصلاحيّاتٍ كاملةٍ يبلغُها
-- المستخدِمُ المسجَّلُ من متصفِّحِه، تأخذُ رقمَ الشركةِ وسيطاً، ولا تصلُ أبداً
-- إلى بوّابةِ سؤالٍ عن صاحبِ النداء.
--
-- فُرزن أوّلاً — **فلا يُنادى فى التجربةِ إلّا ما ثبتَ أنّه لا يكتب**:
--     ٢١ تُستعملُ داخلَ سياساتِ الصفوف .... لا تُنادَى
--     ٣٢ تكتبُ أو تُفوِّضُ إلى كاتب ....... لا تُنادَى
--      ٤ أبوابٌ أُزيلت (ترفعُ خطأً دائماً)  لا تحتاجُ قفلاً
--      ١ مُرسِلٌ ديناميكىّ ................ عولج فى v3.75.37
--     ٨٠ قارئاتٌ محضة .................... هؤلاءِ وحدَهنّ نودِين
--
-- ثمّ نودِىَ ٣٠ منهنّ نداءً حيّاً على الإنتاج، بدورِ authenticated، بهُويّةِ
-- عضوٍ فى شركةٍ يسألُ عن شركةٍ **ليس عضواً فيها ولا مالكاً لها**، داخلَ معاملةٍ
-- أُلغيت. فرفضَ بابان، **وأجابَ ثمانيةٌ وعشرون الغريب**. وممّا سُلِّم فعلاً:
--
--     get_audit_trail_report .......  ٣٠٨ صفوفٍ من سجلِّ تدقيقِ شركةٍ أخرى
--     get_gl_account_summary .......  ١١ حساباً بأسمائِها العربيّةِ وأرصدتِها
--     get_gl_ar_balance_per_invoice   ١٤ فاتورةً بأرصدةِ عملائِها
--     check_gl_balance_integrity ...  ٢٤٦٦٥٥٫٠٠ مديناً ودائناً
--     calculate_cogs_total .........  ٦٦٠٠٫٠٠ تكلفةَ مبيعات
--     get_retained_earnings_balance   ‎-٣٩٥٥٫٠٠ أرباحاً محتجزة
--     get_ar_reconciliation_report .  ١٦٠٠٫٠٠ ذمماً فى ١٤ قيداً
--     get_privileged_manager_user_ids معرِّفَ مديرِها المخوَّل
--     find_company_accounts ........  معرِّفاتِ حساباتِها الحاكمة
--     get_reconciliation_status ....  حالةَ مطابقتِها
--     get_permission_stats .........  إحصاءَ صلاحيّاتِها
--     erp_company_senior_count .....  عددَ أصحابِ الأمرِ فيها
--
-- ومن ردَّ فارغاً لم يردَّ فارغاً لأنّه مقفول، بل لأنّ تلك الشركةَ لا خللَ بها.
-- **وبحثٌ لا يجدُ ليس دليلَ غياب.**
--
-- ═══ والأخطرُ من العدد: للسؤالِ الواحدِ ثلاثةُ بيوت ═══
--
-- كُتب فى v3.75.38 أنّ البيتَ الواحدَ لسؤالِ «هل يخصُّ هذا المُنادىَ هذه
-- الشركة؟» هو public.assert_company_access(uuid). والنداءُ الحىُّ كشفَ بيتَين
-- آخرَين يجيبانِ **نفسَ السؤالِ** بقوّةٍ أضعف:
--
--   ١) assert_company_access_or_bootstrap — تسألُ company_members وحدَه،
--      **ولا تعرفُ مسارَ المالكِ المسجَّلِ على companies.user_id**. فمالكُ
--      شركةٍ لم يُكتَبْ له صفُّ عضويّةٍ بعدُ يُرفَضُ وهو صاحبُ البيت.
--      **وحارسٌ يصرخُ على البرىءِ يُطفأ.**
--
--   ٢) next_po_number — فحصٌ مكتوبٌ بيدِه يرفعُ الرفضَ برمزٍ عامٍّ (P0001)،
--      **وهو رمزٌ يبتلعُه EXCEPTION WHEN OTHERS**. والبيتُ الأصلىُّ اختارَ
--      57014 عمداً لهذا السببِ بعينِه. فقفلٌ يُبتلَعُ ليس قفلاً.
--
--   والمجموعتانِ اللتانِ يسألُ عنهما البيتانِ الآخرانِ متطابقتانِ حرفاً مع
--   ما يسألُ عنه البيتُ الواحد: عضويّةٌ ∪ ملكيّة، وهو عينُ ما تفحصُه
--   assert_company_access. **فالتوحيدُ لا يُضيّقُ على أحد، بل يُوسِّعُ على
--   المالكِ ويُحكِمُ رمزَ الرفض.**
--
-- ═══ ولا يُبنى بيتٌ ثالث ═══
--
-- لا تُؤلَّفُ هنا قاعدةُ ملكيّةٍ جديدة. البيتانِ الآخرانِ **يُفوِّضانِ** إلى
-- البيتِ الواحد، ويحتفظُ الأوّلُ باستثناءِ التأسيسِ المشروعِ وحدَه (شركةٌ لا
-- عضوَ فيها بعدُ — فلا عضويّةَ تُفحَص).
--
-- ═══ ولا تُمَسُّ منحةٌ واحدة ═══
--
-- **الأقفالُ أوّلاً، ومن يحقُّ له الطَّرْقُ بعدَها.** ونصُّ الاستعلامِ لا
-- يُمَسُّ حرفاً فى أىٍّ من الاثنتَى عشرة — يُزادُ سطرٌ واحدٌ قبلَه. وستٌّ
-- منهنّ تُحوَّلُ من sql إلى plpgsql لأنّ لغةَ sql لا تعرفُ PERFORM.
--
-- ═══ ومُنادوهنَّ قِيسوا قبلَ القفل ═══
--
-- فى الشيفرة: خمسةُ مواضعَ حيّةٍ فقط، كلُّها تُمرِّرُ شركةَ الجلسةِ نفسِها،
-- واثنانِ منها بمفتاحِ الخادم — ومسارُ الخادمِ يمرُّ صامتاً لانعدامِ auth.uid().
-- وفى القاعدة: find_company_accounts ينادِيها خمسةُ بُناةِ قيود،
-- erp_company_senior_count ينادِيها حرّاسُ فصلِ المهام،
-- get_retained_earnings_balance ينادِيها توزيعُ الأرباح،
-- next_po_number ينادِيها مُشغِّلُ ترقيمِ أمرِ الشراء — وكلُّها داخلَ الشركةِ
-- نفسِها. ولا سياسةَ صفوفٍ ولا نافذةً تنادى واحدةً منهنّ.
--
-- ═══ والبرهانُ ثلاثىُّ الاتّجاه ═══
--
-- تقيسُ الهجرةُ قبلَ الجراحةِ ثمّ تقارنُ بما بعدَها، وترفضُ نفسَها إن:
--   (أ) نقصَ صفٌّ واحدٌ ممّا كان يراه صاحبُ الشركةِ نفسُه؛
--   (ب) أو مرَّ الغريبُ من أىِّ بابٍ من الأربعةَ عشر؛
--   (ج) أو انقطعَ طريقُ الخادم.
-- **ولا يُقاسُ الأثرُ بعدَ الحدثِ وحدَه.**
--
-- وتختارُ الهجرةُ موضوعاتِ التجربةِ **من القاعدةِ نفسِها لا من أسماءٍ مكتوبةٍ
-- هنا** — فهى تعملُ على أىِّ بيتٍ وعلى شركةٍ تُولَدُ غداً. وإن لم تجدْ عضواً
-- أو لم تجدْ شركةً غريبةً **قالت ذلك صراحةً ولم تدّعِ برهاناً**.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- ١ · قياسٌ قبلَ اللمس
-- ───────────────────────────────────────────────────────────────────────────
-- **ولا يُقاسُ ما لا يُنادَى**: count(*) وحدَه يسمحُ للمُخطِّطِ بإسقاطِ نداءِ
-- الدالّةِ أصلاً (قِيس: بابٌ لم يُنادَ فبدا أنّه لم يرفض). فيُجمَعُ النصُّ
-- ليُجبَرَ النداء، ويُقارَنُ **المحتوى** لا العددُ وحدَه. والوسائطُ صريحةٌ
-- كلُّها فلا يتسلّلُ now() بينَ القياسَين.
DO $before$
DECLARE
  k_doors text[] := ARRAY[
    'calculate_cogs_total($1)',
    'check_gl_balance_integrity($1, NULL::date, DATE ''2999-12-31'')',
    'erp_company_senior_count($1)',
    'find_company_accounts($1)',
    'get_ar_reconciliation_report($1)',
    'get_audit_trail_report($1, TIMESTAMPTZ ''1900-01-01'', TIMESTAMPTZ ''2999-12-31'')',
    'get_gl_account_summary($1)',
    'get_gl_ar_balance_per_invoice($1, DATE ''2999-12-31'')',
    'get_permission_stats($1)',
    'get_privileged_manager_user_ids($1)',
    'get_reconciliation_status($1)',
    'get_retained_earnings_balance($1)'
  ];
  v_own uuid; v_uid uuid; v_foreign uuid;
  v_d text; v_rows int; v_sig text; v_acc text := '';
BEGIN
  -- **وبيتٌ لا يُسكَنُ ليس بيتاً**: لو وقعَ الاختيارُ على شركةٍ بلا دفترٍ
  -- لَعادت كلُّ الأبوابِ بصفرٍ، ولَبدا البرهانُ ناجحاً وهو لم يقسْ شيئاً.
  -- فيُختارُ **أعمرُ البيوتِ دفتراً** — ومن القاعدةِ نفسِها لا من اسمٍ مكتوب.
  SELECT cm.company_id, cm.user_id INTO v_own, v_uid
  FROM public.company_members cm JOIN public.companies c ON c.id = cm.company_id
  WHERE cm.user_id IS NOT NULL
  ORDER BY (SELECT count(*) FROM public.journal_entries je WHERE je.company_id = cm.company_id) DESC,
           cm.company_id, cm.user_id
  LIMIT 1;

  IF v_own IS NULL THEN
    PERFORM set_config('erb.v40_subjects', 'none', false);
    RAISE NOTICE 'v3.75.40: no membership in this house - the locks are planted and no live proof is claimed.';
    RETURN;
  END IF;

  -- وكذلك الغريب: أعمرُ شركةٍ لا يملكُها ولا هو عضوٌ فيها — فالرفضُ يُقاسُ
  -- على بابٍ خلفَه شىءٌ يُسرَق، لا على بابٍ خلفَه فراغ.
  SELECT c.id INTO v_foreign FROM public.companies c
  WHERE c.id <> v_own AND (c.user_id IS DISTINCT FROM v_uid)
    AND NOT EXISTS (SELECT 1 FROM public.company_members m WHERE m.company_id = c.id AND m.user_id = v_uid)
  ORDER BY (SELECT count(*) FROM public.journal_entries je WHERE je.company_id = c.id) DESC, c.id
  LIMIT 1;

  PERFORM set_config('erb.v40_own', v_own::text, false);
  PERFORM set_config('erb.v40_uid', v_uid::text, false);
  PERFORM set_config('erb.v40_foreign', coalesce(v_foreign::text, ''), false);
  PERFORM set_config('erb.v40_subjects', CASE WHEN v_foreign IS NULL THEN 'own_only' ELSE 'both' END, false);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  FOREACH v_d IN ARRAY k_doors LOOP
    EXECUTE format(
      'SELECT count(*), md5(coalesce(string_agg(t.x::text, ''|'' ORDER BY t.x::text), '''')) FROM (SELECT public.%s AS x) t',
      v_d) INTO v_rows, v_sig USING v_own;
    v_acc := v_acc || v_d || '=' || v_rows || '/' || v_sig || ';';
  END LOOP;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  PERFORM set_config('erb.v40_before', v_acc, false);
  RAISE NOTICE 'v3.75.40 BEFORE: %', v_acc;
END
$before$;

-- ───────────────────────────────────────────────────────────────────────────
-- ٢ · بيتٌ واحدٌ للسؤال — البيتانِ الآخرانِ يُفوِّضان
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_company_access_or_bootstrap(p_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_company_id IS NULL THEN
    RETURN;
  END IF;

  -- Genuine bootstrap: the company has no members at all yet, so there is no
  -- membership to check and this call is part of creating it.
  IF NOT EXISTS (SELECT 1 FROM company_members WHERE company_id = p_company_id) THEN
    RETURN;
  END IF;

  -- v3.75.40 — ولا يُبنى بيتٌ ثانٍ: كان هنا نسخةٌ ثانيةٌ من سؤالِ الانتماء
  -- تعرفُ company_members ولا تعرفُ companies.user_id، فترفضُ المالكَ عن
  -- بيتِه. والسؤالُ الآنَ يُطرحُ فى بيتِه الواحد.
  PERFORM public.assert_company_access(p_company_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.next_po_number(p_company_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_max INTEGER;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'v3.74.952: لا يُولَّد رقمُ أمرِ شراءٍ بلا شركة.';
  END IF;

  -- v3.75.40 — كان هنا فحصٌ مكتوبٌ بيدِه يرفعُ الرفضَ برمزٍ عامٍّ يبتلعُه
  -- WHEN OTHERS. والمجموعةُ نفسُها (عضويّةٌ ∪ ملكيّة) هى ما تفحصُه البوّابةُ
  -- الواحدة، ورمزُها لا يُبتلَع. (ولا يُذكَرُ هنا اسمُ الفحصِ القديم: فحصٌ
  -- يُسمّى ما يحرسُه ليس مُنادِياً له، لكنّ الباحثَ النصّىَّ لا يعرفُ ذلك.)
  PERFORM public.assert_company_access(p_company_id);

  SELECT COALESCE(MAX(CAST(SUBSTRING(po_number FROM 'PO-([0-9]+)') AS INTEGER)), 0)
    INTO v_max
    FROM public.purchase_orders
   WHERE company_id = p_company_id
     AND po_number ~ '^PO-[0-9]+$';

  RETURN 'PO-' || LPAD((v_max + 1)::TEXT, 4, '0');
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- ٣ · الاثنتا عشرة — سطرٌ واحدٌ يُزاد، ونصُّ الاستعلامِ كما هو
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_cogs_total(p_company_id uuid, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT NULL::date, p_branch_id uuid DEFAULT NULL::uuid, p_cost_center_id uuid DEFAULT NULL::uuid, p_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_total NUMERIC := 0;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT COALESCE(SUM(total_cost), 0)
  INTO v_total
  FROM cogs_transactions
  WHERE company_id = p_company_id
    AND (p_from_date IS NULL OR transaction_date >= p_from_date)
    AND (p_to_date IS NULL OR transaction_date <= p_to_date)
    AND (p_branch_id IS NULL OR branch_id = p_branch_id)
    AND (p_cost_center_id IS NULL OR cost_center_id = p_cost_center_id)
    AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id);

  RETURN v_total;
END;
$function$;

-- تُحوَّلُ من sql إلى plpgsql — ونصُّ الاستعلامِ لا يُمَسُّ حرفاً
CREATE OR REPLACE FUNCTION public.check_gl_balance_integrity(p_company_id uuid, p_from_date date DEFAULT NULL::date, p_to_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(check_name text, result text, total_debit numeric, total_credit numeric, difference numeric, unbalanced_count bigint, status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY
  WITH posted_entries AS (
    SELECT je.id, je.entry_date
    FROM journal_entries je
    WHERE je.company_id = p_company_id
      AND je.status     = 'posted'
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
      AND je.deleted_at IS NULL
      AND (p_from_date IS NULL OR je.entry_date >= p_from_date)
      AND je.entry_date <= p_to_date
  ),
  line_totals AS (
    SELECT
      jel.journal_entry_id,
      SUM(jel.debit_amount)  AS total_dr,
      SUM(jel.credit_amount) AS total_cr
    FROM journal_entry_lines jel
    WHERE jel.journal_entry_id IN (SELECT id FROM posted_entries)
    GROUP BY jel.journal_entry_id
  ),
  company_totals AS (
    SELECT
      SUM(total_dr)  AS grand_dr,
      SUM(total_cr)  AS grand_cr,
      COUNT(*) FILTER (WHERE ABS(total_dr - total_cr) > 0.01) AS unbalanced_entries
    FROM line_totals
  )
  SELECT
    'GL Balance Check'::TEXT                         AS check_name,
    CASE WHEN ABS(grand_dr - grand_cr) < 0.01
         THEN 'PASSED' ELSE 'FAILED' END             AS result,
    ROUND(COALESCE(grand_dr, 0), 2)                  AS total_debit,
    ROUND(COALESCE(grand_cr, 0), 2)                  AS total_credit,
    ROUND(ABS(COALESCE(grand_dr, 0) - COALESCE(grand_cr, 0)), 2) AS difference,
    COALESCE(unbalanced_entries, 0)                  AS unbalanced_count,
    CASE WHEN ABS(grand_dr - grand_cr) < 0.01
         THEN 'GL متوازن - جميع القيود صحيحة'
         ELSE 'GL غير متوازن - يوجد خطأ في القيود المحاسبية'
    END                                              AS status
  FROM company_totals;
END;
$function$;

-- تُحوَّلُ من sql إلى plpgsql
CREATE OR REPLACE FUNCTION public.erp_company_senior_count(p_company_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN (
    SELECT count(*)::int FROM (
      SELECT user_id FROM company_members
        WHERE company_id = p_company_id
          AND user_id IS NOT NULL
          AND lower(role) IN ('owner','admin')
      UNION
      SELECT user_id FROM companies
        WHERE id = p_company_id AND user_id IS NOT NULL
    ) s
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.find_company_accounts(p_company_id uuid)
 RETURNS TABLE(ar_account_id uuid, ap_account_id uuid, revenue_account_id uuid, expense_account_id uuid, cash_account_id uuid, bank_account_id uuid, vat_payable_account_id uuid, shipping_account_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY
  SELECT
    -- AR (Accounts Receivable)
    (SELECT id FROM chart_of_accounts
     WHERE company_id = p_company_id
     AND sub_type = 'accounts_receivable'
     AND is_active = true
     LIMIT 1) as ar_account_id,

    -- AP (Accounts Payable)
    (SELECT id FROM chart_of_accounts
     WHERE company_id = p_company_id
     AND sub_type = 'accounts_payable'
     AND is_active = true
     LIMIT 1) as ap_account_id,

    -- Revenue
    (SELECT id FROM chart_of_accounts
     WHERE company_id = p_company_id
     AND account_type = 'income'
     AND is_active = true
     ORDER BY account_code
     LIMIT 1) as revenue_account_id,

    -- Expense
    (SELECT id FROM chart_of_accounts
     WHERE company_id = p_company_id
     AND account_type = 'expense'
     AND is_active = true
     ORDER BY account_code
     LIMIT 1) as expense_account_id,

    -- Cash
    (SELECT id FROM chart_of_accounts
     WHERE company_id = p_company_id
     AND sub_type = 'cash'
     AND is_active = true
     LIMIT 1) as cash_account_id,

    -- Bank
    (SELECT id FROM chart_of_accounts
     WHERE company_id = p_company_id
     AND sub_type IN ('bank', 'checking', 'savings')
     AND is_active = true
     LIMIT 1) as bank_account_id,

    -- VAT Payable
    (SELECT id FROM chart_of_accounts
     WHERE company_id = p_company_id
     AND (account_name ILIKE '%vat%' OR account_name ILIKE '%ضريبة%' OR account_name ILIKE '%tax%')
     AND account_type = 'liability'
     AND is_active = true
     LIMIT 1) as vat_payable_account_id,

    -- Shipping
    (SELECT id FROM chart_of_accounts
     WHERE company_id = p_company_id
     AND (account_name ILIKE '%shipping%' OR account_name ILIKE '%شحن%' OR account_name ILIKE '%freight%')
     AND is_active = true
     LIMIT 1) as shipping_account_id;
END;
$function$;

-- تُحوَّلُ من sql إلى plpgsql
CREATE OR REPLACE FUNCTION public.get_ar_reconciliation_report(p_company_id uuid)
 RETURNS TABLE(source text, total_outstanding numeric, invoice_count bigint, note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY
  SELECT
    'GL (journal_entry_lines)'::TEXT AS source,
    ROUND(SUM(GREATEST(0,
      COALESCE(d.amount, 0) - COALESCE(pc.amount, 0) - COALESCE(rc.amount, 0)
    )), 2) AS total_outstanding,
    COUNT(i.id) AS invoice_count,
    'مصدر الحقيقة الرسمي - يستخدم في ميزان المراجعة'::TEXT AS note
  FROM invoices i
  LEFT JOIN (
    SELECT je.reference_id::TEXT AS reference_id, SUM(jel.debit_amount) AS amount
    FROM journal_entries je JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.company_id = p_company_id AND je.status = 'posted'
      AND je.reference_type = 'invoice'
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
      AND (coa.sub_type = 'accounts_receivable' OR coa.account_name ILIKE '%receivable%')
    GROUP BY je.reference_id
  ) d ON d.reference_id = i.id::TEXT
  LEFT JOIN (
    SELECT je.reference_id::TEXT AS reference_id, SUM(jel.credit_amount) AS amount
    FROM journal_entries je JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE je.company_id = p_company_id AND je.status = 'posted'
      AND je.reference_type = 'invoice_payment'
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
      AND (coa.sub_type = 'accounts_receivable' OR coa.account_name ILIKE '%receivable%')
    GROUP BY je.reference_id
  ) pc ON pc.reference_id = i.id::TEXT
  LEFT JOIN (
    SELECT sr.invoice_id::TEXT AS invoice_id, SUM(jel.credit_amount) AS amount
    FROM journal_entries je JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    JOIN sales_returns sr ON je.reference_id = sr.id
    WHERE je.company_id = p_company_id AND je.status = 'posted'
      AND je.reference_type = 'sales_return'
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
      AND (coa.sub_type = 'accounts_receivable' OR coa.account_name ILIKE '%receivable%')
    GROUP BY sr.invoice_id
  ) rc ON rc.invoice_id = i.id::TEXT
  WHERE i.company_id = p_company_id
    AND i.status NOT IN ('draft', 'cancelled', 'fully_returned')
    AND (i.is_deleted IS NULL OR i.is_deleted = false)
    AND COALESCE(d.amount, 0) > 0

  UNION ALL

  SELECT
    'Operational (invoices table)'::TEXT AS source,
    ROUND(SUM(GREATEST(0,
      i.total_amount
      - COALESCE(i.paid_amount, 0)
      - COALESCE(i.returned_amount, 0)
    )), 2) AS total_outstanding,
    COUNT(i.id) AS invoice_count,
    'تقديري تشغيلي - قد يختلف عن GL عند وجود أخطاء'::TEXT AS note
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status IN ('sent', 'partially_paid')
    AND (i.is_deleted IS NULL OR i.is_deleted = false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_audit_trail_report(p_company_id uuid, p_start_date timestamp with time zone DEFAULT (now() - '30 days'::interval), p_end_date timestamp with time zone DEFAULT now(), p_table_name text DEFAULT NULL::text, p_action text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, user_name text, user_email text, action text, target_table text, record_identifier text, changed_fields text[], created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY
  SELECT
    al.id,
    al.user_name,
    al.user_email,
    al.action,
    al.target_table,
    al.record_identifier,
    al.changed_fields,
    al.created_at
  FROM audit_logs al
  WHERE al.company_id = p_company_id
    AND al.created_at >= p_start_date
    AND al.created_at <= p_end_date
    AND (p_table_name IS NULL OR al.target_table = p_table_name)
    AND (p_action IS NULL OR al.action = p_action)
  ORDER BY al.created_at DESC;
END;
$function$;

-- تُحوَّلُ من sql إلى plpgsql
CREATE OR REPLACE FUNCTION public.get_gl_account_summary(p_company_id uuid, p_from_date date DEFAULT '0001-01-01'::date, p_to_date date DEFAULT '9999-12-31'::date, p_account_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(account_id uuid, account_code text, account_name text, account_type text, sub_type text, opening_balance numeric, total_debit numeric, total_credit numeric, closing_balance numeric, transaction_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY
  WITH period_movements AS (
    SELECT
      jel.account_id,
      ROUND(SUM(jel.debit_amount)::NUMERIC,  2) AS period_debit,
      ROUND(SUM(jel.credit_amount)::NUMERIC, 2) AS period_credit,
      COUNT(*) AS txn_count
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.company_id = p_company_id
      AND je.status = 'posted'
      AND (je.is_deleted IS NULL OR je.is_deleted = FALSE)
      AND je.deleted_at IS NULL
      AND je.entry_date BETWEEN p_from_date AND p_to_date
      AND (p_account_id IS NULL OR jel.account_id = p_account_id)
    GROUP BY jel.account_id
  ),
  pre_period_movements AS (
    SELECT
      jel.account_id,
      ROUND(SUM(jel.debit_amount - jel.credit_amount)::NUMERIC, 2) AS pre_net
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.company_id = p_company_id
      AND je.status = 'posted'
      AND (je.is_deleted IS NULL OR je.is_deleted = FALSE)
      AND je.deleted_at IS NULL
      AND je.entry_date < p_from_date
      AND (p_account_id IS NULL OR jel.account_id = p_account_id)
    GROUP BY jel.account_id
  )
  SELECT
    coa.id                                                               AS account_id,
    coa.account_code,
    coa.account_name,
    coa.account_type,
    coa.sub_type,
    ROUND((COALESCE(coa.opening_balance, 0) + COALESCE(pp.pre_net, 0))::NUMERIC, 2) AS opening_balance,
    COALESCE(pm.period_debit,  0)                                        AS total_debit,
    COALESCE(pm.period_credit, 0)                                        AS total_credit,
    ROUND((
      COALESCE(coa.opening_balance, 0)
      + COALESCE(pp.pre_net, 0)
      + COALESCE(pm.period_debit,  0)
      - COALESCE(pm.period_credit, 0)
    )::NUMERIC, 2)                                                       AS closing_balance,
    COALESCE(pm.txn_count, 0)                                           AS transaction_count
  FROM public.chart_of_accounts coa
  LEFT JOIN period_movements    pm ON pm.account_id = coa.id
  LEFT JOIN pre_period_movements pp ON pp.account_id = coa.id
  WHERE coa.company_id = p_company_id
    AND coa.is_active = TRUE
    AND (p_account_id IS NULL OR coa.id = p_account_id)
    AND (
      COALESCE(pm.txn_count, 0) > 0
      OR ABS(COALESCE(coa.opening_balance, 0) + COALESCE(pp.pre_net, 0)) >= 0.01
    )
  ORDER BY coa.account_code;
END;
$function$;

-- تُحوَّلُ من sql إلى plpgsql
CREATE OR REPLACE FUNCTION public.get_gl_ar_balance_per_invoice(p_company_id uuid, p_as_of_date date DEFAULT CURRENT_DATE)
 RETURNS TABLE(invoice_id text, customer_id uuid, invoice_number text, invoice_date date, due_date date, ar_debit numeric, ar_credit numeric, outstanding numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY
  WITH ar_accounts AS (
    SELECT id
    FROM chart_of_accounts
    WHERE company_id = p_company_id
      AND is_active  = true
      AND (
        sub_type      = 'accounts_receivable'
        OR account_name ILIKE '%receivable%'
        OR account_name ILIKE '%الذمم المدين%'
      )
  ),
  ar_debits AS (
    SELECT
      je.reference_id::TEXT AS invoice_id,
      SUM(jel.debit_amount) AS amount
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE je.company_id     = p_company_id
      AND je.status         = 'posted'
      AND je.reference_type = 'invoice'
      AND je.entry_date    <= p_as_of_date
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
      AND je.deleted_at IS NULL
      AND jel.account_id IN (SELECT id FROM ar_accounts)
    GROUP BY je.reference_id
  ),
  ar_payment_credits AS (
    SELECT
      je.reference_id::TEXT AS invoice_id,
      SUM(jel.credit_amount) AS amount
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE je.company_id     = p_company_id
      AND je.status         = 'posted'
      AND je.reference_type = 'invoice_payment'
      AND je.entry_date    <= p_as_of_date
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
      AND je.deleted_at IS NULL
      AND jel.account_id IN (SELECT id FROM ar_accounts)
    GROUP BY je.reference_id
  ),
  ar_return_credits AS (
    SELECT
      sr.invoice_id::TEXT AS invoice_id,
      SUM(jel.credit_amount) AS amount
    FROM journal_entries je
    JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
    JOIN sales_returns sr ON je.reference_id = sr.id
    WHERE je.company_id     = p_company_id
      AND je.status         = 'posted'
      AND je.reference_type = 'sales_return'
      AND je.entry_date    <= p_as_of_date
      AND (je.is_deleted IS NULL OR je.is_deleted = false)
      AND je.deleted_at IS NULL
      AND jel.account_id IN (SELECT id FROM ar_accounts)
    GROUP BY sr.invoice_id
  )

  SELECT
    i.id::TEXT                                       AS invoice_id,
    i.customer_id,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    COALESCE(d.amount, 0)                            AS ar_debit,
    COALESCE(pc.amount, 0) + COALESCE(rc.amount, 0) AS ar_credit,
    GREATEST(0,
      COALESCE(d.amount, 0)
      - COALESCE(pc.amount, 0)
      - COALESCE(rc.amount, 0)
    )                                                AS outstanding
  FROM invoices i
  LEFT JOIN ar_debits         d  ON d.invoice_id  = i.id::TEXT
  LEFT JOIN ar_payment_credits pc ON pc.invoice_id = i.id::TEXT
  LEFT JOIN ar_return_credits  rc ON rc.invoice_id = i.id::TEXT
  WHERE i.company_id = p_company_id
    AND i.status NOT IN ('draft', 'cancelled', 'fully_returned')
    AND (i.is_deleted IS NULL OR i.is_deleted = false)
    AND COALESCE(d.amount, 0) > 0
  ORDER BY i.due_date ASC NULLS LAST;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_permission_stats(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_active_sharing INTEGER;
  v_total_transfers INTEGER;
  v_branch_access INTEGER;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT COUNT(*) INTO v_active_sharing FROM permission_sharing
  WHERE company_id = p_company_id AND is_active = TRUE;

  SELECT COUNT(*) INTO v_total_transfers FROM permission_transfers
  WHERE company_id = p_company_id;

  SELECT COUNT(*) INTO v_branch_access FROM user_branch_access
  WHERE company_id = p_company_id AND is_active = TRUE;

  RETURN jsonb_build_object(
    'active_sharing', v_active_sharing,
    'total_transfers', v_total_transfers,
    'branch_access', v_branch_access
  );
END;
$function$;

-- تُحوَّلُ من sql إلى plpgsql
CREATE OR REPLACE FUNCTION public.get_privileged_manager_user_ids(p_company_id uuid)
 RETURNS TABLE(user_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY
  SELECT DISTINCT cm.user_id
  FROM public.company_members cm
  WHERE cm.company_id = p_company_id
    AND lower(trim(cm.role::text)) IN (
      'owner',
      'admin'
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_reconciliation_status(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_result JSONB; v_last_run DATE; v_critical INTEGER; v_warnings INTEGER;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT MAX(run_date) INTO v_last_run FROM daily_reconciliation_log WHERE company_id = p_company_id;
  SELECT COUNT(CASE WHEN severity='critical' AND NOT is_ok THEN 1 END),
         COUNT(CASE WHEN severity='warning' AND NOT is_ok THEN 1 END)
  INTO v_critical, v_warnings
  FROM daily_reconciliation_log WHERE company_id = p_company_id AND run_date = v_last_run;
  SELECT jsonb_build_object('last_run_date',v_last_run,'critical_failures',v_critical,'warning_failures',v_warnings,'is_healthy',v_critical=0,
    'checks', jsonb_agg(jsonb_build_object('check_name',check_name,'is_ok',is_ok,'severity',severity,'gl_value',gl_value,'operational_value',operational_value,'difference',difference,'message',message) ORDER BY severity DESC, is_ok ASC))
  INTO v_result FROM daily_reconciliation_log WHERE company_id = p_company_id AND run_date = v_last_run;
  RETURN COALESCE(v_result, jsonb_build_object('error','No reconciliation data found','last_run_date',NULL));
END; $function$;

CREATE OR REPLACE FUNCTION public.get_retained_earnings_balance(p_company_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_re  DECIMAL := 0;
  v_inc DECIMAL := 0;
  v_exp DECIMAL := 0;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  SELECT COALESCE(SUM(jel.credit_amount) - SUM(jel.debit_amount), 0)
    INTO v_re
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE coa.company_id = p_company_id
      AND coa.account_type = 'equity'
      AND (coa.sub_type = 'retained_earnings' OR coa.account_code = '3200')
      AND je.company_id = p_company_id
      AND COALESCE(je.status, 'posted') NOT IN ('cancelled', 'draft');
  SELECT COALESCE(SUM(jel.credit_amount) - SUM(jel.debit_amount), 0)
    INTO v_inc
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE coa.company_id = p_company_id
      AND coa.account_type IN ('income', 'revenue')
      AND je.company_id = p_company_id
      AND je.status = 'posted';
  SELECT COALESCE(SUM(jel.debit_amount) - SUM(jel.credit_amount), 0)
    INTO v_exp
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    JOIN chart_of_accounts coa ON coa.id = jel.account_id
    WHERE coa.company_id = p_company_id
      AND coa.account_type = 'expense'
      AND je.company_id = p_company_id
      AND je.status = 'posted';
  RETURN v_re + (v_inc - v_exp);
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────
-- ٤ · البرهانُ ثلاثىُّ الاتّجاه
-- ───────────────────────────────────────────────────────────────────────────
DO $proof$
DECLARE
  k_doors text[] := ARRAY[
    'calculate_cogs_total($1)',
    'check_gl_balance_integrity($1, NULL::date, DATE ''2999-12-31'')',
    'erp_company_senior_count($1)',
    'find_company_accounts($1)',
    'get_ar_reconciliation_report($1)',
    'get_audit_trail_report($1, TIMESTAMPTZ ''1900-01-01'', TIMESTAMPTZ ''2999-12-31'')',
    'get_gl_account_summary($1)',
    'get_gl_ar_balance_per_invoice($1, DATE ''2999-12-31'')',
    'get_permission_stats($1)',
    'get_privileged_manager_user_ids($1)',
    'get_reconciliation_status($1)',
    'get_retained_earnings_balance($1)'
  ];
  k_probe constant text := 'SELECT count(*), md5(coalesce(string_agg(t.x::text, ''|'' ORDER BY t.x::text), '''')) FROM (SELECT public.%s AS x) t';
  v_subjects text := current_setting('erb.v40_subjects', true);
  v_own uuid; v_uid uuid; v_foreign uuid;
  v_d text; v_rows int; v_sig text; v_acc text := ''; v_before text; v_passed text := '';
BEGIN
  IF v_subjects IS NULL OR v_subjects = 'none' THEN
    RAISE NOTICE 'v3.75.40: no live subject in this house - the locks are planted and no live proof is claimed.';
    RETURN;
  END IF;

  v_own     := current_setting('erb.v40_own')::uuid;
  v_uid     := current_setting('erb.v40_uid')::uuid;
  v_before  := current_setting('erb.v40_before');
  v_foreign := NULLIF(current_setting('erb.v40_foreign'), '')::uuid;

  -- (ج) طريقُ الخادمِ أوّلاً: لا هُويّةَ مستخدِمٍ، فلا سؤالَ ولا قطع.
  FOREACH v_d IN ARRAY k_doors LOOP
    BEGIN
      EXECUTE format(k_probe, v_d) INTO v_rows, v_sig USING v_own;
    EXCEPTION WHEN query_canceled THEN
      RAISE EXCEPTION 'v3.75.40 (ج): the server path was cut at %', v_d;
    END;
  END LOOP;
  PERFORM public.next_po_number(v_own);
  PERFORM public.assert_company_access_or_bootstrap(v_own);

  -- (أ) صاحبُ الشركةِ نفسُه: لا صفَّ نقص.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

  FOREACH v_d IN ARRAY k_doors LOOP
    EXECUTE format(k_probe, v_d) INTO v_rows, v_sig USING v_own;
    v_acc := v_acc || v_d || '=' || v_rows || '/' || v_sig || ';';
  END LOOP;
  PERFORM public.assert_company_access_or_bootstrap(v_own);
  PERFORM public.next_po_number(v_own);

  IF v_acc IS DISTINCT FROM v_before THEN
    RESET ROLE;
    RAISE EXCEPTION 'v3.75.40 (أ): the owner lost something after the lock. before[%] after[%]', v_before, v_acc;
  END IF;

  -- (ب) الغريبُ يُرفَضُ من كلِّ بابٍ من الأربعةَ عشر.
  IF v_foreign IS NOT NULL THEN
    FOREACH v_d IN ARRAY k_doors LOOP
      BEGIN
        EXECUTE format(k_probe, v_d) INTO v_rows, v_sig USING v_foreign;
        v_passed := v_passed || v_d || ' ';
      EXCEPTION WHEN query_canceled THEN
        NULL;
      END;
    END LOOP;

    BEGIN
      PERFORM public.next_po_number(v_foreign);
      v_passed := v_passed || 'next_po_number ';
    EXCEPTION WHEN query_canceled THEN
      NULL;
    END;

    BEGIN
      PERFORM public.assert_company_access_or_bootstrap(v_foreign);
      v_passed := v_passed || 'assert_company_access_or_bootstrap ';
    EXCEPTION WHEN query_canceled THEN
      NULL;
    END;

    IF v_passed <> '' THEN
      RESET ROLE;
      RAISE EXCEPTION 'v3.75.40 (ب): the stranger still passes into: %', v_passed;
    END IF;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RAISE NOTICE 'v3.75.40 PROOF ok: owner unchanged [%] - stranger refused everywhere - server path open. foreign=%',
               v_acc, coalesce(v_foreign::text, '<none found>');
END
$proof$;

-- ───────────────────────────────────────────────────────────────────────────
-- ٥ · الفحصُ المرجعىّ
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_baseline_v3_75_40_check()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $check$
DECLARE
  k_locked text[] := ARRAY[
    'calculate_cogs_total(uuid,date,date,uuid,uuid,uuid)',
    'check_gl_balance_integrity(uuid,date,date)',
    'erp_company_senior_count(uuid)',
    'find_company_accounts(uuid)',
    'get_ar_reconciliation_report(uuid)',
    'get_audit_trail_report(uuid,timestamp with time zone,timestamp with time zone,text,text)',
    'get_gl_account_summary(uuid,date,date,uuid)',
    'get_gl_ar_balance_per_invoice(uuid,date)',
    'get_permission_stats(uuid)',
    'get_privileged_manager_user_ids(uuid)',
    'get_reconciliation_status(uuid)',
    'get_retained_earnings_balance(uuid)',
    'next_po_number(uuid)',
    'assert_company_access_or_bootstrap(uuid)'
  ];
  v_missing text := ''; v_homes int;
BEGIN
  -- (١) كلُّ بابٍ مقفولٍ لا يزالُ بصلاحيّاتٍ كاملةٍ ولا يزالُ يسألُ البيتَ الواحد
  SELECT string_agg(k, ' ') INTO v_missing
  FROM unnest(k_locked) AS k
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND replace(p.oid::regprocedure::text, 'public.', '') = k
      AND p.prosecdef
      AND p.prosrc ~ '\massert_company_access\M'
  );
  IF v_missing IS NOT NULL AND v_missing <> '' THEN
    RAISE EXCEPTION 'v3.75.40 (1): a door lost its lock or its full rights: %', v_missing;
  END IF;

  -- (٢) ولا بيتَ ثانياً لسؤالِ الانتماء: لا فحصَ يدوىٌّ عادَ إلى الاثنَين
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('next_po_number', 'assert_company_access_or_bootstrap')
      AND p.prosrc ~ '\mget_user_company_ids\M'
  ) THEN
    RAISE EXCEPTION 'v3.75.40 (2): a hand-written membership check was born again.';
  END IF;

  -- (٣) واستثناءُ التأسيسِ المشروعُ باقٍ — فلا يُكسَرُ إنشاءُ شركةٍ جديدة
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'assert_company_access_or_bootstrap'
      AND p.prosrc ~ 'NOT EXISTS \(SELECT 1 FROM company_members WHERE company_id = p_company_id\)'
  ) THEN
    RAISE EXCEPTION 'v3.75.40 (3): the genuine bootstrap exemption is gone - a new company can no longer be born.';
  END IF;

  -- (٤) والبيتُ الواحدُ نفسُه حىٌّ ويرفعُ رمزاً لا يُبتلَع
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'assert_company_access'
      AND p.prosecdef AND p.prosrc ~ '57014'
  ) THEN
    RAISE EXCEPTION 'v3.75.40 (4): the one home is gone or no longer raises an unswallowable code.';
  END IF;

  -- معدودٌ لا مسكوتٌ عنه: كم بيتاً يجيبُ سؤالَ الانتماءِ اليوم؟
  SELECT count(*) INTO v_homes
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND p.proname LIKE 'assert_company_access%';

  RETURN format('v3.75.40 ok - 12 measured doors locked - 2 second homes now delegate to the one home - the genuine bootstrap exemption is intact - %s assert_company_access* function(s) exist.', v_homes);
END
$check$;

REVOKE ALL ON FUNCTION public.assert_baseline_v3_75_40_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_baseline_v3_75_40_check() TO service_role;

SELECT public.assert_baseline_v3_75_38_check();
SELECT public.assert_baseline_v3_75_39_check();
SELECT public.assert_baseline_v3_75_40_check();
